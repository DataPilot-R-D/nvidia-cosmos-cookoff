"""
Cosmos WebRTC Bridge — Isaac Sim → Dashboard WebSocket → Cosmos Reason2-8B

Connects to the Dashboard WebSocket server (Socket.IO), receives camera frames
from Isaac Sim via ros-bridge, and sends them to Cosmos for SCENE/CHANGE analysis.

Usage:
    python3 scripts/cosmos_webrtc_bridge.py --ws-url http://localhost:8081 --interval 2.0

Architecture:
    Isaac Sim → ROS2 → ros-bridge (camera_publisher) → WebSocket Server (Socket.IO)
        → THIS SCRIPT (tap into video_frame events) → Cosmos Reason2-8B API
"""

import asyncio
import base64
import json
import os
import signal
import sys
import time
import argparse
from datetime import datetime
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import socketio
from PIL import Image
from dotenv import load_dotenv

# ===== Constants =====
load_dotenv()

DEFAULT_COSMOS_MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
DEFAULT_COSMOS_URL = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1")


def _normalize_cosmos_url(url: str) -> str:
    """Ensure URL ends with /v1 exactly once."""
    url = url.rstrip("/")
    if url.endswith("/v1"):
        return url
    return f"{url}/v1"
MODEL = DEFAULT_COSMOS_MODEL
SYSTEM_PROMPT = "You are a surveillance camera AI assistant."
SCENE_PROMPT = (
    "Describe what you see in this surveillance camera frame. "
    "Focus on: people, objects, activities, potential security concerns."
)
CHANGE_PROMPT = (
    "Compare these two frames. What changed? "
    "Focus on: people entering/leaving, objects moved, doors opened/closed."
)
FRAME_WIDTH = 640
JPEG_QUALITY = 85
API_TIMEOUT = 30
CHANGE_MODE_EVERY = 3  # every 3rd analysis is CHANGE


# ===== Global State =====
latest_frame: bytes | None = None
previous_frame_b64: str | None = None
frame_count = 0
sequence_counter = 0
running = True
session_start_time: float | None = None

stats = {
    "frames_received": 0,
    "frames_analyzed": 0,
    "api_calls": 0,
    "api_errors": 0,
    "scene_calls": 0,
    "change_calls": 0,
    "total_latency": 0.0,
    "ws_reconnects": 0,
}


# ===== Frame Processing =====
def resize_frame(jpeg_data: bytes) -> str:
    """Resize JPEG frame to 640p width and return base64 string."""
    img = Image.open(BytesIO(jpeg_data))
    w, h = img.size
    if w > FRAME_WIDTH:
        ratio = FRAME_WIDTH / w
        img = img.resize((FRAME_WIDTH, int(h * ratio)), Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ===== API Message Builders =====
def build_scene_message(frame_b64: str) -> list:
    """Build API message for SCENE analysis."""
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"},
        },
        {"type": "text", "text": SCENE_PROMPT},
    ]


def build_change_message(prev_b64: str, curr_b64: str) -> list:
    """Build API message for CHANGE detection."""
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{prev_b64}"},
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{curr_b64}"},
        },
        {"type": "text", "text": CHANGE_PROMPT},
    ]


# ===== Cosmos API =====
def strip_thinking_tags(text: str) -> str:
    """Remove <think>...</think> tags from response text."""
    if "<think>" in text and "</think>" in text:
        parts = text.split("</think>", 1)
        if len(parts) > 1:
            return parts[1].strip()
    return text


async def call_cosmos(
    client: httpx.AsyncClient,
    messages: list,
    max_tokens: int,
    cosmos_url: str,
    api_key: str,
) -> tuple[bool, str]:
    """Call Cosmos API. Returns (success, response_text)."""
    global sequence_counter
    sequence_counter += 1
    stats["api_calls"] += 1

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": messages},
        ],
        "temperature": 0.7,
        "top_p": 0.8,
        "max_tokens": max_tokens,
        "presence_penalty": 1.5,
    }

    start = time.time()
    try:
        resp = await client.post(
            f"{cosmos_url}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=API_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        text = strip_thinking_tags(text)
        latency = time.time() - start
        stats["total_latency"] += latency
        return True, text
    except Exception as e:
        stats["api_errors"] += 1
        return False, str(e)


# ===== Logging =====
class SessionLogger:
    """Handles session logging to disk."""

    def __init__(self, log_dir: str, save_frames: bool):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = Path(log_dir) / ts
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.responses_file = self.session_dir / "responses.jsonl"
        self.save_frames = save_frames
        if save_frames:
            (self.session_dir / "frames").mkdir(exist_ok=True)

    def log_response(self, entry: dict):
        with open(self.responses_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def save_frame(self, frame_b64: str, idx: int):
        if not self.save_frames:
            return
        path = self.session_dir / "frames" / f"frame_{idx:06d}.jpg"
        path.write_bytes(base64.b64decode(frame_b64))

    def write_summary(self, summary: dict):
        path = self.session_dir / "session_summary.json"
        with open(path, "w") as f:
            json.dump(summary, f, indent=2)
        print(f"\n[INFO] Session summary saved to: {path}")


# ===== Main Loop =====
async def analysis_loop(
    cosmos_url: str,
    api_key: str,
    interval: float,
    logger: SessionLogger,
):
    """Main analysis loop — pulls buffered frames and calls Cosmos."""
    global latest_frame, previous_frame_b64, frame_count, running

    async with httpx.AsyncClient() as client:
        print(f"[INFO] Analysis loop started (interval={interval}s)")
        while running:
            await asyncio.sleep(interval)

            frame_data = latest_frame
            if frame_data is None:
                continue

            frame_count += 1
            frame_b64 = resize_frame(frame_data)
            logger.save_frame(frame_b64, frame_count)

            # Determine mode: SCENE 2x, CHANGE 1x
            is_change = (frame_count % CHANGE_MODE_EVERY == 0) and previous_frame_b64 is not None
            if is_change:
                mode = "CHANGE"
                messages = build_change_message(previous_frame_b64, frame_b64)
                max_tokens = 500
                stats["change_calls"] += 1
            else:
                mode = "SCENE"
                messages = build_scene_message(frame_b64)
                max_tokens = 600
                stats["scene_calls"] += 1

            stats["frames_analyzed"] += 1
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"\n[{ts}] #{frame_count} {mode} analysis...", end=" ", flush=True)

            t0 = time.time()
            success, text = await call_cosmos(client, messages, max_tokens, cosmos_url, api_key)
            latency = time.time() - t0

            if success:
                print(f"({latency:.1f}s)")
                print(f"  → {text[:300]}")
                logger.log_response(
                    {
                        "timestamp": datetime.now().isoformat(),
                        "frame": frame_count,
                        "mode": mode,
                        "latency_s": round(latency, 2),
                        "response": text,
                    }
                )
            else:
                print(f"ERROR ({latency:.1f}s): {text[:200]}")

            previous_frame_b64 = frame_b64


def build_summary() -> dict:
    """Build session summary dict."""
    uptime = time.time() - session_start_time if session_start_time else 0
    avg_latency = (
        stats["total_latency"] / stats["api_calls"] if stats["api_calls"] > 0 else 0
    )
    return {
        "session_start": datetime.fromtimestamp(session_start_time).isoformat()
        if session_start_time
        else None,
        "session_end": datetime.now().isoformat(),
        "uptime_seconds": round(uptime, 1),
        "stats": {
            **stats,
            "avg_latency_s": round(avg_latency, 2),
        },
        "total_api_calls": sequence_counter,
    }


async def main():
    global latest_frame, running, session_start_time

    parser = argparse.ArgumentParser(
        description="Cosmos WebRTC Bridge — tap Dashboard WebSocket camera stream"
    )
    parser.add_argument(
        "--ws-url",
        default="http://localhost:8081",
        help="WebSocket server URL (default: http://localhost:8081)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Analysis interval in seconds (default: 2.0, min: 2.0)",
    )
    parser.add_argument(
        "--cosmos-url",
        default=DEFAULT_COSMOS_URL,
        help=f"Cosmos API base URL (default: {DEFAULT_COSMOS_URL})",
    )
    parser.add_argument(
        "--save-frames",
        action="store_true",
        help="Save frames as JPEG to log directory",
    )
    parser.add_argument(
        "--log-dir",
        default="./logs",
        help="Log directory (default: ./logs)",
    )
    args = parser.parse_args()

    # Enforce minimum interval
    interval = max(args.interval, 2.0)
    cosmos_url = _normalize_cosmos_url(args.cosmos_url)
    api_key = os.getenv("COSMOS_API_KEY", "EMPTY")

    logger = SessionLogger(args.log_dir, args.save_frames)
    session_start_time = time.time()

    # Socket.IO client
    sio = socketio.AsyncClient(
        reconnection=True,
        reconnection_attempts=0,  # infinite
        reconnection_delay=1,
        reconnection_delay_max=10,
    )

    @sio.event
    async def connect():
        print(f"[INFO] Connected to WebSocket server: {args.ws_url}")

    @sio.event
    async def disconnect():
        print("[WARN] Disconnected from WebSocket server")

    @sio.event
    async def connect_error(data):
        print(f"[ERROR] Connection error: {data}")

    @sio.on("reconnect")
    async def on_reconnect():
        stats["ws_reconnects"] += 1
        print("[INFO] Reconnected to WebSocket server")

    @sio.on("video_frame")
    async def on_video_frame(data):
        nonlocal latest_frame
        stats["frames_received"] += 1
        # camera_publisher.py sends: {type: "video_frame", data: {frameData: "<base64>", ...}}
        frame_bytes = None
        if isinstance(data, dict):
            inner = data.get("data", data)
            if isinstance(inner, dict):
                b64 = inner.get("frameData") or inner.get("frame") or inner.get("data")
                if isinstance(b64, str):
                    try:
                        frame_bytes = base64.b64decode(b64)
                    except Exception:
                        pass
            elif isinstance(inner, (str, bytes)):
                try:
                    frame_bytes = base64.b64decode(inner) if isinstance(inner, str) else inner
                except Exception:
                    pass
        elif isinstance(data, bytes):
            frame_bytes = data

        if frame_bytes:
            latest_frame = frame_bytes
            if stats["frames_received"] == 1:
                print("[INFO] First frame received — stream active ✓")

    # Graceful shutdown
    shutdown_event = asyncio.Event()

    def signal_handler(sig, frame):
        global running
        running = False
        shutdown_event.set()
        print("\n[INFO] Shutdown signal received, finishing...")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Connect
    print(f"[INFO] Connecting to {args.ws_url}...")
    print(f"[INFO] Cosmos endpoint: {cosmos_url}")
    print(f"[INFO] Analysis interval: {interval}s")
    print(f"[INFO] Logging to: {logger.session_dir}")

    try:
        await sio.connect(args.ws_url, transports=["websocket", "polling"])
    except Exception as e:
        print(f"[FATAL] Cannot connect to WebSocket server: {e}")
        sys.exit(1)

    # Run analysis loop
    analysis_task = asyncio.create_task(
        analysis_loop(cosmos_url, api_key, interval, logger)
    )

    # Wait for shutdown
    await shutdown_event.wait()

    # Cleanup
    analysis_task.cancel()
    try:
        await analysis_task
    except asyncio.CancelledError:
        pass

    await sio.disconnect()

    # Write summary
    summary = build_summary()
    logger.write_summary(summary)

    print("\n" + "=" * 50)
    print("SESSION SUMMARY")
    print("=" * 50)
    print(f"  Uptime:          {summary['uptime_seconds']}s")
    print(f"  Frames received: {stats['frames_received']}")
    print(f"  Frames analyzed: {stats['frames_analyzed']}")
    print(f"  SCENE calls:     {stats['scene_calls']}")
    print(f"  CHANGE calls:    {stats['change_calls']}")
    print(f"  API errors:      {stats['api_errors']}")
    print(f"  Avg latency:     {summary['stats']['avg_latency_s']}s")
    print(f"  WS reconnects:   {stats['ws_reconnects']}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())

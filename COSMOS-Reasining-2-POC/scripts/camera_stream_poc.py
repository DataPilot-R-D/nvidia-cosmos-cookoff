"""Webcam streaming PoC for Cosmos surveillance system."""

import cv2
import base64
import time
import signal
import sys
import argparse
import requests
import tempfile
import os
import json
from datetime import datetime
from io import BytesIO
from pathlib import Path
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

# ===== Configuration =====
COSMOS_API_BASE = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1").rstrip("/")
API_ENDPOINT = f"{COSMOS_API_BASE}/chat/completions"
MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
API_KEY = os.getenv("COSMOS_API_KEY", "EMPTY")

# Timing configuration (will be overridden by --interval flag)
CAPTURE_INTERVAL = 2.0  # seconds between frames (default)
CHANGE_MODE_EVERY = 3   # every 3 frames = every 6 seconds

# Frame settings
FRAME_WIDTH = 640       # target width in pixels
JPEG_QUALITY = 85       # JPEG quality (0-100)

# API timeout
API_TIMEOUT = 30        # seconds

# ===== Global State =====
# Frames mode
frame_buffer = [None, None, None]  # [current, -2s, -4s]
frame_count = 0

# Video mode
video_buffer = [None, None]  # [current_chunk, previous_chunk]
chunk_count = 0

# Common state
total_frames_captured = 0
session_start_time = None
running = True
reasoning_mode = False  # Will be set from CLI flag
input_mode = "frames"  # Will be set from CLI flag (frames|video)
capture_interval = CAPTURE_INTERVAL  # Will be set from CLI flag
chunk_duration = 5.0  # Will be set from CLI flag
fps = 2  # Will be set from CLI flag

stats = {
    "frames_captured": 0,
    "scene_analyses": 0,
    "change_analyses": 0,
    "api_errors": 0,
    "camera_errors": 0,
}

# Logging state
log_dir = None
frames_dir = None
videos_dir = None
responses_file = None
sequence_counter = 0


def signal_handler(sig, frame):
    """Graceful shutdown on Ctrl+C."""
    global running
    running = False
    print("\n[INFO] Shutdown signal received. Cleaning up...")


def setup_logging():
    """
    Create logging directory structure for this session.
    Returns the session log directory path.
    """
    global log_dir, frames_dir, videos_dir, responses_file

    # Create logs/ base directory if it doesn't exist
    base_logs = Path(__file__).parent.parent / "logs"
    base_logs.mkdir(exist_ok=True)

    # Create session-specific directory with timestamp
    session_timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_dir = base_logs / session_timestamp
    log_dir.mkdir(exist_ok=True)

    # Create subdirectories
    frames_dir = log_dir / "frames"
    frames_dir.mkdir(exist_ok=True)

    videos_dir = log_dir / "videos"
    videos_dir.mkdir(exist_ok=True)

    # Create responses.jsonl file
    responses_file = log_dir / "responses.jsonl"
    responses_file.touch()

    return log_dir


def log_api_response(seq, timestamp, mode, prompt_summary, response_text, latency_ms, tokens=None):
    """
    Log API response to responses.jsonl.

    Args:
        seq: Sequence number (1-indexed)
        timestamp: ISO format timestamp string
        mode: "SCENE" or "CHANGE"
        prompt_summary: Brief summary of the prompt
        response_text: Full response from API
        latency_ms: API call latency in milliseconds
        tokens: Optional token count dict
    """
    if responses_file is None:
        return

    log_entry = {
        "seq": seq,
        "timestamp": timestamp,
        "mode": mode,
        "prompt_summary": prompt_summary,
        "response_text": response_text,
        "latency_ms": latency_ms,
    }

    if tokens is not None:
        log_entry["tokens"] = tokens

    with open(responses_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")


def save_frame_to_disk(frame, seq):
    """
    Save frame to disk as JPEG.

    Args:
        frame: OpenCV frame (numpy array)
        seq: Sequence number (1-indexed)
    """
    if frames_dir is None:
        return

    filename = f"frame_{seq:03d}.jpg"
    filepath = frames_dir / filename

    try:
        cv2.imwrite(str(filepath), frame)
    except Exception as e:
        print(f"[ERROR] Failed to save frame {seq}: {e}")


def save_video_to_disk(video_data, seq):
    """
    Save video chunk to disk as MP4.

    Args:
        video_data: base64 encoded video string
        seq: Sequence number (1-indexed)
    """
    if videos_dir is None:
        return

    filename = f"video_{seq:03d}.mp4"
    filepath = videos_dir / filename

    try:
        video_bytes = base64.b64decode(video_data)
        with open(filepath, "wb") as f:
            f.write(video_bytes)
    except Exception as e:
        print(f"[ERROR] Failed to save video {seq}: {e}")


def encode_frame_to_base64(frame):
    """
    Convert OpenCV frame to base64 JPEG string.
    Resizes frame to target width while maintaining aspect ratio.
    """
    try:
        # Resize to target width
        h, w = frame.shape[:2]
        new_width = FRAME_WIDTH
        new_height = int(h * (new_width / w))
        resized = cv2.resize(frame, (new_width, new_height))
        
        # Encode to JPEG
        _, buffer = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        
        # Convert to base64
        b64_str = base64.b64encode(buffer).decode('utf-8')
        return b64_str
    except Exception as e:
        print(f"[ERROR] Frame encoding failed: {e}")
        return None


def initialize_camera(retries=3):
    """Initialize webcam with retry logic."""
    for attempt in range(retries):
        try:
            cap = cv2.VideoCapture(0)
            # Set camera to return frames immediately
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            # Test capture
            ret, _ = cap.read()
            if ret:
                print("[INFO] Camera initialized successfully")
                return cap
            else:
                cap.release()
                if attempt < retries - 1:
                    print(f"[WARNING] Camera test failed, retrying ({attempt + 1}/{retries})...")
                    time.sleep(1)
        except Exception as e:
            print(f"[ERROR] Camera initialization failed: {e}")
            if attempt < retries - 1:
                time.sleep(1)
    
    print("[FATAL] Failed to initialize camera after retries")
    return None


def capture_frame(cap):
    """Capture a single frame from camera."""
    try:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Failed to capture frame")
            stats["camera_errors"] += 1
            return None
        stats["frames_captured"] += 1
        return frame
    except Exception as e:
        print(f"[ERROR] Frame capture exception: {e}")
        stats["camera_errors"] += 1
        return None


def build_scene_message(frame_b64):
    """Build API message for SCENE analysis mode."""
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}
        },
        {
            "type": "text",
            "text": "Describe what you see in this frame. Focus on: people, objects, activity, anything unusual."
        }
    ]


def build_change_message(prev_b64, curr_b64):
    """Build API message for CHANGE detection mode (frames mode)."""
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{prev_b64}"}
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{curr_b64}"}
        },
        {
            "type": "text",
            "text": "Compare these two frames. What changed? Focus on: people entering/leaving, objects moved, doors opened/closed."
        }
    ]


def record_video_chunk(cap, duration_sec, fps_rate):
    """
    Record a video chunk from webcam.
    
    Args:
        cap: OpenCV VideoCapture object
        duration_sec: Duration of chunk in seconds
        fps_rate: Frames per second to record
    
    Returns:
        base64 encoded mp4 string or None if failed
    """
    try:
        # Get frame properties
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Create temp file for video
        temp_fd, temp_path = tempfile.mkstemp(suffix='.mp4')
        os.close(temp_fd)
        
        # Set up video writer with mp4v codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_path, fourcc, fps_rate, (frame_width, frame_height))
        
        if not out.isOpened():
            print("[ERROR] Failed to open VideoWriter")
            os.unlink(temp_path)
            stats["camera_errors"] += 1
            return None
        
        # Record frames
        frame_interval = 1.0 / fps_rate
        frames_to_capture = int(duration_sec * fps_rate)
        last_frame_time = time.time()
        frames_written = 0
        
        for _ in range(frames_to_capture):
            if not running:
                break
            
            # Wait for next frame time
            while time.time() - last_frame_time < frame_interval:
                time.sleep(0.001)
            
            ret, frame = cap.read()
            if ret:
                out.write(frame)
                stats["frames_captured"] += 1
                frames_written += 1
                last_frame_time = time.time()
            else:
                print("[ERROR] Failed to read frame during video recording")
                stats["camera_errors"] += 1
                break
        
        out.release()
        
        if frames_written < frames_to_capture * 0.8:
            print(f"[WARNING] Video chunk incomplete: {frames_written}/{frames_to_capture} frames")
        
        # Convert mp4v → H.264 (vLLM rejects mp4v codec)
        h264_path = temp_path.replace('.mp4', '_h264.mp4')
        try:
            import subprocess
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', temp_path, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-an', h264_path],
                capture_output=True, timeout=15
            )
            if result.returncode == 0 and os.path.exists(h264_path) and os.path.getsize(h264_path) > 0:
                video_path = h264_path
            else:
                print(f"[WARNING] H.264 conversion failed, using mp4v (may cause API errors)")
                video_path = temp_path
        except Exception as e:
            print(f"[WARNING] ffmpeg not available ({e}), using mp4v")
            video_path = temp_path
        
        # Encode to base64
        try:
            with open(video_path, 'rb') as f:
                b64_video = base64.b64encode(f.read()).decode('utf-8')
            return b64_video
        except Exception as e:
            print(f"[ERROR] Failed to encode video: {e}")
            return None
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            if os.path.exists(h264_path):
                os.unlink(h264_path)
    
    except Exception as e:
        print(f"[ERROR] Video recording failed: {e}")
        stats["camera_errors"] += 1
        return None


def build_video_scene_message(video_b64):
    """Build API message for SCENE analysis mode (video mode)."""
    return [
        {
            "type": "video_url",
            "video_url": {"url": f"data:video/mp4;base64,{video_b64}"}
        },
        {
            "type": "text",
            "text": "Describe what you see in this video. Focus on: people, objects, activity, anything unusual."
        }
    ]


def build_video_change_message(prev_b64, curr_b64):
    """Build API message for CHANGE detection mode (video mode)."""
    return [
        {
            "type": "video_url",
            "video_url": {"url": f"data:video/mp4;base64,{prev_b64}"}
        },
        {
            "type": "video_url",
            "video_url": {"url": f"data:video/mp4;base64,{curr_b64}"}
        },
        {
            "type": "text",
            "text": "Compare these two video chunks. What changed? Focus on: people entering/leaving, objects moved, doors opened/closed."
        }
    ]


def get_system_prompt():
    """Get system prompt based on reasoning mode."""
    base_prompt = "You are a surveillance camera AI assistant."
    if reasoning_mode:
        return base_prompt + " Think step by step. Show your reasoning in <think>...</think> tags before your answer."
    return base_prompt


def strip_thinking_tags(text):
    """Remove <think>...</think> tags from response text."""
    if "<think>" in text and "</think>" in text:
        parts = text.split("</think>", 1)
        if len(parts) > 1:
            return parts[1].strip()
    return text


def call_api(messages, max_tokens, mode, prompt_summary):
    """
    Call Cosmos API with given messages.
    Returns: (success: bool, response_text: str)
    """
    global sequence_counter

    start_time = time.time()

    try:
        # Select parameters based on reasoning mode
        if reasoning_mode:
            params = {
                "temperature": 0.6,
                "top_p": 0.95,
                "max_tokens": max_tokens
            }
        else:
            params = {
                "temperature": 0.7,
                "top_p": 0.8,
                "presence_penalty": 1.5,
                "max_tokens": max_tokens
            }

        response = requests.post(
            API_ENDPOINT,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": get_system_prompt()},
                    {"role": "user", "content": messages}
                ],
                **params
            },
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=API_TIMEOUT
        )

        latency_ms = int((time.time() - start_time) * 1000)

        if response.status_code != 200:
            print(f"[ERROR] API returned status {response.status_code}")
            stats["api_errors"] += 1

            # Log error
            sequence_counter += 1
            log_api_response(
                seq=sequence_counter,
                timestamp=datetime.now().isoformat(),
                mode=mode,
                prompt_summary=prompt_summary,
                response_text=f"[ERROR: HTTP {response.status_code}]",
                latency_ms=latency_ms
            )

            return False, ""

        data = response.json()
        if "choices" not in data or len(data["choices"]) == 0:
            print(f"[ERROR] Invalid API response: {data}")
            stats["api_errors"] += 1

            # Log error
            sequence_counter += 1
            log_api_response(
                seq=sequence_counter,
                timestamp=datetime.now().isoformat(),
                mode=mode,
                prompt_summary=prompt_summary,
                response_text="[ERROR: Invalid response]",
                latency_ms=latency_ms
            )

            return False, ""

        text = data["choices"][0]["message"]["content"]

        # Extract token usage if available
        tokens = None
        if "usage" in data:
            tokens = {
                "prompt_tokens": data["usage"].get("prompt_tokens", 0),
                "completion_tokens": data["usage"].get("completion_tokens", 0),
                "total_tokens": data["usage"].get("total_tokens", 0)
            }

        # Strip thinking tags if in reasoning mode
        if reasoning_mode:
            text = strip_thinking_tags(text)

        # Log successful response
        sequence_counter += 1
        log_api_response(
            seq=sequence_counter,
            timestamp=datetime.now().isoformat(),
            mode=mode,
            prompt_summary=prompt_summary,
            response_text=text,
            latency_ms=latency_ms,
            tokens=tokens
        )

        return True, text

    except requests.exceptions.Timeout:
        latency_ms = int((time.time() - start_time) * 1000)
        print("[ERROR] API request timed out")
        stats["api_errors"] += 1

        # Log timeout
        sequence_counter += 1
        log_api_response(
            seq=sequence_counter,
            timestamp=datetime.now().isoformat(),
            mode=mode,
            prompt_summary=prompt_summary,
            response_text="[ERROR: Timeout]",
            latency_ms=latency_ms
        )

        return False, ""
    except requests.exceptions.RequestException as e:
        latency_ms = int((time.time() - start_time) * 1000)
        print(f"[ERROR] API request failed: {e}")
        stats["api_errors"] += 1

        # Log error
        sequence_counter += 1
        log_api_response(
            seq=sequence_counter,
            timestamp=datetime.now().isoformat(),
            mode=mode,
            prompt_summary=prompt_summary,
            response_text=f"[ERROR: {str(e)}]",
            latency_ms=latency_ms
        )

        return False, ""
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        print(f"[ERROR] Unexpected error during API call: {e}")
        stats["api_errors"] += 1

        # Log error
        sequence_counter += 1
        log_api_response(
            seq=sequence_counter,
            timestamp=datetime.now().isoformat(),
            mode=mode,
            prompt_summary=prompt_summary,
            response_text=f"[ERROR: {str(e)}]",
            latency_ms=latency_ms
        )

        return False, ""


def format_timestamp():
    """Format current time as [HH:MM:SS]."""
    return datetime.now().strftime("[%H:%M:%S]")


def format_response(mode, text, max_length=150):
    """Format API response for terminal output, truncate if needed."""
    if len(text) > max_length:
        return text[:max_length] + "..."
    return text


def print_session_summary():
    """Print final statistics and save to JSON."""
    if session_start_time is None:
        return

    uptime = time.time() - session_start_time
    minutes = int(uptime // 60)
    seconds = int(uptime % 60)

    # Print to terminal
    print("\n" + "=" * 70)
    print("SESSION SUMMARY")
    print("=" * 70)
    print(f"Uptime: {minutes}m {seconds}s")
    print(f"Frames Captured: {stats['frames_captured']}")
    print(f"SCENE Analyses: {stats['scene_analyses']}")
    print(f"CHANGE Analyses: {stats['change_analyses']}")
    print(f"API Errors: {stats['api_errors']}")
    print(f"Camera Errors: {stats['camera_errors']}")
    print("=" * 70)

    # Save to JSON
    if log_dir is not None:
        summary_file = log_dir / "session_summary.json"
        summary_data = {
            "session_start": datetime.fromtimestamp(session_start_time).isoformat(),
            "session_end": datetime.now().isoformat(),
            "uptime_seconds": uptime,
            "mode": input_mode,
            "reasoning_mode": reasoning_mode,
            "capture_interval": capture_interval if input_mode == "frames" else None,
            "chunk_duration": chunk_duration if input_mode == "video" else None,
            "fps": fps if input_mode == "video" else None,
            "stats": stats,
            "total_api_calls": sequence_counter
        }

        try:
            with open(summary_file, "w") as f:
                json.dump(summary_data, f, indent=2)
            print(f"\n[INFO] Session summary saved to: {summary_file}")
        except Exception as e:
            print(f"[ERROR] Failed to save session summary: {e}")


def run_frames_mode(cap):
    """Run surveillance in frames mode (individual JPEG frames)."""
    global frame_buffer, frame_count, running

    last_capture_time = time.time()

    try:
        while running:
            current_time = time.time()

            # Capture frame at specified interval
            if current_time - last_capture_time >= capture_interval:
                frame = capture_frame(cap)
                if frame is None:
                    last_capture_time = current_time
                    continue

                # Save frame to disk
                save_frame_to_disk(frame, frame_count + 1)

                # Encode frame
                b64_frame = encode_frame_to_base64(frame)
                if b64_frame is None:
                    last_capture_time = current_time
                    continue

                # Rotate buffer: [new] + [old0, old1]
                frame_buffer = [b64_frame] + frame_buffer[:2]
                frame_count += 1
                last_capture_time = current_time

                # Determine mode and send to API
                is_change_frame = (frame_count % CHANGE_MODE_EVERY == 0)

                # CHANGE mode: need previous frame (requires frame_count >= 3)
                if is_change_frame and frame_buffer[2] is not None:
                    mode = "CHANGE"
                    messages = build_change_message(frame_buffer[2], frame_buffer[0])
                    max_tokens = 1000 if reasoning_mode else 600
                    prompt_summary = "Compare two frames for changes"
                    stats["change_analyses"] += 1
                else:
                    mode = "SCENE"
                    messages = build_scene_message(frame_buffer[0])
                    max_tokens = 800 if reasoning_mode else 500
                    prompt_summary = "Describe scene in frame"
                    stats["scene_analyses"] += 1

                # Call API
                success, response_text = call_api(messages, max_tokens, mode, prompt_summary)

                if success:
                    formatted = format_response(mode, response_text)
                    print(f"{format_timestamp()} [{mode:6s}] {formatted}")
                else:
                    print(f"{format_timestamp()} [{mode:6s}] [API ERROR - skipped]")

            # Small sleep to prevent busy waiting
            time.sleep(0.01)

    except Exception as e:
        print(f"\n[ERROR] Frames mode error: {e}")


def run_video_mode(cap):
    """Run surveillance in video mode (mp4 video chunks)."""
    global video_buffer, chunk_count, running

    try:
        while running:
            # Record a video chunk
            b64_video = record_video_chunk(cap, chunk_duration, fps)
            if b64_video is None:
                continue

            # Save video to disk
            save_video_to_disk(b64_video, chunk_count + 1)

            # Rotate buffer: [new] + [old]
            video_buffer = [b64_video] + video_buffer[:1]
            chunk_count += 1

            # Determine mode and send to API
            is_change_chunk = (chunk_count % 2 == 0)  # Every 2 chunks = change mode

            # CHANGE mode: need previous chunk (requires chunk_count >= 2)
            if is_change_chunk and video_buffer[1] is not None:
                mode = "CHANGE"
                messages = build_video_change_message(video_buffer[1], video_buffer[0])
                max_tokens = 1000 if reasoning_mode else 600
                prompt_summary = "Compare two video chunks for changes"
                stats["change_analyses"] += 1
            else:
                mode = "SCENE"
                messages = build_video_scene_message(video_buffer[0])
                max_tokens = 800 if reasoning_mode else 500
                prompt_summary = "Describe scene in video"
                stats["scene_analyses"] += 1

            # Call API
            success, response_text = call_api(messages, max_tokens, mode, prompt_summary)

            if success:
                formatted = format_response(mode, response_text)
                print(f"{format_timestamp()} [{mode:6s}] {formatted}")
            else:
                print(f"{format_timestamp()} [{mode:6s}] [API ERROR - skipped]")

    except Exception as e:
        print(f"\n[ERROR] Video mode error: {e}")


def main():
    """Main surveillance loop."""
    global frame_buffer, frame_count, video_buffer, chunk_count, session_start_time, running
    global reasoning_mode, capture_interval, input_mode, chunk_duration, fps
    
    # Parse CLI arguments
    parser = argparse.ArgumentParser(description="Webcam streaming PoC for Cosmos surveillance")
    parser.add_argument("--mode", choices=["frames", "video"], default="frames",
                        help="Input mode: frames (individual JPEGs) or video (mp4 chunks)")
    parser.add_argument("--reasoning", action="store_true", help="Enable reasoning mode with extended token limits")
    parser.add_argument("--interval", type=float, default=2.0,
                        help="Capture interval in seconds for frames mode (default: 2.0)")
    parser.add_argument("--chunk-duration", type=float, default=5.0,
                        help="Duration of each video chunk in seconds for video mode (default: 5.0)")
    parser.add_argument("--fps", type=int, default=2,
                        help="Frames per second to record for video mode (default: 2)")
    args = parser.parse_args()
    
    input_mode = args.mode
    reasoning_mode = args.reasoning
    capture_interval = args.interval
    chunk_duration = args.chunk_duration
    fps = args.fps
    
    # Register signal handler
    signal.signal(signal.SIGINT, signal_handler)

    # Setup logging
    session_log_dir = setup_logging()
    print(f"[INFO] Logging to: {session_log_dir}")

    # Initialize camera
    cap = initialize_camera(retries=3)
    if cap is None:
        sys.exit(1)

    session_start_time = time.time()
    reasoning_info = "reasoning mode" if reasoning_mode else "standard mode"

    # Print mode info
    if input_mode == "frames":
        mode_display = f"Mode: frames (interval={capture_interval}s)"
    else:
        mode_display = f"Mode: video (chunk={chunk_duration}s, fps={fps})"

    print(f"[INFO] Starting surveillance stream ({reasoning_info})...")
    print(f"[INFO] {mode_display}")
    print("[INFO] Press Ctrl+C to stop.\n")
    
    try:
        if input_mode == "frames":
            run_frames_mode(cap)
        else:
            run_video_mode(cap)
    
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"\n[FATAL] Unexpected error: {e}")
    finally:
        cap.release()
        print_session_summary()


if __name__ == "__main__":
    main()

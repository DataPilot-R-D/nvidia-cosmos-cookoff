#!/usr/bin/env python3
"""
Offline benchmark: test existing frames/videos against Cosmos API in 4 modes.
No camera needed — uses pre-captured data from logs/.

Usage:
    python3 scripts/run_offline_benchmark.py
"""

import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

# === Config ===
COSMOS_API_BASE = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1").rstrip("/")
API_ENDPOINT = f"{COSMOS_API_BASE}/chat/completions"
MODELS_ENDPOINT = f"{COSMOS_API_BASE}/models"
MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
API_KEY = os.getenv("COSMOS_API_KEY", "EMPTY")
API_TIMEOUT = 30

FRAMES_DIR = "logs/2026-02-16_20-47-56/frames"
VIDEOS_DIR = "logs/2026-02-16_20-49-09/videos/split"
OUTPUT_DIR = "logs/offline_benchmark"

COMBOS = [
    {
        "name": "frames_no_reasoning",
        "media": "frames",
        "reasoning": False,
        "params": {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5},
        "max_tokens_scene": 600,
        "max_tokens_change": 500,
    },
    {
        "name": "frames_reasoning",
        "media": "frames",
        "reasoning": True,
        "params": {"temperature": 0.6, "top_p": 0.95},
        "max_tokens_scene": 1000,
        "max_tokens_change": 800,
    },
    {
        "name": "video_no_reasoning",
        "media": "video",
        "reasoning": False,
        "params": {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5},
        "max_tokens_scene": 600,
        "max_tokens_change": 500,
    },
    {
        "name": "video_reasoning",
        "media": "video",
        "reasoning": True,
        "params": {"temperature": 0.6, "top_p": 0.95},
        "max_tokens_scene": 1000,
        "max_tokens_change": 800,
    },
]

SCENE_PROMPT = "Describe this surveillance camera view. List: 1) People (count, appearance, actions) 2) Key objects 3) Any security concerns."
CHANGE_PROMPT = "Compare these two surveillance frames. What changed? Focus on: 1) People movement 2) Object changes 3) Any security-relevant differences."


def strip_think_tags(text):
    if not text:
        return text or ""
    if "<think>" in text and "</think>" in text:
        parts = text.split("</think>", 1)
        if len(parts) > 1:
            return parts[1].strip()
    return text


def load_frames(directory):
    frames = []
    for f in sorted(Path(directory).glob("*.jpg")):
        with open(f, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        frames.append({"path": str(f), "b64": b64, "type": "image_url"})
    return frames


def load_videos(directory):
    videos = []
    for f in sorted(Path(directory).glob("*.mp4")):
        with open(f, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        videos.append({"path": str(f), "b64": b64, "type": "video_url"})
    return videos


def get_system_prompt(reasoning):
    base = "You are a surveillance camera AI assistant."
    if reasoning:
        return base + " Think step by step. Show your reasoning in <think>...</think> tags before your answer."
    return base


def call_api(messages, params, max_tokens, system_prompt):
    start = time.time()
    try:
        resp = requests.post(
            API_ENDPOINT,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": messages},
                ],
                **params,
                "max_tokens": max_tokens,
            },
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=API_TIMEOUT,
        )
        latency_ms = (time.time() - start) * 1000

        if resp.status_code != 200:
            return False, f"[ERROR: HTTP {resp.status_code}] {resp.text[:200]}", latency_ms, 0

        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        tokens = data.get("usage", {}).get("completion_tokens", 0)
        return True, text, latency_ms, tokens

    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        return False, f"[ERROR: {e}]", latency_ms, 0


def build_scene_message(item):
    """Single item SCENE analysis. Media before text."""
    if item["type"] == "image_url":
        media = {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{item['b64']}"}}
    else:
        media = {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{item['b64']}"}}
    return [media, {"type": "text", "text": SCENE_PROMPT}]


def build_change_message(item1, item2):
    """Two items CHANGE analysis. Media before text."""
    items = []
    for item in [item1, item2]:
        if item["type"] == "image_url":
            items.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{item['b64']}"}})
        else:
            items.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{item['b64']}"}})
    items.append({"type": "text", "text": CHANGE_PROMPT})
    return items


def run_combo(combo, media_items):
    name = combo["name"]
    combo_dir = Path(OUTPUT_DIR) / name
    combo_dir.mkdir(parents=True, exist_ok=True)

    jsonl_path = combo_dir / "responses.jsonl"
    system_prompt = get_system_prompt(combo["reasoning"])
    results = []
    seq = 0

    print(f"\n{'='*60}")
    print(f"  {name} ({len(media_items)} items)")
    print(f"{'='*60}")

    # SCENE: first 3 items
    scene_items = media_items[:3]
    for item in scene_items:
        seq += 1
        msg = build_scene_message(item)
        ok, text, lat, tokens = call_api(msg, combo["params"], combo["max_tokens_scene"], system_prompt)
        text = text or ""
        display = strip_think_tags(text) if ok else text
        has_think = "<think>" in text if ok else False

        record = {
            "seq": seq,
            "timestamp": datetime.now().isoformat(),
            "mode": "SCENE",
            "source": os.path.basename(item["path"]),
            "response_text": text,
            "display_text": display,
            "latency_ms": round(lat, 1),
            "tokens_used": tokens,
            "has_reasoning": has_think,
            "success": ok,
        }
        results.append(record)

        status = "✓" if ok else "✗"
        think_tag = " 🧠" if has_think else ""
        print(f"  [{seq}] SCENE {status}{think_tag} {lat:.0f}ms | {display[:80]}...")

    # CHANGE: consecutive pairs
    for i in range(len(media_items) - 1):
        seq += 1
        msg = build_change_message(media_items[i], media_items[i + 1])
        ok, text, lat, tokens = call_api(msg, combo["params"], combo["max_tokens_change"], system_prompt)
        text = text or ""
        display = strip_think_tags(text) if ok else text
        has_think = "<think>" in text if ok else False

        record = {
            "seq": seq,
            "timestamp": datetime.now().isoformat(),
            "mode": "CHANGE",
            "source": f"{os.path.basename(media_items[i]['path'])} vs {os.path.basename(media_items[i+1]['path'])}",
            "response_text": text,
            "display_text": display,
            "latency_ms": round(lat, 1),
            "tokens_used": tokens,
            "has_reasoning": has_think,
            "success": ok,
        }
        results.append(record)

        status = "✓" if ok else "✗"
        think_tag = " 🧠" if has_think else ""
        print(f"  [{seq}] CHANGE {status}{think_tag} {lat:.0f}ms | {display[:80]}...")

    # Write JSONL
    with open(jsonl_path, "w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")

    return results


def print_summary(all_results):
    print(f"\n{'='*80}")
    print(f"  OFFLINE BENCHMARK SUMMARY")
    print(f"{'='*80}")
    print(f"{'Combo':<25} {'Scenes':>7} {'Changes':>8} {'Errors':>7} {'AvgLat':>8} {'AvgLen':>7} {'Think%':>7}")
    print("-" * 80)

    for name, results in all_results.items():
        scenes = [r for r in results if r["mode"] == "SCENE" and r["success"]]
        changes = [r for r in results if r["mode"] == "CHANGE" and r["success"]]
        errors = [r for r in results if not r["success"]]
        lats = [r["latency_ms"] for r in results]
        lengths = [len(r["display_text"]) for r in results if r["success"]]
        thinks = [r for r in results if r.get("has_reasoning")]

        avg_lat = sum(lats) / len(lats) if lats else 0
        avg_len = sum(lengths) / len(lengths) if lengths else 0
        think_pct = len(thinks) / len(results) * 100 if results else 0

        print(f"{name:<25} {len(scenes):>7} {len(changes):>8} {len(errors):>7} {avg_lat:>7.0f}ms {avg_len:>6.0f}c {think_pct:>6.0f}%")

    print("=" * 80)

    # Save summary JSON
    summary_path = Path(OUTPUT_DIR) / "benchmark_summary.json"
    summary = {}
    for name, results in all_results.items():
        scenes = [r for r in results if r["mode"] == "SCENE" and r["success"]]
        changes = [r for r in results if r["mode"] == "CHANGE" and r["success"]]
        errors = [r for r in results if not r["success"]]
        lats = [r["latency_ms"] for r in results]
        lengths = [len(r["display_text"]) for r in results if r["success"]]
        thinks = [r for r in results if r.get("has_reasoning")]

        summary[name] = {
            "total": len(results),
            "scenes": len(scenes),
            "changes": len(changes),
            "errors": len(errors),
            "avg_latency_ms": round(sum(lats) / len(lats), 1) if lats else 0,
            "avg_response_length": round(sum(lengths) / len(lengths)) if lengths else 0,
            "reasoning_trigger_pct": round(len(thinks) / len(results) * 100, 1) if results else 0,
        }

    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSummary saved to: {summary_path}")


def main():
    print("=" * 60)
    print("  COSMOS OFFLINE BENCHMARK")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Load media
    frames = load_frames(FRAMES_DIR)
    videos = load_videos(VIDEOS_DIR)
    print(f"\nLoaded: {len(frames)} frames, {len(videos)} video chunks")

    # Verify API
    try:
        r = requests.get(MODELS_ENDPOINT, timeout=5)
        print(f"API: ✓ ({r.json()['data'][0]['id']})")
    except Exception as e:
        print(f"API: ✗ ({e})")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_results = {}
    for combo in COMBOS:
        media = frames if combo["media"] == "frames" else videos
        if not media:
            print(f"\n⚠️  Skipping {combo['name']}: no {combo['media']} available")
            continue
        results = run_combo(combo, media)
        all_results[combo["name"]] = results

    print_summary(all_results)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Benchmark V4 — Cosmos Reason2-8B long-context retest with reasoning/video."""

import requests
import base64
import time
import json
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

COSMOS_API_BASE = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1").rstrip("/")
BASE = f"{COSMOS_API_BASE}/chat/completions"
MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
API_KEY = os.getenv("COSMOS_API_KEY", "EMPTY")
IMG_DIR = Path(__file__).parent.parent / "tests" / "inputs" / "images"
VID_DIR = Path(__file__).parent.parent / "tests" / "inputs" / "videos"

# Max tokens for benchmark responses.
# Derived from context window minus a reserve for the heaviest input
# (10s 1080p video ~6000 + system prompt + think instruction ≈ 8192).
# Override with COSMOS_BENCHMARK_MAX_TOKENS to set explicitly.
_MAX_MODEL_LEN = int(os.getenv("COSMOS_MAX_MODEL_LEN", "32768"))
_INPUT_RESERVE = 8192
BENCHMARK_MAX_TOKENS = int(os.getenv("COSMOS_BENCHMARK_MAX_TOKENS", str(_MAX_MODEL_LEN - _INPUT_RESERVE)))
# JSON structured output cap — model can't self-close long JSON (known quirk).
BENCHMARK_JSON_MAX_TOKENS = int(os.getenv("COSMOS_BENCHMARK_JSON_MAX_TOKENS", "500"))
# Per-request timeout for benchmark calls.
BENCHMARK_TIMEOUT_SECONDS = int(os.getenv("COSMOS_BENCHMARK_TIMEOUT_SECONDS", "180"))
BENCHMARK_MODE = os.getenv("COSMOS_BENCHMARK_MODE", "all").strip().lower()
REASONING_MODE = os.getenv("COSMOS_BENCHMARK_REASONING_MODE", "default").strip().lower()
RUN_LABEL = os.getenv("COSMOS_BENCHMARK_RUN_LABEL", "v4")

if BENCHMARK_MODE not in {"all", "frames", "videos"}:
    raise SystemExit("COSMOS_BENCHMARK_MODE must be one of: all, frames, videos")
if REASONING_MODE not in {"default", "on", "off"}:
    raise SystemExit("COSMOS_BENCHMARK_REASONING_MODE must be one of: default, on, off")

THINK_INSTRUCTION = "\nAnswer the question using the following format:\n<think>\nYour reasoning.\n</think>\nWrite your final answer immediately after the </think> tag."

SYSTEM = "You are a helpful assistant."

def b64img(name):
    with open(IMG_DIR / name, "rb") as f:
        return base64.b64encode(f.read()).decode()

def b64vid(name):
    with open(VID_DIR / name, "rb") as f:
        return base64.b64encode(f.read()).decode()

def img_content(name):
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64img(name)}"}}

def vid_content(name):
    return {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64vid(name)}"}}

def txt(text):
    return {"type": "text", "text": text}


def _infer_modality(content_items):
    has_image = any(item.get("type") == "image_url" for item in content_items)
    has_video = any(item.get("type") == "video_url" for item in content_items)
    if has_video and not has_image:
        return "videos"
    if has_image and not has_video:
        return "frames"
    if has_image and has_video:
        return "mixed"
    return "text"


def _skip_result(reason):
    return {
        "latency": None,
        "text": "",
        "reasoning": "",
        "answer": "",
        "prompt_tokens": None,
        "completion_tokens": None,
        "think_closed": False,
        "finish_reason": "skipped_modality",
        "skipped": True,
        "skip_reason": reason,
    }

def run(content_items, prompt, max_tokens=BENCHMARK_MAX_TOKENS, reasoning=True):
    modality = _infer_modality(content_items)
    if BENCHMARK_MODE == "frames" and modality in {"videos", "mixed"}:
        return _skip_result("video input disabled by COSMOS_BENCHMARK_MODE=frames")
    if BENCHMARK_MODE == "videos" and modality not in {"videos", "mixed"}:
        return _skip_result("frame/text input disabled by COSMOS_BENCHMARK_MODE=videos")

    if REASONING_MODE == "on":
        reasoning = True
    elif REASONING_MODE == "off":
        reasoning = False

    user_content = list(content_items)
    if reasoning:
        user_content.append(txt(prompt + THINK_INSTRUCTION))
        params = {"temperature": 0.6, "top_p": 0.95, "max_tokens": max_tokens}
    else:
        user_content.append(txt(prompt))
        params = {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5, "max_tokens": max_tokens}

    start = time.time()
    try:
        resp = requests.post(
            BASE,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                **params,
            },
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=BENCHMARK_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        latency = time.time() - start
        return {
            "error": f"request_error: {exc}",
            "latency": round(latency, 2),
            "text": "",
            "reasoning": "",
            "answer": "",
            "prompt_tokens": None,
            "completion_tokens": None,
            "think_closed": False,
            "finish_reason": "request_error",
        }

    latency = time.time() - start
    try:
        data = resp.json()
    except ValueError:
        return {
            "error": f"non_json_response: status={resp.status_code}",
            "latency": round(latency, 2),
            "text": "",
            "reasoning": "",
            "answer": (resp.text or "")[:500],
            "prompt_tokens": None,
            "completion_tokens": None,
            "think_closed": False,
            "finish_reason": "invalid_response",
        }

    if resp.status_code >= 400:
        return {
            "error": f"http_{resp.status_code}",
            "latency": round(latency, 2),
            "text": "",
            "reasoning": "",
            "answer": str(data)[:500],
            "prompt_tokens": None,
            "completion_tokens": None,
            "think_closed": False,
            "finish_reason": "http_error",
        }

    if "choices" not in data:
        return {
            "error": str(data),
            "latency": round(latency, 2),
            "text": "",
            "reasoning": "",
            "answer": "",
            "prompt_tokens": None,
            "completion_tokens": None,
            "think_closed": False,
            "finish_reason": "invalid_response",
        }
    choice = data["choices"][0]
    text_out = choice["message"]["content"]
    usage = data.get("usage", {})
    
    # Check reasoning_content field (set by --reasoning-parser qwen3)
    reasoning_content = choice["message"].get("reasoning_content") or ""
    has_reasoning = bool(reasoning_content)
    
    # Fallback: check for <think> in content itself
    if not has_reasoning and "</think>" in text_out:
        has_reasoning = True
        parts = text_out.split("</think>", 1)
        reasoning_content = parts[0].replace("<think>", "").strip()
        text_out = parts[1].strip()
    
    return {
        "latency": round(latency, 2),
        "text": text_out,
        "reasoning": reasoning_content[:500] if reasoning_content else "",
        "answer": text_out[:500],
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "think_closed": has_reasoning,
        "finish_reason": choice.get("finish_reason"),
    }

def run_streaming_ttft(content_items, prompt):
    modality = _infer_modality(content_items)
    if BENCHMARK_MODE == "frames" and modality in {"videos", "mixed"}:
        return {
            "error": "skipped_modality: video input disabled by COSMOS_BENCHMARK_MODE=frames",
            "ttft": None,
            "total": None,
            "text": "",
            "think_closed": False,
            "finish_reason": "skipped_modality",
            "skipped": True,
        }
    if BENCHMARK_MODE == "videos" and modality not in {"videos", "mixed"}:
        return {
            "error": "skipped_modality: frame/text input disabled by COSMOS_BENCHMARK_MODE=videos",
            "ttft": None,
            "total": None,
            "text": "",
            "think_closed": False,
            "finish_reason": "skipped_modality",
            "skipped": True,
        }

    user_content = list(content_items)
    streaming_reasoning = REASONING_MODE != "off"
    if streaming_reasoning:
        user_content.append(txt(prompt + THINK_INSTRUCTION))
        params = {"temperature": 0.6, "top_p": 0.95}
    else:
        user_content.append(txt(prompt))
        params = {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5}

    start = time.time()
    try:
        resp = requests.post(
            BASE,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                **params,
                "max_tokens": BENCHMARK_MAX_TOKENS,
                "stream": True,
            },
            timeout=BENCHMARK_TIMEOUT_SECONDS,
            stream=True,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        total = time.time() - start
        return {
            "error": f"request_error: {exc}",
            "ttft": None,
            "total": round(total, 2),
            "text": "",
            "think_closed": False,
        }
    ttft = None
    chunks = []
    for line in resp.iter_lines():
        if line:
            line = line.decode()
            if line.startswith("data: ") and line != "data: [DONE]":
                if ttft is None:
                    ttft = time.time() - start
                try:
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {}).get("content", "")
                    if delta:
                        chunks.append(delta)
                except:
                    pass
    total = time.time() - start
    full_text = "".join(chunks)
    return {
        "ttft": round(ttft, 3) if ttft else None,
        "total": round(total, 2),
        "text": full_text[:300],
        "think_closed": "</think>" in full_text or len(full_text) > 200,  # streaming doesn't split reasoning
    }

results = {}
DEFAULT_OUT_PATH = Path(__file__).parent.parent / "tests" / "results" / "benchmark_v4_raw.json"
final_out_env = os.getenv("COSMOS_BENCHMARK_OUT_PATH")
FINAL_OUT_PATH = Path(final_out_env) if final_out_env else DEFAULT_OUT_PATH
if not FINAL_OUT_PATH.is_absolute():
    FINAL_OUT_PATH = (Path(__file__).parent.parent / FINAL_OUT_PATH).resolve()

partial_out_env = os.getenv("COSMOS_BENCHMARK_PARTIAL_OUT_PATH")
if partial_out_env:
    PARTIAL_OUT_PATH = Path(partial_out_env)
    if not PARTIAL_OUT_PATH.is_absolute():
        PARTIAL_OUT_PATH = (Path(__file__).parent.parent / PARTIAL_OUT_PATH).resolve()
else:
    PARTIAL_OUT_PATH = FINAL_OUT_PATH.with_name(FINAL_OUT_PATH.stem + ".partial.json")

FINAL_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)


def _write_partial() -> None:
    with open(PARTIAL_OUT_PATH, "w") as f:
        json.dump(results, f, indent=2, default=str)


def log(test_id, desc, result):
    results[test_id] = {"desc": desc, **result}
    _write_partial()
    if result.get("finish_reason") == "skipped_modality":
        think = "-"
    else:
        think = "✅" if result.get("think_closed") else "❌"
    answer = result.get("answer", result.get("text", ""))[:100]
    lat = result.get("latency")
    if lat is None:
        lat = result.get("total")
    if isinstance(lat, (int, float)):
        lat_display = f"{lat:>6.2f}s"
    else:
        lat_display = "     ?s"
    ptok = result.get("prompt_tokens", "?")
    ctok = result.get("completion_tokens", "?")
    fr = result.get("finish_reason", "?")
    print(f"{test_id:10s} | {desc[:40]:40s} | {lat_display} | {ptok}/{ctok} | think:{think} | {fr} | {answer}")
    sys.stdout.flush()

print("=" * 140)
print(
    "COSMOS REASON2-8B BENCHMARK V4 — "
    f"label={RUN_LABEL}, ctx={_MAX_MODEL_LEN}, max_tokens={BENCHMARK_MAX_TOKENS}, "
    f"json_cap={BENCHMARK_JSON_MAX_TOKENS}, mode={BENCHMARK_MODE}, reasoning_mode={REASONING_MODE}"
)
print("=" * 140)

# B1: Latency
print("\n--- B1: Latency ---")
for i in range(3):
    r = run([img_content("cosmos_f2.jpg")], "Describe this room in detail.")
    log(f"B1.1_{i+1}", f"Single frame + reasoning run {i+1}", r)

r = run([img_content("cosmos_f0.jpg"), img_content("cosmos_f2.jpg"), img_content("cosmos_f4.jpg")],
        "Describe what you see across these three frames of the same room.")
log("B1.3", "3 frames room scan", r)

r = run([vid_content("roller_clip.mp4")], "Describe the motion in this video.")
log("B1.4", "Video roller clip", r)

# B2: Object Detection
print("\n--- B2: Object Detection ---")
r = run([img_content("cosmos_f2.jpg")], "List all objects visible in this room. Be thorough.")
log("B2.1", "Object inventory", r)

r = run([img_content("mug_after.jpg")], "How many balloons are in this image? List each by color.")
log("B2.2", "Count balloons", r)

r = run([img_content("cosmos_f2.jpg")], "How many chairs or seating surfaces are in this image?")
log("B2.3", "Count chairs/seating", r)

r = run([img_content("cosmos_f2.jpg")], "How many distinct items are on the coffee table? List each one.")
log("B2.4", "Count table items", r)

r = run([img_content("cosmos_f2.jpg")], "Where exactly is the laptop in this image? Describe its position precisely.")
log("B2.5", "Laptop location", r)

r = run([img_content("window_f6.jpg")], "Is the terrace/balcony door open or closed? Describe its exact state.")
log("B2.6", "Door state", r)

# B3: Change Detection
print("\n--- B3: Change Detection ---")
r = run([img_content("mug_before.jpg"), img_content("mug_after.jpg")], "What changed between these two images?")
log("B3.1", "Mug general", r)

r = run([img_content("mug_before.jpg"), img_content("mug_after.jpg")], "Was anything added to or removed from the table between these images?")
log("B3.2", "Mug targeted", r)

r = run([img_content("roses_before.jpg"), img_content("roses_after.jpg")], "What changed between these two images?")
log("B3.3", "Roses general", r)

r = run([img_content("roses_before.jpg"), img_content("roses_after.jpg")], "Was the bouquet of flowers moved, removed, or left in place?")
log("B3.4", "Roses targeted", r)

r = run([img_content("b3_before.jpg"), img_content("b3_after.jpg")], "What changed between these two images?")
log("B3.5", "Roller general", r)

r = run([img_content("b3_before.jpg"), img_content("b3_after.jpg")], "Was the foam roller added, removed, or left in place between these images?")
log("B3.6", "Roller targeted", r)

r = run([img_content("light_1.jpg"), img_content("light_2.jpg"), img_content("light_3.jpg")],
        "Describe how the lighting changes across these 3 images of the same bathroom.")
log("B3.7", "Lighting sequence", r)

# B4: Motion & Person
print("\n--- B4: Motion & Person ---")
r = run([img_content("roller_f0.jpg"), img_content("roller_f1.jpg"), img_content("roller_f2.jpg")],
        "Which direction is the blue foam roller moving, and at what speed?")
log("B4.1", "Roller motion frames", r)

r = run([vid_content("roller_clip.mp4")], "Describe the motion of the foam roller in this video. Direction, speed, trajectory.")
log("B4.2", "Roller motion video", r)

for i in range(5):
    r = run([img_content(f"person_f{i}.jpg")], "Is there a person in this image? If yes, describe their appearance and position.")
    log(f"B4.3_{i}", f"Person detection f{i}", r)

r = run([img_content("person_f1.jpg"), img_content("person_f3.jpg"), img_content("person_f4.jpg")],
        "Track the person's position across these 3 frames. Where are they in each?")
log("B4.4", "Person tracking 3-frame", r)

r = run([img_content("person_f3.jpg")], "What is this person doing? Describe their posture, activity, and body language.")
log("B4.5", "Activity recognition", r)

r = run([vid_content("person_clip.mp4")], "Describe any person movement in this video. Direction, speed, actions.")
log("B4.6", "Person motion video", r)

# B5: Security
print("\n--- B5: Security ---")
r = run([img_content("window_f6.jpg")], "Evaluate the security status of this room. Is the door/window secure? Rate the risk.")
log("B5.1", "Security door assessment", r)

r = run([img_content("person_f3.jpg")], "A person was detected in this room. Is this likely a resident or an intruder? Assess the threat level.")
log("B5.2", "Person threat assessment", r)

r = run([img_content("window_f0.jpg"), img_content("window_f3.jpg"), img_content("window_f6.jpg")],
        "Compare these 3 frames chronologically. Did the door/window state change? Is there a security concern?")
log("B5.3", "Door sequence security", r)

# B6: Spatial & Physics
print("\n--- B6: Spatial & Physics ---")
r = run([img_content("cosmos_f2.jpg")],
        "The sofa is approximately 2.5 meters long. Using this as reference, estimate the room dimensions (length and width) in meters.")
log("B6.1", "Room dimensions", r)

r = run([img_content("cosmos_f4.jpg")], "What items in this room could fall or become unstable? Assess hazards.")
log("B6.2", "Stability assessment", r)

r = run([img_content("cosmos_f2.jpg")],
        "If the terrace door were opened during a snowstorm, what would happen to the room temperature? Explain the physics.")
log("B6.3", "Cause-effect reasoning", r)

r = run([img_content("cosmos_f2.jpg")],
        "Estimate these distances in meters: camera to sofa, camera to coffee table, camera to the far wall.")
log("B6.4", "Distance estimation", r)

# B7: Output Format
print("\n--- B7: Output Format ---")
r = run([img_content("cosmos_f2.jpg")],
        'Output a JSON object with keys: room_type, dimensions_estimate {length_m, width_m}, objects [{name, position, size}], hazards [], security_status',
        max_tokens=BENCHMARK_JSON_MAX_TOKENS, reasoning=False)  # JSON without reasoning; capped — model can't self-close long JSON
log("B7.1", "JSON output (no reasoning)", r)

r = run([img_content("cosmos_f2.jpg")],
        "Count every distinct object in this room. List each one with a number, then give the total count at the end.")
log("B7.2", "Counting with list", r)

# B8-B11: Supplementary
print("\n--- B8-B11: Supplementary ---")
r = run([img_content("cosmos_f2.jpg")], "How many cushions or pillows are on the sofa? Count carefully.")
log("B8.1", "Cushion counting", r)

r = run([img_content("person_f3.jpg")], "Estimate the distance from the camera to the person in meters.")
log("B9.1", "Distance to person", r)

r = run([img_content("cosmos_f2.jpg")], "Is the coffee table to the LEFT or RIGHT of the sofa from the camera's perspective?")
log("B10.1", "Table L/R of sofa", r)

r = run([img_content("cosmos_f2.jpg")], "Is the window/terrace door BEHIND or IN FRONT of the sofa from the camera's perspective?")
log("B10.2", "Window behind/front sofa", r)

r = run([img_content("cosmos_f2.jpg")], "Estimate this room's length and width in meters. Use the sofa (~2.5m) as reference.")
log("B11.1", "Room dimensions v2", r)

# B12: Streaming TTFT
print("\n--- B12: Streaming TTFT ---")
r = run_streaming_ttft([img_content("cosmos_f2.jpg")], "Describe this room.")
log("B12.1", "TTFT single frame", r)

r = run_streaming_ttft([img_content("cosmos_f0.jpg"), img_content("cosmos_f2.jpg"), img_content("cosmos_f4.jpg")],
                       "Describe these frames.")
log("B12.2", "TTFT 3 frames", r)

r = run_streaming_ttft([vid_content("roller_clip.mp4")], "Describe the motion.")
log("B12.3", "TTFT video", r)

# Summary
print("\n" + "=" * 140)
print(f"TOTAL TESTS: {len(results)}")
think_count = sum(1 for r in results.values() if r.get("think_closed"))
print(f"REASONING TRIGGERED: {think_count}/{len(results)}")
stopped = sum(1 for r in results.values() if r.get("finish_reason") == "stop")
length_cut = sum(1 for r in results.values() if r.get("finish_reason") == "length")
print(f"FINISH: stop={stopped}, length={length_cut}")
print("=" * 140)

out_path = FINAL_OUT_PATH
with open(out_path, "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nRaw results saved to {out_path}")

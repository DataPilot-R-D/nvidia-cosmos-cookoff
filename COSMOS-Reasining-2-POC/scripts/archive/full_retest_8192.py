#!/usr/bin/env python3
"""Full benchmark retest — all tests at 8192 context WITH reasoning mode."""

import requests
import base64
import time
import json
import sys
from pathlib import Path

BASE = "http://63.182.177.92:8899/v1/chat/completions"
MODEL = "nvidia/Cosmos-Reason2-2B"
IMG_DIR = Path(__file__).parent.parent / "tests" / "inputs" / "images"
VID_DIR = Path(__file__).parent.parent / "tests" / "inputs" / "videos"

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

def run(content_items, prompt, max_tokens=1000, reasoning=True):
    """Run a single test. Media items first, then prompt with <think> suffix."""
    user_content = list(content_items)
    if reasoning:
        user_content.append(txt(prompt + "\n<think>\n"))
        params = {"temperature": 0.6, "top_p": 0.95, "max_tokens": max_tokens}
    else:
        user_content.append(txt(prompt))
        params = {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5, "max_tokens": max_tokens}

    start = time.time()
    resp = requests.post(BASE, json={
        "model": MODEL,
        "messages": [
            {"role": "system", "content": [txt("You are a helpful assistant.")]},
            {"role": "user", "content": user_content}
        ],
        **params
    }, timeout=120)
    latency = time.time() - start

    data = resp.json()
    if "choices" not in data:
        return {"error": str(data), "latency": round(latency, 2)}

    choice = data["choices"][0]
    text_out = choice["message"]["content"]
    usage = data.get("usage", {})

    return {
        "latency": round(latency, 2),
        "text": text_out,
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "think_closed": "</think>" in text_out,
        "finish_reason": choice.get("finish_reason"),
    }

def run_streaming_ttft(content_items, prompt):
    """Run streaming test, measure TTFT."""
    user_content = list(content_items)
    user_content.append(txt(prompt + "\n<think>\n"))

    start = time.time()
    resp = requests.post(BASE, json={
        "model": MODEL,
        "messages": [
            {"role": "system", "content": [txt("You are a helpful assistant.")]},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.6, "top_p": 0.95, "max_tokens": 500,
        "stream": True
    }, timeout=120, stream=True)

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
        "text": full_text[:200],
        "think_closed": "</think>" in full_text,
    }


results = {}

def log(test_id, desc, result):
    results[test_id] = {"desc": desc, **result}
    think = "✅" if result.get("think_closed") else "❌"
    text_preview = result.get("text", "")
    # Extract answer after </think> if present
    if "</think>" in text_preview:
        answer = text_preview.split("</think>")[-1].strip()[:120]
    else:
        answer = text_preview[:120]
    lat = result.get("latency") or result.get("total", "?")
    ptok = result.get("prompt_tokens", "?")
    ctok = result.get("completion_tokens", "?")
    fr = result.get("finish_reason", "?")
    print(f"{test_id} | {desc[:40]:40s} | {lat:>6}s | {ptok}/{ctok} | think:{think} | {fr} | {answer}")
    sys.stdout.flush()

print("=" * 140)
print("COSMOS REASON2-2B FULL RETEST — 8192 CONTEXT + REASONING MODE")
print("=" * 140)

# B1: Latency
print("\n--- B1: Latency ---")
for i in range(3):
    r = run([img_content("cosmos_f2.jpg")], "Describe this room in detail.", max_tokens=300)
    log(f"B1.1_{i+1}", f"Single frame run {i+1}", r)

for i in range(3):
    r = run([img_content("cosmos_f2.jpg")], "Provide a detailed analysis of everything visible in this room.", max_tokens=600)
    log(f"B1.2_{i+1}", f"Single frame detailed run {i+1}", r)

r = run([img_content("cosmos_f0.jpg"), img_content("cosmos_f2.jpg"), img_content("cosmos_f4.jpg")],
        "Describe what you see across these three frames of the same room.")
log("B1.3", "3 frames room scan", r)

r = run([vid_content("roller_clip.mp4")], "Describe the motion in this video.")
log("B1.4", "Video roller clip", r)

# B2: Object Detection
print("\n--- B2: Object Detection ---")
r = run([img_content("cosmos_f2.jpg")], "List all objects visible in this room. Be thorough.", max_tokens=800)
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
        max_tokens=2000)
log("B7.1", "JSON output", r)

r = run([img_content("cosmos_f2.jpg")],
        "Count every distinct object in this room. List each one with a number, then give the total count at the end.", max_tokens=1500)
log("B7.2", "Counting with list", r)

# B8-B11: Supplementary (previously looping)
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

# Save raw results
print("\n" + "=" * 140)
print(f"TOTAL TESTS: {len(results)}")
think_count = sum(1 for r in results.values() if r.get("think_closed"))
print(f"REASONING TRIGGERED: {think_count}/{len(results)}")
print("=" * 140)

out_path = Path(__file__).parent.parent / "tests" / "benchmark_v2_raw.json"
with open(out_path, "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nRaw results saved to {out_path}")

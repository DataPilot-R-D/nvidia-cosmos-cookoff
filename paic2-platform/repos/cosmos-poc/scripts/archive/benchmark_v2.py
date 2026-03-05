#!/usr/bin/env python3
"""Cosmos Reason2-2B Comprehensive Benchmarks V2 — Correct NVIDIA Prompting"""

import base64, json, time, sys, os
import requests

API_URL = "http://63.182.177.92:8899/v1/chat/completions"
MODEL = "nvidia/Cosmos-Reason2-2B"
SYSTEM_MSG = {"role": "system", "content": [{"type": "text", "text": "You are a helpful assistant."}]}

REASONING_SUFFIX = "\n\nAnswer the question using the following format:\n\n<think>\nYour reasoning.\n</think>\n\nWrite your final answer immediately after the </think> tag."

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def encode_video(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def make_image_content(path):
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encode_image(path)}"}}

def make_video_content(path):
    return {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{encode_video(path)}"}}

def call_api(content_items, max_tokens=800, reasoning=False, temperature=None, top_p=None, presence_penalty=None):
    """content_items: list of dicts for user content array (media + text already ordered)"""
    if temperature is None:
        temperature = 0.6 if reasoning else 0.7
    if top_p is None:
        top_p = 0.95 if reasoning else 0.8
    if presence_penalty is None:
        presence_penalty = 0.0 if reasoning else 1.5
    
    payload = {
        "model": MODEL,
        "messages": [SYSTEM_MSG, {"role": "user", "content": content_items}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "presence_penalty": presence_penalty,
    }
    
    t0 = time.time()
    resp = requests.post(API_URL, json=payload, headers={"Authorization": "Bearer EMPTY"}, timeout=120)
    elapsed = time.time() - t0
    
    data = resp.json()
    if "error" in data:
        return {"error": data["error"], "latency": elapsed}
    
    choice = data["choices"][0]
    usage = data.get("usage", {})
    return {
        "text": choice["message"]["content"],
        "latency": elapsed,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "throughput": usage.get("completion_tokens", 0) / elapsed if elapsed > 0 else 0,
    }

def query_images(images, prompt, reasoning=False, max_tokens=800):
    """images: list of paths, prompt: text string"""
    content = [make_image_content(p) for p in images]
    text = prompt + (REASONING_SUFFIX if reasoning else "")
    content.append({"type": "text", "text": text})
    return call_api(content, max_tokens=max_tokens, reasoning=reasoning)

def query_video(video_path, prompt, reasoning=False, max_tokens=800):
    content = [make_video_content(video_path)]
    text = prompt + (REASONING_SUFFIX if reasoning else "")
    content.append({"type": "text", "text": text})
    return call_api(content, max_tokens=max_tokens, reasoning=reasoning)

results = {}

def log(section, name, result):
    key = f"{section}/{name}"
    results[key] = result
    text = result.get("text", result.get("error", "???"))
    trunc = text[:200] + "..." if len(text) > 200 else text
    print(f"[{key}] {result.get('latency',0):.2f}s | {result.get('prompt_tokens',0)}p/{result.get('completion_tokens',0)}c | {trunc}")
    sys.stdout.flush()

# ============================================================
# B1: LATENCY
# ============================================================
print("\n=== B1: LATENCY ===")

# Single frame, no reasoning (3 runs)
for i in range(3):
    r = query_images(["/tmp/cosmos_f2.jpg"], "Describe this room briefly.", reasoning=False, max_tokens=300)
    log("B1", f"single_no_reason_run{i+1}", r)

# Single frame, with reasoning (3 runs)
for i in range(3):
    r = query_images(["/tmp/cosmos_f2.jpg"], "Describe this room briefly.", reasoning=True, max_tokens=500)
    log("B1", f"single_reason_run{i+1}", r)

# 3-frame latency
r = query_images(["/tmp/cosmos_f0.jpg", "/tmp/cosmos_f2.jpg", "/tmp/cosmos_f4.jpg"],
                 "These are 3 frames from a room scan. Describe what you see.", reasoning=False, max_tokens=400)
log("B1", "3frame_no_reason", r)

r = query_images(["/tmp/cosmos_f0.jpg", "/tmp/cosmos_f2.jpg", "/tmp/cosmos_f4.jpg"],
                 "These are 3 frames from a room scan. Describe what you see.", reasoning=True, max_tokens=600)
log("B1", "3frame_reason", r)

# Video clip latency
r = query_video("/tmp/roller_clip.mp4", "Describe the motion in this video clip.", reasoning=False, max_tokens=400)
log("B1", "video_no_reason", r)

r = query_video("/tmp/roller_clip.mp4", "Describe the motion in this video clip.", reasoning=True, max_tokens=600)
log("B1", "video_reason", r)

# ============================================================
# B2: OBJECT DETECTION
# ============================================================
print("\n=== B2: OBJECT DETECTION ===")

r = query_images(["/tmp/cosmos_f2.jpg"],
    "List every visible object in this room. Be exhaustive. For each object, note its position, approximate size, color/material.",
    reasoning=True, max_tokens=1200)
log("B2", "inventory", r)

# Counting
r = query_images(["/tmp/mug_after.jpg"],
    "Count the number of balloons visible in this image. State the exact count.",
    reasoning=True, max_tokens=400)
log("B2", "count_balloons", r)

r = query_images(["/tmp/cosmos_f2.jpg"],
    "Count the number of chairs or seating positions visible. State the exact count.",
    reasoning=True, max_tokens=400)
log("B2", "count_chairs", r)

r = query_images(["/tmp/cosmos_f2.jpg"],
    "Count the number of distinct items on the table. List each one.",
    reasoning=True, max_tokens=500)
log("B2", "count_table_items", r)

# Small objects
r = query_images(["/tmp/cosmos_f2.jpg"],
    "Are there any pens, markers, or writing instruments visible? Describe their location.",
    reasoning=True, max_tokens=400)
log("B2", "small_pens", r)

r = query_images(["/tmp/cosmos_f2.jpg"],
    "Is there a laptop visible? Where exactly is it located?",
    reasoning=False, max_tokens=300)
log("B2", "laptop_location", r)

# State detection
r = query_images(["/tmp/window_f6.jpg"],
    "Is the terrace/glass door open, closed, or partially open? Describe its state precisely.",
    reasoning=True, max_tokens=400)
log("B2", "door_state", r)

# ============================================================
# B3: CHANGE DETECTION
# ============================================================
print("\n=== B3: CHANGE DETECTION ===")

# Mug added
r = query_images(["/tmp/mug_before.jpg", "/tmp/mug_after.jpg"],
    "Compare these two images. What changed between the first and second image?",
    reasoning=True, max_tokens=600)
log("B3", "mug_general", r)

r = query_images(["/tmp/mug_before.jpg", "/tmp/mug_after.jpg"],
    "Has a mug or cup been added or removed between these two images? Describe specifically.",
    reasoning=True, max_tokens=400)
log("B3", "mug_targeted", r)

# Roses moved
r = query_images(["/tmp/roses_before.jpg", "/tmp/roses_after.jpg"],
    "Compare these two images. What changed between the first and second image?",
    reasoning=True, max_tokens=600)
log("B3", "roses_general", r)

r = query_images(["/tmp/roses_before.jpg", "/tmp/roses_after.jpg"],
    "Has the bouquet of flowers/roses been moved? If so, in which direction?",
    reasoning=True, max_tokens=400)
log("B3", "roses_targeted", r)

# Roller removed
r = query_images(["/tmp/b3_before.jpg", "/tmp/b3_after.jpg"],
    "Compare these two images. What changed between the first and second image?",
    reasoning=True, max_tokens=600)
log("B3", "roller_general", r)

r = query_images(["/tmp/b3_before.jpg", "/tmp/b3_after.jpg"],
    "Has the foam roller been added or removed? Describe the change.",
    reasoning=True, max_tokens=400)
log("B3", "roller_targeted", r)

# Lighting changes
r = query_images(["/tmp/light_1.jpg", "/tmp/light_2.jpg"],
    "Compare these two images. What changed with the lighting?",
    reasoning=True, max_tokens=400)
log("B3", "light_1v2", r)

r = query_images(["/tmp/light_2.jpg", "/tmp/light_3.jpg"],
    "Compare these two images. What changed with the lighting?",
    reasoning=True, max_tokens=400)
log("B3", "light_2v3", r)

r = query_images(["/tmp/light_1.jpg", "/tmp/light_2.jpg", "/tmp/light_3.jpg"],
    "These 3 images show progressive lighting changes in a bathroom. Describe each change step by step.",
    reasoning=True, max_tokens=600)
log("B3", "light_sequence", r)

# ============================================================
# B4: MOTION & PERSON
# ============================================================
print("\n=== B4: MOTION & PERSON ===")

# Roller motion from frames
r = query_images(["/tmp/roller_f0.jpg", "/tmp/roller_f1.jpg", "/tmp/roller_f2.jpg"],
    "These 3 frames show an object in motion. Describe what object is moving, its direction, and estimated speed.",
    reasoning=True, max_tokens=500)
log("B4", "roller_frames", r)

# Roller motion from video
r = query_video("/tmp/roller_clip.mp4",
    "Describe the object motion in this video. What is moving, in which direction, and how fast?",
    reasoning=True, max_tokens=500)
log("B4", "roller_video", r)

# Person detection per frame
for i in range(5):
    r = query_images([f"/tmp/person_f{i}.jpg"],
        "Is there a person visible in this image? If yes, describe their position, pose, and what they are doing.",
        reasoning=False, max_tokens=300)
    log("B4", f"person_detect_f{i}", r)

# Person tracking
r = query_images(["/tmp/person_f0.jpg", "/tmp/person_f2.jpg", "/tmp/person_f4.jpg"],
    "These 3 frames show the same scene at different times. Track any person's movement across frames. Describe their position in each frame and direction of movement.",
    reasoning=True, max_tokens=600)
log("B4", "person_tracking", r)

# Activity recognition
r = query_images(["/tmp/person_f3.jpg"],
    "What activity is the person in this image performing? Describe their posture and likely intent.",
    reasoning=True, max_tokens=400)
log("B4", "activity_recognition", r)

# ============================================================
# B5: SECURITY
# ============================================================
print("\n=== B5: SECURITY ===")

r = query_images(["/tmp/window_f6.jpg"],
    "You are a home security system. Analyze this image for security concerns. Is any door or window open? Rate the security risk.",
    reasoning=True, max_tokens=500)
log("B5", "open_door", r)

r = query_images(["/tmp/person_f3.jpg"],
    "You are a home security system. A person has been detected. Describe the person, their location, posture, and whether they appear to be an intruder or resident.",
    reasoning=True, max_tokens=500)
log("B5", "person_alert", r)

r = query_images(["/tmp/window_f0.jpg", "/tmp/window_f3.jpg", "/tmp/window_f6.jpg"],
    "You are a home security system analyzing 3 sequential frames. Detect any changes in door/window state. Is there a security concern?",
    reasoning=True, max_tokens=600)
log("B5", "door_sequence", r)

# ============================================================
# B6: SPATIAL & PHYSICS
# ============================================================
print("\n=== B6: SPATIAL & PHYSICS ===")

r = query_images(["/tmp/cosmos_f2.jpg"],
    "Estimate the room dimensions (length x width in meters). Use the sofa as reference — it is approximately 2.5 meters long. Show your reasoning.",
    reasoning=True, max_tokens=600)
log("B6", "room_dimensions", r)

r = query_images(["/tmp/cosmos_f4.jpg"],
    "Assess the stability of objects in this room. Are any items at risk of falling? Could a child or pet knock something over?",
    reasoning=True, max_tokens=500)
log("B6", "stability", r)

r = query_images(["/tmp/cosmos_f2.jpg"],
    "If someone opened the glass door in this room, what would happen to the room temperature? The scene outside shows snow. Reason through the cause and effect.",
    reasoning=True, max_tokens=500)
log("B6", "cause_effect", r)

# ============================================================
# B7: OUTPUT FORMAT
# ============================================================
print("\n=== B7: OUTPUT FORMAT ===")

r = query_images(["/tmp/cosmos_f2.jpg"],
    'Analyze this room and return a JSON object with this schema: {"room_type": string, "dimensions_estimate": {"length_m": number, "width_m": number}, "objects": [{"name": string, "position": string, "size": string}], "hazards": [string], "security_status": string}. Return ONLY valid JSON, no other text.',
    reasoning=False, max_tokens=800)
log("B7", "json_output", r)

r = query_images(["/tmp/cosmos_f2.jpg"],
    "Count every distinct object visible in this room. List each one with a number.",
    reasoning=True, max_tokens=800)
log("B7", "count_with_reasoning", r)

# ============================================================
# SAVE RESULTS
# ============================================================
output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "benchmark_v2_raw.json")
with open(output_path, "w") as f:
    json.dump(results, f, indent=2, default=str)

print(f"\n✅ All benchmarks complete. Raw results saved to {output_path}")
print(f"Total tests: {len(results)}")

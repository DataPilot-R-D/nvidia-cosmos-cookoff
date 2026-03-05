#!/usr/bin/env python3
"""B13: 2D Grounding benchmarks — bounding box detection."""

import requests
import base64
import time
import json
import sys
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

COSMOS_API_BASE = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1").rstrip("/")
BASE = f"{COSMOS_API_BASE}/chat/completions"
MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
API_KEY = os.getenv("COSMOS_API_KEY", "EMPTY")
IMG_DIR = Path(__file__).parent.parent / "tests" / "inputs" / "images"

# Max tokens — derived from context window minus input reserve.
_MAX_MODEL_LEN = int(os.getenv("COSMOS_MAX_MODEL_LEN", "32768"))
_INPUT_RESERVE = 8192
BENCHMARK_MAX_TOKENS = int(os.getenv("COSMOS_BENCHMARK_MAX_TOKENS", str(_MAX_MODEL_LEN - _INPUT_RESERVE)))
BENCHMARK_JSON_MAX_TOKENS = int(os.getenv("COSMOS_BENCHMARK_JSON_MAX_TOKENS", "500"))

THINK = '\nAnswer the question using the following format:\n<think>\nYour reasoning.\n</think>\nWrite your final answer immediately after the </think> tag.'

def b64img(name):
    with open(IMG_DIR / name, "rb") as f:
        return base64.b64encode(f.read()).decode()

def img_content(name):
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64img(name)}"}}

def txt(text):
    return {"type": "text", "text": text}

def run(content_items, prompt, max_tokens=BENCHMARK_MAX_TOKENS, reasoning=True):
    user_content = list(content_items)
    if reasoning:
        user_content.append(txt(prompt + THINK))
        params = {"temperature": 0.6, "top_p": 0.95, "max_tokens": max_tokens}
    else:
        user_content.append(txt(prompt))
        params = {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5, "max_tokens": max_tokens}

    start = time.time()
    resp = requests.post(BASE, json={
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": user_content}
        ],
        **params
    }, headers={"Authorization": f"Bearer {API_KEY}"}, timeout=120)
    latency = time.time() - start
    data = resp.json()
    if "choices" not in data:
        return {"error": str(data), "latency": round(latency, 2)}
    choice = data["choices"][0]
    content = choice["message"]["content"]
    reasoning_content = choice["message"].get("reasoning_content") or ""
    usage = data.get("usage", {})
    
    # Try to parse JSON from content
    json_valid = False
    parsed_objects = []
    try:
        # Strip markdown code fences
        clean = content.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()
        parsed = json.loads(clean)
        json_valid = True
        if isinstance(parsed, list):
            parsed_objects = parsed
        elif isinstance(parsed, dict) and "objects" in parsed:
            parsed_objects = parsed["objects"]
        else:
            parsed_objects = [parsed]
    except:
        pass
    
    has_boxes = any(
        "box_2d" in obj or "bbox_2d" in obj 
        for obj in parsed_objects if isinstance(obj, dict)
    )
    
    return {
        "latency": round(latency, 2),
        "content": content[:1000],
        "reasoning": reasoning_content[:500] if reasoning_content else "",
        "has_reasoning": bool(reasoning_content),
        "json_valid": json_valid,
        "has_boxes": has_boxes,
        "num_objects": len(parsed_objects),
        "objects": parsed_objects[:20],
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "finish_reason": choice.get("finish_reason"),
    }

results = {}

def log(test_id, desc, result):
    results[test_id] = {"desc": desc, **result}
    think = "✅" if result.get("has_reasoning") else "❌"
    jv = "✅" if result.get("json_valid") else "❌"
    bbox = "✅" if result.get("has_boxes") else "❌"
    nobj = result.get("num_objects", 0)
    lat = result.get("latency", "?")
    fr = result.get("finish_reason", "?")
    print(f"{test_id:10s} | {desc[:45]:45s} | {lat:>6}s | think:{think} json:{jv} bbox:{bbox} objs:{nobj:2d} | {fr}")
    sys.stdout.flush()

print("=" * 120)
print(f"B13: 2D GROUNDING BENCHMARKS — ctx={_MAX_MODEL_LEN}, max_tokens={BENCHMARK_MAX_TOKENS}, json_cap={BENCHMARK_JSON_MAX_TOKENS}")
print("=" * 120)

# B13.1: Multi-object grounding (room)
r = run([img_content("cosmos_f2.jpg")],
    'Locate the bounding boxes of all major objects in this room. Return as JSON array: [{"name": "...", "box_2d": [y1, x1, y2, x2]}]')
log("B13.1", "Multi-object grounding (room)", r)

# B13.2: Person grounding
r = run([img_content("person_f3.jpg")],
    'Locate the bounding box of every person in this image. Return JSON: [{"name": "person", "box_2d": [y1, x1, y2, x2], "description": "..."}]')
log("B13.2", "Person grounding", r)

# B13.3: Person grounding (no person)
r = run([img_content("person_f0.jpg")],
    'Locate the bounding box of every person in this image. If no person, return empty array. Return JSON: [{"name": "person", "box_2d": [y1, x1, y2, x2]}]')
log("B13.3", "Person grounding (empty room)", r)

# B13.4: Security grounding (door/window)
r = run([img_content("window_f6.jpg")],
    'Locate the bounding box of every door, window, and opening in this image. Include state (open/closed). Return JSON: [{"name": "...", "box_2d": [y1, x1, y2, x2], "state": "open|closed"}]')
log("B13.4", "Security grounding (door)", r)

# B13.5: Specific object grounding (laptop)
r = run([img_content("cosmos_f2.jpg")],
    'Locate the bounding box of the laptop in this image. Return JSON: {"name": "laptop", "box_2d": [y1, x1, y2, x2], "position_description": "..."}')
log("B13.5", "Specific object (laptop)", r)

# B13.6: Specific object grounding (roses/vase)
r = run([img_content("cosmos_f2.jpg")],
    'Locate the bounding box of the bouquet of roses. Return JSON: {"name": "roses", "box_2d": [y1, x1, y2, x2]}')
log("B13.6", "Specific object (roses)", r)

# B13.7: Multi-object with categories
r = run([img_content("person_f3.jpg")],
    'Locate all objects and categorize them. Return JSON: [{"name": "...", "box_2d": [y1, x1, y2, x2], "category": "person|furniture|opening|decoration"}]')
log("B13.7", "Multi-object categorized", r)

# B13.8: Grounding without reasoning (comparison)
r = run([img_content("cosmos_f2.jpg")],
    'Locate the bounding boxes of all objects. Return JSON array: [{"name": "...", "box_2d": [y1, x1, y2, x2]}]',
    max_tokens=BENCHMARK_JSON_MAX_TOKENS, reasoning=False)
log("B13.8", "Multi-object (no reasoning)", r)

# B13.9: Change detection with grounding
r = run([img_content("mug_before.jpg"), img_content("mug_after.jpg")],
    'Compare these images. Locate bounding boxes of objects that were added or removed. Return JSON: [{"name": "...", "box_2d": [y1, x1, y2, x2], "change": "added|removed"}]')
log("B13.9", "Change detection + grounding", r)

# B13.10: Security assessment with grounding
r = run([img_content("window_f6.jpg")],
    'Assess security risks. Locate bounding boxes of all security-relevant elements (doors, windows, entry points). Return JSON: {"security_status": "safe|at_risk", "risk_level": 1-5, "elements": [{"name": "...", "box_2d": [y1, x1, y2, x2], "risk": "..."}]}')
log("B13.10", "Security + grounding", r)

# B13.11: Grounding on video frame (window sequence)
r = run([img_content("window_f0.jpg"), img_content("window_f6.jpg")],
    'Locate the door/window in both frames. Did its state change? Return JSON: {"frame1": {"box_2d": [...], "state": "..."}, "frame2": {"box_2d": [...], "state": "..."}, "changed": true/false}')
log("B13.11", "Grounding across 2 frames", r)

# Summary
print("\n" + "=" * 120)
print(f"TOTAL: {len(results)}")
reasoning_ok = sum(1 for r in results.values() if r.get("has_reasoning"))
json_ok = sum(1 for r in results.values() if r.get("json_valid"))
bbox_ok = sum(1 for r in results.values() if r.get("has_boxes"))
print(f"Reasoning: {reasoning_ok}/{len(results)} | JSON valid: {json_ok}/{len(results)} | Has bboxes: {bbox_ok}/{len(results)}")
print("=" * 120)

out_path = Path(__file__).parent.parent / "tests" / "benchmark_b13_raw.json"
with open(out_path, "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"Saved to {out_path}")

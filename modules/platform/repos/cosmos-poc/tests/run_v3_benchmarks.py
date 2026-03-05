#!/usr/bin/env python3
"""V3 Benchmark Runner — Full retest on 32768 context."""
import base64
import json
import time
import requests
import sys
import os
from dotenv import load_dotenv

load_dotenv()

COSMOS_API_BASE = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1").rstrip("/")
ENDPOINT = f"{COSMOS_API_BASE}/chat/completions"
MODEL = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
API_KEY = os.getenv("COSMOS_API_KEY", "EMPTY")
IMG_DIR = "/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/inputs/images"
VID_DIR = "/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/inputs/videos"

SYSTEM = {"role": "system", "content": [{"type": "text", "text": "You are a helpful assistant."}]}

REASONING_SUFFIX = "\n<think>\n"

SAMPLING_DEFAULT = {"temperature": 0.7, "top_p": 0.8, "presence_penalty": 1.5}
SAMPLING_REASONING = {"temperature": 0.6, "top_p": 0.95}

def b64_img(name):
    with open(f"{IMG_DIR}/{name}", "rb") as f:
        return base64.b64encode(f.read()).decode()

def b64_vid(name):
    with open(f"{VID_DIR}/{name}", "rb") as f:
        return base64.b64encode(f.read()).decode()

def build_content(images=None, videos=None, prompt="", reasoning=False):
    content = []
    for img in (images or []):
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img(img)}"}})
    for vid in (videos or []):
        content.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64_vid(vid)}"}})
    text = prompt
    if reasoning:
        text += REASONING_SUFFIX
    content.append({"type": "text", "text": text})
    return content

def call_api(images=None, videos=None, prompt="", reasoning=False, max_tokens=600):
    content = build_content(images, videos, prompt, reasoning)
    sampling = SAMPLING_REASONING if reasoning else SAMPLING_DEFAULT
    body = {
        "model": MODEL,
        "messages": [SYSTEM, {"role": "user", "content": content}],
        "max_tokens": max_tokens,
        "stream": False,
        **sampling
    }
    t0 = time.time()
    r = requests.post(ENDPOINT, json=body, headers={"Authorization": f"Bearer {API_KEY}"}, timeout=120)
    latency = time.time() - t0
    r.raise_for_status()
    data = r.json()
    choice = data["choices"][0]
    usage = data.get("usage", {})
    text = choice["message"]["content"]
    think_closed = "</think>" in text if reasoning else None
    return {
        "latency": round(latency, 2),
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "think_closed": think_closed,
        "text": text,
        "finish_reason": choice.get("finish_reason", "unknown")
    }

# Define ALL tests
TESTS = [
    # B1 Latency
    {"id": "B1_latency_single_1", "cat": "B1", "images": ["cosmos_f2.jpg"], "prompt": "Describe what you see.", "reasoning": False, "max_tokens": 200},
    {"id": "B1_latency_single_2", "cat": "B1", "images": ["cosmos_f2.jpg"], "prompt": "Describe what you see.", "reasoning": False, "max_tokens": 200},
    {"id": "B1_latency_single_3", "cat": "B1", "images": ["cosmos_f2.jpg"], "prompt": "Describe what you see.", "reasoning": False, "max_tokens": 200},
    {"id": "B1_latency_reason_1", "cat": "B1", "images": ["cosmos_f2.jpg"], "prompt": "Describe what you see.", "reasoning": True, "max_tokens": 400},
    {"id": "B1_latency_3frames", "cat": "B1", "images": ["cosmos_f0.jpg", "cosmos_f2.jpg", "cosmos_f4.jpg"], "prompt": "Describe what you see in these 3 surveillance frames.", "reasoning": False, "max_tokens": 300},
    {"id": "B1_latency_video", "cat": "B1", "videos": ["roller_clip.mp4"], "prompt": "Describe what you see.", "reasoning": False, "max_tokens": 200},
    
    # B2 Object Detection
    {"id": "B2_inventory", "cat": "B2", "images": ["cosmos_f2.jpg"], "prompt": "List every object you can identify. For each: name, position (left/center/right), size (small/medium/large), color/material.", "reasoning": True, "max_tokens": 600},
    {"id": "B2_count_balloons", "cat": "B2", "images": ["mug_after.jpg"], "prompt": "How many balloons are visible? Count each one by color.", "reasoning": True, "max_tokens": 300},
    {"id": "B2_count_chairs", "cat": "B2", "images": ["mug_after.jpg"], "prompt": "How many chairs are at the dining table? Count carefully.", "reasoning": True, "max_tokens": 300},
    {"id": "B2_count_table_items", "cat": "B2", "images": ["mug_after.jpg"], "prompt": "How many separate items are on the dining table? List each one.", "reasoning": True, "max_tokens": 400},
    {"id": "B2_small_pens", "cat": "B2", "images": ["mug_after.jpg"], "prompt": "Can you see any pens, markers, or writing instruments on the table?", "reasoning": True, "max_tokens": 200},
    {"id": "B2_small_switch", "cat": "B2", "images": ["roses_before.jpg"], "prompt": "Can you see a light switch or electrical outlet on the wall?", "reasoning": True, "max_tokens": 200},
    {"id": "B2_state_door", "cat": "B2", "images": ["window_f6.jpg"], "prompt": "Is the terrace/balcony door open or closed? Is there a curtain blowing? Provide evidence from the image.", "reasoning": True, "max_tokens": 400},
    
    # B3 Change Detection
    {"id": "B3_mug_general", "cat": "B3", "images": ["mug_before.jpg", "mug_after.jpg"], "prompt": "Two photos of the same room. What changed? List every difference.", "reasoning": True, "max_tokens": 600},
    {"id": "B3_mug_targeted", "cat": "B3", "images": ["mug_before.jpg", "mug_after.jpg"], "prompt": "Image 1 is BEFORE, Image 2 is AFTER. Was any NEW object added? If yes: what, color, where?", "reasoning": True, "max_tokens": 300},
    {"id": "B3_roses_general", "cat": "B3", "images": ["roses_before.jpg", "roses_after.jpg"], "prompt": "Two photos of the same room. What changed? List every difference.", "reasoning": True, "max_tokens": 600},
    {"id": "B3_roses_targeted", "cat": "B3", "images": ["roses_before.jpg", "roses_after.jpg"], "prompt": "Image 1 is BEFORE, Image 2 is AFTER. Was any object moved? If yes: what, from where, to where?", "reasoning": True, "max_tokens": 300},
    {"id": "B3_roller_general", "cat": "B3", "images": ["b3_before.jpg", "b3_after.jpg"], "prompt": "Two photos of the same scene. What changed? List every difference.", "reasoning": True, "max_tokens": 600},
    {"id": "B3_roller_targeted", "cat": "B3", "images": ["b3_before.jpg", "b3_after.jpg"], "prompt": "Image 1 is BEFORE, Image 2 is AFTER. Was any object removed? If yes: what, color, where was it?", "reasoning": True, "max_tokens": 300},
    {"id": "B3_lighting_single", "cat": "B3", "images": ["light_1.jpg"], "prompt": "What is the lighting state in this bathroom? Which lights are on/off? Overall brightness and color temperature?", "reasoning": True, "max_tokens": 300},
    {"id": "B3_lighting_comparison", "cat": "B3", "images": ["light_1.jpg", "light_2.jpg", "light_3.jpg"], "prompt": "Three photos of the same bathroom with different lighting. For each: which lights are on/off? Summarize changes 1→2 and 2→3.", "reasoning": True, "max_tokens": 600},
    
    # B4 Motion & Person
    {"id": "B4_motion_frames", "cat": "B4", "images": ["roller_f0.jpg", "roller_f1.jpg", "roller_f2.jpg"], "prompt": "Three sequential frames (0s, 1s, 2s). Is anything moving? What object, direction, speed?", "reasoning": True, "max_tokens": 400},
    {"id": "B4_motion_video", "cat": "B4", "videos": ["roller_clip.mp4"], "prompt": "Is anything moving? What, direction, speed?", "reasoning": True, "max_tokens": 400},
    {"id": "B4_person_f0", "cat": "B4", "images": ["person_f0.jpg"], "prompt": "Is there a person in this image? If yes, describe them.", "reasoning": True, "max_tokens": 200},
    {"id": "B4_person_f1", "cat": "B4", "images": ["person_f1.jpg"], "prompt": "Is there a person in this image? If yes, describe them.", "reasoning": True, "max_tokens": 200},
    {"id": "B4_person_f2", "cat": "B4", "images": ["person_f2.jpg"], "prompt": "Is there a person in this image? If yes, describe them.", "reasoning": True, "max_tokens": 200},
    {"id": "B4_person_f3", "cat": "B4", "images": ["person_f3.jpg"], "prompt": "Is there a person in this image? If yes, describe them.", "reasoning": True, "max_tokens": 200},
    {"id": "B4_person_f4", "cat": "B4", "images": ["person_f4.jpg"], "prompt": "Is there a person in this image? If yes, describe them.", "reasoning": True, "max_tokens": 200},
    {"id": "B4_person_tracking", "cat": "B4", "images": ["person_f0.jpg", "person_f2.jpg", "person_f4.jpg"], "prompt": "Three sequential frames (0s, 4s, 8s). Is anyone moving? Who, direction, entering or leaving?", "reasoning": True, "max_tokens": 400},
    {"id": "B4_activity", "cat": "B4", "images": ["person_f3.jpg"], "prompt": "What is this person doing? Choose: walking, running, standing, sitting, crouching, reaching, looking around. Direction of movement?", "reasoning": True, "max_tokens": 200},
    
    # B5 Security
    {"id": "B5_security_door", "cat": "B5", "images": ["window_f6.jpg"], "prompt": "You are a security AI. Analyze: 1) ALERT LEVEL (green/yellow/orange/red) 2) Is any door/window open? 3) Curtain movement? 4) Recommended action.", "reasoning": True, "max_tokens": 500},
    {"id": "B5_security_person", "cat": "B5", "images": ["person_f3.jpg"], "prompt": "SECURITY AI: Person detected. 1) ALERT LEVEL 2) Person description 3) Threat assessment 4) Recommended action.", "reasoning": True, "max_tokens": 400},
    {"id": "B5_door_sequence", "cat": "B5", "images": ["window_f0.jpg", "window_f3.jpg", "window_f6.jpg"], "prompt": "Three surveillance frames (0s, 3s, 6s). What changed? Focus on doors, windows, curtains. Security implications?", "reasoning": True, "max_tokens": 500},
    
    # B6 Spatial & Physics
    {"id": "B6_room_dimensions", "cat": "B6", "images": ["cosmos_f2.jpg"], "prompt": "Estimate room dimensions (width × depth) in meters. Standard sofa = 2.5m long for reference.", "reasoning": True, "max_tokens": 400},
    {"id": "B6_stability", "cat": "B6", "images": ["cosmos_f4.jpg"], "prompt": "Is any furniture at risk of falling or tipping? Any unstable objects?", "reasoning": True, "max_tokens": 400},
    
    # B7 JSON
    {"id": "B7_json_schema", "cat": "B7", "images": ["cosmos_f2.jpg"], "prompt": 'Return ONLY valid JSON: {"scene": {"type": "indoor|outdoor", "room_type": "string"}, "objects": [{"name": "string", "position": "left|center|right", "size": "small|medium|large"}], "people_count": 0, "alert_level": "green|yellow|red"}', "reasoning": True, "max_tokens": 600},
    {"id": "B7_json_change", "cat": "B7", "images": ["mug_before.jpg", "mug_after.jpg"], "prompt": 'Compare Image 1 and Image 2. Return JSON: {"added": [{"object": "...", "color": "...", "location": "..."}], "removed": [], "moved": []}', "reasoning": True, "max_tokens": 400},
    
    # B8 Counting (CRITICAL - was loop at 4096)
    {"id": "B8_cushion_counting", "cat": "B8", "images": ["cosmos_f2.jpg"], "prompt": "How many cushions/pillows are on the sofa? Count each one carefully.", "reasoning": True, "max_tokens": 1000},
    
    # B9 Distance (CRITICAL - Camera→Person was loop at 4096)
    {"id": "B9_dist_sofa", "cat": "B9", "images": ["cosmos_f2.jpg"], "prompt": "Estimate the distance from the camera to the sofa in meters.", "reasoning": True, "max_tokens": 1000},
    {"id": "B9_dist_table", "cat": "B9", "images": ["cosmos_f2.jpg"], "prompt": "Estimate the distance from the camera to the coffee table in meters.", "reasoning": True, "max_tokens": 1000},
    {"id": "B9_dist_wall", "cat": "B9", "images": ["cosmos_f2.jpg"], "prompt": "Estimate the distance from the camera to the far wall in meters.", "reasoning": True, "max_tokens": 1000},
    {"id": "B9_dist_person", "cat": "B9", "images": ["person_f3.jpg"], "prompt": "Estimate the distance from the camera to the person in meters.", "reasoning": True, "max_tokens": 1000},
    
    # B10 Relative Positioning (CRITICAL - was loop at 4096)
    {"id": "B10_table_lr", "cat": "B10", "images": ["cosmos_f2.jpg"], "prompt": "Is the coffee table to the LEFT or RIGHT of the sofa?", "reasoning": True, "max_tokens": 1000},
    {"id": "B10_window_bf", "cat": "B10", "images": ["cosmos_f2.jpg"], "prompt": "Is the window/terrace door BEHIND or IN FRONT of the sofa?", "reasoning": True, "max_tokens": 1000},
    {"id": "B10_mug_lr", "cat": "B10", "images": ["mug_after.jpg"], "prompt": "Is the orange mug to the LEFT or RIGHT of the roses vase?", "reasoning": True, "max_tokens": 800},
    {"id": "B10_markers_depth", "cat": "B10", "images": ["mug_after.jpg"], "prompt": "Are the markers/pens CLOSER or FARTHER from the camera than the roses vase?", "reasoning": True, "max_tokens": 800},
    
    # B11 Room Dimensions (CRITICAL - was loop at 4096)
    {"id": "B11_room_dims", "cat": "B11", "images": ["cosmos_f2.jpg"], "prompt": "Estimate room dimensions (width × depth) in meters. Use the sofa (standard 2.5m) as scale reference. Show your calculation.", "reasoning": True, "max_tokens": 1000},
    
    # B12 Streaming TTFT
    {"id": "B12_ttft_single", "cat": "B12", "images": ["cosmos_f2.jpg"], "prompt": "Describe what you see.", "reasoning": False, "max_tokens": 200},
]

def run_all():
    results = []
    total = len(TESTS)
    for i, test in enumerate(TESTS):
        tid = test["id"]
        print(f"[{i+1}/{total}] {tid}...", end=" ", flush=True)
        try:
            r = call_api(
                images=test.get("images"),
                videos=test.get("videos"),
                prompt=test["prompt"],
                reasoning=test.get("reasoning", False),
                max_tokens=test.get("max_tokens", 600)
            )
            r["id"] = tid
            r["cat"] = test["cat"]
            results.append(r)
            tc = f"</think>={'Y' if r['think_closed'] else 'N'}" if r['think_closed'] is not None else ""
            print(f"{r['latency']}s {r['prompt_tokens']}/{r['completion_tokens']}tok {tc} fin={r['finish_reason']}")
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({"id": tid, "cat": test["cat"], "error": str(e)})
    
    # Save raw results
    with open("/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/v3_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nDone! {len(results)} tests. Results saved to tests/v3_results.json")

if __name__ == "__main__":
    run_all()

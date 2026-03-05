#!/usr/bin/env python3
"""Full Cosmos Reason2-2B benchmark — all tests with reasoning mode."""

import requests, base64, time, json, sys

API = "http://63.182.177.92:8899/v1/chat/completions"
MODEL = "nvidia/Cosmos-Reason2-2B"
IMG = "/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/inputs/images"
VID = "/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/inputs/videos"

results = []

def load_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def test(test_id, images=None, videos=None, prompt="", max_tokens=1000, stream=False):
    content = []
    if images:
        for p in images:
            b64 = load_b64(p)
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    if videos:
        for p in videos:
            b64 = load_b64(p)
            content.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64}"}})
    content.append({"type": "text", "text": f"{prompt}\n<think>\n"})

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": [{"type": "text", "text": "You are a helpful assistant."}]},
            {"role": "user", "content": content}
        ],
        "temperature": 0.6,
        "top_p": 0.95,
        "max_tokens": max_tokens,
        "stream": stream
    }

    start = time.time()
    try:
        if stream:
            resp = requests.post(API, json=payload, timeout=180, stream=True)
            ttft = None
            chunks = []
            for line in resp.iter_lines():
                if line:
                    decoded = line.decode()
                    if decoded.startswith("data: ") and decoded != "data: [DONE]":
                        if ttft is None:
                            ttft = round(time.time() - start, 3)
                        try:
                            d = json.loads(decoded[6:])
                            delta = d["choices"][0].get("delta", {}).get("content", "")
                            if delta:
                                chunks.append(delta)
                        except:
                            pass
            latency = round(time.time() - start, 2)
            text = "".join(chunks)
            r = {
                "test_id": test_id, "prompt": prompt[:80], "latency": latency,
                "ttft": ttft, "text": text,
                "prompt_tokens": None, "completion_tokens": None,
                "think_closed": "</think>" in text,
                "finish_reason": "stream",
            }
        else:
            resp = requests.post(API, json=payload, timeout=180)
            latency = round(time.time() - start, 2)
            data = resp.json()
            if "choices" not in data:
                print(f"  ERROR {test_id}: {json.dumps(data)[:200]}")
                r = {"test_id": test_id, "prompt": prompt[:80], "latency": latency,
                     "error": str(data)[:200], "text": "", "think_closed": False,
                     "prompt_tokens": None, "completion_tokens": None, "finish_reason": "error"}
            else:
                ch = data["choices"][0]
                text = ch["message"]["content"]
                usage = data.get("usage", {})
                r = {
                    "test_id": test_id, "prompt": prompt[:80], "latency": latency,
                    "text": text, "prompt_tokens": usage.get("prompt_tokens"),
                    "completion_tokens": usage.get("completion_tokens"),
                    "think_closed": "</think>" in text,
                    "finish_reason": ch.get("finish_reason"),
                }
    except Exception as e:
        latency = round(time.time() - start, 2)
        r = {"test_id": test_id, "prompt": prompt[:80], "latency": latency,
             "error": str(e)[:200], "text": "", "think_closed": False,
             "prompt_tokens": None, "completion_tokens": None, "finish_reason": "error"}

    results.append(r)
    status = "✅" if r.get("think_closed") else "⚠️"
    fr = r.get("finish_reason", "?")
    pt = r.get("prompt_tokens", "?")
    ct = r.get("completion_tokens", "?")
    ttft_str = f" TTFT={r['ttft']}s" if r.get("ttft") else ""
    print(f"  {status} {test_id} | {latency}s | {pt}/{ct} tok | think={r['think_closed']} | fr={fr}{ttft_str}")
    # Print first 150 chars of answer (after </think>)
    txt = r.get("text", "")
    if "</think>" in txt:
        answer = txt.split("</think>", 1)[1].strip()[:150]
    else:
        answer = txt[:150]
    print(f"     → {answer}")
    return r

# ============================================================
print("=" * 60)
print("COSMOS REASON2-2B FULL BENCHMARK — 8192 + REASONING")
print("=" * 60)

# B1: Latency
print("\n--- B1: Latency ---")
for i in range(3):
    test(f"B1.1_{i+1}", [f"{IMG}/cosmos_f2.jpg"], prompt="Describe this room")
for i in range(3):
    test(f"B1.2_{i+1}", [f"{IMG}/cosmos_f2.jpg"], prompt="Describe this room in detail, noting all objects and their positions")
test("B1.3", [f"{IMG}/cosmos_f0.jpg", f"{IMG}/cosmos_f2.jpg", f"{IMG}/cosmos_f4.jpg"],
     prompt="Describe what you see across these frames")
test("B1.4", videos=[f"{VID}/roller_clip.mp4"], prompt="Describe the motion in this video")

# B2: Object Detection
print("\n--- B2: Object Detection ---")
test("B2.1", [f"{IMG}/cosmos_f2.jpg"], prompt="List all objects visible in this room")
test("B2.2", [f"{IMG}/mug_after.jpg"], prompt="How many balloons are in this image? List each by color")
test("B2.3", [f"{IMG}/cosmos_f2.jpg"], prompt="How many chairs or seating surfaces are in this image?")
test("B2.4", [f"{IMG}/cosmos_f2.jpg"], prompt="How many distinct items are on the coffee table?")
test("B2.5", [f"{IMG}/cosmos_f2.jpg"], prompt="Where exactly is the laptop in this image?")
test("B2.6", [f"{IMG}/window_f6.jpg"], prompt="Is the terrace/balcony door open or closed?")

# B3: Change Detection
print("\n--- B3: Change Detection ---")
test("B3.1", [f"{IMG}/mug_before.jpg", f"{IMG}/mug_after.jpg"], prompt="What changed between these two images?")
test("B3.2", [f"{IMG}/mug_before.jpg", f"{IMG}/mug_after.jpg"], prompt="Was anything added to or removed from the table?")
test("B3.3", [f"{IMG}/roses_before.jpg", f"{IMG}/roses_after.jpg"], prompt="What changed between these two images?")
test("B3.4", [f"{IMG}/roses_before.jpg", f"{IMG}/roses_after.jpg"], prompt="Was the bouquet of flowers moved, removed, or left in place?")
test("B3.5", [f"{IMG}/b3_before.jpg", f"{IMG}/b3_after.jpg"], prompt="What changed between these two images?")
test("B3.6", [f"{IMG}/b3_before.jpg", f"{IMG}/b3_after.jpg"], prompt="Was the foam roller added, removed, or left in place?")
test("B3.7", [f"{IMG}/light_1.jpg", f"{IMG}/light_2.jpg", f"{IMG}/light_3.jpg"],
     prompt="Describe how the lighting changes across these 3 images")

# B4: Motion & Person
print("\n--- B4: Motion & Person ---")
test("B4.1", [f"{IMG}/roller_f0.jpg", f"{IMG}/roller_f1.jpg", f"{IMG}/roller_f2.jpg"],
     prompt="Which direction is the blue foam roller moving, and at what speed?")
test("B4.2", videos=[f"{VID}/roller_clip.mp4"], prompt="Describe the motion of the foam roller")
for i in range(5):
    test(f"B4.3_{i}", [f"{IMG}/person_f{i}.jpg"], prompt="Is there a person in this image? If yes, describe them")
test("B4.4", [f"{IMG}/person_f1.jpg", f"{IMG}/person_f3.jpg", f"{IMG}/person_f4.jpg"],
     prompt="Track the person's position across these 3 frames")
test("B4.5", [f"{IMG}/person_f3.jpg"], prompt="What is this person doing? Describe their posture and activity")
test("B4.6", videos=[f"{VID}/person_clip.mp4"], prompt="Describe any person movement in this video")

# B5: Security
print("\n--- B5: Security ---")
test("B5.1", [f"{IMG}/window_f6.jpg"], prompt="Evaluate the security status of this room. Is the door/window secure?")
test("B5.2", [f"{IMG}/person_f3.jpg"], prompt="A person was detected. Is this likely a resident or an intruder? Assess threat level")
test("B5.3", [f"{IMG}/window_f0.jpg", f"{IMG}/window_f3.jpg", f"{IMG}/window_f6.jpg"],
     prompt="Compare these 3 frames chronologically. Did the door/window state change? Is there a security concern?")

# B6: Spatial & Physics
print("\n--- B6: Spatial & Physics ---")
test("B6.1", [f"{IMG}/cosmos_f2.jpg"], prompt="The sofa is approximately 2.5 meters long. Using this as reference, estimate the room dimensions in meters")
test("B6.2", [f"{IMG}/cosmos_f4.jpg"], prompt="What items in this room could fall or become unstable?")
test("B6.3", [f"{IMG}/cosmos_f2.jpg"], prompt="If the terrace door were opened during a snowstorm, what would happen to the room temperature?")
test("B6.4", [f"{IMG}/cosmos_f2.jpg"], prompt="Estimate distances: camera to sofa, camera to coffee table, camera to far wall, in meters")

# B7: Output Format
print("\n--- B7: Output Format ---")
test("B7.1", [f"{IMG}/cosmos_f2.jpg"], prompt='Output a JSON object with: room_type, dimensions_estimate {length_m, width_m}, objects [{name, position, size}], hazards [], security_status')
test("B7.2", [f"{IMG}/cosmos_f2.jpg"], prompt="Count every distinct object in this room. List each one, then give the total count")

# B8-B11: Supplementary
print("\n--- B8-B11: Supplementary ---")
test("B8.1", [f"{IMG}/cosmos_f2.jpg"], prompt="How many cushions or pillows are on the sofa?")
test("B9.1", [f"{IMG}/person_f3.jpg"], prompt="Estimate the distance from the camera to the person in meters")
test("B10.1", [f"{IMG}/cosmos_f2.jpg"], prompt="Is the coffee table to the LEFT or RIGHT of the sofa?")
test("B10.2", [f"{IMG}/cosmos_f2.jpg"], prompt="Is the window/terrace door BEHIND or IN FRONT of the sofa?")
test("B11.1", [f"{IMG}/cosmos_f2.jpg"], prompt="Estimate the room's length and width in meters")

# B12: Streaming TTFT
print("\n--- B12: Streaming TTFT ---")
test("B12.1", [f"{IMG}/cosmos_f2.jpg"], prompt="Describe this room", stream=True)
test("B12.2", [f"{IMG}/cosmos_f0.jpg", f"{IMG}/cosmos_f2.jpg", f"{IMG}/cosmos_f4.jpg"],
     prompt="Describe what you see across these frames", stream=True)
test("B12.3", videos=[f"{VID}/roller_clip.mp4"], prompt="Describe the motion in this video", stream=True)

# Save raw JSON
with open("/Users/szymonpaluch/Projects/DataPilot/cosmos-hackathon/tests/benchmark_raw.json", "w") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n{'='*60}")
print(f"DONE — {len(results)} tests completed")
print(f"Results saved to tests/benchmark_raw.json")

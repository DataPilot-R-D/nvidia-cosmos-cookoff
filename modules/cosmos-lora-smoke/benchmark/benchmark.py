#!/usr/bin/env python3
"""Benchmark LoRA v3 on real thermal test images (Thermal-IM based)."""
import json, os, glob, sys, time
import torch
from PIL import Image
from transformers import Qwen3VLForConditionalGeneration, AutoProcessor
from peft import PeftModel

ADAPTER_PATH = "/workspace/cosmos-lora-smoke-v3"
TEST_DIR = "/workspace/real_test"
MODEL_ID = "nvidia/Cosmos-Reason2-2B"

PROMPT = """Analyze this thermal camera image from a security robot patrol.
Answer these questions:
1. Are there any people visible? (yes/no) If yes, how many and where?
2. Is there smoke present? (yes/no) If yes, estimate density (light/medium/heavy).
3. Threat assessment: (none/low/medium/high/critical)
Be concise."""

def load_model():
    print("Loading base model...")
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto"
    )
    print("Loading LoRA adapter...")
    model = PeftModel.from_pretrained(model, ADAPTER_PATH)
    model.eval()
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    return model, processor

def run_inference(model, processor, image_path):
    image = Image.open(image_path).convert("RGB")
    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text", "text": PROMPT}
    ]}]
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(text=[text], images=[image], return_tensors="pt", padding=True)
    inputs = {k: v.to(model.device) if hasattr(v, 'to') else v for k, v in inputs.items()}
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=256, do_sample=False)
    input_len = inputs["input_ids"].shape[1]
    return processor.decode(out[0][input_len:], skip_special_tokens=True)

def parse_response(response):
    resp_lower = response.lower()
    has_person = False
    no_person_patterns = ["no people", "no person", "not visible", "cannot see", "no individuals",
                          "people visible? no", "people: no", "no human", "anyone visible? no"]
    person_keywords = ["person", "people", "individual", "figure", "human", "someone", "silhouette", "intruder"]
    for pat in no_person_patterns:
        if pat in resp_lower:
            has_person = False
            break
    else:
        for kw in person_keywords:
            if kw in resp_lower and "no " + kw not in resp_lower:
                has_person = True
                break

    has_smoke = False
    no_smoke_patterns = ["no smoke", "smoke: no", "smoke present? no", "without smoke"]
    smoke_keywords = ["smoke", "haze", "fog", "mist"]
    for pat in no_smoke_patterns:
        if pat in resp_lower:
            has_smoke = False
            break
    else:
        for kw in smoke_keywords:
            if kw in resp_lower and "no " + kw not in resp_lower:
                has_smoke = True
                break
    return has_person, has_smoke

def main():
    model, processor = load_model()
    
    # Ground truth: A_real=person+smoke, B_real=person only (original), C_real=smoke only
    ground_truth = {
        "A_real": {"person": True, "smoke": True},
        "B_real": {"person": True, "smoke": False},
        "C_real": {"person": False, "smoke": True},
    }
    
    all_results = []
    
    for cat in ["A_real", "B_real", "C_real"]:
        files = sorted(glob.glob(f"{TEST_DIR}/{cat}/*.jpg"))
        if not files:
            files = sorted(glob.glob(f"{TEST_DIR}/{cat}/*.png"))
        print(f"\n=== {cat}: {len(files)} images ===")
        gt = ground_truth[cat]
        person_correct = smoke_correct = 0
        
        for i, f in enumerate(files):
            t0 = time.time()
            response = run_inference(model, processor, f)
            dt = time.time() - t0
            has_person, has_smoke = parse_response(response)
            p_ok = (has_person == gt["person"])
            s_ok = (has_smoke == gt["smoke"])
            person_correct += int(p_ok)
            smoke_correct += int(s_ok)
            fname = os.path.basename(f)
            status = "✅" if (p_ok and s_ok) else "❌"
            print(f"  [{i+1}/{len(files)}] {fname} person={has_person}({'✓' if p_ok else '✗'}) smoke={has_smoke}({'✓' if s_ok else '✗'}) {dt:.1f}s {status}")
            all_results.append({
                "file": fname, "category": cat,
                "person_detected": has_person, "smoke_detected": has_smoke,
                "person_correct": p_ok, "smoke_correct": s_ok,
                "response": response, "time_s": round(dt, 1)
            })
        
        n = len(files)
        if n > 0:
            print(f"  {cat} Person: {person_correct}/{n} ({100*person_correct/n:.1f}%) | Smoke: {smoke_correct}/{n} ({100*smoke_correct/n:.1f}%)")
    
    total = len(all_results)
    p_total = sum(1 for r in all_results if r["person_correct"])
    s_total = sum(1 for r in all_results if r["smoke_correct"])
    
    print(f"\n{'='*60}")
    print(f"TOTAL: Person {p_total}/{total} ({100*p_total/total:.1f}%) | Smoke {s_total}/{total} ({100*s_total/total:.1f}%)")
    for cat in ["A_real", "B_real", "C_real"]:
        cat_results = [r for r in all_results if r["category"] == cat]
        n = len(cat_results)
        if n > 0:
            p = sum(1 for r in cat_results if r["person_correct"])
            s = sum(1 for r in cat_results if r["smoke_correct"])
            print(f"  {cat}: Person {p}/{n} ({100*p/n:.1f}%) | Smoke {s}/{n} ({100*s/n:.1f}%)")
    
    with open("/workspace/benchmark_real_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nResults saved to /workspace/benchmark_real_results.json")

if __name__ == "__main__":
    main()

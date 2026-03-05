#!/usr/bin/env python3
"""LoRA training v6 — same config as v3 (proven best). Supports v6a (real-only) and v6b (mixed)."""
import json, os, sys, time, random
import torch
from PIL import Image
from transformers import Qwen3VLForConditionalGeneration, AutoProcessor
from peft import LoraConfig, get_peft_model

# Config
MODEL_ID = "nvidia/Cosmos-Reason2-2B"
VARIANT = os.environ.get("VARIANT", "v6b")  # v6a or v6b
JSONL = f"/workspace/data/train_{VARIANT}.jsonl"
OUTPUT_DIR = f"/workspace/cosmos-lora-smoke-{VARIANT}"
EPOCHS = 3
LR = 2e-4
BATCH_SIZE = 1
GRAD_ACCUM = 8
MAX_SEQ_LEN = 1024
IMG_SIZE = 512
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05
TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]

def load_data(jsonl_path):
    entries = []
    with open(jsonl_path) as f:
        for line in f:
            entries.append(json.loads(line))
    random.shuffle(entries)
    return entries

def resolve_image_path(image_ref):
    """Resolve file:// paths to actual filesystem paths."""
    if image_ref.startswith("file://"):
        rel = image_ref[7:]  # strip file://
        return f"/workspace/data/{rel}"
    return image_ref

def main():
    print(f"=== LoRA Training {VARIANT.upper()} ===")
    print(f"JSONL: {JSONL}")
    print(f"Config: r={LORA_R}, alpha={LORA_ALPHA}, lr={LR}, epochs={EPOCHS}")
    print(f"Image size: {IMG_SIZE}px, max_seq_len={MAX_SEQ_LEN}")
    
    # Load data
    data = load_data(JSONL)
    print(f"Loaded {len(data)} training examples")
    
    # Load model
    print("Loading base model...")
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto"
    )
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    
    # Apply LoRA
    lora_config = LoraConfig(
        r=LORA_R, lora_alpha=LORA_ALPHA, lora_dropout=LORA_DROPOUT,
        target_modules=TARGET_MODULES, bias="none", task_type="CAUSAL_LM"
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    model.train()
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    
    total_loss = 0
    step = 0
    skipped = 0
    t0 = time.time()
    
    for epoch in range(EPOCHS):
        random.shuffle(data)
        epoch_loss = 0
        epoch_steps = 0
        
        for i, entry in enumerate(data):
            try:
                msgs = entry["messages"]
                user_msg = msgs[0]
                assistant_msg = msgs[1]
                
                # Get image path
                image_ref = user_msg["content"][0]["image"]
                image_path = resolve_image_path(image_ref)
                
                if not os.path.exists(image_path):
                    skipped += 1
                    continue
                
                image = Image.open(image_path).convert("RGB").resize((IMG_SIZE, IMG_SIZE))
                
                # Build conversation
                messages = [
                    {"role": "user", "content": [
                        {"type": "image", "image": image},
                        {"type": "text", "text": user_msg["content"][1]["text"]}
                    ]},
                    {"role": "assistant", "content": assistant_msg["content"]}
                ]
                
                text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
                inputs = processor(text=[text], images=[image], return_tensors="pt", padding=True,
                                   max_length=MAX_SEQ_LEN, truncation=True)
                inputs = {k: v.to(model.device) if hasattr(v, 'to') else v for k, v in inputs.items()}
                
                inputs["labels"] = inputs["input_ids"].clone()
                
                outputs = model(**inputs)
                loss = outputs.loss / GRAD_ACCUM
                loss.backward()
                
                epoch_loss += outputs.loss.item()
                epoch_steps += 1
                step += 1
                
                if step % GRAD_ACCUM == 0:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    optimizer.zero_grad()
                
                if (i + 1) % 50 == 0:
                    avg = epoch_loss / epoch_steps
                    elapsed = time.time() - t0
                    print(f"  Epoch {epoch+1} [{i+1}/{len(data)}] loss={avg:.4f} elapsed={elapsed:.0f}s skipped={skipped}")
                    
            except Exception as e:
                skipped += 1
                if skipped <= 5:
                    print(f"  Skip {image_path}: {e}")
                continue
        
        # Flush remaining gradients
        if step % GRAD_ACCUM != 0:
            optimizer.step()
            optimizer.zero_grad()
        
        avg_loss = epoch_loss / max(epoch_steps, 1)
        elapsed = time.time() - t0
        print(f"Epoch {epoch+1}/{EPOCHS}: loss={avg_loss:.4f}, images={epoch_steps}/{len(data)}, skipped={skipped}, time={elapsed:.0f}s")
    
    # Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR)
    print(f"\nAdapter saved to {OUTPUT_DIR}")
    print(f"Total time: {time.time()-t0:.0f}s, total skipped: {skipped}")
    
    # VRAM info
    if torch.cuda.is_available():
        print(f"Peak VRAM: {torch.cuda.max_memory_allocated()/1e9:.1f}GB")

if __name__ == "__main__":
    main()

# Training Pipeline

## Overview

```
Real Thermal Images → Categorize (A/B/C) → JSONL Annotation → LoRA Training → Benchmark → Deploy
```

## Step 1: Data Collection

Sources:
- FLIR ADAS thermal pedestrian dataset
- KAIST Multispectral dataset
- Industrial thermal footage
- Curated synthetic generation (nanobanana pipeline)

## Step 2: Categorization

Each image assigned to one of three categories:
- **A:** Contains both smoke AND people
- **B:** Contains people only (no smoke)
- **C:** Contains smoke only (no people)

## Step 3: JSONL Annotation

Each training example formatted as a conversation:
- **User:** Thermal image + security patrol analysis prompt
- **Assistant:** Structured response with person/smoke detection + threat level

## Step 4: LoRA Training

```bash
export VARIANT=v6a
python training/train_lora.py
```

- Base model: `nvidia/Cosmos-Reason2-2B`
- LoRA config: rank=16, alpha=32, dropout=0.05
- 3 epochs, bf16, ~20 min on RTX 3090

## Step 5: Benchmark

```bash
python benchmark/benchmark.py --adapter-path ./adapters/v6a --test-dir ./data/test
```

Evaluates on 131 held-out real thermal images with per-category breakdown.

## Step 6: Deployment

Load base model + 278MB LoRA adapter. No model surgery needed — PEFT handles merging at inference time.

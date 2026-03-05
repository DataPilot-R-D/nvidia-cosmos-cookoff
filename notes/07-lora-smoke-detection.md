# Module 5: LoRA Extension for Smoke-Resilient Person Detection

## What It Does

Fine-tunes NVIDIA Cosmos Reason2-2B with LoRA adapters to detect people through cold smoke screens on thermal cameras. Extends Cosmos capabilities for security-specific scenarios.

## The Problem

- Cold smoke grenades are used by intruders to evade detection
- Standard RGB cameras: completely blind in smoke
- Thermal cameras: can see through smoke, but AI models aren't trained for it
- **Cosmos Reason2 zero-shot: only 53.3% person detection in thermal+smoke images**
- This is unacceptable for security applications

## The Solution

LoRA (Low-Rank Adaptation) fine-tuning:
- Only 278MB adapter on top of 4.5GB base model
- 20 minutes training on single RTX 3090
- Cost: ~$0.30 per training run
- No catastrophic forgetting of base capabilities

## Results (v6a Champion)

| Metric | Zero-Shot | LoRA v6a | Improvement |
|---|---|---|---|
| Person Detection | 53.3% | **96.2%** | **+42.9 pp** |
| Smoke Detection | 78.6% | **99.2%** | **+20.6 pp** |

### Per-Category Breakdown

| Category | Description | Person (before -> after) |
|---|---|---|
| A_real | Smoke + People (hardest) | 55.6% -> **91.1%** (+35.5pp) |
| B_real | People only | 51.1% -> **97.8%** (+46.7pp) |
| C_real | Smoke only (no false positives) | N/A -> **100%** correct |

## Training Configuration

| Parameter | Value |
|---|---|
| Base Model | nvidia/Cosmos-Reason2-2B |
| Method | LoRA (PEFT) |
| Rank | 16 |
| Alpha | 32 |
| Target Modules | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj |
| Training Data | 667 real thermal images (3 categories) |
| Test Data | 131 real thermal images |
| Training Time | ~20 min (RTX 3090) |
| Adapter Size | 278 MB |

## Key Insights

1. **Real thermal data >> synthetic** - v6a (real-only) outperformed mixed data
2. **512px optimal** - higher resolution caused regressions
3. **Small rank sufficient** - r=16 with 164 examples = near-perfect
4. **Zero false positives on smoke-only** - model doesn't hallucinate people

## How It Fits in SRAS

```
Normal patrol: RGB camera -> Cosmos base model -> standard detection
Smoke event:   Thermal camera -> Cosmos + LoRA v6a -> smoke-resilient detection
```

The LoRA adapter demonstrates that Cosmos Reason2 is **extensible** - it can be customized for domain-specific Physical AI challenges without retraining the full model.

## Dataset

- 667 training images (225 smoke+people, 226 people-only, 216 smoke-only)
- 131 test images (all real thermal)
- Sources: FLIR ADAS, KAIST Multispectral, industrial thermal
- Human QA: 200 images reviewed, 94.5% OK

## Key Files

- `modules/cosmos-lora-smoke/training/train_lora.py`
- `modules/cosmos-lora-smoke/benchmark/benchmark.py`
- `modules/cosmos-lora-smoke/benchmark/results/v6a_results.md`
- `modules/cosmos-lora-smoke/docs/methodology.md`

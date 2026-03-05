# Benchmark Results — LoRA v6a (Champion)

**Date:** 2026-02-24
**Test Set:** 131 real thermal images
**Hardware:** AWS g6.4xlarge (NVIDIA L4 GPU)
**Inference:** vLLM, ~3.5s/image

## Overall

| Metric | Score |
|--------|-------|
| Person Detection | **96.2%** (126/131) |
| Smoke Detection | **99.2%** (130/131) |

## Per-Category

| Category | Images | Person Detection | Smoke Detection |
|----------|--------|-----------------|-----------------|
| A_real (smoke + people) | 45 | **91.1%** (41/45) | **100%** (45/45) |
| B_real (people only) | 45 | **97.8%** (44/45) | **97.8%** (no false positives) |
| C_real (smoke only) | 41 | **100%** (no false positives) | **100%** (41/41) |

## Comparison with Zero-Shot

| Category | Zero-Shot Person | LoRA v6a Person | Delta |
|----------|-----------------|-----------------|-------|
| A_real | 55.6% | 91.1% | **+35.5pp** |
| B_real | 51.1% | 97.8% | **+46.7pp** |
| Overall | 53.3% | 96.2% | **+42.9pp** |

## Training Configuration

- Data: 164 real thermal examples (v6a variant)
- Resolution: 512px, seq_len: 1024
- LoRA rank: 16, alpha: 32
- 3 epochs, RTX 3090, ~20 min
- Adapter size: 278 MB

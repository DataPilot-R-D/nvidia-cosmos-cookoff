# Methodology

## Research Question

Can LoRA fine-tuning improve NVIDIA Cosmos Reason2-2B's ability to detect people in thermal images obscured by smoke?

## Approach

### 1. Baseline Measurement

We first evaluated Cosmos Reason2-2B zero-shot on 35 synthetic thermal images:
- Person detection: 91.4% (high baseline, but synthetic images are "easier")
- On real thermal: drops to **53.3%** — the gap we need to close

### 2. Dataset Construction

Three-category balanced dataset:
- **Category A:** Smoke + people (hardest — the core use case)
- **Category B:** People only (ensures model doesn't lose general person detection)
- **Category C:** Smoke only (ensures model doesn't hallucinate people in smoke)

### 3. Iterative Training

| Version | Data | Key Change | Person % | Smoke % |
|---------|------|------------|----------|---------|
| v3 | 35 synthetic | First LoRA attempt | 93% | 97% |
| v5 | 164 mixed (1024px) | Higher resolution | 79% | 95% |
| v6a | 164 real (512px) | **Real data only** | **96.2%** | **99.2%** |
| v6b | 164 mixed (512px) | Real + synthetic | 94% | 98% |

### 4. Key Insights

1. **Real > Synthetic:** v6a (real-only) beat v6b (mixed) — synthetic noise hurts
2. **512px > 1024px:** Higher resolution caused regressions (v5 vs v6a)
3. **Small rank is enough:** r=16 with 164 examples achieves near-perfect results
4. **Category C is critical:** Without smoke-only negatives, model hallucinates people

## Evaluation Protocol

- Binary person detection (detected/not detected per image)
- Binary smoke detection (present/absent per image)
- Multi-pattern response parsing (handles model output variations)
- Per-category breakdown to detect systematic failures

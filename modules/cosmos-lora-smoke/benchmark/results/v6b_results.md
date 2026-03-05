# Benchmark Results — LoRA v6b (Mixed Data)

**Test Set:** 131 real thermal images
**Training:** 164 mixed (real + synthetic), 512px, seq=1024, rank=16

| Metric | Score |
|--------|-------|
| Person Detection | 94.0% |
| Smoke Detection | 98.0% |

**Note:** v6b uses mixed real+synthetic training data. Slightly worse than v6a (real-only), suggesting synthetic data introduces noise.

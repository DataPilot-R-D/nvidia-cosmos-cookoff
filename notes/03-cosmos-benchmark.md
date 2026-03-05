# Module 1: Cosmos Reason2 Benchmark

## What It Does

Comprehensive evaluation of NVIDIA Cosmos Reason2-8B for real-time video surveillance, establishing baseline capabilities and prompting guidelines.

## Input

- 24 test images (640p real room footage)
- 3 video clips (motion + scene scanning)
- Structured benchmark prompts with ground truth
- Cosmos Reason2-8B via vLLM on RunPod (L4 GPU)

## Output

- Per-capability scoring (1-5 scale)
- Prompting guidelines (when to use reasoning mode, when to skip)
- Latency/cost analysis
- Recommended deployment configuration

## Key Results

| Capability | Score | Notes |
|---|---|---|
| Scene description | 4/5 | Detailed, accurate room descriptions |
| Person detection | 4/5 | Best WITHOUT reasoning mode (reasoning causes false positives) |
| Relative positioning | 4/5 | "Person near desk", "left side of frame" |
| Video motion | 3.5/5 | Tracks movement across frames |
| Change detection | 2/5 | Weakest capability |

## Critical Finding

**Cosmos reasoning mode causes false positives for person detection.** The model "over-thinks" and hallucinates people. Skip `<think>` tags for detection tasks, use them only for complex scene analysis.

## Architecture

```
Camera frame (640p) -> Cosmos Reason2-8B (vLLM) -> Structured scene description
                                                      |
                                                      v
                                              Claude (optional brain)
                                              for higher-level reasoning
```

- Latency: ~2.8s per frame
- Cost: $0 (self-hosted on RunPod, ~$0.80/hr for L4)
- Context: 8192 tokens optimal

## Prompting Guidelines Discovered

1. Place media BEFORE text in prompts
2. Use explicit structured output format ("Answer: yes/no")
3. For detection: skip reasoning, use direct mode
4. For scene analysis: enable reasoning for richer descriptions
5. Keep prompts concise, avoid open-ended questions
6. Specify exactly what to look for

## How It's Used in SRAS

- Feeds into situation assessor node for risk analysis
- Powers person detection in surveillance pipeline
- Guidelines used across all Cosmos-integrated modules
- Bridge script streams dashboard video to Cosmos for real-time analysis

## Key Files

- `modules/cosmos-reasoning-benchmark/scripts/run_benchmarks_v3.py`
- `modules/cosmos-reasoning-benchmark/docs/FINAL_REPORT.md`
- `modules/cosmos-reasoning-benchmark/docs/BENCHMARKS_V3_8192.md`
- `docs/COSMOS_PROMPT_GUIDE.md`

# Module 1: Cosmos Reason2 Benchmark & Prompting Guidelines

## What It Does

Systematic evaluation of NVIDIA Cosmos Reason2 (2B and 8B) across 93 tests for real-time video surveillance. Establishes capability baselines, discovers prompting best practices, and defines the optimal architecture for production deployment.

## Test Setup

- **Models:** Cosmos Reason2-2B (L4 GPU) and 8B (L40S GPU)
- **Test data:** 24 images (640p real room footage) + 3 video clips
- **Total tests:** 93 across 4 benchmark runs (V1-V4)
- **Context windows tested:** 4096, 8192, 32768
- **Deployment:** vLLM on RunPod, OpenAI-compatible API
- **All prompts + ground truth:** `tests/inputs/prompts/benchmark_prompts.json`
- **Raw results:** `tests/results/benchmark_v3_raw.json` (45 tests), `v3_retest_raw.json` (48 tests), `benchmark_v4_raw.json` (45 tests)

---

## Capability Ratings (Final)

### Strengths (4-5 stars)

| Capability | Rating | Evidence |
|---|---|---|
| **Time to first token** | 5/5 | 181-224ms across all input types |
| **Scene description** | 4/5 | Identifies 10-15 objects per frame, accurate materials/colors |
| **Person detection** | 4/5 | 5/5 WITHOUT reasoning; reasoning causes false positives |
| **Relative positioning** | 4/5 | 4/4 correct on LEFT/RIGHT/BEHIND tests |
| **Throughput** | 4/5 | 60-63 tok/s stable |
| **Cause-effect reasoning** | 4/5 | Sound physics (e.g., "open door in snowstorm = temp drops via convection") |

### Weaknesses (1-2.5 stars)

| Capability | Rating | Problem |
|---|---|---|
| **Counting** | 2.5/5 | Simple objects OK (balloons 4/4), complex scenes inconsistent |
| **Change detection** | 2/5 | Targeted prompts partially work; general prompts hallucinate |
| **Room dimensions** | 1.5/5 | ~40% error (estimates 3.6m vs actual 7m) |
| **Distance estimation** | 1.5/5 | Close objects ~7% error, far objects 72-79% error |
| **Security door state** | 1/5 | Says "closed" when door visibly open (security framing bias) |
| **Motion from frames** | 1/5 | Cannot detect from sequential images, must use video |
| **Person tracking** | 1/5 | No cross-frame memory |

---

## Key Test Results (Selected)

### Person Detection (5-frame test)

| Frame | Ground Truth | Without Reasoning | With Reasoning |
|---|---|---|---|
| f0 | No person | No | No |
| f1 | No person | **No** | **Yes (FALSE POSITIVE)** |
| f2 | No person | No | No |
| f3 | Person present | **Yes** | **Yes** |
| f4 | No person | **No** | **Yes (FALSE POSITIVE)** |
| **Accuracy** | | **5/5 (100%)** | **3/5 (60%)** |

**This is the single most important finding: disable reasoning for person detection.**

When a person IS detected, the description is rich:
> "Man with short dark hair, beard, dark green shirt with white polka dots, navy pants. Standing, leaning against wall."

### Motion Detection

- **From sequential frames:** 1/5 -- says "no movement" when roller is clearly moving
- **From video clip:** 3.5/5 -- correctly identifies "foam roller rolling from foreground toward right, continuous"
- **Takeaway:** Always use video, never frames, for motion detection

### Change Detection (Before/After Image Pairs)

| Test | What Changed | Model Output | Score |
|---|---|---|---|
| Mug added to table | Orange mug | "Red mug on table" (wrong color, right object) | 2/5 |
| Roses moved left-to-right | Position changed | "Moved from table to sofa" (wrong destination) | 1.5/5 |
| Roller removed from bin | Blue roller gone | "Foam roller removed from green container" | 2.5/5 |

**Change detection works with targeted prompts ("What object was added?") but fails with general prompts ("What changed?").**

### Latency & Throughput

| Input Type | Latency | TTFT | Throughput |
|---|---|---|---|
| Single frame | 2.8-3.1s | 181ms | 62 tok/s |
| 3 frames | 4.9s | 185ms | 60 tok/s |
| Video (3s) | 2.7s | 224ms | 63 tok/s |

### 2D Grounding (Bounding Boxes)

- **Single object:** 4/5 -- reliable bounding boxes for person, door, roses
- **Multi-object:** 2-3/5 -- truncates at high token counts (>6 objects)
- **Empty room (no objects):** 5/5 -- correctly returns empty set

---

## Reasoning Mode (`<think>` Tags): When to Use

### How to Trigger

Include format instruction in user prompt (NVIDIA method):
```
Your question here.

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag.
```

Deploy with: `--reasoning-parser qwen3` on vLLM

### When Reasoning HELPS

| Task | Without | With | Delta |
|---|---|---|---|
| Change detection | 1 star | 2 stars | +1 |
| Security sequences | 1 star | 2 stars | +1 |
| Relative positioning | Loop at 4096 | 3 stars | Fixed |
| Lighting analysis | 1 star | 2 stars | +1 |

### When Reasoning HURTS

| Task | Without | With | Problem |
|---|---|---|---|
| **Person detection** | **5/5** | **3/5** | **False positives -- CRITICAL** |
| Counting (balloons) | 4/4 | 3/4 | Overthinks |
| Distance/dimensions | Baseline | Infinite loop | Never converges |
| Simple yes/no | Fast | Wastes tokens | Unnecessary |

### Token Budget by Task Complexity

| Complexity | Thinking Tokens | Total Budget |
|---|---|---|
| Simple (person, door) | 200-400 | 600 |
| Medium (change, inventory) | 400-800 | 1000-1200 |
| Complex (layout, multi-object) | 800-1200 | 1500-2000 |

---

## Prompting Rules Discovered

1. **Media BEFORE text** in content array (matches NVIDIA training data order)
2. **System prompt:** `"You are a helpful assistant."` (simple works best)
3. **Disable reasoning for detection tasks** -- direct mode gives higher accuracy
4. **Use targeted prompts** for change detection ("What object was added?" not "What changed?")
5. **Prefer frames over video** for analysis (better accuracy, predictable token usage)
6. **Use video only for motion detection** (frames cannot detect motion)
7. **Deploy with `--max-model-len 8192` minimum** (fixes reasoning loops from 4096)
8. **Keep JSON output under 500 tokens** (model can't self-close long JSON)
9. **Specify exactly what to look for** -- open-ended prompts produce hallucinations

### Sampling Parameters

| Mode | Temperature | Top-p | Presence Penalty |
|---|---|---|---|
| Without reasoning | 0.7 | 0.8 | 1.5 |
| With reasoning | 0.6 | 0.95 | 0.0 |

---

## Cosmos 2B vs 8B Comparison

| Aspect | 2B | 8B |
|---|---|---|
| Throughput | 60-63 tok/s | ~30 tok/s |
| Latency | 2.8-3.1s | 12+ s |
| Completion stability | 75.56% | 86.67% |
| Mean ground truth score | 0.516 | 0.6523 |
| Pass rate | 40% | 55% |
| Context window | 8192 | 32768 |

**8B is better quality but 4x slower. Use 2B for real-time, 8B for quality.**

---

## Recommended Production Architecture

```
Camera (30fps)
    |
    v (sample every 2s)
+---------------------+
|  Cosmos 2B (GPU)    |  2.8s/frame, $0/day (self-hosted)
|  - Scene description|
|  - Person: yes/no   |
|  - Motion detection  |
+---------+-----------+
          | JSON metadata
          v (buffer 15 frames = 30s window)
+---------------------+
|  Claude Opus 4.5    |  Every 30s, ~$60/day
|  - Threat assessment|
|  - Change tracking  |
|  - Decision: alert? |
+---------+-----------+
          |
          v
    Alert System / Dashboard
```

### Cost Comparison

| Architecture | Cost/day | Quality |
|---|---|---|
| Claude on every frame (2s intervals) | ~$2,500 | 5/5 |
| **Cosmos + Claude hybrid** | **~$60** | **4/5** |
| Cosmos only | $0 | 3/5 |

**97.6% cost savings at ~80% of standalone Claude quality.**

---

## Production Readiness Matrix

| Status | Capabilities |
|---|---|
| **Ready now** | Scene description, person detection (no reasoning), video motion, streaming TTFT, relative positioning |
| **With constraints** | Change detection (targeted prompts only), security alerts (with reasoning), 2D grounding (single objects) |
| **Not ready** | Counting (>4 objects), room dimensions, distance estimation, multi-frame tracking, door state in security framing |

---

## Frames vs Video

| Aspect | Frames | Video |
|---|---|---|
| Scene analysis | 100% success | 100% success |
| Change analysis | 100% success | 33% success |
| Error rate | 0% | 44% |
| Token footprint | ~760 tok/frame | ~4100 tok/2s |
| **Recommendation** | **Use for everything except motion** | **Use only for motion detection** |

---

## Top 10 Insights for Presentation

1. **Cosmos is a visual preprocessor, not a decision engine** -- pair with Claude for reasoning
2. **Reasoning mode is a double-edged sword** -- helps change detection (+1 star), destroys person detection (-2 stars)
3. **Person detection: 5/5 WITHOUT reasoning, 3/5 WITH** -- the most actionable finding
4. **TTFT is 181ms** -- real-time streaming is viable
5. **Frames beat video** for analysis quality (100% vs 33% on change detection)
6. **97.6% cost savings** with Cosmos+Claude hybrid vs Claude-only
7. **8192 context fixes reasoning loops** that plagued 4096 deployments
8. **Media-before-text** is the most impactful prompt ordering rule
9. **Targeted prompts >> general prompts** for change detection
10. **2B for speed, 8B for quality** -- clear tradeoff at 4x latency cost

## Key Files

| File | Content |
|---|---|
| `modules/cosmos-reasoning-benchmark/docs/FINAL_REPORT.md` | Executive summary with all ratings |
| `modules/cosmos-reasoning-benchmark/docs/BENCHMARKS_V3_8192.md` | Detailed per-test results (2B) |
| `modules/cosmos-reasoning-benchmark/docs/BENCHMARKS_V4_32768.md` | 8B model results |
| `modules/cosmos-reasoning-benchmark/docs/CAMERA_BENCHMARK_REPORT.md` | Frame vs video comparison |
| `modules/cosmos-reasoning-benchmark/docs/PROMPT_GUIDE.md` | Prompting rules |
| `modules/cosmos-reasoning-benchmark/scripts/run_benchmarks_v3.py` | Benchmark runner |
| `modules/cosmos-reasoning-benchmark/scripts/evaluate_ground_truth.py` | Ground truth scorer |
| `modules/cosmos-reasoning-benchmark/tests/inputs/prompts/benchmark_prompts.json` | All prompts + ground truth |
| `modules/cosmos-reasoning-benchmark/tests/results/benchmark_v3_raw.json` | Raw results (45 tests) |
| `docs/COSMOS_PROMPT_GUIDE.md` | NVIDIA official prompting rules |

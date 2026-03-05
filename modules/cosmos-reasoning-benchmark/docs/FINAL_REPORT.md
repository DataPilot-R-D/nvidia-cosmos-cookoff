# Cosmos Reason2-2B — Final Benchmark Report

**Model:** NVIDIA Cosmos Reason2-2B (Qwen3-VL-2B-Instruct base)
**Date:** 2026-02-16
**Tests:** 60 across 13 categories (B1-B13)
**Hardware:** AWS EC2, NVIDIA L4 24GB, vLLM 0.15.1
**Context:** 8192 tokens
**Deploy:** `--max-model-len 8192 --reasoning-parser qwen3 --gpu-memory-utilization 0.95`
**Test data:** Real room footage from SRAS surveillance prototype (1080p video, 640p frames)

---

## TL;DR

Cosmos 2B is a **fast, cheap visual spotter** — excellent at scene description, motion detection, and person detection, but weak at counting, measurements, and change tracking. It does not replace Claude — it **complements it** as a first-line visual pre-processor every 2 seconds at $0/day.

---

## Capability Ratings

Ratings are cross-referenced from two independent test runs (48 and 45 tests) at 8192 context. Where results differ, the best reproducible result determines the rating with a variance note.

### Strengths

| Capability | Rating | Evidence |
|-----------|:------:|---------|
| **TTFT (streaming)** | 5/5 | 181-224ms to first token across single frame, multi-frame, and video |
| **Scene description** | 4/5 | Rich, accurate captions — 10-15 objects identified per frame, correct materials and colors |
| **Person detection** | 4/5 | 5/5 without reasoning. With reasoning: 3/5 (false positives on f1, f4). **Always run without reasoning.** |
| **Relative positioning** | 4/5 | 4/4 correct — table LEFT of sofa, window BEHIND sofa, mug LEFT of vase, markers CLOSER than vase |
| **Throughput** | 4/5 | 60-63 tok/s stable across all test types |
| **Latency** | 4/5 | 2.8-3.1s single frame, 4.9s multi-frame, 2.7s video clip |
| **Video motion** | 3.5/5 | Correct direction (left-to-right), speed (slow/moderate), and object ID from video clips |
| **2D Grounding (B13)** | 3.5/5 | Bounding boxes for person, door, roses, furniture. JSON valid 9/11 tests. Single objects reliable, multi-object truncates |
| **Activity recognition** | 3/5 | "Standing, leaning, looking around intently" — clean labels, correct posture description |
| **State detection (door)** | 3/5 | Correctly identifies open terrace door + curtain state from single frame without security framing |

### Weaknesses

| Capability | Rating | Problem |
|-----------|:------:|---------|
| **Counting** | 2.5/5 | Balloons 4/4 without reasoning, but chairs 4 (GT: 3), cushions range 4-7 across runs. Inconsistent. |
| **Change detection** | 2/5 | Targeted prompts: mug added (color wrong), roller removed (object ID approximate). General prompts: hallucinates. |
| **Small objects** | 2.5/5 | Finds pens/markers with colors, finds light switch. Objects <5cm invisible. |
| **Security (door frame)** | 1/5 | Says "GREEN, closed" when door is visibly open. Fails without reasoning, inconsistent with reasoning. |
| **Security (sequence)** | 2/5 | Detects perspective shift across 3 frames but misses door state change entirely. |
| **Motion (frames)** | 1/5 | Says "stationary, no movement" for foam roller that clearly moves across 3 sequential frames. Video works, frames don't. |
| **Person tracking** | 1/5 | Cannot track person across frames. Reports "no evidence of anyone" when tracking f0, f2, f4 (person only in f3). |
| **Distance estimation** | 1.5/5 | Close objects OK (sofa 2.8m, GT ~3m), far objects wrong (wall 5.3m, GT ~7m), person 0.84m (GT ~4m). |
| **Room dimensions** | 1.5/5 | Estimates 3.6-4.3m for 7x5m room (~40% error). Improved from V2 (64% error) but still fundamentally limited. |

---

## Reasoning Mode (`<think>` Tags)

The model supports explicit reasoning via format instruction in user prompts. **Reasoning is not always beneficial** — it must be selectively enabled per task.

**How to trigger:** Add to user prompt:
> *"Think step by step. Show reasoning in `<think>...</think>` tags before your answer."*

Combined with `--reasoning-parser qwen3` vLLM flag.

**Trigger rate:** 36/45 tests (80%) when using format instruction + reasoning parser.

| Enable reasoning for | Disable reasoning for |
|---|---|
| Change detection (improves accuracy) | Person detection (causes false positives) |
| Security sequences (detects state changes) | Counting (no benefit, sometimes worse) |
| Cause-effect reasoning | Latency-sensitive queries |
| Complex spatial analysis | Simple yes/no detection |

**What works to trigger reasoning:**
- Format instruction in user prompt
- System prompt "show reasoning in tags"
- `--reasoning-parser qwen3` vLLM flag

**What does NOT work:**
- `\n<think>\n` suffix in user message
- Assistant prefill
- `chat_template_kwargs`

---

## Cosmos 2B vs Claude

| Aspect | Cosmos 2B | Claude Opus 4.5 |
|--------|-----------|-----------------|
| **Cost** | $0/day (self-hosted) | ~$60-2,500/day |
| **Latency** | 1.4-3.1s (TTFT: 181ms) | 3-8s |
| **Scene description** | 4/5 | 5/5 |
| **Counting** | 2.5/5 | 5/5 |
| **Change detection** | 2/5 | 5/5 |
| **Multi-frame reasoning** | 1/5 | 5/5 |
| **Spatial/distance** | 1.5/5 | 4/5 |
| **Person detection** | 4/5 | 5/5 |
| **Privacy** | Self-hosted | API (data leaves network) |

---

## Recommended SRAS Architecture

```
Camera Feed (30fps)
    |
    v (every 2s = 1 frame)
+---------------------+
|  Cosmos 2B (GPU)    |  <- 1.4s/frame, $0/day
|  Scene description  |
|  Person: yes/no     |
|  Motion: dir+speed  |
+---------+-----------+
          | JSON output
          v (buffer 15 descriptions = 30s)
+---------------------+
|  Claude Opus 4.5    |  <- every 30s, ~$60/day
|  Threat assessment  |
|  Change tracking    |
|  Decision: alert?   |
+---------+-----------+
          |
          v
    Alert System
```

| Architecture | Cost/day | Quality |
|-------------|:--------:|:------:|
| Claude on every frame (2s) | ~$2,500 | 5/5 |
| **Cosmos + Claude hybrid** | **~$60** | **4/5** |
| Cosmos only | $0 | 3/5 |

**97.6% cost savings** at ~80% of standalone Claude quality.

---

## Prompting Rules

1. **Media BEFORE text** in content array (NVIDIA training convention)
2. **Targeted prompts** outperform general prompts by 1-2 stars ("Is anyone in this frame?" >> "Describe everything")
3. **Reasoning:** format instruction in user prompt, not suffix
4. **Sampling:** reasoning `temp 0.6, top_p 0.95` / without `temp 0.7, top_p 0.8, penalty 1.5`
5. **max_tokens:** 200-400 without reasoning, 600-1000 with reasoning
6. **Frames > Video** for analysis (3x640p = 2280 tokens, better accuracy than video clip)

---

## Production Readiness

| Production-ready | With constraints | Not ready |
|---|---|---|
| Scene description | Change detection (targeted prompts + reasoning) | Counting (>4 objects) |
| Person detection (no reasoning) | Security alerts (with reasoning) | Room dimensions / distance |
| Video motion detection | 2D Grounding (single objects, <6 items) | Multi-frame tracking |
| Streaming TTFT | JSON output (<500 tokens) | Security door state |
| Relative positioning | Cushion/small object counting | Motion from frames (use video) |

---

## Key Conclusions

1. **Cosmos 2B is a visual pre-processor**, not a standalone decision system
2. **Hybrid Cosmos+Claude architecture** gives optimal cost/quality ratio (97.6% savings)
3. **Prompting matters enormously** — correct prompts give +2 star improvement on person detection
4. **Reasoning is a double-edged sword** — helps change detection, hurts person detection
5. **8192 context eliminates all reasoning loops** that plagued 4096 deployments
6. **2B model has hard limits** — counting, spatial reasoning, and tracking won't improve with prompting alone

**Next steps:** Camera feed pipeline (#4), Agent SDK wrapper (#5), LiDAR fusion for distance (#6).

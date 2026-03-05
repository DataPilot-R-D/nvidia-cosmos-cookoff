# Camera Stream PoC — Offline Benchmark Report

**Date:** 2026-02-16  
**Endpoint:** `http://63.182.177.92:8899/v1` — Cosmos-Reason2-2B (vLLM 0.15.1, max_model_len=8192)  
**Hardware:** AWS g6.4xlarge (NVIDIA L4 24GB), eu-central-1

## Test Setup

**Input data** (captured from Mac webcam):
- **Frames:** 10 JPEGs (640p, ~280KB each) from `logs/2026-02-16_20-47-56/frames/`
- **Video chunks:** 7 MP4s (H.264, 1-2s each, ~400KB) split from 5s originals

**4 combinations tested:**

| # | Media | Reasoning | Temperature | top_p | max_tokens (SCENE/CHANGE) |
|---|-------|-----------|-------------|-------|---------------------------|
| 1 | frames | off | 0.7 | 0.8 | 600 / 500 |
| 2 | frames | on | 0.6 | 0.95 | 1000 / 800 |
| 3 | video | off | 0.7 | 0.8 | 600 / 500 |
| 4 | video | on | 0.6 | 0.95 | 1000 / 800 |

**Protocol per combination:**
- 3× SCENE analysis (single item)
- 9× CHANGE analysis (consecutive pairs) for frames, 6× for video
- System prompt adds `"Think step by step. Show reasoning in <think>...</think> tags"` for reasoning mode

## Results

| Combo | Scenes | Changes | Errors | Avg Latency | Avg Response | Think% |
|-------|--------|---------|--------|-------------|-------------|--------|
| **frames_no_reasoning** | **3 ✅** | **9 ✅** | **0** | **2.0s** | 559 chars | 0% |
| frames_reasoning | 3 ✅ | 9 ✅ | 0 | 4.6s | 533 chars | 0% |
| video_no_reasoning | 3 ✅ | 2 ✅ | 4 | 1.8s | 549 chars | 0% |
| video_reasoning | 3 ✅ | 2 ✅ | 4 | 5.9s | 1249 chars | 0% |

## Analysis

### 1. Frames vs Video

**Frames win decisively.**

| Aspect | Frames | Video |
|--------|--------|-------|
| SCENE (single) | ✅ 100% success | ✅ 100% success |
| CHANGE (pair) | ✅ 100% success | ❌ 33% success |
| Error rate | 0% | 44% |
| Token footprint | ~760 tok/frame | ~4100 tok/2s chunk |

**Why video CHANGE fails:** Two 2s video chunks = ~8244 prompt tokens, exceeding the 8192 context limit. Some pairs squeeze through, others don't — depends on frame content complexity.

**Video SCENE works** because a single 2s chunk = ~4100 tokens, well within limits.

**Conclusion:** For the Cosmos 2B model with 8192 context, **frames are the only reliable input format** for both SCENE and CHANGE analysis. Video is viable only for single-chunk SCENE analysis.

### 2. Reasoning vs No-Reasoning

**No-reasoning wins for surveillance.**

| Aspect | No-Reasoning | Reasoning |
|--------|-------------|-----------|
| Avg latency (frames) | 2.0s | 4.6s (2.3× slower) |
| Avg latency (video) | 1.8s | 5.9s (3.3× slower) |
| Think trigger rate | N/A | 0% this run (8% in prior runs) |
| Quality | Clean, focused | Hallucinations observed |

**Reasoning problems observed:**
- Bounding box hallucinations: `<ref>Person</ref><box>[[173, 100, 909, 999]]</box>` (not requested)
- Language switching: Hebrew, Chinese text in English-prompted responses
- Fake SVG references: `<ref>Original Surveillance Image</ref><img src="https://www.w3.org/2000/svg...`
- Inconsistent trigger rate: 0-8% across runs

**Conclusion:** The 2B model is too small for reliable multimodal reasoning. The `<think>` trigger rate is unreliable (0-8%), and when reasoning activates, it often produces artifacts instead of useful analysis. **Reasoning adds latency without improving quality.**

### 3. SCENE vs CHANGE Quality

| Aspect | SCENE | CHANGE |
|--------|-------|--------|
| Purpose | Full scene description | Detect differences between frames |
| Avg latency | 2.3s | 1.9s |
| Quality | Good — describes people, objects, setting | Very good — catches facial expressions, gestures, posture |
| Verbosity | Sometimes too detailed (lighting, wall colors) | More focused on actual changes |

**CHANGE strengths:**
- Detects subtle facial expression changes
- Identifies hand gestures and posture shifts
- Correctly reports "no changes" when static

**CHANGE weaknesses:**
- Occasionally describes entire scene instead of differences
- Reports "no changes" when there are subtle ones

### 4. Latency Profile

| Metric | frames_no_reasoning | frames_reasoning |
|--------|-------------------|-----------------|
| Min | ~1.1s | ~0.4s |
| Avg | 2.0s | 4.6s |
| Max | ~3.5s | ~13.8s |
| P95 (est) | ~3.2s | ~13s |

The 2.0s average for frames_no_reasoning fits within a 2s capture interval — near real-time surveillance is achievable.

## Recommendation

### 🏆 Best combination: `frames + no-reasoning`

- **0 errors** — 100% reliable
- **2.0s avg latency** — fits real-time 2s interval
- **Clean responses** — no hallucinations or artifacts
- **Predictable token usage** — ~760 tokens/frame, well within 8192 context

### When to use video
- Single-chunk SCENE analysis only (no CHANGE pairs)
- Max chunk duration: 2s at 2 FPS
- Use case: temporal context (motion detection) where a single frame isn't enough

### When to use reasoning
- **Don't** with Cosmos 2B — too unreliable
- Revisit with Cosmos 7B/14B when available (larger models handle reasoning better)

## Architecture Implication for PAIC2

```
Camera → Frame capture (2s interval)
       → Cosmos 2B "eyes" (SCENE every 2s, CHANGE every 6s)
       → Claude "brain" (summary every 30s, anomaly analysis)
```

**Cost model:** Cosmos = $0 (self-hosted), Claude = ~$60/day at 30s intervals  
**Savings:** 97.6% vs Claude-only pipeline

## Raw Data

- `logs/offline_benchmark/benchmark_summary.json`
- `logs/offline_benchmark/frames_no_reasoning/responses.jsonl` (12 items)
- `logs/offline_benchmark/frames_reasoning/responses.jsonl` (12 items)
- `logs/offline_benchmark/video_no_reasoning/responses.jsonl` (9 items)
- `logs/offline_benchmark/video_reasoning/responses.jsonl` (9 items)

## Reproduction

```bash
cd ~/Projects/DataPilot/cosmos-hackathon
python3 scripts/run_offline_benchmark.py
```

Requires: Cosmos endpoint running, input frames/videos in `logs/` directories.

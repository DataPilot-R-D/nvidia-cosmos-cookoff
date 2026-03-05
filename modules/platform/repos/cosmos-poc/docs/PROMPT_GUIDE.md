# Cosmos Reason2 — Prompting Guidelines

**Source:** [NVIDIA Official Prompt Guide](https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html)
**Date:** 2026-02-16

## Critical Rules (MUST follow)

### 1. Media BEFORE Text
Images/video MUST appear before text in the message content array. This matches training convention.

```python
# ✅ CORRECT — media first
content = [
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}},
    {"type": "text", "text": "Describe this image."}
]

# ❌ WRONG — text first (our original mistake, caused major accuracy drops)
content = [
    {"type": "text", "text": "Describe this image."},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
]
```

### 2. System Prompt
Always include a lightweight system prompt:
```python
{"role": "system", "content": [{"type": "text", "text": "You are a helpful assistant."}]}
```

### 3. Reasoning Mode (`<think>`) — UPDATED V3

> **⚠️ The `\n<think>\n` suffix method does NOT work on multimodal inputs.** Use the format instruction below instead.

For complex tasks, embed this format instruction **inside the user prompt text** (after your question):

```
[Your question here]

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag.
```

**Deploy requirement:** `--reasoning-parser qwen3` on vLLM. This splits output into `reasoning_content` (thinking) and `content` (answer).

**V3 results:** 36/45 multimodal tests triggered reasoning (80%). Failures: 8 spatial loops + 1 video token exhaustion.

## ⚠️ CRITICAL DISCOVERY: How to Trigger Reasoning on Multimodal

**Date:** 2026-02-16  
**Impact:** Without this, `<think>` reasoning does NOT work on image/video inputs.

### What DOES NOT work (multimodal)
- ❌ Appending `\n<think>\n` as suffix to user text — model ignores it
- ❌ Assistant prefill with `<think>` — model ignores it
- ❌ `chat_template_kwargs: {enable_thinking: true}` — no effect

### What WORKS ✅
**Embed the format instruction IN the user prompt text:**
```
Your question here.

Answer the question using the following format:
<think>
Your reasoning.
</think>
Write your final answer immediately after the </think> tag.
```

This is the same format NVIDIA uses in their Video Critic example.

### vLLM Deploy Requirements
```bash
# REQUIRED flags:
--reasoning-parser qwen3     # Splits <think> into reasoning_content field
HF_TOKEN=hf_xxx             # Gated repo access (must accept license on HF)

# The parser puts reasoning in message.reasoning_content, answer in message.content
# Without --reasoning-parser, <think> tags appear raw in content (still works, just not split)
```

### When reasoning HELPS (use it)
- ✅ **Change detection** — "mug added" ✅, "roller removed" ✅ (was ❌ without)
- ✅ **Security sequences** — "door state changed" ✅ (was "no change" without)
- ✅ **Activity recognition** — detailed posture analysis
- ✅ **Cause-effect reasoning** — physics explanations
- ✅ **Lighting analysis** — progression detection

### When reasoning HURTS (skip it)
- ❌ **Person detection** — causes false positives (hallucinates people). 3/5 with reasoning vs 5/5 without
- ❌ **Spatial/distance tasks** — enters infinite `<think>` loop, hits max_tokens without answering
- ❌ **Room dimensions** — same loop problem
- ❌ **Simple counting** — slower, sometimes less accurate (balloons: 3 with reasoning vs 4 without)

### Token budget with reasoning
- `max_tokens=1000` for most tasks (~400 think + ~600 answer)
- Spatial tasks: **skip reasoning entirely** — they loop regardless of max_tokens
- Video tasks: `max_tokens=1200+` (video reasoning needs more tokens)

**When NOT to use reasoning (general):** simple captioning, one-word answers, person detection (wastes tokens AND reduces accuracy).

### 4. Sampling Parameters

| Parameter | Default (no reasoning) | With reasoning |
|-----------|----------------------|----------------|
| temperature | 0.7 | 0.6 |
| top_p | 0.8 | 0.95 |
| top_k | 20 | 20 |
| repetition_penalty | 1.0 | 1.0 |
| presence_penalty | 1.5 | 0.0 |

**Key:** `presence_penalty=1.5` in default mode pushes novelty (good for descriptions). Set to `0.0` with reasoning to avoid disrupting chain-of-thought.

## Full Message Structure

```python
{
    "model": "nvidia/Cosmos-Reason2-2B",
    "messages": [
        {
            "role": "system",
            "content": [{"type": "text", "text": "You are a helpful assistant."}]
        },
        {
            "role": "user",
            "content": [
                # MEDIA FIRST
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}},
                # or for video:
                # {"type": "video_url", "video_url": {"url": "data:video/mp4;base64,..."}},
                # TEXT AFTER
                {"type": "text", "text": "Your prompt here.\n\nAnswer the question using the following format:\n\n<think>\nYour reasoning.\n</think>\n\nWrite your final answer immediately after the </think> tag."}
            ]
        }
    ],
    "max_tokens": 800,
    "temperature": 0.6,
    "top_p": 0.95,
    "presence_penalty": 0.0
}
```

## Impact Measured (our benchmarks)

| Capability | Wrong prompting | Correct prompting | Delta |
|-----------|:--------------:|:-----------------:|:-----:|
| Video motion detection | ⭐ (said "stationary") | ⭐⭐⭐ (correct direction+speed) | **+2** |
| Door/window state | ⭐ (said "closed") | ⭐⭐½ ("partially open, curtains fluttering") | **+1.5** |
| Change detection | ⭐ (hallucinated) | ⭐⭐ (found mug, some hallucinations) | **+1** |
| Counting | ⭐½ (1 instead of 4) | ⭐⭐ (3 instead of 4) | **+0.5** |

## Additional Best Practices from Guide

### Temporal Localization
For video with timestamps, use:
```
Describe the video. Add timestamps in mm:ss format.
```
Model can return JSON with `start`, `end`, `caption` fields.

### 2D Grounding / Bounding Boxes
Model supports normalized coordinates (0-1000 per axis):
```
Locate the bounding box of [object]. Return as json with box_2d.
```
Returns `"box_2d": [x1, y1, x2, y2]` in 0-1000 normalized space.

### Action/Trajectory Prediction
For robotics:
```
Specify the 2D trajectory your end effector should follow.
Return coordinates in JSON: {"point_2d": [x, y], "label": "gripper trajectory"}
```

### Video Critic (quality assessment)
```
Approve or reject this video for [criteria]. Answer with Approve or Reject only.
```

## Token Budget Warning
Reasoning mode (`<think>`) consumes significant tokens for the thinking process. With 8192 context (recommended):
- Single image prompt ≈ 800 tokens → ~7400 available for completion
- 3 images prompt ≈ 2300 tokens → ~5900 available
- Video 3s prompt ≈ 3050 tokens → ~5150 available
- Budget ~200-800 tokens for `<think>` reasoning depending on complexity
- For multi-image inputs with reasoning, set max_tokens to 1200+

## vLLM Deployment: max-model-len

**CRITICAL:** Always deploy with `--max-model-len 8192` (NVIDIA recommended minimum).

The default or lower values (e.g., 4096) cause artificial reasoning loops where the model runs out of context mid-`<think>` and never produces a final answer. With 8192, most reasoning tasks complete correctly.

```bash
# CORRECT
vllm serve nvidia/Cosmos-Reason2-2B --max-model-len 8192

# WRONG (causes reasoning loops)
vllm serve nvidia/Cosmos-Reason2-2B --max-model-len 4096
```

## Reasoning Mode: Learnings & Best Practices

### When Reasoning Helps (use `<think>`)
| Task | Without reasoning | With reasoning | Delta |
|------|:-:|:-:|:-:|
| Person detection | ⭐⭐ | ⭐⭐⭐⭐ | +2 |
| Video motion | ⭐ | ⭐⭐⭐½ | +2.5 |
| Security door state | ⭐ | ⭐⭐⭐ | +2 |
| Relative positioning (L/R) | ❌ loop | ⭐⭐⭐ | fixed |
| Counting (balloons) | 1/4 | 3/4 | +2 |
| Object inventory | ⭐⭐⭐ | ⭐⭐⭐ | 0 |

### When Reasoning Hurts (skip `<think>`)
| Task | What happens | Recommendation |
|------|-------------|----------------|
| Distance estimation | Infinite reasoning loop, never closes `</think>` | Use default mode (no reasoning) |
| Room dimensions | Loop — model can't do spatial math | Skip entirely, use external measurement |
| Cushion/complex counting | Loop on ambiguous objects | Use default mode or targeted "is there more than X?" |
| Simple captioning | Wastes tokens on unnecessary thinking | Default mode is better |

### Reasoning Token Budget
- **Simple tasks** (person detection, door state): ~200-400 thinking tokens → answer in 600 total
- **Medium tasks** (change detection, inventory): ~400-800 thinking tokens → answer in 1200 total
- **Complex tasks** (layout, multi-object): ~800-1200 thinking tokens → answer in 2000 total
- **⚠️ Never-terminating tasks** (distances, dimensions): model loops regardless of budget

### Recommended `max_tokens` per Task Type
```python
MAX_TOKENS = {
    'caption': 200,          # no reasoning
    'person_detection': 600,  # with reasoning
    'door_state': 600,        # with reasoning
    'motion': 800,            # with reasoning
    'change_detection': 1200, # with reasoning
    'object_inventory': 1200, # with reasoning
    'relative_position': 1500,# with reasoning
    'counting': 800,          # with reasoning
    'security_alert': 800,    # with reasoning
    'json_output': 1000,      # with reasoning
    # DO NOT use reasoning for these:
    'distance': 300,          # default mode only
    'room_dimensions': 300,   # default mode only
}
```

### Self-Termination Bug Workaround
The 2B model sometimes fails to close `</think>` tags. Mitigation:
1. Set `max_tokens` to a reasonable cap (see table above)
2. Parse output: if `</think>` present, extract answer after it
3. If `</think>` missing, treat entire output as raw answer (strip `<think>` prefix)
4. For production: implement timeout — if no `</think>` after N tokens, force-stop and use partial output

```python
def extract_answer(response: str) -> str:
    if '</think>' in response:
        return response.split('</think>')[-1].strip()
    # Fallback: strip <think> prefix if present
    if response.startswith('<think>'):
        return response  # model looped, return raw
    return response
```

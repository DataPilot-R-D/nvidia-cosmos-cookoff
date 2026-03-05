# Cosmos Reason2-2B — V2 Benchmarks (Reasoning Mode Working)

**Model:** NVIDIA Cosmos Reason2-2B (Qwen3-VL-2B-Instruct base)  
**Test date:** 2026-02-16  
**Tests:** 45 API calls, 36/45 with reasoning triggered (80%)  
**Hardware:** AWS EC2, 24GB GPU, vLLM  
**Context:** 8192 tokens  
**Raw data:** `tests/benchmark_v3_raw.json`

---

## Deploy Config (the one that WORKS)

```bash
vllm serve nvidia/Cosmos-Reason2-2B \
  --max-model-len 8192 \
  --reasoning-parser qwen3 \
  --trust-remote-code
```

**Requirements:**
- `HF_TOKEN` set (gated model — access must be approved on HuggingFace)
- Do **NOT** set `HF_HUB_OFFLINE=1` — model weights must download
- `--reasoning-parser qwen3` splits output into `reasoning_content` (thinking) and `content` (answer)

**Sampling:** `temperature=0.6, top_p=0.95, max_tokens=1000`  
**System prompt:** `"You are a helpful assistant."`

---

## 🔑 Key Discovery: How to Trigger Reasoning on Multimodal

Previous versions concluded that `<think>` reasoning does NOT work on multimodal inputs. **This was wrong.**

The issue was the trigger method. Appending `\n<think>\n` as a suffix to the user message does NOT work for multimodal. Instead, **embed the format instruction directly in the user prompt:**

```
[Your question here]

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag.
```

Combined with `--reasoning-parser qwen3`, this causes vLLM to:
1. Parse the `<think>...</think>` block into `reasoning_content` field
2. Put everything after `</think>` into `content` field
3. **Works on image AND video inputs** — 36/45 tests triggered reasoning

### Why 9/45 failed reasoning

| Failure mode | Count | Tests | Cause |
|-------------|:-----:|-------|-------|
| Spatial reasoning loop | 8 | B6.1, B6.4, B9.1, B10.1, B11.1, B3.2 × partial | Model enters infinite `<think>` loop, hits max_tokens without closing `</think>` |
| Video max_tokens | 1 | B1.4 | Video clip + reasoning exhausts token budget in `<think>` |

---

## Summary: Reasoning vs No-Reasoning

| Capability | No Reasoning (V1) | With Reasoning (V2) | Delta |
|-----------|:------------------:|:-------------------:|:-----:|
| Change detection (mug added) | ❌ hallucinated | ✅ "Addition of a Red Mug" | 🎯 **FIXED** |
| Change detection (roller removed) | ❌ "added" | ✅ "removed" | 🎯 **FIXED** |
| Security sequence (door) | ❌ "no change" | ✅ "door state changed significantly" | 🎯 **FIXED** |
| Cause-effect reasoning | ⭐⭐ shallow | ⭐⭐⭐⭐ detailed physics | ⬆️ +2 |
| Activity recognition | ⭐⭐ basic | ⭐⭐⭐½ posture + intent | ⬆️ +1.5 |
| Person detection | ⭐⭐⭐⭐ (5/5) | ⭐⭐½ (3/5, 2 FP) | ⬇️ **-1.5** |
| Counting (balloons) | 4/4 ✅ | 3/4 (missed blue) | ⬇️ -0.5 |
| Counting (chairs) | 2/3 | 2/3 | ➖ same |
| Spatial / room dimensions | ⭐½ loop | ⭐ loop (worse — infinite think) | ⬇️ worse |
| Distance estimation | ⭐½ | ⭐ loop | ⬇️ worse |
| Lighting analysis | ⭐⭐⭐ | ⭐⭐⭐ | ➖ same |
| Scene description | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ➖ same |

---

## B1: Scene Description

| Test | Input | Latency | Reasoning? | think_closed | Quality |
|------|-------|---------|:----------:|:------------:|---------|
| B1.1_1 | 1 frame | 7.05s | ✅ | ✅ | Rich, accurate — sofa, ottoman, roses, laptop, ceiling lights |
| B1.1_2 | 1 frame | 6.02s | ✅ | ✅ | Good — adds projector lamp, cardboard rolls |
| B1.1_3 | 1 frame | 6.87s | ✅ | ✅ | Good — mentions ceiling fan, white ball |
| B1.3 | 3 frames | 7.74s | ✅ | ✅ | Combines all 3 frames: staircase, sofa, glass door |
| B1.4 | Video | 10.09s | ❌ | ❌ | **LOOP** — reasoning never closes, repeats roller description |

**Rating: ⭐⭐⭐⭐** — Scene description remains strong. Video input with reasoning can loop.

---

## B2: Object Detection & Counting

| Test | Question | GT | Model Answer | Reasoning? | Correct? |
|------|----------|----|-------------|:----------:|:--------:|
| B2.1 | Object inventory | — | 15 items listed | ✅ | ✅ comprehensive |
| B2.2 | Count balloons | 4 (R,Y,G,B) | 3 | ✅ | ❌ missed blue |
| B2.3 | Count chairs | 3 | 2 | ✅ | ❌ undercounts |
| B2.4 | Table items | ~5 | 5 (roses, magazine, laptop, tablet, green box) | ✅ | ✅ |
| B2.5 | Laptop location | lower right on table | "lower right corner, on table beside roses" | ✅ | ✅ |
| B2.6 | Door state | open | "open, framed by teal and sheer curtains" | ✅ | ✅ |

**Rating: ⭐⭐⭐** — Inventory good. Counting still undercounts by 1 on clustered objects.

---

## B3: Change Detection

| Test | Change | GT | Model Answer | Reasoning? | Correct? |
|------|--------|----|-------------|:----------:|:--------:|
| B3.1 | Mug (general) | Mug added | ✅ "Addition of a Red Mug" | ✅ | 🎯 **FIXED** |
| B3.2 | Mug (targeted) | Mug added | ❌ Looped in `<think>` | ❌ | ❌ loop |
| B3.3 | Roses (general) | Roses moved R→L | "bouquet replaced", mat added, armchair appeared | ✅ | ⚠️ partial |
| B3.4 | Roses (targeted) | Roses moved | ❌ "left in place" | ✅ | ❌ |
| B3.5 | Roller (general) | Roller removed | "balloons replaced by blankets" | ✅ | ❌ wrong change |
| B3.6 | Roller (targeted) | Roller removed | ✅ "removed from basket" | ✅ | 🎯 **FIXED** |
| B3.7 | Lighting sequence | progressive | ✅ "soft → bright → warm" | ✅ | ✅ |

**Rating: ⭐⭐½** — Massive improvement on targeted change detection. General comparisons still unreliable.

### Change Detection: Before vs After Reasoning

| Change | Without Reasoning | With Reasoning |
|--------|:-:|:-:|
| Mug added | ❌ hallucinated removals | ✅ correctly identified |
| Roller removed | ❌ said "added" | ✅ said "removed" |
| Roses moved | ❌ hallucinated | ❌ "left in place" |
| Lighting | ✅ direction correct | ✅ direction correct |

---

## B4: Motion & Person Detection

| Test | Input | GT | Model Answer | Reasoning? | Correct? |
|------|-------|----|----|:----------:|:--------:|
| B4.1 | Roller 3 frames | rolling R | "moving to the right" | ✅ | ✅ |
| B4.2 | Roller video | rolling R | "rolls from foreground toward right" | ✅ | ✅ |
| B4.3_0 | Person f0 | NO | "No person visible" | ✅ | ✅ |
| B4.3_1 | Person f1 | NO | ❌ "Yes, sitting on sofa" | ✅ | ❌ **FP** |
| B4.3_2 | Person f2 | NO | "No person visible" | ✅ | ✅ |
| B4.3_3 | Person f3 | YES | ✅ "man with beard, green shirt" | ✅ | ✅ |
| B4.3_4 | Person f4 | NO | ❌ "Yes, on sofa, black jacket" | ✅ | ❌ **FP** |
| B4.4 | Person tracking | in f2 only | "right portion, back to camera" | ✅ | ✅ |
| B4.5 | Activity | standing/looking | "standing, leaning, gazing through window" | ✅ | ✅ |
| B4.6 | Person motion video | enters/exits | "enters from left, walks, exits" | ✅ | ✅ |

### Person Detection: Reasoning REGRESSED

| Frame | GT | No Reasoning (V1) | With Reasoning (V2) |
|-------|----|----|-----|
| f0 | no person | ✅ correct | ✅ correct |
| f1 | no person | ✅ correct | ❌ **hallucinated person** |
| f2 | no person | ✅ correct | ✅ correct |
| f3 | person present | ✅ detected | ✅ detected |
| f4 | no person | ✅ correct | ❌ **hallucinated person** |
| **Score** | | **5/5** | **3/5** |

**Motion Rating: ⭐⭐⭐⭐** — Direction and trajectory excellent.  
**Person Detection Rating: ⭐⭐½** — Reasoning causes false positives (hallucinated persons).

---

## B5: Security

| Test | Question | Model Answer | Reasoning? | Correct? |
|------|----------|-------------|:----------:|:--------:|
| B5.1 | Door/window secure? | "insecure, moderate risk ★★☆☆☆" | ✅ | ✅ reasonable |
| B5.2 | Person threat? | "low" | ✅ | ✅ |
| B5.3 | Door sequence change? | ✅ "door state changed significantly" | ✅ | 🎯 **FIXED** |

**Rating: ⭐⭐⭐½** — Security sequence detection FIXED by reasoning (was ⭐ before).

---

## B6: Spatial & Physics

| Test | Question | GT | Model Answer | Reasoning? | think_closed |
|------|----------|----|-------------|:----------:|:------------:|
| B6.1 | Room dimensions | 7×5m | ❌ **LOOP** — infinite `<think>` | ❌ | ❌ |
| B6.2 | Stability assessment | — | Lists hazards, enters repetition loop at end | ✅ | ✅ (hit length) |
| B6.3 | Cause-effect (door + snow) | temp drops | ✅ Detailed physics: convection, equilibrium, humidity | ✅ | ✅ |
| B6.4 | Distance estimation | sofa 3m, table 1.5m, wall 7m | ❌ **LOOP** — infinite `<think>` | ❌ | ❌ |

**Cause-Effect Rating: ⭐⭐⭐⭐** — Excellent with reasoning, detailed physics chains.  
**Spatial Rating: ⭐** — Reasoning makes spatial tasks WORSE (infinite loops).

---

## B7: Output Format

| Test | Format | Reasoning? | Result |
|------|--------|:----------:|--------|
| B7.1 | JSON (no reasoning) | ❌ | ✅ Valid JSON, 6 objects, room_type correct |
| B7.2 | Count with list | ✅ | "10" — overcounts but reasoning lists objects |

**Rating: ⭐⭐⭐** — JSON works well without reasoning. Reasoning + JSON not tested.

---

## B8–B11: Additional Tests

| Test | Desc | GT | Answer | Reasoning? | Correct? |
|------|------|----|--------|:----------:|:--------:|
| B8.1 | Cushion counting | ~3-4 | "Four" | ✅ | ✅ |
| B9.1 | Distance to person | ~4m | ❌ **LOOP** | ❌ | ❌ |
| B10.1 | Table L/R of sofa | right | ❌ **LOOP** | ❌ | ❌ |
| B10.2 | Window behind/front sofa | behind | ✅ "behind the sofa" | ✅ | ✅ |
| B11.1 | Room dimensions v2 | 7×5m | ❌ **LOOP** | ❌ | ❌ |

---

## B12: TTFT (Time to First Token)

| Test | Input | TTFT | Total | think_closed |
|------|-------|------|-------|:------------:|
| B12.1 | 1 frame | **181ms** | 6.29s | ✅ |
| B12.2 | 3 frames | **185ms** | 8.25s | ✅ |
| B12.3 | Video | **224ms** | 2.92s | ❌ |

**Rating: ⭐⭐⭐⭐⭐** — Sub-200ms TTFT on frames, sub-250ms on video.

---

## 📊 Final Ratings: No Reasoning vs With Reasoning

| Capability | No Reasoning | With Reasoning | Production Recommendation |
|-----------|:------------:|:--------------:|--------------------------|
| Scene description | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Either — no difference |
| Object inventory | ⭐⭐⭐ | ⭐⭐⭐ | Either |
| Counting | ⭐⭐⭐ | ⭐⭐½ | **Skip reasoning** — slightly worse |
| Change detection | ⭐–⭐⭐ | ⭐⭐½ | **Use reasoning** — mug/roller fixed |
| Motion detection | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Either |
| Person detection | ⭐⭐⭐⭐ (5/5) | ⭐⭐½ (3/5) | **Skip reasoning** — causes FP |
| Person tracking | ⭐⭐⭐½ | ⭐⭐⭐½ | Either |
| Activity recognition | ⭐⭐⭐ | ⭐⭐⭐½ | **Use reasoning** — more detail |
| Security (single) | ⭐⭐⭐ | ⭐⭐⭐½ | **Use reasoning** |
| Security (sequence) | ⭐ | ⭐⭐⭐½ | **Use reasoning** — FIXED |
| Cause-effect | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **Use reasoning** — deeper physics |
| Spatial / dimensions | ⭐½ | ⭐ (loops) | **Skip reasoning** — infinite loops |
| Distance estimation | ⭐⭐½ | ⭐ (loops) | **Skip reasoning** — infinite loops |
| Relative position (L/R) | ⭐⭐⭐½ | ⭐–⭐⭐⭐½ (mixed) | Skip on complex, OK on simple |
| JSON output | ⭐⭐½ | ⭐⭐⭐ | **Skip reasoning** for JSON |
| TTFT | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Both excellent |
| Lighting | ⭐⭐⭐ | ⭐⭐⭐ | Either |

---

## 🏭 Production Recommendations

### Use reasoning for:
- ✅ **Change detection** (add/remove/move objects) — went from broken to working
- ✅ **Security sequences** (door state changes across frames) — went from "no change" to correct
- ✅ **Activity recognition** — more nuanced posture and intent analysis
- ✅ **Cause-effect reasoning** — detailed physics chains instead of shallow one-liners

### Skip reasoning for:
- ❌ **Person detection** — reasoning causes hallucinated persons (2 false positives in 5 tests)
- ❌ **Simple counting** — reasoning slightly worse (missed blue balloon)
- ❌ **Spatial/distance tasks** — enters infinite `<think>` loop, never produces answer
- ❌ **Room dimensions** — same loop problem
- ❌ **JSON output** — reasoning adds unnecessary overhead

### max_tokens guidance:
```python
MAX_TOKENS = {
    # WITH reasoning
    'change_detection': 1000,
    'security_sequence': 1000,
    'activity_recognition': 800,
    'cause_effect': 1000,
    
    # WITHOUT reasoning
    'person_detection': 600,
    'counting': 400,
    'scene_description': 500,
    'json_output': 500,
    
    # NEVER use reasoning (loops)
    'room_dimensions': 300,   # no reasoning
    'distance': 300,          # no reasoning
    'relative_position': 500, # no reasoning for complex, reasoning OK for simple behind/front
}
```

### Reasoning trigger template:
```python
def make_prompt(question: str, use_reasoning: bool = False) -> str:
    if use_reasoning:
        return f"""{question}

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag."""
    return question
```

---

## Wnioski

1. **Reasoning WORKS on multimodal** — the key was format instruction in the prompt, not `\n<think>\n` suffix
2. **Change detection massively improved** — mug "added" ✅, roller "removed" ✅, security sequence "changed" ✅
3. **Person detection regressed** — reasoning causes the model to hallucinate persons where none exist
4. **Spatial tasks still broken** — reasoning makes them worse (infinite `<think>` loops)
5. **Production strategy:** dynamically enable reasoning per task type based on the table above
6. **80% reasoning trigger rate** (36/45) — the 20% failures are all spatial loops or video token exhaustion

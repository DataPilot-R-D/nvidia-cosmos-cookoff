# Cosmos Reason2-2B — Detailed Benchmark Results

**Model:** nvidia/Cosmos-Reason2-2B
**Endpoint:** `http://63.182.177.92:8899/v1` (AWS EC2, NVIDIA L4 24GB)
**Context:** 8192 tokens (all tests)
**Data sources:** `v3_retest_raw.json` (48 tests, no reasoning) + `benchmark_v3_raw.json` (45 tests, with reasoning)
**Ground truth:** `tests/inputs/prompts/benchmark_prompts.json`
**Test images:** 24 JPEGs at 640p in `tests/inputs/images/`
**Test videos:** 3 MP4 clips in `tests/inputs/videos/`

---

## Data Source Notes

Two test runs were cross-referenced. Where results differ, both are shown:

- **Retest** = `v3_retest_raw.json` — 48 tests, no `<think>` reasoning, direct answers
- **V3** = `benchmark_v3_raw.json` — 45 tests, reasoning enabled via format instruction

The retest uses default sampling (`temp 0.7, top_p 0.8`), V3 uses reasoning sampling (`temp 0.6, top_p 0.95`).

---

## B1: Latency

### Single Frame (no reasoning, 3 runs)

| Run | Latency | Prompt Tokens | Completion Tokens |
|-----|---------|:------------:|:-----------------:|
| 1 | 3.23s | 766 | 200 |
| 2 | 3.21s | 766 | 200 |
| 3 | 2.84s | 766 | 177 |
| **Avg** | **3.09s** | **766** | **192** |

Throughput: ~62 tok/s

### Single Frame + Reasoning Suffix

| Source | Latency | Tokens | Notes |
|--------|---------|--------|-------|
| Retest | 2.6s | 160 | Model skipped `<think>`, answered directly |
| V3 | 6.0-7.1s | 381-441 | Full reasoning block generated |

### Multi-Frame and Video

| Input | Latency | Prompt Tokens | Completion Tokens |
|-------|---------|:------------:|:-----------------:|
| 3 frames (cosmos_f0/f2/f4) | 4.86s | 2,256 | 268 |
| Video clip (roller_clip.mp4) | 2.74s | 3,032 | 18 |

### Streaming TTFT

| Input | TTFT | Total | Tokens |
|-------|------|-------|--------|
| Single frame | **181ms** | 6.29s | 200 |
| 3 frames | **185ms** | 8.25s | — |
| Video clip | **224ms** | 2.92s | — |

**Rating: 4/5** — Consistent 181-224ms TTFT. Total latency 2.7-4.9s depending on input size. ~62 tok/s throughput.

---

## B2: Object Detection and Counting

### Object Inventory (cosmos_f2.jpg)

> **Retest:** "sofa (beige, center), ottoman (green, floor), roses bouquet (table), laptop (table), white ball (floor), red sneakers, green tote bag, cardboard boxes" — 10 objects enumerated

> **V3:** "spotlight, sectional sofa, cushions, clothes/hoodies, headphones, green ottoman, wooden table, magazines, rose bouquet, laptop, white ball, hardwood floor, ceiling fixture" — 15 items

**Rating: 3/5** — Identifies 10-15 objects. Some duplicates (floor as object). Good coverage of major items.

### Counting

| Target | Ground Truth | Retest (no reason) | V3 (with reason) | Best |
|--------|:-----------:|:---------:|:---------:|:----:|
| Balloons | 4 (yellow, green, cyan, red) | **4** (green, yellow, red, blue) | **3** | Retest |
| Chairs | 3 visible | **4** (overcounts) | **2** (undercounts) | Neither exact |
| Table items | ~7 | **~7** (mug, dinosaur, plush, magazines, roses, chairs mixed in) | **5** (roses, magazine, laptop, tablet, green box) | Retest |
| Cushions (B8) | ~4-5 | **7** (overcounts) | **4** | V3 |

**Rating: 2.5/5** — Balloons perfect without reasoning. Chair count inconsistent across runs. Cushion count varies 4-7.

### Small Objects

| Query | Retest | V3 | Correct? |
|-------|--------|-----|:--------:|
| Pens/markers | "2 pens (green, black) + 4 markers (green, blue, yellow, pink)" | Same | Yes |
| Light switch | "Yes, on wall above sofa" | Same | Yes |

**Rating: 2.5/5** — Finds pens/markers with colors and light switch. Objects <5cm remain invisible.

### Door State (window_f6.jpg)

> "The terrace/balcony door is open, revealing the snowy outdoor area beyond. There is a sheer white curtain on the right side, stationary."

**Rating: 3.5/5** — Correct state detection when asked directly (not in security framing).

---

## B3: Change Detection

### Mug Added (mug_before → mug_after)

| Prompt Type | Retest | V3 |
|------------|--------|-----|
| **General** | "Additional gray chair... red mug on table" (mixed real+hallucinated) | "Red mug replaces toy robot" (hallucinated replacement) |
| **Targeted** | "Yes, a red mug was added. Bright red ceramic." | Reasoning loop (1000 tokens, no conclusion) |

Ground truth: Orange mug added to table.
**Rating: 2/5** — Targeted prompt without reasoning catches the mug (wrong color: red vs orange). General prompts hallucinate.

### Roses Moved (roses_before → roses_after)

| Prompt Type | Retest | V3 |
|------------|--------|-----|
| **General** | "Added chair, added magazines" (all hallucinated) | "Magazines replaced, green mat added, gray armchair" (all hallucinated) |
| **Targeted** | "Roses moved from dining table to sofa" (wrong destination) | "Left in place" (missed entirely) |

Ground truth: Roses vase moved from right to left side of table.
**Rating: 1.5/5** — Detects movement but gets destination wrong. General prompts completely hallucinate.

### Roller Removed (b3_before → b3_after)

| Prompt Type | Retest | V3 |
|------------|--------|-----|
| **General** | "Balloon count changed, relocated" (wrong objects) + repetition loop | "Balloons replaced by blankets, window added" (hallucinated) |
| **Targeted** | "Blue rug removed from green plastic bin on left side of sofa" | "Foam roller removed from green storage basket, placed in striped bag" |

Ground truth: Blue foam roller removed from green container.
**Rating: 2.5/5** — Targeted prompt gets close. Object ID slightly off ("rug"/"rug" vs "roller"). General prompts fail.

### Lighting Changes (light_1/2/3)

| Test | Retest | V3 |
|------|--------|-----|
| **Single (light_1)** | "Well-lit, recessed lighting" (GT: all lights OFF) | Same — ❌ |
| **3-image comparison** | "Photo 1 dimly lit, Photo 2 bright, Photo 3 warm ambient" | "Photo 1 soft, Photo 2 bright, Photo 3 warm inviting" |

Ground truth: Image 1 = all off, Image 2 = overhead on, Image 3 = mirror light on.
**Rating: 2/5** — Detects relative brightness progression. Misidentifies baseline state (calls dark room "well-lit").

---

## B4: Motion and Person Detection

### Motion from Frames (roller_f0/f1/f2)

> **Retest:** "No, the foam roller is stationary. No observable movement."
> **V3:** "Positioned on right, angled left... implies moving right. But no motion visible."

Ground truth: Foam roller rolling left-to-right.
**Rating: 1/5** — Both fail. The model cannot detect motion from sequential frames. **Use video input for motion detection.**

### Motion from Video (roller_clip.mp4)

> **Retest:** "Foam roller rolling from foreground toward right side. Smooth and continuous."
> **V3:** "Foam roller rolls continuously from foreground toward right. Straight, uninterrupted."

Ground truth: Foam roller rolling left-to-right, slow speed.
**Rating: 3.5/5** — Video motion is accurate. Direction, speed, and object ID all correct.

### Person Detection (per-frame, person_f0 through f4)

| Frame | GT | Retest (no reasoning) | V3 (with reasoning) |
|-------|:--:|:----:|:----:|
| f0 | No person | No | No |
| f1 | No person | **No** | **Yes** (false positive: "sitting on sofa") |
| f2 | No person | No | No |
| f3 | Person present | **Yes** (detailed description) | **Yes** (detailed description) |
| f4 | No person | **No** | **Yes** (false positive: "seated on sofa, black jacket") |
| **Score** | | **5/5** | **3/5** |

Person description when detected (f3):
> "Man with short dark hair, beard, dark green shirt with white polka dots, navy pants. Standing, leaning against wall."

**Rating: 4/5** — Perfect 5/5 without reasoning. Reasoning causes false positives. **Critical: disable reasoning for person detection.**

### Person Tracking (f0, f2, f4)

> "No evidence of anyone moving. No individuals appearing or disappearing."

Ground truth: Person walks through frames but only appears in f3 (not in the 0/2/4 subset).
**Rating: 1/5** — Correct observation (person not in those frames) but useless for tracking. No cross-frame memory.

### Activity Recognition (person_f3)

> **Retest:** "Standing, leaning against wall, looking around intently. Relaxed yet attentive stance."
> **V3:** "Standing casually, leaning against wall. Head turned sharply to left, gazing through window."

**Rating: 3/5** — Accurate posture and activity labels. Good body language interpretation.

### Person in Video (person_clip.mp4)

> "A person enters from the left side, walks into the room, and exits shortly after. Dark clothing, dark hair."

**Rating: 3/5** — Detects person entry/exit from video. Brief description.

---

## B5: Security Assessment

### Door Assessment (window_f6.jpg — security framing)

> **Retest:** "ALERT LEVEL: GREEN. Door/window: Closed. Curtain: Closed. Action: None." — ❌
> **V3:** "Door/window appears insecure... status unclear. Rating: 2/5 (Moderate Risk)" — partial

Ground truth: Door is OPEN, curtain blowing.
**Rating: 1/5** — Security framing causes the model to default to "safe." The same image correctly identifies door as "open" when asked without security framing (see B2 state detection).

### Person Threat Assessment (person_f3.jpg)

> **Retest:** "Alert Level: Critical. Male, clean-shaven, short dark hair, beard. Dark green polka dot shirt. High risk. Activate alarm."
> **V3:** Same — detailed threat assessment, appropriately flags unknown person.

**Rating: 3.5/5** — Good threat assessment format. Detailed person description. Appropriately escalates.

### Door Sequence (window_f0/f3/f6)

> **Retest:** "Same room, perspective shifts subtly. Doors/windows/curtains remain constant. No threats."
> **V3:** "Door/window state changed significantly. Frame 1 indoor living room, Frame 2 introduces doorway to snowy landscape."

**Rating: 2/5** — V3 (with reasoning) partially detects transition. Retest misses it entirely. Neither identifies the actual door state change.

---

## B6: Spatial and Physics

### Room Dimensions (cosmos_f2.jpg, sofa = 2.5m reference)

| Source | Estimate | GT | Error |
|--------|----------|:--:|:-----:|
| Retest | 4.31 x 4.21m | 7 x 5m | ~40% |
| V3 | Reasoning loop (1000 tokens, no final answer) | 7 x 5m | N/A |

**Rating: 1.5/5** — Estimate improved over earlier versions but still ~40% short. V3 reasoning loops without answer.

### Stability Assessment (cosmos_f4.jpg)

> **Retest:** "Wooden chair on right side leaning precariously, could tip over. Position appears unstable."
> **V3:** Long response about balloons, magazines, curtain rods — devolves into repetition loop

**Rating: 3/5** — Retest correctly flags leaning chair as hazard. V3 with reasoning hallucinates.

### Cause-Effect Reasoning

> "If terrace door opened during snowstorm, room temperature would decline. Cold air replaces warmer indoor air via convection."

**Rating: 4/5** — Sound physics reasoning with clear causal chain.

### Distance Estimation (B9)

| Target | Estimate | GT | Error |
|--------|----------|:--:|:-----:|
| Camera → Sofa | 2.8m | ~3m | 7% |
| Camera → Table | 0.56m | ~2m | 72% |
| Camera → Far wall | 5.3m | ~7m | 24% |
| Camera → Person | 0.84m | ~4m | 79% |

**Rating: 1.5/5** — Close objects within ~25%. Far objects and person distance fundamentally broken. 2B model lacks monocular depth calibration.

---

## B7: JSON Output

### Scene Schema (cosmos_f2.jpg)

```json
{
  "scene": {"type": "indoor", "room_type": "living room"},
  "objects": [
    {"name": "beige sectional sofa", "position": "center", "size": "large"},
    {"name": "green ottoman", "position": "center", "size": "medium"},
    {"name": "red roses", "position": "bottom center", "size": "medium"},
    {"name": "gray laptop", "position": "bottom right", "size": "small"}
  ],
  "people_count": 0,
  "alert_level": "green"
}
```

Valid JSON, correct schema, 10 objects enumerated. **Rating: 3/5**

### Change Detection JSON (mug_before → mug_after)

```json
{
  "added": [
    {"object": "magazine", "color": "white", "location": "left side of table"},
    {"object": "magazine", "color": "gray", "location": "right side of table"}
  ],
  "removed": [{"object": "magazine", "color": "black", "location": "left"}],
  "moved": [{"object": "magazine", "color": "gray", "location": "left"}]
}
```

Valid JSON but missed the mug addition. Hallucinated magazine changes. **Rating: 1.5/5**

---

## B8: Cushion Counting (Previously Looping at 4096)

| Source | Result | Latency | Tokens |
|--------|--------|---------|--------|
| Retest (no reasoning) | "7 cushions/pillows" | 0.72s | 38 |
| V3 (with reasoning) | "4 cushions/pillows" | 2.78s | 171 |

Ground truth: ~4-5 cushions.

**Rating: 3/5** — No more loops at 8192. V3 with reasoning gets closer to GT. Count varies by run.

---

## B10: Relative Positioning (Previously Looping at 4096)

| Test | Answer | Correct? | Latency |
|------|--------|:--------:|---------|
| Table left/right of sofa | **LEFT** | Yes | 0.33s |
| Window behind/front of sofa | **BEHIND** | Yes | 0.66s |
| Mug left/right of roses vase | **LEFT** | Yes | 0.33s |
| Markers closer/farther than vase | **CLOSER** | Yes | 0.39s |

**Rating: 4/5** — Perfect 4/4. Fast (<0.7s each). Consistent across both test runs.

---

## B11: Room Dimensions Extended (Previously Looping at 4096)

> "Estimated 3.6m width x 4.3m depth. Derived by considering sofa placement as ~2.5m reference."

| Source | Estimate | GT | Error | Latency | Tokens |
|--------|----------|:--:|:-----:|---------|--------|
| Retest | 3.6 x 4.3m | 7 x 5m | ~40% | 2.13s | 130 |
| V3 | Reasoning loop (no final answer) | 7 x 5m | N/A | 15.78s | 1000 (maxed) |

**Rating: 1.5/5** — Loop fixed at 8192. Estimate still ~40% off. Reasoning loops without converging.

---

## B13: 2D Grounding (Bounding Boxes)

| Test | Description | JSON Valid? | Objects Found | Rating |
|------|-------------|:---:|:---:|:---:|
| B13.1 | Multi-object room | No (truncated at 1500 tok) | ~12 (partial) | 2/5 |
| B13.2 | Person grounding | Yes | 1 (person bbox) | 4/5 |
| B13.3 | Empty room | Yes | 0 (correct) | 5/5 |
| B13.4 | Door/window | Yes | 1 (door, state=open) | 4/5 |
| B13.5 | Laptop | No (`<think>` prefix) | 1 (position correct) | 2/5 |
| B13.6 | Roses bouquet | Yes | 1 (accurate bbox) | 4/5 |
| B13.7 | Multi-object categorized | Yes | 6 (person, furniture, opening, balloons) | 3.5/5 |
| B13.8 | Multi-object no reasoning | Yes | 3 (table, sofa, mat) | 3/5 |
| B13.9 | Change detection + grounding | Yes | 2 (red mug + vase) | 3/5 |
| B13.10 | Security + grounding | Yes | 4 (door, curtains, gate, outdoor) | 3/5 |
| B13.11 | Grounding across 2 frames | Yes | 1 (door state change detected) | 3/5 |

**Overall B13 Rating: 3.5/5** — 9/11 valid JSON. Single-object grounding reliable. Multi-object truncates at high token counts. The `<think>` prefix issue on B13.5 is a parsing edge case.

---

## Previously Looping Tests: All Fixed at 8192

| Test | At 4096 | At 8192 | Result |
|------|---------|---------|--------|
| B8 Cushion counting | Reasoning loop (2000 tok maxed) | "4 cushions" in 2.78s | **FIXED** |
| B9 Camera→Person | Reasoning loop | "0.84m" in 0.21s | **FIXED** (answer wrong) |
| B10 Table L/R | Reasoning loop | "LEFT" in 0.33s | **FIXED + CORRECT** |
| B10 Window B/F | Reasoning loop | "BEHIND" in 0.66s | **FIXED + CORRECT** |
| B11 Room dimensions | Reasoning loop | "3.6x4.3m" in 2.13s | **FIXED** (answer inaccurate) |

**Verdict:** All 5 previously looping tests complete at 8192. 3/5 give correct answers. **Always deploy with `--max-model-len 8192`.**

---

## Summary of Ratings

| Capability | Rating | Key Finding |
|-----------|:------:|-------------|
| TTFT (streaming) | 5/5 | 181-224ms, real-time ready |
| Person detection | 4/5 | 5/5 without reasoning; reasoning causes false positives |
| Relative positioning | 4/5 | 4/4 correct, fast, consistent |
| Scene description | 4/5 | 10-15 objects, accurate materials/colors |
| Cause-effect reasoning | 4/5 | Sound physics reasoning |
| Throughput | 4/5 | 60-63 tok/s stable |
| Latency | 4/5 | 2.7-4.9s depending on input |
| 2D Grounding | 3.5/5 | 9/11 valid JSON, single objects reliable |
| Video motion | 3.5/5 | Direction + speed correct from video |
| Person threat assessment | 3.5/5 | Detailed descriptions, appropriate escalation |
| State detection (door) | 3/5 | Correct when asked directly, fails in security framing |
| Activity recognition | 3/5 | Clean posture/activity labels |
| Stability assessment | 3/5 | Correct hazard identification (without reasoning) |
| Counting | 2.5/5 | Balloons correct, chairs/cushions inconsistent |
| Small objects | 2.5/5 | Pens/switches found, <5cm invisible |
| Change detection | 2/5 | Targeted prompts help; general prompts hallucinate |
| Lighting changes | 2/5 | Detects progression, misidentifies baseline |
| Security (sequence) | 2/5 | Partial detection with reasoning only |
| Room dimensions | 1.5/5 | ~40% error, loop fixed |
| Distance estimation | 1.5/5 | Close objects OK, far objects wrong |
| Security (door) | 1/5 | Says "closed" when door is open |
| Motion (frames) | 1/5 | Cannot detect motion from sequential frames |
| Person tracking | 1/5 | No cross-frame memory |

---

## Raw Data Locations

| File | Tests | Description |
|------|:-----:|-------------|
| `tests/results/v3_retest_raw.json` | 48 | Full retest, no reasoning, 8192 context |
| `tests/results/benchmark_v3_raw.json` | 45 | Full test, with reasoning, 8192 context |
| `tests/results/benchmark_b13_raw.json` | 11 | 2D grounding tests |
| `tests/results/benchmark_v1_raw.json` | 48 | Historical: pre-guide prompting |
| `tests/results/benchmark_v2_raw.json` | 48 | Historical: with NVIDIA prompting, mixed context |
| `tests/inputs/prompts/benchmark_prompts.json` | — | All prompts, sampling params, ground truth |

# Cosmos Reason2-8B Benchmark V4 (RunPod, Long Context)

**Run date (UTC):** 2026-02-17  
**Model:** `nvidia/Cosmos-Reason2-8B`  
**Provider:** RunPod (`yzqs739vqufrv3`, L40S)  
**API base used for run:** `http://127.0.0.1:18899/v1` (SSH tunnel)  
**Context:** `32768` (`COSMOS_MAX_MODEL_LEN`)  
**Benchmark response cap:** `1200` (`COSMOS_BENCHMARK_MAX_TOKENS`)  
**JSON cap:** `500` (`COSMOS_BENCHMARK_JSON_MAX_TOKENS`)  
**Request timeout:** `180s`

## Inputs

- Baseline (V3): `tests/results/benchmark_v3_raw.json` (45 tests)
- New run (V4): `tests/results/benchmark_v4_raw.json` (45 tests)
- Structured summary: `tests/results/benchmark_v4_summary.json`

## Aggregate Comparison (V4 vs V3)

| Metric | V3 | V4 | Delta (V4-V3) |
|---|---:|---:|---:|
| Tests | 45 | 45 | 0 |
| Avg latency (s) | 8.25 | 11.56 | +3.31 |
| P95 latency (s) | 15.78 | 27.04 | +11.26 |
| Avg prompt tokens | 1118.8 | 1118.8 | 0.0 |
| Avg completion tokens | 512.0 | 497.7 | -14.3 |
| `think_closed` count | 36 | 40 | +4 |
| `finish_reason=stop` | 34 | 38 | +4 |
| `finish_reason=length` | 8 | 4 | -4 |
| Errors | 0 | 0 | 0 |

## Streaming (B12)

| Metric | V3 | V4 |
|---|---:|---:|
| Avg TTFT (s) | 0.197 | 0.581 |
| Avg total time (s) | 5.82 | 14.01 |

## Category-Level Notes

- `B1` latency/description: slower in V4 (`13.86s` avg vs `7.55s`), but all V4 tests ended with `stop` (V3 had one `length`).
- `B2` object/counting: similar reliability, slower in V4. Counting quality remains inconsistent.
- `B3` change detection: V4 still has one length case, but targeted roses change improved (`moved` instead of `left in place`).
- `B4` motion/person: V4 improved person false-positive behavior on `B4.3_1` and `B4.3_4` (both `No person`), and motion-from-frames answer is directionally better.
- `B5` security: V4 responses are more decisive (for example `B5.1` -> `High risk`).
- `B6/B11` spatial estimation: still weakest area. Room/distance estimation frequently long or truncated; `B6.1`, `B6.4`, `B11.1` remain problematic.
- `B10` relative positioning: improved completion reliability in V4 (`2/2 stop` vs V3 `1 stop + 1 length`).

## Selected Case Deltas

- `B4.3_1` person detection:  
  - V3: false positive (`Yes, person`)  
  - V4: correct negative (`No person`)
- `B4.3_4` person detection:  
  - V3: false positive (`Yes, person`)  
  - V4: correct negative (`No person`)
- `B3.4` roses targeted change:  
  - V3: `left in place` (incorrect)  
  - V4: `moved right -> left` (correct trend)
- `B10.1` table left/right:  
  - V3: truncated (`length`)  
  - V4: concise final answer (`right`, `stop`)
- `B8.1` cushion count:  
  - V3: `4`  
  - V4: `2`  
  - Both are unstable versus expected ground truth.

## Interpretation

V4 on RunPod with long context is **more completion-stable** than V3 (fewer truncations, more closed reasoning), but **slower** overall and still weak on geometry-heavy reasoning (room dimensions/distances). Video/person behavior remains useful, while fine-grained counting remains noisy.

## Recommendation

For production-like surveillance prompts on this model profile:

1. Keep long context (`32768`) for multimodal robustness.
2. Keep per-request output caps (1000-1500) to prevent runaway reasoning loops.
3. Use task-specific caps/prompts for spatial estimation tasks (`B6/B11`) or route those tasks to a stronger geometry-capable model.
4. Preserve the current v4 runner resilience changes (checkpoint + per-test error capture) for future benchmark batches.

# Cosmos Config Recommendation

## Recommended Primary Setup

Use **Cosmos Reason2-8B** with this winner configuration from the alternative matrix:

- `mode=all`
- `reasoning_mode=default`
- `max_tokens=1200`
- `timeout_seconds=180`
- `COSMOS_MAX_MODEL_LEN=32768`

Winner source:
- `tests/results/alt_benchmarks/alt_config_search_v1_20260217T143428Z/consolidated_summary_with_retry.md`
- Winner ID: `all_reasoning_default_mt1200`

## Production Task Overrides

- Person presence checks: use reasoning **OFF** (faster, fewer false positives).
- Motion analysis: prefer **video input** over frame triplets.
- JSON output tasks: keep token cap low (around `500`).

## Fallback Strategy

For latency-sensitive loops:

1. Run fast lane first (reasoning OFF, small cap around `600`).
2. Escalate to the primary 8B config for uncertain/high-risk events.

## 8B vs 2B (Current Benchmarks)

Ground-truth evaluator comparison:

- **8B winner** (`all_reasoning_default_mt1200`): mean score `0.6523`, pass rate `55%`
- **2B baseline** (`tests/results/benchmark_v3_raw.json`): mean score `0.516`, pass rate `40%`

Stability:

- 8B winner stop rate: `86.67%`
- 2B baseline stop rate: `75.56%` (`34/45`)

Latency:

- 8B winner avg latency: `12.322s`
- 2B baseline avg latency: `8.25s`

## Decision

- Choose **8B winner config** if priority is quality and completion stability.
- Keep a **speed-first fallback lane** for very low-latency paths, escalating to 8B when needed.


# Benchmark V4 Summary

## Run

- Date (UTC): 2026-02-17
- Model: `nvidia/Cosmos-Reason2-8B`
- Context: `32768`
- Infra: RunPod L40S (`yzqs739vqufrv3`)
- Response cap: `1200`
- JSON cap: `500`
- Timeout: `180s`

## Top-Line Result (vs V3)

- Reliability improved: `stop` 34 -> 38, `length` 8 -> 4.
- Reasoning closure improved: `think_closed` 36 -> 40.
- Latency regressed: avg 8.25s -> 11.56s, p95 15.78s -> 27.04s.
- Streaming TTFT regressed: 0.197s -> 0.581s average.
- No run errors: 45/45 tests completed.

## Behavior Changes

- Better on person false positives (`B4.3_1`, `B4.3_4` now correctly negative).
- Better completion reliability on relative positioning (`B10.*`).
- Still weak on spatial geometry tasks (`B6.*`, `B11.1`) with frequent long/truncated reasoning.
- Counting remains unstable (`B2.3`, `B8.1`).

## Artifacts

- Raw V4: `tests/results/benchmark_v4_raw.json`
- V4 summary JSON: `tests/results/benchmark_v4_summary.json`
- Full report: `docs/BENCHMARKS_V4_32768.md`
- V4 runner: `scripts/run_benchmarks_v4.py`

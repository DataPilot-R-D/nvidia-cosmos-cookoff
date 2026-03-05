# Alternative Benchmark Matrix (Consolidated)

- Primary run: `tests/results/alt_benchmarks/alt_config_search_v1_20260217T143428Z`
- Retry run: `tests/results/alt_benchmarks/alt_config_failed_retry_20260217T145443Z`

| Config | Scored/Eligible | Mean Score | Pass Rate | Stop Rate | Avg Latency (s) |
|---|---:|---:|---:|---:|---:|
| all_reasoning_default_mt1200 | 20/24 | 0.6523 | 0.55 | 0.8667 | 12.322 |
| all_reasoning_off_mt600 | 20/24 | 0.4711 | 0.3 | 0.9333 | 2.171 |
| all_reasoning_on_mt1800 | 20/24 | 0.555 | 0.35 | 0.8889 | 13.347 |
| frames_reasoning_off_mt600 | 19/24 | 0.4538 | 0.2632 | 0.8444 | 2.301 |
| frames_reasoning_on_mt1200 | 19/24 | 0.4507 | 0.3158 | 0.7111 | 12.829 |
| videos_reasoning_on_mt1200 | 1/24 | 1.0 | 1.0 | 0.0667 | 10.867 |

## Full Suite Winner

- Config: `all_reasoning_default_mt1200`
- Score: `0.6523` (pass_rate `0.55`)
- Coverage: `20/24`
- Stop rate: `0.8667`
- Avg latency: `12.322`

## Frames-Only Winner

- Config: `frames_reasoning_off_mt600`
- Score: `0.4538` (pass_rate `0.2632`)
- Coverage: `19/24`
- Stop rate: `0.8444`
- Avg latency: `2.301`

## Videos-Only Winner

- Config: `videos_reasoning_on_mt1200`
- Score: `1.0` (pass_rate `1.0`)
- Coverage: `1/24`
- Stop rate: `0.0667`
- Avg latency: `10.867`


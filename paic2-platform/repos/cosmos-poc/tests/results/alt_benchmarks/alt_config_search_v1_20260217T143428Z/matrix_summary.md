# Alternative Benchmark Matrix Summary

- Run ID: `20260217T143428Z`
- Generated (UTC): `2026-02-17T14:53:58+00:00`
- Matrix: `alt_config_search_v1`
- Parallel workers: `2`

| Config | Mode | Reasoning | Max Tokens | Mean Score | Pass Rate | Stop Rate | Avg Latency (s) |
|---|---|---|---:|---:|---:|---:|---:|
| all_reasoning_default_mt1200 | all | default | 1200 | 0.6523 | 0.55 | 0.8667 | 12.322 |
| all_reasoning_off_mt600 | all | off | 600 | 0.4711 | 0.3 | 0.9333 | 2.171 |
| all_reasoning_on_mt1800 | all | on | 1800 | 0.555 | 0.35 | 0.8889 | 13.347 |
| frames_reasoning_off_mt600 | frames | off | 600 | n/a | n/a | n/a | n/a |
| frames_reasoning_on_mt1200 | frames | on | 1200 | n/a | n/a | n/a | n/a |
| videos_reasoning_on_mt1200 | videos | on | 1200 | n/a | n/a | n/a | n/a |

## Winner

- Config: `all_reasoning_default_mt1200`
- Mean score: `0.6523`
- Pass rate: `0.55`
- Stop rate: `0.8667`
- Avg latency: `12.322`

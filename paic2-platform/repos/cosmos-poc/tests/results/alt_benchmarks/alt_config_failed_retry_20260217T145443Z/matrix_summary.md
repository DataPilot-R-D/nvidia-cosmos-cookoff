# Alternative Benchmark Matrix Summary

- Run ID: `20260217T145443Z`
- Generated (UTC): `2026-02-17T15:03:30+00:00`
- Matrix: `alt_config_failed_retry`
- Parallel workers: `2`

| Config | Mode | Reasoning | Max Tokens | Mean Score | Pass Rate | Stop Rate | Avg Latency (s) |
|---|---|---|---:|---:|---:|---:|---:|
| frames_reasoning_off_mt600 | frames | off | 600 | 0.4538 | 0.2632 | 0.8444 | 2.301 |
| frames_reasoning_on_mt1200 | frames | on | 1200 | 0.4507 | 0.3158 | 0.7111 | 12.829 |
| videos_reasoning_on_mt1200 | videos | on | 1200 | 1.0 | 1.0 | 0.0667 | 10.867 |

## Winner

- Config: `videos_reasoning_on_mt1200`
- Mean score: `1.0`
- Pass rate: `1.0`
- Stop rate: `0.0667`
- Avg latency: `10.867`

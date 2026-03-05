# Benchmark Test Inputs

All test media and prompts used in benchmarking. Keep this directory stable — future model comparisons (e.g., Cosmos-Reason2-7B, 14B) should reuse the same inputs.

## Images

| File | Source | Description | Ground Truth |
|------|--------|-------------|-------------|
| `cosmos_f0.jpg` | Room scan @0s | Hallway/stairs area, 640p | — |
| `cosmos_f2.jpg` | Room scan @2s | Room center, sofa + table, 640p | Room 7×5m |
| `cosmos_f4.jpg` | Room scan @4s | Wide view, window + stool, 640p | Door CLOSED, balloons NO helium |
| `person_f0.jpg` | Person video @0s | Empty room (person not yet in frame) | No person |
| `person_f1.jpg` | Person video @1.9s | Person entering from left | Person visible (dark green shirt, navy pants) |
| `person_f2.jpg` | Person video @3.9s | Person near window | Person visible |
| `person_f3.jpg` | Person video @5.8s | Person turning around | Person visible (most prominent) |
| `person_f4.jpg` | Person video @7.8s | Person exited frame | No person |
| `roller_f0.jpg` | Roller video @0s | Foam roller left side of floor | Blue textured foam roller |
| `roller_f1.jpg` | Roller video @1s | Roller moving right | Rolling left→right |
| `roller_f2.jpg` | Roller video @2s | Roller right side of floor | Speed: slow/medium |
| `mug_before.jpg` | Table photo 1 | Dining table, no mug | — |
| `mug_after.jpg` | Table photo 2 | Dining table + orange mug added | Orange mug, center-left of table |
| `roses_before.jpg` | Table photo 1 | Roses vase on RIGHT side of table | — |
| `roses_after.jpg` | Table photo 2 | Roses vase on LEFT side of table | Moved right→left |
| `b3_before.jpg` | Sofa photo 1 | Green container with foam roller | Dark blue foam roller present |
| `b3_after.jpg` | Sofa photo 2 | Green container without roller | Foam roller removed |
| `light_1.jpg` | Bathroom | All lights OFF | Dark |
| `light_2.jpg` | Bathroom | Overhead ceiling light ON | Bright, cool |
| `light_3.jpg` | Bathroom | Small mirror light ON | Warm, moderate |
| `window_f0.jpg` | Door video @0s | Room with closed door | Door closed |
| `window_f3.jpg` | Door video @3s | Mid-pan (wall) | — |
| `window_f6.jpg` | Door video @6s | Open terrace door + blowing curtain | Door OPEN, curtain blowing |

## Videos

| File | Duration | Description | Ground Truth |
|------|----------|-------------|-------------|
| `roller_clip.mp4` | 3s, 320p | Foam roller rolling left→right | Blue roller, slow speed |
| `cosmos_clip.mp4` | 3s, 320p | Room scan trimmed clip | — |

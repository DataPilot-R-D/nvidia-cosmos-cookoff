# PAIC2 Risk Register

Last reviewed: 2026-02-26.

This register tracks high-impact architecture and dependency risks discovered in current repositories.

| ID | Risk | Impact | Current signal | Recommended action |
|---|---|---|---|---|
| R-001 | Planner/executor contracts use JSON in `std_msgs/String` | schema drift, runtime parsing failures | no typed ROS interfaces repo yet | define typed interfaces and migration plan |
| R-002 | `sras_ros2_bringup` underdeclared `package.xml` dependencies | fragile builds and hidden runtime coupling | launch uses many external packages not declared | add full dependency declarations |
| R-003 | `sras_ros2_dimos_bridge` underdeclared runtime deps | node startup failures by backend/mode | node imports exceed manifest declarations | declare optional/required dependencies explicitly |
| R-004 | Dashboard event surface is broad with drift risk | UI/server behavioral mismatch | numerous event names across client/server | publish strict event matrix and validation tests |
| R-005 | ROS bridge Python app has scaffolded TODO sections | incomplete robot-side behavior in some flows | comments/TODOs in ros-bridge implementation | either complete or clearly downgrade scope in docs |
| R-006 | Bringup uses hardcoded paths and default local key-like values | portability and security concerns | defaults include absolute map/nav2 paths and local VLM key placeholder | move to environment/parameterized profiles |
| R-007 | Cosmos + RunPod operational chain depends on external tool stability | intermittent inference outages | pod/tunnel/API races documented in scripts/docs | add robust readiness probes and retry/backoff standards |
| R-008 | Simulation requires tightly coupled Isaac/Orbit/env assets | reproducibility issues | mixed version notes and external asset dependencies | pin versions and provide reproducible bootstrap script |
| R-009 | Some runtime host packages historically outside git control | drift between documented and deployed state | prior server snapshots included non-git packages | enforce repo-backed deployment only |
| R-010 | Streaming path falls back to JPEG/WebSocket under config drift | operator latency and FPS degradation | go2rtc/firewall mismatches observed | make go2rtc path first-class with health validation |

## Tracking policy

- Every risk needs an owner domain and next milestone.
- Close risk only when both implementation and docs are aligned.
- Re-evaluate register at each lock-based release milestone.

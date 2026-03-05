# PAIC2 Repository Boundaries and Ownership

Last verified: 2026-02-26.

This document defines what each repository owns and where cross-repo contracts must be controlled.

## Boundary table

| Repo path | Owns | Must not own |
|---|---|---|
| `repos/dashboard` | web UI, websocket server, REST APIs, dashboard-side schemas | planner/executor decision logic |
| `repos/planner` | incident-to-task planning, dedupe/priority/gating, planner state | direct robot motion execution |
| `repos/executor` | task queue/state transitions, Nav2 action dispatch, execution status | upstream incident scoring logic |
| `repos/bringup` | launch orchestration, Nav2/SLAM/bridge wiring, map and sensor pipeline glue | business workflows in dashboard |
| `repos/dimos-bridge` | memory/VLM nodes, localization and memory services | dashboard transport protocol design |
| `repos/cosmos-poc` | benchmark harness, model evaluation, optional bridge experiments | production planner/executor contract ownership |
| `repos/go2-omniverse` | Isaac/Orbit simulation, simulated ROS streams and controls | production deployment orchestration |

## Contract ownership

- ROS planner/executor JSON contracts:
- primary owner: `repos/planner`
- co-owner: `repos/executor`
- Dashboard Socket.IO and REST contracts:
- primary owner: `repos/dashboard`
- cross-check owner: `repos/bringup` for runtime integration compatibility
- Memory node query/result contracts:
- primary owner: `repos/dimos-bridge`

## Rules for cross-repo changes

1. Any contract change requires doc update in `docs/contracts/contracts-index.md`.
2. Any behavior that spans multiple repos requires a lock bump PR in `paic2-platform`.
3. No hidden contract changes inside implementation-only PRs.

## Workspace governance hooks

- Version pinning and release alignment:
- `workspace/lock.yaml`
- Ownership map:
- `workspace/owners.yaml`
- Promotion process:
- `docs/runbooks/promotion-flow.md`

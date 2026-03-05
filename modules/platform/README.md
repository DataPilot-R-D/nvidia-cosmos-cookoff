# PAIC2 Platform Control Repository

Canonical source of truth for PAIC2 workspace alignment, architecture contracts, and promotion workflow.

## Source of truth rules

- Control branch: `main`
- Version lock: `workspace/lock.yaml`
- Deployable state: only a lock revision in this repository
- Promotion rule: child repo changes are not releasable until lock bump is merged here

## Managed repositories

- `repos/dashboard` -> `DataPilot-R-D/Dashboard_Robotics`
- `repos/planner` -> `DataPilot-R-D/sras_ros2_robot_task_planner`
- `repos/executor` -> `DataPilot-R-D/sras_ros2_robot_task_executor`
- `repos/bringup` -> `DataPilot-R-D/sras_ros2_bringup`
- `repos/dimos-bridge` -> `DataPilot-R-D/sras_ros2_dimos_bridge`
- `repos/cosmos-poc` -> `DataPilot-R-D/cosmos-hackathon`
- `repos/go2-omniverse` -> `DataPilot-R-D/go2_omniverse`

## Quick start

```bash
cd paic2-platform
./workspace/bootstrap.sh
```

## Documentation

- Start here: `docs/README.md`
- Architecture: `docs/architecture/system-overview.md`
- Runtime topology: `docs/architecture/runtime-topology.md`
- Repo boundaries: `docs/architecture/repository-boundaries.md`
- Contracts: `docs/contracts/contracts-index.md`
- Workspace alignment: `docs/runbooks/workspace-alignment.md`
- Promotion: `docs/runbooks/promotion-flow.md`
- Deployment and ops: `docs/runbooks/deployment-and-ops.md`
- Risk register: `docs/runbooks/risk-register.md`

## Layout

- `workspace/` lock + automation scripts
- `docs/` canonical technical and operational documentation
- `ops/` runtime conventions (systemd and env)
- `.github/workflows/` governance checks

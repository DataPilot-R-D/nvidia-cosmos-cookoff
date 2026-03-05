# sras_ros2_robot_task_planner

ROS 2 package implementing Reasoning Layer issue #43:

- https://github.com/DataPilot-R-D/cosmos-hackathon/issues/43

## What is implemented

- `robot_task_planner_node` with:
- Event ingestion from JSON topics:
  - `/reasoning/blindspot_events`
  - `/reasoning/risk_assessments`
- Executor feedback ingestion:
  - `/robot/task_status`
- Map readiness gate:
  - `/map` (`nav_msgs/msg/OccupancyGrid`)
- Task request publishing:
  - `/reasoning/task_requests`
- Dashboard notifications publishing:
  - `/ui/dashboard_notifications`
- Planner state diagnostics publishing:
  - `~/planner_state`
- HITL command handling (JSON fallback transport):
  - `/ui/set_task_state` (`std_msgs/String`) with `approve|cancel|pause|resume`
- Stats service:
  - `~/get_stats` (`std_srvs/srv/Trigger`)

- Deterministic planner core:
  - incident dedup
  - priority scoring (`severity`, `confidence`, `recency`, `asset_criticality`)
  - task template expansion (`INSPECT_BLINDSPOT`, `INSPECT_POI`, fallback)
  - approval gating via `auto_approve_max_severity`

- Optional deep planning path:
  - `langgraph_enabled` route gate
  - bounded deep verify/re-entry via `max_reentries`
  - Cosmos HTTP adapter with timeout/retry
  - deterministic fallback + warning alerts on deep failure

- Optional SQLite planner journal:
  - event/task/transition/alert append-only records
  - asynchronous, best-effort persistence (non-blocking for planner loop)
  - planner journal telemetry is enqueue-level (`journal_writes` / `journal_failures`)
  - enabled via `planner_journal_enabled`
  - DB path via `planner_journal_path` (default `data/planner_journal.db`)

## Config

Default config:

- `config/robot_task_planner.yaml`

Launch with config arg:

```bash
ros2 launch sras_robot_task_planner robot_task_planner.launch.py
```

or

```bash
ros2 launch sras_robot_task_planner robot_task_planner.launch.py config:=/path/to/robot_task_planner.yaml
```

## Build

```bash
source /opt/ros/humble/setup.bash
colcon build --packages-select sras_robot_task_planner
source install/setup.bash
```

## Run

```bash
ros2 run sras_robot_task_planner robot_task_planner_node
```

## JSON fallback contracts

Because typed `warehouse_security_msgs` contracts are not finalized yet, command/event transport is implemented with `std_msgs/String` JSON envelopes.

Example blindspot event:

```json
{
  "incident_key": "incident-42",
  "event_type": "blindspot",
  "severity": "high",
  "confidence": 0.78,
  "asset_criticality": 0.8,
  "has_signal_conflict": false,
  "source": "vision",
  "details": {
    "poi_id": "aisle-3-corner"
  }
}
```

Example operator command:

```json
{
  "task_id": "task-abc123",
  "command": "approve"
}
```

## Tests (TDD)

Unit tests cover core planner logic (no ROS dependency):

```bash
python -m pytest -q
```

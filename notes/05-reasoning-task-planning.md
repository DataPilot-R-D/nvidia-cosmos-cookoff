# Module 3: Reasoning for Task Planning (Multi-Robot)

## What It Does

Converts security events (blind spots, anomalies, risk assessments) into actionable robot tasks. Supports multi-robot coordination with priority scoring and human-over-the-loop approval.

## Input

- `/reasoning/blindspot_events` - CCTV coverage loss events
- `/reasoning/risk_assessments` - risk analysis from Cosmos
- `/robot/task_status` - execution feedback
- `/map` - navigation occupancy grid
- Operator commands via `/ui/set_task_state`

## Output

- `/reasoning/task_requests` - robot tasks with goal + priority
- `/ui/dashboard_notifications` - alerts to operator

## How Cosmos Is Used for Planning

### Priority Scoring

```
Event arrives (e.g. blind spot detected)
  -> Score priority based on:
     - severity (0-1)
     - confidence (0-1)
     - recency (time decay)
     - asset_criticality (importance of area)
  -> If score > auto_approve_threshold (0.55): dispatch immediately
  -> If score < threshold: escalate to operator with recommendation
```

### Optional Deep Planning (LangGraph + Cosmos)

When enabled, complex scenarios get Cosmos-assisted reasoning:
- "Should we send robot A or robot B?"
- "Is this a real threat or a false alarm?"
- "What's the best inspection angle?"

## Multi-Robot Decision Making

### Fleet Configuration

```yaml
robots:
  robot0:
    capabilities: [patrol, inspect, assess]
    home_position: [0.0, 0.0]
  robot1:
    capabilities: [patrol, inspect]
    home_position: [5.0, 3.0]
```

### Assignment Logic

1. Filter robots by required capability
2. Score by proximity to target
3. Score by current load (fair distribution)
4. Cosmos can override with reasoning (optional)

## Task Types

| Type | Trigger | Robot Action |
|---|---|---|
| INSPECT_BLINDSPOT | CCTV coverage loss | Navigate to affected area, assess scene |
| INSPECT_POI | Anomaly detected | Navigate to point of interest |
| PATROL_ROUTE | Scheduled/triggered | Follow waypoint sequence |
| REPOSITION | Strategic | Move to better vantage point |

## Human-Over-The-Loop Flow

```
Event detected
  -> Planner scores priority
  -> If auto-approvable: dispatch robot immediately, notify operator
  -> If needs review: show alert on dashboard with recommendation
  -> Operator sees: event details + Cosmos reasoning + recommended action
  -> Operator can: approve / cancel / pause / modify
  -> System continues autonomously unless operator intervenes
```

## Incident Management

- Deduplication window: 45s (prevents duplicate tasks)
- Incident TTL: 300s (auto-expire old events)
- Queue max: 200 items
- SQLite journal for audit trail

## Key Files

- `modules/ros2-task-planner/sras_robot_task_planner/planner_core.py` (36.6 KB)
- `modules/ros2-task-planner/sras_robot_task_planner/cosmos_deep_planner.py`
- `modules/ros2-task-planner/config/robot_task_planner.yaml`

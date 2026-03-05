# Module 4: Multi-Robot Task Execution

## What It Does

Executes robot tasks by interfacing with ROS 2 Nav2 navigation stack. Manages full task lifecycle from queue to completion across multiple robots with readiness gates, timeout handling, and operator controls.

---

## Architecture

```
PlannerTask (from /reasoning/task_requests)
        |
        v
+---------------------------+
|     EXECUTOR CORE         |
|  1. Enqueue task          |
|  2. Readiness gate check: |
|     - map ready?          |
|     - tf ready?           |
|     - nav2 ready?         |
|  3. Dispatch to Nav2      |
|  4. Monitor progress      |
|  5. Report status         |
+---------------------------+
        |                |
        v                v
   Nav2 Action      /robot/task_status
   (NavigateToPose)   (to planner + dashboard)
```

---

## Real Input: Task Enqueue

```json
{
  "task_id": "task-a1b2c3d4e5",
  "task_type": "INVESTIGATE_ALERT",
  "robot_id": "robot0",
  "goal": {
    "frame_id": "map",
    "x": 5.0,
    "y": 3.0,
    "z": 0.0,
    "yaw": 0.0
  }
}
```

### Task Type to Nav2 Action Mapping

```python
TASK_TYPE_TO_NAV_ACTION = {
    "INSPECT_POI":        "navigate_to_pose",
    "INSPECT_BLINDSPOT":  "navigate_to_pose",
    "INVESTIGATE_ALERT":  "navigate_to_pose",
    "PURSUE_THIEF":       "navigate_to_pose",
    "BLOCK_EXIT":         "navigate_to_pose",
    "GUARD_ASSET":        "navigate_to_pose",
    "PATROL_ROUTE":       "navigate_through_poses",  # waypoint sequence
    "REPORT":             "publish_report",           # no navigation
}
```

---

## Real Output: Task Status Events

Published to `/robot/task_status` at every lifecycle transition:

### Task Dispatched

```json
{
  "task_id": "task-a1b2c3d4e5",
  "state": "DISPATCHED",
  "detail": "Task dispatched via navigate_to_pose",
  "progress": 0.0,
  "nav_action": "navigate_to_pose",
  "robot_id": "robot0",
  "timestamp_s": 1234567895.456
}
```

### Task Active (Nav2 accepted)

```json
{
  "task_id": "task-a1b2c3d4e5",
  "state": "ACTIVE",
  "detail": "Nav2 goal accepted, robot navigating",
  "progress": 0.35,
  "nav_action": "navigate_to_pose",
  "robot_id": "robot0",
  "timestamp_s": 1234567905.789
}
```

### Task Succeeded

```json
{
  "task_id": "task-a1b2c3d4e5",
  "state": "SUCCEEDED",
  "detail": "Navigation goal reached",
  "progress": 1.0,
  "nav_action": "navigate_to_pose",
  "robot_id": "robot0",
  "timestamp_s": 1234567920.123
}
```

### Task Blocked (readiness gate)

```json
{
  "task_id": "task-a1b2c3d4e5",
  "state": "BLOCKED",
  "detail": "map not ready",
  "progress": 0.0,
  "robot_id": "robot0",
  "timestamp_s": 1234567891.000
}
```

---

## Task Lifecycle

```
QUEUED
  |
  +-- readiness gates pass? --+
  |         NO                |  YES
  v                           v
BLOCKED                    DISPATCHED
  |                           |
  +-- gates clear -->  DISPATCHED
                              |
                         Nav2 accepts
                              |
                              v
                          ACTIVE
                           /    \
                     success     failure/timeout
                        |            |
                        v            v
                   SUCCEEDED      FAILED

  (Any state can transition to CANCELED or PAUSED via operator command)
  PAUSED --> DISPATCHED (on resume)
```

### Lifecycle States

| State | Description |
|---|---|
| `QUEUED` | Task received, waiting for dispatch slot |
| `BLOCKED` | Readiness gate failed (map/tf/nav not ready) |
| `DISPATCHED` | Nav2 goal sent, waiting for acceptance |
| `ACTIVE` | Nav2 actively navigating |
| `SUCCEEDED` | Goal reached |
| `FAILED` | Navigation failed or timed out |
| `CANCELED` | Operator canceled |
| `PAUSED` | Operator paused (can resume) |

---

## Readiness Gates

Before dispatching any task, the executor checks 3 gates:

| Gate | Config | Timeout | Check |
|---|---|---|---|
| **Map ready** | `require_map: true` | `map_stale_timeout_s: 5.0` | Recent /map message received |
| **TF ready** | `require_tf: true` | `tf_stale_timeout_s: 2.0` | Recent /tf transform available |
| **Nav2 ready** | `require_nav_ready: true` | -- | Nav2 action servers responding |

If any gate fails, task enters `BLOCKED` state with detail explaining which gate failed. Task auto-dispatches when all gates clear.

---

## Multi-Robot Execution

### Robot Registry State

```json
{
  "robots": [
    {
      "robot_id": "robot0",
      "robot_type": "quadruped",
      "readiness": "BUSY",
      "position": {"x": 1.2, "y": 0.8},
      "yaw": 1.57,
      "active_task_id": "task-a1b2c3d4e5",
      "nav2_ready": true,
      "capabilities": {"can_pursue": true, "can_block_exit": false, "can_guard": false}
    },
    {
      "robot_id": "h1_0",
      "robot_type": "humanoid",
      "readiness": "READY",
      "position": {"x": 2.0, "y": 1.0},
      "yaw": 0.0,
      "active_task_id": null,
      "nav2_ready": false,
      "capabilities": {"can_pursue": false, "can_block_exit": true, "can_guard": true}
    }
  ]
}
```

### Per-Robot Nav2 Action Servers

```yaml
robot0_nav_to_pose_action: /navigate_to_pose
h1_0_nav_to_pose_action: /h1_0/navigate_to_pose
```

Each robot has its own Nav2 action server namespace, allowing independent navigation.

---

## Operator Commands

### Available Commands

| Command | Effect | Valid From States |
|---|---|---|
| `approve` | PENDING_APPROVAL -> DISPATCHED | PENDING_APPROVAL |
| `cancel` | Any -> CANCELED | Any active state |
| `pause` | DISPATCHED/ACTIVE -> PAUSED | DISPATCHED, ACTIVE |
| `resume` | PAUSED -> DISPATCHED | PAUSED |
| `redefine` | Change task type/goal mid-execution | Any active state |

### Command Message Format

```json
{
  "command": "pause",
  "task_id": "task-a1b2c3d4e5",
  "robot_id": "robot0"
}
```

### Redefine (change task mid-execution)

```json
{
  "command": "redefine",
  "task_id": "task-a1b2c3d4e5",
  "robot_id": "robot0",
  "task": {
    "task_id": "task-a1b2c3d4e5",
    "task_type": "PATROL_ROUTE",
    "poses": [
      {"frame_id": "map", "x": 0.0, "y": 0.0, "yaw": 0.0},
      {"frame_id": "map", "x": 1.0, "y": 1.0, "yaw": 0.5}
    ]
  }
}
```

---

## Executor State (Published Diagnostics)

```json
{
  "tasks_received": 15,
  "tasks_queued": 15,
  "tasks_dispatched": 12,
  "tasks_succeeded": 8,
  "tasks_failed": 0,
  "tasks_canceled": 2,
  "tasks_paused": 1,
  "tasks_resumed": 1,
  "tasks_redefined": 0,
  "tasks_invalid": 0,
  "queue_rejected": 0,
  "queue_size": 0,
  "active_task_id": "task-a1b2c3d4e5",
  "paused_task_id": null,
  "readiness": {
    "map_ready": true,
    "tf_ready": true,
    "nav_ready": true,
    "require_map": true,
    "require_tf": true,
    "require_nav_ready": true,
    "block_reason": null
  }
}
```

---

## Configuration

```yaml
robot_task_executor_node:
  ros__parameters:
    executor_tick_hz: 2.0           # Check loop frequency
    max_queue_size: 100             # Max queued tasks
    max_active_tasks: 1             # One task at a time per robot
    allow_preemption: false         # Don't interrupt active tasks
    goal_timeout_s: 120.0           # Nav2 goal timeout
    require_map: true               # Gate: need /map
    map_stale_timeout_s: 5.0        # How fresh map must be
    require_tf: true                # Gate: need /tf
    tf_stale_timeout_s: 2.0         # How fresh tf must be
    require_nav_ready: true         # Gate: need Nav2 action servers
    multi_robot_enabled: true
    robot_ids: ["robot0", "h1_0"]
```

---

## End-to-End Example: Intruder Detected

```
1. Detection buffer receives /triangulated/detections_json
   -> "person" class appears at (5.0, 3.0) with score 0.82

2. Change type: "new_class" -> PlannerEvent created
   -> event_type: "intruder_detected", severity: "high"

3. Planner scores priority: 0.87 (high severity + high confidence)
   -> severity > auto_approve_threshold (0.55)
   -> Route: multi_robot (2 robots available)

4. Multi-robot assignment:
   -> robot0 (quadruped): PURSUE_THIEF, priority 0.95
   -> h1_0 (humanoid): BLOCK_EXIT, priority 0.80

5. Executor receives 2 tasks:
   -> robot0: QUEUED -> readiness gates pass -> DISPATCHED
      Nav2 NavigateToPose goal sent to /navigate_to_pose
   -> h1_0: QUEUED -> BLOCKED (nav2 not ready)

6. robot0 navigating:
   -> ACTIVE (progress: 0.35 -> 0.65 -> 0.90)
   -> SUCCEEDED (goal reached at 5.0, 3.0)

7. Dashboard receives:
   -> Notification: "Task dispatched (PURSUE_THIEF)"
   -> Status updates with robot position
   -> Alert: severity HIGH with Cosmos reasoning

8. Operator sees everything, can cancel/pause at any time
```

---

## Key Files

| File | Size | Content |
|---|---|---|
| `modules/ros2-task-executor/sras_robot_task_executor/execution_core.py` | 15.8 KB | Core execution logic (ROS-free) |
| `modules/ros2-task-executor/sras_robot_task_executor/robot_task_executor_node.py` | 40.9 KB | ROS 2 node wrapper |
| `modules/ros2-task-executor/sras_robot_task_executor/multi_robot_execution_core.py` | -- | Multi-robot coordination |
| `modules/ros2-task-executor/config/robot_task_executor.yaml` | -- | Production config |
| `test_configs/executor_multi_test.yaml` | 1.7 KB | Multi-robot test config |
| `test_configs/integration_tests.py` | 46 KB | End-to-end test scenarios |

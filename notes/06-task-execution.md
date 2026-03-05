# Module 4: Task Execution on Multi-Robot System

## What It Does

Executes robot tasks by interfacing with ROS 2 Nav2 navigation stack. Manages task lifecycle from dispatch to completion across multiple robots.

## Input

- `/reasoning/task_requests` - tasks from planner
- Nav2 action servers (NavigateToPose, NavigateThroughPoses)
- `/tf` - robot position
- Operator commands (cancel/pause/resume)

## Output

- `/robot/task_status` - execution progress and status updates

## Task Lifecycle

```
QUEUED -> DISPATCHED -> IN_PROGRESS -> SUCCEEDED
                                    -> FAILED
                                    -> CANCELED
                                    -> PAUSED -> IN_PROGRESS (resumed)
```

## How It Works

### Single Task Execution

```
Task received (INSPECT_POI at position [2.3, 1.1])
  -> Validate task (reachable? robot available?)
  -> Send Nav2 NavigateToPose action goal
  -> Monitor progress (distance remaining, time elapsed)
  -> On arrival: report SUCCEEDED
  -> On failure: retry or report FAILED
  -> On cancel: abort Nav2 goal, report CANCELED
```

### Multi-Robot Coordination

```
Task assigned to robot0
  -> Check robot0 status (idle? busy?)
  -> If busy: queue or reassign to robot1
  -> Track per-robot task slots
  -> Fair distribution across fleet
  -> Timeout handling per robot
```

## Nav2 Integration

- NavigateToPose: single destination (INSPECT_POI, REPOSITION)
- NavigateThroughPoses: waypoint sequence (PATROL_ROUTE)
- Uses robot's SLAM map for path planning
- Handles dynamic obstacles via costmap
- Recovery behaviors on navigation failure

## Status Feedback to Dashboard

Every status change published as JSON:
```json
{
  "task_id": "task_001",
  "robot_id": "robot0",
  "status": "IN_PROGRESS",
  "progress_pct": 65,
  "eta_seconds": 12,
  "position": {"x": 1.5, "y": 0.8}
}
```

Dashboard shows real-time robot position on map with task overlay.

## Key Files

- `modules/ros2-task-executor/sras_robot_task_executor/execution_core.py` (15.8 KB)
- `modules/ros2-task-executor/sras_robot_task_executor/robot_task_executor_node.py` (40.9 KB)
- `modules/ros2-task-executor/sras_robot_task_executor/multi_robot_execution_core.py`

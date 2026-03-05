# Multi-Robot Museum Security Architecture

## Scenario Overview

SRAS (Security Robot Automation System) is upgraded from a single-robot system to a
multi-robot fleet for a museum theft scenario:

- **2 thieves** detected by CCTV triangulation via `/triangulated/detections_json`
- **2 robots**: robot0 (Unitree Go2 quadruped - pursuit) + robot1 (H1 humanoid - blocking)
- **Cosmos LLM** decides which robot handles which threat
- **Graceful degradation**: robot1 may not be Nav2-ready yet

## Decision Flow

```
CCTV Triangulation
       |
       v
DetectionBuffer (existing)
       |
       v
PlannerEngine.tick()
       |
       +--- multi_robot_enabled=false --> existing single-robot path
       |
       +--- multi_robot_enabled=true
              |
              v
         RobotRegistry.get_available_robots()
              |
              v
         cosmos_assignment_enabled?
              |
              +--- true --> CosmosAssignmentReasonerClient.assign()
              |                |
              |                +--- success --> AssignmentPlan
              |                +--- failure --> deterministic fallback
              |
              +--- false --> deterministic role mapping
              |
              v
         Create PlannerTask per robot assignment
              |
              v
         Publish task_request with robot_id
              |
              v
         MultiRobotExecutionCore.enqueue_task()
              |
              v
         Route to per-robot TaskExecutionCore
              |
              v
         Dispatch to per-robot Nav2 action client
```

## Component Architecture

### Robot Registry (`robot_registry.py`)

Pure-Python fleet state tracker. No ROS imports.

- Tracks robot positions, capabilities, readiness, and active tasks
- Each robot has a `RobotType` (QUADRUPED, HUMANOID) with default capabilities
- Immutable `RobotState` objects - all updates create new instances
- Heartbeat-based availability with configurable timeout

### Cosmos Assignment Reasoner (`cosmos_assignment_reasoner.py`)

LLM-based multi-robot task assignment following existing Cosmos client pattern.

- Input: event summary + fleet state (positions, capabilities, readiness)
- Output: `AssignmentPlan` with per-robot task assignments
- Uses `urllib.request` (zero external deps), same retry logic as existing clients
- System prompt: museum security coordinator deciding optimal robot-task mapping

### Planner Core Upgrades (`planner_core.py`)

Extended for multi-robot dispatch while preserving single-robot backward compatibility.

- `PlannerTask` gains `robot_id: str | None` field
- `PlannerConfig` gains multi-robot flags (`multi_robot_enabled`, etc.)
- `PlannerEngine` gains registry injection, multi-robot tick path, per-robot capacity
- When `multi_robot_enabled=false` (default), ALL existing behavior preserved

### Executor Core Upgrades

- `ValidatedTask` and `StatusEvent` gain `robot_id: str | None` field
- New task types: `PURSUE_THIEF`, `BLOCK_EXIT`, `GUARD_ASSET`
- `MultiRobotExecutionCore`: composition wrapper holding N `TaskExecutionCore` instances

### ROS Node Wiring

- Planner node: per-robot odom subscriptions, registry population from config
- Executor node: per-robot Nav2 action clients, robot_id routing in task dispatch

## Role-Based Deterministic Assignment

When Cosmos is unavailable, deterministic mapping is used:

| Robot Type | Event Type          | Assigned Task   |
|------------|---------------------|-----------------|
| QUADRUPED  | INVESTIGATE_ALERT   | PURSUE_THIEF    |
| HUMANOID   | INVESTIGATE_ALERT   | BLOCK_EXIT      |
| QUADRUPED  | *                   | Original task   |
| HUMANOID   | *                   | Original task   |

Rationale: Go2 quadruped is fast (max 3.5 m/s) and suited for pursuit.
H1 humanoid can physically block exits and guard assets.

## Graceful Degradation

- If robot1 (H1) has `nav2_ready: false`, its readiness is `DEGRADED`
- `get_available_robots()` excludes DEGRADED robots
- System falls back to single-robot operation with robot0 only
- When robot1's Nav2 stack comes online, operator updates readiness
- No code changes needed when robot1 becomes fully operational

## Configuration

Multi-robot mode is activated via YAML config:

```yaml
multi_robot_enabled: true
cosmos_assignment_enabled: true
max_active_tasks_per_robot: 1
robot_fleet:
  - robot_id: robot0
    robot_type: quadruped
    odom_topic: /robot0/odom
    nav2_ready: true
  - robot_id: robot1
    robot_type: humanoid
    odom_topic: /robot1/odom
    nav2_ready: false
```

## Integration Guide

1. Set `multi_robot_enabled: true` in planner config
2. Define robot fleet in `robot_fleet` config array
3. Optionally enable `cosmos_assignment_enabled` for LLM-based assignment
4. Configure per-robot Nav2 action server topics in executor config
5. Ensure per-robot odom topics are publishing
6. Monitor via `~/get_stats` service (includes registry snapshot)

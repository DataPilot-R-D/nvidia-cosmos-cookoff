# PAIC2 System Overview

Last verified: 2026-02-26.

This document defines the canonical architecture for the PAIC2 robotics platform.

For graph-first views, see `docs/architecture/c1-c5-architecture.md`.

## System mission

PAIC2 provides a security robotics stack that combines:

- ROS2 robot bringup and navigation
- real-time operator dashboard and command center
- reasoning layer for incident-to-task planning and execution
- visual memory and localization reasoning
- simulation and digital-twin environment

## High-level architecture

```text
[Robot or Isaac Sim] -> [ROS2 Bringup + Nav2 + SLAM + rosbridge]
                       -> [Planner + Executor + DimOS Memory]
                       -> [WebSocket Server + HTTP API]
                       -> [Web Dashboard]
                       -> [Operator/HITL]
```

Cosmos POC runs as a parallel reasoning stream for vision/perception experiments and benchmark-driven validation.

## Canonical repositories

| Domain | Path | Upstream |
|---|---|---|
| Dashboard and API gateway | `repos/dashboard` | `DataPilot-R-D/Dashboard_Robotics` |
| Task planning (reasoning) | `repos/planner` | `DataPilot-R-D/sras_ros2_robot_task_planner` |
| Task execution (Nav2 actions) | `repos/executor` | `DataPilot-R-D/sras_ros2_robot_task_executor` |
| Robot bringup and launch orchestration | `repos/bringup` | `DataPilot-R-D/sras_ros2_bringup` |
| DimOS temporal/spatial/combined memory | `repos/dimos-bridge` | `DataPilot-R-D/sras_ros2_dimos_bridge` |
| Cosmos reasoning benchmarks and bridge | `repos/cosmos-poc` | `DataPilot-R-D/cosmos-hackathon` |
| Isaac/Orbit Go2/G1 simulation | `repos/go2-omniverse` | `DataPilot-R-D/go2_omniverse` |

## Runtime responsibilities by subsystem

## `sras_ros2_bringup`

- launches core runtime graph (`go2_stack.launch.py`)
- includes Nav2, SLAM, rosbridge, relay/throttle, map republisher, vision LLM server
- bridges map and camera/pointcloud sources into downstream consumers

## `sras_ros2_robot_task_planner`

- ingests blindspot/risk events and task status feedback
- computes task proposals with deterministic planning
- optionally performs deep planning via Cosmos adapter
- publishes task requests and operator alerts

## `sras_ros2_robot_task_executor`

- consumes task requests and dispatches Nav2 actions
- manages queue/state transitions and operator commands
- emits task status and alert stream back to planner/dashboard

## `sras_ros2_dimos_bridge`

- exposes memory and VLM reasoning nodes:
- temporal memory
- spatial memory
- combined memory
- VLM query service
- object localization

## `Dashboard_Robotics`

- `apps/websocket-server`: API + Socket.IO gateway + ROS bridge integration
- `apps/web-client`: operator UI and mission workflows
- `apps/ros-bridge`: Python bridge/scaffold integration to robot-side runtime

## `COSMOS-Reasining-2-POC`

- benchmark and validation harness for Cosmos model behavior
- contains agent runtime, benchmark matrix, and ROS2/socket bridge integration

## `go2_omniverse`

- Isaac/Orbit simulation runtime with ROS2 bridge enablement
- emits simulated sensor topics and consumes `/cmd_vel` commands

## Source-of-truth policy

- `workspace/lock.yaml` is the only valid version lock for platform state.
- Deployable platform state must always map to one lock revision.
- Direct runtime host edits are temporary and must be backported into git repositories.

## Known architecture realities

- Core planner/executor interfaces currently rely on JSON-over-`std_msgs/String`.
- Dashboard Socket.IO contract surface is broad and has drift risk without strict schema matrix.
- Bringup and DimOS stacks depend on external packages/services that are not fully encoded in package metadata.
- Simulation stack has version coupling to Isaac/Orbit environment and external assets.

# Deployment and Operations Runbook

Last verified: 2026-02-26.

## Scope

Operational guide for PAIC2 runtime stack across ROS2 services, dashboard services, reasoning services, and external inference dependencies.

## Recommended startup order

1. Ensure environment and secrets are present from SSM/Secrets Manager.
2. Start core ROS2 bringup stack.
3. Start planner and executor nodes.
4. Start DimOS nodes required for scenario.
5. Start dashboard websocket server and web client.
6. Start optional Cosmos integration services.
7. Validate operator streaming path (go2rtc/WebRTC first, fallback only if needed).

## Core health checks

```bash
source /opt/ros/humble/setup.bash
ros2 node list | sort
ros2 topic list | sort
ros2 service list | sort
ss -lntp | rg ':9090|:8080|:3000|:1984|:8554|:10000|:1234' || true
```

## Planner/executor contract checks

- planner receives:
- `/reasoning/blindspot_events`
- `/reasoning/risk_assessments`
- `/robot/task_status`
- executor receives:
- `/reasoning/task_requests`
- `/ui/set_task_state`
- status loop closes:
- executor publishes `/robot/task_status`

## Common incident triage

## Dashboard stale but ROS alive

- verify websocket server process
- verify rosbridge connection and `ROS_BRIDGE_URL`
- verify Socket.IO event flow

## Planner not dispatching tasks

- verify map gate and staleness (`/map`)
- verify incoming event payload shape
- verify executor status loop and planner state topic

## Executor blocked

- verify Nav2 action server availability (`/navigate_to_pose`, `/navigate_through_poses`)
- verify TF and map readiness gates if enabled

## Vision stack degraded

- verify VLM endpoint availability
- for local endpoint path, check listener on `:1234`
- verify camera topic alignment across bringup, dimos, and bridge services

## Streaming degraded

- validate go2rtc path first
- confirm network/firewall path for required UDP/TCP ports
- use JPEG fallback only as temporary mitigation

## Secrets policy

- no secrets in repository
- use `ops/env/sras-platform.env.example` as key-name template
- resolve secrets from AWS SSM/Secrets Manager at runtime

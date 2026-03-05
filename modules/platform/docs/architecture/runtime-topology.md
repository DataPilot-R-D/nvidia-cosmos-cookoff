# PAIC2 Runtime Topology

Last verified: 2026-02-26.

## End-to-end flow

1. Physical robot or simulator publishes telemetry and sensor topics.
2. Bringup stack starts Nav2, SLAM, rosbridge, and support nodes.
3. Planner consumes reasoning events and publishes task requests.
4. Executor consumes task requests and drives Nav2 action clients.
5. Task status and alerts flow back to planner and dashboard.
6. Dashboard gateway bridges ROS2 topics/events to web clients.
7. Operators provide HITL commands which feed planner/executor.
8. DimOS and Cosmos streams provide auxiliary reasoning and perception outputs.

## Data/control planes

## Robot and simulation plane

- Sources:
- physical Unitree Go2 stack (via ROS2 topics)
- Isaac/Orbit simulation from `go2_omniverse`
- Typical outputs:
- `/robot{i}/joint_states`, `/robot{i}/odom`, `/robot{i}/imu`, `/robot{i}/point_cloud2`
- `/robot{i}/front_cam/rgb`
- Control ingress:
- `/robot{i}/cmd_vel` from ROS2 control chain

## Core ROS2 runtime plane

- Bringup launch entrypoint:
- `sras_ros2_bringup/launch/go2_stack.launch.py`
- Includes:
- `rosbridge_server` websocket launch
- Nav2 `navigation_launch.py`
- `slam_toolbox` with delayed posegraph deserialize
- relay/throttle nodes
- map republisher (`/map` -> `/map_live`)
- vision LLM server node

## Reasoning and execution plane

- Planner:
- consumes `/reasoning/blindspot_events`, `/reasoning/risk_assessments`, `/robot/task_status`, `/map`, `/ui/set_task_state`
- publishes `/reasoning/task_requests`, `/ui/alerts`, `~/planner_state`
- exposes `~/get_stats`
- Executor:
- consumes `/reasoning/task_requests`, `/ui/set_task_state`, optional `/map` and TF topics
- drives Nav2 actions (`/navigate_to_pose`, `/navigate_through_poses`)
- publishes `/robot/task_status`, `/ui/alerts`, `~/executor_state`
- exposes `~/get_stats`

## Memory and VLM plane

- DimOS bridge nodes provide temporal/spatial/combined memory, VLM query, and object localization
- Outputs include natural-language answers, location results, and detection streams
- Multiple backend modes supported (OpenAI, Qwen variants, Moondream variants, local models, Cosmos backend in object localization)

## Dashboard/control plane

- `apps/websocket-server` bridges ROS2 state/events to Socket.IO and exposes HTTP APIs
- `apps/web-client` provides operator UI for mission, map, incident, evidence, trust, and teleop workflows
- `apps/ros-bridge` provides python-side integration path for robot-side behaviors

## Core contract pathways

| Pathway | Producer | Consumer | Transport |
|---|---|---|---|
| Incident/risk -> planner | reasoning sources | planner | ROS2 String JSON |
| Planner -> executor | planner | executor | ROS2 String JSON |
| Executor -> planner/dashboard | executor | planner + dashboard | ROS2 String JSON |
| Operator commands | dashboard/operator | planner + executor | ROS2 String JSON |
| Sensor/state to dashboard | ROS2 via bridge | websocket-server/web-client | rosbridge + Socket.IO |
| Map mode and mission APIs | websocket-server | web-client | HTTP REST |

## External dependencies with platform impact

- Nav2, SLAM Toolbox, rosbridge suite, topic_tools
- `sras_qos_tools`, `vision_llm_srv`, and other workspace-local packages
- VLM backend services and credentials
- RunPod and Cosmos endpoint infrastructure for benchmark and optional bridge flows
- Isaac Sim / Orbit environment and asset dependencies for simulator workflows

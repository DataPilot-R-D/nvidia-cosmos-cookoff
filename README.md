# SRAS — NVIDIA Hackathon Project

SRAS (Security Robot Automation System) is a sim2real security robotics project built around:
- 3 fixed CCTV cameras
- 1 mobile robot (Unitree Go2)
- ROS 2 + Isaac Sim integration
- NVIDIA Cosmos reasoning for incident understanding
- Operator dashboard for alerts, task control, and live monitoring

The main architecture for this hackathon is documented in `docs/REASONING_LAYER_ARCHITECTURE.md`.

## Reality check (verified from sub-repos on 2026-02-19)

### Implemented now

| Area | Current implementation |
|---|---|
| ROS bringup | `sras_ros2_bringup/launch/go2_stack.launch.py` launches `rosbridge_server`, `pointcloud_to_laserscan`, `slam_toolbox`, `nav2_bringup`, relays/throttles, `map_republisher`, and `vision_llm_server`. |
| ROS reasoning/memory | `sras_ros2_dimos_bridge` implements `temporal_memory_node`, `spatial_memory_node`, `combined_memory_node`, and `vlm_query_service` with launch files and YAML configs. |
| Dashboard ROS integration | `Dashboard_Robotics/apps/websocket-server` has rosbridge connection/reconnect, topic forwarding, Nav2 goal/cancel handlers, and camera stream handling. |
| Cosmos PoC | `COSMOS-Reasining-2-POC` contains benchmark suites and two bridge paths (`scripts/cosmos_webrtc_bridge.py`, `src/bridge/ros2_cosmos_bridge.py`). |

### Planned / not yet implemented in code

- The 5 custom reasoning nodes from the architecture doc are still a target design:
  - `spatial_object_recognition_node`
  - `cctv_visibility_monitor_node`
  - `robot_task_planner_node`
  - `robot_task_executor_node`
  - `robot_situation_assessor_node`
- `warehouse_security_msgs` custom message package described in architecture docs is not present yet as a standalone package in these sub-repos.

## Hackathon focus

1. Detect CCTV blind spots and suspicious visibility changes.
2. Dispatch the robot to inspect affected points of interest.
3. Assess risk (for example: open window + shelf contact / tipping risk).
4. Keep a human operator in the loop through the dashboard.
5. Validate a Cosmos 2 PoC for real-time scene reasoning.

## High-level architecture (sim2real)

The stack is organized into 5 layers:

1. Sensor/Simulation layer  
   Isaac Sim or real sensors publish CCTV + robot streams.
2. Perception/State Estimation layer  
   Produces normalized 3D detections and asset states in `map` frame.
3. Reasoning layer (ROS nodes)  
   Blind spot detection, task generation, situation assessment, Cosmos-assisted reasoning.
4. Planning/Control layer  
   Nav2 execution and task status tracking.
5. Operator/Dashboard layer  
   Alerts, timeline, approvals/cancel/pause, video feeds.

Reference: `docs/REASONING_LAYER_ARCHITECTURE.md`.

## Target reasoning layer ROS nodes (planned)

Defined in `docs/REASONING_LAYER_ARCHITECTURE.md` (target state, not fully implemented yet):

| Node | Role | Key Outputs | Status |
|---|---|---|---|
| `spatial_object_recognition_node` | Build unified 3D semantic scene from CCTV + robot sensors | `/perception/detections_3d`, `/perception/asset_states` | Planned |
| `cctv_visibility_monitor_node` | Detect visibility loss / blind spots in CCTV streams | `/reasoning/blindspot_events` | Planned |
| `robot_task_planner_node` | Convert events into robot tasks with guardrails + human loop | `/reasoning/task_requests`, `/ui/alerts` | Planned |
| `robot_task_executor_node` | Execute tasks through Nav2 and report progress | `/robot/task_status` | Planned |
| `robot_situation_assessor_node` | Assess local risk and recommend actions (Cosmos-assisted) | `/reasoning/risk_assessments`, `/ui/alerts` | Planned |

## Implemented ROS components (today)

### Bringup stack (`sras_ros2_bringup`)

- Entry point: `ros2 launch sras_bringup go2_stack.launch.py`
- Includes:
  - `rosbridge_websocket_launch.xml` (ROS bridge)
  - `pointcloud_to_laserscan` conversion
  - `slam_toolbox` + delayed map deserialize
  - `nav2_bringup/navigation_launch.py`
  - `topic_tools` relay and topic throttles
  - `sras_qos_tools/map_republisher` (`/map` → `/map_live`)
  - `vision_llm_srv/vision_llm_server` with `OPENAI_*` env wiring

### DimOS bridge stack (`sras_ros2_dimos_bridge`)

- Production-ready core nodes:
  - `temporal_memory_node`
  - `spatial_memory_node`
  - `vlm_query_service`
- Experimental / heuristic-heavy:
  - `combined_memory_node` (works, but relies on simple extraction heuristics)
  - `autonomous_explorer` (demo/random-walk helper)

### Dashboard ROS topic surface (default subscription set)

- Navigation/control topics include: `/scan`, `/cmd_vel`, `/odom`, `/map`, `/goal_pose`, `/plan`, `/local_plan`.
- Robot-specific topics include: `/robot0/front_cam/rgb`, `/robot0/point_cloud2_L1`, `/robot0/odom`, `/robot0/cmd_vel`.
- Nav2 action telemetry includes: `/navigate_to_pose/_action/feedback` and `/navigate_to_pose/_action/status`.

## Repository layout

- `docs/` — architecture, runbooks, infrastructure notes
- `COSMOS-Reasining-2-POC/` — Cosmos Reason2 benchmarking + bridge integrations
- `Dashboard_Robotics/` — web dashboard + websocket/rosbridge integration
- `sras_ros2_bringup/` — ROS2 bringup launch stack (`go2_stack.launch.py`)
- `sras_ros2_dimos_bridge/` — DimOS memory/VLM ROS2 nodes
- `go2_omniverse/` — Isaac Sim / robot simulation integration

## Quick start (hackathon path)

### 1) Cosmos 2 PoC (benchmarks + endpoint workflow)

```bash
cd COSMOS-Reasining-2-POC
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m pytest tests/ -m "not integration"
python3 scripts/run_benchmarks_v3.py
```

RunPod lifecycle helper:

```bash
eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)
python3 scripts/runpod_cosmos.py prompt --message "Hello" --bootstrap-service --no-stop
python3 scripts/runpod_cosmos.py stop
```

### 2) ROS2 bringup

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py
```

Full production-style launch arguments and health checks are in `docs/ROS2_STACK.md` and `sras_ros2_bringup/README.md`.

### 3) Dashboard

```bash
cd Dashboard_Robotics
pnpm install
pnpm dev
```

Notes:
- `apps/web-client` runs on port `3000`.
- `apps/websocket-server` defaults to port `8080` (`Dashboard_Robotics/apps/websocket-server/src/index.ts`).

### 4) Cosmos-to-dashboard bridge options

From `COSMOS-Reasining-2-POC`:

Option A: consume dashboard `video_frame` events (Socket.IO tap)

```bash
python3 scripts/cosmos_webrtc_bridge.py --ws-url http://localhost:8080 --interval 2.0
```

Option B: consume ROS camera topic directly and emit `cosmos_event` + incidents

```bash
python3 -m src.bridge.ros2_cosmos_bridge \
  --ros-topic /robot0/front_cam/rgb \
  --ws-url http://localhost:8080 \
  --dashboard-url http://localhost:3000 \
  --cosmos-url http://<pod_host>:8899 \
  --interval 2.0
```

### 5) Optional DimOS ROS nodes

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch dimos_vlm_bridge temporal_memory.launch.py
ros2 launch dimos_vlm_bridge spatial_memory.launch.py
ros2 launch dimos_vlm_bridge combined_memory.launch.py
ros2 launch dimos_vlm_bridge vlm_query.launch.py
```

Reference: `sras_ros2_dimos_bridge/README.md`.

## Demo scenario (target end-to-end flow)

1. CCTV visibility for a critical area drops (blind spot event).
2. Planner creates an inspection task and dispatches the robot.
3. Nav2 executes movement to inspection pose.
4. Situation assessor evaluates local risk using perception + Cosmos reasoning.
5. Dashboard receives alert + risk assessment + operator recommendations.
6. Operator can approve, cancel, pause, or resume actions.

## Known integration checks

- `vision_llm_srv` default endpoint in bringup is `http://localhost:1234/v1`; ensure a compatible backend is running or override `openai_base_url`.  
  Reference: `docs/ROS2_STACK.md`.
- WebRTC/go2rtc path is not fully auto-provisioned by setup scripts; manual go2rtc install + ROS image→RTSP bridge (`Dashboard_Robotics/scripts/ros2_to_rtsp.py`) is still required.  
  Reference: `Dashboard_Robotics/docs/handover.md`, `Dashboard_Robotics/config/go2rtc.yaml`.
- Current practical default remains legacy/fallback camera streaming when go2rtc health checks fail.
- `sras_ros2_bringup/package.xml` does not currently declare all runtime dependencies that the launch file assumes (`nav2_bringup`, `rosbridge_server`, `slam_toolbox`, etc.), so deployment still depends on workspace-level packages.

## Key docs

- Main architecture: `docs/REASONING_LAYER_ARCHITECTURE.md`
- ROS stack runbook: `docs/ROS2_STACK.md`
- Cosmos PoC details: `COSMOS-Reasining-2-POC/README.md`
- Bringup package: `sras_ros2_bringup/README.md`
- DimOS bridge: `sras_ros2_dimos_bridge/README.md`
- Dashboard research/ops notes: `Dashboard_Robotics/research-summary.md`

## External references (web-verified on 2026-02-19)

- NVIDIA Cosmos overview: https://www.nvidia.com/en-us/ai/cosmos/
- NVIDIA Cosmos docs hub: https://docs.nvidia.com/cosmos/index.html
- Cosmos Cookbook: https://nvidia-cosmos.github.io/cosmos-cookbook/
- Cosmos Reason prompt guide: https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html
- ROS 2 Humble docs: https://docs.ros.org/en/humble/
- Navigation2 docs: https://docs.nav2.org/
- rosbridge suite docs: https://docs.ros.org/en/iron/p/rosbridge_suite/

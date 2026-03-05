# SRAS — NVIDIA Hackathon Demo

SRAS (Security Robot Automation System) is a sim2real security robotics project built around:
- 3 fixed CCTV cameras
- 1 mobile robot (Unitree Go2)
- ROS 2 + Isaac Sim integration
- NVIDIA Cosmos reasoning for incident understanding
- Operator dashboard for alerts, task control, and live monitoring

The main architecture is documented in `docs/REASONING_LAYER_ARCHITECTURE.md`.

## Repository layout

```
modules/
  cosmos-reasoning-benchmark/  Cosmos Reason2 benchmarking + bridge integrations
  dashboard/           Web dashboard + websocket/rosbridge integration
  simulation/          Isaac Sim / robot simulation (go2_omniverse)
  platform/            Platform orchestration, CI/CD, workspace tooling
  ros2-bringup/        ROS 2 bringup launch stack (go2_stack.launch.py)
  ros2-dimos-bridge/   DimOS memory/VLM ROS 2 nodes
  ros2-task-executor/  Robot task execution via Nav2
  ros2-task-planner/   Robot task planning with guardrails + human loop
infra/
  isaac-sim/           AWS Isaac Sim instance setup, CFN, VPN
docs/                  Architecture, runbooks, infrastructure notes
test_configs/          Integration test configs
```

## Hackathon focus

1. Detect CCTV blind spots and suspicious visibility changes.
2. Dispatch the robot to inspect affected points of interest.
3. Assess risk (e.g. open window + shelf contact / tipping risk).
4. Keep a human operator in the loop through the dashboard.
5. Validate a Cosmos 2 PoC for real-time scene reasoning.

## High-level architecture (sim2real)

The stack is organized into 5 layers:

1. **Sensor/Simulation layer** — Isaac Sim or real sensors publish CCTV + robot streams.
2. **Perception/State Estimation layer** — Produces normalized 3D detections and asset states in `map` frame.
3. **Reasoning layer (ROS nodes)** — Blind spot detection, task generation, situation assessment, Cosmos-assisted reasoning.
4. **Planning/Control layer** — Nav2 execution and task status tracking.
5. **Operator/Dashboard layer** — Alerts, timeline, approvals/cancel/pause, video feeds.

Reference: `docs/REASONING_LAYER_ARCHITECTURE.md`.

## Target reasoning layer ROS nodes

Defined in `docs/REASONING_LAYER_ARCHITECTURE.md`:

| Node | Role | Key Outputs | Status |
|---|---|---|---|
| `spatial_object_recognition_node` | Build unified 3D semantic scene from CCTV + robot sensors | `/perception/detections_3d`, `/perception/asset_states` | Planned |
| `cctv_visibility_monitor_node` | Detect visibility loss / blind spots in CCTV streams | `/reasoning/blindspot_events` | Planned |
| `robot_task_planner_node` | Convert events into robot tasks with guardrails + human loop | `/reasoning/task_requests`, `/ui/alerts` | Implemented |
| `robot_task_executor_node` | Execute tasks through Nav2 and report progress | `/robot/task_status` | Implemented |
| `robot_situation_assessor_node` | Assess local risk and recommend actions (Cosmos-assisted) | `/reasoning/risk_assessments`, `/ui/alerts` | Planned |

## Implemented ROS components

### Bringup stack (`modules/ros2-bringup`)

- Entry point: `ros2 launch sras_bringup go2_stack.launch.py`
- Includes: rosbridge, pointcloud_to_laserscan, slam_toolbox, Nav2, topic relays/throttles, map_republisher, vision_llm_server

### DimOS bridge stack (`modules/ros2-dimos-bridge`)

- `temporal_memory_node`, `spatial_memory_node`, `vlm_query_service`
- Experimental: `combined_memory_node`, `autonomous_explorer`

### Task planner (`modules/ros2-task-planner`)

- Multi-robot task planning with fleet config
- Human-in-the-loop guardrails

### Task executor (`modules/ros2-task-executor`)

- Multi-robot Nav2 goal tracking
- Per-robot cancel/timeout handling

### Dashboard (`modules/dashboard`)

- Navigation/control topics, robot camera feeds, Nav2 action telemetry
- WebSocket server with rosbridge connection

## Quick start (hackathon path)

### 1) Cosmos 2 PoC

```bash
cd modules/cosmos-reasoning-benchmark
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

### 2) ROS 2 bringup

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py
```

Full launch arguments and health checks: `docs/ROS2_STACK.md`, `modules/ros2-bringup/README.md`.

### 3) Dashboard

```bash
cd modules/dashboard
pnpm install
pnpm dev
```

- `apps/web-client` runs on port `3000`
- `apps/websocket-server` defaults to port `8080`

### 4) Cosmos-to-dashboard bridge

From `modules/cosmos-reasoning-benchmark`:

Option A — consume dashboard `video_frame` events (Socket.IO tap):

```bash
python3 scripts/cosmos_webrtc_bridge.py --ws-url http://localhost:8080 --interval 2.0
```

Option B — consume ROS camera topic directly:

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

Reference: `modules/ros2-dimos-bridge/README.md`.

## Demo scenario (target end-to-end flow)

1. CCTV visibility for a critical area drops (blind spot event).
2. Planner creates an inspection task and dispatches the robot.
3. Nav2 executes movement to inspection pose.
4. Situation assessor evaluates local risk using perception + Cosmos reasoning.
5. Dashboard receives alert + risk assessment + operator recommendations.
6. Operator can approve, cancel, pause, or resume actions.

## Key docs

- Main architecture: `docs/REASONING_LAYER_ARCHITECTURE.md`
- ROS stack runbook: `docs/ROS2_STACK.md`
- Cosmos guides: `docs/COSMOS_GUIDE.md`, `docs/COSMOS_PROMPT_GUIDE.md`
- Cosmos PoC details: `modules/cosmos-reasoning-benchmark/README.md`
- Bringup package: `modules/ros2-bringup/README.md`
- DimOS bridge: `modules/ros2-dimos-bridge/README.md`
- Dashboard: `modules/dashboard/research-summary.md`

## External references

- NVIDIA Cosmos overview: https://www.nvidia.com/en-us/ai/cosmos/
- NVIDIA Cosmos docs hub: https://docs.nvidia.com/cosmos/index.html
- Cosmos Cookbook: https://nvidia-cosmos.github.io/cosmos-cookbook/
- Cosmos Reason prompt guide: https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html
- ROS 2 Humble docs: https://docs.ros.org/en/humble/
- Navigation2 docs: https://docs.nav2.org/
- rosbridge suite docs: https://docs.ros.org/en/iron/p/rosbridge_suite/

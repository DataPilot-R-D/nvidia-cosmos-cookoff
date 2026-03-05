# PAIC2 -- Physical AI Command & Control

**Autonomous security robotics powered by NVIDIA Cosmos Reason2**

> In October 2025, $102 million in jewels were stolen from the Louvre in under 4 minutes. Only 39% of rooms had cameras. The one camera near the entry was pointed the wrong way. Guards weren't watching. PAIC2 is what happens when you give security robots a reasoning brain.

---

## The Problem

Facility security today is fundamentally reactive: cameras record, humans watch, and response comes minutes after the incident. Four thieves took eight crown jewels in under four minutes. The Louvre heist exposed every weakness -- 39% camera coverage, misdirected cameras, distracted operators, 8-minute response delay, and no autonomous response capability.

Cold smoke grenades make it worse. Commercially available and increasingly used by criminals, they blind standard RGB cameras instantly. Thermal cameras can see through smoke, but AI models aren't trained for these conditions.

## Our Solution

PAIC2 combines fixed CCTV cameras with autonomous mobile robots (Unitree Go2 quadruped + H1 humanoid), using **NVIDIA Cosmos Reason2** as the reasoning brain. The system:

1. **Sees** -- Cosmos Reason2 analyzes camera feeds for people, objects, anomalies
2. **Reasons** -- Detects blind spots, assesses threats, plans responses
3. **Acts** -- Dispatches robots autonomously via Nav2 navigation
4. **Informs** -- Keeps human operators in command through a real-time dashboard

### Human-Over-The-Loop (not in the loop)

PAIC2 operates autonomously by default. The operator is **informed** of every decision and **can** intervene at any time, but doesn't **have to**. Low-severity events are handled automatically. Critical events are escalated with Cosmos reasoning and a recommended action. This philosophy means zero-delay response -- the robot is already moving while the human reviews.

---

## What We Built: 5 Modules on Cosmos

### 1. Cosmos Reason2 Benchmark & Prompting Guidelines

We ran 93 tests across Cosmos Reason2-2B and 8B models, evaluating surveillance capabilities on 23 images and 3 video clips with ground truth scoring.

| Capability | Score | Key Finding |
|---|---|---|
| Scene description | 4/5 | Identifies 10-15 objects per frame, accurate materials/colors |
| Person detection | 4/5 | **5/5 without reasoning, 3/5 with** (reasoning causes false positives) |
| Relative positioning | 4/5 | 4/4 correct on LEFT/RIGHT/BEHIND tests |
| Video motion tracking | 3.5/5 | Correct direction + speed from video; fails from sequential frames |
| Cause-effect reasoning | 4/5 | Sound physics explanations |
| TTFT (streaming) | 5/5 | 181-224ms to first token -- real-time viable |
| Change detection | 2/5 | Targeted prompts only; general prompts hallucinate |
| Counting | 2.5/5 | Simple objects OK, complex scenes inconsistent |
| Distance estimation | 1.5/5 | Close objects ~7% error, far objects 72-79% error |

**Critical discoveries:**
- **Reasoning mode is a double-edged sword:** helps change detection (+1 star), but destroys person detection (5/5 -> 3/5 with false positives). **Our mitigation:** use reasoning selectively — enable it for scene analysis and threat assessment, disable it for person detection. This gives us the best of both worlds.
- **Frames beat video** for analysis (100% vs 33% success on change detection)
- **Media-before-text** prompt ordering is the single most impactful rule
- **97.6% cost savings** with tiered Cosmos architecture (2B screening + 8B deep analysis): **$60/day vs $2,500/day** for cloud VLM on every frame

**Input:** Camera frames (640p) + video clips | **Output:** Per-capability ratings, prompting rules, deployment config, cost model

### 2. Person Detection with Position Mapping

3 CCTV cameras triangulate person positions into a unified map frame. Cosmos identified **53 objects across 37 unique classes** (paintings, benches, fire extinguishers, doors, display cases) in a single scene pass.

Combined with our DimOS memory layer, the system tracks entities through a detection buffer state machine:

```
new_class -> sustained_presence -> position_shift -> disappeared
```

This gives temporal context -- not just "person detected" but "person appeared 30 seconds ago, moved from Gallery A to Gallery B, now near exit."

**Input:** CCTV/robot camera frames + robot odometry | **Output:** 3D detections in map frame + entity history

### 3. Cosmos-Powered Task Planning (Multi-Robot)

When a security event occurs (blind spot, anomaly, intruder), the planner uses priority scoring to generate and dispatch tasks:

- **Priority = severity x confidence x recency x asset_criticality**
- Auto-approve tasks scoring below 0.55 (low severity, handled autonomously)
- Escalate tasks scoring 0.55+ to operator with Cosmos reasoning and recommended action
- Multi-robot assignment: e.g. Go2 (quadruped) -> PURSUE_THIEF, H1 (humanoid) -> BLOCK_EXIT
- Optional Cosmos deep planning via LangGraph for complex scenarios

**Input:** Security events + map + fleet state | **Output:** Prioritized task queue + robot assignments

### 4. Multi-Robot Task Execution

Nav2-based execution engine that manages task lifecycle across multiple robots:

```
QUEUED -> DISPATCHED -> ACTIVE -> SUCCEEDED / FAILED / CANCELED / PAUSED
```

Readiness gates ensure safe dispatch: **map ready + TF ready + Nav2 ready** before any robot moves. Operator controls at every stage: approve, cancel, pause, resume, or redefine the task. Per-robot Nav2 action servers enable independent navigation.

Supports NavigateToPose (single goal) and NavigateThroughPoses (patrol routes), with per-robot timeout handling and recovery behaviors.

**Input:** Task requests from planner | **Output:** Execution status + robot position updates

### 5. LoRA Extension: Smoke-Resilient Person Detection

We extended Cosmos Reason2-2B with a LoRA adapter trained on 164 real thermal images (FLIR/KAIST) to detect people through cold smoke.

| Metric | Zero-Shot | LoRA v6a | Improvement |
|---|---|---|---|
| **Person Detection** | 53.3% | **96.2%** | **+42.9 pp** |
| **Smoke Detection** | 78.6% | **99.2%** | **+20.6 pp** |

The hardest category -- people obscured by heavy smoke -- improved from 55.6% to 91.1%. Zero false positives on smoke-only images (C_real: 100% correct).

We iterated through 4 versions to find the champion:
- **v3** (synthetic data, 512px): 93% -- proved LoRA works
- **v5** (mixed data, 1024px): 79% -- **regression** (higher resolution hurts thermal)
- **v6a** (real data only, 512px): **96.2%** -- **champion** (real >> synthetic)
- **v6b** (mixed data, 512px): 94% -- confirms synthetic data is a net negative

Key specs: 278 MB adapter (vs 4.5 GB base), 20 min training, $0.30/run, 164 real thermal training images, 131-image test set with human QA review (94.5% approval on 200 images).

**This proves Cosmos is extensible** -- domain-specific LoRA adapters can push its capabilities far beyond zero-shot for Physical AI applications.

**Input:** Thermal camera images (FLIR/KAIST) | **Output:** Person detection + smoke density + threat assessment

### Additional: Command & Control Dashboard

Real-time web dashboard (Next.js + Bun WebSocket) that embodies Human-Over-The-Loop:

- Live video feeds (WebRTC) from all cameras
- 2D map with robot positions and navigation goals
- Alert timeline with Cosmos reasoning explanations
- Approve / cancel / pause / resume controls
- LiDAR point cloud visualization
- Full audit logging of all actions

---

## Architecture

```
                    PAIC2 Architecture (5 Layers)

 Layer 5: OPERATOR DASHBOARD
 +---------------------------------------------------------+
 | Web UI: alerts, video feeds, map, controls              |
 | Human-Over-The-Loop: informed, can intervene             |
 +---------------------------------------------------------+
                           |
 Layer 4: PLANNING / CONTROL
 +---------------------------------------------------------+
 | Task Planner (priority scoring, multi-robot assignment)  |
 | Task Executor (Nav2, NavigateToPose, patrol routes)      |
 +---------------------------------------------------------+
                           |
 Layer 3: REASONING (Cosmos-powered)
 +---------------------------------------------------------+
 | Blind spot detection | Threat assessment | Task gen      |
 | Cosmos Reason2-8B + optional LoRA adapters               |
 +---------------------------------------------------------+
                           |
 Layer 2: PERCEPTION
 +---------------------------------------------------------+
 | Person detection | Position mapping | Scene description  |
 | DimOS memory (temporal + spatial) | Entity tracking      |
 +---------------------------------------------------------+
                           |
 Layer 1: SENSORS / SIMULATION
 +---------------------------------------------------------+
 | 3x CCTV cameras | Unitree Go2 (camera + LiDAR + IMU)    |
 | Isaac Sim (sim2real digital twin)                        |
 | Thermal camera (FLIR) for smoke scenarios                |
 +---------------------------------------------------------+
```

### End-to-End Flow

```
CCTV blind spot detected
  -> Cosmos reasons: "Camera feed lost in high-value area"
  -> Planner scores priority, creates INSPECT_BLINDSPOT task
  -> Executor dispatches nearest robot via Nav2
  -> Robot arrives, camera feeds to Cosmos
  -> Cosmos: "Person detected near display case, threat: HIGH"
  -> Dashboard alerts operator with reasoning + video + recommendation
  -> Operator can intervene or let system continue
```

---

## Use Cases

### Museum / Gallery Security (Primary)

The Louvre scenario: blind spot detection, autonomous inspection, real-time threat assessment. Every failure in the 2025 heist maps to a PAIC2 capability.

### Warehouse / Logistics

Camera failure or obstruction in large facilities. Robot provides temporary coverage. Thermal + LoRA adapter for smoke-screen detection during break-ins.

### Any Facility with CCTV

Office buildings, data centers, industrial sites. PAIC2 augments existing camera infrastructure with autonomous mobile response.

---

## Repository Layout

```
modules/
  cosmos-reasoning-benchmark/  Cosmos Reason2 benchmarking + prompting guidelines    [Complete]
  cosmos-lora-smoke/           LoRA fine-tuning for thermal person detection          [Complete]
  dashboard/                   Real-time web command center (Next.js + Bun)           [Functional]
  ros2-task-planner/           Multi-robot task planning with Cosmos reasoning        [Functional]
  ros2-task-executor/          Nav2-based task execution engine                       [Scaffold]
  ros2-bringup/                ROS 2 launch stack (rosbridge, SLAM, Nav2)             [Functional]
  ros2-dimos-bridge/           DimOS temporal/spatial memory nodes                    [Functional]
  simulation/                  Isaac Sim digital twin (Unitree Go2)                   [Functional]
  platform/                    Multi-repo orchestration + governance                  [Complete]
infra/
  isaac-sim/                   AWS infrastructure (CloudFormation, VPN)
docs/                          Architecture specs, runbooks, guides
notes/                         Presentation research notes
```

**Status key:** Complete = fully tested & documented | Functional = working, integrated | Scaffold = interface defined, partial implementation

## Prerequisites

This is a multi-module Physical AI system. Not every module needs to run on the same machine. The typical deployment uses 2-3 machines:

| Requirement | What needs it | Notes |
|---|---|---|
| **NVIDIA GPU (24GB+ VRAM)** | Cosmos inference, LoRA training, Isaac Sim | RTX 3090, L4, L40S, or RTX 4090 |
| **ROS 2 Humble** | Task planner, executor, bringup, DimOS bridge | Ubuntu 22.04 required |
| **Unitree Go2** (or Isaac Sim) | Physical robot or simulated twin | Connected via ROS 2 |
| **Node.js 22+ / Bun 1.3+** | Dashboard | Also needs pnpm 10+ |
| **Python 3.10+** | All Python modules | Separate venvs recommended |
| **Cosmos API endpoint** | Benchmark, reasoning | vLLM on RunPod or self-hosted |

### GPU sizing

| Task | Min VRAM | Recommended |
|---|---|---|
| Cosmos Reason2-2B inference | 8 GB | 16 GB |
| Cosmos Reason2-8B inference | 24 GB | 40 GB (L40S) |
| LoRA training (2B) | 24 GB | 24 GB (L4, RTX 3090) |
| Isaac Sim | 16 GB | 24 GB (RTX 4090) |

---

## Setup

> **Fastest demo:** To see Cosmos reasoning in action without robots or ROS, run [Module 1: Cosmos Benchmark](#1-cosmos-benchmark--prompting-guidelines) — it only needs a GPU endpoint and Python.

```bash
git clone https://github.com/DataPilot-R-D/nvidia-cosmos-cookoff.git
cd nvidia-cosmos-cookoff
```

### 1. Cosmos Benchmark & Prompting Guidelines

Runs standalone. Requires a Cosmos API endpoint (vLLM on RunPod or self-hosted).

```bash
cd modules/cosmos-reasoning-benchmark
cp .env.example .env
# Edit .env: set COSMOS_API_BASE, RUNPOD_API_KEY, HF_ACCESS_TOKEN

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Bootstrap a RunPod instance with Cosmos (optional — skip if self-hosting)
# --bootstrap-service provisions the vLLM pod; --export writes connection details to .env
python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export

# Run benchmarks
python3 scripts/run_benchmarks_v3.py
```

**Key env vars:** **COSMOS_API_BASE**, **COSMOS_MODEL** (default: `nvidia/Cosmos-Reason2-8B`), **RUNPOD_API_KEY**, **HF_ACCESS_TOKEN**

### 2. LoRA Smoke Detection

Requires a GPU for training. GPU strongly recommended for inference; CPU inference is impractically slow for 2B+ parameter models.

```bash
cd modules/cosmos-lora-smoke
python3 -m venv .venv && source .venv/bin/activate
pip install torch>=2.1 transformers>=4.38 peft>=0.8 pillow numpy

export VARIANT=v6a

# Option A: Train from scratch (~20 min on L4 GPU, ~$0.30)
python training/train_lora.py

# Option B: Download pre-trained adapter (278MB)
# https://github.com/DataPilot-R-D/Smoke-Resilient-Intruder-Detection
# Place weights in: adapters/v6a/

# Run benchmark against 131-image test set
python benchmark/benchmark.py
```

**Training config:** `training/config.yaml` — LoRA rank 16, alpha 32, 3 epochs, bf16 precision, 512px images

### 3. ROS 2 Stack (Bringup + Planner + Executor)

Requires Ubuntu 22.04 with ROS 2 Humble installed. Runs on the robot host or a connected machine.

```bash
# Install ROS 2 Humble (if not already)
# https://docs.ros.org/en/humble/Installation/Ubuntu-Install-Debs.html

# Build all ROS 2 packages
source /opt/ros/humble/setup.bash
cd ~/ros2_ws/src
# Package names (sras_*) are ROS 2 package identifiers — they differ from module directory names
ln -s /path/to/modules/ros2-bringup sras_bringup
ln -s /path/to/modules/ros2-task-planner sras_robot_task_planner
ln -s /path/to/modules/ros2-task-executor sras_robot_task_executor
ln -s /path/to/modules/ros2-dimos-bridge dimos_vlm_bridge
cd ~/ros2_ws
colcon build

# Launch the full stack (rosbridge + SLAM + Nav2 + LiDAR)
source install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py \
  map:=/path/to/your/map.yaml \
  nav2_params:=/path/to/nav2_params.yaml

# In separate terminals:
ros2 run sras_robot_task_planner robot_task_planner_node
ros2 run sras_robot_task_executor robot_task_executor_node
```

**What this launches:** rosbridge (:9090), slam_toolbox, Nav2, pointcloud_to_laserscan, cmd_vel relay, camera throttling

**DimOS memory layer** (optional, separate terminal):
```bash
ros2 launch dimos_vlm_bridge temporal_memory.launch.py
# Requires VLM backend: set OPENAI_API_KEY (default) or use a local model:
# --ros-args -p vlm_backend:=moondream_local (Moondream — lightweight, no API key needed)
```

### 4. Dashboard

Runs anywhere with network access to the WebSocket server. No GPU needed.

```bash
cd modules/dashboard
pnpm install    # Requires pnpm 10+, Node.js 22+

# Set environment (see also apps/web-client/.env.example and apps/websocket-server/.env.example)
export ROS_BRIDGE_URL=ws://your-robot-host:9090  # rosbridge address

# Start all apps (web client :3000 + websocket server :8081)
pnpm dev

# Or with Docker (path is relative to modules/dashboard/)
docker compose -f docker/docker-compose.yml up
```

**Ports:** Web UI on `:3000`, WebSocket server on `:8081`, rosbridge on `:9090`, go2rtc on `:1984`

### 5. Isaac Sim (Simulation)

Required only if running without a physical robot. Needs a powerful GPU workstation or cloud instance (we use AWS g6.4xlarge with L40).

```bash
# Install Isaac Sim 4.5 + Isaac Lab
# https://isaac-sim.github.io/IsaacLab/main/source/setup/installation/pip_installation.html

cd modules/simulation
./run_sim.sh          # Go2 with keyboard control (WASD)
./run_sim_g1.sh       # G1 humanoid
./run_louvre_demo.sh   # Museum scenario
```

**ROS 2 topics published by sim:** `/robot0/odom`, `/robot0/front_cam/rgb` (2Hz), `/robot0/point_cloud2_L1` (1Hz), `/robot0/imu`, `/tf`

### 6. Cosmos-to-Dashboard Bridge

Connects a running Cosmos endpoint to the dashboard for live scene analysis.

```bash
python3 modules/cosmos-reasoning-benchmark/scripts/cosmos_webrtc_bridge.py \
  --ws-url http://localhost:8081 --interval 2.0
```

### Typical deployment topology

```
 Machine A (GPU server / RunPod)         Machine B (Robot host / Sim)
 ┌──────────────────────────┐           ┌──────────────────────────┐
 │ Cosmos vLLM (:8899)      │           │ ROS 2 Humble             │
 │ LoRA inference            │◄─────────│  ros2-bringup            │
 └──────────────────────────┘   API     │  ros2-task-planner       │
                                        │  ros2-task-executor      │
 Machine C (any laptop/desktop)         │  ros2-dimos-bridge       │
 ┌──────────────────────────┐           │  rosbridge (:9090)       │
 │ Dashboard (:3000)        │◄─────────│  Isaac Sim (or Go2)      │
 │ WS Server (:8081)        │    WS     └──────────────────────────┘
 │ Cosmos bridge             │
 └──────────────────────────┘
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Connection refused` on `:8899` | vLLM not ready yet (Cosmos models take 2-5 min to load) | Wait for `Uvicorn running on` in vLLM logs |
| `Connection refused` on `:9090` | rosbridge not running | `ros2 launch rosbridge_server rosbridge_websocket_launch.xml` |
| Nav2 timeout / robot not moving | TF tree incomplete or map not loaded | Check `ros2 topic echo /tf` and verify map YAML path |
| Dashboard shows no video | WebRTC ICE failure across networks | Ensure go2rtc is running (`:1984`) and ports are accessible |
| LoRA training OOM | Insufficient VRAM for batch size | Reduce `per_device_train_batch_size` in `training/config.yaml` |

---

## Key Results

| Achievement | Detail |
|---|---|
| Cosmos benchmark | 93+ tests, 4/5 person detection, 181ms TTFT, prompting guidelines |
| Cost savings | **97.6%** -- $60/day (Cosmos 2B+8B tiered) vs $2,500/day (cloud VLM) |
| LoRA smoke detection | **53.3% -> 96.2%** person detection through smoke (+42.9 pp) |
| LoRA efficiency | 278MB adapter, 20 min training, $0.30, zero false positives |
| Scene understanding | 53 objects mapped, 37 unique classes, 3-camera triangulation |
| Multi-robot planning | Priority scoring + auto-dispatch + Go2/H1 coordination |
| Human-Over-The-Loop | Autonomous operation with operator override at every stage |
| Dashboard | Real-time C2 with WebRTC video, 2D map, LiDAR, audit logging |

---

## Documentation

| Document | Path |
|---|---|
| Architecture spec | `docs/REASONING_LAYER_ARCHITECTURE.md` |
| Cosmos benchmark report | `modules/cosmos-reasoning-benchmark/docs/FINAL_REPORT.md` |
| Cosmos prompting guide | `docs/COSMOS_PROMPT_GUIDE.md` |
| LoRA methodology | `modules/cosmos-lora-smoke/docs/methodology.md` |
| LoRA benchmark results | `modules/cosmos-lora-smoke/benchmark/results/v6a_results.md` |
| Thermal imaging primer | `modules/cosmos-lora-smoke/docs/thermal_primer.md` |
| ROS 2 stack runbook | `docs/ROS2_STACK.md` |
| Presentation notes | `notes/` |

## Tech Stack

| Component | Technology |
|---|---|
| Vision AI | NVIDIA Cosmos Reason2-8B + LoRA (2B) |
| Inference | vLLM on RunPod (L4 GPU) |
| Robot | Unitree Go2 + ROS 2 Humble |
| Navigation | Nav2 + slam_toolbox |
| Simulation | Isaac Sim 4.5 + Isaac Lab |
| Dashboard | Next.js 14 + Bun + MessagePack |
| Memory | DimOS (temporal/spatial) + SQLite |
| Bridge | rosbridge_suite + WebSocket |

## Why Cosmos Over Standard VLMs

| Capability | Standard VLMs | Cosmos Reason2 |
|---|---|---|
| Physical-world reasoning | Limited (trained on web data) | Native (trained on physical world video) |
| Temporal understanding | Single-frame only | Multi-frame motion + cause-effect |
| Streaming latency | 500ms-2s TTFT typical | 181-224ms TTFT (real-time viable) |
| Domain extension | Full fine-tune ($$$) | LoRA adapter: 20 min, $0.30, 278MB |
| Deployment cost | $2,500/day (cloud VLM on every frame) | $60/day (tiered 2B+8B) = **97.6% savings** |
| Deployment model | Cloud API lock-in | Self-hosted vLLM on any GPU |

Cosmos is purpose-built for Physical AI: it understands spatial relationships, object physics, and temporal sequences in a way that general-purpose VLMs do not. The LoRA extensibility makes it a **platform** — we proved this by adding smoke-resilient detection without touching the base model.

## Team

**DataPilot R&D** -- Physical AI & Robotics Division

## References

- [NVIDIA Cosmos Cookoff](https://forums.developer.nvidia.com/t/the-nvidia-cosmos-cookoff-is-here/359090)
- [NVIDIA Cosmos Reason2](https://docs.nvidia.com/cosmos/latest/reason2/index.html)
- [Cosmos Cookbook](https://nvidia-cosmos.github.io/cosmos-cookbook/)
- [Cosmos Prompt Guide](https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html)
- [Smoke-Resilient Intruder Detection (LoRA source)](https://github.com/DataPilot-R-D/Smoke-Resilient-Intruder-Detection)
- [2025 Louvre Heist](https://en.wikipedia.org/wiki/2025_Louvre_heist)
- [ROS 2 Humble](https://docs.ros.org/en/humble/)
- [Navigation2](https://docs.nav2.org/)

---

> **Cosmos sees. Cosmos reasons. Robots act. Humans stay over the loop.**

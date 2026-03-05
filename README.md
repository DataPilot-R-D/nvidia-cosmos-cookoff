# SRAS -- Security Robot Automation System

**Autonomous security robotics powered by NVIDIA Cosmos Reason2**

> In October 2025, $102 million in jewels were stolen from the Louvre in under 4 minutes. Only 39% of rooms had cameras. The one camera near the entry was pointed the wrong way. Guards weren't watching. SRAS is what happens when you give security robots a reasoning brain.

---

## The Problem

Facility security today is fundamentally reactive: cameras record, humans watch, and response comes minutes after the incident. The Louvre heist exposed every weakness -- blind spots in coverage, misdirected cameras, distracted operators, and no autonomous response capability.

Cold smoke grenades make it worse. Commercially available and increasingly used by criminals, they blind standard RGB cameras instantly. Thermal cameras can see through smoke, but AI models aren't trained for these conditions.

## Our Solution

SRAS combines fixed CCTV cameras with an autonomous mobile robot (Unitree Go2), using **NVIDIA Cosmos Reason2** as the reasoning brain. The system:

1. **Sees** -- Cosmos Reason2 analyzes camera feeds for people, objects, anomalies
2. **Reasons** -- Detects blind spots, assesses threats, plans responses
3. **Acts** -- Dispatches robots autonomously via Nav2 navigation
4. **Informs** -- Keeps human operators in command through a real-time dashboard

### Human-Over-The-Loop (not in the loop)

SRAS operates autonomously by default. The operator is **informed** of every decision and **can** intervene at any time, but doesn't **have to**. Low-severity events are handled automatically. Critical events are escalated with Cosmos reasoning and a recommended action. This philosophy means zero-delay response -- the robot is already moving while the human reviews.

---

## What We Built: 5 Modules on Cosmos

### 1. Cosmos Reason2 Benchmark & Prompting Guidelines

We ran 93 tests across Cosmos Reason2-2B and 8B models, evaluating surveillance capabilities on 24 images and 3 video clips with ground truth scoring.

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
- **Reasoning mode is a double-edged sword:** helps change detection (+1 star), but destroys person detection (5/5 -> 3/5 with false positives)
- **Frames beat video** for analysis (100% vs 33% success on change detection)
- **Media-before-text** prompt ordering is the single most impactful rule
- **97.6% cost savings** with Cosmos+Claude hybrid architecture vs Claude-only ($60/day vs $2,500/day)

**Input:** Camera frames (640p) + video clips | **Output:** Per-capability ratings, prompting rules, deployment config, cost model

### 2. Person Detection with Position Mapping

Cosmos detects people and maps their positions to a unified coordinate frame. Combined with our DimOS memory layer (temporal + spatial memory nodes), the system tracks _who was where and when_.

**Input:** CCTV/robot camera frames + robot odometry | **Output:** 3D detections in map frame + entity history

### 3. Cosmos-Powered Task Planning (Multi-Robot)

When a security event occurs (blind spot, anomaly, intruder), the planner uses priority scoring to generate and dispatch tasks:

- **Severity + confidence + recency + asset criticality** = priority score
- Auto-approve low-severity tasks (configurable threshold)
- Escalate critical tasks to operator with Cosmos reasoning
- Multi-robot assignment with fair load distribution
- Optional Cosmos deep planning via LangGraph for complex scenarios

**Input:** Security events + map + fleet state | **Output:** Prioritized task queue + robot assignments

### 4. Multi-Robot Task Execution

Nav2-based execution engine that manages task lifecycle across multiple robots:

```
QUEUED -> DISPATCHED -> IN_PROGRESS -> SUCCEEDED / FAILED / CANCELED / PAUSED
```

Supports NavigateToPose (single goal) and NavigateThroughPoses (patrol routes), with per-robot timeout handling and recovery behaviors.

**Input:** Task requests from planner | **Output:** Execution status + robot position updates

### 5. LoRA Extension: Smoke-Resilient Person Detection

We extended Cosmos Reason2-2B with a LoRA adapter trained on 667 real thermal images to detect people through cold smoke.

| Metric | Zero-Shot | LoRA v6a | Improvement |
|---|---|---|---|
| **Person Detection** | 53.3% | **96.2%** | **+42.9 pp** |
| **Smoke Detection** | 78.6% | **99.2%** | **+20.6 pp** |

The hardest category -- people obscured by heavy smoke -- improved from 55.6% to 91.1%.

- 278 MB adapter (vs 4.5 GB base model)
- 20 minutes training on RTX 3090
- $0.30 per training run
- Zero false positives on smoke-only images

**This proves Cosmos is extensible** -- domain-specific LoRA adapters can push its capabilities far beyond zero-shot for Physical AI applications.

**Input:** Thermal camera images | **Output:** Person detection + smoke density + threat assessment

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
                    SRAS Architecture (5 Layers)

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

The Louvre scenario: blind spot detection, autonomous inspection, real-time threat assessment. Every failure in the 2025 heist maps to an SRAS capability.

### Warehouse / Logistics

Camera failure or obstruction in large facilities. Robot provides temporary coverage. Thermal + LoRA adapter for smoke-screen detection during break-ins.

### Any Facility with CCTV

Office buildings, data centers, industrial sites. SRAS augments existing camera infrastructure with autonomous mobile response.

---

## Repository Layout

```
modules/
  cosmos-reasoning-benchmark/  Cosmos Reason2 benchmarking + prompting guidelines
  cosmos-lora-smoke/           LoRA fine-tuning for thermal person detection through smoke
  dashboard/                   Real-time web command center (Next.js + Bun)
  ros2-task-planner/           Multi-robot task planning with Cosmos reasoning
  ros2-task-executor/          Nav2-based task execution engine
  ros2-bringup/                ROS 2 launch stack (rosbridge, SLAM, Nav2)
  ros2-dimos-bridge/           DimOS temporal/spatial memory nodes
  simulation/                  Isaac Sim digital twin (Unitree Go2)
  platform/                    Multi-repo orchestration + governance
infra/
  isaac-sim/                   AWS infrastructure (CloudFormation, VPN)
docs/                          Architecture specs, runbooks, guides
notes/                         Presentation research notes
```

## Quick Start

### Cosmos Benchmark

```bash
cd modules/cosmos-reasoning-benchmark
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/run_benchmarks_v3.py
```

### LoRA Smoke Detection

```bash
cd modules/cosmos-lora-smoke
pip install torch transformers peft pillow
export VARIANT=v6a
python training/train_lora.py
python benchmark/benchmark.py
```

### ROS 2 Stack

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py
```

### Dashboard

```bash
cd modules/dashboard
pnpm install
pnpm dev
```

### Cosmos-to-Dashboard Bridge

```bash
python3 modules/cosmos-reasoning-benchmark/scripts/cosmos_webrtc_bridge.py \
  --ws-url http://localhost:8080 --interval 2.0
```

---

## Key Results

| Achievement | Detail |
|---|---|
| Cosmos benchmark | 4/5 person detection, prompting guidelines documented |
| LoRA smoke detection | 53.3% -> 96.2% person detection through smoke |
| LoRA efficiency | 278MB adapter, 20 min training, $0.30 |
| Multi-robot planning | Priority scoring + auto-dispatch + Cosmos reasoning |
| Human-Over-The-Loop | Autonomous operation with operator override |
| Dashboard | Real-time C2 with video, map, alerts, controls |

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

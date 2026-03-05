# System Overview: SRAS

## What is SRAS?

Security Robot Automation System - an autonomous security robotics platform that uses NVIDIA Cosmos Reason2 as its "reasoning brain" to:
- Monitor facility security via CCTV + mobile robot
- Detect and respond to security incidents autonomously
- Keep human operators informed (Human-Over-The-Loop)

## Philosophy: Human-Over-The-Loop (NOT Human-In-The-Loop)

- System operates autonomously by default
- Human is INFORMED of decisions and CAN intervene
- Human does NOT need to approve every action
- Auto-approve threshold for low-severity tasks (configurable)
- Critical tasks escalated to operator with recommendation
- Operator can cancel/pause/resume at any time

This is fundamentally different from Human-In-The-Loop where human approval blocks every action.

## Architecture: 5 Layers

```
Layer 1: SENSORS / SIMULATION
  - 3x fixed CCTV cameras (or Isaac Sim synthetic feeds)
  - 1x mobile robot (Unitree Go2) with onboard camera + LiDAR
  - Thermal camera (FLIR) for smoke-penetrating detection

Layer 2: PERCEPTION
  - Cosmos Reason2-8B processes camera frames
  - Person detection, object recognition, scene description
  - LoRA adapter for smoke-resilient thermal detection
  - 3D position estimation in map frame

Layer 3: REASONING (Cosmos-powered)
  - Blind spot detection (CCTV coverage monitoring)
  - Task generation (what should the robot do?)
  - Situation assessment (what's the risk level?)
  - Multi-robot decision making (which robot goes where?)

Layer 4: PLANNING / CONTROL
  - Nav2 path planning and execution
  - Multi-robot task distribution
  - Priority scoring and queue management

Layer 5: OPERATOR DASHBOARD
  - Real-time video feeds (WebRTC)
  - Alert timeline with risk assessments
  - Approve/cancel/pause/resume controls
  - Map visualization with robot position
```

## Core Data Flow

```
CCTV detects blind spot
  -> Cosmos reasons about the event
  -> Task planner creates inspection task
  -> Task executor sends robot via Nav2
  -> Robot arrives, camera feeds Cosmos
  -> Cosmos assesses risk (person? smoke? threat level?)
  -> Dashboard shows alert to operator
  -> Operator can intervene or let system continue
```

## Use Cases

### Primary: Museum/Gallery Security
- Louvre-style blind spot detection
- After-hours patrol with anomaly detection
- Intruder detection even through smoke screens

### Secondary: Warehouse Security
- Camera failure / obstruction detection
- Autonomous patrol of large spaces
- Integration with existing CCTV infrastructure

### Tertiary: Any Facility
- Office buildings, data centers, industrial sites
- Anywhere with CCTV + need for autonomous response

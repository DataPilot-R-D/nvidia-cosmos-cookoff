# PAIC2 C1-C5 Architecture and Dependency Graphs

Last verified: 2026-02-26.

This document provides connected architecture views from system context to runtime deployment/dependency level.

Note: C4 officially defines C1-C4. This document adds a practical `C5` runtime/dependency view for PAIC2 operations.

## C1: System Context

## Description

PAIC2 sits between physical/simulated robot systems and human operators. It integrates ROS2 runtime, reasoning services, dashboard control surfaces, and external AI/model infrastructure.

## Mermaid

```mermaid
flowchart LR
    OP[Operator]
    SEC[Security Team]
    PAIC2[PAIC2 Platform]
    ROBOT[Unitree Go2 / Isaac Sim]
    AI[AI Services<br/>RunPod Cosmos / OpenAI-compatible]
    AWS[AWS Infrastructure]

    OP -->|Monitor & Command| PAIC2
    SEC -->|Policy / Incident Rules| PAIC2
    ROBOT -->|Telemetry, Video, Maps| PAIC2
    PAIC2 -->|Navigation / Task Commands| ROBOT
    PAIC2 <--> |Inference / Reasoning APIs| AI
    PAIC2 <--> |Compute, Network, Storage| AWS
```

## ASCII

```text
+------------------+      +---------------------+      +-------------------+
|    Operator      | ---> |    PAIC2 Platform   | ---> | Unitree/Isaac Sim |
| Security Team    | <--- | (Control + Reason)  | <--- |   Robot Runtime   |
+------------------+      +----------+----------+      +-------------------+
                                     |
                                     v
                         +----------------------------+
                         | AI Services + AWS Infra    |
                         | Cosmos / OpenAI / Compute  |
                         +----------------------------+
```

## C2: Container View

## Description

PAIC2 decomposes into containers that exchange ROS topics, Socket.IO events, HTTP APIs, and model inference calls.

## Mermaid

```mermaid
flowchart LR
    subgraph DASH[Dashboard Repo]
      WEB[web-client<br/>Next.js]
      WSG[websocket-server<br/>Bun + Socket.IO + REST]
      PYB[ros-bridge<br/>Python bridge/scaffold]
    end

    subgraph ROS[ROS Runtime Repos]
      BRING[sras_bringup]
      PLAN[task_planner]
      EXEC[task_executor]
      DIMOS[dimos_vlm_bridge]
    end

    subgraph EXP[Reasoning + Sim]
      COSMOS[cosmos-poc]
      SIM[go2_omniverse]
    end

    WEB <--> |Socket.IO + HTTP| WSG
    PYB <--> |WS events| WSG
    WSG <--> |rosbridge JSON/WS| BRING
    PLAN -->|/reasoning/task_requests| EXEC
    EXEC -->|/robot/task_status| PLAN
    PLAN -->|/ui/alerts| WSG
    EXEC -->|/ui/alerts| WSG
    BRING -->|camera/map/topics| PLAN
    BRING -->|camera/map/topics| EXEC
    BRING <--> |sensor/map/nav topics| DIMOS
    SIM -->|robot topics + cmd_vel| BRING
    COSMOS <--> |events/video/inference| WSG
    COSMOS <--> |vision/reasoning APIs| PLAN
```

## ASCII

```text
[web-client] <---- Socket.IO/HTTP ----> [websocket-server] <----> [ros-bridge]
                                              |
                                              | rosbridge
                                              v
                                       [sras_bringup]
                                          |     |
                                          |     +--> [dimos_vlm_bridge]
                                          |
                              +-----------+-----------+
                              |                       |
                        [task_planner] <----------> [task_executor]
                              |
                              +---- alerts/status ---> [websocket-server]

[go2_omniverse] ---> ROS topics/cmd_vel ---> [sras_bringup]
[cosmos-poc] <---- socket/events/api ----> [websocket-server]
```

## C3: Component View

## Description

This level breaks down major containers into core components and tracks direct dependency lines.

## Mermaid

```mermaid
flowchart TB
    subgraph WC[web-client]
      AUTH[Auth + Middleware]
      HOOK[use-websocket hook]
      STORES[Zustand stores]
      WIDGETS[Dashboard widgets]
      AUTH --> HOOK
      HOOK --> STORES
      STORES --> WIDGETS
    end

    subgraph WS[websocket-server]
      GATE[Socket.IO gateway]
      ROSC[rosbridge client handler]
      MAPM[map-manager]
      APIS[REST route modules]
      CAM[camera/webrtc handlers]
      GATE --> ROSC
      GATE --> MAPM
      GATE --> CAM
      APIS --> MAPM
    end

    subgraph PR[planner]
      PNODE[robot_task_planner_node]
      PCORE[planner_core]
      PDEE[cosmos_deep_planner]
      PJOUR[planner_journal]
      PNODE --> PCORE
      PCORE --> PDEE
      PNODE --> PJOUR
    end

    subgraph EX[executor]
      ENODE[robot_task_executor_node]
      ECORE[execution_core]
      NAV[NavigateToPose / NavigateThroughPoses]
      ENODE --> ECORE
      ENODE --> NAV
    end

    subgraph BR[sras_bringup launch]
      NAV2[Nav2 include]
      SLAM[slam_toolbox]
      RBR[rosbridge include]
      REL[relay/throttle + map_republisher]
      VLM[vision_llm_server]
    end

    HOOK <--> GATE
    ROSC <--> RBR
    PNODE --> ENODE
    ENODE --> PNODE
    BR --> PNODE
    BR --> ENODE
```

## ASCII

```text
web-client:
  Auth -> use-websocket -> stores -> widgets

websocket-server:
  gateway -> rosbridge-client
  gateway -> map-manager
  gateway -> camera/webrtc
  REST routes -> map-manager

planner:
  planner_node -> planner_core -> cosmos_deep_planner
  planner_node -> planner_journal

executor:
  executor_node -> execution_core -> Nav2 actions

bringup:
  Nav2 + SLAM + rosbridge + relays + map_republisher + vision_llm_server

cross-links:
  web-client <-> websocket-server
  planner <-> executor
  bringup -> planner/executor
```

## C4: Module Dependency View

## Description

This level maps implementation modules and package-level dependencies that affect build and runtime behavior.

## Mermaid

```mermaid
flowchart LR
    subgraph DBD[Dashboard modules]
      IDX[index.ts]
      RH[handlers/rosbridge/client.ts]
      MM[services/map-manager.ts]
      UH[use-websocket.ts]
      ST[@workspace/shared-types]
      IDX --> RH
      IDX --> MM
      UH --> ST
      RH --> MM
      IDX --> ST
    end

    subgraph ROSMOD[ROS modules]
      PLN[planner node/core]
      EXE[executor node/core]
      BRG[bringup launch]
      DIM[dimos nodes]
      BRG --> PLN
      BRG --> EXE
      PLN --> EXE
      EXE --> PLN
      BRG --> DIM
    end

    subgraph EXPMOD[Reasoning and sim modules]
      CAG[src/agents/v3/runtime.py]
      CCL[src/connectors/cosmos_client.py]
      CBR[src/bridge/ros2_cosmos_bridge.py]
      SIMRUN[go2_omniverse/ros2.py]
      CAG --> CCL
      CBR --> CAG
      SIMRUN --> BRG
      CBR --> IDX
    end
```

## ASCII

```text
Dashboard_Robotics:
  index.ts -> handlers/rosbridge/client.ts
  index.ts -> services/map-manager.ts
  use-websocket.ts -> @workspace/shared-types
  handlers/rosbridge/client.ts -> services/map-manager.ts

ROS repos:
  bringup launch -> planner node/core
  bringup launch -> executor node/core
  planner -> executor (task requests)
  executor -> planner (task status)
  bringup -> dimos nodes

Cosmos + Sim:
  runtime.py -> cosmos_client.py
  ros2_cosmos_bridge.py -> runtime.py
  go2_omniverse ros2.py -> bringup topic surface
  ros2_cosmos_bridge.py -> dashboard websocket/API
```

## C5: Runtime Deployment and External Dependency View

## Description

C5 tracks where components run, which external infrastructure they depend on, and the primary operational interfaces/ports.

## Mermaid

```mermaid
flowchart TB
    DEV[Developer Workstation<br/>paic2-platform + submodules]
    BROWSER[Operator Browser]

    subgraph EC2[AWS EC2 isaac-sim-1]
      ROSWS[ROS2 Workspace<br/>bringup/planner/executor/dimos]
      DASHSVC[websocket-server]
      WEBSVC[web-client service]
      GO2RTC[go2rtc/stream stack]
      LM[local OpenAI-compatible endpoint :1234 optional]
    end

    subgraph RUNPOD[RunPod Cosmos Pod]
      VLLM[vLLM server :8899]
      VOL[persistent volume]
    end

    AWSAPI[AWS SSM/Secrets]
    RPAPI[RunPod API + runpodctl]

    DEV -->|bootstrap + lock sync| ROSWS
    BROWSER <--> |HTTP/WS| WEBSVC
    WEBSVC <--> |Socket.IO/REST| DASHSVC
    DASHSVC <--> |rosbridge :9090| ROSWS
    ROSWS <--> |camera/video| GO2RTC
    ROSWS <--> |optional VLM| LM
    DASHSVC <--> |inference HTTP| VLLM
    DEV <--> |manage pod| RPAPI
    RPAPI <--> RUNPOD
    RUNPOD --- VOL
    ROSWS <--> AWSAPI
```

## ASCII

```text
[Developer WS] -- lock/bootstrap --> [AWS EC2: ROS2 Workspace + Dashboard]
      |                                         |
      | manage                                  | rosbridge:9090 / Socket.IO / REST
      v                                         v
[RunPod API + runpodctl] <--------------> [RunPod vLLM :8899 + volume]

[Operator Browser] <---- HTTP/WS ----> [web-client + websocket-server on EC2]
                                              |
                                              +--> [ROS2 bringup/planner/executor/dimos]
                                              |
                                              +--> [go2rtc stream stack]
                                              |
                                              +--> [optional local VLM :1234]

[AWS SSM/Secrets] <---- credentials/config ----> [EC2 runtime services]
```

## Dependency notes for tracking

- High-impact internal contracts:
- `/reasoning/task_requests` (planner -> executor)
- `/robot/task_status` (executor -> planner/dashboard)
- `/ui/set_task_state` (dashboard/operator -> planner/executor)
- `/ui/alerts` (planner/executor -> dashboard)
- High-impact external dependencies:
- rosbridge/Nav2/SLAM availability
- RunPod API and vLLM endpoint stability
- go2rtc streaming path and network configuration
- local or remote OpenAI-compatible endpoints for VLM services

## Known weak links

- underdeclared dependencies in `sras_ros2_bringup` and `sras_ros2_dimos_bridge` manifests
- JSON-over-String contracts in planner/executor increase schema drift risk
- dashboard event surface is broad and requires contract hardening
- simulation and Cosmos flows rely on external tooling and environment alignment

## High-level architecture (sim2real) and end-to-end data flow

Below is a pragmatic ROS2 architecture that fits your scenario and hackathon constraints: **3 static CCTV cameras + 1 mobile robot**, **IsaacSim ↔ ROS2 bridge**, and **COSMOS Reasoning 2 (VLLM)** used inside selected reasoning nodes.

## Implementation status snapshot (verified from sub-repos on 2026-02-19)

### Implemented today (real code paths)

* `sras_ros2_bringup/launch/go2_stack.launch.py` launches an operational ROS stack with:
  * `rosbridge_server` (WebSocket bridge, typically `:9090`)
  * `pointcloud_to_laserscan`
  * `slam_toolbox` (+ delayed deserialize)
  * `nav2_bringup/navigation_launch.py`
  * `cmd_vel` relay + throttled pointcloud/camera topics
  * `sras_qos_tools/map_republisher` (`/map` → `/map_live`)
  * `vision_llm_srv/vision_llm_server`
* `sras_ros2_dimos_bridge` provides implemented reasoning/memory nodes:
  * `temporal_memory_node`
  * `spatial_memory_node`
  * `combined_memory_node` (works, but more heuristic/experimental)
  * `vlm_query_service`
* `Dashboard_Robotics` websocket server has working ROS integration for:
  * rosbridge connection/reconnect
  * topic subscription and relays
  * Nav2 goal/cancel flow
  * camera streaming fallback path (Socket.IO JPEG/binary)
  * default ROS topic surface for navigation, Robot0 camera/LiDAR/odometry, costmaps, and Nav2 action feedback/status

### Not implemented yet (still target architecture)

* The 5 custom SRAS reasoning nodes in this document are **not** present as standalone ROS packages in current sub-repos:
  * `spatial_object_recognition_node`
  * `cctv_visibility_monitor_node`
  * `robot_task_planner_node`
  * `robot_task_executor_node`
  * `robot_situation_assessor_node`
* Custom interface package `warehouse_security_msgs` (messages/services defined below) is architectural proposal and is not currently implemented as a repo package.

### Layered view

**1) Sensor / Simulation Layer**

* **IsaacSim** publishes:

  * `/cctv/{1..3}/image_raw` (+ `/camera_info`, optional `/depth`)
  * robot sensors: `/robot/camera/image_raw`, `/robot/scan` or `/robot/points`, `/tf`
* **Real-world** replaces IsaacSim streams with real cameras + robot sensors **without changing reasoning interfaces**.

**2) Perception / State Estimation Layer**

* Robot localization + navigation stack:

  * `/map` from map_server (prebuilt) or SLAM output (first run)
  * `/tf` chain: `map → odom → base_link → sensors`
* A perception node converts sensor streams into **consistent 3D semantic facts** (objects, assets like “window”, “shelf”).

**3) Reasoning Layer (your 5 modules as separate ROS nodes)**

* Each module subscribes/publishes via ROS topics.
* Only some modules call **COSMOS Reasoning 2 VLLM** to generate structured reasoning outputs (validated by guardrails).

**4) Planning & Control Layer**

* **Nav2** executes navigation goals.
* A task executor node translates “security tasks” into Nav2 actions and reports status.

**5) Operator / Dashboard Layer**

* Dashboard subscribes to:

  * alerts, incident timeline, task status, risk assessments
  * video streams (you already have WebRTC for vision/teleop)
* Dashboard can send:

  * **cancel / approve / pause** commands (human-over-the-loop)

---

## ROS graph and data flow (recommended target)

### Core ROS topics (overview)

```
CCTV cams (3x)                       Robot
/cctv/i/image_raw  --->              /robot/camera/image_raw
/cctv/i/camera_info                  /robot/scan or /robot/points
         |                                   |
         v                                   v
   [Object + Asset Perception Node]  <---- tf/map/localization ----
         | publishes
         +--> /perception/detections_3d          (3D objects)
         +--> /perception/asset_states           (window open/closed etc.)
                        |
                        v
           [CCTV Visibility / Blindspot Node]
                        |
                        +--> /reasoning/blindspot_events
                                   |
                                   v
                    [Task Generation / Planner Node]
                                   |
                 +-----------------+------------------+
                 |                                    |
         /reasoning/task_requests                 /ui/alerts
                 |
                 v
              [Task Executor Node] ---> Nav2 actions ---> Robot base
                 |
                 +--> /robot/task_status
                 |
                 v
        [Robot Situation Assessment Node]
                 |
        +--------+----------------------+
        |                               |
/reasoning/risk_assessments         /ui/alerts (recommendations)
```

---

## Scenario walkthrough (target demo flow)

1. **Normal state**

   * CCTV streams are OK; visibility scores high.
   * Perception publishes stable `asset_states` (window closed) and `detections_3d`.

2. **Change in warehouse → CCTV loses view**

   * A forklift / object occludes a critical ROI (window region).
   * **Blindspot node** detects `visibility_score` drop, emits `BlindSpotEvent`.

3. **Autonomous response**

   * **Task planner** creates a robot task: *Inspect window POI*.
   * Dashboard receives an alert: “Blindspot detected; robot dispatched.”

4. **Robot navigates to inspection pose**

   * **Task executor** sends Nav2 goal; publishes `TaskStatus`.

5. **Robot sees open window + shelf contact**

   * Perception / assessor detects window state and geometry.

6. **Risk evaluation**

   * **Situation assessor** computes a risk score (tip-over likelihood, contact geometry)
   * Returns a `RiskAssessment` + human-readable recommendations to dashboard.

7. **Operator remains in the loop**

   * Operator can **cancel**, **teleop**, or confirm additional mitigation tasks.

---

# Reasoning Layer modules (ROS nodes)

Below I describe each module exactly in the format you asked for: **Name, description, inputs, outputs, and ROS message interface**.

**Status note (important):** this section is the target design. As of 2026-02-19, these modules are not yet implemented as dedicated ROS nodes in the tracked sub-repos. The closest implemented pieces are the bringup stack (`sras_ros2_bringup`) and DimOS bridge nodes (`sras_ros2_dimos_bridge`).

I assume you’ll create a small interface package, e.g. `warehouse_security_msgs`, to carry security-specific events/tasks/assessments.

---

## 1) Rozpoznawanie obiektów w przestrzeni

### Node

**`spatial_object_recognition_node`** (Perception → Reasoning input)

### Description

Produces a **unified 3D semantic scene** in the `map` frame:

* tracks relevant objects (forklift, pallet, human silhouette, shelf, window),
* estimates their pose/size,
* derives **asset state** (e.g., window open fraction) when possible.

In IsaacSim you can shortcut by using segmentation/depth/ground-truth annotations; in real-world you can swap to detector + depth/LiDAR fusion.

### Required data (Inputs)

* CCTV:

  * `/cctv/{1..3}/image_raw` (`sensor_msgs/Image`)
  * `/cctv/{1..3}/camera_info` (`sensor_msgs/CameraInfo`)
  * optional `/cctv/{1..3}/depth/image_raw` (`sensor_msgs/Image`)
* Robot:

  * `/robot/camera/image_raw` (`sensor_msgs/Image`)
  * `/robot/camera/camera_info` (`sensor_msgs/CameraInfo`)
  * `/robot/scan` (`sensor_msgs/LaserScan`) **or** `/robot/points` (`sensor_msgs/PointCloud2`)
* Frames:

  * `/tf`, `/tf_static` (TF2)
* Map (optional but recommended):

  * `/map` (`nav_msgs/OccupancyGrid`) for global placement

### Reasoning results (Outputs)

* 3D object detections/tracks in `map` frame
* asset state updates (window open/closed, shelf pose)

### Interface (ROS topics + message structure)

**Publish**

* `/perception/detections_3d` → `vision_msgs/Detection3DArray` *(recommended standard)*
  Key fields (high level):

  * `header.frame_id` = `"map"`
  * `detections[].id` (track id)
  * `detections[].bbox.center.position` (x,y,z)
  * `detections[].results[].hypothesis.class_id` + `score`

* `/perception/asset_states` → `warehouse_security_msgs/AssetState` *(custom, defined below)*

---

## 2) Rozpoznawanie zmian widoczności kamer CCTV (blind spoty)

### Node

**`cctv_visibility_monitor_node`**

### Description

Monitors each CCTV camera’s **visibility** for:

* global health (is the camera mostly occluded?), and/or
* **critical ROIs / assets** (e.g., “window_01 region must remain visible”).

Detects blind spots by comparing current visibility to baseline (or last known good).
Optionally uses object detections to explain *what* caused the occlusion.

### Required data (Inputs)

* `/cctv/{1..3}/image_raw` (`sensor_msgs/Image`)
* `/cctv/{1..3}/camera_info` (`sensor_msgs/CameraInfo`)
* Optional but very useful:

  * `/perception/detections_3d` (`vision_msgs/Detection3DArray`) to identify occluder
  * `/perception/asset_states` (`AssetState`) to link camera ROI ↔ asset id
* Static configuration (ROS params):

  * camera intrinsics/extrinsics (or TF)
  * ROI definitions per asset (image ROI or 3D ROI)
  * thresholds + hysteresis

### Reasoning results (Outputs)

* Emits **events** when visibility drops below threshold:

  * camera_id
  * ROI / asset affected (window)
  * severity and suggested inspection pose

### Interface (ROS topics + message structure)

**Publish**

* `/reasoning/blindspot_events` → `warehouse_security_msgs/BlindSpotEvent` *(custom, defined below)*
  Optional (for dashboard charts):
* `/reasoning/camera_visibility_status` → `warehouse_security_msgs/CameraVisibility` *(optional custom)*

---

## 3) Tworzenie zadań dla robota

### Node

**`robot_task_planner_node`**

### Description

Converts events into actionable robot tasks:

* blindspot event → “inspect POI/window pose”
* periodic patrol → “follow route”
* risk assessment → “create perimeter/check other shelf/etc.” (optional)

Implements **guardrails + human-over-the-loop**:

* tasks can be auto-approved or require operator ack depending on severity
* operator can cancel anytime

### Required data (Inputs)

* `/reasoning/blindspot_events` (`BlindSpotEvent`)
* `/perception/asset_states` (`AssetState`) (e.g., “window open”)
* `/robot/task_status` (`TaskStatus`) and robot pose (`/tf`) for availability
* `/map` (`nav_msgs/OccupancyGrid`) + POI list (window inspection poses)
* Optional:

  * `/reasoning/risk_assessments` (`RiskAssessment`) for follow-up actions
* Operator commands:

  * service or topic from dashboard (“approve/cancel”)

### Reasoning results (Outputs)

* A `RobotTask` request with:

  * target pose / waypoints
  * priority
  * link to triggering event
* Operator alerts describing what the system is doing

### Interface (ROS topics + message structure)

**Publish**

* `/reasoning/task_requests` → `warehouse_security_msgs/RobotTask`
* `/ui/alerts` → `warehouse_security_msgs/OperatorAlert`

**Service (recommended for human loop)**

* `/ui/set_task_state` → `warehouse_security_msgs/SetTaskState.srv`
  (approve/cancel/pause/resume)

---

## 4) Sterowanie robotem (Agent czy Nav2)

### Node

**`robot_task_executor_node`**

### Description

Executes `RobotTask` using Nav2 (recommended for hackathon speed):

* `INSPECT_POI` → `nav2_msgs/action/NavigateToPose`
* `PATROL_ROUTE` → `nav2_msgs/action/NavigateThroughPoses`
* reports progress and supports cancellation

If you later add an “Agent”, keep it inside this node (or a wrapper) but still expose the same task interface upstream.

### Required data (Inputs)

* `/reasoning/task_requests` (`RobotTask`)
* `/ui/set_task_state` service calls (cancel/pause)
* Nav2 action servers available
* `/tf` for robot pose

### Reasoning results (Outputs)

* `TaskStatus` updates for dashboard + downstream reasoning
* (Optional) “arrived at POI” trigger for situation assessor

### Interface (ROS topics + message structure)

**Subscribe**

* `/reasoning/task_requests` → `RobotTask`

**Publish**

* `/robot/task_status` → `warehouse_security_msgs/TaskStatus`

**Uses Nav2 actions**

* `nav2_msgs/action/NavigateToPose`
* `nav2_msgs/action/NavigateThroughPoses`

---

## 5) Ocena sytuacji przez robota

### Node

**`robot_situation_assessor_node`**

### Description

When the robot reaches the inspection area, this node:

* confirms asset state (window open/angle)
* detects shelf contact geometry
* estimates **risk of shelf tipping / hazard severity**
* returns structured recommendations (and optionally auto-mitigation tasks)

This is the best place to use **COSMOS Reasoning 2 VLLM**, but keep outputs **structured + validated**:

* VLM interprets the scene (what is happening)
* deterministic checks compute risk score (geometry/physics heuristics)
* guardrails ensure safe actions only

### Required data (Inputs)

* Robot sensors:

  * `/robot/camera/image_raw` (+ optional depth)
  * `/robot/scan` or `/robot/points`
* `/perception/detections_3d` for object context
* `/robot/task_status` to know which event/task is being assessed
* Shelf/window metadata (params):

  * shelf footprint, height, mass estimate (even rough), stability thresholds
  * window hinge axis or expected open angle range (if available)

### Reasoning results (Outputs)

* Risk level + probability + evidence
* Recommendations for the operator
* Optional suggested robot actions (e.g., “mark area”, “keep distance”, “re-check from another angle”)

### Interface (ROS topics + message structure)

**Publish**

* `/reasoning/risk_assessments` → `warehouse_security_msgs/RiskAssessment`
* `/ui/alerts` → `warehouse_security_msgs/OperatorAlert`
* optional:

  * `/perception/asset_states` → `AssetState` (confirmed window open)
  * `/reasoning/task_requests` → `RobotTask` (follow-up)

---

# Proposed ROS message definitions (minimal, hackathon-friendly)

Create a package: **`warehouse_security_msgs`**.

## `msg/BlindSpotEvent.msg`

```text
std_msgs/Header header

# Severity constants
uint8 INFO=0
uint8 LOW=1
uint8 MEDIUM=2
uint8 HIGH=3
uint8 CRITICAL=4

string event_id
string camera_id

# What became invisible
string target_asset_id          # e.g. "window_01"

# Where should the robot go / look (map frame)
geometry_msgs/PoseStamped target_pose

# Visibility metrics
float32 visibility_score        # 0..1 (1 = fully visible)
float32 occluded_fraction       # 0..1

# Image-space ROI that is occluded (if you use ROIs)
sensor_msgs/RegionOfInterest roi

# Optional: what likely caused it
string suspected_occluder_track_id

uint8 severity
string description
```

## `msg/AssetState.msg`

```text
std_msgs/Header header

uint8 UNKNOWN=0
uint8 CLOSED=1
uint8 OPEN=2
uint8 PARTIALLY_OPEN=3
uint8 MOVED=4
uint8 BLOCKED=5

string asset_id           # "window_01", "shelf_02"
string asset_type         # "window", "shelf", "door"
uint8 state
float32 confidence        # 0..1

# Pose in map frame (or nearest relevant frame)
geometry_msgs/PoseStamped pose

# For doors/windows: openness fraction (0 closed, 1 fully open)
float32 openness

# Link back to what triggered the check (optional)
string related_event_id
```

## `msg/RobotTask.msg`

```text
std_msgs/Header header

uint8 PATROL_ROUTE=0
uint8 INSPECT_POI=1
uint8 INSPECT_BLINDSPOT=2
uint8 REPOSITION=3
uint8 HOLD=4

string task_id
uint8 task_type
uint8 priority              # 0..255 (bigger = higher)

string related_event_id

# Single-goal tasks
geometry_msgs/PoseStamped goal

# Route-based tasks (optional)
geometry_msgs/PoseStamped[] waypoints

string description

# Human-over-the-loop
bool operator_ack_required
```

## `msg/TaskStatus.msg`

```text
std_msgs/Header header

uint8 QUEUED=0
uint8 DISPATCHED=1
uint8 ACTIVE=2
uint8 SUCCEEDED=3
uint8 FAILED=4
uint8 CANCELED=5
uint8 PAUSED=6

string task_id
uint8 state
float32 progress           # 0..1
string current_action      # e.g. "Navigating", "Inspecting"
string detail              # free text for UI/logs
```

## `msg/RiskAssessment.msg`

```text
std_msgs/Header header

uint8 LOW=0
uint8 MEDIUM=1
uint8 HIGH=2
uint8 CRITICAL=3

string assessment_id
string related_event_id
string task_id

geometry_msgs/PoseStamped location

uint8 risk_level
float32 risk_score         # 0..1

string[] hazards           # e.g. ["SHELF_TIP_RISK", "OPEN_WINDOW"]
string[] evidence          # short bullet-like strings

string[] recommended_operator_actions
string[] recommended_robot_actions
```

## `msg/OperatorAlert.msg`

```text
std_msgs/Header header

uint8 INFO=0
uint8 LOW=1
uint8 MEDIUM=2
uint8 HIGH=3
uint8 CRITICAL=4

string alert_id
uint8 severity
string title
string description
string[] related_ids
bool requires_ack
```

## `srv/SetTaskState.srv` (human loop)

```text
uint8 APPROVE=0
uint8 CANCEL=1
uint8 PAUSE=2
uint8 RESUME=3

string task_id
uint8 command
---
bool success
string message
```

---

# Practical implementation notes (so this architecture works smoothly)

### Frames and coordinates

* Enforce that all reasoning outputs are in **`map` frame** (`header.frame_id = "map"`).
* Use TF2 for camera extrinsics (`map → cctv_i_link`, `map → base_link`).

### Map setup

* Since you can “scan whole warehouse and have LiDAR map”:

  * first run: SLAM (e.g., slam_toolbox) → save map
  * demo run: map_server loads the map, AMCL localizes
* In IsaacSim: you can publish a static map or use ground truth pose.

### Guardrails (recommended)

Even in a hackathon, add a small deterministic “safety filter”:

* robot never pushes shelves/windows
* robot keeps minimum distance to shelf if “tip risk” is high
* only allowed robot actions are: **navigate, observe, mark zone, retreat, request human**

### COSMOS Reasoning 2 VLLM usage

* Use it where it adds value:

  * situation assessor: generate **explanations** and **structured recommendations**
* Always request **structured output** (JSON-like) internally and validate before publishing ROS messages.

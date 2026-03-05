# Module 2: Person Detection with Position Mapping

## What It Does

Detects people via Cosmos Reason2 and maps their 3D positions into a unified coordinate frame. The detection buffer tracks changes over time and triggers events for the task planner.

---

## Architecture

```
CCTV cameras (3x)              Robot camera
   |                              |
   v                              v
Cosmos Reason2-8B           Cosmos Reason2-8B
(scene description,          (onboard analysis)
 person detection)                |
   |                              |
   v                              v
Position estimation         Robot odometry + TF2
(2D image -> 3D map frame)       |
   |                              |
   +----------+-------------------+
              |
              v
   /triangulated/detections_json
              |
              v
      Detection Buffer
   (change detection over time)
              |
              v
   PlannerEvent (new_class, disappeared, position_shift, etc.)
```

---

## Real Detection Message (/triangulated/detections_json)

```json
{
  "timestamp": {"sec": 1234567890, "nanosec": 123000000},
  "frame_id": "map",
  "detections": [
    {
      "class": "person",
      "position": {"x": 5.0, "y": 3.0, "z": 0.0},
      "score": 0.82,
      "reprojection_error_px": 3.5
    }
  ]
}
```

All positions normalized to `map` frame via TF2 transforms. Multiple cameras can contribute detections that get triangulated into a single coordinate system.

---

## Cosmos Person Detection Capabilities (from benchmark)

### RGB Camera (Standard Conditions)

| Metric | Score | Detail |
|---|---|---|
| Person detection (no reasoning) | **5/5** | 100% correct on 5-frame test |
| Person detection (with reasoning) | **3/5** | False positives on 2/5 frames |
| Person description | 4/5 | "Man, short dark hair, beard, green polka dot shirt, navy pants" |
| Activity recognition | 3/5 | "Standing, leaning against wall, looking around intently" |
| Relative positioning | 4/5 | 4/4 correct on LEFT/RIGHT/BEHIND tests |

### Thermal Camera + LoRA (Smoke Conditions)

| Metric | Zero-Shot | LoRA v6a |
|---|---|---|
| Person detection (smoke+people) | 55.6% | **91.1%** |
| Person detection (people only) | 51.1% | **97.8%** |
| False positives (smoke only) | ~20% hallucinated | **0%** |

---

## Detection Buffer: Change Detection

The detection buffer maintains a rolling window of recent detections and emits change events when the scene changes.

### Change Types

| Change Type | Trigger | Planner Event |
|---|---|---|
| `new_class` | Person appeared (not in previous frames) | `intruder_detected` |
| `class_disappeared` | Was in 3+ frames, now absent 2+ frames | `person_disappeared` |
| `count_changed` | Count changed, stable for 2+ frames | `count_changed` |
| `position_shift` | Object moved >1.5m | `position_shift` |
| `sustained_presence` | Present 3+ consecutive frames (fires once) | `sustained_presence` |

### Example: Person Enters Room

```
Frame 1: detections = []                    -> no change
Frame 2: detections = [person at (5,3)]     -> "new_class" event fired
Frame 3: detections = [person at (5,3)]     -> no change (same)
Frame 4: detections = [person at (5,3)]     -> "sustained_presence" event fired
Frame 5: detections = [person at (6.5,3)]   -> no change (moved <1.5m)
Frame 6: detections = [person at (8,3)]     -> "position_shift" event (moved >1.5m)
Frame 7: detections = []                    -> no change (need 2+ absent frames)
Frame 8: detections = []                    -> "class_disappeared" event fired
```

---

## Goal Builder (Position -> Navigation Goal)

When a detection triggers an event, the goal builder calculates a Nav2 goal pose:

```python
def build_goal_from_detection(target_x, target_y, robot_x, robot_y, frame_id="map"):
    # Calculate yaw: robot should face the detection
    yaw = 0.0
    if robot_x is not None and robot_y is not None:
        dx = target_x - robot_x
        dy = target_y - robot_y
        if dx != 0.0 or dy != 0.0:
            yaw = math.atan2(dy, dx)

    return {
        "x": target_x,
        "y": target_y,
        "z": 0.0,
        "yaw": yaw,
        "frame_id": frame_id
    }
```

**Example:** Person detected at (5.0, 3.0), robot at (0.0, 0.0):
```json
{
  "x": 5.0,
  "y": 3.0,
  "z": 0.0,
  "yaw": 0.5404,
  "frame_id": "map"
}
```

Robot navigates to the detection point facing the target.

---

## DimOS Memory Layer (Optional Persistence)

The ros2-dimos-bridge module adds temporal and spatial memory:

### Temporal Memory

- Tracks entities over time: "When was the last person seen in zone A?"
- SQLite-backed entity database with relations
- Publishes to `/temporal_memory/entities` (JSON entity roster)

### Spatial Memory

- CLIP embeddings for semantic location search
- "Where have people been detected?" -> returns PoseStamped
- Publishes to `/spatial_memory/location_result`

### VLM Query Service

- Natural language questions about camera feed
- Supports: OpenAI, Moondream (local/hosted), Qwen backends
- Example: "Is anyone near the display case?" -> "Yes, one person standing near the glass case on the left side"

---

## Cosmos vs LoRA Decision Flow

```
Camera feed arrives
        |
        v
Is thermal camera? ----YES----> Cosmos + LoRA v6a adapter
        |                              |
        NO                       96.2% person detection
        |                       (even through smoke)
        v
Standard Cosmos Reason2-8B
(direct mode, no reasoning)
        |
  4/5 person detection
  + scene description
  + relative positioning
```

**Key rule from benchmark:** Always use direct mode (no `<think>` tags) for person detection. Reasoning causes false positives.

---

## Key Files

| File | Content |
|---|---|
| `modules/ros2-task-planner/sras_robot_task_planner/detection_buffer.py` | Detection buffer + change detection |
| `modules/ros2-task-planner/sras_robot_task_planner/goal_builder.py` | Position -> Nav2 goal conversion |
| `modules/ros2-dimos-bridge/src/nodes/temporal_memory_node.py` | Temporal entity tracking |
| `modules/ros2-dimos-bridge/src/nodes/spatial_memory_node.py` | Spatial memory with CLIP |
| `modules/ros2-dimos-bridge/src/services/vlm_query_service.py` | VLM natural language queries |
| `modules/cosmos-reasoning-benchmark/src/connectors/cosmos_client.py` | Cosmos API client |
| `modules/cosmos-reasoning-benchmark/src/agents/surveillance_agent.py` | Surveillance agent logic |
| `test_configs/mock_detections.py` | Mock detection data for testing |
| `docs/REASONING_LAYER_ARCHITECTURE.md` | Full architecture spec |

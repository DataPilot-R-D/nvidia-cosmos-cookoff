# Module 3: Cosmos-Powered Task Planning (Multi-Robot)

## What It Does

Converts security events (blind spots, intruder detections, anomalies) into prioritized robot tasks. Supports multi-robot coordination with deterministic assignment + optional Cosmos deep reasoning. Human-Over-The-Loop: auto-approves low-severity, escalates critical.

---

## Architecture

```
Detection Buffer (/triangulated/detections_json)
        |
        v
  Change Detection (new_class, disappeared, position_shift, sustained_presence)
        |
        v
  PlannerEvent created
        |
        v
+---------------------------+
|     PLANNER CORE          |
|  1. Dedup check (60s)     |
|  2. Priority scoring      |
|  3. Route selection:      |
|     - deterministic       |
|     - deep (Cosmos LLM)   |
|     - multi_robot         |
|  4. Approval gate         |
|  5. Robot assignment      |
+---------------------------+
        |
        v
  PlannerTask dispatched
        |
   +----+----+
   v         v
Executor   Dashboard
(/task_    (/ui/dashboard
requests)  _notifications)
```

---

## Real Input: PlannerEvent

### Blindspot Event (CCTV camera occlusion)

```json
{
  "incident_key": "blindspot-test-1702468080",
  "event_type": "blindspot",
  "severity": "medium",
  "confidence": 0.6,
  "asset_criticality": 0.5,
  "has_signal_conflict": false,
  "source": "mock_test",
  "timestamp_s": 1702468080.0,
  "details": {
    "camera_id": "cctv0",
    "region": "gallery_west",
    "description": "Camera occlusion detected in gallery west"
  },
  "goal": {
    "x": 2.0, "y": -1.0, "z": 0.0,
    "yaw": 1.57,
    "frame_id": "map"
  }
}
```

### Intruder Detection Event

```json
{
  "incident_key": "intruder-test-1702468090",
  "event_type": "intruder_detected",
  "severity": "high",
  "confidence": 0.85,
  "asset_criticality": 0.8,
  "has_signal_conflict": false,
  "source": "triangulated_detections",
  "timestamp_s": 1702468090.0,
  "details": {
    "class": "person",
    "position": {"x": 5.0, "y": 3.0, "z": 0.0},
    "threat_level": "high",
    "description": "Unauthorized person detected near Mona Lisa"
  },
  "goal": {
    "x": 5.0, "y": 3.0, "z": 0.0,
    "yaw": 0.0,
    "frame_id": "map"
  }
}
```

### Detection Buffer Input (/triangulated/detections_json)

The planner subscribes to triangulated detections and detects changes:

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

**Change types that trigger events:**

| Change Type | Trigger Condition | Example |
|---|---|---|
| `new_class` | Person appeared in frame | First detection of a person |
| `class_disappeared` | Was in 3+ frames, now absent 2+ frames | Person left the area |
| `count_changed` | Count changed and stable for 2+ frames | Second person appeared |
| `position_shift` | Object moved >1.5m | Person moving through room |
| `sustained_presence` | Present in 3+ consecutive frames (fires once) | Person lingering |

---

## Real Output: PlannerTask

### Dispatched Task (sent to executor)

```json
{
  "task_id": "task-a1b2c3d4e5",
  "incident_key": "intruder-1",
  "task_type": "INVESTIGATE_ALERT",
  "priority": 0.87,
  "state": "DISPATCHED",
  "created_at_s": 1234567890.123,
  "updated_at_s": 1234567895.456,
  "route": "deep",
  "requires_approval": false,
  "robot_id": "robot0",
  "goal": {
    "x": 5.0, "y": 3.0, "z": 0.0,
    "yaw": 0.0,
    "frame_id": "map"
  },
  "payload": {
    "event_type": "intruder_detected",
    "incident_key": "intruder-1",
    "source": "triangulated_detections",
    "robot_id": "robot0",
    "assignment_reasoning": "deterministic: quadruped -> PURSUE_THIEF"
  }
}
```

### Dashboard Notification

```json
{
  "category": "plan_scheduled",
  "level": "info",
  "title": "Task Dispatched",
  "message": "Task task-a1b2c3d4e5 dispatched (INVESTIGATE_ALERT)",
  "task_id": "task-a1b2c3d4e5",
  "incident_key": "intruder-1",
  "timestamp_s": 1234567895.456,
  "metadata": {
    "task_type": "INVESTIGATE_ALERT",
    "priority": 0.87
  }
}
```

---

## Priority Scoring

Priority is calculated from 4 weighted factors:

```
priority = w1 * severity + w2 * confidence + w3 * recency + w4 * asset_criticality
```

### Severity Mapping

| Input String | Numeric Value |
|---|---|
| info | 0.1 |
| low / green | 0.25 |
| medium / yellow | 0.55 |
| high / red | 0.75 |
| critical | 1.0 |

### Auto-Approve Gate

- **Threshold:** `auto_approve_max_severity: 0.55`
- If severity <= 0.55 (medium or below): task dispatched immediately, operator notified
- If severity > 0.55 (high/critical): task enters `PENDING_APPROVAL`, operator must approve/reject
- Operator can always cancel/pause/resume regardless of auto-approve

---

## Cosmos Deep Planning (LLM Integration)

When `deep_conf_threshold` is exceeded OR complex multi-robot scenarios arise, the planner sends the event to Cosmos for reasoning.

### Cosmos Prompt (actual)

```
Create a task suggestion for this warehouse security event.
mode=deep
event={
  "incident_key": "incident-deep",
  "event_type": "blindspot",
  "severity": "medium",
  "confidence": 0.2,
  "asset_criticality": 0.5,
  "has_signal_conflict": false,
  "timestamp_s": 310.0,
  "details": {...}
}
Output JSON only.
```

### Cosmos Response (actual)

```json
{
  "task_type": "INSPECT_POI",
  "priority": 0.9,
  "payload": {
    "source": "deep",
    "reasoning": "Medium severity blindspot with low confidence. Recommend inspection to verify camera status before escalating."
  }
}
```

### Route Selection Logic

| Route | When Used | Latency |
|---|---|---|
| `deterministic` | Default path, no LLM needed | <1ms |
| `deep` (Cosmos) | Complex scenarios, `deep_conf_threshold` exceeded | 2-4s |
| `deep_fallback` | Cosmos fails or times out, falls back to deterministic | <1ms |
| `multi_robot` | Multi-robot assignment needed | 2-4s if Cosmos, <1ms if deterministic |

---

## Multi-Robot Assignment

### Fleet Configuration

```yaml
multi_robot_enabled: true
robot_ids: ["robot0", "h1_0"]
max_active_tasks_per_robot: 1

# Robot capabilities
robot0:  # Unitree Go2 (quadruped)
  type: quadruped
  capabilities: {can_pursue: true, can_block_exit: false, can_guard: false}

h1_0:    # Unitree H1 (humanoid)
  type: humanoid
  capabilities: {can_pursue: false, can_block_exit: true, can_guard: true}
```

### Cosmos Assignment Request

```json
{
  "event_summary": {
    "event_type": "intruder_detected",
    "incident_key": "intruder-test-1234",
    "severity": "high",
    "confidence": 0.85
  },
  "robot_states": [
    {
      "robot_id": "robot0",
      "robot_type": "quadruped",
      "position": {"x": 0.0, "y": 0.0},
      "capabilities": {"can_pursue": true, "can_block_exit": false, "can_guard": false}
    },
    {
      "robot_id": "h1_0",
      "robot_type": "humanoid",
      "position": {"x": 2.0, "y": 1.0},
      "capabilities": {"can_pursue": false, "can_block_exit": true, "can_guard": true}
    }
  ]
}
```

### Cosmos Assignment Response

```json
{
  "assignments": [
    {
      "robot_id": "robot0",
      "task_type": "PURSUE_THIEF",
      "priority": 0.95,
      "reasoning": "Quadruped is fast and can pursue. Sending to intercept intruder.",
      "payload": {"target_x": 5.0}
    },
    {
      "robot_id": "h1_0",
      "task_type": "BLOCK_EXIT",
      "priority": 0.8,
      "reasoning": "Humanoid can block exit. Positioning to prevent escape.",
      "payload": {"asset_id": "mona-lisa"}
    }
  ]
}
```

### Deterministic Fallback (When Cosmos Unavailable)

```python
# For intruder_detected event:
#   quadruped (robot0) -> PURSUE_THIEF
#   humanoid  (h1_0)   -> BLOCK_EXIT

# For blindspot event:
#   all robots -> INSPECT_BLINDSPOT (nearest gets priority)
```

---

## Task Types

| Task Type | Nav Action | Trigger | Description |
|---|---|---|---|
| `INSPECT_POI` | navigate_to_pose | Anomaly detected | Go to point of interest |
| `INSPECT_BLINDSPOT` | navigate_to_pose | CCTV coverage loss | Inspect camera blind spot |
| `INVESTIGATE_ALERT` | navigate_to_pose | Generic alert | Investigate security alert |
| `PURSUE_THIEF` | navigate_to_pose | Intruder (quadruped) | Chase intruder |
| `BLOCK_EXIT` | navigate_to_pose | Intruder (humanoid) | Block escape route |
| `GUARD_ASSET` | navigate_to_pose | High-value threat | Guard specific asset |
| `PATROL_ROUTE` | navigate_through_poses | Scheduled/triggered | Follow waypoint sequence |
| `REPORT` | publish_report | Assessment complete | Publish situation report |

---

## Incident Management

| Parameter | Value | Purpose |
|---|---|---|
| `dedup_window_s` | 60s | Prevent duplicate tasks for same incident |
| `incident_ttl_s` | 600s | Auto-expire old incidents |
| `queue_max_size` | 300 | Maximum queued tasks |
| `max_active_tasks` | 1 per robot | One task at a time per robot |

---

## Planner State (Published Diagnostics)

```json
{
  "ingested_events": 15,
  "deduplicated_events": 3,
  "dropped_events": 0,
  "expired_events": 2,
  "tasks_created": 12,
  "tasks_dispatched": 10,
  "tasks_waiting_approval": 1,
  "tasks_canceled": 1,
  "deep_attempts": 5,
  "deep_successes": 4,
  "deep_fallbacks": 1,
  "multi_robot_tasks_created": 6,
  "cosmos_assignment_attempts": 2,
  "cosmos_assignment_successes": 2,
  "queue_size": 0,
  "active_task_count": 1,
  "map_ready": true,
  "nav_ready": true,
  "deep_success_rate": 0.8,
  "journal_enabled": true
}
```

---

## SQLite Journal (Audit Trail)

All planner decisions are logged to an append-only SQLite journal:

```sql
-- Events received
CREATE TABLE planner_events (
  id INTEGER PRIMARY KEY,
  timestamp_s REAL,
  incident_key TEXT,
  event_type TEXT,
  status TEXT,      -- 'accepted' or 'rejected'
  reason TEXT,       -- why rejected (duplicate, expired, queue_full)
  payload_json TEXT
);

-- Tasks created
CREATE TABLE planner_tasks (
  id INTEGER PRIMARY KEY,
  timestamp_s REAL,
  task_id TEXT,
  incident_key TEXT,
  task_type TEXT,
  priority REAL,
  state TEXT,
  route TEXT,        -- 'deterministic', 'deep', 'deep_fallback', 'multi_robot'
  requires_approval INTEGER,
  payload_json TEXT
);

-- State transitions (full audit trail)
CREATE TABLE planner_transitions (
  id INTEGER PRIMARY KEY,
  timestamp_s REAL,
  task_id TEXT,
  source TEXT,
  from_state TEXT,
  to_state TEXT,
  reason TEXT,
  metadata_json TEXT
);
```

---

## Key Files

| File | Size | Content |
|---|---|---|
| `modules/ros2-task-planner/sras_robot_task_planner/planner_core.py` | 36.6 KB | Core logic (ROS-free, unit-testable) |
| `modules/ros2-task-planner/sras_robot_task_planner/robot_task_planner_node.py` | 30.7 KB | ROS 2 node wrapper |
| `modules/ros2-task-planner/sras_robot_task_planner/cosmos_deep_planner.py` | -- | Cosmos LLM integration |
| `modules/ros2-task-planner/sras_robot_task_planner/detection_buffer.py` | -- | Change detection on detections |
| `modules/ros2-task-planner/sras_robot_task_planner/goal_builder.py` | -- | Goal pose calculation (yaw from robot->target) |
| `modules/ros2-task-planner/sras_robot_task_planner/planner_journal.py` | -- | SQLite persistence |
| `modules/ros2-task-planner/config/robot_task_planner.yaml` | -- | Production config |
| `test_configs/planner_multi_test.yaml` | 2.3 KB | Multi-robot test config |
| `test_configs/integration_tests.py` | 46 KB | Full end-to-end test scenarios |
| `test_configs/mock_detections.py` | 8 KB | Mock perception data |

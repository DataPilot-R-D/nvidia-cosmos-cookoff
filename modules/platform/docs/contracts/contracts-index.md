# PAIC2 Contracts Index

This file defines the canonical cross-repo integration contracts for PAIC2.

## Contract versioning rules

- Every contract change must be versioned.
- Backward-incompatible changes require a new version key (for example `v2`).
- Producers and consumers must be updated in lock-step via the platform lock bump flow.

## ROS topic contracts (current)

| Topic | Producer | Consumer | Payload | Version |
|---|---|---|---|---|
| `/reasoning/blindspot_events` | reasoning sources | planner | `std_msgs/String` JSON envelope | `blindspot_event.v1` |
| `/reasoning/risk_assessments` | reasoning sources | planner | `std_msgs/String` JSON envelope | `risk_assessment.v1` |
| `/reasoning/task_requests` | planner | executor | `std_msgs/String` JSON envelope | `task_request.v1` |
| `/robot/task_status` | executor | planner, dashboard | `std_msgs/String` JSON envelope | `task_status.v1` |
| `/ui/set_task_state` | dashboard/operator | planner | `std_msgs/String` JSON envelope | `task_command.v1` |
| `/ui/alerts` | planner | dashboard | `std_msgs/String` JSON envelope | `ui_alert.v1` |
| `/map` | bringup/slam/map server | planner, dashboard | `nav_msgs/msg/OccupancyGrid` | `ros.nav_msgs.occupancy_grid` |
| `/map_live` | map_republisher | dashboard | `nav_msgs/msg/OccupancyGrid` | `ros.nav_msgs.occupancy_grid` |

## Socket contracts (dashboard integration)

| Event | Producer | Consumer | Contract |
|---|---|---|---|
| `task_request` | websocket-server | web-client | mirrors `task_request.v1` |
| `task_status` | websocket-server | web-client | mirrors `task_status.v1` |
| `ui_alert` | websocket-server | web-client | mirrors `ui_alert.v1` |
| `robot_state` | websocket-server | web-client | dashboard internal schema |
| `lidar_scan` | websocket-server | web-client | dashboard internal schema |
| `video_frame` | websocket-server | web-client | dashboard internal schema |

## JSON envelope baseline (v1)

Use this envelope for all `std_msgs/String` fallback contracts:

```json
{
  "schema": "contract_name.v1",
  "timestamp": "2026-02-26T00:00:00Z",
  "source": "service-or-node-id",
  "data": {}
}
```

## Migration path to typed ROS interfaces

1. Add a dedicated interfaces package/repo.
2. Publish typed messages alongside JSON fallback.
3. Switch consumers to typed channels.
4. Remove JSON fallback after one stable release cycle.

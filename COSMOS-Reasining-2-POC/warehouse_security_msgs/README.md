# warehouse_security_msgs

ROS 2 Humble interface package defining custom messages and services for a warehouse security robotics system.

## Messages

- `msg/BlindSpotEvent.msg`: Blind-spot detection event metadata, severity, confidence, affected assets, and timing.
- `msg/AssetState.msg`: Tracked asset pose/state, visibility, confidence, and camera provenance.
- `msg/RobotTask.msg`: Robot task request including task type, priority, target pose/waypoints, and task policy fields.
- `msg/TaskStatus.msg`: Lifecycle status for a robot task, including progress, pose, and status update timestamp.
- `msg/RiskAssessment.msg`: Risk analysis output with risk level, confidence, source detections, and recommended action.
- `msg/OperatorAlert.msg`: Operator-facing alert with severity, message content, source node, and action requirement.

## Services

- `srv/SetTaskState.srv`: Request task state transitions (approve/cancel/pause/resume) and returns outcome/current state.

## Build

```bash
colcon build --packages-select warehouse_security_msgs
```

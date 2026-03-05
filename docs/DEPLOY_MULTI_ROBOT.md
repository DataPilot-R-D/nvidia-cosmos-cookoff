# Multi-Robot Planner + Executor: Deploy & Connect Guide

## Prerequisites

- SSH key: `~/.ssh/isaac-sim-1-key.pem` (chmod 600)
- Local repos cloned under `PAIC2-Platform/`:
  - `sras_ros2_robot_task_planner` (branch `feat/multi-robot-support`)
  - `sras_ros2_robot_task_executor` (branch `feat/multi-robot-support`)
- Instance running Isaac Sim with Go2 + H1 robots

## 1. Connect to Instance

```bash
# SSH
ssh -i ~/.ssh/isaac-sim-1-key.pem ubuntu@63.182.177.92

# Instance details
#   Type: g6.4xlarge (NVIDIA L4)
#   OS: Ubuntu 22.04, ROS2 Humble
#   Workspace: /home/ubuntu/ros2_ws
#   Open ports: 22 (SSH), 5900 (VNC), 8443 (DCV), 9090 (rosbridge)
```

## 2. Deploy Code

The instance SSH key only has GitHub access to `go2_omniverse`. Use rsync from your local machine for planner/executor:

```bash
# From PAIC2-Platform/ directory:
cd test_configs && ./deploy_and_test.sh deploy
```

Or manually:

```bash
SSH_KEY="$HOME/.ssh/isaac-sim-1-key.pem"
SSH_HOST="ubuntu@63.182.177.92"
ROS2_WS="/home/ubuntu/ros2_ws"

# Sync planner
rsync -avz --delete \
  --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.venv' --exclude='.pytest_cache' \
  -e "ssh -i $SSH_KEY" \
  sras_ros2_robot_task_planner/ \
  $SSH_HOST:$ROS2_WS/src/sras_ros2_robot_task_planner/

# Sync executor
rsync -avz --delete \
  --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.venv' --exclude='.pytest_cache' \
  -e "ssh -i $SSH_KEY" \
  sras_ros2_robot_task_executor/ \
  $SSH_HOST:$ROS2_WS/src/sras_ros2_robot_task_executor/

# Build on instance
ssh -i $SSH_KEY $SSH_HOST "source /opt/ros/humble/setup.bash && \
  cd $ROS2_WS && \
  colcon build --packages-select sras_robot_task_planner sras_robot_task_executor --symlink-install"
```

## 3. Upload Test Configs

```bash
SSH_KEY="$HOME/.ssh/isaac-sim-1-key.pem"
SSH_HOST="ubuntu@63.182.177.92"

scp -i $SSH_KEY test_configs/planner_multi_test.yaml $SSH_HOST:/home/ubuntu/ros2_ws/test_configs/
scp -i $SSH_KEY test_configs/executor_multi_test.yaml $SSH_HOST:/home/ubuntu/ros2_ws/test_configs/
scp -i $SSH_KEY test_configs/mock_detections.py $SSH_HOST:/home/ubuntu/ros2_ws/test_configs/
```

## 4. Launch Nodes

```bash
# One-command launch (creates tmux session with planner + executor + monitor):
cd test_configs && ./deploy_and_test.sh launch

# Or manually on the instance:
tmux new-session -d -s multi_robot_test -n planner

# Planner
tmux send-keys -t multi_robot_test:planner \
  'source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash && \
   ros2 launch sras_robot_task_planner robot_task_planner.launch.py \
   config:=/home/ubuntu/ros2_ws/test_configs/planner_multi_test.yaml' Enter

# Executor
tmux new-window -t multi_robot_test -n executor
tmux send-keys -t multi_robot_test:executor \
  'source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash && \
   ros2 launch sras_robot_task_executor robot_task_executor.launch.py \
   config:=/home/ubuntu/ros2_ws/test_configs/executor_multi_test.yaml' Enter

# Attach
tmux attach -t multi_robot_test
```

## 5. Verify Nodes Running

```bash
cd test_configs && ./deploy_and_test.sh verify

# Or manually:
ros2 node list | grep -E 'planner|executor'
# Expected: /robot_task_planner_node, /robot_task_executor_node
```

## 6. Run Mock Tests

```bash
cd test_configs && ./deploy_and_test.sh test intruder
# Available: blindspot, intruder, detection, risk, cancel, all
```

## 7. Stop Nodes

```bash
cd test_configs && ./deploy_and_test.sh stop
```

---

## Connecting Cosmos (RunPod)

The planner supports Cosmos Reason2 for intelligent task assignment. Cosmos runs on RunPod (self-hosted vLLM, OpenAI-compatible API).

### Start Cosmos Pod

```bash
cd COSMOS-Reasining-2-POC

# Start pod, bootstrap vLLM, create SSH tunnel (port 18899 locally)
eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)

# Verify API is reachable
curl http://localhost:18899/v1/models
# Should return: {"data": [{"id": "nvidia/Cosmos-Reason2-8B", ...}]}
```

Timing expectations:
- Warm restart (pod was recently stopped): ~4-6 min
- Cold start (first time / model download): ~12-18 min
- Response latency: ~2-3s warm, ~13s cold

### Forward Cosmos API to Instance

The Cosmos API runs on RunPod with an SSH tunnel to your local machine (port 18899). To make it reachable from the AWS instance, forward it:

```bash
# From your local machine — reverse tunnel to instance:
ssh -i ~/.ssh/isaac-sim-1-key.pem -R 8899:localhost:18899 ubuntu@63.182.177.92

# Verify on instance:
curl http://localhost:8899/v1/models
```

### Update Planner Config for Cosmos

Edit `test_configs/planner_multi_test.yaml`:

```yaml
robot_task_planner_node:
  ros__parameters:
    # Enable Cosmos for multi-robot assignment
    cosmos_assignment_enabled: true
    cosmos_assignment_timeout_s: 5.0

    # API base (points to SSH tunnel on instance)
    cosmos_api_base: "http://localhost:8899/v1"

    # Optional: enable Cosmos for LangGraph deep reasoning
    cosmos_enabled: true
    cosmos_model: nvidia/Cosmos-Reason2-8B
    cosmos_timeout_s: 5.0

    # Optional: enable Cosmos for detection classification
    detection_cosmos_enabled: true
```

Re-upload config and restart planner:

```bash
scp -i ~/.ssh/isaac-sim-1-key.pem test_configs/planner_multi_test.yaml \
  ubuntu@63.182.177.92:/home/ubuntu/ros2_ws/test_configs/

# Restart planner in tmux
ssh -i ~/.ssh/isaac-sim-1-key.pem ubuntu@63.182.177.92 \
  'tmux send-keys -t multi_robot_test:planner C-c'
sleep 2
ssh -i ~/.ssh/isaac-sim-1-key.pem ubuntu@63.182.177.92 \
  "tmux send-keys -t multi_robot_test:planner \
   'source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash && \
    ros2 launch sras_robot_task_planner robot_task_planner.launch.py \
    config:=/home/ubuntu/ros2_ws/test_configs/planner_multi_test.yaml' Enter"
```

### Stop Cosmos Pod

```bash
cd COSMOS-Reasining-2-POC
python3 scripts/runpod_cosmos.py stop
```

---

## Config Reference

### Planner (`planner_multi_test.yaml`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `multi_robot_enabled` | `true` | Enable multi-robot fleet |
| `robot_fleet_ids` | `["robot0", "h1_0"]` | Robot IDs (must match Isaac Sim namespaces) |
| `{rid}_type` | `quadruped`/`humanoid` | Robot type for deterministic assignment |
| `{rid}_nav2_ready` | `true` | Whether robot has Nav2 (READY vs DEGRADED) |
| `auto_approve_max_severity` | `1.0` | Max severity for auto-approve (1.0 = all) |
| `cosmos_assignment_enabled` | `false` | Use Cosmos for robot-task assignment |
| `require_map` | `true` | Require SLAM map before dispatching |

### Executor (`executor_multi_test.yaml`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `multi_robot_enabled` | `true` | Enable per-robot execution cores |
| `robot_ids` | `["robot0", "h1_0"]` | Robot IDs |
| `{rid}_nav_to_pose_action` | `/{rid}/navigate_to_pose` | Per-robot Nav2 action server |
| `require_map` | `true` | Require /map before dispatching |
| `require_tf` | `true` | Require /tf freshness |
| `require_nav_ready` | `true` | Require Nav2 action servers |
| `goal_timeout_s` | `120.0` | Nav2 goal timeout |

### Robot Fleet (on isaac-sim-1)

| Robot | Namespace | Type | Nav2 Actions | Odom |
|-------|-----------|------|-------------|------|
| robot0 (Go2) | `/robot0/` | quadruped | `/navigate_to_pose` | `/robot0/odom` |
| h1_0 (H1) | `/h1_0/` | humanoid | `/h1_0/navigate_to_pose` | `/h1_0/odom` |

---

## Troubleshooting

**"Sequence should be of same type" on planner launch:**
ROS2 can't parse nested YAML lists of dicts. Use flat params (`robot_fleet_ids` + `{rid}_type`, etc.).

**Only 1 task created for intruder:**
Check `{rid}_nav2_ready`. Robots with `nav2_ready: false` are DEGRADED and excluded from `get_available_robots()`.

**Tasks marked `tasks_invalid`:**
The `goal` field must be at the **top level** of the event payload, not nested under `details`.

**High-severity tasks stuck in PENDING_APPROVAL:**
`auto_approve_max_severity` default is 0.55. Intruder events have severity 0.75. Set to 1.0 for testing.

**Disk space (91% used):**
Avoid large downloads. Clean up with: `sudo apt autoremove && docker system prune`

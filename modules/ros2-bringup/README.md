# sras_bringup

ROS 2 Humble bringup package for the Unitree Go2 robot stack. This package provides a single launch file that brings up the full navigation and perception pipeline.

## Components

The `go2_stack.launch.py` launch file starts the following components:

- **rosbridge_server** — WebSocket bridge for web-based clients
- **pointcloud_to_laserscan** — converts 3D point clouds to 2D laser scans
- **slam_toolbox** — async SLAM with posegraph deserialization support
- **Nav2** — full navigation stack (`navigation_launch.py`)
- **cmd_vel relay** — relays `/cmd_vel` to the robot-specific velocity topic
- **pointcloud throttle** — throttles the point cloud topic to 1 Hz
- **camera throttle** — throttles the RGB camera topic to 2 Hz
- **map_republisher** (`sras_qos_tools`) — republishes `/map` → `/map_live` at 1 Hz
- **vision_llm_server** (`vision_llm_srv`) — vision LLM service node (OpenAI-compatible API)

## Dependencies

| Package | Source |
|---|---|
| `nav2_bringup` | Nav2 |
| `rosbridge_server` / `rosapi` | rosbridge_suite |
| `pointcloud_to_laserscan` | pointcloud_to_laserscan |
| `slam_toolbox` | slam_toolbox |
| `topic_tools` | ros2 topic_tools |
| `sras_qos_tools` | custom (workspace) |
| `vision_llm_srv` | custom (workspace) |

## Launch arguments

| Argument | Default | Description |
|---|---|---|
| `use_sim_time` | `false` | Use simulation clock |
| `map` | `/home/ubuntu/maps/office_map.yaml` | Path to the map YAML file |
| `nav2_params` | `~/go2_nav2/config/nav2_params.yaml` | Nav2 parameters file |
| `pointcloud_in` | `/robot0/point_cloud2_L1` | Input point cloud topic |
| `scan_out` | `/scan` | Output laser scan topic |
| `cmd_vel_in` | `/cmd_vel` | Input velocity command topic |
| `cmd_vel_robot` | `/robot0/cmd_vel` | Robot velocity command topic |
| `camera_rgb` | `/robot0/front_cam/rgb` | RGB camera topic |
| `pointcloud_throttled` | `/robot0/point_cloud2_L1_throttled` | Throttled point cloud topic |
| `camera_throttled` | `/robot0/front_cam/rgb_throttled` | Throttled camera topic |
| `posegraph_file` | `/home/ubuntu/maps/office_posegraph` | SLAM Toolbox posegraph file (without extension) |
| `slam_deserialize_delay_s` | `5.0` | Delay (s) before deserializing the posegraph |
| `openai_base_url` | `http://localhost:1234/v1` | OpenAI-compatible API base URL |
| `openai_api_key` | `lmstudio` | API key for the LLM endpoint |
| `openai_model` | `zai-org/glm-4.6v-flash` | Model name for the vision LLM |

## Usage

Currently the stack is launched with the following command:

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py \
  use_sim_time:=false \
  map:=/home/ubuntu/maps/office_map.yaml \
  nav2_params:=/home/ubuntu/go2_nav2/config/nav2_params.yaml \
  pointcloud_in:=/robot0/point_cloud2_L1 \
  scan_out:=/scan \
  cmd_vel_in:=/cmd_vel \
  cmd_vel_robot:=/robot0/cmd_vel \
  camera_rgb:=/robot0/front_cam/rgb \
  pointcloud_throttled:=/robot0/point_cloud2_L1_throttled \
  camera_throttled:=/robot0/front_cam/rgb_throttled \
  posegraph_file:=/home/ubuntu/maps/office_posegraph \
  slam_deserialize_delay_s:=5.0 \
  openai_base_url:=http://localhost:1234/v1 \
  openai_api_key:=lmstudio \
  openai_model:=zai-org/glm-4.6v-flash
```

Since all arguments have default values, a minimal invocation is:

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 launch sras_bringup go2_stack.launch.py
```

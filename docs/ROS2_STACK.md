# ROS2 Stack (Navigation, Mapping, Bridge)

Last verified: 2026-02-10

This is the “what runs together” view for `isaac-sim-1`.

## ROS2 distribution

- ROS2 Humble (`/opt/ros/humble`)

## Main bringup entrypoint

On the server, the main stack is launched via the `sras_bringup` package:

```bash
source /opt/ros/humble/setup.bash
source ~/ros2_ws/install/setup.bash 2>/dev/null || true

ros2 launch sras_bringup go2_stack.launch.py \
  use_sim_time:=false \
  map:=/home/ubuntu/maps/office_map.yaml \
  nav2_params:=/home/ubuntu/go2_nav2/config/nav2_params.yaml \
  pointcloud_in:=/robot0/point_cloud2_L1 \
  scan_out:=/scan \
  cmd_vel_in:=/cmd_vel \
  cmd_vel_robot:=/robot0/cmd_vel \
  camera_rgb:=/robot0/front_cam/rgb \
  posegraph_file:=/home/ubuntu/maps/office_posegraph \
  slam_deserialize_delay_s:=5.0 \
  openai_base_url:=http://localhost:1234/v1 \
  openai_api_key:=lmstudio \
  openai_model:=zai-org/glm-4.6v-flash
```

The launch file includes (high level):

- `rosbridge_server` launch include (WebSocket on `:9090`)
- `pointcloud_to_laserscan`
- `slam_toolbox` (async)
- `nav2_bringup/navigation_launch.py`
- `topic_tools relay` for cmd_vel
- message throttling for pointcloud/camera
- `sras_qos_tools/map_republisher` (`/map` → `/map_live`)
- `vision_llm_srv/vision_llm_server`
- delayed `ros2 service call /slam_toolbox/deserialize_map ...` to load posegraph

## LLM backend notes (for `vision_llm_srv`)

The bringup launch sets environment variables:

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

On `isaac-sim-1` these were configured to point at a local OpenAI-compatible endpoint:

- `http://localhost:1234/v1` (LM Studio style)

As of 2026-02-10, nothing was listening on `:1234`. If you expect vision-LLM calls to work, you need to either:

1. Start the local server (LM Studio is present on the instance as an AppImage in `~/Downloads`).
2. Or change `openai_base_url` to a reachable API endpoint.

Quick check:

```bash
ss -lntp | grep ':1234' || true
```

## DimOS VLM bridge nodes

The DimOS ROS2 bridge lives in `dimos_vlm_bridge` (from `DataPilot-R-D/sras_ros2_dimos_bridge`) and was launched as:

```bash
ros2 launch dimos_vlm_bridge temporal_memory.launch.py config:=/home/ubuntu/vlm_temporal/temporal_memory.yaml
ros2 launch dimos_vlm_bridge spatial_memory.launch.py  config:=/home/ubuntu/vlm_temporal/spatial_memory.yaml
```

At runtime those nodes were executed using:

- `/home/ubuntu/vlm_temporal/venv/bin/python3`

## Quick health checks

```bash
source /opt/ros/humble/setup.bash

ros2 node list | sort
ros2 topic list | sort
ros2 service list | grep slam_toolbox || true

# rosbridge should be listening
ss -lntp | grep ':9090' || true

# GPU
nvidia-smi
```

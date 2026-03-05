# Instance Runbook: `isaac-sim-1`

Last verified: 2026-02-10 (SSH session at ~10:37 UTC)

## Identity

- AWS Region: `eu-central-1`
- AZ: `eu-central-1b`
- InstanceId: `i-0da8f19d3053d21e6`
- Name tag: `isaac-sim-1`
- Instance type: `g6.4xlarge` (NVIDIA L4)
- Public IP: `63.182.177.92`
- Private IP: `172.31.33.252`
- Security group: `sg-0fd741f3ed3a5df90` (`isaac-sim-1-sg`)
- OS: Ubuntu 22.04.5 LTS

## Login

SSH:

```bash
ssh -i ~/.ssh/isaac-sim-1-key.pem ubuntu@63.182.177.92
```

If the connection times out, your current public IP is probably not allowed in the Security Group. See `docs/ACCESS.md`.

## Ports (observed)

Listening (as of 2026-02-10):

- `22/tcp`: SSH
- `5900/tcp`: `x11vnc` (VNC)
- `8443/tcp`: NICE DCV (web)
- `9090/tcp`: `rosbridge_websocket` (ROS bridge)
- `1984/tcp`: `go2rtc` (WebRTC video pipeline used by the dashboard)

Note: Isaac Sim WebRTC streaming (`:8011`) is provided by the Isaac Sim container when started via `~/start-isaac-sim-stream.sh`. At the time of verification, **no Docker containers were running** (`docker ps` was empty).

## What is running (high level)

The system was running a ROS2 stack + Go2 simulation:

- `x11vnc` serving the GUI (`:5900`)
- Go2 simulation: `python main.py ...` from `/home/ubuntu/go2_omniverse` (GPU used)
- ROS2 bringup: `ros2 launch sras_bringup go2_stack.launch.py ...`
- `rosbridge_websocket` (port `9090`)
- `slam_toolbox` + Nav2 servers (`controller_server`, `planner_server`, `bt_navigator`, etc.)
- DimOS bridge nodes:
  - `dimos_vlm_bridge/temporal_memory_node` (venv: `/home/ubuntu/vlm_temporal/venv`)
  - `dimos_vlm_bridge/spatial_memory_node` (venv: `/home/ubuntu/vlm_temporal/venv`)
- A “vision LLM server” node: `vision_llm_srv/vision_llm_server`

## Directory map (where is what)

Common paths:

- `/home/ubuntu/ros2_ws`
  - Main ROS2 workspace (build/install/log).
- `/home/ubuntu/ros2_ws/src/ros2_dimos_bridge`
  - Git repo for DimOS ROS2 bridge (`DataPilot-R-D/sras_ros2_dimos_bridge`).
- `/home/ubuntu/ros2_ws/src/sras_bringup`
  - ROS2 bringup package (`sras_bringup`) used to launch the stack.
  - Important: this directory **was not a git repo** at the time of verification.
- `/home/ubuntu/go2_nav2`
  - Nav2 config and helper scripts (has `config/nav2_params.yaml`, `start_all.sh`, etc.).
- `/home/ubuntu/go2_omniverse`
  - Go2 simulation code (git repo from `abizovnuralem/go2_omniverse`, with local modifications).
- `/home/ubuntu/vlm_temporal`
  - Python venv + runtime configs for memory nodes.
- `/home/ubuntu/maps`
  - Saved map + posegraph files used by bringup (see `docs/MAPS.md`).
- `/home/ubuntu/Downloads/LM-Studio-*.AppImage`
  - LM Studio AppImage (OpenAI-compatible local server, typically on `:1234`).

## Scripts (start/stop)

In `/home/ubuntu`:

- `~/start_go2_gui.sh`
  - Starts the Go2 simulation GUI using conda env `isaaclab` and `DISPLAY=:0`.
- `~/start-isaac-sim-stream.sh`
  - Starts `nvcr.io/nvidia/isaac-sim:5.1.0` (Docker, host networking) and launches rosbridge.
  - Configures STUN for WebRTC streaming.
- `~/status-isaac-sim.sh`
  - Quick status for the Isaac Sim container + streaming readiness.
- `~/stop-isaac-sim-stream.sh`
  - Stops/removes the Isaac Sim container.
- `~/start-isaac-ros2-vibe.sh` / `~/start-isaac-sim-ros2.sh`
  - Variants that enable ROS2 extensions / `sim_control`.

In `/home/ubuntu/go2_nav2`:

- `~/go2_nav2/start_all.sh`
  - Starts rosbridge, pointcloud_to_laserscan, slam_toolbox, nav2, cmd_vel relay, and some basic “web view” helpers.

## Disk usage note (risk)

Root filesystem was ~87% used (`194G` total, `~168G` used). Largest folders in home at the time:

- `~/.cache` ~56G (notably `~/.cache/huggingface` and `~/.cache/pip`)
- `~/miniconda3` ~23G
- `~/vlm_temporal` ~13G

If builds start failing or the instance becomes unstable, check disk pressure first.

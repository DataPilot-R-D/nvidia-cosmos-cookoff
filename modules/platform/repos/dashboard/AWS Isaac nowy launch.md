# Utworzenie sesji DCV

```bash
sudo dcv create-session myses --owner ubuntu
```

# Isaac symulacja

```
# nowy terminal - isaac symulacja
~/go2_omniverse/run_sim_custom.sh
```

# załadowanie Vision LLM

```

# nowy terminal - załadowanie VisionLLM'a
lms server start
lms load zai-org/glm-4.6v-flash
# powinien pokazać
# Loading model "zai-org/glm-4.6v-flash"...
# Model loaded successfully

#odładowanie llma
lms unload zai-org/glm-4.6v-flash

# zamknięcie
lms server stop
```

# ROS launch - cały nasz stack

```
# nowy terminal - cały nasz ROS launch, ładuje też mapę do nav2
# WAŻNE, żeby nie był w żadnym środowisku condy
# w razie czego -> conda deactivate

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

# zamknięcie - ctrl+c

```

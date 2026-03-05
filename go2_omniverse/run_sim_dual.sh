#!/bin/bash
export DISPLAY=:0
source ~/miniconda3/bin/activate isaaclab
source /opt/ros/humble/setup.bash
source ~/go2_omniverse/go2_omniverse_ws/install/setup.bash

cd ~/go2_omniverse
python main.py \
  --robot_amount 1 \
  --robot go2 \
  --with_g1 \
  --device cuda \
  --enable_cameras \
  --custom_env small_warehouse

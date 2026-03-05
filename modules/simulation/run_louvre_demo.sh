#!/bin/bash
# Louvre Security Demo — Go2 + H1 dual patrol
# Usage: ./run_louvre_demo.sh

set -e
cd "$(dirname "$0")"

# Display setup
export DISPLAY=${DISPLAY:-:0}
export PYTHONUNBUFFERED=1

# Textures symlink for Luvr scene
ln -sf "$(pwd)/scenes/Luvr.fbm" /tmp/textures 2>/dev/null || true

# Activate conda env
source ~/miniconda3/bin/activate isaaclab
source /opt/ros/humble/setup.bash
source ~/go2_omniverse/go2_omniverse_ws/install/setup.bash

echo "=== Louvre Security Demo ==="
echo "Go2 (quadruped) + H1 (humanoid) patrol"
echo "Controls: Go2=WASD/QE  H1=Numpad 8/2/4/6/7/9"
echo "ROS2 topics: robot0/* (Go2), h1_0/* (H1), cctv0-3/* (CCTV)"
echo "==========================="

python -u main.py \
    --robot_amount 1 \
    --robot go2 \
    --device cuda \
    --enable_cameras \
    --with_h1 \
    --custom_env louvre \
    "$@"

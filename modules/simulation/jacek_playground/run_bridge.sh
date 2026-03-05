#!/bin/bash
# Run ROS2 Sensor Bridge
# This script receives sensor data via UDP and publishes to ROS2 topics

cd "$(dirname "$0")"

echo "=========================================="
echo "ROS2 Sensor Bridge"
echo "=========================================="
echo ""
echo "Sourcing ROS2 environment..."

source /opt/ros/jazzy/setup.bash

echo "Starting bridge..."
echo "Listening on UDP port 9870"
echo "Press Ctrl+C to stop"
echo ""

python3 ros2_sensor_bridge.py

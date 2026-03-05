#!/bin/bash
# =============================================================================
# Map Diagnostic Script for ROS2 Server
# Run this on the EC2 instance with ROS2 to diagnose map visibility issues
# =============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           MAP DIAGNOSTIC SCRIPT - ROS2 Server                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== 1. CHECKING MAP TOPICS ==="
echo "Looking for map-related topics..."
MAP_TOPICS=$(ros2 topic list 2>/dev/null | grep -E "(map|costmap|slam)" || echo "")
if [ -z "$MAP_TOPICS" ]; then
    echo -e "${RED}✗ No map topics found!${NC}"
    echo "  SLAM Toolbox may not be running."
else
    echo -e "${GREEN}✓ Found map topics:${NC}"
    echo "$MAP_TOPICS" | while read topic; do echo "    $topic"; done
fi
echo ""

echo "=== 2. CHECKING /map TOPIC INFO ==="
if ros2 topic info /map 2>/dev/null; then
    echo -e "${GREEN}✓ /map topic exists${NC}"
    echo ""
    echo "QoS Profile:"
    ros2 topic info /map --verbose 2>/dev/null | grep -A10 "QoS" || echo "  Could not get QoS info"
else
    echo -e "${RED}✗ /map topic does NOT exist!${NC}"
    echo "  Check if SLAM Toolbox is running."
fi
echo ""

echo "=== 3. CHECKING /slam_toolbox/map TOPIC ==="
if ros2 topic info /slam_toolbox/map 2>/dev/null; then
    echo -e "${GREEN}✓ /slam_toolbox/map topic exists${NC}"
else
    echo -e "${YELLOW}⚠ /slam_toolbox/map topic not found${NC}"
    echo "  This is normal if using standard /map topic."
fi
echo ""

echo "=== 4. CHECKING MAP PUBLICATION RATE ==="
echo "Waiting 3 seconds for /map messages..."
MAP_HZ=$(timeout 3 ros2 topic hz /map 2>/dev/null | head -5 || echo "")
if [ -z "$MAP_HZ" ]; then
    echo -e "${YELLOW}⚠ No messages on /map in last 3 seconds${NC}"
    echo "  This is expected for transient_local - map publishes once."
    echo "  Checking if map data exists..."
    timeout 2 ros2 topic echo /map --once 2>/dev/null | head -20 && echo -e "${GREEN}✓ Map data available${NC}" || echo -e "${RED}✗ No map data${NC}"
else
    echo -e "${GREEN}✓ /map is publishing:${NC}"
    echo "$MAP_HZ"
fi
echo ""

echo "=== 5. CHECKING SLAM TOOLBOX NODES ==="
SLAM_NODES=$(ros2 node list 2>/dev/null | grep -i slam || echo "")
if [ -z "$SLAM_NODES" ]; then
    echo -e "${RED}✗ No SLAM nodes running!${NC}"
    echo "  Start SLAM Toolbox: ros2 launch slam_toolbox online_async_launch.py"
else
    echo -e "${GREEN}✓ SLAM nodes found:${NC}"
    echo "$SLAM_NODES" | while read node; do echo "    $node"; done
fi
echo ""

echo "=== 6. CHECKING ROSBRIDGE STATUS ==="
ROSBRIDGE_NODE=$(ros2 node list 2>/dev/null | grep -i rosbridge || echo "")
if [ -z "$ROSBRIDGE_NODE" ]; then
    echo -e "${RED}✗ rosbridge_websocket not running!${NC}"
    echo "  Start it: ros2 launch rosbridge_server rosbridge_websocket_launch.xml"
else
    echo -e "${GREEN}✓ rosbridge is running:${NC}"
    echo "    $ROSBRIDGE_NODE"
    echo ""
    echo "Checking rosbridge subscriptions:"
    ros2 node info $ROSBRIDGE_NODE 2>/dev/null | grep -A50 "Subscriptions:" | head -30 || echo "  Could not get subscription info"
fi
echo ""

echo "=== 7. CHECKING ROSBRIDGE VERSION ==="
ros2 pkg xml rosbridge_server 2>/dev/null | grep -E "(version|name)" | head -2 || echo -e "${YELLOW}⚠ Could not determine rosbridge version${NC}"
echo ""

echo "=== 8. CHECKING TF FRAMES ==="
echo "Looking for map frame..."
TF_FRAMES=$(ros2 run tf2_ros tf2_echo map base_link 2>&1 | head -5 || echo "")
if echo "$TF_FRAMES" | grep -q "Exception"; then
    echo -e "${YELLOW}⚠ TF transform map->base_link not available${NC}"
else
    echo -e "${GREEN}✓ TF map->base_link available${NC}"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                      DIAGNOSTIC COMPLETE                         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "TROUBLESHOOTING STEPS:"
echo "1. If no SLAM nodes: ros2 launch slam_toolbox online_async_launch.py"
echo "2. If no rosbridge: ros2 launch rosbridge_server rosbridge_websocket_launch.xml"
echo "3. If /map exists but no data: restart SLAM or trigger republish"
echo "4. Check rosbridge version >= 1.3.0 for QoS support"
echo ""

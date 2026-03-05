# Installation Guide - DimOS VLM Bridge for ROS2

Complete installation and integration instructions for the DimOS VLM Bridge package.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Install ROS2](#install-ros2)
3. [Install DimOS](#install-dimos)
4. [Install ROS2 Package](#install-ros2-package)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Integration with Your Robot](#integration-with-your-robot)

---

## System Requirements

### Hardware
- **CPU**: Modern x86_64 processor (Intel/AMD)
- **RAM**: Minimum 8GB (16GB recommended for combined memory)
- **GPU**: Optional (recommended for local VLM models like Moondream)
- **Storage**: 10GB free space

### Software
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Python**: 3.10 or later
- **ROS2**: Humble Hawksbill or later

---

## Install ROS2

### Ubuntu 22.04 - ROS2 Humble

```bash
# Set locale
sudo apt update && sudo apt install locales
sudo locale-gen en_US en_US.UTF-8
sudo update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
export LANG=en_US.UTF-8

# Setup sources
sudo apt install software-properties-common
sudo add-apt-repository universe
sudo apt update && sudo apt install curl -y
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
  -o /usr/share/keyrings/ros-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \
  http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" | \
  sudo tee /etc/apt/sources.list.d/ros2.list > /dev/null

# Install ROS2
sudo apt update
sudo apt install ros-humble-desktop -y

# Install development tools
sudo apt install python3-colcon-common-extensions python3-rosdep -y

# Initialize rosdep
sudo rosdep init
rosdep update

# Source ROS2
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

If you use other backends:

```bash
# Hosted Moondream API
export MOONDREAM_API_KEY="your-key"

# Qwen via DashScope API
export ALIBABA_API_KEY="your-key"
```

### Verify ROS2 Installation

```bash
ros2 --version
# Should output: ros2 cli version: ...

# Test with demo
ros2 run demo_nodes_cpp talker
# (Ctrl+C to stop)
```

---

## Install DimOS

### 1. Clone DimOS Repository

```bash
cd ~/work/workspace/datapilot
# If you already have DimOS, skip this step
# Otherwise:
git clone <dimos-repo-url> dimos
cd dimos
```

### 2. Install DimOS Dependencies

```bash
# Install Python dependencies
pip install -e .

# Or if using virtual environment (recommended)
python3 -m venv ~/dimos_venv
source ~/dimos_venv/bin/activate
pip install -e .
```

### 3. Install Additional Dependencies

```bash
# For Temporal Memory
pip install chromadb openai anthropic

# For Spatial Memory (CLIP)
pip install ftfy regex tqdm
pip install git+https://github.com/openai/CLIP.git

# For image processing
pip install opencv-python pillow

# For ROS2 bridge
pip install cv_bridge
```

### 3b. Local VLM backend (Moondream) (Optional)

If you want to run without external API keys, use `vlm_backend: moondream_local`.

Install PyTorch + Transformers in the same environment as DimOS:

```bash
# CPU-only (simple default)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install transformers accelerate
pip install pillow
```

If you have NVIDIA GPU, install a CUDA-enabled torch build appropriate for your CUDA version.

### 4. Set OpenAI API Key

```bash
# Get API key from https://platform.openai.com/api-keys
export OPENAI_API_KEY="sk-your-api-key-here"

# Add to ~/.bashrc for persistence
echo 'export OPENAI_API_KEY="sk-your-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

### 5. Verify DimOS Installation

```bash
python3 << EOF
import dimos
from dimos.models.vl.openai import OpenAIVlModel
from dimos.perception.experimental.temporal_memory.entity_graph_db import EntityGraphDB

print("DimOS installed successfully!")
print(f"Version: {dimos.__version__}")
EOF
```

---

## Install ROS2 Package

### 1. Create ROS2 Workspace

```bash
# Create workspace
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src
```

### 2. Link or Copy Package

**Option A: Symlink (recommended for development)**

```bash
ln -s /home/jacek/work/workspace/datapilot/dimos/ros2_dimos_bridge dimos_vlm_bridge
```

**Option B: Copy**

```bash
cp -r /home/jacek/work/workspace/datapilot/dimos/ros2_dimos_bridge dimos_vlm_bridge
```

### 3. Install ROS2 Dependencies

```bash
cd ~/ros2_ws
rosdep install --from-paths src --ignore-src -r -y
```

### 4. Build Package

```bash
cd ~/ros2_ws
colcon build --packages-select dimos_vlm_bridge

# If using virtual environment, activate it first
source ~/dimos_venv/bin/activate
colcon build --packages-select dimos_vlm_bridge
```

### 5. Source Workspace

```bash
source ~/ros2_ws/install/setup.bash

# Add to ~/.bashrc for persistence
echo "source ~/ros2_ws/install/setup.bash" >> ~/.bashrc
```

### 6. Verify Package Installation

```bash
# List package
ros2 pkg list | grep dimos

# Should output: dimos_vlm_bridge

# Check executables
ros2 pkg executables dimos_vlm_bridge

# Should output:
# dimos_vlm_bridge temporal_memory_node
# dimos_vlm_bridge spatial_memory_node
# dimos_vlm_bridge combined_memory_node
# dimos_vlm_bridge vlm_query_service
```

---

## Configuration

### 1. Create Working Directory

```bash
mkdir -p ~/dimos_data/{temporal_memory,spatial_memory,combined_memory}
```

### 2. Edit Configuration Files

Configuration files are in `~/ros2_ws/install/dimos_vlm_bridge/share/dimos_vlm_bridge/config/`

**Temporal Memory** (`temporal_memory.yaml`):

```yaml
temporal_memory_node:
  ros__parameters:
    output_dir: "/home/your-username/dimos_data/temporal_memory"
    camera_topic: "/camera/image_raw"  # Change to your camera topic
    fps: 1.0
    persistent_memory: true
```

**Spatial Memory** (`spatial_memory.yaml`):

```yaml
spatial_memory_node:
  ros__parameters:
    output_dir: "/home/your-username/dimos_data/spatial_memory"
    camera_topic: "/camera/image_raw"  # Change to your camera topic
    odom_topic: "/odom"                # Change to your odometry topic
    min_distance_threshold: 0.5
```

### 3. Custom Configuration (Optional)

```bash
# Copy config files to custom location
mkdir -p ~/dimos_config
cp ~/ros2_ws/install/dimos_vlm_bridge/share/dimos_vlm_bridge/config/*.yaml ~/dimos_config/

# Edit
nano ~/dimos_config/temporal_memory.yaml

# Launch with custom config
ros2 launch dimos_vlm_bridge temporal_memory.launch.py \
  config:=~/dimos_config/temporal_memory.yaml
```

---

## Verification

### Test 1: VLM Query Service (Simplest)

```bash
# Terminal 1: Launch VLM service
ros2 launch dimos_vlm_bridge vlm_query.launch.py

# Terminal 2: Publish test image (or use your camera)
ros2 run usb_cam usb_cam_node_exe

# Terminal 3: Query
ros2 topic pub /vlm/query std_msgs/String \
  "data: 'What do you see?'" --once

# Terminal 4: Check result
ros2 topic echo /vlm/result
```

#### Test 1b: VLM Query Service with local model (no API keys)

```bash
# Run node with local backend
ros2 run dimos_vlm_bridge vlm_query_service \
  --ros-args -p vlm_backend:=moondream_local

# Start camera
ros2 run usb_cam usb_cam_node_exe

# Query
ros2 topic pub /vlm/query std_msgs/String \
  "data: 'What do you see?'" --once

ros2 topic echo /vlm/result
```

### Test 2: Temporal Memory

```bash
# Terminal 1: Launch temporal memory
ros2 launch dimos_vlm_bridge temporal_memory.launch.py

# Terminal 2: Camera
ros2 run usb_cam usb_cam_node_exe

# Wait ~30 seconds for system to build context

# Terminal 3: Query
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What entities are visible?'" --once

# Terminal 4: Check result
ros2 topic echo /temporal_memory/result

# Terminal 5: Check entity roster
ros2 topic echo /temporal_memory/entities
```

### Test 3: Check Database

```bash
# After running temporal memory for a while
ls -lh ~/dimos_data/temporal_memory/

# Should see:
# entity_graph.db
# evidence.jsonl
# state.json
# entities.json

# Query database
python3 << EOF
from dimos.perception.experimental.temporal_memory.entity_graph_db import EntityGraphDB

db = EntityGraphDB("~/dimos_data/temporal_memory/entity_graph.db")
stats = db.get_stats()
print(f"Entities: {stats['entities']}")
print(f"Relations: {stats['relations']}")
EOF
```

---

## Integration with Your Robot

### 1. Topic Remapping

If your robot uses different topic names:

```bash
# Method 1: Command line
ros2 run dimos_vlm_bridge temporal_memory_node \
  --ros-args \
  -p camera_topic:=/my_robot/camera/image \
  -p query_topic:=/my_robot/vlm/query \
  -p vlm_backend:=moondream_local

# Method 2: Launch file
ros2 launch dimos_vlm_bridge temporal_memory.launch.py \
  config:=~/my_robot_config/temporal_memory.yaml
```

### 2. Create Custom Launch File

```python
# ~/ros2_ws/src/my_robot/launch/vlm_integration.launch.py

from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        # Your robot nodes
        Node(
            package='my_robot',
            executable='camera_node',
            name='camera',
        ),
        
        # DimOS Temporal Memory
        Node(
            package='dimos_vlm_bridge',
            executable='temporal_memory_node',
            name='temporal_memory',
            parameters=[{
                'camera_topic': '/my_robot/camera/image',
                'output_dir': '/home/user/robot_data/temporal_memory',
            }],
        ),
        
        # DimOS Spatial Memory
        Node(
            package='dimos_vlm_bridge',
            executable='spatial_memory_node',
            name='spatial_memory',
            parameters=[{
                'camera_topic': '/my_robot/camera/image',
                'odom_topic': '/my_robot/odom',
                'output_dir': '/home/user/robot_data/spatial_memory',
            }],
        ),
    ])
```

### 3. Integration Example: Semantic Navigation

```python
# ~/ros2_ws/src/my_robot/my_robot/semantic_navigator.py

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from geometry_msgs.msg import PoseStamped

class SemanticNavigator(Node):
    def __init__(self):
        super().__init__('semantic_navigator')
        
        # Query spatial memory
        self.query_pub = self.create_publisher(
            String, '/spatial_memory/query_text', 10
        )
        
        # Listen to results
        self.location_sub = self.create_subscription(
            PoseStamped,
            '/spatial_memory/location_result',
            self.location_callback,
            10
        )
        
        # Send to navigation
        self.goal_pub = self.create_publisher(
            PoseStamped, '/goal_pose', 10
        )
    
    def navigate_to(self, location_name):
        """Navigate to semantic location."""
        msg = String()
        msg.data = location_name
        self.query_pub.publish(msg)
        self.get_logger().info(f'Searching for: {location_name}')
    
    def location_callback(self, msg):
        """Forward location to navigation."""
        self.goal_pub.publish(msg)
        self.get_logger().info(
            f'Navigating to ({msg.pose.position.x:.2f}, {msg.pose.position.y:.2f})'
        )

def main():
    rclpy.init()
    navigator = SemanticNavigator()
    
    # Example: Navigate to kitchen
    navigator.navigate_to('kitchen')
    
    rclpy.spin(navigator)

if __name__ == '__main__':
    main()
```

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'dimos'"

**Solution:**
```bash
# Activate virtual environment if using one
source ~/dimos_venv/bin/activate

# Reinstall DimOS
cd /path/to/dimos
pip install -e .

# Rebuild ROS2 package
cd ~/ros2_ws
colcon build --packages-select dimos_vlm_bridge
```

### Issue: "OPENAI_API_KEY not set"

**Solution:**
```bash
export OPENAI_API_KEY="your-key"
echo 'export OPENAI_API_KEY="your-key"' >> ~/.bashrc
```

### Issue: "No image available"

**Solution:**
```bash
# Check camera is publishing
ros2 topic list | grep image
ros2 topic hz /camera/image_raw

# Check topic name in config matches
ros2 param get /temporal_memory_node camera_topic
```

### Issue: High CPU/Memory Usage

**Solution:**
```bash
# Reduce processing frequency
# Edit config file:
fps: 0.5  # Instead of 1.0
max_frames_per_window: 2  # Instead of 3
```

### Issue: Database Permission Errors

**Solution:**
```bash
# Ensure output directory is writable
chmod -R 755 ~/dimos_data/
```

---

## Next Steps

1. **Read Documentation**:
   - `README.md` - Package overview and usage
   - `../PRACTICAL_VLM_TEMPORAL_SPATIAL_GUIDE.md` - Detailed guide

2. **Run Examples**:
   - Start with VLM Query Service (simplest)
   - Progress to Temporal Memory
   - Add Spatial Memory
   - Try Combined Memory

3. **Integrate with Your Robot**:
   - Remap topics to your robot
   - Create custom launch files
   - Build semantic navigation

4. **Optimize**:
   - Tune configuration for your use case
   - Monitor performance
   - Adjust VLM frequency vs cost

---

## Support

For issues and questions:
- Check `README.md` for usage examples
- See troubleshooting section above
- Review DimOS documentation in parent directory

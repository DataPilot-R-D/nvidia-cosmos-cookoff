# DimOS VLM Bridge for ROS2

ROS2 package providing integration with DimOS VLM capabilities (Temporal Memory, Spatial Memory, Entity Graph) using DimOS as a library.

## Overview

This package provides four ROS2 nodes:

1. **temporal_memory_node** - Temporal reasoning with entity tracking and graph database
2. **spatial_memory_node** - Semantic mapping with CLIP embeddings
3. **combined_memory_node** - Combined temporal + spatial reasoning
4. **vlm_query_service** - Simple VLM query service

## Features

### Temporal Memory Node
- **Entity tracking**: Automatically detects and tracks people, objects, locations
- **Relation detection**: Understands who does what (holds, looks_at, talks_to)
- **Distance estimation**: Estimates spatial distances between entities
- **Semantic relations**: Learns what goes with what (cup goes_with coffee_maker)
- **Entity Graph Database**: SQLite database with 3 types of graphs:
  - Relations Graph (interactions)
  - Distance Graph (spatial)
  - Semantic Graph (knowledge)
- **Temporal queries**: "What happened in the last 30 seconds?"
- **Persistent memory**: Graph database survives restarts

### Spatial Memory Node
- **Semantic mapping**: Build a map queryable by natural language
- **CLIP embeddings**: Vector similarity search for images
- **Location tagging**: Tag locations with semantic names
- **Query by text**: "Where is the kitchen?"
- **Query by location**: Show images near (x, y)
- **Persistent storage**: ChromaDB + visual memory

### Combined Memory Node
- **Advanced reasoning**: Combines temporal and spatial memory
- **Complex queries**: "Where did I last see my keys?"
- **Location extraction**: Automatically finds locations from temporal context

### VLM Query Service
- **Lightweight**: Simple VLM queries without memory
- **Fast**: Direct image → answer
- **Flexible**: Supports multiple backends (OpenAI, Moondream local/hosted, Qwen via DashScope)

## Installation

### Prerequisites

1. **ROS2** (Humble or later)
   ```bash
   # Ubuntu 22.04
   sudo apt install ros-humble-desktop
   ```

2. **DimOS** (from parent directory)
   ```bash
   cd /path/to/dimos
   pip install -e .
   ```

3. **Choose a VLM backend**

   Supported backends (parameter: `vlm_backend`):
   - `openai` (requires `OPENAI_API_KEY`)
   - `moondream_local` (fully local HF/torch, no API key)
   - `moondream_hosted` (requires `MOONDREAM_API_KEY`)
   - `qwen` (requires `ALIBABA_API_KEY`, via DashScope API)

4. **OpenAI API Key** (only if using `vlm_backend: openai`)
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   # Add to ~/.bashrc for persistence
   echo 'export OPENAI_API_KEY="your-api-key-here"' >> ~/.bashrc
   ```

5. **Local VLM dependencies** (only if using `vlm_backend: moondream_local`)

   Install PyTorch + Transformers in the same Python environment where DimOS runs.
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
   pip install transformers accelerate
   pip install pillow
   ```

   If you have NVIDIA GPU, install the CUDA-enabled torch build appropriate for your CUDA version.

### Build Package

```bash
# Navigate to your ROS2 workspace
cd ~/ros2_ws/src

# Copy or symlink this package
ln -s /path/to/dimos/ros2_dimos_bridge dimos_vlm_bridge

# Build
cd ~/ros2_ws
colcon build --packages-select dimos_vlm_bridge

# Source
source install/setup.bash
```

## Quick Start

### 1. Temporal Memory (Entity Tracking)

```bash
# Terminal 1: Launch temporal memory
ros2 launch dimos_vlm_bridge temporal_memory.launch.py

# Terminal 2: Start your camera
ros2 run usb_cam usb_cam_node_exe

# Terminal 3: Query the system
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What entities are visible?'" --once

# Terminal 4: Listen to results
ros2 topic echo /temporal_memory/result

# Terminal 5: Monitor entity roster
ros2 topic echo /temporal_memory/entities
```

### 2. Spatial Memory (Semantic Mapping)

```bash
# Terminal 1: Launch spatial memory
ros2 launch dimos_vlm_bridge spatial_memory.launch.py

# Terminal 2: Start camera and odometry
ros2 run usb_cam usb_cam_node_exe
# (Your navigation stack should publish /odom)

# Terminal 3: Drive around to build map
ros2 run teleop_twist_keyboard teleop_twist_keyboard

# Terminal 4: Query locations
ros2 topic pub /spatial_memory/query_text std_msgs/String \
  "data: 'kitchen'" --once

# Terminal 5: Listen to location results
ros2 topic echo /spatial_memory/location_result
```

### 3. Combined Memory (Advanced Reasoning)

```bash
# Terminal 1: Launch combined system
ros2 launch dimos_vlm_bridge combined_memory.launch.py

# Terminal 2: Start camera and odometry
ros2 run usb_cam usb_cam_node_exe

# Terminal 3: Complex queries
ros2 topic pub /memory/query std_msgs/String \
  "data: 'Where did I last see my keys?'" --once

# Terminal 4: Listen to results
ros2 topic echo /memory/result

# Terminal 5: Listen to locations
ros2 topic echo /memory/location
```

### 4. Simple VLM Query

```bash
# Terminal 1: Launch VLM service
ros2 launch dimos_vlm_bridge vlm_query.launch.py

# Terminal 2: Start camera
ros2 run usb_cam usb_cam_node_exe

# Terminal 3: Query VLM
ros2 topic pub /vlm/query std_msgs/String \
  "data: 'What do you see?'" --once

# Terminal 4: Listen to results
ros2 topic echo /vlm/result

# Or use service
ros2 service call /vlm_query_service/describe_scene std_srvs/srv/Trigger
```

#### Using a local VLM (no API keys)

To use the fully local backend:

```bash
ros2 run dimos_vlm_bridge vlm_query_service \
  --ros-args -p vlm_backend:=moondream_local
```

Optional: override HF model name:

```bash
ros2 run dimos_vlm_bridge vlm_query_service \
  --ros-args -p vlm_backend:=moondream_local -p vlm_model_name:=vikhyatk/moondream2
```

## Configuration

All nodes support YAML configuration files in `config/` directory.

### Temporal Memory Config

Edit `config/temporal_memory.yaml`:

```yaml
temporal_memory_node:
  ros__parameters:
    output_dir: "./temporal_memory"
    fps: 1.0                      # Process 1 frame/second
    window_s: 2.0                 # 2-second windows
    stride_s: 2.0                 # New window every 2s
    persistent_memory: true       # Keep graph across sessions
    vlm_backend: "openai"          # openai|moondream_local|moondream_hosted|qwen
    vlm_model_name: ""             # optional override for some backends
    camera_topic: "/camera/image_raw"
```

### Spatial Memory Config

Edit `config/spatial_memory.yaml`:

```yaml
spatial_memory_node:
  ros__parameters:
    output_dir: "./spatial_memory"
    min_distance_threshold: 0.5   # 50cm minimum movement
    min_time_threshold: 1.0       # 1s minimum time
    embedding_model: "clip"
    camera_topic: "/camera/image_raw"
    odom_topic: "/odom"
```

## Topics and Services

### Temporal Memory Node

**Subscribed Topics:**
- `/camera/image_raw` (sensor_msgs/Image) - Camera input
- `/temporal_memory/query` (std_msgs/String) - Query requests

**Published Topics:**
- `/temporal_memory/result` (std_msgs/String) - Query results
- `/temporal_memory/entities` (std_msgs/String) - Entity roster (JSON)

**Services:**
- `~/get_state` (std_srvs/Trigger) - Get current state
- `~/get_stats` (std_srvs/Trigger) - Get graph database statistics

### Spatial Memory Node

**Subscribed Topics:**
- `/camera/image_raw` (sensor_msgs/Image) - Camera input
- `/odom` (nav_msgs/Odometry) - Robot odometry
- `/spatial_memory/query_text` (std_msgs/String) - Text queries

**Published Topics:**
- `/spatial_memory/location_result` (geometry_msgs/PoseStamped) - Found locations

**Services:**
- `~/tag_location` (std_srvs/Trigger) - Tag current location
- `~/get_stats` (std_srvs/Trigger) - Get statistics

### Combined Memory Node

**Subscribed Topics:**
- `/camera/image_raw` (sensor_msgs/Image) - Camera input
- `/odom` (nav_msgs/Odometry) - Robot odometry
- `/memory/query` (std_msgs/String) - Complex queries

**Published Topics:**
- `/memory/result` (std_msgs/String) - Query results
- `/memory/location` (geometry_msgs/PoseStamped) - Found locations

**Services:**
- `~/get_stats` (std_srvs/Trigger) - Get combined statistics

### VLM Query Service

**Subscribed Topics:**
- `/camera/image_raw` (sensor_msgs/Image) - Camera input
- `/vlm/query` (std_msgs/String) - Query requests

**Published Topics:**
- `/vlm/result` (std_msgs/String) - Query results

**Services:**
- `~/describe_scene` (std_srvs/Trigger) - Describe current scene

## Example Queries

### Temporal Memory

```bash
# Current state
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What entities are currently visible?'" --once

# Recent events
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What happened in the last 30 seconds?'" --once

# Entity relations
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What is person_1 doing?'" --once

# Spatial relations
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What objects are near the laptop?'" --once

# Semantic relations
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What objects typically go together?'" --once
```

### Spatial Memory

```bash
# Find location by description
ros2 topic pub /spatial_memory/query_text std_msgs/String \
  "data: 'kitchen'" --once

ros2 topic pub /spatial_memory/query_text std_msgs/String \
  "data: 'person in blue shirt'" --once

ros2 topic pub /spatial_memory/query_text std_msgs/String \
  "data: 'table with laptop'" --once
```

### Combined Memory

```bash
# Complex temporal + spatial queries
ros2 topic pub /memory/query std_msgs/String \
  "data: 'Where did I last see my keys?'" --once

ros2 topic pub /memory/query std_msgs/String \
  "data: 'What was I doing in the kitchen?'" --once

ros2 topic pub /memory/query std_msgs/String \
  "data: 'Show me where person_1 was standing'" --once
```

## Accessing Entity Graph Database

The temporal memory node stores all data in SQLite database at `./temporal_memory/entity_graph.db`.

You can query it directly:

```bash
# Get statistics
ros2 service call /temporal_memory_node/get_stats std_srvs/srv/Trigger

# Or use Python
python3 << EOF
from dimos.perception.experimental.temporal_memory.entity_graph_db import EntityGraphDB

db = EntityGraphDB("./temporal_memory/entity_graph.db")

# Get all entities
entities = db.get_all_entities()
for e in entities:
    print(f"{e['entity_id']}: {e['descriptor']}")

# Get relations for entity
relations = db.get_relations_for_entity("person_1")
for r in relations:
    print(f"{r['subject_id']} --{r['relation_type']}--> {r['object_id']}")

# Get nearby entities
nearby = db.get_nearby_entities("person_1", max_distance=2.0)
for e in nearby:
    print(f"{e['entity_id']} at {e['distance_meters']:.2f}m")
EOF
```

## Persistence

### Temporal Memory
- **Database**: `./temporal_memory/entity_graph.db` (SQLite)
- **Evidence**: `./temporal_memory/evidence.jsonl` (VLM responses)
- **State**: `./temporal_memory/state.json` (current state)
- **Entities**: `./temporal_memory/entities.json` (entity roster)

### Spatial Memory
- **Vector DB**: `./spatial_memory/chromadb/` (ChromaDB)
- **Images**: `./spatial_memory/visual_memory.pkl` (pickled images)

All data persists across restarts by default.

## Performance

### Temporal Memory
- **VLM calls**: ~1-5s per window (depends on API)
- **Cost**: ~$0.01 per window with GPT-4V
- **Frequency**: 1 FPS, stride 2s = 30 windows/min = $0.30/min
- **Alternative**: Use `moondream_local` (free, slower, CPU/GPU dependent)

### Spatial Memory
- **CLIP embedding**: ~50ms per image
- **ChromaDB query**: ~10-50ms
- **Storage**: ~1MB per 100 images

## Troubleshooting

### "DimOS not available"
```bash
# Install DimOS
cd /path/to/dimos
pip install -e .

# Verify
python3 -c "import dimos; print(dimos.__version__)"
```

### "OPENAI_API_KEY not set"
```bash
export OPENAI_API_KEY="your-key"
# Or switch to local VLM:
# ros2 run dimos_vlm_bridge vlm_query_service --ros-args -p vlm_backend:=moondream_local
```

### "No image available"
```bash
# Check camera topic
ros2 topic list | grep image
ros2 topic echo /camera/image_raw --no-arr

# Remap if needed
ros2 run dimos_vlm_bridge temporal_memory_node \
  --ros-args -p camera_topic:=/your/camera/topic
```

### High memory usage
```bash
# Reduce frame buffer size in config
fps: 0.5  # Process fewer frames
max_frames_per_window: 2  # Fewer frames per window
```

## Integration with Navigation

Example: Navigate to semantic location found by spatial memory

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from geometry_msgs.msg import PoseStamped

class SemanticNavigator(Node):
    def __init__(self):
        super().__init__('semantic_navigator')
        
        # Subscribe to spatial memory results
        self.location_sub = self.create_subscription(
            PoseStamped,
            '/spatial_memory/location_result',
            self.location_callback,
            10
        )
        
        # Publish to navigation goal
        self.goal_pub = self.create_publisher(
            PoseStamped,
            '/goal_pose',
            10
        )
    
    def location_callback(self, msg):
        # Forward to navigation
        self.goal_pub.publish(msg)
        self.get_logger().info(
            f'Navigating to ({msg.pose.position.x:.2f}, {msg.pose.position.y:.2f})'
        )

def main():
    rclpy.init()
    node = SemanticNavigator()
    rclpy.spin(node)

if __name__ == '__main__':
    main()
```

## License

Apache-2.0

## Support

For issues and questions, see the main DimOS documentation:
- Visual Reasoning Analysis: `../VISUAL_REASONING_ANALYSIS.md`
- ROS2 Integration Analysis: `../ROS2_INTEGRATION_ANALYSIS.md`
- ROS2 Bridge VLM Integration: `../ROS2_BRIDGE_VLM_INTEGRATION.md`
- Practical VLM Guide: `../PRACTICAL_VLM_TEMPORAL_SPATIAL_GUIDE.md`

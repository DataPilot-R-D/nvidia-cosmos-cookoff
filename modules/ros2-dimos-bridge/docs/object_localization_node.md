# Object Localization Node

## Overview

The `object_localization_node` combines Vision Language Model (VLM) object detection with LIDAR point cloud data to detect and localize objects in 3D space. It stores detected objects with their positions in a SQLite database.

## Features

- **VLM-based Object Detection**: Uses vision language models to detect objects in camera images
- **LIDAR-based 3D Localization**: Projects detected bounding boxes onto LIDAR point clouds to determine object positions
- **Database Storage**: Stores detections with timestamps, robot position, object position, and metadata
- **Configurable Detection Interval**: Control how often object detection runs
- **Multiple VLM Backend Support**: Compatible with OpenAI, Qwen, Moondream, and other VLM backends

## How It Works

1. **Synchronization**: The node synchronizes camera images, camera info, and LIDAR point clouds
2. **Object Detection**: At configurable intervals, the VLM analyzes the camera image and returns detected objects with bounding boxes
3. **3D Localization**: For each detected object:
   - LIDAR points are projected into the camera frame
   - Points within the object's bounding box are identified
   - The median (or configurable percentile) position is calculated
   - Position is transformed to the map frame
4. **Storage**: Detection data is stored in SQLite database with:
   - Timestamp
   - Object name and description
   - Robot position (from odometry)
   - Object position (from LIDAR)
   - Bounding box coordinates
   - Confidence score

## Configuration

Edit `config/object_localization.yaml`:

```yaml
object_localization_node:
  ros__parameters:
    # Detection interval in seconds
    detection_interval: 2.0
    
    # VLM backend (moondream_local, openai, qwen, cosmos_reason2, etc.)
    vlm_backend: "moondream_local"
    
    # NVIDIA Cosmos Reason 2 configuration (only for cosmos_reason2 backend)
    cosmos_api_url: ""  # e.g., "http://localhost:8000"
    cosmos_api_key: ""  # Optional API key
    
    # ROS2 topics
    camera_topic: "/robot0/front_cam/rgb"
    camera_info_topic: "/robot0/front_cam/camera_info"
    pointcloud_topic: "/robot0/point_cloud2_L1"
    odom_topic: "/odom"
    
    # TF frames
    camera_frame: "robot0/front_cam_optical_frame"
    map_frame: "map"
    
    # Database path
    db_path: "./object_localization/objects.db"
```

## Usage

### Launch the Node

```bash
ros2 launch dimos_vlm_bridge object_localization.launch.py
```

Or with custom config:

```bash
ros2 launch dimos_vlm_bridge object_localization.launch.py config:=/path/to/config.yaml
```

### Run Directly

```bash
ros2 run dimos_vlm_bridge object_localization_node --ros-args --params-file config/object_localization.yaml
```

## Topics

### Subscribed Topics

- `camera_topic` (sensor_msgs/Image): Camera RGB images
- `camera_info_topic` (sensor_msgs/CameraInfo): Camera calibration info
- `pointcloud_topic` (sensor_msgs/PointCloud2): LIDAR point cloud
- `odom_topic` (nav_msgs/Odometry): Robot odometry

### Published Topics

- `~/detections` (std_msgs/String): JSON messages with detection summaries

## Services

### Get Statistics

```bash
ros2 service call /object_localization_node/get_stats std_srvs/srv/Trigger
```

Returns:
- Total number of detections
- Number of unique objects
- Top 10 most frequently detected objects

### Clear Database

```bash
ros2 service call /object_localization_node/clear_database std_srvs/srv/Trigger
```

Clears all detections from the database.

## Database Schema

The SQLite database (`objects.db`) contains a `detections` table:

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| timestamp | REAL | Unix timestamp |
| object_name | TEXT | Object name/type |
| object_description | TEXT | Object description |
| robot_x, robot_y, robot_z | REAL | Robot position |
| object_x, object_y, object_z | REAL | Object position (nullable) |
| confidence | REAL | Detection confidence |
| bbox_x_min, bbox_y_min, bbox_x_max, bbox_y_max | INTEGER | Bounding box |
| frame_id | TEXT | Reference frame |

## Querying the Database

### Using SQLite CLI

```bash
sqlite3 object_localization/objects.db

# List all detections
SELECT * FROM detections ORDER BY timestamp DESC LIMIT 10;

# Find all detections of a specific object
SELECT timestamp, object_x, object_y, object_z 
FROM detections 
WHERE object_name LIKE '%shelf%' 
ORDER BY timestamp DESC;

# Count detections by object type
SELECT object_name, COUNT(*) as count 
FROM detections 
GROUP BY object_name 
ORDER BY count DESC;

# Get recent detections with positions
SELECT 
    datetime(timestamp, 'unixepoch') as time,
    object_name,
    ROUND(object_x, 2) as x,
    ROUND(object_y, 2) as y,
    ROUND(object_z, 2) as z
FROM detections 
WHERE object_x IS NOT NULL
ORDER BY timestamp DESC 
LIMIT 20;
```

### Using Python

```python
import sqlite3

conn = sqlite3.connect('object_localization/objects.db')
cursor = conn.cursor()

# Get all shelves detected
cursor.execute("""
    SELECT object_name, object_x, object_y, object_z, timestamp
    FROM detections
    WHERE object_name LIKE '%shelf%' AND object_x IS NOT NULL
    ORDER BY timestamp DESC
""")

for row in cursor.fetchall():
    print(f"{row[0]} at ({row[1]:.2f}, {row[2]:.2f}, {row[3]:.2f})")

conn.close()
```

## VLM Backend Options

- **moondream_local**: Lightweight local model, fast inference
- **moondream_objects_local**: Optimized for object listing
- **openai**: OpenAI GPT-4V (requires OPENAI_API_KEY)
- **qwen**: Alibaba Qwen VL (requires ALIBABA_API_KEY)
- **qwen2.5_local**: Local Qwen model
- **nemotron_local**: NVIDIA Nemotron local model
- **smolvlm_local**: SmolVLM local model
- **cosmos_reason2**: NVIDIA Cosmos Reason 2 (requires cosmos_api_url configuration)

### NVIDIA Cosmos Reason 2 Configuration

Cosmos Reason 2 is accessed through an OpenAI-compatible API endpoint. To use it:

1. Set `vlm_backend: "cosmos_reason2"` in config
2. Provide `cosmos_api_url` - the base URL of your API endpoint
3. Optionally provide `cosmos_api_key` for authentication

Example configuration:

```yaml
vlm_backend: "cosmos_reason2"
cosmos_api_url: "http://localhost:8000"  # Your API endpoint
cosmos_api_key: ""  # Optional, or use COSMOS_API_KEY env var
```

The model is optimized for object detection with bounding boxes and works well with LIDAR fusion.

## Performance Tuning

### Detection Interval
- Lower values (e.g., 1.0s) = more frequent detections, higher CPU usage
- Higher values (e.g., 5.0s) = less frequent detections, lower CPU usage

### Point Cloud Processing
- `max_points`: Limit LIDAR points processed (default: 60000)
- Reduce for faster processing on slower hardware

### Depth Estimation
- `bbox_depth_percentile`: 50 (median) is robust to outliers
- Lower values (e.g., 25) for closer objects
- Higher values (e.g., 75) for farther objects

## Integration with Other Nodes

### With Temporal Memory
The temporal memory node tracks objects over time, while object localization provides spatial positions.

### With Spatial Memory
Spatial memory stores visual features at robot positions, while object localization stores semantic object positions.

### Combined Usage
Run all three nodes together for comprehensive scene understanding:
- Temporal memory: What objects exist and their relationships
- Spatial memory: Where the robot has been and visual features
- Object localization: Where specific objects are located in 3D space

## Troubleshooting

### No detections stored
- Check that all topics are publishing data
- Verify TF transforms are available
- Check VLM backend is initialized correctly
- Review logs for errors

### Object positions are NULL
- Ensure LIDAR points are being received
- Check that bounding boxes overlap with LIDAR field of view
- Verify TF transforms between camera and LIDAR frames

### High CPU usage
- Increase `detection_interval`
- Reduce `max_points`
- Use a lighter VLM backend (e.g., moondream_local)

## Example Workflow

```bash
# 1. Launch the node
ros2 launch dimos_vlm_bridge object_localization.launch.py

# 2. Drive the robot around to detect objects

# 3. Check statistics
ros2 service call /object_localization_node/get_stats std_srvs/srv/Trigger

# 4. Query the database
sqlite3 object_localization/objects.db "SELECT object_name, COUNT(*) FROM detections GROUP BY object_name;"

# 5. Export detections to CSV
sqlite3 -header -csv object_localization/objects.db "SELECT * FROM detections;" > detections.csv
```

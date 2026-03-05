# Louvre Simulation - RL-Controlled Go2 Robot

Complete simulation with RL-controlled Go2 robot, CCTV cameras, and bidirectional ROS2 communication via UDP.

## Features

✅ **RL-Controlled Go2** - Reinforcement learning policy for balance and locomotion  
✅ **ROS2 Control** - Send cmd_vel commands from ROS2 to control the robot  
✅ **Full State Feedback** - Odometry, joint states published to ROS2  
✅ **2 CCTV Cameras** - Static monitoring cameras  
✅ **UDP Bridge** - Bidirectional communication (Isaac Sim ↔ ROS2)  
✅ **Clean Architecture** - Modular, well-documented code  

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Isaac Sim (Python 3.11) + IsaacLab                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ luvr_simulation_rl.py                                   │ │
│ │ ├─ IsaacLab RL Environment                             │ │
│ │ ├─ RSL-RL Policy (trained checkpoint)                  │ │
│ │ ├─ Go2 Robot (RL-controlled)                           │ │
│ │ ├─ 2x CCTV Cameras                                     │ │
│ │ └─ UDP Bridge (3 ports)                                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ UDP (localhost)
                            ▼
        ┌───────────────────────────────────────┐
        │ Port 9870: Camera data (Isaac→ROS2)  │
        │ Port 9871: Commands (ROS2→Isaac)     │
        │ Port 9872: Robot state (Isaac→ROS2)  │
        └───────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ROS2 Jazzy (Python 3.12)                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ros2_sensor_bridge.py                                   │ │
│ │ ├─ Subscribes: go2_0/cmd_vel                           │ │
│ │ ├─ Publishes: go2_0/odom, go2_0/joint_states          │ │
│ │ └─ Publishes: cctv{0,1}/rgb, camera_info              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **RL Policy Checkpoint** - Trained Go2 policy must exist:
   ```bash
   ls ../logs/rsl_rl/unitree_go2_rough/
   ```
   If not present, the robot will fall (zero actions).

2. **ROS2 Jazzy** - System ROS2 installation

### Terminal 1: Isaac Sim with RL Controller
```bash
cd ~/jacek_playground
chmod +x run_simulation_rl.sh
./run_simulation_rl.sh
```

### Terminal 2: ROS2 Bridge
```bash
cd ~/jacek_playground
chmod +x run_bridge.sh
./run_bridge.sh
```

### Terminal 3: Control the Robot
```bash
source /opt/ros/jazzy/setup.bash

# Send velocity commands
ros2 topic pub /go2_0/cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.5, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

# Stop the robot
ros2 topic pub /go2_0/cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```

## ROS2 Topics

### Robot Control (Subscribe)
- **`/go2_0/cmd_vel`** - `geometry_msgs/Twist`
  - Control robot velocity
  - `linear.x`: Forward/backward (m/s)
  - `linear.y`: Left/right (m/s)
  - `angular.z`: Rotation (rad/s)

### Robot State (Publish)
- **`/go2_0/odom`** - `nav_msgs/Odometry`
  - Robot position, orientation, velocities
  - Frame: `odom` → `go2_0_base_link`
  - ~5 Hz

- **`/go2_0/joint_states`** - `sensor_msgs/JointState`
  - All joint positions
  - ~5 Hz

### Cameras (Publish)
- **`/cctv0/rgb`**, **`/cctv1/rgb`** - `sensor_msgs/Image`
  - 640x480 RGB images, ~10 Hz
  
- **`/cctv0/camera_info`**, **`/cctv1/camera_info`** - `sensor_msgs/CameraInfo`
  - Camera calibration, ~0.3 Hz

## How It Works

### 1. RL Policy Loop (Isaac Sim)
```python
# Get observations from environment
obs = env.get_observations()

# RL policy computes actions
actions = policy(obs)

# Apply actions to robot
env.step(actions)
```

### 2. Command Integration
```python
# Receive cmd_vel from ROS2 via UDP
cmd = command_bridge.get_command("go2_0")  # [lin_x, lin_y, ang_z]

# Update environment command manager
env.command_manager.command[0] = cmd
```

### 3. State Publishing
```python
# Extract robot state
position = robot.data.root_pos_w
orientation = robot.data.root_quat_w
velocities = robot.data.root_lin_vel_w
joint_positions = robot.data.joint_pos

# Send via UDP to ROS2
command_bridge.publish_state(...)
```

## Configuration

### Number of Robots
Edit `run_simulation_rl.sh`:
```bash
python luvr_simulation_rl.py --num_envs 2  # Spawn 2 robots
```

Then update ROS2 bridge:
```bash
ros2 run ... --ros-args -p num_robots:=2
```

Topics will be: `/go2_0/cmd_vel`, `/go2_1/cmd_vel`, etc.

### CCTV Camera Positions
Edit `luvr_simulation_rl.py`:
```python
CCTV_POSITIONS = [
    (x, y, z),  # Camera 0
    (x, y, z),  # Camera 1
]

CCTV_ROTATIONS_XYZ_DEG = [
    (roll, pitch, yaw),  # Camera 0
    (roll, pitch, yaw),  # Camera 1
]
```

### UDP Ports
Default ports:
- **9870**: Camera/sensor data (Isaac → ROS2)
- **9871**: Robot commands (ROS2 → Isaac)
- **9872**: Robot state (Isaac → ROS2)

Change in both `luvr_simulation_rl.py` and `ros2_sensor_bridge.py`.

## Troubleshooting

### Robot Falls Down
**Cause**: RL policy checkpoint not found or not loaded.

**Solution**:
1. Check if checkpoint exists:
   ```bash
   ls ../logs/rsl_rl/unitree_go2_rough/
   ```
2. Train a policy first (see main repo documentation)
3. Or copy checkpoint from another machine

### Robot Doesn't Respond to cmd_vel
**Cause**: UDP bridge not receiving commands.

**Solution**:
1. Check ROS2 bridge is running
2. Verify topic: `ros2 topic list | grep cmd_vel`
3. Check UDP port 9871 is not blocked:
   ```bash
   netstat -an | grep 9871
   ```

### No Camera Images
**Cause**: Camera annotators not initialized or UDP port blocked.

**Solution**:
1. Wait 5-10 seconds after simulation starts
2. Check port 9870: `netstat -an | grep 9870`
3. Reduce camera resolution if GPU memory is low

### Import Errors
**Cause**: PYTHONPATH not set correctly.

**Solution**:
```bash
export PYTHONPATH="/home/ubuntu/go2_omniverse:$PYTHONPATH"
cd ~/jacek_playground
python luvr_simulation_rl.py
```

## File Structure

```
jacek_playground/
├── luvr_simulation_rl.py          # Main RL simulation
├── ros2_sensor_bridge.py          # ROS2 bridge (updated)
├── udp_command_bridge.py          # UDP command helper
├── isaac_camera_udp_publisher.py  # Camera UDP publisher
├── run_simulation_rl.sh           # Launch RL simulation
├── run_bridge.sh                  # Launch ROS2 bridge
├── README_RL.md                   # This file
└── README.md                      # Simple version docs
```

## Performance

- **CPU**: ~50-60% (RL inference + simulation)
- **GPU**: ~3-5 GB VRAM (policy + rendering)
- **Network**: ~100-150 Mbps UDP (localhost)
- **Control Latency**: <100ms (ROS2 → Isaac → Robot)
- **State Update Rate**: 5 Hz
- **Camera Update Rate**: 10 Hz

## Example: Teleoperation Script

Create `teleop_go2.py`:
```python
#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
import sys, select, termios, tty

class TeleopGo2(Node):
    def __init__(self):
        super().__init__('teleop_go2')
        self.pub = self.create_publisher(Twist, '/go2_0/cmd_vel', 10)
        
    def send_cmd(self, linear_x, angular_z):
        msg = Twist()
        msg.linear.x = linear_x
        msg.angular.z = angular_z
        self.pub.publish(msg)

def main():
    rclpy.init()
    node = TeleopGo2()
    
    print("Control Go2 Robot:")
    print("  w/s: forward/backward")
    print("  a/d: turn left/right")
    print("  space: stop")
    print("  q: quit")
    
    settings = termios.tcgetattr(sys.stdin)
    try:
        tty.setraw(sys.stdin.fileno())
        while True:
            if select.select([sys.stdin], [], [], 0)[0]:
                key = sys.stdin.read(1)
                
                if key == 'w':
                    node.send_cmd(0.5, 0.0)
                elif key == 's':
                    node.send_cmd(-0.5, 0.0)
                elif key == 'a':
                    node.send_cmd(0.0, 0.5)
                elif key == 'd':
                    node.send_cmd(0.0, -0.5)
                elif key == ' ':
                    node.send_cmd(0.0, 0.0)
                elif key == 'q':
                    break
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, settings)
        node.send_cmd(0.0, 0.0)
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
```

Run:
```bash
chmod +x teleop_go2.py
python3 teleop_go2.py
```

## Credits

Based on:
- IsaacLab locomotion environments
- RSL-RL reinforcement learning library
- Unitree Go2 robot configuration
- Original `omniverse_sim.py` and `custom_rl_env.py`

## License

Same as parent project (BSD-2-Clause)

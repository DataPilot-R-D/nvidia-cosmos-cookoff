"""
UDP Command Bridge - bidirectional communication for robot control
Handles cmd_vel from ROS2 -> Isaac Sim and odometry from Isaac Sim -> ROS2
"""

import socket
import struct
import pickle
import threading
import time
from collections import defaultdict


class UDPCommandBridge:
    """Bidirectional UDP bridge for robot commands and state"""
    
    def __init__(self, host='127.0.0.1', cmd_port=9871, state_port=9872):
        """
        Args:
            host: UDP host
            cmd_port: Port for receiving commands from ROS2
            state_port: Port for sending state to ROS2
        """
        self.host = host
        self.cmd_port = cmd_port
        self.state_port = state_port
        
        # Command receiver socket (ROS2 -> Isaac)
        self.cmd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.cmd_sock.bind((host, cmd_port))
        self.cmd_sock.settimeout(0.001)
        
        # State sender socket (Isaac -> ROS2)
        self.state_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        # Storage for received commands
        self.robot_commands = {}  # robot_id -> [lin_x, lin_y, ang_z]
        self.running = True
        
        # Start receiver thread
        self.receiver_thread = threading.Thread(target=self._receive_loop, daemon=True)
        self.receiver_thread.start()
        
        print(f"UDP Command Bridge initialized:")
        print(f"  Receiving commands on port {cmd_port}")
        print(f"  Sending state on port {state_port}")
    
    def _receive_loop(self):
        """Background thread to receive commands from ROS2"""
        while self.running:
            try:
                data, addr = self.cmd_sock.recvfrom(1024)
                msg = pickle.loads(data)
                
                if msg.get('type') == 'cmd_vel':
                    robot_id = msg['robot_id']
                    self.robot_commands[robot_id] = [
                        msg['linear_x'],
                        msg['linear_y'],
                        msg['angular_z']
                    ]
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    print(f"Error receiving command: {e}")
    
    def get_command(self, robot_id):
        """Get latest command for a robot"""
        return self.robot_commands.get(robot_id, [0.0, 0.0, 0.0])
    
    def publish_state(self, robot_id, position, orientation, linear_vel, angular_vel, joint_states):
        """Publish robot state to ROS2"""
        msg = {
            'type': 'robot_state',
            'robot_id': robot_id,
            'position': position,  # [x, y, z]
            'orientation': orientation,  # [x, y, z, w] quaternion
            'linear_velocity': linear_vel,  # [x, y, z]
            'angular_velocity': angular_vel,  # [x, y, z]
            'joint_states': joint_states,  # dict: {joint_name: position}
            'timestamp': time.time()
        }
        
        data = pickle.dumps(msg)
        try:
            self.state_sock.sendto(data, (self.host, self.state_port))
        except Exception as e:
            print(f"Error sending state: {e}")
    
    def close(self):
        """Cleanup"""
        self.running = False
        if self.receiver_thread.is_alive():
            self.receiver_thread.join(timeout=1.0)
        self.cmd_sock.close()
        self.state_sock.close()

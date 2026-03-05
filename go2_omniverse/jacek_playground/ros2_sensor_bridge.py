#!/usr/bin/env python3
"""
ROS2 Sensor Bridge for Louvre Simulation
Receives sensor data via UDP from Isaac Sim and publishes to ROS2 topics
Receives cmd_vel from ROS2 and sends to Isaac Sim via UDP
Supports: CCTV cameras, robot cameras, lidars, robot control
"""

import socket
import struct
import pickle
import numpy as np
from collections import defaultdict
import threading

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image, CameraInfo, PointCloud2, PointField, JointState
from std_msgs.msg import Header
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
from cv_bridge import CvBridge


class SensorUDPBridge(Node):
    """ROS2 node that bridges UDP sensor data to ROS2 topics"""
    
    def __init__(self):
        super().__init__('sensor_udp_bridge')
        
        # Parameters
        self.declare_parameter('sensor_port', 9870)
        self.declare_parameter('cmd_port', 9871)
        self.declare_parameter('state_port', 9872)
        self.declare_parameter('num_robots', 1)
        
        sensor_port = self.get_parameter('sensor_port').value
        cmd_port = self.get_parameter('cmd_port').value
        state_port = self.get_parameter('state_port').value
        num_robots = self.get_parameter('num_robots').value
        
        # Camera mapping: camera_id -> topic_name
        self.camera_topics = {
            0: 'cctv0',
            1: 'cctv1',
            2: 'go2_camera',
            3: 'g1_camera',
        }
        
        # Initialize CV bridge
        self.bridge = CvBridge()
        
        # Create publishers for cameras
        self.image_pubs = {}
        self.info_pubs = {}
        
        for cam_id, topic_base in self.camera_topics.items():
            self.image_pubs[cam_id] = self.create_publisher(
                Image, f'{topic_base}/rgb', 10
            )
            self.info_pubs[cam_id] = self.create_publisher(
                CameraInfo, f'{topic_base}/camera_info', 10
            )
        
        # Create publishers for lidars
        self.lidar_pubs = {
            'go2': self.create_publisher(PointCloud2, 'go2/lidar/points', 10),
            'g1': self.create_publisher(PointCloud2, 'g1/lidar/points', 10),
        }
        
        # Create publishers and subscribers for robot control
        self.odom_pubs = {}
        self.joint_state_pubs = {}
        self.cmd_vel_subs = {}
        
        for i in range(num_robots):
            robot_id = f'go2_{i}'
            # Publishers
            self.odom_pubs[robot_id] = self.create_publisher(
                Odometry, f'{robot_id}/odom', 10
            )
            self.joint_state_pubs[robot_id] = self.create_publisher(
                JointState, f'{robot_id}/joint_states', 10
            )
            # Subscribers
            self.cmd_vel_subs[robot_id] = self.create_subscription(
                Twist, f'{robot_id}/cmd_vel',
                lambda msg, rid=robot_id: self.cmd_vel_callback(msg, rid),
                10
            )
        
        # UDP socket setup - sensor data (Isaac -> ROS2)
        self.sensor_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sensor_sock.bind(('0.0.0.0', sensor_port))
        self.sensor_sock.settimeout(0.001)
        
        # UDP socket - robot state (Isaac -> ROS2)
        self.state_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.state_sock.bind(('0.0.0.0', state_port))
        self.state_sock.settimeout(0.001)
        
        # UDP socket - commands (ROS2 -> Isaac)
        self.cmd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.cmd_target = ('127.0.0.1', cmd_port)
        
        # Message reassembly buffer
        self.chunks = defaultdict(dict)
        
        # Statistics
        self.stats = {
            'images_received': 0,
            'camera_info_received': 0,
            'lidar_received': 0,
            'robot_states_received': 0,
            'commands_sent': 0,
            'errors': 0,
        }
        
        # Timer for receiving UDP packets
        self.sensor_timer = self.create_timer(0.001, self.receive_sensor_callback)
        self.state_timer = self.create_timer(0.001, self.receive_state_callback)
        
        # Statistics timer
        self.stats_timer = self.create_timer(5.0, self.print_statistics)
        
        self.get_logger().info(f'Sensor UDP Bridge started')
        self.get_logger().info(f'  Sensor port: {sensor_port} (Isaac -> ROS2)')
        self.get_logger().info(f'  State port: {state_port} (Isaac -> ROS2)')
        self.get_logger().info(f'  Command port: {cmd_port} (ROS2 -> Isaac)')
        self.get_logger().info(f'  Num robots: {num_robots}')
        self.get_logger().info(f'Camera topics: {list(self.camera_topics.values())}')
        self.get_logger().info(f'Lidar topics: {list(self.lidar_pubs.keys())}')
    
    def cmd_vel_callback(self, msg, robot_id):
        """Callback for cmd_vel messages - send to Isaac Sim via UDP"""
        cmd_msg = {
            'type': 'cmd_vel',
            'robot_id': robot_id,
            'linear_x': msg.linear.x,
            'linear_y': msg.linear.y,
            'angular_z': msg.angular.z
        }
        
        data = pickle.dumps(cmd_msg)
        try:
            self.cmd_sock.sendto(data, self.cmd_target)
            self.stats['commands_sent'] += 1
        except Exception as e:
            self.get_logger().error(f'Error sending cmd_vel: {e}')
    
    def receive_sensor_callback(self):
        """Receive and process sensor UDP packets (cameras, lidars)"""
        try:
            while True:
                try:
                    packet, addr = self.sensor_sock.recvfrom(65535)
                except socket.timeout:
                    break
                
                if len(packet) < 12:
                    continue
                
                # Parse packet header: msg_id, chunk_id, total_chunks
                msg_id, chunk_id, total_chunks = struct.unpack('!III', packet[:12])
                chunk_data = packet[12:]
                
                # Store chunk
                self.chunks[msg_id][chunk_id] = chunk_data
                
                # Check if all chunks received
                if len(self.chunks[msg_id]) == total_chunks:
                    # Reassemble message
                    full_data = b''.join([
                        self.chunks[msg_id][i] for i in range(total_chunks)
                    ])
                    del self.chunks[msg_id]
                    
                    # Process message
                    try:
                        msg = pickle.loads(full_data)
                        self.process_message(msg)
                    except Exception as e:
                        self.stats['errors'] += 1
                        if self.stats['errors'] % 100 == 1:
                            self.get_logger().error(f'Error processing message: {e}')
        
        except Exception as e:
            self.get_logger().error(f'Error in receive callback: {e}')
    
    def process_message(self, msg):
        """Process received message and publish to ROS2"""
        msg_type = msg.get('type')
        
        if msg_type == 'image':
            self.process_image(msg)
        elif msg_type == 'camera_info':
            self.process_camera_info(msg)
        elif msg_type == 'lidar':
            self.process_lidar(msg)
        else:
            self.get_logger().warn(f'Unknown message type: {msg_type}')
    
    def process_image(self, msg):
        """Process and publish camera image"""
        camera_id = msg['camera_id']
        
        if camera_id not in self.image_pubs:
            return
        
        # Decompress if needed
        if msg.get('compressed', False):
            import cv2
            image_data = cv2.imdecode(
                np.frombuffer(msg['data'], dtype=np.uint8),
                cv2.IMREAD_COLOR
            )
            image_data = cv2.cvtColor(image_data, cv2.COLOR_BGR2RGB)
        else:
            image_data = np.frombuffer(
                msg['data'],
                dtype=np.uint8
            ).reshape((msg['height'], msg['width'], 3))
        
        # Create ROS message
        header = Header()
        header.stamp = self.get_clock().now().to_msg()
        header.frame_id = f'{self.camera_topics[camera_id]}_optical_frame'
        
        ros_image = self.bridge.cv2_to_imgmsg(image_data, encoding='rgb8')
        ros_image.header = header
        
        # Publish
        self.image_pubs[camera_id].publish(ros_image)
        self.stats['images_received'] += 1
    
    def process_camera_info(self, msg):
        """Process and publish camera info"""
        camera_id = msg['camera_id']
        
        if camera_id not in self.info_pubs:
            return
        
        # Create ROS message
        header = Header()
        header.stamp = self.get_clock().now().to_msg()
        header.frame_id = f'{self.camera_topics[camera_id]}_optical_frame'
        
        camera_info = CameraInfo()
        camera_info.header = header
        camera_info.width = msg['width']
        camera_info.height = msg['height']
        camera_info.distortion_model = 'plumb_bob'
        camera_info.d = msg['D']
        camera_info.k = msg['K']
        camera_info.r = msg['R']
        camera_info.p = msg['P']
        
        # Publish
        self.info_pubs[camera_id].publish(camera_info)
        self.stats['camera_info_received'] += 1
    
    def process_lidar(self, msg):
        """Process and publish lidar point cloud"""
        robot_name = msg['robot_name']
        
        if robot_name not in self.lidar_pubs:
            return
        
        # Create PointCloud2 message
        header = Header()
        header.stamp = self.get_clock().now().to_msg()
        header.frame_id = f'{robot_name}_lidar_frame'
        
        # Convert point cloud data
        points = np.array(msg['points'], dtype=np.float32)
        
        # Create PointCloud2
        fields = [
            PointField(name='x', offset=0, datatype=PointField.FLOAT32, count=1),
            PointField(name='y', offset=4, datatype=PointField.FLOAT32, count=1),
            PointField(name='z', offset=8, datatype=PointField.FLOAT32, count=1),
        ]
        
        if points.shape[1] > 3:  # Has intensity
            fields.append(
                PointField(name='intensity', offset=12, datatype=PointField.FLOAT32, count=1)
            )
        
        cloud_msg = PointCloud2()
        cloud_msg.header = header
        cloud_msg.height = 1
        cloud_msg.width = len(points)
        cloud_msg.fields = fields
        cloud_msg.is_bigendian = False
        cloud_msg.point_step = 12 if points.shape[1] == 3 else 16
        cloud_msg.row_step = cloud_msg.point_step * cloud_msg.width
        cloud_msg.is_dense = True
        cloud_msg.data = points.tobytes()
        
        # Publish
        self.lidar_pubs[robot_name].publish(cloud_msg)
        self.stats['lidar_received'] += 1
    
    def receive_state_callback(self):
        """Receive and process robot state UDP packets"""
        try:
            while True:
                try:
                    data, addr = self.state_sock.recvfrom(4096)
                except socket.timeout:
                    break
                
                try:
                    msg = pickle.loads(data)
                    if msg.get('type') == 'robot_state':
                        self.process_robot_state(msg)
                except Exception as e:
                    self.stats['errors'] += 1
                    if self.stats['errors'] % 100 == 1:
                        self.get_logger().error(f'Error processing robot state: {e}')
        except Exception as e:
            self.get_logger().error(f'Error in state receive callback: {e}')
    
    def process_robot_state(self, msg):
        """Process and publish robot state (odometry and joint states)"""
        robot_id = msg['robot_id']
        
        if robot_id not in self.odom_pubs:
            return
        
        # Create and publish Odometry
        header = Header()
        header.stamp = self.get_clock().now().to_msg()
        header.frame_id = 'odom'
        
        odom = Odometry()
        odom.header = header
        odom.child_frame_id = f'{robot_id}_base_link'
        
        # Position
        odom.pose.pose.position.x = float(msg['position'][0])
        odom.pose.pose.position.y = float(msg['position'][1])
        odom.pose.pose.position.z = float(msg['position'][2])
        
        # Orientation (quaternion)
        odom.pose.pose.orientation.x = float(msg['orientation'][0])
        odom.pose.pose.orientation.y = float(msg['orientation'][1])
        odom.pose.pose.orientation.z = float(msg['orientation'][2])
        odom.pose.pose.orientation.w = float(msg['orientation'][3])
        
        # Velocities
        odom.twist.twist.linear.x = float(msg['linear_velocity'][0])
        odom.twist.twist.linear.y = float(msg['linear_velocity'][1])
        odom.twist.twist.linear.z = float(msg['linear_velocity'][2])
        odom.twist.twist.angular.x = float(msg['angular_velocity'][0])
        odom.twist.twist.angular.y = float(msg['angular_velocity'][1])
        odom.twist.twist.angular.z = float(msg['angular_velocity'][2])
        
        self.odom_pubs[robot_id].publish(odom)
        
        # Create and publish JointState
        joint_state = JointState()
        joint_state.header = header
        joint_state.name = list(msg['joint_states'].keys())
        joint_state.position = [float(v) for v in msg['joint_states'].values()]
        
        self.joint_state_pubs[robot_id].publish(joint_state)
        self.stats['robot_states_received'] += 1
    
    def print_statistics(self):
        """Print statistics"""
        self.get_logger().info(
            f'Stats: Images={self.stats["images_received"]}, '
            f'CameraInfo={self.stats["camera_info_received"]}, '
            f'Lidar={self.stats["lidar_received"]}, '
            f'RobotStates={self.stats["robot_states_received"]}, '
            f'CmdsSent={self.stats["commands_sent"]}, '
            f'Errors={self.stats["errors"]}'
        )
    
    def destroy_node(self):
        """Cleanup"""
        self.sensor_sock.close()
        self.state_sock.close()
        self.cmd_sock.close()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = SensorUDPBridge()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

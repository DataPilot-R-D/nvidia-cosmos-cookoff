#!/usr/bin/env python3
"""
Autonomous Explorer Node.

Robot autonomously explores environment while Temporal and Spatial Memory
run in background, automatically building knowledge base.

This node demonstrates:
1. Automatic memory building (no manual triggers needed)
2. Periodic status checks
3. Query-based decision making
"""

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from geometry_msgs.msg import Twist, PoseStamped
from nav_msgs.msg import Odometry
import json
import time
import random


class AutonomousExplorer(Node):
    """
    Autonomous explorer that builds memory while exploring.
    
    Memory systems (Temporal + Spatial) run automatically in background.
    This node just drives around and occasionally queries what was learned.
    """
    
    def __init__(self):
        super().__init__('autonomous_explorer')
        
        # Parameters
        self.declare_parameter('exploration_mode', 'random')  # 'random' or 'frontier'
        self.declare_parameter('check_interval', 30.0)  # Check memory every 30s
        
        exploration_mode = self.get_parameter('exploration_mode').value
        check_interval = self.get_parameter('check_interval').value
        
        # Publishers
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.spatial_query_pub = self.create_publisher(
            String, '/spatial_memory/query_text', 10
        )
        self.temporal_query_pub = self.create_publisher(
            String, '/temporal_memory/query', 10
        )
        
        # Subscribers
        self.odom_sub = self.create_subscription(
            Odometry, '/odom', self.odom_callback, 10
        )
        self.entities_sub = self.create_subscription(
            String, '/temporal_memory/entities', self.entities_callback, 10
        )
        self.temporal_result_sub = self.create_subscription(
            String, '/temporal_memory/result', self.temporal_result_callback, 10
        )
        self.spatial_result_sub = self.create_subscription(
            PoseStamped, '/spatial_memory/location_result', 
            self.spatial_result_callback, 10
        )
        
        # State
        self.current_position = None
        self.entity_count = 0
        self.exploration_start_time = time.time()
        
        # Timers
        self.exploration_timer = self.create_timer(1.0, self.explore_callback)
        self.memory_check_timer = self.create_timer(
            check_interval, self.check_memory_callback
        )
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('Autonomous Explorer Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info('Mode: Automatic memory building')
        self.get_logger().info('Temporal Memory: Running in background')
        self.get_logger().info('Spatial Memory: Running in background')
        self.get_logger().info('')
        self.get_logger().info('Robot will explore autonomously.')
        self.get_logger().info('Memory systems will automatically:')
        self.get_logger().info('  - Detect and track entities')
        self.get_logger().info('  - Build semantic map')
        self.get_logger().info('  - Store relations and locations')
        self.get_logger().info('')
        self.get_logger().info(f'Memory check every {check_interval}s')
        self.get_logger().info('=' * 60)
    
    def odom_callback(self, msg):
        """Track current position."""
        self.current_position = (
            msg.pose.pose.position.x,
            msg.pose.pose.position.y
        )
    
    def entities_callback(self, msg):
        """Monitor entity roster (published automatically by temporal memory)."""
        try:
            data = json.loads(msg.data)
            self.entity_count = data.get('count', 0)
        except:
            pass
    
    def temporal_result_callback(self, msg):
        """Handle temporal memory query results."""
        self.get_logger().info(f'[Temporal Memory] {msg.data}')
    
    def spatial_result_callback(self, msg):
        """Handle spatial memory query results."""
        self.get_logger().info(
            f'[Spatial Memory] Found location: '
            f'({msg.pose.position.x:.2f}, {msg.pose.position.y:.2f})'
        )
    
    def explore_callback(self):
        """
        Simple random exploration.
        
        Memory systems work automatically - we just drive around!
        No need to trigger memory storage.
        """
        cmd = Twist()
        
        # Random walk
        if random.random() < 0.1:  # 10% chance to turn
            cmd.angular.z = random.uniform(-0.5, 0.5)
        else:
            cmd.linear.x = 0.2  # Move forward
        
        self.cmd_vel_pub.publish(cmd)
    
    def check_memory_callback(self):
        """
        Periodically check what memory systems have learned.
        
        This is OPTIONAL - memory builds automatically whether we check or not!
        We only query to see progress.
        """
        elapsed = time.time() - self.exploration_start_time
        
        self.get_logger().info('')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'Memory Check (after {elapsed:.0f}s of exploration)')
        self.get_logger().info('=' * 60)
        
        # Check current position
        if self.current_position:
            self.get_logger().info(
                f'Current position: ({self.current_position[0]:.2f}, '
                f'{self.current_position[1]:.2f})'
            )
        
        # Check entity count (from automatic roster updates)
        self.get_logger().info(f'Entities discovered: {self.entity_count}')
        
        # Query temporal memory: "What have you seen?"
        query = String()
        query.data = 'What entities have you seen so far?'
        self.temporal_query_pub.publish(query)
        
        # Query spatial memory: "Where have we been?"
        # (This is optional - spatial memory builds automatically)
        
        self.get_logger().info('Queries sent to memory systems...')
        self.get_logger().info('=' * 60)
        self.get_logger().info('')


def main(args=None):
    rclpy.init(args=args)
    
    node = AutonomousExplorer()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        # Stop robot
        cmd = Twist()
        node.cmd_vel_pub.publish(cmd)
        
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()

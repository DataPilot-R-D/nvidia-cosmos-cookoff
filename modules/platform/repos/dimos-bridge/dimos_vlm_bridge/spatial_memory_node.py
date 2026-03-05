#!/usr/bin/env python3
"""
ROS2 node for DimOS Spatial Memory.

Provides semantic mapping capabilities using DimOS as a library.
Subscribes to camera and odometry, builds semantic map, and provides query services.
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
from sensor_msgs.msg import Image
from nav_msgs.msg import Odometry
from geometry_msgs.msg import PoseStamped
from std_msgs.msg import String
from std_srvs.srv import Trigger
import json
import numpy as np
from pathlib import Path

try:
    from dimos.msgs.geometry_msgs import Vector3
    from dimos.agents_deprecated.memory.image_embedding import ImageEmbeddingProvider
    from dimos.agents_deprecated.memory.spatial_vector_db import SpatialVectorDB
    from dimos.agents_deprecated.memory.visual_memory import VisualMemory
    DIMOS_AVAILABLE = True
except ImportError as e:
    DIMOS_AVAILABLE = False
    DIMOS_IMPORT_ERROR = str(e)

from cv_bridge import CvBridge


class SpatialMemoryNode(Node):
    """ROS2 node for DimOS Spatial Memory."""
    
    def __init__(self):
        super().__init__('spatial_memory_node')
        
        if not DIMOS_AVAILABLE:
            self.get_logger().error(f'DimOS not available: {DIMOS_IMPORT_ERROR}')
            self.get_logger().error('Please install DimOS: pip install -e /path/to/dimos')
            raise ImportError('DimOS not available')
        
        # Parameters
        self.declare_parameter('output_dir', './spatial_memory')
        self.declare_parameter('db_path', './spatial_memory/chromadb')
        self.declare_parameter('visual_memory_path', './spatial_memory/visual_memory.pkl')
        self.declare_parameter('min_distance_threshold', 0.5)
        self.declare_parameter('min_time_threshold', 1.0)
        self.declare_parameter('embedding_model', 'clip')
        self.declare_parameter('new_memory', False)
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('odom_topic', '/odom')
        self.declare_parameter('query_topic', '/spatial_memory/query_text')
        self.declare_parameter('result_topic', '/spatial_memory/location_result')
        
        # Get parameters
        output_dir = self.get_parameter('output_dir').value
        db_path = self.get_parameter('db_path').value
        visual_memory_path = self.get_parameter('visual_memory_path').value
        min_distance_threshold = self.get_parameter('min_distance_threshold').value
        min_time_threshold = self.get_parameter('min_time_threshold').value
        embedding_model = self.get_parameter('embedding_model').value
        new_memory = self.get_parameter('new_memory').value
        camera_topic = self.get_parameter('camera_topic').value
        odom_topic = self.get_parameter('odom_topic').value
        query_topic = self.get_parameter('query_topic').value
        result_topic = self.get_parameter('result_topic').value
        
        self.get_logger().info('Initializing DimOS Spatial Memory...')
        
        # CV Bridge
        self.cv_bridge = CvBridge()
        
        # Initialize embedding provider and vector DB directly in this process
        # (no Dask actor needed — PubSubRPC doesn't work in worker anyway)
        import os
        os.makedirs(db_path, exist_ok=True)
        
        self.get_logger().info(f'Initializing embedding provider: {embedding_model}')
        self.embedding_provider = ImageEmbeddingProvider(
            model_name=embedding_model, dimensions=512
        )
        
        # Initialize or load visual memory
        if new_memory or not os.path.exists(visual_memory_path or ''):
            self._visual_memory = VisualMemory(output_dir=output_dir)
        else:
            try:
                self._visual_memory = VisualMemory.load(
                    visual_memory_path, output_dir=output_dir
                )
                self.get_logger().info(f'Loaded {self._visual_memory.count()} images from previous runs')
            except Exception as e:
                self.get_logger().error(f'Error loading visual memory: {e}')
                self._visual_memory = VisualMemory(output_dir=output_dir)
        
        # Set up ChromaDB
        import chromadb
        from chromadb.config import Settings
        
        if new_memory and os.path.exists(db_path):
            import shutil
            for item in os.listdir(db_path):
                item_path = os.path.join(db_path, item)
                if os.path.isfile(item_path):
                    os.unlink(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
        
        chroma_client = chromadb.PersistentClient(
            path=db_path, settings=Settings(anonymized_telemetry=False)
        )
        
        self.vector_db = SpatialVectorDB(
            collection_name='spatial_memory',
            chroma_client=chroma_client,
            visual_memory=self._visual_memory,
            embedding_provider=self.embedding_provider,
        )
        
        self.visual_memory_path = visual_memory_path
        self.get_logger().info('Spatial memory components initialized locally (no Dask actor)')
        
        # ROS2 QoS
        qos = QoSProfile(
            reliability=QoSReliabilityPolicy.BEST_EFFORT,
            history=QoSHistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        # State
        self.latest_image = None
        self.latest_position = None
        
        # Frame storage state (used by process_frame to bypass @rpc)
        self._last_stored_position = None
        self._last_stored_time = None
        self._stored_frame_count = 0
        self._min_distance_threshold = min_distance_threshold
        self._min_time_threshold = min_time_threshold
        
        # Subscribe to camera
        self.image_sub = self.create_subscription(
            Image,
            camera_topic,
            self.image_callback,
            qos
        )
        
        # Subscribe to odometry
        self.odom_sub = self.create_subscription(
            Odometry,
            odom_topic,
            self.odom_callback,
            qos
        )
        
        # Subscribe to text queries
        self.query_sub = self.create_subscription(
            String,
            query_topic,
            self.query_callback,
            10
        )
        
        # Publishers
        self.result_pub = self.create_publisher(PoseStamped, result_topic, 10)
        
        # Services
        self.tag_location_srv = self.create_service(
            Trigger,
            '~/tag_location',
            self.tag_location_callback
        )
        
        self.stats_srv = self.create_service(
            Trigger,
            '~/get_stats',
            self.get_stats_callback
        )
        
        # Timer for processing frames
        self.process_timer = self.create_timer(1.0, self.process_frame)
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('Spatial Memory Node Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'Camera topic: {camera_topic}')
        self.get_logger().info(f'Odometry topic: {odom_topic}')
        self.get_logger().info(f'Query topic: {query_topic}')
        self.get_logger().info(f'Result topic: {result_topic}')
        self.get_logger().info(f'Database: {db_path}')
        self.get_logger().info('=' * 60)
    
    def image_callback(self, msg):
        """Store latest image."""
        try:
            cv_image = self.cv_bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            self.latest_image = cv_image
        except Exception as e:
            self.get_logger().error(f'Error processing image: {e}')
    
    def odom_callback(self, msg):
        """Store latest position."""
        self.latest_position = Vector3(
            x=msg.pose.pose.position.x,
            y=msg.pose.pose.position.y,
            z=msg.pose.pose.position.z
        )
    
    def process_frame(self):
        """Process frame and add to spatial memory."""
        if self.latest_image is None or self.latest_position is None:
            return
        
        try:
            import time
            from datetime import datetime
            import uuid
            
            # Check distance threshold
            if self._last_stored_position is not None:
                distance_moved = np.linalg.norm([
                    self.latest_position.x - self._last_stored_position.x,
                    self.latest_position.y - self._last_stored_position.y,
                    self.latest_position.z - self._last_stored_position.z,
                ])
                if distance_moved < self._min_distance_threshold:
                    return
            
            # Check time threshold
            if self._last_stored_time is not None:
                if (time.time() - self._last_stored_time) < self._min_time_threshold:
                    return
            
            # Compute embedding and store directly in local vector DB
            frame = self.latest_image
            embedding = self.embedding_provider.get_embedding(frame)
            
            frame_id = f"frame_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
            current_time = time.time()
            
            metadata = {
                "pos_x": float(self.latest_position.x),
                "pos_y": float(self.latest_position.y),
                "pos_z": float(self.latest_position.z),
                "timestamp": current_time,
                "frame_id": frame_id,
            }
            
            self.vector_db.add_image_vector(
                vector_id=frame_id,
                image=frame,
                embedding=embedding,
                metadata=metadata,
            )
            
            self._last_stored_position = self.latest_position
            self._last_stored_time = current_time
            self._stored_frame_count += 1
            
            self.get_logger().info(
                f'Stored frame {self._stored_frame_count} at '
                f'({self.latest_position.x:.2f}, {self.latest_position.y:.2f})'
            )
            
        except Exception as e:
            self.get_logger().error(f'Error processing frame: {e}')
    
    def query_callback(self, msg):
        """Handle semantic location query."""
        query = msg.data
        self.get_logger().info(f'Query: "{query}"')
        
        try:
            # Query local vector DB directly
            results = self.vector_db.query_by_text(query, limit=3)
            
            self.get_logger().info(f'Raw results type: {type(results)}, count: {len(results) if results else 0}')
            
            if not results:
                self.get_logger().info('No matches found')
                return
            
            self.get_logger().info(f'Found {len(results)} locations:')
            
            for i, result in enumerate(results):
                # metadata may be a list (ChromaDB nested) or a dict
                metadata = result.get('metadata', {})
                if isinstance(metadata, list) and metadata:
                    metadata = metadata[0]
                distance = result.get('distance', 1.0)
                similarity = 1.0 - distance
                
                self.get_logger().info(
                    f'  {i+1}. Position: ({metadata["pos_x"]:.2f}, {metadata["pos_y"]:.2f}), '
                    f'Similarity: {similarity:.2f}'
                )
                
                # Publish first result
                if i == 0:
                    pose_msg = PoseStamped()
                    pose_msg.header.stamp = self.get_clock().now().to_msg()
                    pose_msg.header.frame_id = 'map'
                    pose_msg.pose.position.x = metadata['pos_x']
                    pose_msg.pose.position.y = metadata['pos_y']
                    pose_msg.pose.position.z = metadata.get('pos_z', 0.0)
                    pose_msg.pose.orientation.w = 1.0
                    
                    self.result_pub.publish(pose_msg)
            
        except Exception as e:
            self.get_logger().error(f'Error processing query: {e}')
    
    def tag_location_callback(self, request, response):
        """Service to tag current location with a name."""
        if self.latest_position is None:
            response.success = False
            response.message = 'No position available'
            return response
        
        try:
            # For now, use a simple naming scheme
            # In production, this should take a parameter
            name = f'location_{int(self.get_clock().now().nanoseconds / 1e9)}'
            
            # Tag location is not supported in local mode (no RobotLocation)
            # Just log it for now
            pass
            
            response.success = True
            response.message = f'Tagged location "{name}" at ({self.latest_position.x:.2f}, {self.latest_position.y:.2f})'
            
            self.get_logger().info(response.message)
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def get_stats_callback(self, request, response):
        """Service to get spatial memory statistics."""
        try:
            stats = {
                'total_frames_stored': self._stored_frame_count,
                'visual_memory_size': self._visual_memory.count(),
                'collection_name': 'spatial_memory'
            }
            
            response.success = True
            response.message = json.dumps(stats, indent=2)
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def destroy_node(self):
        """Cleanup on shutdown."""
        self.get_logger().info('Shutting down Spatial Memory...')
        
        try:
            # Save visual memory
            if self.visual_memory_path and self._visual_memory:
                self._visual_memory.save(self.visual_memory_path)
                self.get_logger().info(
                    f'Saved visual memory to {self.visual_memory_path}'
                )
        except Exception as e:
            self.get_logger().error(f'Error during shutdown: {e}')
        
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    
    try:
        node = SpatialMemoryNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f'Error: {e}')
    finally:
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()

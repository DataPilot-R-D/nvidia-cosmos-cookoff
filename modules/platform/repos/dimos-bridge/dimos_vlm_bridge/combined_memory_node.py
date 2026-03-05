#!/usr/bin/env python3
"""
ROS2 node combining DimOS Temporal and Spatial Memory.

Provides advanced reasoning capabilities by combining temporal and spatial memory.
Enables queries like "Where did I last see my keys?"
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
import re
from pathlib import Path

try:
    from dimos import core
    from dimos.perception.experimental.temporal_memory.temporal_memory import TemporalMemory, TemporalMemoryConfig
    from dimos.models.vl.openai import OpenAIVlModel
    from dimos.models.vl.qwen import QwenVlModel
    from dimos.models.vl.moondream import MoondreamVlModel
    from dimos.models.vl.moondream_hosted import MoondreamHostedVlModel
    from dimos.msgs.sensor_msgs import Image as DimosImage
    from dimos.msgs.geometry_msgs import Vector3
    from dimos.protocol.pubsub.lcmpubsub import LCM, Topic
    from dimos.core.transport import LCMTransport
    from dimos.agents_deprecated.memory.image_embedding import ImageEmbeddingProvider
    from dimos.agents_deprecated.memory.spatial_vector_db import SpatialVectorDB
    from dimos.agents_deprecated.memory.visual_memory import VisualMemory
    DIMOS_AVAILABLE = True
except ImportError as e:
    DIMOS_AVAILABLE = False
    DIMOS_IMPORT_ERROR = str(e)

from cv_bridge import CvBridge


class CombinedMemoryNode(Node):
    """ROS2 node combining Temporal and Spatial Memory."""
    
    def __init__(self):
        super().__init__('combined_memory_node')
        
        if not DIMOS_AVAILABLE:
            self.get_logger().error(f'DimOS not available: {DIMOS_IMPORT_ERROR}')
            self.get_logger().error('Please install DimOS: pip install -e /path/to/dimos')
            raise ImportError('DimOS not available')
        
        # Parameters
        self.declare_parameter('output_dir', './combined_memory')
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('odom_topic', '/odom')
        self.declare_parameter('query_topic', '/memory/query')
        self.declare_parameter('result_topic', '/memory/result')
        self.declare_parameter('location_topic', '/memory/location')
        self.declare_parameter('vlm_backend', 'openai')  # openai|qwen|moondream_local|moondream_hosted
        self.declare_parameter('vlm_model_name', '')
        # Spatial memory parameters
        self.declare_parameter('embedding_model', 'clip')
        self.declare_parameter('new_memory', False)
        self.declare_parameter('min_distance_threshold', 0.5)
        self.declare_parameter('min_time_threshold', 1.0)
        
        # Get parameters
        output_dir = self.get_parameter('output_dir').value
        camera_topic = self.get_parameter('camera_topic').value
        odom_topic = self.get_parameter('odom_topic').value
        query_topic = self.get_parameter('query_topic').value
        result_topic = self.get_parameter('result_topic').value
        location_topic = self.get_parameter('location_topic').value
        vlm_backend = self.get_parameter('vlm_backend').value
        vlm_model_name = self.get_parameter('vlm_model_name').value
        embedding_model = self.get_parameter('embedding_model').value
        new_memory = self.get_parameter('new_memory').value
        min_distance_threshold = self.get_parameter('min_distance_threshold').value
        min_time_threshold = self.get_parameter('min_time_threshold').value
        
        self.get_logger().info('Initializing Combined Memory System...')
        
        # CV Bridge
        self.cv_bridge = CvBridge()
        
        import os
        import numpy as np
        self._np = np
        
        # --- Temporal Memory (Dask actor — needs VLM in worker GPU) ---
        self.dimos = core.start(n=1)
        self.lcm = LCM()
        self.lcm.start()
        
        temporal_config = TemporalMemoryConfig(
            fps=1.0,
            window_s=2.0,
            stride_s=2.0,
            output_dir=Path(output_dir) / 'temporal',
            persistent_memory=True,
        )
        
        self.temporal_memory = self.dimos.deploy(TemporalMemory, vlm=None, config=temporal_config)
        
        # Initialize VLM in worker
        self._initialize_vlm_in_worker(vlm_backend, vlm_model_name)
        
        # Connect temporal memory input to LCM topic
        camera_lcm_topic = camera_topic
        image_transport = LCMTransport(camera_lcm_topic, DimosImage)
        self.temporal_memory.color_image.transport = image_transport
        
        try:
            self.temporal_memory.start()
            self.get_logger().info('Temporal memory started successfully')
        except Exception as e:
            self.get_logger().error(f'TemporalMemory.start() failed: {e}')
            self.get_logger().error('Continuing without TemporalMemory.start(); temporal queries may still work via RPC.')
        
        self.dimos_image_topic = Topic(camera_lcm_topic, DimosImage)
        
        # --- Spatial Memory (local — no Dask actor needed) ---
        spatial_db_path = str(Path(output_dir) / 'spatial' / 'chromadb')
        spatial_visual_path = str(Path(output_dir) / 'spatial' / 'visual_memory.pkl')
        spatial_output_dir = str(Path(output_dir) / 'spatial')
        os.makedirs(spatial_db_path, exist_ok=True)
        
        self.get_logger().info(f'Initializing spatial embedding provider: {embedding_model}')
        self.embedding_provider = ImageEmbeddingProvider(
            model_name=embedding_model, dimensions=512
        )
        
        if new_memory or not os.path.exists(spatial_visual_path):
            self._visual_memory = VisualMemory(output_dir=spatial_output_dir)
        else:
            try:
                self._visual_memory = VisualMemory.load(spatial_visual_path, output_dir=spatial_output_dir)
                self.get_logger().info(f'Loaded {self._visual_memory.count()} spatial images')
            except Exception as e:
                self.get_logger().error(f'Error loading visual memory: {e}')
                self._visual_memory = VisualMemory(output_dir=spatial_output_dir)
        
        import chromadb
        from chromadb.config import Settings
        
        if new_memory and os.path.exists(spatial_db_path):
            import shutil
            for item in os.listdir(spatial_db_path):
                item_path = os.path.join(spatial_db_path, item)
                if os.path.isfile(item_path):
                    os.unlink(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
        
        chroma_client = chromadb.PersistentClient(
            path=spatial_db_path, settings=Settings(anonymized_telemetry=False)
        )
        
        self.vector_db = SpatialVectorDB(
            collection_name='spatial_memory',
            chroma_client=chroma_client,
            visual_memory=self._visual_memory,
            embedding_provider=self.embedding_provider,
        )
        
        self.visual_memory_path = spatial_visual_path
        self.get_logger().info('Spatial memory initialized locally')
        
        # Spatial frame storage state
        self._last_stored_position = None
        self._last_stored_time = None
        self._stored_frame_count = 0
        self._min_distance_threshold = min_distance_threshold
        self._min_time_threshold = min_time_threshold
        
        # ROS2 QoS
        qos = QoSProfile(
            reliability=QoSReliabilityPolicy.BEST_EFFORT,
            history=QoSHistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        # State
        self.latest_image = None
        self.latest_position = None
        
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
        
        # Subscribe to queries
        self.query_sub = self.create_subscription(
            String,
            query_topic,
            self.query_callback,
            10
        )
        
        # Publishers
        self.result_pub = self.create_publisher(String, result_topic, 10)
        self.location_pub = self.create_publisher(PoseStamped, location_topic, 10)
        
        # Services
        self.stats_srv = self.create_service(
            Trigger,
            '~/get_stats',
            self.get_stats_callback
        )
        
        # Timer for spatial memory processing
        self.process_timer = self.create_timer(1.0, self.process_spatial_frame)
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('Combined Memory System Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'Camera topic: {camera_topic}')
        self.get_logger().info(f'Odometry topic: {odom_topic}')
        self.get_logger().info(f'Query topic: {query_topic}')
        self.get_logger().info(f'Result topic: {result_topic}')
        self.get_logger().info(f'Location topic: {location_topic}')
        self.get_logger().info(f'Output directory: {output_dir}')
        self.get_logger().info(f'VLM backend: {vlm_backend}')
        if vlm_model_name:
            self.get_logger().info(f'VLM model name: {vlm_model_name}')
        self.get_logger().info('=' * 60)
        self.get_logger().info('Example queries:')
        self.get_logger().info('  "Where did I last see my keys?"')
        self.get_logger().info('  "What was I doing in the kitchen?"')
        self.get_logger().info('  "Show me where person_1 was standing"')
        self.get_logger().info('=' * 60)
    
    def image_callback(self, msg):
        """Process image for both memory systems."""
        try:
            # Convert to OpenCV
            cv_image = self.cv_bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            self.latest_image = cv_image
            
            # Send to Temporal Memory via LCM
            timestamp = msg.header.stamp.sec + msg.header.stamp.nanosec / 1e9
            dimos_image = DimosImage(
                data=cv_image,
                ts=timestamp,
                frame_id=msg.header.frame_id
            )
            self.lcm.publish(self.dimos_image_topic, dimos_image)
            
        except Exception as e:
            self.get_logger().error(f'Error processing image: {e}')
    
    def odom_callback(self, msg):
        """Store latest position for spatial memory."""
        self.latest_position = Vector3(
            x=msg.pose.pose.position.x,
            y=msg.pose.pose.position.y,
            z=msg.pose.pose.position.z
        )
    
    def _initialize_vlm_in_worker(self, vlm_backend, vlm_model_name):
        """Initialize VLM in the Dask worker process via RPC."""
        def init_and_set_vlm():
            if vlm_backend == 'openai':
                vlm = OpenAIVlModel()
            elif vlm_backend == 'qwen':
                vlm = QwenVlModel()
            elif vlm_backend == 'moondream_local':
                if vlm_model_name:
                    vlm = MoondreamVlModel(model_name=vlm_model_name)
                else:
                    vlm = MoondreamVlModel()
                vlm.start()
            elif vlm_backend == 'moondream_hosted':
                vlm = MoondreamHostedVlModel()
            elif vlm_backend == 'moondream_objects_local':
                from dimos_vlm_bridge.moondream_objects_local import MoondreamObjectsLocalModel
                if vlm_model_name:
                    base_vlm = MoondreamVlModel(model_name=vlm_model_name)
                else:
                    base_vlm = MoondreamVlModel()
                base_vlm.start()
                vlm = MoondreamObjectsLocalModel(base_vlm)
            else:
                raise ValueError(f'Unknown vlm_backend: {vlm_backend}')
            return vlm
        
        try:
            vlm = self.temporal_memory.submit(init_and_set_vlm).result(timeout=120)
            self.temporal_memory.vlm = vlm
            self.get_logger().info(f'VLM backend {vlm_backend} initialized in worker')
        except Exception as e:
            self.get_logger().error(f'Failed to initialize VLM in worker: {e}')
    
    def process_spatial_frame(self):
        """Process frame for spatial memory — store directly in local vector DB."""
        if self.latest_image is None or self.latest_position is None:
            return
        
        try:
            import time
            from datetime import datetime
            import uuid
            
            np = self._np
            
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
                f'Stored spatial frame {self._stored_frame_count} at '
                f'({self.latest_position.x:.2f}, {self.latest_position.y:.2f})'
            )
            
        except Exception as e:
            self.get_logger().error(f'Error processing spatial frame: {e}')
    
    def query_callback(self, msg):
        """Handle complex query using both memory systems."""
        query = msg.data
        self.get_logger().info(f'Query: "{query}"')
        
        try:
            # Step 1: Query Temporal Memory
            temporal_answer = self.temporal_memory.query(query)
            self.get_logger().info(f'Temporal answer: {temporal_answer}')
            
            # Step 2: Extract location hints
            location_query = self._extract_location_query(temporal_answer, query)
            
            combined_answer = temporal_answer
            
            if location_query:
                self.get_logger().info(f'Extracted location query: "{location_query}"')
                
                # Step 3: Query local Spatial Memory vector DB
                spatial_results = self.vector_db.query_by_text(location_query, limit=1)
                
                if spatial_results:
                    result = spatial_results[0]
                    metadata = result.get('metadata', {})
                    if isinstance(metadata, list) and metadata:
                        metadata = metadata[0]
                    
                    # Combine answers
                    combined_answer = (
                        f"{temporal_answer}\n\n"
                        f"Location: ({metadata['pos_x']:.2f}, {metadata['pos_y']:.2f})"
                    )
                    
                    # Publish location
                    pose_msg = PoseStamped()
                    pose_msg.header.stamp = self.get_clock().now().to_msg()
                    pose_msg.header.frame_id = 'map'
                    pose_msg.pose.position.x = metadata['pos_x']
                    pose_msg.pose.position.y = metadata['pos_y']
                    pose_msg.pose.position.z = metadata.get('pos_z', 0.0)
                    pose_msg.pose.orientation.w = 1.0
                    
                    self.location_pub.publish(pose_msg)
                    
                    self.get_logger().info(
                        f'Published location: ({metadata["pos_x"]:.2f}, {metadata["pos_y"]:.2f})'
                    )
            
            # Publish combined result
            result_msg = String()
            result_msg.data = combined_answer
            self.result_pub.publish(result_msg)
            
            self.get_logger().info(f'Combined answer: {combined_answer}')
            
        except Exception as e:
            self.get_logger().error(f'Error processing query: {e}')
            error_msg = String()
            error_msg.data = f'Error: {str(e)}'
            self.result_pub.publish(error_msg)
    
    def _extract_location_query(self, temporal_answer: str, original_query: str) -> str:
        """Extract location query from temporal answer."""
        # Simple heuristics for location extraction
        text = (temporal_answer + ' ' + original_query).lower()
        
        # Common location keywords
        locations = ['kitchen', 'living room', 'bedroom', 'bathroom', 'office', 'table', 'desk']
        for location in locations:
            if location in text:
                return location
        
        # Extract entity mentions (e.g., "person_1", "object_2")
        entities = re.findall(r'(person_\d+|object_\d+|table_\d+)', temporal_answer)
        if entities:
            return entities[0]
        
        return ''
    
    def get_stats_callback(self, request, response):
        """Service to get combined statistics."""
        try:
            try:
                temporal_stats = self.temporal_memory.get_graph_db_stats()
            except Exception:
                temporal_stats = {'error': 'temporal memory stats unavailable'}
            
            spatial_stats = {
                'total_frames_stored': self._stored_frame_count,
                'visual_memory_size': self._visual_memory.count(),
            }
            
            combined_stats = {
                'temporal_memory': temporal_stats,
                'spatial_memory': spatial_stats
            }
            
            response.success = True
            response.message = json.dumps(combined_stats, indent=2)
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def destroy_node(self):
        """Cleanup on shutdown."""
        self.get_logger().info('Shutting down Combined Memory System...')
        
        try:
            # Save spatial visual memory
            if self.visual_memory_path and self._visual_memory:
                self._visual_memory.save(self.visual_memory_path)
                self.get_logger().info(f'Saved visual memory to {self.visual_memory_path}')
        except Exception as e:
            self.get_logger().error(f'Error saving visual memory: {e}')
        
        try:
            self.temporal_memory.stop()
            self.lcm.stop()
            self.dimos.close_all()
        except Exception as e:
            self.get_logger().error(f'Error during shutdown: {e}')
        
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    
    try:
        node = CombinedMemoryNode()
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

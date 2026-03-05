#!/usr/bin/env python3
"""
ROS2 node for DimOS Temporal Memory.

Provides temporal reasoning capabilities using DimOS as a library.
Subscribes to camera images, builds entity graph, and provides query service.
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
from sensor_msgs.msg import Image
from std_msgs.msg import String
from std_srvs.srv import Trigger
import json
import threading
import time
from pathlib import Path

try:
    from dimos import core
    from dimos.perception.experimental.temporal_memory.temporal_memory import TemporalMemory, TemporalMemoryConfig
    from dimos.models.vl.openai import OpenAIVlModel
    from dimos.models.vl.qwen import QwenVlModel
    from dimos.models.vl.moondream import MoondreamVlModel
    from dimos.models.vl.moondream_hosted import MoondreamHostedVlModel
    from dimos.msgs.sensor_msgs import Image as DimosImage
    from dimos.protocol.pubsub.lcmpubsub import LCM, Topic
    DIMOS_AVAILABLE = True
except ImportError as e:
    DIMOS_AVAILABLE = False
    DIMOS_IMPORT_ERROR = str(e)

from cv_bridge import CvBridge


class TemporalMemoryNode(Node):
    """ROS2 node for DimOS Temporal Memory."""
    
    def __init__(self):
        super().__init__('temporal_memory_node')
        
        if not DIMOS_AVAILABLE:
            self.get_logger().error(f'DimOS not available: {DIMOS_IMPORT_ERROR}')
            self.get_logger().error('Please install DimOS: pip install -e /path/to/dimos')
            raise ImportError('DimOS not available')
        
        # Parameters
        self.declare_parameter('output_dir', './temporal_memory')
        self.declare_parameter('fps', 1.0)
        self.declare_parameter('window_s', 2.0)
        self.declare_parameter('stride_s', 2.0)
        self.declare_parameter('summary_interval_s', 10.0)
        self.declare_parameter('max_frames_per_window', 3)
        self.declare_parameter('persistent_memory', True)
        self.declare_parameter('clear_memory_on_start', False)
        self.declare_parameter('vlm_backend', 'openai')  # openai|qwen|qwen2.5_local|nemotron_local|smolvlm_local|moondream_local|moondream_objects_local|moondream_hosted
        self.declare_parameter('vlm_model_name', '')  # optional override (e.g. HF model name)
        self.declare_parameter('max_tokens', 2000)  # Max tokens for VLM responses
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('query_topic', '/temporal_memory/query')
        self.declare_parameter('result_topic', '/temporal_memory/result')
        self.declare_parameter('entities_topic', '/temporal_memory/entities')
        
        # Get parameters
        output_dir = self.get_parameter('output_dir').value
        fps = self.get_parameter('fps').value
        window_s = self.get_parameter('window_s').value
        stride_s = self.get_parameter('stride_s').value
        summary_interval_s = self.get_parameter('summary_interval_s').value
        max_frames_per_window = self.get_parameter('max_frames_per_window').value
        persistent_memory = self.get_parameter('persistent_memory').value
        clear_memory_on_start = self.get_parameter('clear_memory_on_start').value
        vlm_backend = self.get_parameter('vlm_backend').value
        vlm_model_name = self.get_parameter('vlm_model_name').value
        max_tokens = self.get_parameter('max_tokens').value
        camera_topic = self.get_parameter('camera_topic').value
        query_topic = self.get_parameter('query_topic').value
        result_topic = self.get_parameter('result_topic').value
        entities_topic = self.get_parameter('entities_topic').value
        
        self.get_logger().info('Initializing DimOS Temporal Memory...')
        
        # CV Bridge
        self.cv_bridge = CvBridge()
        
        # Start DimOS cluster with increased memory limit for large VLM models
        # Default is ~15GB, increase to 40GB for models like Nemotron (17GB)
        self.dimos = core.start(n=1, memory_limit='40GB')
        
        self.get_logger().info('DimOS cluster started')
        
        # Initialize LCM for DimOS communication
        self.lcm = LCM()
        self.get_logger().info('LCM created, starting...')
        self.lcm.start()
        self.get_logger().info('LCM started')

        # Store VLM config for later initialization in worker
        self.vlm_backend = vlm_backend
        self.vlm_model_name = vlm_model_name
        
        # Deploy Temporal Memory
        self.get_logger().info('Creating temporal memory config...')
        self.get_logger().info(f'Using max_tokens: {max_tokens}')
        config = TemporalMemoryConfig(
            fps=fps,
            window_s=window_s,
            stride_s=stride_s,
            summary_interval_s=summary_interval_s,
            max_frames_per_window=max_frames_per_window,
            output_dir=Path(output_dir),
            persistent_memory=persistent_memory,
            clear_memory_on_start=clear_memory_on_start,
            enable_distance_estimation=True,
            max_relations_per_entity=10,
            nearby_distance_meters=5.0,
            max_tokens=max_tokens,
        )
        
        # Deploy without VLM first (will be set via RPC after deployment)
        self.get_logger().info('Deploying temporal memory...')
        self.temporal_memory = self.dimos.deploy(TemporalMemory, vlm=None, config=config)
        
        # Initialize VLM in the worker process via RPC
        self.get_logger().info(f'Initializing VLM backend in worker: {vlm_backend}')
        self._initialize_vlm_in_worker()
        
        # Connect temporal memory input to LCM topic
        self.get_logger().info(f'Connecting temporal memory to image stream: {camera_topic}')
        from dimos.core.transport import LCMTransport
        image_transport = LCMTransport(camera_topic, DimosImage)
        self.temporal_memory.color_image.transport = image_transport
        
        try:
            self.temporal_memory.start()
            self.get_logger().info('Temporal memory deployed successfully')
        except Exception as e:
            self.get_logger().error(
                f"TemporalMemory.start() failed (likely PubSubRPC transport not initialized in worker): {e}"
            )
            self.get_logger().error(
                "Continuing without calling TemporalMemory.start(); RPC/pubsub features may be disabled."
            )
        
        # ROS2 QoS - use RELIABLE to match camera publisher
        qos = QoSProfile(
            reliability=QoSReliabilityPolicy.RELIABLE,
            history=QoSHistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        # Subscribe to camera
        self.image_sub = self.create_subscription(
            Image,
            camera_topic,
            self.image_callback,
            qos
        )
        
        # Subscribe to query requests
        self.query_sub = self.create_subscription(
            String,
            query_topic,
            self.query_callback,
            10
        )
        
        # Publishers
        self.result_pub = self.create_publisher(String, result_topic, 10)
        self.entities_pub = self.create_publisher(String, entities_topic, 10)
        
        # Services
        self.state_srv = self.create_service(
            Trigger,
            '~/get_state',
            self.get_state_callback
        )
        
        self.stats_srv = self.create_service(
            Trigger,
            '~/get_stats',
            self.get_stats_callback
        )
        
        # Periodic entity roster publishing
        self.roster_timer = self.create_timer(5.0, self.publish_entity_roster)
        
        # DimOS topic for publishing images (must match camera_topic)
        self.dimos_image_topic = Topic(camera_topic, DimosImage)
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('Temporal Memory Node Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'Camera topic: {camera_topic}')
        self.get_logger().info(f'Query topic: {query_topic}')
        self.get_logger().info(f'Result topic: {result_topic}')
        self.get_logger().info(f'Entities topic: {entities_topic}')
        self.get_logger().info(f'Output directory: {output_dir}')
        self.get_logger().info(f'VLM backend: {vlm_backend}')
        if vlm_model_name:
            self.get_logger().info(f'VLM model name: {vlm_model_name}')
        self.get_logger().info('=' * 60)
    
    def _initialize_vlm_in_worker(self):
        """Initialize VLM in the worker process to avoid pickling issues."""
        def init_and_set_vlm(temporal_memory_ref, backend, model_name):
            """Function to run in worker to initialize and set VLM."""
            if backend == 'openai':
                from dimos.models.vl.openai import OpenAIVlModel
                vlm = OpenAIVlModel()
            elif backend == 'qwen':
                from dimos.models.vl.qwen import QwenVlModel
                vlm = QwenVlModel()
            elif backend == 'qwen2.5_local':
                from dimos_vlm_bridge.qwen_local import Qwen25VlLocalModel
                if model_name:
                    vlm = Qwen25VlLocalModel(model_name=model_name)
                else:
                    vlm = Qwen25VlLocalModel()
                vlm.start()
            elif backend == 'nemotron_local':
                from dimos_vlm_bridge.nemotron_local import NemotronVLMLocalModel
                from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
                if model_name:
                    base_vlm = NemotronVLMLocalModel(model_name=model_name)
                else:
                    base_vlm = NemotronVLMLocalModel()
                base_vlm.start()
                # Wrap with JSON repair to fix incomplete responses
                vlm = JSONRepairWrapper(base_vlm)
            elif backend == 'smolvlm_local':
                from dimos_vlm_bridge.smolvlm_local import SmolVLMLocalModel
                from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
                if model_name:
                    base_vlm = SmolVLMLocalModel(model_name=model_name)
                else:
                    base_vlm = SmolVLMLocalModel()
                base_vlm.start()
                # Wrap with JSON repair to fix incomplete responses
                vlm = JSONRepairWrapper(base_vlm)
            elif backend == 'moondream_local':
                from dimos.models.vl.moondream import MoondreamVlModel
                from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
                if model_name:
                    base_vlm = MoondreamVlModel(model_name=model_name)
                else:
                    base_vlm = MoondreamVlModel()
                base_vlm.start()
                # Wrap with JSON repair to fix incomplete responses
                vlm = JSONRepairWrapper(base_vlm)
            elif backend == 'moondream_objects_local':
                from dimos.models.vl.moondream import MoondreamVlModel
                from dimos_vlm_bridge.moondream_objects_local import MoondreamObjectsLocalModel
                if model_name:
                    base_vlm = MoondreamVlModel(model_name=model_name)
                else:
                    base_vlm = MoondreamVlModel()
                base_vlm.start()
                # Wrap Moondream to output a comma-separated object list, then convert to TemporalMemory JSON
                vlm = MoondreamObjectsLocalModel(base_vlm)
            elif backend == 'moondream_hosted':
                from dimos.models.vl.moondream_hosted import MoondreamHostedVlModel
                vlm = MoondreamHostedVlModel()
            else:
                raise ValueError(f'Unknown vlm_backend: {backend}')
            
            # Set VLM on the actual actor instance (not proxy)
            # temporal_memory_ref is the Dask actor reference, we need to get the actual instance
            import inspect
            frame = inspect.currentframe()
            # Get the actual TemporalMemory instance from the worker
            from distributed import get_worker
            worker = get_worker()
            # Find the actor in worker's actors
            for actor_ref, actor_instance in worker.actors.items():
                if str(actor_ref) == str(temporal_memory_ref):
                    actor_instance._vlm = vlm
                    return True
            return False
        
        # Submit function to worker where temporal_memory actor lives
        future = self.dimos.submit(
            init_and_set_vlm,
            self.temporal_memory.actor_instance,
            self.vlm_backend,
            self.vlm_model_name,
            actor=True
        )
        result = future.result()
        if result:
            self.get_logger().info('VLM initialized in worker process')
        else:
            self.get_logger().error('Failed to set VLM in worker process')
    
    def image_callback(self, msg):
        """Convert ROS image to DimOS and publish to LCM."""
        try:
            # Convert ROS Image to OpenCV
            cv_image = self.cv_bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            
            # Create DimOS Image
            timestamp = msg.header.stamp.sec + msg.header.stamp.nanosec / 1e9
            dimos_image = DimosImage(
                data=cv_image,
                ts=timestamp,
                frame_id=msg.header.frame_id
            )
            
            # Publish to DimOS LCM (Temporal Memory subscribes to this)
            self.lcm.publish(self.dimos_image_topic, dimos_image)
            self.get_logger().debug(f'Published image to LCM: {cv_image.shape}, ts={timestamp}')
            
        except Exception as e:
            self.get_logger().error(f'Error processing image: {e}', exc_info=True)
    
    def query_callback(self, msg):
        """Handle temporal memory query."""
        query = msg.data
        self.get_logger().info(f'Query: {query}')
        
        try:
            # Query temporal memory
            answer = self.temporal_memory.query(query)
            
            # Publish result
            result_msg = String()
            result_msg.data = answer
            self.result_pub.publish(result_msg)
            
            self.get_logger().info(f'Answer: {answer}')
            
        except Exception as e:
            self.get_logger().error(f'Error processing query: {e}')
            error_msg = String()
            error_msg.data = f'Error: {str(e)}'
            self.result_pub.publish(error_msg)
    
    def publish_entity_roster(self):
        """Periodically publish entity roster."""
        try:
            self.get_logger().debug('Publishing entity roster...')
            entities = self.temporal_memory.get_entity_roster()
            
            roster_data = {
                'count': len(entities),
                'entities': entities,
                'timestamp': time.time()
            }
            
            msg = String()
            msg.data = json.dumps(roster_data, indent=2)
            self.entities_pub.publish(msg)
            self.get_logger().debug(f'Published {len(entities)} entities')
            
        except Exception as e:
            self.get_logger().error(f'Error publishing roster: {e}', exc_info=True)
    
    def get_state_callback(self, request, response):
        """Service to get current temporal memory state."""
        try:
            state = self.temporal_memory.get_state()
            response.success = True
            response.message = json.dumps(state, indent=2)
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def get_stats_callback(self, request, response):
        """Service to get entity graph database statistics."""
        try:
            stats = self.temporal_memory.get_graph_db_stats()
            response.success = True
            response.message = json.dumps(stats, indent=2)
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def destroy_node(self):
        """Cleanup on shutdown."""
        self.get_logger().info('Shutting down Temporal Memory...')
        
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
        node = TemporalMemoryNode()
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

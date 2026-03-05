#!/usr/bin/env python3
"""
ROS2 service node for simple VLM queries.

Provides a lightweight VLM query service without temporal/spatial memory.
Useful for quick visual question answering.
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
from sensor_msgs.msg import Image
from std_msgs.msg import String
from std_srvs.srv import Trigger

try:
    from dimos.models.vl.openai import OpenAIVlModel
    from dimos.models.vl.qwen import QwenVlModel
    from dimos.models.vl.moondream import MoondreamVlModel
    from dimos.models.vl.moondream_hosted import MoondreamHostedVlModel
    from dimos.msgs.sensor_msgs import Image as DimosImage
    DIMOS_AVAILABLE = True
except ImportError as e:
    DIMOS_AVAILABLE = False
    DIMOS_IMPORT_ERROR = str(e)

from cv_bridge import CvBridge


class VLMQueryService(Node):
    """Simple VLM query service node."""
    
    def __init__(self):
        super().__init__('vlm_query_service')
        
        if not DIMOS_AVAILABLE:
            self.get_logger().error(f'DimOS not available: {DIMOS_IMPORT_ERROR}')
            self.get_logger().error('Please install DimOS: pip install -e /path/to/dimos')
            raise ImportError('DimOS not available')
        
        # Parameters
        self.declare_parameter('vlm_backend', 'openai')  # openai|qwen|moondream_local|moondream_hosted
        self.declare_parameter('vlm_model_name', '')  # optional override for some backends
        self.declare_parameter('camera_topic', '/camera/image_raw')
        self.declare_parameter('query_topic', '/vlm/query')
        self.declare_parameter('result_topic', '/vlm/result')
        
        # Get parameters
        vlm_backend = self.get_parameter('vlm_backend').value
        vlm_model_name = self.get_parameter('vlm_model_name').value
        camera_topic = self.get_parameter('camera_topic').value
        query_topic = self.get_parameter('query_topic').value
        result_topic = self.get_parameter('result_topic').value
        
        self.get_logger().info(f'Initializing VLM Query Service with backend={vlm_backend}...')
        
        # Initialize VLM
        if vlm_backend == 'openai':
            self.vlm = OpenAIVlModel()
        elif vlm_backend == 'qwen':
            self.vlm = QwenVlModel()
        elif vlm_backend == 'moondream_local':
            # Fully local HF/torch model (no API key)
            # Default: vikhyatk/moondream2
            if vlm_model_name:
                self.vlm = MoondreamVlModel(model_name=vlm_model_name)
            else:
                self.vlm = MoondreamVlModel()
            try:
                self.vlm.start()
            except Exception as e:
                self.get_logger().error(
                    f'Failed to start MoondreamVlModel (local). Missing torch/transformers/GPU? Error: {e}'
                )
                raise
        elif vlm_backend == 'moondream_hosted':
            # Hosted Moondream API (requires MOONDREAM_API_KEY)
            self.vlm = MoondreamHostedVlModel()
        else:
            raise ValueError(f'Unknown VLM backend: {vlm_backend}')
        
        # CV Bridge
        self.cv_bridge = CvBridge()
        
        # State
        self.latest_image = None
        
        # ROS2 QoS
        qos = QoSProfile(
            reliability=QoSReliabilityPolicy.BEST_EFFORT,
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
        
        # Subscribe to queries
        self.query_sub = self.create_subscription(
            String,
            query_topic,
            self.query_callback,
            10
        )
        
        # Publisher
        self.result_pub = self.create_publisher(String, result_topic, 10)
        
        # Service
        self.describe_srv = self.create_service(
            Trigger,
            '~/describe_scene',
            self.describe_callback
        )
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('VLM Query Service Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'VLM Backend: {vlm_backend}')
        if vlm_model_name:
            self.get_logger().info(f'VLM Model Name: {vlm_model_name}')
        self.get_logger().info(f'Camera topic: {camera_topic}')
        self.get_logger().info(f'Query topic: {query_topic}')
        self.get_logger().info(f'Result topic: {result_topic}')
        self.get_logger().info('=' * 60)
    
    def image_callback(self, msg):
        """Store latest image."""
        try:
            cv_image = self.cv_bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            self.latest_image = DimosImage(data=cv_image)
        except Exception as e:
            self.get_logger().error(f'Error processing image: {e}')
    
    def query_callback(self, msg):
        """Handle VLM query."""
        query = msg.data
        self.get_logger().info(f'Query: "{query}"')
        
        if self.latest_image is None:
            self.get_logger().warn('No image available')
            error_msg = String()
            error_msg.data = 'Error: No image available'
            self.result_pub.publish(error_msg)
            return
        
        try:
            # Query VLM
            answer = self.vlm.query(self.latest_image, query)
            
            # Publish result
            result_msg = String()
            result_msg.data = answer
            self.result_pub.publish(result_msg)
            
            self.get_logger().info(f'Answer: {answer}')
            
        except Exception as e:
            self.get_logger().error(f'Error querying VLM: {e}')
            error_msg = String()
            error_msg.data = f'Error: {str(e)}'
            self.result_pub.publish(error_msg)
    
    def describe_callback(self, request, response):
        """Service to describe current scene."""
        if self.latest_image is None:
            response.success = False
            response.message = 'No image available'
            return response
        
        try:
            description = self.vlm.query(
                self.latest_image,
                "Describe this scene in one sentence."
            )
            
            response.success = True
            response.message = description
            
            self.get_logger().info(f'Scene description: {description}')
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response


def main(args=None):
    rclpy.init(args=args)
    
    try:
        node = VLMQueryService()
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

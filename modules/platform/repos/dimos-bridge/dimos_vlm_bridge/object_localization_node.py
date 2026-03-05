#!/usr/bin/env python3
"""
ROS2 node for Object Localization using VLM + LIDAR.

Combines vision language model object detection with LIDAR point clouds
to determine 3D positions of detected objects and stores them in a database.
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
from sensor_msgs.msg import Image, CameraInfo, PointCloud2
from sensor_msgs_py import point_cloud2
from nav_msgs.msg import Odometry
from geometry_msgs.msg import PoseStamped
from std_msgs.msg import String
from std_srvs.srv import Trigger
import cv2
import json
import numpy as np
import time
from pathlib import Path
from datetime import datetime
import sqlite3
import struct
from message_filters import Subscriber, ApproximateTimeSynchronizer

import tf2_ros
from tf_transformations import quaternion_matrix

try:
    from dimos.models.vl.openai import OpenAIVlModel
    from dimos.models.vl.qwen import QwenVlModel
    DIMOS_AVAILABLE = True
except ImportError as e:
    DIMOS_AVAILABLE = False
    DIMOS_IMPORT_ERROR = str(e)

from cv_bridge import CvBridge


def transform_to_matrix(t):
    """Convert geometry_msgs/TransformStamped to 4x4 matrix."""
    tr = t.transform.translation
    q = t.transform.rotation
    T = quaternion_matrix([q.x, q.y, q.z, q.w])
    T[0, 3] = tr.x
    T[1, 3] = tr.y
    T[2, 3] = tr.z
    return T


class ObjectLocalizationNode(Node):
    """ROS2 node for object detection and localization using VLM + LIDAR."""
    
    def __init__(self):
        super().__init__('object_localization_node')
        
        if not DIMOS_AVAILABLE:
            self.get_logger().error(f'DimOS not available: {DIMOS_IMPORT_ERROR}')
            self.get_logger().error('Please install DimOS: pip install -e /path/to/dimos')
            raise ImportError('DimOS not available')
        
        self.declare_parameter('output_dir', './object_localization')
        self.declare_parameter('db_path', './object_localization/objects.db')
        self.declare_parameter('detection_interval', 2.0)
        self.declare_parameter('vlm_backend', 'moondream_local')
        self.declare_parameter('vlm_model_name', '')
        self.declare_parameter('max_tokens', 2000)
        self.declare_parameter('cosmos_api_url', '')
        self.declare_parameter('cosmos_api_key', '')
        self.declare_parameter('cosmos_use_reasoning', False)
        self.declare_parameter('camera_topic', '/robot0/front_cam/rgb')
        self.declare_parameter('camera_info_topic', '/robot0/front_cam/camera_info')
        self.declare_parameter('depth_topic', '/robot0/front_cam/depth')
        self.declare_parameter('pointcloud_topic', '/robot0/point_cloud2_L1')
        self.declare_parameter('odom_topic', '/odom')
        self.declare_parameter('camera_frame', 'robot0/front_cam_optical_frame')
        self.declare_parameter('map_frame', 'map')
        self.declare_parameter('sync_slop', 0.2)
        self.declare_parameter('max_points', 60000)
        self.declare_parameter('min_detection_confidence', 0.3)
        self.declare_parameter('bbox_depth_percentile', 50)
        self.declare_parameter('use_depth_fusion', True)
        self.declare_parameter('min_lidar_points_for_bbox', 10)
        self.declare_parameter('depth_valid_range', [0.1, 10.0])
        
        output_dir = self.get_parameter('output_dir').value
        self.db_path = str(Path(self.get_parameter('db_path').value).resolve())
        self.get_logger().info(f'DB path (absolute): {self.db_path}')
        self.detection_interval = self.get_parameter('detection_interval').value
        vlm_backend = self.get_parameter('vlm_backend').value
        vlm_model_name = self.get_parameter('vlm_model_name').value
        max_tokens = self.get_parameter('max_tokens').value
        cosmos_api_url = self.get_parameter('cosmos_api_url').value
        cosmos_api_key = self.get_parameter('cosmos_api_key').value
        cosmos_use_reasoning = self.get_parameter('cosmos_use_reasoning').value
        camera_topic = self.get_parameter('camera_topic').value
        camera_info_topic = self.get_parameter('camera_info_topic').value
        depth_topic = self.get_parameter('depth_topic').value
        pointcloud_topic = self.get_parameter('pointcloud_topic').value
        odom_topic = self.get_parameter('odom_topic').value
        self.camera_frame = self.get_parameter('camera_frame').value
        self.map_frame = self.get_parameter('map_frame').value
        sync_slop = self.get_parameter('sync_slop').value
        self.max_points = self.get_parameter('max_points').value
        self.min_confidence = self.get_parameter('min_detection_confidence').value
        self.bbox_depth_percentile = self.get_parameter('bbox_depth_percentile').value
        self.use_depth_fusion = self.get_parameter('use_depth_fusion').value
        self.min_lidar_points = self.get_parameter('min_lidar_points_for_bbox').value
        depth_range = self.get_parameter('depth_valid_range').value
        self.depth_min, self.depth_max = depth_range[0], depth_range[1]
        
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        self.get_logger().info('Initializing Object Localization Node...')
        
        self.cv_bridge = CvBridge()
        
        self.get_logger().info(f'Initializing VLM backend: {vlm_backend}')
        self.vlm = self._initialize_vlm(vlm_backend, vlm_model_name, cosmos_api_url, cosmos_api_key, cosmos_use_reasoning)
        
        self._init_database()
        
        self.tf_buffer = tf2_ros.Buffer(cache_time=rclpy.duration.Duration(seconds=30.0))
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)
        
        self.latest_odom = None
        self.last_detection_time = 0
        
        qos_best_effort = QoSProfile(
            reliability=QoSReliabilityPolicy.BEST_EFFORT,
            history=QoSHistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        self.odom_sub = self.create_subscription(
            Odometry,
            odom_topic,
            self.odom_callback,
            qos_best_effort
        )
        
        self.sub_cloud = Subscriber(self, PointCloud2, pointcloud_topic, qos_profile=qos_best_effort)
        self.sub_img = Subscriber(self, Image, camera_topic, qos_profile=qos_best_effort)
        self.sub_info = Subscriber(self, CameraInfo, camera_info_topic, qos_profile=qos_best_effort)
        self.sub_depth = Subscriber(self, Image, depth_topic, qos_profile=qos_best_effort)
        
        self.ts = ApproximateTimeSynchronizer(
            [self.sub_cloud, self.sub_img, self.sub_info, self.sub_depth],
            queue_size=10,
            slop=sync_slop
        )
        self.ts.registerCallback(self.synchronized_callback)
        
        self.detections_pub = self.create_publisher(String, '~/detections', 10)
        
        self.stats_srv = self.create_service(
            Trigger,
            '~/get_stats',
            self.get_stats_callback
        )
        
        self.clear_db_srv = self.create_service(
            Trigger,
            '~/clear_database',
            self.clear_database_callback
        )
        
        self.get_logger().info('=' * 60)
        self.get_logger().info('Object Localization Node Started!')
        self.get_logger().info('=' * 60)
        self.get_logger().info(f'Camera topic: {camera_topic}')
        self.get_logger().info(f'Depth topic: {depth_topic}')
        self.get_logger().info(f'PointCloud topic: {pointcloud_topic}')
        self.get_logger().info(f'Odometry topic: {odom_topic}')
        self.get_logger().info(f'Detection interval: {self.detection_interval}s')
        self.get_logger().info(f'VLM backend: {vlm_backend}')
        self.get_logger().info(f'Depth fusion: {"enabled" if self.use_depth_fusion else "disabled"}')
        if self.use_depth_fusion:
            self.get_logger().info(f'  Min LIDAR points for bbox: {self.min_lidar_points}')
            self.get_logger().info(f'  Depth valid range: [{self.depth_min}, {self.depth_max}]m')
        self.get_logger().info(f'Database: {self.db_path}')
        self.get_logger().info('=' * 60)
    
    def _initialize_vlm(self, backend, model_name, cosmos_api_url='', cosmos_api_key='', cosmos_use_reasoning=False):
        """Initialize the vision language model."""
        if backend == 'openai':
            vlm = OpenAIVlModel()
        elif backend == 'qwen':
            vlm = QwenVlModel()
        elif backend == 'qwen2.5_local':
            from dimos_vlm_bridge.qwen_local import Qwen25VlLocalModel
            vlm = Qwen25VlLocalModel(model_name=model_name) if model_name else Qwen25VlLocalModel()
            vlm.start()
        elif backend == 'nemotron_local':
            from dimos_vlm_bridge.nemotron_local import NemotronVLMLocalModel
            from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
            base_vlm = NemotronVLMLocalModel(model_name=model_name) if model_name else NemotronVLMLocalModel()
            base_vlm.start()
            vlm = JSONRepairWrapper(base_vlm)
        elif backend == 'smolvlm_local':
            from dimos_vlm_bridge.smolvlm_local import SmolVLMLocalModel
            from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
            base_vlm = SmolVLMLocalModel(model_name=model_name) if model_name else SmolVLMLocalModel()
            base_vlm.start()
            vlm = JSONRepairWrapper(base_vlm)
        elif backend == 'moondream_local':
            from dimos.models.vl.moondream import MoondreamVlModel
            from dimos_vlm_bridge.vlm_json_fixer import JSONRepairWrapper
            base_vlm = MoondreamVlModel(model_name=model_name) if model_name else MoondreamVlModel()
            base_vlm.start()
            vlm = JSONRepairWrapper(base_vlm)
        elif backend == 'moondream_objects_local':
            from dimos.models.vl.moondream import MoondreamVlModel
            from dimos_vlm_bridge.moondream_objects_local import MoondreamObjectsLocalModel
            base_vlm = MoondreamVlModel(model_name=model_name) if model_name else MoondreamVlModel()
            base_vlm.start()
            vlm = MoondreamObjectsLocalModel(base_vlm)
        elif backend == 'moondream_hosted':
            from dimos.models.vl.moondream_hosted import MoondreamHostedVlModel
            vlm = MoondreamHostedVlModel()
        elif backend == 'cosmos_reason2':
            from dimos_vlm_bridge.cosmos_reason2 import CosmosReason2VlModel
            if not cosmos_api_url:
                raise ValueError('cosmos_api_url must be set for cosmos_reason2 backend')
            vlm = CosmosReason2VlModel(
                api_url=cosmos_api_url,
                api_key=cosmos_api_key if cosmos_api_key else None,
                model_name=model_name if model_name else 'nvidia/cosmos-reason-2',
                use_reasoning=cosmos_use_reasoning
            )
        else:
            raise ValueError(f'Unknown vlm_backend: {backend}')
        
        self.get_logger().info('VLM initialized successfully')
        return vlm
    
    def _init_database(self):
        """Initialize SQLite database for storing object detections."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                object_name TEXT NOT NULL,
                object_description TEXT,
                robot_x REAL NOT NULL,
                robot_y REAL NOT NULL,
                robot_z REAL NOT NULL,
                object_x REAL,
                object_y REAL,
                object_z REAL,
                confidence REAL,
                bbox_x_min INTEGER,
                bbox_y_min INTEGER,
                bbox_x_max INTEGER,
                bbox_y_max INTEGER,
                frame_id TEXT,
                camera_frame_jpeg BLOB
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_timestamp ON detections(timestamp)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_object_name ON detections(object_name)
        ''')
        
        conn.commit()
        conn.close()
        
        self.get_logger().info(f'Database initialized: {self.db_path}')
    
    def odom_callback(self, msg):
        """Store latest odometry."""
        self.latest_odom = msg
    
    def synchronized_callback(self, cloud_msg, img_msg, cinfo_msg, depth_msg):
        """Process synchronized camera image, point cloud, camera info, and depth map."""
        current_time = time.time()
        
        if current_time - self.last_detection_time < self.detection_interval:
            return
        
        if self.latest_odom is None:
            self.get_logger().warn('No odometry data available yet')
            return
        
        self.last_detection_time = current_time
        
        try:
            self._process_detection(cloud_msg, img_msg, cinfo_msg, depth_msg)
        except Exception as e:
            self.get_logger().error(f'Error processing detection: {e}', exc_info=True)
    
    def _process_detection(self, cloud_msg, img_msg, cinfo_msg, depth_msg):
        """Detect objects and localize them using LIDAR and/or depth map fusion."""
        cv_image = self.cv_bridge.imgmsg_to_cv2(img_msg, desired_encoding='bgr8')
        
        depth_image = None
        if self.use_depth_fusion:
            try:
                depth_image = self.cv_bridge.imgmsg_to_cv2(depth_msg, desired_encoding='32FC1')
            except Exception as e:
                self.get_logger().warn(f'Failed to convert depth image: {e}')
                depth_image = None
        
        prompt = """Detect all objects in this image. For each object, provide:
1. Object name/type
2. Bounding box coordinates [x_min, y_min, x_max, y_max] in pixels
3. Brief description

Return as JSON array: [{"name": "object_name", "bbox": [x_min, y_min, x_max, y_max], "description": "brief description"}]"""
        
        self.get_logger().info('Querying VLM for object detection...')
        response = self.vlm.query(cv_image, prompt)
        
        detections = self._parse_vlm_response(response)
        
        if not detections:
            self.get_logger().info('No objects detected')
            return
        
        self.get_logger().info(f'Detected {len(detections)} objects')
        
        robot_pos = self.latest_odom.pose.pose.position
        
        W, H = img_msg.width, img_msg.height
        fx, fy, cx, cy = cinfo_msg.k[0], cinfo_msg.k[4], cinfo_msg.k[2], cinfo_msg.k[5]
        
        tf_ok = False
        T_lc = T_cm = None
        u = v = np.array([], dtype=np.int32)
        map_pts = np.zeros((0, 4), dtype=np.float32)
        
        try:
            tf_lidar_to_cam = self.tf_buffer.lookup_transform(
                self.camera_frame, cloud_msg.header.frame_id, rclpy.time.Time(),
                timeout=rclpy.duration.Duration(seconds=0.2)
            )
            tf_cam_to_map = self.tf_buffer.lookup_transform(
                self.map_frame, self.camera_frame, rclpy.time.Time(),
                timeout=rclpy.duration.Duration(seconds=0.2)
            )
            tf_ok = True
        except Exception as e:
            self.get_logger().warn(f'TF lookup failed (3D positions will be None): {e}')
        
        if tf_ok:
            T_lc = transform_to_matrix(tf_lidar_to_cam)
            T_cm = transform_to_matrix(tf_cam_to_map)
            
            pts = []
            for p in point_cloud2.read_points(cloud_msg, field_names=("x", "y", "z"), skip_nans=True):
                try:
                    x, y, z = float(p[0]), float(p[1]), float(p[2])
                except Exception:
                    x, y, z = float(p['x']), float(p['y']), float(p['z'])
                pts.append((x, y, z))
                if len(pts) >= self.max_points:
                    break
            
            if pts:
                pts = np.array(pts, dtype=np.float32)
                ones = np.ones((pts.shape[0], 1), dtype=np.float32)
                pts_h = np.hstack([pts, ones])
                
                cam = (T_lc @ pts_h.T).T
                X, Y, Z = cam[:, 0], cam[:, 1], cam[:, 2]
                
                valid = Z > 0.05
                X, Y, Z = X[valid], Y[valid], Z[valid]
                
                if X.size > 0:
                    u_all = (fx * (X / Z) + cx).astype(np.int32)
                    v_all = (fy * (Y / Z) + cy).astype(np.int32)
                    in_img = (u_all >= 0) & (u_all < W) & (v_all >= 0) & (v_all < H)
                    u = u_all[in_img]
                    v = v_all[in_img]
                    X = X[in_img]
                    Y = Y[in_img]
                    Z = Z[in_img]
                    cam_pts = np.stack([X, Y, Z, np.ones_like(Z)], axis=1).astype(np.float32)
                    map_pts = (T_cm @ cam_pts.T).T
        
        timestamp = time.time()
        stored_count = 0
        
        for det in detections:
            obj_name = det.get('name', 'unknown')
            bbox = det.get('bbox', [])
            description = det.get('description', '')
            confidence = det.get('confidence', 0.5)
            
            if len(bbox) != 4:
                self.get_logger().warn(f'Invalid bbox for {obj_name}: {bbox}')
                continue
            
            x_min, y_min, x_max, y_max = bbox
            
            x_min = max(0, min(W-1, int(x_min)))
            y_min = max(0, min(H-1, int(y_min)))
            x_max = max(0, min(W-1, int(x_max)))
            y_max = max(0, min(H-1, int(y_max)))
            
            if x_max <= x_min or y_max <= y_min:
                continue
            
            if u.size > 0:
                mask = (u >= x_min) & (u <= x_max) & (v >= y_min) & (v <= y_max)
                bbox_points = map_pts[mask]
            else:
                bbox_points = np.zeros((0, 4), dtype=np.float32)
            
            obj_x, obj_y, obj_z = self._compute_object_position_fusion(
                bbox_points, depth_image, bbox, 
                [x_min, y_min, x_max, y_max], 
                fx, fy, cx, cy, T_cm, obj_name
            )
            
            self._store_detection(
                timestamp=timestamp,
                object_name=obj_name,
                object_description=description,
                robot_x=float(robot_pos.x),
                robot_y=float(robot_pos.y),
                robot_z=float(robot_pos.z),
                object_x=obj_x,
                object_y=obj_y,
                object_z=obj_z,
                confidence=confidence,
                bbox=[x_min, y_min, x_max, y_max],
                frame_id=self.map_frame,
                camera_frame=cv_image
            )
            stored_count += 1
            
            pos_str = f'({obj_x:.2f}, {obj_y:.2f}, {obj_z:.2f})' if obj_x is not None else 'N/A'
            self.get_logger().info(f'Stored: {obj_name} at {pos_str}')
        
        detection_msg = String()
        detection_msg.data = json.dumps({
            'timestamp': timestamp,
            'count': stored_count,
            'objects': [d.get('name', 'unknown') for d in detections]
        })
        self.detections_pub.publish(detection_msg)
    
    def _compute_object_position_fusion(self, bbox_lidar_points, depth_image, bbox_orig, 
                                        bbox_clipped, fx, fy, cx, cy, T_cm, obj_name):
        """
        Compute 3D object position using LIDAR+Depth fusion.
        
        Strategy:
        1. If enough LIDAR points in bbox (>= min_lidar_points): use LIDAR (most accurate)
        2. Otherwise, use depth map as fallback
        3. Return (x, y, z) in map frame or (None, None, None) if no data
        
        Args:
            bbox_lidar_points: LIDAR points in map frame within bbox (Nx4 array)
            depth_image: Depth map (HxW float32 array in meters) or None
            bbox_orig: Original bbox from VLM [x_min, y_min, x_max, y_max]
            bbox_clipped: Clipped bbox [x_min, y_min, x_max, y_max]
            fx, fy, cx, cy: Camera intrinsics
            T_cm: Transform matrix from camera to map
            obj_name: Object name for logging
            
        Returns:
            (obj_x, obj_y, obj_z): Position in map frame or (None, None, None)
        """
        x_min, y_min, x_max, y_max = bbox_clipped
        
        # Strategy 1: Use LIDAR if enough points
        if bbox_lidar_points.shape[0] >= self.min_lidar_points:
            obj_x = float(np.percentile(bbox_lidar_points[:, 0], self.bbox_depth_percentile))
            obj_y = float(np.percentile(bbox_lidar_points[:, 1], self.bbox_depth_percentile))
            obj_z = float(np.percentile(bbox_lidar_points[:, 2], self.bbox_depth_percentile))
            self.get_logger().debug(
                f'{obj_name}: Using LIDAR ({bbox_lidar_points.shape[0]} points)'
            )
            return obj_x, obj_y, obj_z
        
        # Strategy 2: Use depth map as fallback
        if depth_image is not None and self.use_depth_fusion and T_cm is not None:
            try:
                # Extract depth values from bbox region
                depth_roi = depth_image[y_min:y_max, x_min:x_max]
                
                # Filter valid depth values
                valid_mask = (depth_roi > self.depth_min) & (depth_roi < self.depth_max) & np.isfinite(depth_roi)
                valid_depths = depth_roi[valid_mask]
                
                if valid_depths.size > 0:
                    # Use median depth
                    median_depth = float(np.median(valid_depths))
                    
                    # Compute 3D position at bbox center
                    bbox_center_u = (x_min + x_max) / 2.0
                    bbox_center_v = (y_min + y_max) / 2.0
                    
                    # Unproject to 3D in camera frame
                    X_cam = (bbox_center_u - cx) * median_depth / fx
                    Y_cam = (bbox_center_v - cy) * median_depth / fy
                    Z_cam = median_depth
                    
                    # Transform to map frame
                    cam_pt = np.array([X_cam, Y_cam, Z_cam, 1.0], dtype=np.float32)
                    map_pt = T_cm @ cam_pt
                    
                    obj_x = float(map_pt[0])
                    obj_y = float(map_pt[1])
                    obj_z = float(map_pt[2])
                    
                    self.get_logger().debug(
                        f'{obj_name}: Using DEPTH (median={median_depth:.2f}m, {valid_depths.size} valid pixels)'
                    )
                    return obj_x, obj_y, obj_z
                else:
                    self.get_logger().debug(f'{obj_name}: No valid depth values in bbox')
            except Exception as e:
                self.get_logger().warn(f'{obj_name}: Depth extraction failed: {e}')
        
        # No data available
        if bbox_lidar_points.shape[0] > 0:
            self.get_logger().warn(
                f'{obj_name}: Only {bbox_lidar_points.shape[0]} LIDAR points (need {self.min_lidar_points}), no depth fallback'
            )
        else:
            self.get_logger().warn(f'{obj_name}: No LIDAR points and no valid depth data')
        
        return None, None, None
    
    def _parse_vlm_response(self, response):
        """Parse VLM response to extract object detections."""
        try:
            if isinstance(response, str):
                response = response.strip()
                
                if response.startswith('```json'):
                    response = response[7:]
                if response.startswith('```'):
                    response = response[3:]
                if response.endswith('```'):
                    response = response[:-3]
                response = response.strip()
                
                parsed = json.loads(response)
                
                if isinstance(parsed, dict):
                    if 'objects' in parsed:
                        detections = parsed['objects']
                    elif 'detections' in parsed:
                        detections = parsed['detections']
                    elif 'name' in parsed and 'bbox' in parsed:
                        detections = [parsed]
                    elif 'label' in parsed and 'bbox_2d' in parsed:
                        bbox = parsed['bbox_2d']
                        detections = [{
                            'name': parsed.get('label', 'unknown'),
                            'bbox': bbox,
                            'description': parsed.get('description', ''),
                            'confidence': 0.8
                        }]
                    else:
                        detections = [parsed]
                elif isinstance(parsed, list):
                    detections = parsed
                else:
                    detections = [parsed]
            elif isinstance(response, dict):
                if 'objects' in response:
                    detections = response['objects']
                elif 'detections' in response:
                    detections = response['detections']
                elif 'name' in response and 'bbox' in response:
                    detections = [response]
                elif 'label' in response and 'bbox_2d' in response:
                    bbox = response['bbox_2d']
                    detections = [{
                        'name': response.get('label', 'unknown'),
                        'bbox': bbox,
                        'description': response.get('description', ''),
                        'confidence': 0.8
                    }]
                else:
                    detections = [response]
            elif isinstance(response, list):
                detections = response
            else:
                self.get_logger().warn(f'Unexpected response type: {type(response)}')
                return []
            
            if not isinstance(detections, list):
                detections = [detections]
            
            self.get_logger().info(f'Parsed {len(detections)} potential detections from response')
            
            valid_detections = []
            for i, det in enumerate(detections):
                self.get_logger().info(f'Detection {i}: type={type(det)}, keys={det.keys() if isinstance(det, dict) else "N/A"}')
                if isinstance(det, dict):
                    self.get_logger().info(f'Detection {i} content: name={det.get("name", "MISSING")}, bbox={det.get("bbox", "MISSING")}')
                    if 'name' in det and 'bbox' in det:
                        valid_detections.append(det)
                        self.get_logger().info(f'Detection {i} VALID: {det.get("name")}')
                    else:
                        self.get_logger().warn(f'Detection {i} INVALID - missing name or bbox: {det}')
                else:
                    self.get_logger().warn(f'Detection {i} INVALID - not a dict: {det}')
            
            self.get_logger().info(f'Valid detections: {len(valid_detections)} out of {len(detections)}')
            return valid_detections
            
        except json.JSONDecodeError as e:
            self.get_logger().error(f'Failed to parse VLM response as JSON: {e}')
            self.get_logger().error(f'Response: {response}')
            return []
        except Exception as e:
            self.get_logger().error(f'Error parsing VLM response: {e}')
            return []
    
    def _store_detection(self, timestamp, object_name, object_description, 
                        robot_x, robot_y, robot_z, object_x, object_y, object_z,
                        confidence, bbox, frame_id, camera_frame=None):
        """Store detection in database."""
        try:
            jpeg_bytes = None
            if camera_frame is not None:
                ret, buf = cv2.imencode('.jpg', camera_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ret:
                    jpeg_bytes = buf.tobytes()
                else:
                    self.get_logger().warn('Failed to encode camera frame as JPEG')
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO detections 
                (timestamp, object_name, object_description, robot_x, robot_y, robot_z,
                 object_x, object_y, object_z, confidence, bbox_x_min, bbox_y_min,
                 bbox_x_max, bbox_y_max, frame_id, camera_frame_jpeg)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (timestamp, object_name, object_description, robot_x, robot_y, robot_z,
                  object_x, object_y, object_z, confidence, bbox[0], bbox[1], bbox[2], bbox[3],
                  frame_id, jpeg_bytes))
            
            conn.commit()
            
            row_id = cursor.lastrowid
            self.get_logger().info(f'DB: inserted row id={row_id} for {object_name}')
            
            conn.close()
        except Exception as e:
            self.get_logger().error(f'DB insert failed for {object_name}: {e}', exc_info=True)
    
    def get_stats_callback(self, request, response):
        """Service to get database statistics."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('SELECT COUNT(*) FROM detections')
            total_count = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(DISTINCT object_name) FROM detections')
            unique_objects = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT object_name, COUNT(*) as count 
                FROM detections 
                GROUP BY object_name 
                ORDER BY count DESC 
                LIMIT 10
            ''')
            top_objects = cursor.fetchall()
            
            conn.close()
            
            stats = {
                'total_detections': total_count,
                'unique_objects': unique_objects,
                'top_objects': [{'name': obj[0], 'count': obj[1]} for obj in top_objects]
            }
            
            response.success = True
            response.message = json.dumps(stats, indent=2)
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def clear_database_callback(self, request, response):
        """Service to clear all detections from database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('DELETE FROM detections')
            conn.commit()
            conn.close()
            
            response.success = True
            response.message = 'Database cleared successfully'
            self.get_logger().info('Database cleared')
            
        except Exception as e:
            response.success = False
            response.message = f'Error: {str(e)}'
        
        return response
    
    def destroy_node(self):
        """Cleanup on shutdown."""
        self.get_logger().info('Shutting down Object Localization Node...')
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    
    try:
        node = ObjectLocalizationNode()
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

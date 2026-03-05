#!/usr/bin/env python3
import asyncio
import base64
import cv2
import httpx
import json
import message_filters
import numpy as np
import rclpy
import tf2_ros
import time
from concurrent.futures import ThreadPoolExecutor
from cv_bridge import CvBridge
from geometry_msgs.msg import PoseArray, Pose
from rclpy.node import Node
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
from sensor_msgs.msg import Image, CameraInfo
from std_msgs.msg import String
from tf2_geometry_msgs import do_transform_point
from typing import List, Dict, Tuple, Optional
from visualization_msgs.msg import Marker, MarkerArray


class Detection2D:
    def __init__(self, class_name: str, score: float, bbox: List[float]):
        self.class_name = class_name
        self.score = score
        self.bbox = bbox  # [x1, y1, x2, y2]


class CosmosClient:
    def __init__(self, base_url: str, api_key: str, model: str, endpoint_type: str, timeout_ms: int, max_retries: int,
                 max_tokens: int, logger=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.endpoint_type = endpoint_type
        self.timeout = timeout_ms / 1000.0
        self.max_retries = max_retries
        self.max_tokens = max_tokens
        self.logger = logger

        self.headers = {"Content-Type": "application/json"}
        if self.api_key:
            self.headers["Authorization"] = f"Bearer {self.api_key}"

    def _image_to_base64(self, image_bgr: np.ndarray) -> str:
        _, buffer = cv2.imencode('.jpg', image_bgr)
        return base64.b64encode(buffer).decode('utf-8')

    def detect(self, image_bgr: np.ndarray) -> List[Detection2D]:
        base64_img = self._image_to_base64(image_bgr)

        prompt = (
            "Detect people and animals in the image. Return ONLY a valid JSON array of objects, where each object has "
            "'class' (string - only 'person', 'dog', 'cat', 'animal'), 'score' (float between 0 and 1), and "
            "'bbox' (list of 4 floats: [x1, y1, x2, y2] in pixels). "
            "IGNORE museum equipment like benches, tables, exhibits, paintings, statues, flags, and furniture. "
            "ONLY detect living beings (people and animals). "
            "Do not include any markdown formatting, backticks, or explanation. Just the raw JSON array."
        )

        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_img}"
                            }
                        },
                        {"type": "text", "text": prompt}
                    ]
                }
            ]
        }

        endpoint = f"{self.base_url}/v1/chat/completions" if self.endpoint_type == "chat_completions" else f"{self.base_url}/v1/responses"

        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(endpoint, headers=self.headers, json=payload)
                    response.raise_for_status()

                    data = response.json()
                    content = ""
                    if self.endpoint_type == "chat_completions":
                        content = data.get('choices', [{}])[0].get('message', {}).get('content', '[]')
                    else:
                        content = data.get('response', '[]')

                    if self.logger:
                        self.logger.info(f"Raw model response: {content[:500]}...")  # Log first 500 chars

                    # Clean up possible markdown formatting
                    content = content.strip()
                    if content.startswith("```json"):
                        content = content[7:]
                    if content.startswith("```"):
                        content = content[3:]
                    if content.endswith("```"):
                        content = content[:-3]
                    content = content.strip()

                    if self.logger:
                        self.logger.info(f"Cleaned content: {content[:500]}...")

                    # Try to parse JSON, if it fails due to truncation, try to fix it
                    try:
                        parsed_json = json.loads(content)
                    except json.JSONDecodeError as e:
                        # Try to fix truncated JSON by closing the array
                        if self.logger:
                            self.logger.warn(f"JSON parse error, attempting to fix truncated response: {e}")

                        # Find the last complete object and close the array
                        fixed_content = content.rstrip()
                        # Remove incomplete trailing object
                        if fixed_content.endswith(','):
                            fixed_content = fixed_content[:-1]
                        elif not fixed_content.endswith(']'):
                            # Find last complete closing brace
                            last_brace = fixed_content.rfind('}')
                            if last_brace != -1:
                                fixed_content = fixed_content[:last_brace + 1]

                        # Ensure array is closed
                        if not fixed_content.endswith(']'):
                            fixed_content += ']'

                        if self.logger:
                            self.logger.info(f"Fixed JSON: {fixed_content[:500]}...")

                        parsed_json = json.loads(fixed_content)

                    if self.logger:
                        self.logger.info(f"Parsed JSON: {parsed_json}")

                    detections = []
                    for item in parsed_json:
                        detections.append(Detection2D(
                            class_name=item.get("class", "unknown"),
                            score=float(item.get("score", 0.0)),
                            bbox=item.get("bbox", [0, 0, 0, 0])
                        ))

                    if self.logger:
                        self.logger.info(f"Created {len(detections)} detections")

                    return detections

            except (httpx.RequestError, httpx.HTTPStatusError, json.JSONDecodeError) as e:
                if self.logger:
                    self.logger.error(f"Cosmos API error (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                if attempt == self.max_retries:
                    if self.logger:
                        self.logger.error(f"Cosmos API failed after {self.max_retries} retries")
                    return []
                time.sleep(0.5 * (attempt + 1))  # Backoff

        return []


class MulticamTriangulatorNode(Node):
    def __init__(self):
        super().__init__('multicam_triangulator_node')

        # --- Parameters ---
        self.declare_parameter('world_frame', 'map')
        self.world_frame = self.get_parameter('world_frame').value

        self.declare_parameter('inference_interval_ms', 500)
        self.inference_interval_ms = self.get_parameter('inference_interval_ms').value

        self.declare_parameter('min_score', 0.35)
        self.min_score = self.get_parameter('min_score').value

        self.declare_parameter('max_reprojection_error_px', 12.0)
        self.max_reprojection_error_px = self.get_parameter('max_reprojection_error_px').value

        self.declare_parameter('bbox_point', 'center')
        self.bbox_point = self.get_parameter('bbox_point').value

        self.declare_parameter('association_strategy', 'greedy')
        self.association_strategy = self.get_parameter('association_strategy').value

        self.declare_parameter('max_pairs_per_class', 50)
        self.max_pairs_per_class = self.get_parameter('max_pairs_per_class').value

        self.declare_parameter('tf_timeout_ms', 80)
        self.tf_timeout = rclpy.duration.Duration(nanoseconds=self.get_parameter('tf_timeout_ms').value * 1000000)

        # Sync params
        self.declare_parameter('approximate_sync.queue_size', 20)
        self.sync_queue_size = self.get_parameter('approximate_sync.queue_size').value
        self.declare_parameter('approximate_sync.slop_ms', 60)
        self.sync_slop = self.get_parameter('approximate_sync.slop_ms').value / 1000.0

        # Topics
        self.declare_parameter('output.detections3d_topic', '/triangulated/detections_3d')
        self.detections3d_topic = self.get_parameter('output.detections3d_topic').value
        self.declare_parameter('output.markers_topic', '/triangulated/markers')
        self.markers_topic = self.get_parameter('output.markers_topic').value
        self.declare_parameter('output.json_topic', '/triangulated/detections_json')
        self.json_topic = self.get_parameter('output.json_topic').value

        # Cosmos API params
        self.declare_parameter('cosmos_api.base_url', 'http://127.0.0.1:8000')
        self.declare_parameter('cosmos_api.api_key', '')
        self.declare_parameter('cosmos_api.model', 'cosmos-2')
        self.declare_parameter('cosmos_api.endpoint_type', 'chat_completions')
        self.declare_parameter('cosmos_api.timeout_ms', 2000)
        self.declare_parameter('cosmos_api.max_retries', 2)
        self.declare_parameter('cosmos_api.max_tokens', 512)

        self.cosmos_client = CosmosClient(
            base_url=self.get_parameter('cosmos_api.base_url').value,
            api_key=self.get_parameter('cosmos_api.api_key').value,
            model=self.get_parameter('cosmos_api.model').value,
            endpoint_type=self.get_parameter('cosmos_api.endpoint_type').value,
            timeout_ms=self.get_parameter('cosmos_api.timeout_ms').value,
            max_retries=self.get_parameter('cosmos_api.max_retries').value,
            max_tokens=self.get_parameter('cosmos_api.max_tokens').value,
            logger=self.get_logger()
        )

        # Cameras array
        # We need to read list of dicts from parameters.
        # rclpy parameter server makes reading arrays of dicts a bit tricky,
        # so we rely on reading names first, then their sub-parameters.
        self.declare_parameter('cameras', rclpy.Parameter.Type.STRING_ARRAY)
        camera_names = self.get_parameter('cameras').value

        if not camera_names or len(camera_names) < 2:
            self.get_logger().error("At least 2 cameras are required for triangulation.")
            return

        self.cameras = []
        for name in camera_names:
            prefix = f'camera_{name}.'
            self.declare_parameter(prefix + 'image_topic', '')
            self.declare_parameter(prefix + 'camera_info_topic', '')
            self.declare_parameter(prefix + 'optical_frame', '')

            cam_info = {
                'name': name,
                'image_topic': self.get_parameter(prefix + 'image_topic').value,
                'camera_info_topic': self.get_parameter(prefix + 'camera_info_topic').value,
                'optical_frame': self.get_parameter(prefix + 'optical_frame').value
            }
            self.cameras.append(cam_info)

        self.get_logger().info(f"Initialized with {len(self.cameras)} cameras: {[c['name'] for c in self.cameras]}")

        # --- Setup ROS ---
        self.tf_buffer = tf2_ros.Buffer()
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)
        self.cv_bridge = CvBridge()

        self.pub_poses = self.create_publisher(PoseArray, self.detections3d_topic, 10)
        self.pub_markers = self.create_publisher(MarkerArray, self.markers_topic, 10)
        self.pub_json = self.create_publisher(String, self.json_topic, 10)

        # Subscribers
        qos_profile = QoSProfile(
            reliability=QoSReliabilityPolicy.BEST_EFFORT,
            history=QoSHistoryPolicy.KEEP_LAST,
            depth=5
        )

        self.image_subs = []
        self.info_subs = []
        for cam in self.cameras:
            img_sub = message_filters.Subscriber(self, Image, cam['image_topic'], qos_profile=qos_profile)
            info_sub = message_filters.Subscriber(self, CameraInfo, cam['camera_info_topic'], qos_profile=qos_profile)
            self.image_subs.append(img_sub)
            self.info_subs.append(info_sub)

        # Sync all
        all_subs = self.image_subs + self.info_subs
        self.ts = message_filters.ApproximateTimeSynchronizer(all_subs, queue_size=self.sync_queue_size,
                                                              slop=self.sync_slop)
        self.ts.registerCallback(self.sync_callback)

        self.last_inference_time = self.get_clock().now()

        self.get_logger().info("MulticamTriangulatorNode initialized successfully.")

    def sync_callback(self, *args):
        now = self.get_clock().now()
        elapsed_ms = (now - self.last_inference_time).nanoseconds / 1e6

        if elapsed_ms < self.inference_interval_ms:
            return

        self.last_inference_time = now

        num_cams = len(self.cameras)
        images = args[:num_cams]
        infos = args[num_cams:]

        stamp = images[0].header.stamp  # Use first image's stamp as reference

        self.process_frames(images, infos, stamp)

    def process_frames(self, images: List[Image], infos: List[CameraInfo], stamp):
        cam_detections = []
        valid_cams = []
        transforms = []

        # 1. Fetch TFs and prepare images
        cam_data = []
        for i, (img_msg, info_msg, cam) in enumerate(zip(images, infos, self.cameras)):
            try:
                # Lookup TF - use Time(0) to get latest available transform
                # This avoids extrapolation errors with static transforms
                t = self.tf_buffer.lookup_transform(
                    self.world_frame,
                    cam['optical_frame'],
                    rclpy.time.Time(),
                    timeout=self.tf_timeout
                )

                # Convert image
                cv_img = self.cv_bridge.imgmsg_to_cv2(img_msg, desired_encoding='bgr8')

                cam_data.append({
                    'idx': i,
                    'name': cam['name'],
                    'img': cv_img,
                    'info': info_msg,
                    'transform': t,
                    'optical_frame': cam['optical_frame']
                })

            except tf2_ros.TransformException as ex:
                self.get_logger().warn(f"TF Error for {cam['name']}: {ex}")
            except Exception as e:
                self.get_logger().error(f"Error processing {cam['name']}: {e}")

        if len(cam_data) < 2:
            self.get_logger().warn("Not enough valid cameras with TF/Image to triangulate.")
            return

        # 2. Run inference in parallel
        self.get_logger().info(f"Running parallel inference on {len(cam_data)} cameras...")

        with ThreadPoolExecutor(max_workers=len(cam_data)) as executor:
            futures = {}
            for cd in cam_data:
                future = executor.submit(self.cosmos_client.detect, cd['img'])
                futures[future] = cd

            # Collect results
            for future in futures:
                cd = futures[future]
                try:
                    detections = future.result()
                    self.get_logger().info(f"Camera {cd['name']}: received {len(detections)} raw detections")

                    filtered_detections = [d for d in detections if d.score >= self.min_score]
                    self.get_logger().info(
                        f"Camera {cd['name']}: {len(filtered_detections)} detections after score filter (min_score={self.min_score})")

                    for det in filtered_detections:
                        self.get_logger().info(f"  - {det.class_name}: score={det.score:.3f}, bbox={det.bbox}")

                    # Ensure we maintain order
                    while len(cam_detections) <= cd['idx']:
                        cam_detections.append([])
                        valid_cams.append(None)

                    cam_detections[cd['idx']] = filtered_detections
                    valid_cams[cd['idx']] = (cd['info'], cd['transform'], cd['optical_frame'])

                except Exception as e:
                    self.get_logger().error(f"Inference error for {cd['name']}: {e}")
                    while len(cam_detections) <= cd['idx']:
                        cam_detections.append([])
                        valid_cams.append(None)

        if sum(1 for c in valid_cams if c is not None) < 2:
            self.get_logger().warn("Not enough valid cameras with TF/Image to triangulate.")
            return

        # 2. Extract rays for each detection
        cam_rays = []  # list of lists of (ray_origin, ray_dir, class, detection)
        for i, (dets, cam_data) in enumerate(zip(cam_detections, valid_cams)):
            rays_for_cam = []
            if cam_data is not None and dets:
                info, transform, frame_id = cam_data
                K = np.array(info.k).reshape(3, 3)
                D = np.array(info.d)

                # Get camera pose in world
                t_vec = np.array([transform.transform.translation.x,
                                  transform.transform.translation.y,
                                  transform.transform.translation.z])
                q = transform.transform.rotation

                # from quaternion to rot matrix
                r = cv2.Rodrigues(self.quat_to_rot_vec(q))[0]

                cam_center_world = t_vec

                for d in dets:
                    # Get point from bbox
                    x1, y1, x2, y2 = d.bbox
                    if self.bbox_point == 'bottom_center':
                        px, py = (x1 + x2) / 2.0, y2
                    else:  # center
                        px, py = (x1 + x2) / 2.0, (y1 + y2) / 2.0

                    pt = np.array([[[px, py]]], dtype=np.float32)

                    # Undistort
                    undistorted_pt = cv2.undistortPoints(pt, K, D)

                    # Ray in camera frame
                    ray_cam = np.array([undistorted_pt[0][0][0], undistorted_pt[0][0][1], 1.0])
                    ray_cam = ray_cam / np.linalg.norm(ray_cam)

                    # Ray in world frame
                    ray_world = r @ ray_cam
                    
                    # Debug: log first detection ray for each camera
                    if len(rays_for_cam) == 0:
                        self.get_logger().info(
                            f"Camera {i} ({frame_id}): first ray origin={cam_center_world}, dir={ray_world}, "
                            f"class={d.class_name}, px=({px:.1f},{py:.1f})"
                        )

                    rays_for_cam.append({
                        'origin': cam_center_world,
                        'dir': ray_world,
                        'class': d.class_name,
                        'score': d.score,
                        'bbox': d.bbox,
                        'px': np.array([px, py]),
                        'K': K,
                        'D': D,
                        'R': r,
                        't': t_vec,
                        'cam_idx': i
                    })
            cam_rays.append(rays_for_cam)

        # 3. Associate and Triangulate
        results = self.associate_and_triangulate(cam_rays)

        # 4. Publish results
        self.publish_results(results, stamp)

        # Log stats
        num_matched = len(results)
        total_detections = sum(len(dets) for dets in cam_detections)
        self.get_logger().info(f"Total detections across cameras: {total_detections}")
        self.get_logger().info(f"Triangulated {num_matched} objects.")

        if num_matched > 0:
            for res in results:
                self.get_logger().info(
                    f"  - {res['class']}: pos=[{res['point'][0]:.2f}, {res['point'][1]:.2f}, {res['point'][2]:.2f}], score={res['score']:.3f}, error={res['error']:.2f}px")

    def associate_and_triangulate(self, cam_rays):
        # Flatten and group by class
        class_to_rays = {}
        for c_idx, rays in enumerate(cam_rays):
            for r in rays:
                cls = r['class']
                if cls not in class_to_rays:
                    class_to_rays[cls] = []
                class_to_rays[cls].append(r)

        self.get_logger().info(f"Classes detected: {list(class_to_rays.keys())}")
        for cls, rays in class_to_rays.items():
            cam_ids = [r['cam_idx'] for r in rays]
            self.get_logger().info(f"  Class '{cls}': {len(rays)} detections from cameras {cam_ids}")

        results = []

        for cls, rays in class_to_rays.items():
            # Group rays by camera
            rays_by_cam = {}
            for r in rays:
                if r['cam_idx'] not in rays_by_cam:
                    rays_by_cam[r['cam_idx']] = []
                rays_by_cam[r['cam_idx']].append(r)

            if len(rays_by_cam) < 2:
                self.get_logger().warn(
                    f"Class '{cls}': only {len(rays_by_cam)} camera(s), need at least 2 for triangulation")
                continue  # Need at least 2 cameras for this class

            self.get_logger().info(f"Class '{cls}': attempting triangulation with {len(rays_by_cam)} cameras")

            cam_indices = list(rays_by_cam.keys())

            # Simple greedy association
            # In a full implementation for N cameras, you might use a multi-partite matching or RANSAC.
            # Here we do a pairwise greedy approach: find best pairs between cam A and B, then check if C agrees.
            # For simplicity: iterate all combinations of rays across cameras.
            import itertools

            candidates = []
            rejected_count = 0
            total_combos = 0
            min_err_seen = float('inf')

            # Create all possible combinations taking at most 1 ray per camera
            ray_lists = [rays_by_cam[idx] for idx in cam_indices]
            for combo in itertools.product(*ray_lists):
                total_combos += 1
                # Triangulate combo
                pt3d = self.triangulate_n_rays(combo)
                if pt3d is None:
                    rejected_count += 1
                    continue

                # Clamp underground objects to ground level
                if pt3d[2] < 0:
                    pt3d[2] = 0.5

                # Calculate reprojection error
                err = self.calculate_reprojection_error(pt3d, combo)
                min_err_seen = min(min_err_seen, err)

                if err <= self.max_reprojection_error_px:
                    score = sum(r['score'] for r in combo) / len(combo)
                    candidates.append((err, score, pt3d, combo))
                else:
                    rejected_count += 1

            if total_combos > 0:
                self.get_logger().info(
                    f"Class '{cls}': tested {total_combos} combinations, rejected {rejected_count}, min error seen: {min_err_seen:.2f}px")

            # Sort by error (ascending)
            candidates.sort(key=lambda x: x[0])

            self.get_logger().info(f"Class '{cls}': generated {len(candidates)} triangulation candidates")
            if len(candidates) > 0:
                self.get_logger().info(
                    f"  Best candidate: error={candidates[0][0]:.2f}px, score={candidates[0][1]:.3f}")

            # Greedy select non-overlapping
            used_rays = set()
            selected_count = 0
            for err, score, pt3d, combo in candidates:
                # Check if any ray in this combo is already used
                conflict = False
                for r in combo:
                    # Create a unique id for the ray (cam_idx, bbox_x)
                    rid = (r['cam_idx'], r['bbox'][0])
                    if rid in used_rays:
                        conflict = True
                        break

                if not conflict:
                    for r in combo:
                        used_rays.add((r['cam_idx'], r['bbox'][0]))
                    results.append({
                        'class': cls,
                        'point': pt3d,
                        'score': score,
                        'error': err
                    })
                    selected_count += 1

            self.get_logger().info(f"Class '{cls}': selected {selected_count} triangulated objects")

        return results

    def triangulate_n_rays(self, rays):
        """Least squares triangulation for N rays."""
        # Find point P that minimizes sum of squared distances to all rays.
        # Ray equation: x = o + t*d
        # We solve A*P = b
        A = np.zeros((3, 3))
        b = np.zeros(3)

        for r in rays:
            o = r['origin']
            d = r['dir']

            # I - d*d^T
            I_ddT = np.eye(3) - np.outer(d, d)
            A += I_ddT
            b += I_ddT @ o

        try:
            P = np.linalg.solve(A, b)

            # Cheirality check: is P in front of all cameras?
            for r in rays:
                vec = P - r['origin']
                if np.dot(vec, r['dir']) < 0:
                    return None  # Point is behind camera

            return P
        except np.linalg.LinAlgError:
            return None

    def calculate_reprojection_error(self, pt3d, rays):
        errors = []
        for r in rays:
            # Transform pt3d to camera frame
            R = r['R']
            t = r['t']

            # pt_cam = R^T * (pt3d - t)
            pt_cam = R.T @ (pt3d - t)

            if pt_cam[2] <= 0:
                return float('inf')  # Behind camera

            # Project
            x = pt_cam[0] / pt_cam[2]
            y = pt_cam[1] / pt_cam[2]

            # Distort (simplified, using cv2.projectPoints)
            pt3d_cv = np.array([[pt_cam]], dtype=np.float32)
            # We pass identity R and 0 t because pt_cam is already in camera frame
            rvec = np.zeros((3, 1))
            tvec = np.zeros((3, 1))
            img_pts, _ = cv2.projectPoints(pt3d_cv, rvec, tvec, r['K'], r['D'])

            proj_px = img_pts[0][0]
            orig_px = r['px']

            err = np.linalg.norm(proj_px - orig_px)
            errors.append(err)

        return np.mean(errors)

    def quat_to_rot_vec(self, q):
        import math
        # simple quat to rot vec or use scipy.spatial.transform.Rotation
        # we will use manual conversion to rotation matrix
        qx, qy, qz, qw = q.x, q.y, q.z, q.w
        R = np.array([
            [1 - 2 * qy ** 2 - 2 * qz ** 2, 2 * qx * qy - 2 * qz * qw, 2 * qx * qz + 2 * qy * qw],
            [2 * qx * qy + 2 * qz * qw, 1 - 2 * qx ** 2 - 2 * qz ** 2, 2 * qy * qz - 2 * qx * qw],
            [2 * qx * qz - 2 * qy * qw, 2 * qy * qz + 2 * qx * qw, 1 - 2 * qx ** 2 - 2 * qy ** 2]
        ])
        # convert to rot vec for rodriques
        rvec, _ = cv2.Rodrigues(R)
        return rvec

    def publish_results(self, results, stamp):
        # Publish PoseArray
        pa = PoseArray()
        pa.header.stamp = stamp
        pa.header.frame_id = self.world_frame

        # Publish MarkerArray
        ma = MarkerArray()
        
        # Prepare JSON output
        json_output = {
            "timestamp": {
                "sec": stamp.sec,
                "nanosec": stamp.nanosec
            },
            "frame_id": self.world_frame,
            "detections": []
        }

        for i, res in enumerate(results):
            p = Pose()
            p.position.x = float(res['point'][0])
            p.position.y = float(res['point'][1])
            p.position.z = float(res['point'][2])
            p.orientation.w = 1.0
            pa.poses.append(p)

            # Sphere marker
            m = Marker()
            m.header.stamp = stamp
            m.header.frame_id = self.world_frame
            m.ns = "triangulated_objects"
            m.id = i * 2
            m.type = Marker.SPHERE
            m.action = Marker.ADD
            m.pose = p
            m.scale.x = 0.2
            m.scale.y = 0.2
            m.scale.z = 0.2
            m.color.r = 0.0
            m.color.g = 1.0
            m.color.b = 0.0
            m.color.a = 0.8
            ma.markers.append(m)

            # Text marker
            t = Marker()
            t.header.stamp = stamp
            t.header.frame_id = self.world_frame
            t.ns = "triangulated_objects_labels"
            t.id = i * 2 + 1
            t.type = Marker.TEXT_VIEW_FACING
            t.action = Marker.ADD
            t.pose.position.x = p.position.x
            t.pose.position.y = p.position.y
            t.pose.position.z = p.position.z + 0.3
            t.pose.orientation.w = 1.0
            t.scale.z = 0.2
            t.color.r = 1.0
            t.color.g = 1.0
            t.color.b = 1.0
            t.color.a = 1.0
            t.text = f"{res['class']} ({res['score']:.2f})"
            ma.markers.append(t)
            
            # Add to JSON output
            json_output["detections"].append({
                "class": res['class'],
                "position": {
                    "x": float(res['point'][0]),
                    "y": float(res['point'][1]),
                    "z": float(res['point'][2])
                },
                "score": float(res['score']),
                "reprojection_error_px": float(res['error'])
            })

        self.pub_poses.publish(pa)
        self.pub_markers.publish(ma)
        
        # Publish JSON
        json_msg = String()
        json_msg.data = json.dumps(json_output, indent=2)
        self.pub_json.publish(json_msg)


def main(args=None):
    rclpy.init(args=args)
    node = MulticamTriangulatorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

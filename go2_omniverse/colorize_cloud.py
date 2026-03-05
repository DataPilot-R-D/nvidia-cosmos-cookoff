#!/usr/bin/env python3
import struct
import numpy as np

import rclpy
from rclpy.node import Node

from sensor_msgs.msg import Image, CameraInfo, PointCloud2, PointField
from sensor_msgs_py import point_cloud2

from message_filters import Subscriber, ApproximateTimeSynchronizer

import tf2_ros
from tf_transformations import quaternion_matrix
from rclpy.time import Time

def transform_to_matrix(t):
    """geometry_msgs/TransformStamped -> 4x4 matrix"""
    tr = t.transform.translation
    q = t.transform.rotation
    T = quaternion_matrix([q.x, q.y, q.z, q.w])
    T[0, 3] = tr.x
    T[1, 3] = tr.y
    T[2, 3] = tr.z
    return T


def pack_rgb(r, g, b):
    # pack into float32 the way PCL expects (rgb field as float)
    rgb_uint32 = (int(r) << 16) | (int(g) << 8) | int(b)
    return struct.unpack('f', struct.pack('I', rgb_uint32))[0]


class ColorizeCloud(Node):
    def __init__(self):
        super().__init__("colorize_cloud")

        # ---- params ----
        self.declare_parameter("cloud_in", "/robot0/point_cloud2_L1")
        self.declare_parameter("image_in", "/robot0/front_cam/rgb")
        self.declare_parameter("cinfo_in", "/robot0/front_cam/camera_info")
        self.declare_parameter("cloud_out", "/robot0/colored_cloud")
        self.declare_parameter("target_frame", "robot0/front_cam_optical_frame")
        self.declare_parameter("sync_slop", 0.15)  # seconds
        self.declare_parameter("max_points", 60000)  # safety

        cloud_in = self.get_parameter("cloud_in").value
        image_in = self.get_parameter("image_in").value
        cinfo_in = self.get_parameter("cinfo_in").value
        cloud_out = self.get_parameter("cloud_out").value
        self.target_frame = self.get_parameter("target_frame").value
        slop = float(self.get_parameter("sync_slop").value)
        self.max_points = int(self.get_parameter("max_points").value)

        # ---- tf ----
        self.tf_buffer = tf2_ros.Buffer(cache_time=rclpy.duration.Duration(seconds=10.0))
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)

        # ---- pub ----
        qos = rclpy.qos.QoSProfile(
            reliability=rclpy.qos.ReliabilityPolicy.BEST_EFFORT,
            history=rclpy.qos.HistoryPolicy.KEEP_LAST,
            depth=2
        )
        self.pub = self.create_publisher(PointCloud2, cloud_out, qos)

        # ---- sync subs ----
        self.sub_cloud = Subscriber(self, PointCloud2, cloud_in, qos_profile=qos)
        self.sub_img = Subscriber(self, Image, image_in, qos_profile=qos)
        self.sub_info = Subscriber(self, CameraInfo, cinfo_in, qos_profile=qos)

        self.ts = ApproximateTimeSynchronizer(
            [self.sub_cloud, self.sub_img, self.sub_info],
            queue_size=10,
            slop=slop
        )
        self.ts.registerCallback(self.cb)

        self.get_logger().info(f"Colorizing {cloud_in} using {image_in} + {cinfo_in} -> {cloud_out}")
        self.get_logger().info(f"Projecting into frame: {self.target_frame}")

    def cb(self, cloud: PointCloud2, img: Image, cinfo: CameraInfo):
        # Basic image checks
        if img.encoding not in ("rgb8", "bgr8"):
            self.get_logger().warn(f"Unsupported image encoding: {img.encoding} (expected rgb8/bgr8)")
            return

        W = img.width
        H = img.height
        if W == 0 or H == 0:
            return

        # Camera intrinsics
        fx = cinfo.k[0]
        fy = cinfo.k[4]
        cx = cinfo.k[2]
        cy = cinfo.k[5]

        # TF: cloud frame -> camera optical frame at cloud timestamp
        try:
            tf = self.tf_buffer.lookup_transform(
                self.target_frame,
                cloud.header.frame_id,
                Time(),  # latest available
                timeout=rclpy.duration.Duration(seconds=0.2)
            )
        except Exception as e:
            self.get_logger().warn(f"TF lookup failed {cloud.header.frame_id} -> {self.target_frame}: {e}")
            return

        T = transform_to_matrix(tf)

        # Image buffer -> numpy
        img_np = np.frombuffer(img.data, dtype=np.uint8).reshape((H, W, 3))

        # Read points (x,y,z)
        
        pts = []
        for p in point_cloud2.read_points(cloud, field_names=("x", "y", "z"), skip_nans=True):
            # p może być tuple albo structured record – obsłużmy oba
            try:
                x, y, z = float(p[0]), float(p[1]), float(p[2])
            except Exception:
                x, y, z = float(p['x']), float(p['y']), float(p['z'])
            pts.append((x, y, z))
            if len(pts) >= self.max_points:
                break

        if not pts:
            return

        pts = np.array(pts, dtype=np.float32)  # Nx3

        # Transform to camera frame
        ones = np.ones((pts.shape[0], 1), dtype=np.float32)
        pts_h = np.hstack([pts, ones])  # Nx4
        cam = (T @ pts_h.T).T  # Nx4

        X = cam[:, 0]
        Y = cam[:, 1]
        Z = cam[:, 2]

        # Keep points in front of camera
        valid = Z > 0.05
        X = X[valid]; Y = Y[valid]; Z = Z[valid]
        if X.size == 0:
            return

        # Project
        u = (fx * (X / Z) + cx).astype(np.int32)
        v = (fy * (Y / Z) + cy).astype(np.int32)

        in_img = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        u = u[in_img]; v = v[in_img]
        X = X[in_img]; Y = Y[in_img]; Z = Z[in_img]

        if u.size == 0:
            return

        # Sample color
        colors = img_np[v, u, :]  # Nx3
        if img.encoding == "bgr8":
            b = colors[:, 0]; g = colors[:, 1]; r = colors[:, 2]
        else:
            r = colors[:, 0]; g = colors[:, 1]; b = colors[:, 2]

        # Build colored points in camera frame (x,y,z,rgb)
        out_points = []
        for i in range(u.size):
            out_points.append((float(X[i]), float(Y[i]), float(Z[i]), pack_rgb(r[i], g[i], b[i])))

        fields = [
            PointField(name="x", offset=0, datatype=PointField.FLOAT32, count=1),
            PointField(name="y", offset=4, datatype=PointField.FLOAT32, count=1),
            PointField(name="z", offset=8, datatype=PointField.FLOAT32, count=1),
            PointField(name="rgb", offset=12, datatype=PointField.FLOAT32, count=1),
        ]

        out = point_cloud2.create_cloud(cloud.header, fields, out_points)
        out.header.frame_id = self.target_frame  # points are in camera frame now
        self.pub.publish(out)


def main():
    rclpy.init()
    node = ColorizeCloud()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()

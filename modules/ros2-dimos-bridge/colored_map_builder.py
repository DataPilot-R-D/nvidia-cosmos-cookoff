#!/usr/bin/env python3
import struct
import numpy as np

import rclpy
from rclpy.node import Node
from rclpy.time import Time

from sensor_msgs.msg import Image, CameraInfo, PointCloud2, PointField
from sensor_msgs_py import point_cloud2

from message_filters import Subscriber, ApproximateTimeSynchronizer

import tf2_ros
from tf_transformations import quaternion_matrix


def transform_to_matrix(t):
    tr = t.transform.translation
    q = t.transform.rotation
    T = quaternion_matrix([q.x, q.y, q.z, q.w])
    T[0, 3] = tr.x
    T[1, 3] = tr.y
    T[2, 3] = tr.z
    return T


def pack_rgb(r, g, b):
    rgb_uint32 = (int(r) << 16) | (int(g) << 8) | int(b)
    return struct.unpack('f', struct.pack('I', rgb_uint32))[0]


class ColoredMapBuilder(Node):
    def __init__(self):
        super().__init__("colored_map_builder")

        # topics
        self.declare_parameter("cloud_in", "/robot0/point_cloud2_L1")
        self.declare_parameter("image_in", "/robot0/front_cam/rgb")
        self.declare_parameter("cinfo_in", "/robot0/front_cam/camera_info")

        # frames
        self.declare_parameter("camera_frame", "robot0/front_cam_optical_frame")
        self.declare_parameter("map_frame", "map")

        # output
        self.declare_parameter("cloud_out", "/colored_cloud_map")
        self.declare_parameter("publish_every_n", 1)

        # perf/quality
        self.declare_parameter("sync_slop", 0.15)
        self.declare_parameter("max_points", 60000)
        self.declare_parameter("voxel_size", 0.08)  # meters (0 disables voxel)

        cloud_in = self.get_parameter("cloud_in").value
        image_in = self.get_parameter("image_in").value
        cinfo_in = self.get_parameter("cinfo_in").value

        self.camera_frame = self.get_parameter("camera_frame").value
        self.map_frame = self.get_parameter("map_frame").value
        cloud_out = self.get_parameter("cloud_out").value

        slop = float(self.get_parameter("sync_slop").value)
        self.max_points = int(self.get_parameter("max_points").value)
        self.voxel = float(self.get_parameter("voxel_size").value)
        self.publish_every_n = int(self.get_parameter("publish_every_n").value)

        # TF
        self.tf_buffer = tf2_ros.Buffer(cache_time=rclpy.duration.Duration(seconds=30.0))
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)

        qos = rclpy.qos.QoSProfile(
            reliability=rclpy.qos.ReliabilityPolicy.BEST_EFFORT,
            history=rclpy.qos.HistoryPolicy.KEEP_LAST,
            depth=2
        )
        self.pub = self.create_publisher(PointCloud2, cloud_out, qos)

        # sync
        self.sub_cloud = Subscriber(self, PointCloud2, cloud_in, qos_profile=qos)
        self.sub_img = Subscriber(self, Image, image_in, qos_profile=qos)
        self.sub_info = Subscriber(self, CameraInfo, cinfo_in, qos_profile=qos)

        self.ts = ApproximateTimeSynchronizer(
            [self.sub_cloud, self.sub_img, self.sub_info],
            queue_size=10,
            slop=slop
        )
        self.ts.registerCallback(self.cb)

        # map store: dict[(vx,vy,vz)] -> (x,y,z,r,g,b,count)
        self.grid = {}
        self.counter = 0

        self.get_logger().info(f"Building colored map in frame '{self.map_frame}' -> {cloud_out}")
        self.get_logger().info(f"Inputs: {cloud_in}, {image_in}, {cinfo_in}")
        self.get_logger().info(f"camera_frame={self.camera_frame} voxel_size={self.voxel} max_points={self.max_points}")

    def cb(self, cloud: PointCloud2, img: Image, cinfo: CameraInfo):
        if img.encoding not in ("rgb8", "bgr8"):
            self.get_logger().warn(f"Unsupported image encoding: {img.encoding}")
            return

        W, H = img.width, img.height
        if W == 0 or H == 0:
            return

        fx, fy, cx, cy = cinfo.k[0], cinfo.k[4], cinfo.k[2], cinfo.k[5]

        # use latest TF (avoid future extrapolation)
        try:
            tf_lidar_to_cam = self.tf_buffer.lookup_transform(
                self.camera_frame, cloud.header.frame_id, Time(),
                timeout=rclpy.duration.Duration(seconds=0.2)
            )
            tf_cam_to_map = self.tf_buffer.lookup_transform(
                self.map_frame, self.camera_frame, Time(),
                timeout=rclpy.duration.Duration(seconds=0.2)
            )
        except Exception as e:
            self.get_logger().warn(f"TF lookup failed: {e}")
            return

        T_lc = transform_to_matrix(tf_lidar_to_cam)
        T_cm = transform_to_matrix(tf_cam_to_map)

        img_np = np.frombuffer(img.data, dtype=np.uint8).reshape((H, W, 3))

        # read points robustly
        pts = []
        for p in point_cloud2.read_points(cloud, field_names=("x", "y", "z"), skip_nans=True):
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
        ones = np.ones((pts.shape[0], 1), dtype=np.float32)
        pts_h = np.hstack([pts, ones])  # Nx4

        # lidar -> cam
        cam = (T_lc @ pts_h.T).T
        X, Y, Z = cam[:, 0], cam[:, 1], cam[:, 2]

        # in front
        valid = Z > 0.05
        X, Y, Z = X[valid], Y[valid], Z[valid]
        if X.size == 0:
            return

        # project
        u = (fx * (X / Z) + cx).astype(np.int32)
        v = (fy * (Y / Z) + cy).astype(np.int32)
        in_img = (u >= 0) & (u < W) & (v >= 0) & (v < H)

        u = u[in_img]; v = v[in_img]
        X = X[in_img]; Y = Y[in_img]; Z = Z[in_img]
        if u.size == 0:
            return

        colors = img_np[v, u, :]
        if img.encoding == "bgr8":
            b = colors[:, 0]; g = colors[:, 1]; r = colors[:, 2]
        else:
            r = colors[:, 0]; g = colors[:, 1]; b = colors[:, 2]

        # cam -> map points
        cam_pts = np.stack([X, Y, Z, np.ones_like(Z)], axis=1).astype(np.float32)  # Nx4
        mp = (T_cm @ cam_pts.T).T  # Nx4

        # accumulate to voxel grid
        if self.voxel > 0.0:
            vx = np.floor(mp[:, 0] / self.voxel).astype(np.int32)
            vy = np.floor(mp[:, 1] / self.voxel).astype(np.int32)
            vz = np.floor(mp[:, 2] / self.voxel).astype(np.int32)
        else:
            # no voxel => treat every point as unique cell (heavy)
            vx = np.arange(mp.shape[0], dtype=np.int32)
            vy = np.zeros_like(vx)
            vz = np.zeros_like(vx)

        for i in range(mp.shape[0]):
            key = (int(vx[i]), int(vy[i]), int(vz[i]))
            x, y, z = float(mp[i, 0]), float(mp[i, 1]), float(mp[i, 2])
            ri, gi, bi = int(r[i]), int(g[i]), int(b[i])

            if key not in self.grid:
                self.grid[key] = [x, y, z, ri, gi, bi, 1]
            else:
                cur = self.grid[key]
                c = cur[6] + 1
                # running average
                cur[0] = cur[0] + (x - cur[0]) / c
                cur[1] = cur[1] + (y - cur[1]) / c
                cur[2] = cur[2] + (z - cur[2]) / c
                cur[3] = int(cur[3] + (ri - cur[3]) / c)
                cur[4] = int(cur[4] + (gi - cur[4]) / c)
                cur[5] = int(cur[5] + (bi - cur[5]) / c)
                cur[6] = c

        self.counter += 1
        if self.counter % self.publish_every_n != 0:
            return

        # publish accumulated map
        out_pts = []
        for (vxk, vyk, vzk), (x, y, z, ri, gi, bi, cnt) in self.grid.items():
            out_pts.append((x, y, z, pack_rgb(ri, gi, bi)))

        fields = [
            PointField(name="x", offset=0, datatype=PointField.FLOAT32, count=1),
            PointField(name="y", offset=4, datatype=PointField.FLOAT32, count=1),
            PointField(name="z", offset=8, datatype=PointField.FLOAT32, count=1),
            PointField(name="rgb", offset=12, datatype=PointField.FLOAT32, count=1),
        ]
        header = cloud.header
        header.frame_id = self.map_frame
        out = point_cloud2.create_cloud(header, fields, out_pts)
        self.pub.publish(out)


def main():
    rclpy.init()
    node = ColoredMapBuilder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()

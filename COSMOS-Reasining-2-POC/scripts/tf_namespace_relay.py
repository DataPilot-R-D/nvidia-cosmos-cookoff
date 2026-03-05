#!/usr/bin/env python3
"""TF namespace relay: republishes robot0/* TF frames without the namespace prefix.

Isaac Sim publishes TF with robot0/ namespace (robot0/base_link, robot0/odom),
but Nav2 and SRAS nodes expect bare frame IDs (base_link, odom, map).

This node subscribes to /tf and /tf_static, strips the 'robot0/' prefix from
both parent and child frame_id, and republishes on the same topics.
"""
from __future__ import annotations

import rclpy
from rclpy.node import Node
from tf2_msgs.msg import TFMessage


NAMESPACE_PREFIX = "robot0/"


class TFNamespaceRelay(Node):
    def __init__(self) -> None:
        super().__init__("tf_namespace_relay")
        self.declare_parameter("source_prefix", NAMESPACE_PREFIX)
        self.prefix = str(self.get_parameter("source_prefix").value)

        self.tf_pub = self.create_publisher(TFMessage, "/tf", 100)
        self.tf_static_pub = self.create_publisher(TFMessage, "/tf_static", 100)

        self.create_subscription(TFMessage, "/tf", self._on_tf, 100)
        self.create_subscription(TFMessage, "/tf_static", self._on_tf_static, 100)

        self.get_logger().info(f"TF namespace relay started: stripping '{self.prefix}' prefix")

    def _strip_prefix(self, frame_id: str) -> str:
        clean = frame_id.strip("/")
        if clean.startswith(self.prefix.strip("/")):
            return clean[len(self.prefix.strip("/")):]
        return ""  # empty = don't republish

    def _relay(self, msg: TFMessage, publisher) -> None:
        relayed = TFMessage()
        for t in msg.transforms:
            parent = self._strip_prefix(t.header.frame_id)
            child = self._strip_prefix(t.child_frame_id)
            if not parent or not child:
                continue
            # Skip if already bare (avoid echo loop)
            if t.header.frame_id.strip("/") == parent and t.child_frame_id.strip("/") == child:
                continue
            from copy import deepcopy
            new_t = deepcopy(t)
            new_t.header.frame_id = parent
            new_t.child_frame_id = child
            relayed.transforms.append(new_t)
        if relayed.transforms:
            publisher.publish(relayed)

    def _on_tf(self, msg: TFMessage) -> None:
        self._relay(msg, self.tf_pub)

    def _on_tf_static(self, msg: TFMessage) -> None:
        self._relay(msg, self.tf_static_pub)


def main(args=None):
    rclpy.init(args=args)
    node = TFNamespaceRelay()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

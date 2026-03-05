from __future__ import annotations

from typing import Any

from .scenario_config import CCTVCameraConfig


def create_cctv_ros_graph(og: Any, camera_config: CCTVCameraConfig, camera_index: int) -> str:
    """Create a ROS2 camera graph for one CCTV camera.

    Returns the render product path that can be reused by callers.
    """

    try:
        import omni.replicator.core as rep
    except ImportError as exc:
        raise RuntimeError("Isaac Sim omni.replicator.core is required for ROS graph setup") from exc

    graph_path = f"/ROS2CCTV/Camera{camera_index}"
    topic_prefix = camera_config.topic_prefix.rstrip("/")
    image_topic = f"{topic_prefix}/cam{camera_index}/image_raw"
    camera_info_topic = f"{topic_prefix}/cam{camera_index}/camera_info"

    render_product = rep.create.render_product(camera_config.prim_path, camera_config.resolution)

    keys = og.Controller.Keys
    og.Controller.edit(
        {"graph_path": graph_path, "evaluator_name": "execution"},
        {
            keys.CREATE_NODES: [
                ("Tick", "omni.graph.action.OnPlaybackTick"),
                ("Context", "omni.isaac.ros2_bridge.ROS2Context"),
                ("RgbPublisher", "omni.isaac.ros2_bridge.ROS2CameraHelper"),
                ("CameraInfoPublisher", "omni.isaac.ros2_bridge.ROS2CameraHelper"),
            ],
            keys.CONNECT: [
                ("Tick.outputs:tick", "RgbPublisher.inputs:execIn"),
                ("Tick.outputs:tick", "CameraInfoPublisher.inputs:execIn"),
                ("Context.outputs:context", "RgbPublisher.inputs:context"),
                ("Context.outputs:context", "CameraInfoPublisher.inputs:context"),
            ],
            keys.SET_VALUES: [
                ("RgbPublisher.inputs:renderProductPath", render_product.path),
                ("RgbPublisher.inputs:topicName", image_topic),
                ("RgbPublisher.inputs:type", "rgb"),
                ("RgbPublisher.inputs:frameId", camera_config.frame_id),
                ("CameraInfoPublisher.inputs:renderProductPath", render_product.path),
                ("CameraInfoPublisher.inputs:topicName", camera_info_topic),
                ("CameraInfoPublisher.inputs:type", "camera_info"),
                ("CameraInfoPublisher.inputs:frameId", camera_config.frame_id),
            ],
        },
    )

    return render_product.path


__all__ = ["create_cctv_ros_graph"]

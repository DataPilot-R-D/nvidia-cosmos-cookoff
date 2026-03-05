# Copyright (c) 2024, RoboVerse community
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


import omni
import omni.graph.core as og


def create_cctv_omnigraph(cctv_num):
    """Define the OmniGraph for a static CCTV camera streaming RGB to ROS2."""

    keys = og.Controller.Keys

    graph_path = f"/ROS_cctv{cctv_num}"
    og.Controller.edit(
        {
            "graph_path": graph_path,
            "evaluator_name": "execution",
            "pipeline_stage": og.GraphPipelineStage.GRAPH_PIPELINE_STAGE_SIMULATION,
        },
        {
            keys.CREATE_NODES: [
                ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
                ("IsaacCreateRenderProduct", "isaacsim.core.nodes.IsaacCreateRenderProduct"),
                ("ROS2CameraHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2CameraInfoHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
            ],
            keys.SET_VALUES: [
                ("IsaacCreateRenderProduct.inputs:cameraPrim", f"/World/cctv_{cctv_num}/camera"),
                ("IsaacCreateRenderProduct.inputs:enabled", True),
                ("IsaacCreateRenderProduct.inputs:width", 640),
                ("IsaacCreateRenderProduct.inputs:height", 480),
                ("ROS2CameraHelper.inputs:type", "rgb"),
                ("ROS2CameraHelper.inputs:topicName", f"cctv{cctv_num}/rgb"),
                ("ROS2CameraHelper.inputs:frameId", f"cctv{cctv_num}_optical_frame"),
                ("ROS2CameraInfoHelper.inputs:type", "camera_info"),
                ("ROS2CameraInfoHelper.inputs:topicName", f"cctv{cctv_num}/camera_info"),
                ("ROS2CameraInfoHelper.inputs:frameId", f"cctv{cctv_num}_optical_frame"),
            ],
            keys.CONNECT: [
                ("OnPlaybackTick.outputs:tick", "IsaacCreateRenderProduct.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:execOut", "ROS2CameraHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2CameraHelper.inputs:renderProductPath"),
                ("OnPlaybackTick.outputs:tick", "ROS2CameraInfoHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2CameraInfoHelper.inputs:renderProductPath"),
            ],
        },
    )


def create_g1_front_cam_omnigraph(robot_num):
    """Define the OmniGraph for the G1 humanoid front camera streaming RGB to ROS2."""

    keys = og.Controller.Keys

    graph_path = f"/ROS_g1_front_cam{robot_num}"
    og.Controller.edit(
        {
            "graph_path": graph_path,
            "evaluator_name": "execution",
            "pipeline_stage": og.GraphPipelineStage.GRAPH_PIPELINE_STAGE_SIMULATION,
        },
        {
            keys.CREATE_NODES: [
                ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
                (
                    "IsaacCreateRenderProduct",
                    "isaacsim.core.nodes.IsaacCreateRenderProduct",
                ),
                ("ROS2CameraHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2CameraInfoHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2DepthHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
            ],
            keys.SET_VALUES: [
                (
                    "IsaacCreateRenderProduct.inputs:cameraPrim",
                    f"/World/envs/env_{robot_num}/G1Robot/head_link/front_cam",
                ),
                ("IsaacCreateRenderProduct.inputs:enabled", True),
                ("IsaacCreateRenderProduct.inputs:width", 640),
                ("IsaacCreateRenderProduct.inputs:height", 360),
                ("ROS2CameraHelper.inputs:type", "rgb"),
                (
                    "ROS2CameraHelper.inputs:topicName",
                    f"g1_{robot_num}/front_cam/rgb",
                ),
                ("ROS2CameraHelper.inputs:frameId", f"g1_{robot_num}/front_cam_optical_frame"),
                ("ROS2CameraInfoHelper.inputs:type", "camera_info"),
                ("ROS2CameraInfoHelper.inputs:topicName", f"g1_{robot_num}/front_cam/camera_info"),
                ("ROS2CameraInfoHelper.inputs:frameId", f"g1_{robot_num}/front_cam_optical_frame"),
                ("ROS2DepthHelper.inputs:type", "depth"),
                ("ROS2DepthHelper.inputs:topicName", f"g1_{robot_num}/front_cam/depth"),
                ("ROS2DepthHelper.inputs:frameId", f"g1_{robot_num}/front_cam_optical_frame"),
            ],
            keys.CONNECT: [
                (
                    "OnPlaybackTick.outputs:tick",
                    "IsaacCreateRenderProduct.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:execOut",
                    "ROS2CameraHelper.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:renderProductPath",
                    "ROS2CameraHelper.inputs:renderProductPath",
                ),
                ("OnPlaybackTick.outputs:tick", "ROS2CameraInfoHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2CameraInfoHelper.inputs:renderProductPath"),
                ("OnPlaybackTick.outputs:tick", "ROS2DepthHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2DepthHelper.inputs:renderProductPath"),
            ],
        },
    )


def create_front_cam_omnigraph(robot_num):
    """Define the OmniGraph for the Isaac Sim environment."""

    keys = og.Controller.Keys

    graph_path = f"/ROS_" + f"front_cam{robot_num}"
    og.Controller.edit(
        {
            "graph_path": graph_path,
            "evaluator_name": "execution",
            "pipeline_stage": og.GraphPipelineStage.GRAPH_PIPELINE_STAGE_SIMULATION,
        },
        {
            keys.CREATE_NODES: [
                ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
                (
                    "IsaacCreateRenderProduct",
                    "isaacsim.core.nodes.IsaacCreateRenderProduct",
                ),
                ("ROS2CameraHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2CameraInfoHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2DepthHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
            ],
            keys.SET_VALUES: [
                (
                    "IsaacCreateRenderProduct.inputs:cameraPrim",
                    f"/World/envs/env_{robot_num}/Robot/base/front_cam",
                ),
                ("IsaacCreateRenderProduct.inputs:enabled", True),
                ("IsaacCreateRenderProduct.inputs:width", 640),
                ("IsaacCreateRenderProduct.inputs:height", 360),
                ("ROS2CameraHelper.inputs:type", "rgb"),
                (
                    "ROS2CameraHelper.inputs:topicName",
                    f"robot{robot_num}/front_cam/rgb",
                ),
                ("ROS2CameraHelper.inputs:frameId", f"robot{robot_num}/front_cam_optical_frame"),
                ("ROS2CameraInfoHelper.inputs:type", "camera_info"),
                ("ROS2CameraInfoHelper.inputs:topicName", f"robot{robot_num}/front_cam/camera_info"),
                ("ROS2CameraInfoHelper.inputs:frameId", f"robot{robot_num}/front_cam_optical_frame"),
                ("ROS2DepthHelper.inputs:type", "depth"),
                ("ROS2DepthHelper.inputs:topicName", f"robot{robot_num}/front_cam/depth"),
                ("ROS2DepthHelper.inputs:frameId", f"robot{robot_num}/front_cam_optical_frame"),
            ],
            keys.CONNECT: [
                (
                    "OnPlaybackTick.outputs:tick",
                    "IsaacCreateRenderProduct.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:execOut",
                    "ROS2CameraHelper.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:renderProductPath",
                    "ROS2CameraHelper.inputs:renderProductPath",
                ),
                ("OnPlaybackTick.outputs:tick", "ROS2CameraInfoHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2CameraInfoHelper.inputs:renderProductPath"),
                ("OnPlaybackTick.outputs:tick", "ROS2DepthHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2DepthHelper.inputs:renderProductPath"),
            ],
        },
    )


def create_h1_front_cam_omnigraph(robot_num):
    """Define the OmniGraph for the H1 humanoid front camera streaming RGB to ROS2."""

    keys = og.Controller.Keys

    graph_path = f"/ROS_h1_front_cam{robot_num}"
    og.Controller.edit(
        {
            "graph_path": graph_path,
            "evaluator_name": "execution",
            "pipeline_stage": og.GraphPipelineStage.GRAPH_PIPELINE_STAGE_SIMULATION,
        },
        {
            keys.CREATE_NODES: [
                ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
                (
                    "IsaacCreateRenderProduct",
                    "isaacsim.core.nodes.IsaacCreateRenderProduct",
                ),
                ("ROS2CameraHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2CameraInfoHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ("ROS2DepthHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
            ],
            keys.SET_VALUES: [
                (
                    "IsaacCreateRenderProduct.inputs:cameraPrim",
                    f"/World/envs/env_{robot_num}/H1Robot/torso_link/front_cam",
                ),
                ("IsaacCreateRenderProduct.inputs:enabled", True),
                ("IsaacCreateRenderProduct.inputs:width", 640),
                ("IsaacCreateRenderProduct.inputs:height", 360),
                ("ROS2CameraHelper.inputs:type", "rgb"),
                (
                    "ROS2CameraHelper.inputs:topicName",
                    f"h1_{robot_num}/front_cam/rgb",
                ),
                ("ROS2CameraHelper.inputs:frameId", f"h1_{robot_num}/front_cam_optical_frame"),
                ("ROS2CameraInfoHelper.inputs:type", "camera_info"),
                ("ROS2CameraInfoHelper.inputs:topicName", f"h1_{robot_num}/front_cam/camera_info"),
                ("ROS2CameraInfoHelper.inputs:frameId", f"h1_{robot_num}/front_cam_optical_frame"),
                ("ROS2DepthHelper.inputs:type", "depth"),
                ("ROS2DepthHelper.inputs:topicName", f"h1_{robot_num}/front_cam/depth"),
                ("ROS2DepthHelper.inputs:frameId", f"h1_{robot_num}/front_cam_optical_frame"),
            ],
            keys.CONNECT: [
                (
                    "OnPlaybackTick.outputs:tick",
                    "IsaacCreateRenderProduct.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:execOut",
                    "ROS2CameraHelper.inputs:execIn",
                ),
                (
                    "IsaacCreateRenderProduct.outputs:renderProductPath",
                    "ROS2CameraHelper.inputs:renderProductPath",
                ),
                ("OnPlaybackTick.outputs:tick", "ROS2CameraInfoHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2CameraInfoHelper.inputs:renderProductPath"),
                ("OnPlaybackTick.outputs:tick", "ROS2DepthHelper.inputs:execIn"),
                ("IsaacCreateRenderProduct.outputs:renderProductPath", "ROS2DepthHelper.inputs:renderProductPath"),
            ],
        },
    )

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description() -> LaunchDescription:
    config_arg = DeclareLaunchArgument(
        "config_file",
        default_value=PathJoinSubstitution(
            [
                FindPackageShare("sras_lidar_camera_fusion"),
                "config",
                "lidar_camera_fusion.yaml",
            ]
        ),
        description="Path to lidar-camera fusion parameter YAML file.",
    )

    node = Node(
        package="sras_lidar_camera_fusion",
        executable="lidar_camera_fusion_node",
        name="sras_lidar_camera_fusion",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

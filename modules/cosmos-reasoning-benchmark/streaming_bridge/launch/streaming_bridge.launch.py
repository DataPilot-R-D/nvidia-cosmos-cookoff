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
                FindPackageShare("sras_streaming_bridge"),
                "config",
                "streaming_bridge.yaml",
            ]
        ),
        description="Path to streaming bridge parameter YAML file.",
    )

    node = Node(
        package="sras_streaming_bridge",
        executable="streaming_bridge_node",
        name="sras_streaming_bridge",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

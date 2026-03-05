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
                FindPackageShare("sras_map_readiness_gate"),
                "config",
                "map_readiness_gate.yaml",
            ]
        ),
        description="Path to map readiness gate parameter YAML file.",
    )

    node = Node(
        package="sras_map_readiness_gate",
        executable="map_readiness_gate_node",
        name="sras_map_readiness_gate",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

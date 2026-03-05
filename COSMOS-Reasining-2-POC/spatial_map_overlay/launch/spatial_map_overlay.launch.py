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
                FindPackageShare("sras_spatial_map_overlay"),
                "config",
                "spatial_map_overlay.yaml",
            ]
        ),
        description="Path to spatial map overlay parameter YAML file.",
    )

    node = Node(
        package="sras_spatial_map_overlay",
        executable="spatial_map_overlay_node",
        name="sras_spatial_map_overlay",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

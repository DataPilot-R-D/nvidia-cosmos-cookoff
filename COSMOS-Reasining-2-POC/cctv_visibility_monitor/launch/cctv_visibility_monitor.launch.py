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
                FindPackageShare("sras_cctv_visibility_monitor"),
                "config",
                "cctv_visibility_monitor.yaml",
            ]
        ),
        description="Path to CCTV visibility monitor parameter YAML file.",
    )

    node = Node(
        package="sras_cctv_visibility_monitor",
        executable="cctv_visibility_monitor_node",
        name="sras_cctv_visibility_monitor",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

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
                FindPackageShare("sras_hotl_command_surface"),
                "config",
                "hotl_command_surface.yaml",
            ]
        ),
        description="Path to HOTL command surface parameter YAML file.",
    )

    node = Node(
        package="sras_hotl_command_surface",
        executable="hotl_command_surface_node",
        name="sras_hotl_command_surface",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

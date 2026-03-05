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
                FindPackageShare("sras_dynamic_blindspot_gen"),
                "config",
                "dynamic_blindspot_gen.yaml",
            ]
        ),
        description="Path to dynamic blindspot generator parameter YAML file.",
    )

    node = Node(
        package="sras_dynamic_blindspot_gen",
        executable="dynamic_blindspot_gen_node",
        name="sras_dynamic_blindspot_gen",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

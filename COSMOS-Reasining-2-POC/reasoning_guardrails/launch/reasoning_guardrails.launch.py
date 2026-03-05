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
                FindPackageShare("sras_reasoning_guardrails"),
                "config",
                "reasoning_guardrails.yaml",
            ]
        ),
        description="Path to reasoning guardrails parameter YAML file.",
    )

    node = Node(
        package="sras_reasoning_guardrails",
        executable="reasoning_guardrails_node",
        name="sras_reasoning_guardrails",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

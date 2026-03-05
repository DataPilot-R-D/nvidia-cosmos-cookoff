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
                FindPackageShare("sras_robot_situation_assessor"),
                "config",
                "robot_situation_assessor.yaml",
            ]
        ),
        description="Path to robot situation assessor parameter YAML file.",
    )

    node = Node(
        package="sras_robot_situation_assessor",
        executable="robot_situation_assessor_node",
        name="sras_robot_situation_assessor",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

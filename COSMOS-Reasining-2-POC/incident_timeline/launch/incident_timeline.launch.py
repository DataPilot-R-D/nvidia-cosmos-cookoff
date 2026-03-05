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
                FindPackageShare("sras_incident_timeline"),
                "config",
                "incident_timeline.yaml",
            ]
        ),
        description="Path to incident timeline parameter YAML file.",
    )

    node = Node(
        package="sras_incident_timeline",
        executable="incident_timeline_node",
        name="sras_incident_timeline",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

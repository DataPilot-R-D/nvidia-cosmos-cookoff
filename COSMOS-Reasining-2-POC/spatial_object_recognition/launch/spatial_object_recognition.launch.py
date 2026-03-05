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
                FindPackageShare("sras_spatial_object_recognition"),
                "config",
                "spatial_object_recognition.yaml",
            ]
        ),
        description="Path to spatial object recognition parameter YAML file.",
    )

    node = Node(
        package="sras_spatial_object_recognition",
        executable="spatial_object_recognition_node",
        name="sras_spatial_object_recognition",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

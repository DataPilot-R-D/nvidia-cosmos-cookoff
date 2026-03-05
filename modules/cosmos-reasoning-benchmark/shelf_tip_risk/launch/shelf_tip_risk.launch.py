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
                FindPackageShare("sras_shelf_tip_risk"),
                "config",
                "shelf_tip_risk.yaml",
            ]
        ),
        description="Path to shelf tip-risk parameter YAML file.",
    )

    node = Node(
        package="sras_shelf_tip_risk",
        executable="shelf_tip_risk_node",
        name="sras_shelf_tip_risk",
        output="screen",
        parameters=[LaunchConfiguration("config_file")],
    )

    return LaunchDescription([config_arg, node])

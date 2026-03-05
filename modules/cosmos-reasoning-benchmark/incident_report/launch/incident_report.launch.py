from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description() -> LaunchDescription:
    return LaunchDescription(
        [
            Node(
                package="sras_incident_report",
                executable="incident_report_node",
                name="sras_incident_report",
                output="screen",
                parameters=["config/incident_report.yaml"],
            )
        ]
    )

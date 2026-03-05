from launch import LaunchDescription
from launch_ros.actions import Node
import os
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    pkg_dir = get_package_share_directory('dimos_vlm_bridge')
    config_file = os.path.join(pkg_dir, 'config', 'multicam_triangulator.yaml')

    node = Node(
        package='dimos_vlm_bridge',
        executable='multicam_triangulator_node',
        name='multicam_triangulator_node',
        output='screen',
        parameters=[config_file]
    )

    return LaunchDescription([node])

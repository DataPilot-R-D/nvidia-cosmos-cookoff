from setuptools import setup
from glob import glob
import os

package_name = 'dimos_vlm_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.py')),
        (os.path.join('share', package_name, 'config'), glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Your Name',
    maintainer_email='you@example.com',
    description='ROS2 bridge for DimOS VLM Temporal and Spatial Memory analysis',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'temporal_memory_node = dimos_vlm_bridge.temporal_memory_node:main',
            'spatial_memory_node = dimos_vlm_bridge.spatial_memory_node:main',
            'combined_memory_node = dimos_vlm_bridge.combined_memory_node:main',
            'vlm_query_service = dimos_vlm_bridge.vlm_query_service:main',
            'autonomous_explorer = dimos_vlm_bridge.autonomous_explorer:main',
            'object_localization_node = dimos_vlm_bridge.object_localization_node:main',
        ],
    },
)

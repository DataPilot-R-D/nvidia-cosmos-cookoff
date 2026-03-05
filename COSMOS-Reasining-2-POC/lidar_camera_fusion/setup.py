from setuptools import find_packages, setup

package_name = "sras_lidar_camera_fusion"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/lidar_camera_fusion.launch.py"]),
        (f"share/{package_name}/config", ["config/lidar_camera_fusion.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 LiDAR + camera fusion package for 2D/3D detection benchmarking.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "lidar_camera_fusion_node = sras_lidar_camera_fusion.lidar_camera_fusion_node:main",
        ],
    },
)

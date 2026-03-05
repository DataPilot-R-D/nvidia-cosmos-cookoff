from setuptools import find_packages, setup

package_name = "sras_spatial_object_recognition"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/spatial_object_recognition.launch.py"]),
        (f"share/{package_name}/config", ["config/spatial_object_recognition.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 spatial object recognition package for fused semantic detections.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "spatial_object_recognition_node = "
            "sras_spatial_object_recognition.spatial_object_recognition_node:main",
        ],
    },
)

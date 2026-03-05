from setuptools import find_packages, setup

package_name = "sras_streaming_bridge"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/streaming_bridge.launch.py"]),
        (f"share/{package_name}/config", ["config/streaming_bridge.yaml", "config/go2rtc.yaml", "config/go2rtc.service"]),
        (f"share/{package_name}/docs", ["docs/INSTALL.md"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 image-to-RTSP bridge and go2rtc deployment package.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "streaming_bridge_node = sras_streaming_bridge.streaming_bridge_node:main",
        ],
    },
)

from setuptools import find_packages, setup

package_name = "sras_hitl_command_bridge"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/hitl_command_bridge.launch.py"]),
        (f"share/{package_name}/config", ["config/hitl_command_bridge.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 HITL command bridge for task state transitions from dashboard operators.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "hitl_command_bridge_node = sras_hitl_command_bridge.hitl_command_bridge_node:main",
        ],
    },
)

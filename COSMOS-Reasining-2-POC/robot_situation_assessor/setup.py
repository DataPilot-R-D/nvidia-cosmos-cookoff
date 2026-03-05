from setuptools import find_packages, setup

package_name = "sras_robot_situation_assessor"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/robot_situation_assessor.launch.py"]),
        (f"share/{package_name}/config", ["config/robot_situation_assessor.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 robot situation assessor for incident risk reasoning and operator alerting.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "robot_situation_assessor_node = "
            "sras_robot_situation_assessor.robot_situation_assessor_node:main",
        ],
    },
)

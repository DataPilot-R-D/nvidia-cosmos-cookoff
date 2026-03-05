from setuptools import find_packages, setup

package_name = "sras_incident_timeline"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/incident_timeline.launch.py"]),
        (f"share/{package_name}/config", ["config/incident_timeline.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="Incident timeline and system status aggregation feed for ROS2 warehouse operations.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "incident_timeline_node = sras_incident_timeline.incident_timeline_node:main",
        ],
    },
)

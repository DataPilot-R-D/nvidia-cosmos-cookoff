from setuptools import find_packages, setup

package_name = "sras_incident_report"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/incident_report.launch.py"]),
        (f"share/{package_name}/config", ["config/incident_report.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="Incident summary report generation package for ROS2 warehouse response workflows.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "incident_report_node = sras_incident_report.incident_report_node:main",
        ],
    },
)

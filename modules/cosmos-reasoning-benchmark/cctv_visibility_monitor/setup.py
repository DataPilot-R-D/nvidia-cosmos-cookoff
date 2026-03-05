from setuptools import find_packages, setup

package_name = "sras_cctv_visibility_monitor"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/cctv_visibility_monitor.launch.py"]),
        (f"share/{package_name}/config", ["config/cctv_visibility_monitor.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 CCTV visibility monitor for blind-spot detection and zone coverage reasoning.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "cctv_visibility_monitor_node = "
            "sras_cctv_visibility_monitor.cctv_visibility_monitor_node:main",
        ],
    },
)

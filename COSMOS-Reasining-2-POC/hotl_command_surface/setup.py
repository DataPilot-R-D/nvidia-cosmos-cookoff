from setuptools import find_packages, setup

package_name = "sras_hotl_command_surface"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/hotl_command_surface.launch.py"]),
        (f"share/{package_name}/config", ["config/hotl_command_surface.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 HOTL command surface for operator intervention in robot task execution.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "hotl_command_surface_node = sras_hotl_command_surface.hotl_command_surface_node:main",
        ],
    },
)

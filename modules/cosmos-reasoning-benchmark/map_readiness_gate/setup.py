from setuptools import find_packages, setup

package_name = "sras_map_readiness_gate"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/map_readiness_gate.launch.py"]),
        (f"share/{package_name}/config", ["config/map_readiness_gate.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 map readiness and localization gate with explicit navigation readiness status.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "map_readiness_gate_node = "
            "sras_map_readiness_gate.map_readiness_gate_node:main",
        ],
    },
)

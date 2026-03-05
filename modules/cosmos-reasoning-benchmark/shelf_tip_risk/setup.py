from setuptools import find_packages, setup

package_name = "sras_shelf_tip_risk"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/shelf_tip_risk.launch.py"]),
        (f"share/{package_name}/config", ["config/shelf_tip_risk.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="Shelf tip-risk heuristic package for ROS2 warehouse demo narratives.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "shelf_tip_risk_node = sras_shelf_tip_risk.shelf_tip_risk_node:main",
        ],
    },
)

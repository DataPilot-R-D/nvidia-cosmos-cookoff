from setuptools import find_packages, setup

package_name = "sras_patrol_scheduler"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/patrol_scheduler.launch.py"]),
        (f"share/{package_name}/config", ["config/patrol_scheduler.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="Periodic patrol task scheduler for predefined warehouse routes.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "patrol_scheduler_node = sras_patrol_scheduler.patrol_scheduler_node:main",
        ],
    },
)

from setuptools import find_packages, setup

package_name = "sras_event_injector"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/event_injector.launch.py"]),
        (f"share/{package_name}/config", ["config/event_injector.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 event injector for scripted and manual camera blindspot events.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "event_injector_node = sras_event_injector.event_injector_node:main",
        ],
    },
)

from setuptools import find_packages, setup

package_name = "sras_reasoning_guardrails"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/reasoning_guardrails.launch.py"]),
        (f"share/{package_name}/config", ["config/reasoning_guardrails.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="ROS2 reasoning guardrails for safe task decisions and operator escalation.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "reasoning_guardrails_node = "
            "sras_reasoning_guardrails.guardrails_node:main",
        ],
    },
)

from setuptools import find_packages, setup

package_name = "sras_spatial_map_overlay"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (f"share/{package_name}/launch", ["launch/spatial_map_overlay.launch.py"]),
        (f"share/{package_name}/config", ["config/spatial_map_overlay.yaml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="SRAS Team",
    maintainer_email="maintainer@example.com",
    description="3D spatial scene aggregation for dashboard map overlay rendering.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "spatial_map_overlay_node = sras_spatial_map_overlay.spatial_map_overlay_node:main",
        ],
    },
)

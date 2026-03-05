from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SpotLightConfig:
    prim_path: str
    position: tuple[float, float, float]
    rotation_xyz_deg: tuple[float, float, float]
    intensity: float = 3500.0
    color_temperature: float = 3000.0
    cone_angle_deg: float = 35.0


@dataclass
class SceneObjectConfig:
    prim_path: str
    translation: tuple[float, float, float]
    rotation_xyz_deg: tuple[float, float, float]


@dataclass
class WarehouseConfig:
    warehouse_usd: str = (
        "https://omniverse-content-production.s3-us-west-2.amazonaws.com/Assets/Isaac/4.5/"
        "Isaac/Environments/Simple_Warehouse/warehouse.usd"
    )
    warehouse_prim_path: str = "/World/Warehouse"
    robot_prim_path: str = "/World/Go2"
    robot_spawn_xyz: tuple[float, float, float] = (2.0, 2.0, 0.45)
    robot_spawn_rpy_deg: tuple[float, float, float] = (0.0, 0.0, 90.0)

    ambient_intensity: float = 0.05
    spot_lights: list[SpotLightConfig] = field(
        default_factory=lambda: [
            SpotLightConfig(
                prim_path="/World/Lights/Spot_A",
                position=(5.0, 3.0, 4.0),
                rotation_xyz_deg=(-70.0, 0.0, -20.0),
            ),
            SpotLightConfig(
                prim_path="/World/Lights/Spot_B",
                position=(11.0, -1.0, 4.3),
                rotation_xyz_deg=(-68.0, 0.0, 30.0),
            ),
            SpotLightConfig(
                prim_path="/World/Lights/Spot_C",
                position=(16.0, 5.0, 4.1),
                rotation_xyz_deg=(-72.0, 0.0, -10.0),
            ),
        ]
    )

    shelf: SceneObjectConfig = field(
        default_factory=lambda: SceneObjectConfig(
            prim_path="/World/Interactables/Shelf",
            translation=(6.2, 1.4, 0.75),
            rotation_xyz_deg=(0.0, 0.0, 0.0),
        )
    )
    shelf_tilt_deg: float = 18.0

    window: SceneObjectConfig = field(
        default_factory=lambda: SceneObjectConfig(
            prim_path="/World/Interactables/Window",
            translation=(9.8, -4.4, 2.2),
            rotation_xyz_deg=(0.0, 0.0, 0.0),
        )
    )
    window_open_offset_m: float = 0.8

    camera_prim_path: str = "/World/Go2/base/front_cam"
    camera_resolution: tuple[int, int] = (640, 480)
    camera_topic: str = "/camera/image_raw"
    camera_info_topic: str = "/camera/camera_info"
    camera_frame: str = "go2_front_cam_optical_frame"

    lidar_config_name: str = "Unitree_L1"
    lidar_config_file: str = "Isaac_sim/Unitree/Unitree_L1.json"
    lidar_prim_path: str = "/World/Go2/base/lidar_sensor"
    lidar_translation: tuple[float, float, float] = (0.293, 0.0, -0.08)
    lidar_orientation_xyzw: tuple[float, float, float, float] = (
        0.0,
        0.9914449,
        0.0,
        0.1305262,
    )

    patrol_waypoints: list[tuple[float, float, float]] = field(
        default_factory=lambda: [
            (2.0, 2.0, 0.0),
            (6.0, 2.5, 0.0),
            (10.5, 1.5, 0.0),
            (14.0, -1.5, 0.0),
            (9.0, -3.0, 0.0),
            (4.0, -1.0, 0.0),
        ]
    )

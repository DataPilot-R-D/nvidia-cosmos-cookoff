from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CCTVCameraConfig:
    prim_path: str
    position: tuple[float, float, float]
    rotation_xyz_deg: tuple[float, float, float]
    resolution: tuple[int, int] = (1280, 720)
    focal_length: float = 24.0
    topic_prefix: str = "/cctv"
    frame_id: str = "cctv_cam"

    def validate(self) -> None:
        if len(self.position) != 3:
            raise ValueError("camera position must have 3 elements")
        if len(self.rotation_xyz_deg) != 3:
            raise ValueError("camera rotation_xyz_deg must have 3 elements")
        if len(self.resolution) != 2 or self.resolution[0] <= 0 or self.resolution[1] <= 0:
            raise ValueError("camera resolution must be positive width x height")
        if self.focal_length <= 0:
            raise ValueError("camera focal_length must be > 0")
        if not self.prim_path:
            raise ValueError("camera prim_path is required")


@dataclass
class OccluderConfig:
    prim_path: str
    start_position: tuple[float, float, float]
    blocking_position: tuple[float, float, float]
    scale: tuple[float, float, float]
    label: str = "forklift"

    def validate(self) -> None:
        if len(self.start_position) != 3 or len(self.blocking_position) != 3:
            raise ValueError("occluder positions must each have 3 elements")
        if self.start_position == self.blocking_position:
            raise ValueError("occluder start_position and blocking_position must differ")
        if len(self.scale) != 3 or any(v <= 0 for v in self.scale):
            raise ValueError("occluder scale must be positive XYZ")
        if not self.prim_path:
            raise ValueError("occluder prim_path is required")


@dataclass
class DemoNarrativeConfig:
    """Timing for the scripted demo sequence."""

    phase_1_normal_s: float = 10.0
    phase_2_occlude_s: float = 8.0
    phase_3_window_open_s: float = 6.0
    phase_4_dispatch_s: float = 10.0
    loop: bool = True

    def validate(self) -> None:
        for key, value in (
            ("phase_1_normal_s", self.phase_1_normal_s),
            ("phase_2_occlude_s", self.phase_2_occlude_s),
            ("phase_3_window_open_s", self.phase_3_window_open_s),
            ("phase_4_dispatch_s", self.phase_4_dispatch_s),
        ):
            if value <= 0:
                raise ValueError(f"{key} must be > 0")


@dataclass
class WarehouseScenarioConfig:
    warehouse_usd: str = (
        "https://omniverse-content-production.s3-us-west-2.amazonaws.com/Assets/Isaac/4.5/"
        "Isaac/Environments/Simple_Warehouse/warehouse.usd"
    )
    warehouse_prim_path: str = "/World/Warehouse"

    robot_prim_path: str = "/World/Go2"
    robot_spawn_xyz: tuple[float, float, float] = (2.0, 2.0, 0.45)
    robot_spawn_rpy_deg: tuple[float, float, float] = (0.0, 0.0, 90.0)

    shelf_prim_path: str = "/World/Interactables/Shelf"
    shelf_translation: tuple[float, float, float] = (6.2, 1.4, 0.75)
    shelf_tilt_deg: float = 18.0
    window_prim_path: str = "/World/Interactables/Window"
    window_translation: tuple[float, float, float] = (9.8, -4.4, 2.2)
    window_open_offset_m: float = 0.8

    cctv_cameras: list[CCTVCameraConfig] = field(
        default_factory=lambda: [
            CCTVCameraConfig(
                prim_path="/World/CCTV/EntranceCam",
                position=(1.5, -6.0, 3.2),
                rotation_xyz_deg=(15.0, 0.0, 35.0),
                frame_id="cctv_entrance",
            ),
            CCTVCameraConfig(
                prim_path="/World/CCTV/LoadingDockCam",
                position=(11.2, -5.5, 3.1),
                rotation_xyz_deg=(18.0, 0.0, 145.0),
                frame_id="cctv_loading_dock",
            ),
            CCTVCameraConfig(
                prim_path="/World/CCTV/AisleACam",
                position=(6.8, 1.5, 2.8),
                rotation_xyz_deg=(20.0, 0.0, -90.0),
                frame_id="cctv_aisle_a",
            ),
            CCTVCameraConfig(
                prim_path="/World/CCTV/RearWallCam",
                position=(12.0, 4.2, 3.4),
                rotation_xyz_deg=(20.0, 0.0, -140.0),
                frame_id="cctv_rear_wall",
            ),
        ]
    )

    occluder: OccluderConfig = field(
        default_factory=lambda: OccluderConfig(
            prim_path="/World/Actors/ForkliftOccluder",
            start_position=(3.8, -1.2, 0.95),
            blocking_position=(5.5, -2.1, 0.95),
            scale=(1.6, 0.9, 1.9),
            label="forklift",
        )
    )

    narrative: DemoNarrativeConfig = field(default_factory=DemoNarrativeConfig)

    patrol_waypoints: list[tuple[float, float, float]] = field(
        default_factory=lambda: [
            (2.0, 2.0, 0.45),
            (4.0, 3.8, 0.45),
            (8.2, 3.8, 0.45),
            (10.5, 1.2, 0.45),
            (8.2, -2.8, 0.45),
            (3.0, -1.8, 0.45),
        ]
    )

    light_positions: list[tuple[float, float, float]] = field(
        default_factory=lambda: [
            (3.0, -2.0, 6.0),
            (8.0, 0.0, 6.0),
            (11.0, 3.0, 6.0),
        ]
    )

    light_intensity: float = 20000.0

    def validate(self) -> None:
        if not self.warehouse_usd:
            raise ValueError("warehouse_usd is required")
        if len(self.robot_spawn_xyz) != 3 or len(self.robot_spawn_rpy_deg) != 3:
            raise ValueError("robot spawn pose must have 3 values for xyz and rpy")
        if len(self.shelf_translation) != 3 or len(self.window_translation) != 3:
            raise ValueError("shelf/window translations must have 3 values")
        if self.window_open_offset_m <= 0:
            raise ValueError("window_open_offset_m must be > 0")
        if self.shelf_tilt_deg <= 0:
            raise ValueError("shelf_tilt_deg must be > 0")
        if len(self.cctv_cameras) != 4:
            raise ValueError("exactly 4 CCTV cameras are required")

        for camera in self.cctv_cameras:
            camera.validate()

        self.occluder.validate()
        self.narrative.validate()

        if not self.patrol_waypoints:
            raise ValueError("patrol_waypoints must be non-empty")

        for waypoint in self.patrol_waypoints:
            if len(waypoint) != 3:
                raise ValueError("each patrol waypoint must have xyz")

        if len(self.light_positions) != 3:
            raise ValueError("expected 3 spot light positions")
        if self.light_intensity <= 0:
            raise ValueError("light_intensity must be > 0")


__all__ = [
    "CCTVCameraConfig",
    "OccluderConfig",
    "DemoNarrativeConfig",
    "WarehouseScenarioConfig",
]

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Sequence


@dataclass(frozen=True)
class CoverageZone:
    zone_id: str
    camera_ids: list[str]
    polygon: list[list[float]]
    min_coverage_ratio: float
    critical: bool
    description: str


@dataclass(frozen=True)
class CameraFOV:
    camera_id: str
    position: tuple[float, float, float]
    fov_h_deg: float
    fov_v_deg: float
    orientation_deg: float
    range_m: float


@dataclass(frozen=True)
class OverlapZone:
    zone_id: str
    camera_ids: list[str]
    polygon: list[list[float]]
    description: str


WAREHOUSE_CAMERAS: list[CameraFOV] = [
    CameraFOV(
        camera_id="cam1",
        position=(1.5, -6.0, 3.2),
        fov_h_deg=92.0,
        fov_v_deg=56.0,
        orientation_deg=35.0,
        range_m=14.0,
    ),
    CameraFOV(
        camera_id="cam2",
        position=(11.2, -5.5, 3.1),
        fov_h_deg=90.0,
        fov_v_deg=54.0,
        orientation_deg=145.0,
        range_m=14.0,
    ),
    CameraFOV(
        camera_id="cam3",
        position=(6.8, 1.5, 2.8),
        fov_h_deg=88.0,
        fov_v_deg=52.0,
        orientation_deg=-90.0,
        range_m=13.0,
    ),
    CameraFOV(
        camera_id="cam4",
        position=(12.0, 4.2, 3.4),
        fov_h_deg=94.0,
        fov_v_deg=58.0,
        orientation_deg=-140.0,
        range_m=12.0,
    ),
]


COVERAGE_ZONES: list[CoverageZone] = [
    CoverageZone(
        zone_id="entrance_zone",
        camera_ids=["cam1"],
        polygon=[[0.2, -7.2], [3.1, -7.2], [3.1, -4.1], [0.2, -4.1]],
        min_coverage_ratio=0.55,
        critical=True,
        description="Warehouse front entrance and guard checkpoint.",
    ),
    CoverageZone(
        zone_id="loading_dock",
        camera_ids=["cam2"],
        polygon=[[9.3, -6.8], [13.0, -6.8], [13.0, -3.2], [9.3, -3.2]],
        min_coverage_ratio=0.60,
        critical=True,
        description="Loading dock lanes and truck transfer area.",
    ),
    CoverageZone(
        zone_id="main_aisle",
        camera_ids=["cam3", "cam1"],
        polygon=[[3.4, -2.4], [8.8, -2.4], [8.8, 2.7], [3.4, 2.7]],
        min_coverage_ratio=0.50,
        critical=False,
        description="Primary movement corridor through the warehouse floor.",
    ),
    CoverageZone(
        zone_id="shelf_zone",
        camera_ids=["cam3", "cam4"],
        polygon=[[7.1, 0.6], [11.5, 0.6], [11.5, 4.4], [7.1, 4.4]],
        min_coverage_ratio=0.65,
        critical=True,
        description="High-value shelving and picker lanes.",
    ),
    CoverageZone(
        zone_id="rear_area",
        camera_ids=["cam4"],
        polygon=[[9.4, 2.2], [13.3, 2.2], [13.3, 5.8], [9.4, 5.8]],
        min_coverage_ratio=0.45,
        critical=False,
        description="Rear wall staging and maintenance area.",
    ),
]


def compute_overlap_zones(cameras: Sequence[CameraFOV], zones: Sequence[CoverageZone]) -> list[OverlapZone]:
    camera_ids = {camera.camera_id for camera in cameras}
    overlaps: list[OverlapZone] = []

    for zone in zones:
        present = [camera_id for camera_id in zone.camera_ids if camera_id in camera_ids]
        if len(set(present)) < 2:
            continue
        overlaps.append(
            OverlapZone(
                zone_id=zone.zone_id,
                camera_ids=sorted(set(present)),
                polygon=zone.polygon,
                description=zone.description,
            )
        )

    return overlaps


def generate_ros2_zone_params(zones: Sequence[CoverageZone]) -> list[str]:
    params: list[str] = []
    for zone in zones:
        payload = {
            "zone_id": zone.zone_id,
            "camera_ids": zone.camera_ids,
            "polygon": zone.polygon,
            "min_coverage_ratio": zone.min_coverage_ratio,
            "critical": zone.critical,
            "description": zone.description,
        }
        params.append(json.dumps(payload, separators=(",", ":")))
    return params


def generate_full_config_yaml(cameras: Sequence[CameraFOV], zones: Sequence[CoverageZone]) -> str:
    zone_entries = generate_ros2_zone_params(zones)
    lines = [
        "sras_cctv_visibility_monitor:",
        "  ros__parameters:",
        "    cctv_image_topics:",
    ]

    for camera in sorted(cameras, key=lambda cam: cam.camera_id):
        lines.append(f"      - /cctv/{camera.camera_id}/image_raw")

    lines.extend(
        [
            "    check_interval_s: 2.0",
            "    blind_threshold_s: 5.0",
            "    coverage_warning_threshold: 0.3",
            "    blindspot_events_topic: /reasoning/blindspot_events",
            "    asset_states_topic: /perception/asset_states",
            "    zones:",
        ]
    )

    for zone_str in zone_entries:
        escaped = zone_str.replace('"', '\\"')
        lines.append(f'      - "{escaped}"')

    return "\n".join(lines) + "\n"


__all__ = [
    "CameraFOV",
    "CoverageZone",
    "OverlapZone",
    "WAREHOUSE_CAMERAS",
    "COVERAGE_ZONES",
    "compute_overlap_zones",
    "generate_ros2_zone_params",
    "generate_full_config_yaml",
]

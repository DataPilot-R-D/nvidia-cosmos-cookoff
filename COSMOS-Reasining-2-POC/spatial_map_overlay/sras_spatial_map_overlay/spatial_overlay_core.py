from __future__ import annotations

import json
import math
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Vec3:
    x: float
    y: float
    z: float


@dataclass(frozen=True, slots=True)
class Quaternion:
    x: float
    y: float
    z: float
    w: float = 1.0


@dataclass(frozen=True, slots=True)
class Pose3D:
    position: Vec3
    orientation: Quaternion = field(default_factory=lambda: Quaternion(0.0, 0.0, 0.0, 1.0))


@dataclass(frozen=True, slots=True)
class CameraFOV:
    camera_id: str
    pose: Pose3D
    fov_h_deg: float
    fov_v_deg: float
    range_m: float
    is_active: bool = True


@dataclass(frozen=True, slots=True)
class RobotState:
    robot_id: str
    pose: Pose3D
    battery_pct: float = 100.0
    status: str = "idle"
    velocity: Vec3 = field(default_factory=lambda: Vec3(0.0, 0.0, 0.0))


@dataclass(frozen=True, slots=True)
class DetectionMarker:
    marker_id: str
    label: str
    position: Vec3
    confidence: float
    severity: int = 0
    timestamp_s: float = 0.0


@dataclass(slots=True)
class WarehouseLayout:
    layout_id: str
    bounds_min: Vec3
    bounds_max: Vec3
    zones: list[dict]


@dataclass(slots=True)
class SceneState:
    timestamp_s: float
    layout: WarehouseLayout
    cameras: list[CameraFOV]
    robots: list[RobotState]
    markers: list[DetectionMarker]
    active_alerts: list[dict]


def _zone_rect(zone_id: str, x0: float, y0: float, x1: float, y1: float, color: str) -> dict:
    return {
        "zone_id": zone_id,
        "color": color,
        "polygon": [
            {"x": x0, "y": y0, "z": 0.0},
            {"x": x1, "y": y0, "z": 0.0},
            {"x": x1, "y": y1, "z": 0.0},
            {"x": x0, "y": y1, "z": 0.0},
        ],
    }


DEFAULT_WAREHOUSE = WarehouseLayout(
    layout_id="warehouse_default",
    bounds_min=Vec3(0.0, 0.0, 0.0),
    bounds_max=Vec3(30.0, 20.0, 5.0),
    zones=[
        _zone_rect("zone_a", 0.0, 0.0, 10.0, 10.0, "#1f77b4"),
        _zone_rect("zone_b", 10.0, 0.0, 20.0, 10.0, "#2ca02c"),
        _zone_rect("zone_c", 20.0, 0.0, 30.0, 10.0, "#ff7f0e"),
        _zone_rect("zone_d", 0.0, 10.0, 15.0, 20.0, "#d62728"),
        _zone_rect("zone_e", 15.0, 10.0, 30.0, 20.0, "#17becf"),
    ],
)


DEFAULT_CAMERAS = [
    CameraFOV(
        camera_id="cam_north",
        pose=Pose3D(position=Vec3(15.0, 20.0, 3.0)),
        fov_h_deg=90.0,
        fov_v_deg=60.0,
        range_m=15.0,
    ),
    CameraFOV(
        camera_id="cam_south",
        pose=Pose3D(position=Vec3(15.0, 0.0, 3.0)),
        fov_h_deg=90.0,
        fov_v_deg=60.0,
        range_m=15.0,
    ),
    CameraFOV(
        camera_id="cam_east",
        pose=Pose3D(position=Vec3(30.0, 10.0, 3.0)),
        fov_h_deg=90.0,
        fov_v_deg=60.0,
        range_m=15.0,
    ),
    CameraFOV(
        camera_id="cam_west",
        pose=Pose3D(position=Vec3(0.0, 10.0, 3.0)),
        fov_h_deg=90.0,
        fov_v_deg=60.0,
        range_m=15.0,
    ),
]


def build_scene_state(
    timestamp_s: float,
    layout: WarehouseLayout,
    cameras: list[CameraFOV],
    robots: list[RobotState],
    markers: list[DetectionMarker],
    alerts: list[dict],
) -> SceneState:
    return SceneState(
        timestamp_s=float(timestamp_s),
        layout=layout,
        cameras=list(cameras),
        robots=list(robots),
        markers=list(markers),
        active_alerts=list(alerts),
    )


def _vec3_to_dict(value: Vec3) -> dict:
    return {"x": float(value.x), "y": float(value.y), "z": float(value.z)}


def _quat_to_dict(value: Quaternion) -> dict:
    return {"x": float(value.x), "y": float(value.y), "z": float(value.z), "w": float(value.w)}


def _pose_to_dict(value: Pose3D) -> dict:
    return {"position": _vec3_to_dict(value.position), "orientation": _quat_to_dict(value.orientation)}


def scene_to_dict(scene: SceneState) -> dict:
    return {
        "timestamp_s": float(scene.timestamp_s),
        "layout": {
            "layout_id": scene.layout.layout_id,
            "bounds_min": _vec3_to_dict(scene.layout.bounds_min),
            "bounds_max": _vec3_to_dict(scene.layout.bounds_max),
            "zones": list(scene.layout.zones),
        },
        "cameras": [
            {
                "camera_id": cam.camera_id,
                "pose": _pose_to_dict(cam.pose),
                "fov_h_deg": float(cam.fov_h_deg),
                "fov_v_deg": float(cam.fov_v_deg),
                "range_m": float(cam.range_m),
                "is_active": bool(cam.is_active),
                "frustum": compute_camera_frustum(cam),
            }
            for cam in scene.cameras
        ],
        "robots": [
            {
                "robot_id": robot.robot_id,
                "pose": _pose_to_dict(robot.pose),
                "battery_pct": float(robot.battery_pct),
                "status": robot.status,
                "velocity": _vec3_to_dict(robot.velocity),
            }
            for robot in scene.robots
        ],
        "markers": [
            {
                "marker_id": marker.marker_id,
                "label": marker.label,
                "position": _vec3_to_dict(marker.position),
                "confidence": float(marker.confidence),
                "severity": int(marker.severity),
                "timestamp_s": float(marker.timestamp_s),
            }
            for marker in scene.markers
        ],
        "active_alerts": list(scene.active_alerts),
    }


def scene_to_json(scene: SceneState) -> str:
    return json.dumps(scene_to_dict(scene), sort_keys=True)


def filter_markers_by_age(
    markers: list[DetectionMarker],
    max_age_s: float,
    current_time_s: float,
) -> list[DetectionMarker]:
    return [
        marker
        for marker in markers
        if (float(current_time_s) - float(marker.timestamp_s)) <= float(max_age_s)
    ]


def _quat_rotate(v: Vec3, q: Quaternion) -> Vec3:
    qx, qy, qz, qw = q.x, q.y, q.z, q.w
    tx = 2.0 * (qy * v.z - qz * v.y)
    ty = 2.0 * (qz * v.x - qx * v.z)
    tz = 2.0 * (qx * v.y - qy * v.x)
    rx = v.x + qw * tx + (qy * tz - qz * ty)
    ry = v.y + qw * ty + (qz * tx - qx * tz)
    rz = v.z + qw * tz + (qx * ty - qy * tx)
    return Vec3(rx, ry, rz)


def _world_point(pose: Pose3D, local_point: Vec3) -> Vec3:
    rotated = _quat_rotate(local_point, pose.orientation)
    return Vec3(
        pose.position.x + rotated.x,
        pose.position.y + rotated.y,
        pose.position.z + rotated.z,
    )


def compute_camera_frustum(camera: CameraFOV) -> dict:
    near_d = min(0.5, max(0.1, camera.range_m * 0.05))
    far_d = max(camera.range_m, near_d)
    h_half_near = math.tan(math.radians(camera.fov_h_deg / 2.0)) * near_d
    v_half_near = math.tan(math.radians(camera.fov_v_deg / 2.0)) * near_d
    h_half_far = math.tan(math.radians(camera.fov_h_deg / 2.0)) * far_d
    v_half_far = math.tan(math.radians(camera.fov_v_deg / 2.0)) * far_d

    near_local = [
        Vec3(near_d, -h_half_near, -v_half_near),
        Vec3(near_d, h_half_near, -v_half_near),
        Vec3(near_d, h_half_near, v_half_near),
        Vec3(near_d, -h_half_near, v_half_near),
    ]
    far_local = [
        Vec3(far_d, -h_half_far, -v_half_far),
        Vec3(far_d, h_half_far, -v_half_far),
        Vec3(far_d, h_half_far, v_half_far),
        Vec3(far_d, -h_half_far, v_half_far),
    ]

    return {
        "camera_id": camera.camera_id,
        "near_distance_m": near_d,
        "far_distance_m": far_d,
        "near_corners": [_vec3_to_dict(_world_point(camera.pose, p)) for p in near_local],
        "far_corners": [_vec3_to_dict(_world_point(camera.pose, p)) for p in far_local],
    }


def _point_in_polygon_2d(point_x: float, point_y: float, polygon: list[dict]) -> bool:
    inside = False
    if len(polygon) < 3:
        return False

    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi = float(polygon[i].get("x", 0.0))
        yi = float(polygon[i].get("y", 0.0))
        xj = float(polygon[j].get("x", 0.0))
        yj = float(polygon[j].get("y", 0.0))

        intersects = (yi > point_y) != (yj > point_y)
        if intersects:
            x_cross = ((xj - xi) * (point_y - yi)) / ((yj - yi) or 1e-12) + xi
            if point_x < x_cross:
                inside = not inside
        j = i

    return inside


def compute_scene_summary(scene: SceneState) -> dict:
    zone_counts: dict[str, int] = {str(zone.get("zone_id", "unknown")): 0 for zone in scene.layout.zones}
    for marker in scene.markers:
        for zone in scene.layout.zones:
            zone_id = str(zone.get("zone_id", "unknown"))
            polygon = zone.get("polygon", [])
            if _point_in_polygon_2d(marker.position.x, marker.position.y, polygon):
                zone_counts[zone_id] += 1
                break

    total_markers = len(scene.markers)
    zones = []
    for zone in scene.layout.zones:
        zone_id = str(zone.get("zone_id", "unknown"))
        count = zone_counts.get(zone_id, 0)
        zones.append(
            {
                "zone_id": zone_id,
                "marker_count": count,
                "coverage_pct": 0.0 if total_markers == 0 else round((count / total_markers) * 100.0, 2),
            }
        )

    return {
        "camera_count": len(scene.cameras),
        "robot_count": len(scene.robots),
        "marker_count": total_markers,
        "alert_count": len(scene.active_alerts),
        "active_cameras": sum(1 for camera in scene.cameras if camera.is_active),
        "zone_coverage": zones,
    }

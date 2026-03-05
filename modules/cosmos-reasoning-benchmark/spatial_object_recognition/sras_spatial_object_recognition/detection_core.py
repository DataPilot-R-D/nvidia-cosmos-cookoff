from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class Detection2D:
    label: str
    confidence: float
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    source_camera_id: str
    timestamp_s: float


@dataclass
class Detection3D:
    label: str
    confidence: float
    position_x: float
    position_y: float
    position_z: float
    source_camera_ids: list[str]
    detection_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "detection_id": self.detection_id,
            "label": self.label,
            "confidence": self.confidence,
            "position": {
                "x": self.position_x,
                "y": self.position_y,
                "z": self.position_z,
            },
            "source_camera_ids": list(self.source_camera_ids),
        }


def _sample_depth(depth_image: Any, pixel_x: int, pixel_y: int) -> float:
    if depth_image is None:
        return 1.0
    try:
        value = depth_image[pixel_y][pixel_x]
    except (IndexError, KeyError, TypeError):
        return 1.0
    try:
        depth = float(value)
    except (TypeError, ValueError):
        return 1.0
    if not math.isfinite(depth) or depth <= 0.0:
        return 1.0
    return depth


def _quat_rotate_xyz(vector: tuple[float, float, float], q: dict[str, float]) -> tuple[float, float, float]:
    x, y, z = vector
    qx = float(q.get("x", 0.0))
    qy = float(q.get("y", 0.0))
    qz = float(q.get("z", 0.0))
    qw = float(q.get("w", 1.0))

    # v' = v + 2*cross(q_xyz, cross(q_xyz, v) + qw*v)
    tx = 2.0 * (qy * z - qz * y)
    ty = 2.0 * (qz * x - qx * z)
    tz = 2.0 * (qx * y - qy * x)
    rx = x + qw * tx + (qy * tz - qz * ty)
    ry = y + qw * ty + (qz * tx - qx * tz)
    rz = z + qw * tz + (qx * ty - qy * tx)
    return (rx, ry, rz)


def _apply_transform(
    point: tuple[float, float, float],
    camera_to_map_transform: dict[str, Any] | None,
) -> tuple[float, float, float]:
    if camera_to_map_transform is None:
        return point

    if "matrix" in camera_to_map_transform:
        matrix = camera_to_map_transform["matrix"]
        x, y, z = point
        px = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3]
        py = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3]
        pz = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3]
        return (float(px), float(py), float(pz))

    translation = camera_to_map_transform.get("translation", {})
    rotation = camera_to_map_transform.get("rotation", {})
    rotated = _quat_rotate_xyz(point, rotation)
    return (
        rotated[0] + float(translation.get("x", 0.0)),
        rotated[1] + float(translation.get("y", 0.0)),
        rotated[2] + float(translation.get("z", 0.0)),
    )


def project_2d_to_3d(
    detection_2d: Detection2D,
    depth_image: Any,
    camera_intrinsics: dict[str, float] | None,
    camera_to_map_transform: dict[str, Any] | None,
) -> Detection3D:
    intrinsics = camera_intrinsics or {}
    fx = float(intrinsics.get("fx", 1.0))
    fy = float(intrinsics.get("fy", 1.0))
    cx = float(intrinsics.get("cx", 0.0))
    cy = float(intrinsics.get("cy", 0.0))
    if fx == 0.0:
        fx = 1.0
    if fy == 0.0:
        fy = 1.0

    center_u = detection_2d.bbox_x + detection_2d.bbox_w * 0.5
    center_v = detection_2d.bbox_y + detection_2d.bbox_h * 0.5
    z = _sample_depth(depth_image, int(round(center_u)), int(round(center_v)))
    x = ((center_u - cx) * z) / fx
    y = ((center_v - cy) * z) / fy
    map_x, map_y, map_z = _apply_transform((x, y, z), camera_to_map_transform)
    detection_id = f"{detection_2d.label}_{detection_2d.source_camera_id}_{int(detection_2d.timestamp_s * 1000)}"
    return Detection3D(
        label=detection_2d.label,
        confidence=detection_2d.confidence,
        position_x=map_x,
        position_y=map_y,
        position_z=map_z,
        source_camera_ids=[detection_2d.source_camera_id],
        detection_id=detection_id,
    )


def _distance3(a: Detection3D, b: Detection3D) -> float:
    dx = a.position_x - b.position_x
    dy = a.position_y - b.position_y
    dz = a.position_z - b.position_z
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def fuse_detections(detections_3d_list: list[Detection3D], distance_threshold: float = 1.0) -> list[Detection3D]:
    if not detections_3d_list:
        return []

    fused: list[Detection3D] = []
    for detection in detections_3d_list:
        matched_index: int | None = None
        for idx, existing in enumerate(fused):
            if detection.label != existing.label:
                continue
            if _distance3(detection, existing) <= distance_threshold:
                matched_index = idx
                break

        if matched_index is None:
            fused.append(
                Detection3D(
                    label=detection.label,
                    confidence=detection.confidence,
                    position_x=detection.position_x,
                    position_y=detection.position_y,
                    position_z=detection.position_z,
                    source_camera_ids=list(detection.source_camera_ids),
                    detection_id=detection.detection_id,
                )
            )
            continue

        existing = fused[matched_index]
        w_existing = max(existing.confidence, 1e-6)
        w_new = max(detection.confidence, 1e-6)
        w_total = w_existing + w_new
        existing.position_x = (existing.position_x * w_existing + detection.position_x * w_new) / w_total
        existing.position_y = (existing.position_y * w_existing + detection.position_y * w_new) / w_total
        existing.position_z = (existing.position_z * w_existing + detection.position_z * w_new) / w_total
        existing.confidence = max(existing.confidence, detection.confidence)
        existing.source_camera_ids = sorted(set(existing.source_camera_ids).union(detection.source_camera_ids))
        if detection.detection_id not in existing.detection_id:
            existing.detection_id = f"{existing.detection_id}|{detection.detection_id}"

    return fused


class AssetTracker:
    def __init__(
        self,
        distance_threshold: float = 1.0,
        visibility_timeout_s: float = 10.0,
        time_fn: Callable[[], float] | None = None,
    ) -> None:
        self.distance_threshold = distance_threshold
        self.visibility_timeout_s = visibility_timeout_s
        self.time_fn = time_fn or time.time
        self._assets: dict[str, dict[str, Any]] = {}
        self._next_asset_index = 1

    def _now(self, current_time_s: float | None = None) -> float:
        if current_time_s is not None:
            return current_time_s
        return float(self.time_fn())

    def _distance(self, asset: dict[str, Any], detection: Detection3D) -> float:
        px, py, pz = asset["position"]
        dx = px - detection.position_x
        dy = py - detection.position_y
        dz = pz - detection.position_z
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    def _find_match(self, detection: Detection3D) -> dict[str, Any] | None:
        best: dict[str, Any] | None = None
        best_distance = float("inf")
        for asset in self._assets.values():
            if asset["label"] != detection.label:
                continue
            distance = self._distance(asset, detection)
            if distance <= self.distance_threshold and distance < best_distance:
                best = asset
                best_distance = distance
        return best

    def _asset_to_state(self, asset: dict[str, Any]) -> dict[str, Any]:
        px, py, pz = asset["position"]
        return {
            "asset_id": asset["asset_id"],
            "label": asset["label"],
            "position": {"x": px, "y": py, "z": pz},
            "last_seen": asset["last_seen"],
            "confidence": asset["confidence"],
            "camera_ids": sorted(asset["camera_ids"]),
            "is_visible": asset["is_visible"],
        }

    def match_or_create(self, detection_3d: Detection3D, current_time_s: float | None = None) -> dict[str, Any]:
        now = self._now(current_time_s)
        matched = self._find_match(detection_3d)
        if matched is None:
            asset_id = f"asset_{self._next_asset_index:04d}"
            self._next_asset_index += 1
            matched = {
                "asset_id": asset_id,
                "label": detection_3d.label,
                "position": (
                    detection_3d.position_x,
                    detection_3d.position_y,
                    detection_3d.position_z,
                ),
                "last_seen": now,
                "confidence": detection_3d.confidence,
                "camera_ids": set(detection_3d.source_camera_ids),
                "is_visible": True,
                "detection_id": detection_3d.detection_id,
            }
            self._assets[asset_id] = matched
            return matched

        matched["position"] = (
            detection_3d.position_x,
            detection_3d.position_y,
            detection_3d.position_z,
        )
        matched["last_seen"] = now
        matched["confidence"] = max(float(matched["confidence"]), detection_3d.confidence)
        matched["camera_ids"].update(detection_3d.source_camera_ids)
        matched["is_visible"] = True
        matched["detection_id"] = detection_3d.detection_id
        return matched

    def update(self, detections_3d: list[Detection3D], current_time_s: float | None = None) -> list[dict[str, Any]]:
        now = self._now(current_time_s)
        for detection in detections_3d:
            self.match_or_create(detection, current_time_s=now)

        for asset in self._assets.values():
            if now - float(asset["last_seen"]) > self.visibility_timeout_s:
                asset["is_visible"] = False

        return self.get_all_assets(current_time_s=now)

    def get_all_assets(self, current_time_s: float | None = None) -> list[dict[str, Any]]:
        now = self._now(current_time_s)
        for asset in self._assets.values():
            if now - float(asset["last_seen"]) > self.visibility_timeout_s:
                asset["is_visible"] = False
        return [self._asset_to_state(asset) for _, asset in sorted(self._assets.items())]


def detection_to_asset_state(
    detection_3d: Detection3D,
    tracker: AssetTracker,
    current_time_s: float | None = None,
) -> dict[str, Any]:
    asset = tracker.match_or_create(detection_3d, current_time_s=current_time_s)
    state = tracker._asset_to_state(asset)
    state["detection_id"] = detection_3d.detection_id
    return state


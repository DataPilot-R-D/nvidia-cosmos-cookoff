from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CameraZone:
    camera_id: str
    zone_id: str
    polygon: list[tuple[float, float]]
    priority: int


@dataclass
class VisibilityState:
    camera_id: str
    zone_id: str
    is_covered: bool
    coverage_ratio: float
    last_image_time: float
    blind_since: float | None = None


@dataclass
class ROIConfig:
    zone_id: str
    polygon: list[tuple[float, float]]
    min_coverage_ratio: float = 0.5
    critical: bool = False


def _clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def compute_image_coverage(image_stats: dict[str, Any]) -> float:
    mean_brightness = float(image_stats.get("mean_brightness", 0.0))
    edge_density = float(image_stats.get("edge_density", 0.0))
    valid_ratio = float(image_stats.get("valid_pixel_ratio", image_stats.get("valid_ratio", 0.0)))

    if mean_brightness < 10.0 or valid_ratio < 0.1:
        return 0.0

    brightness_score = _clamp01(mean_brightness / 255.0)
    edge_score = _clamp01(edge_density / 100.0 if edge_density > 1.0 else edge_density)
    valid_score = _clamp01(valid_ratio)
    return _clamp01(0.4 * brightness_score + 0.3 * edge_score + 0.3 * valid_score)


def point_in_polygon(px: float, py: float, polygon: list[tuple[float, float]]) -> bool:
    if len(polygon) < 3:
        return False

    inside = False
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        intersects = (yi > py) != (yj > py)
        if intersects:
            denom = yj - yi
            if denom == 0.0:
                j = i
                continue
            x_at_y = ((xj - xi) * (py - yi) / denom) + xi
            if px < x_at_y:
                inside = not inside
        j = i
    return inside


def _extract_detection_point(detection: dict[str, Any], image_width: int, image_height: int) -> tuple[float, float] | None:
    if "x" in detection and "y" in detection:
        x = float(detection["x"])
        y = float(detection["y"])
    elif "bbox" in detection and isinstance(detection["bbox"], dict):
        bbox = detection["bbox"]
        x = float(bbox.get("x", 0.0)) + float(bbox.get("w", 0.0)) * 0.5
        y = float(bbox.get("y", 0.0)) + float(bbox.get("h", 0.0)) * 0.5
    elif "bbox_center_x" in detection and "bbox_center_y" in detection:
        x = float(detection["bbox_center_x"])
        y = float(detection["bbox_center_y"])
    else:
        return None

    if 0.0 <= x <= 1.0 and image_width > 1:
        x *= float(image_width)
    if 0.0 <= y <= 1.0 and image_height > 1:
        y *= float(image_height)
    return (x, y)


def check_zone_coverage(
    zone: ROIConfig,
    detections: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> float:
    if not detections:
        return 0.0

    in_zone = 0
    considered = 0
    for detection in detections:
        point = _extract_detection_point(detection, image_width, image_height)
        if point is None:
            continue
        considered += 1
        if point_in_polygon(point[0], point[1], zone.polygon):
            in_zone += 1

    if considered == 0:
        return 0.0
    return _clamp01(in_zone / considered)


class VisibilityTracker:
    def __init__(self, blind_threshold_s: float = 5.0, coverage_warning_threshold: float = 0.3) -> None:
        self.blind_threshold_s = blind_threshold_s
        self.coverage_warning_threshold = coverage_warning_threshold
        self._states: dict[tuple[str, str], VisibilityState] = {}

    def update_camera(self, camera_id: str, zone_id: str, coverage_ratio: float, timestamp_s: float) -> VisibilityState:
        key = (camera_id, zone_id)
        ratio = _clamp01(float(coverage_ratio))
        is_covered = ratio >= self.coverage_warning_threshold
        previous = self._states.get(key)

        if previous is None:
            blind_since = None if is_covered else timestamp_s
            state = VisibilityState(
                camera_id=camera_id,
                zone_id=zone_id,
                is_covered=is_covered,
                coverage_ratio=ratio,
                last_image_time=timestamp_s,
                blind_since=blind_since,
            )
            self._states[key] = state
            return state

        previous.coverage_ratio = ratio
        previous.is_covered = is_covered
        previous.last_image_time = timestamp_s
        if is_covered:
            previous.blind_since = None
        elif previous.blind_since is None:
            previous.blind_since = timestamp_s
        return previous

    def get_blind_spots(self, current_time_s: float) -> list[VisibilityState]:
        blind_states: list[VisibilityState] = []
        for state in self._states.values():
            if state.is_covered or state.blind_since is None:
                continue
            if (current_time_s - state.blind_since) > self.blind_threshold_s:
                blind_states.append(state)
        return blind_states

    def get_all_states(self) -> list[VisibilityState]:
        return list(self._states.values())

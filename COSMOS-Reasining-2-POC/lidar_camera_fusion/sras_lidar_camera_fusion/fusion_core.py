from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass


@dataclass(slots=True)
class Point3D:
    x: float
    y: float
    z: float
    intensity: float = 0.0


@dataclass(slots=True)
class Pixel2D:
    u: int
    v: int


@dataclass(slots=True)
class FusedDetection:
    label: str
    confidence: float
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    centroid_3d: Point3D
    depth_m: float
    point_count: int


@dataclass(slots=True)
class FusionConfig:
    max_range_m: float = 50.0
    min_range_m: float = 0.3
    depth_tolerance_m: float = 0.5
    min_points_in_bbox: int = 3
    image_width: int = 640
    image_height: int = 480


@dataclass(slots=True)
class CameraIntrinsics:
    fx: float
    fy: float
    cx: float
    cy: float


@dataclass(slots=True)
class BenchmarkResult:
    detection_count_2d: int
    detection_count_fused: int
    avg_depth_m: float
    avg_point_count: float
    fusion_rate_pct: float


def project_point_to_pixel(point: Point3D, intrinsics: CameraIntrinsics) -> Pixel2D | None:
    default_cfg = FusionConfig()
    if point.z <= 0.0:
        return None

    u = int(round((point.x * intrinsics.fx / point.z) + intrinsics.cx))
    v = int(round((point.y * intrinsics.fy / point.z) + intrinsics.cy))
    if u < 0 or v < 0 or u >= default_cfg.image_width or v >= default_cfg.image_height:
        return None
    return Pixel2D(u=u, v=v)


def filter_points_by_range(points: list[Point3D], config: FusionConfig) -> list[Point3D]:
    filtered: list[Point3D] = []
    for point in points:
        distance = math.sqrt((point.x * point.x) + (point.y * point.y) + (point.z * point.z))
        if config.min_range_m <= distance <= config.max_range_m:
            filtered.append(point)
    return filtered


def _largest_depth_cluster(points: list[Point3D], depth_tolerance_m: float) -> list[Point3D]:
    if not points:
        return []

    sorted_points = sorted(points, key=lambda point: point.z)
    clusters: list[list[Point3D]] = [[sorted_points[0]]]

    for point in sorted_points[1:]:
        current_cluster = clusters[-1]
        if abs(point.z - current_cluster[-1].z) <= depth_tolerance_m:
            current_cluster.append(point)
        else:
            clusters.append([point])

    return max(clusters, key=len)


def points_in_bbox(
    projected: list[tuple[Point3D, Pixel2D]],
    bbox_x: float,
    bbox_y: float,
    bbox_w: float,
    bbox_h: float,
    depth_tolerance_m: float,
) -> list[Point3D]:
    in_bbox: list[Point3D] = []
    bbox_x2 = bbox_x + bbox_w
    bbox_y2 = bbox_y + bbox_h

    for point, pixel in projected:
        if bbox_x <= pixel.u <= bbox_x2 and bbox_y <= pixel.v <= bbox_y2:
            in_bbox.append(point)

    return _largest_depth_cluster(in_bbox, depth_tolerance_m)


def compute_centroid(points: list[Point3D]) -> Point3D:
    if not points:
        return Point3D(0.0, 0.0, 0.0, 0.0)

    count = float(len(points))
    sum_x = sum(point.x for point in points)
    sum_y = sum(point.y for point in points)
    sum_z = sum(point.z for point in points)
    sum_intensity = sum(point.intensity for point in points)
    return Point3D(sum_x / count, sum_y / count, sum_z / count, sum_intensity / count)


def fuse_detection(
    label: str,
    confidence: float,
    bbox: tuple[float, float, float, float],
    projected_points: list[tuple[Point3D, Pixel2D]],
    config: FusionConfig,
) -> FusedDetection | None:
    bbox_x, bbox_y, bbox_w, bbox_h = bbox
    points = points_in_bbox(
        projected=projected_points,
        bbox_x=bbox_x,
        bbox_y=bbox_y,
        bbox_w=bbox_w,
        bbox_h=bbox_h,
        depth_tolerance_m=config.depth_tolerance_m,
    )
    if len(points) < config.min_points_in_bbox:
        return None

    centroid = compute_centroid(points)
    depth_m = sum(point.z for point in points) / float(len(points))
    return FusedDetection(
        label=label,
        confidence=confidence,
        bbox_x=bbox_x,
        bbox_y=bbox_y,
        bbox_w=bbox_w,
        bbox_h=bbox_h,
        centroid_3d=centroid,
        depth_m=depth_m,
        point_count=len(points),
    )


def compute_benchmark(detections_2d: int, fused: list[FusedDetection]) -> BenchmarkResult:
    fused_count = len(fused)
    avg_depth_m = 0.0
    avg_point_count = 0.0

    if fused_count > 0:
        avg_depth_m = sum(det.depth_m for det in fused) / float(fused_count)
        avg_point_count = sum(det.point_count for det in fused) / float(fused_count)

    fusion_rate_pct = 0.0
    if detections_2d > 0:
        fusion_rate_pct = (float(fused_count) / float(detections_2d)) * 100.0

    return BenchmarkResult(
        detection_count_2d=detections_2d,
        detection_count_fused=fused_count,
        avg_depth_m=avg_depth_m,
        avg_point_count=avg_point_count,
        fusion_rate_pct=fusion_rate_pct,
    )


def benchmark_to_json(result: BenchmarkResult) -> str:
    return json.dumps(asdict(result))


def fused_detection_to_dict(det: FusedDetection) -> dict:
    payload = asdict(det)
    payload["centroid_3d"] = asdict(det.centroid_3d)
    return payload

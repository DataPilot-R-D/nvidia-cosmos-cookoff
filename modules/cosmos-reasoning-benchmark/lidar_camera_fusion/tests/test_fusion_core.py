import json

from sras_lidar_camera_fusion.fusion_core import (
    BenchmarkResult,
    CameraIntrinsics,
    FusedDetection,
    FusionConfig,
    Point3D,
    Pixel2D,
    compute_benchmark,
    compute_centroid,
    filter_points_by_range,
    fuse_detection,
    fused_detection_to_dict,
    points_in_bbox,
    project_point_to_pixel,
)


def test_project_point_to_pixel_basic() -> None:
    intrinsics = CameraIntrinsics(fx=100.0, fy=100.0, cx=320.0, cy=240.0)
    point = Point3D(x=0.0, y=0.0, z=2.0)

    pixel = project_point_to_pixel(point, intrinsics)

    assert pixel == Pixel2D(u=320, v=240)


def test_project_point_behind_camera() -> None:
    intrinsics = CameraIntrinsics(fx=100.0, fy=100.0, cx=320.0, cy=240.0)
    assert project_point_to_pixel(Point3D(0.0, 0.0, 0.0), intrinsics) is None
    assert project_point_to_pixel(Point3D(0.0, 0.0, -1.0), intrinsics) is None


def test_project_point_outside_image() -> None:
    intrinsics = CameraIntrinsics(fx=100.0, fy=100.0, cx=320.0, cy=240.0)
    point = Point3D(x=20.0, y=0.0, z=1.0)

    pixel = project_point_to_pixel(point, intrinsics)

    assert pixel is None


def test_filter_points_by_range() -> None:
    config = FusionConfig(min_range_m=1.0, max_range_m=5.0)
    points = [
        Point3D(0.0, 0.0, 0.5),
        Point3D(0.0, 0.0, 2.0),
        Point3D(3.0, 0.0, 4.0),
        Point3D(0.0, 0.0, 6.0),
    ]

    filtered = filter_points_by_range(points, config)

    assert len(filtered) == 2
    assert filtered[0].z == 2.0
    assert filtered[1].z == 4.0


def test_points_in_bbox() -> None:
    projected = [
        (Point3D(0.0, 0.0, 2.0), Pixel2D(100, 100)),
        (Point3D(0.0, 0.0, 2.1), Pixel2D(110, 110)),
        (Point3D(0.0, 0.0, 10.0), Pixel2D(105, 105)),
        (Point3D(0.0, 0.0, 2.2), Pixel2D(300, 300)),
    ]

    in_bbox = points_in_bbox(projected, 90.0, 90.0, 40.0, 40.0, depth_tolerance_m=0.5)

    assert len(in_bbox) == 2
    assert sorted([round(point.z, 1) for point in in_bbox]) == [2.0, 2.1]


def test_compute_centroid() -> None:
    points = [Point3D(1.0, 2.0, 3.0), Point3D(3.0, 4.0, 5.0)]

    centroid = compute_centroid(points)

    assert centroid.x == 2.0
    assert centroid.y == 3.0
    assert centroid.z == 4.0


def test_fuse_detection_sufficient_points() -> None:
    config = FusionConfig(min_points_in_bbox=2, depth_tolerance_m=0.3)
    projected = [
        (Point3D(1.0, 1.0, 2.0), Pixel2D(50, 50)),
        (Point3D(1.2, 1.1, 2.1), Pixel2D(55, 55)),
        (Point3D(2.0, 2.0, 5.0), Pixel2D(400, 400)),
    ]

    fused = fuse_detection("person", 0.9, (40.0, 40.0, 30.0, 30.0), projected, config)

    assert fused is not None
    assert fused.label == "person"
    assert fused.point_count == 2
    assert 2.0 <= fused.depth_m <= 2.1


def test_fuse_detection_insufficient_points() -> None:
    config = FusionConfig(min_points_in_bbox=3, depth_tolerance_m=0.3)
    projected = [
        (Point3D(1.0, 1.0, 2.0), Pixel2D(50, 50)),
        (Point3D(2.0, 2.0, 5.0), Pixel2D(400, 400)),
    ]

    fused = fuse_detection("person", 0.9, (40.0, 40.0, 30.0, 30.0), projected, config)

    assert fused is None


def test_compute_benchmark() -> None:
    fused = [
        FusedDetection("person", 0.9, 1.0, 2.0, 10.0, 20.0, Point3D(0.0, 0.0, 4.0), 4.0, 5),
        FusedDetection("box", 0.8, 3.0, 4.0, 15.0, 25.0, Point3D(0.0, 0.0, 6.0), 6.0, 7),
    ]

    benchmark = compute_benchmark(4, fused)

    assert isinstance(benchmark, BenchmarkResult)
    assert benchmark.detection_count_2d == 4
    assert benchmark.detection_count_fused == 2
    assert benchmark.avg_depth_m == 5.0
    assert benchmark.avg_point_count == 6.0
    assert benchmark.fusion_rate_pct == 50.0


def test_fused_detection_to_dict() -> None:
    fused = FusedDetection(
        label="person",
        confidence=0.91,
        bbox_x=12.0,
        bbox_y=15.0,
        bbox_w=100.0,
        bbox_h=120.0,
        centroid_3d=Point3D(1.0, 2.0, 3.0, 0.5),
        depth_m=3.0,
        point_count=8,
    )

    payload = fused_detection_to_dict(fused)

    assert payload["label"] == "person"
    assert payload["confidence"] == 0.91
    assert payload["centroid_3d"]["z"] == 3.0
    assert payload["point_count"] == 8

    encoded = json.dumps(payload)
    decoded = json.loads(encoded)
    assert decoded["bbox_w"] == 100.0

from sras_cctv_visibility_monitor.visibility_core import (
    ROIConfig,
    VisibilityTracker,
    check_zone_coverage,
    compute_image_coverage,
    point_in_polygon,
)


def test_compute_image_coverage_normal() -> None:
    image_stats = {
        "mean_brightness": 170.0,
        "edge_density": 0.6,
        "valid_pixel_ratio": 0.95,
    }

    coverage = compute_image_coverage(image_stats)

    assert 0.7 <= coverage <= 1.0


def test_compute_image_coverage_dark() -> None:
    image_stats = {
        "mean_brightness": 5.0,
        "edge_density": 0.8,
        "valid_pixel_ratio": 0.9,
    }

    coverage = compute_image_coverage(image_stats)

    assert coverage == 0.0


def test_point_in_polygon() -> None:
    polygon = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]

    assert point_in_polygon(5.0, 5.0, polygon) is True
    assert point_in_polygon(15.0, 5.0, polygon) is False


def test_check_zone_coverage() -> None:
    zone = ROIConfig(
        zone_id="zone_a",
        polygon=[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
    )
    detections = [
        {"x": 20.0, "y": 30.0, "asset_id": "a1"},
        {"x": 80.0, "y": 80.0, "asset_id": "a2"},
        {"x": 150.0, "y": 20.0, "asset_id": "a3"},
    ]

    coverage = check_zone_coverage(zone, detections, image_width=200, image_height=100)

    assert coverage == 2.0 / 3.0


def test_visibility_tracker_goes_blind() -> None:
    tracker = VisibilityTracker(blind_threshold_s=5.0, coverage_warning_threshold=0.3)

    tracker.update_camera("cam0", "global", 0.1, timestamp_s=0.0)
    blind_states = tracker.get_blind_spots(current_time_s=6.0)

    assert len(blind_states) == 1
    assert blind_states[0].camera_id == "cam0"
    assert blind_states[0].is_covered is False


def test_visibility_tracker_recovers() -> None:
    tracker = VisibilityTracker(blind_threshold_s=5.0, coverage_warning_threshold=0.3)

    tracker.update_camera("cam0", "global", 0.1, timestamp_s=0.0)
    tracker.update_camera("cam0", "global", 0.9, timestamp_s=2.0)
    blind_states = tracker.get_blind_spots(current_time_s=10.0)

    assert len(blind_states) == 0


def test_visibility_tracker_multiple_cameras() -> None:
    tracker = VisibilityTracker(blind_threshold_s=3.0, coverage_warning_threshold=0.4)

    tracker.update_camera("cam0", "global", 0.2, timestamp_s=0.0)
    tracker.update_camera("cam1", "global", 0.6, timestamp_s=0.0)
    tracker.update_camera("cam2", "zone_a", 0.1, timestamp_s=1.0)

    blind_states = tracker.get_blind_spots(current_time_s=5.0)

    assert len(blind_states) == 2
    ids = {(state.camera_id, state.zone_id) for state in blind_states}
    assert ("cam0", "global") in ids
    assert ("cam2", "zone_a") in ids

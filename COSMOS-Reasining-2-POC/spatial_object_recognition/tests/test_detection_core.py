from sras_spatial_object_recognition.detection_core import (
    AssetTracker,
    Detection2D,
    Detection3D,
    detection_to_asset_state,
    fuse_detections,
    project_2d_to_3d,
)


def test_project_2d_to_3d_basic() -> None:
    det_2d = Detection2D(
        label="person",
        confidence=0.8,
        bbox_x=0.5,
        bbox_y=0.5,
        bbox_w=1.0,
        bbox_h=1.0,
        source_camera_id="cam0",
        timestamp_s=123.0,
    )
    depth_image = [
        [1.0, 1.0, 1.0],
        [1.0, 2.0, 1.0],
        [1.0, 1.0, 1.0],
    ]
    intrinsics = {"fx": 1.0, "fy": 1.0, "cx": 1.0, "cy": 1.0}
    transform = {
        "translation": {"x": 0.0, "y": 0.0, "z": 0.0},
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
    }

    det_3d = project_2d_to_3d(det_2d, depth_image, intrinsics, transform)

    assert det_3d.position_x == 0.0
    assert det_3d.position_y == 0.0
    assert det_3d.position_z == 2.0


def test_fuse_detections_merges_nearby() -> None:
    detections = [
        Detection3D("person", 0.7, 0.0, 0.0, 1.0, ["cam0"], "d0"),
        Detection3D("person", 0.8, 0.4, 0.1, 1.1, ["cam1"], "d1"),
    ]

    fused = fuse_detections(detections, distance_threshold=1.0)

    assert len(fused) == 1
    assert fused[0].label == "person"
    assert set(fused[0].source_camera_ids) == {"cam0", "cam1"}


def test_fuse_detections_keeps_distant_separate() -> None:
    detections = [
        Detection3D("person", 0.7, 0.0, 0.0, 0.0, ["cam0"], "d0"),
        Detection3D("person", 0.9, 5.0, 0.0, 0.0, ["cam1"], "d1"),
    ]

    fused = fuse_detections(detections, distance_threshold=1.0)

    assert len(fused) == 2


def test_asset_tracker_creates_new_assets() -> None:
    tracker = AssetTracker(distance_threshold=1.0, visibility_timeout_s=10.0)
    detections = [Detection3D("person", 0.6, 0.0, 0.0, 1.0, ["cam0"], "d0")]

    assets = tracker.update(detections, current_time_s=0.0)

    assert len(assets) == 1
    assert assets[0]["asset_id"] == "asset_0001"
    assert assets[0]["label"] == "person"
    assert assets[0]["is_visible"] is True


def test_asset_tracker_updates_existing() -> None:
    tracker = AssetTracker(distance_threshold=1.0, visibility_timeout_s=10.0)
    tracker.update([Detection3D("person", 0.6, 0.0, 0.0, 0.0, ["cam0"], "d0")], current_time_s=0.0)

    assets = tracker.update([Detection3D("person", 0.9, 0.2, 0.0, 0.0, ["cam1"], "d1")], current_time_s=1.0)

    assert len(assets) == 1
    assert assets[0]["asset_id"] == "asset_0001"
    assert assets[0]["confidence"] == 0.9
    assert set(assets[0]["camera_ids"]) == {"cam0", "cam1"}


def test_asset_tracker_visibility_timeout() -> None:
    tracker = AssetTracker(distance_threshold=1.0, visibility_timeout_s=1.0)
    tracker.update([Detection3D("person", 0.8, 0.0, 0.0, 0.0, ["cam0"], "d0")], current_time_s=0.0)

    assets = tracker.update([], current_time_s=2.0)

    assert len(assets) == 1
    assert assets[0]["is_visible"] is False


def test_detection_to_asset_state_format() -> None:
    tracker = AssetTracker(distance_threshold=1.0, visibility_timeout_s=10.0)
    detection = Detection3D("forklift", 0.95, 1.0, 2.0, 0.5, ["cam0"], "det-123")

    state = detection_to_asset_state(detection, tracker, current_time_s=5.0)

    assert state["asset_id"] == "asset_0001"
    assert state["label"] == "forklift"
    assert state["detection_id"] == "det-123"
    assert state["position"] == {"x": 1.0, "y": 2.0, "z": 0.5}
    assert state["is_visible"] is True

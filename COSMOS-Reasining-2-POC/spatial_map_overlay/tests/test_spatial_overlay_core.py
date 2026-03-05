import json

from sras_spatial_map_overlay.spatial_overlay_core import (
    DEFAULT_CAMERAS,
    DEFAULT_WAREHOUSE,
    CameraFOV,
    DetectionMarker,
    Pose3D,
    Quaternion,
    RobotState,
    Vec3,
    build_scene_state,
    compute_camera_frustum,
    compute_scene_summary,
    filter_markers_by_age,
    scene_to_dict,
    scene_to_json,
)


def test_vec3_creation() -> None:
    value = Vec3(1.0, 2.0, 3.0)
    assert value.x == 1.0
    assert value.y == 2.0
    assert value.z == 3.0


def test_pose3d_default_orientation() -> None:
    pose = Pose3D(position=Vec3(1.0, 2.0, 0.0))
    assert pose.orientation.x == 0.0
    assert pose.orientation.y == 0.0
    assert pose.orientation.z == 0.0
    assert pose.orientation.w == 1.0


def test_default_warehouse_layout() -> None:
    assert DEFAULT_WAREHOUSE.layout_id == "warehouse_default"
    assert DEFAULT_WAREHOUSE.bounds_min == Vec3(0.0, 0.0, 0.0)
    assert DEFAULT_WAREHOUSE.bounds_max == Vec3(30.0, 20.0, 5.0)
    assert len(DEFAULT_WAREHOUSE.zones) == 5


def test_default_cameras_count_and_positions() -> None:
    assert len(DEFAULT_CAMERAS) == 4
    positions = {camera.camera_id: camera.pose.position for camera in DEFAULT_CAMERAS}
    assert positions["cam_north"] == Vec3(15.0, 20.0, 3.0)
    assert positions["cam_south"] == Vec3(15.0, 0.0, 3.0)
    assert positions["cam_east"] == Vec3(30.0, 10.0, 3.0)
    assert positions["cam_west"] == Vec3(0.0, 10.0, 3.0)


def test_build_scene_state() -> None:
    robot = RobotState(robot_id="robot_0", pose=Pose3D(position=Vec3(1.0, 2.0, 0.0), orientation=Quaternion(0, 0, 0, 1)))
    marker = DetectionMarker(marker_id="m1", label="person", position=Vec3(2.0, 2.0, 0.0), confidence=0.9)
    scene = build_scene_state(100.0, DEFAULT_WAREHOUSE, DEFAULT_CAMERAS, [robot], [marker], [{"id": "a1"}])

    assert scene.timestamp_s == 100.0
    assert len(scene.robots) == 1
    assert len(scene.markers) == 1
    assert len(scene.active_alerts) == 1


def test_scene_to_dict_structure() -> None:
    scene = build_scene_state(42.0, DEFAULT_WAREHOUSE, DEFAULT_CAMERAS, [], [], [])
    payload = scene_to_dict(scene)

    assert payload["timestamp_s"] == 42.0
    assert payload["layout"]["layout_id"] == "warehouse_default"
    assert "cameras" in payload
    assert "robots" in payload
    assert "markers" in payload
    assert "active_alerts" in payload


def test_filter_markers_by_age() -> None:
    markers = [
        DetectionMarker(marker_id="old", label="box", position=Vec3(1.0, 1.0, 0.0), confidence=0.2, timestamp_s=10.0),
        DetectionMarker(marker_id="new", label="person", position=Vec3(2.0, 2.0, 0.0), confidence=0.9, timestamp_s=95.0),
    ]
    filtered = filter_markers_by_age(markers, max_age_s=10.0, current_time_s=100.0)

    assert len(filtered) == 1
    assert filtered[0].marker_id == "new"


def test_compute_camera_frustum() -> None:
    camera = CameraFOV(
        camera_id="cam_test",
        pose=Pose3D(position=Vec3(0.0, 0.0, 1.0), orientation=Quaternion(0, 0, 0, 1)),
        fov_h_deg=90.0,
        fov_v_deg=60.0,
        range_m=10.0,
    )
    frustum = compute_camera_frustum(camera)

    assert frustum["camera_id"] == "cam_test"
    assert len(frustum["near_corners"]) == 4
    assert len(frustum["far_corners"]) == 4
    assert frustum["far_distance_m"] == 10.0


def test_compute_scene_summary() -> None:
    marker_in_a = DetectionMarker(marker_id="m1", label="pallet", position=Vec3(2.0, 2.0, 0.0), confidence=0.8)
    marker_in_e = DetectionMarker(marker_id="m2", label="person", position=Vec3(20.0, 15.0, 0.0), confidence=0.9)
    robot = RobotState(robot_id="robot_0", pose=Pose3D(position=Vec3(1.0, 1.0, 0.0), orientation=Quaternion(0, 0, 0, 1)))
    scene = build_scene_state(50.0, DEFAULT_WAREHOUSE, DEFAULT_CAMERAS, [robot], [marker_in_a, marker_in_e], [{"id": "a1"}])

    summary = compute_scene_summary(scene)
    assert summary["camera_count"] == 4
    assert summary["robot_count"] == 1
    assert summary["marker_count"] == 2
    assert summary["alert_count"] == 1
    assert summary["active_cameras"] == 4
    assert any(zone["zone_id"] == "zone_a" and zone["marker_count"] == 1 for zone in summary["zone_coverage"])


def test_scene_to_json_roundtrip() -> None:
    scene = build_scene_state(88.0, DEFAULT_WAREHOUSE, DEFAULT_CAMERAS, [], [], [])
    payload = json.loads(scene_to_json(scene))

    assert payload["timestamp_s"] == 88.0
    assert payload["layout"]["layout_id"] == "warehouse_default"
    assert len(payload["cameras"]) == 4

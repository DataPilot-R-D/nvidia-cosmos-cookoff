from __future__ import annotations

import json

from configs.cctv_coverage.coverage_zones import (
    COVERAGE_ZONES,
    WAREHOUSE_CAMERAS,
    compute_overlap_zones,
    generate_full_config_yaml,
    generate_ros2_zone_params,
)


def test_warehouse_cameras_count() -> None:
    assert len(WAREHOUSE_CAMERAS) == 4


def test_coverage_zones_have_polygons() -> None:
    assert COVERAGE_ZONES
    for zone in COVERAGE_ZONES:
        assert len(zone.polygon) >= 3
        for point in zone.polygon:
            assert len(point) == 2


def test_all_zones_have_camera_assignment() -> None:
    for zone in COVERAGE_ZONES:
        assert zone.camera_ids


def test_overlap_detection() -> None:
    overlap_zones = compute_overlap_zones(WAREHOUSE_CAMERAS, COVERAGE_ZONES)
    overlap_ids = {zone.zone_id for zone in overlap_zones}
    assert "main_aisle" in overlap_ids
    assert "shelf_zone" in overlap_ids


def test_generate_ros2_zone_params_format() -> None:
    params = generate_ros2_zone_params(COVERAGE_ZONES)
    assert len(params) == len(COVERAGE_ZONES)
    decoded = json.loads(params[0])
    assert "zone_id" in decoded
    assert "polygon" in decoded
    assert "min_coverage_ratio" in decoded
    assert "critical" in decoded


def test_shelf_zone_is_critical() -> None:
    shelf_zone = next(zone for zone in COVERAGE_ZONES if zone.zone_id == "shelf_zone")
    assert shelf_zone.critical is True


def test_generate_yaml_contains_all_topics() -> None:
    content = generate_full_config_yaml(WAREHOUSE_CAMERAS, COVERAGE_ZONES)
    for camera_id in ("cam1", "cam2", "cam3", "cam4"):
        assert f"/cctv/{camera_id}/image_raw" in content

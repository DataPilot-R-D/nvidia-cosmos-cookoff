import json

from sras_dynamic_blindspot_gen.blindspot_gen_core import (
    DEFAULT_SCENARIO,
    DynamicBlindspotGenerator,
    OcclusionEvent,
    OcclusionType,
    ScenarioConfig,
    coverage_impact_to_json,
    occlusion_to_blindspot_event,
)


def _build_generator(seed: int = 7) -> DynamicBlindspotGenerator:
    return DynamicBlindspotGenerator(config=DEFAULT_SCENARIO, seed=seed)


def test_generate_event_returns_valid_occlusion() -> None:
    generator = _build_generator(seed=1)
    event = generator.generate_event(current_time_s=10.0)

    assert isinstance(event, OcclusionEvent)
    assert event.zone_id in DEFAULT_SCENARIO.zone_ids
    assert event.camera_id in DEFAULT_SCENARIO.camera_ids
    assert isinstance(event.occlusion_type, OcclusionType)
    assert 0 <= event.severity <= 3
    assert 0.0 <= event.affected_area_pct <= 100.0
    assert event.start_time_s == 10.0


def test_generate_event_respects_severity_weights() -> None:
    config = ScenarioConfig(
        scenario_id="severity_bias",
        zone_ids=["zone_a"],
        camera_ids=["cam_north"],
        severity_weights={0: 0.0, 1: 0.0, 2: 0.0, 3: 1.0},
        occlusion_type_weights={OcclusionType.OBJECT_MOVED: 1.0},
    )
    generator = DynamicBlindspotGenerator(config=config, seed=123)

    severities = [generator.generate_event(current_time_s=float(i)).severity for i in range(20)]

    assert set(severities) == {3}


def test_generate_sequence_count() -> None:
    generator = _build_generator(seed=2)
    events = generator.generate_sequence(start_s=0.0, count=6)

    assert len(events) == 6


def test_generate_sequence_spacing() -> None:
    generator = _build_generator(seed=3)
    events = generator.generate_sequence(start_s=12.5, count=5)

    for idx, event in enumerate(events):
        assert event.start_time_s == 12.5 + idx * DEFAULT_SCENARIO.event_interval_s


def test_active_occlusions_filters_expired() -> None:
    generator = _build_generator(seed=4)

    e1 = generator.generate_event(current_time_s=0.0)
    e2 = generator.generate_event(current_time_s=5.0)
    e3 = generator.generate_event(current_time_s=10.0)

    active_now = generator.active_occlusions(current_time_s=6.0)

    assert e2 in active_now
    assert e3 not in active_now
    assert all(e.start_time_s <= 6.0 < (e.start_time_s + e.duration_s) for e in active_now)
    assert e1 in generator._events


def test_coverage_impact_computation() -> None:
    generator = _build_generator(seed=5)
    occlusions = [
        OcclusionEvent(
            event_id="occ_1",
            occlusion_type=OcclusionType.CAMERA_BLOCKED,
            zone_id="zone_a",
            camera_id="cam_north",
            severity=2,
            description="test",
            start_time_s=1.0,
            duration_s=4.0,
            affected_area_pct=35.0,
        ),
        OcclusionEvent(
            event_id="occ_2",
            occlusion_type=OcclusionType.NEW_OBSTACLE,
            zone_id="zone_a",
            camera_id="cam_west",
            severity=1,
            description="test",
            start_time_s=2.0,
            duration_s=4.0,
            affected_area_pct=80.0,
        ),
    ]

    impact = generator.compute_coverage_impact(occlusions)

    assert impact["zone_a"] == 100.0
    assert impact["zone_b"] == 0.0


def test_occlusion_to_blindspot_event_fields() -> None:
    occlusion = OcclusionEvent(
        event_id="occ_999",
        occlusion_type=OcclusionType.LAYOUT_SHIFT,
        zone_id="zone_c",
        camera_id="cam_south",
        severity=2,
        description="layout changed",
        start_time_s=123.25,
        duration_s=9.0,
        affected_area_pct=65.0,
    )

    event = occlusion_to_blindspot_event(occlusion)

    assert event["event_id"] == "occ_999"
    assert event["camera_id"] == "cam_south"
    assert event["zone_id"] == "zone_c"
    assert event["severity"] == 2
    assert event["timestamp_detected"] == {"sec": 123, "nanosec": 250000000}
    assert event["duration_s"] == 9.0


def test_default_scenario_config() -> None:
    assert DEFAULT_SCENARIO.zone_ids == ["zone_a", "zone_b", "zone_c", "zone_d", "zone_e"]
    assert DEFAULT_SCENARIO.camera_ids == ["cam_north", "cam_south", "cam_east", "cam_west"]
    assert DEFAULT_SCENARIO.max_concurrent_occlusions == 3
    assert set(DEFAULT_SCENARIO.severity_weights.keys()) == {0, 1, 2, 3}


def test_reset_clears_state() -> None:
    generator = _build_generator(seed=6)
    generator.generate_sequence(start_s=0.0, count=3)

    assert len(generator._events) == 3

    generator.reset()

    assert generator._events == []
    assert generator.active_occlusions(current_time_s=999.0) == []


def test_coverage_impact_to_json() -> None:
    payload = {"zone_a": 33.3, "zone_b": 0.0}

    encoded = coverage_impact_to_json(payload)
    decoded = json.loads(encoded)

    assert decoded["zone_a"] == 33.3
    assert decoded["zone_b"] == 0.0

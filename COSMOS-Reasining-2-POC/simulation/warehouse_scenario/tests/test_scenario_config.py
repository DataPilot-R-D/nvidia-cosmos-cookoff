from simulation.warehouse_scenario.scenario_config import WarehouseScenarioConfig


def test_default_config_valid() -> None:
    config = WarehouseScenarioConfig()
    config.validate()


def test_cctv_camera_count() -> None:
    config = WarehouseScenarioConfig()
    assert len(config.cctv_cameras) == 4


def test_occluder_positions_differ() -> None:
    config = WarehouseScenarioConfig()
    assert config.occluder.start_position != config.occluder.blocking_position


def test_narrative_timing_positive() -> None:
    config = WarehouseScenarioConfig()
    n = config.narrative
    assert n.phase_1_normal_s > 0
    assert n.phase_2_occlude_s > 0
    assert n.phase_3_window_open_s > 0
    assert n.phase_4_dispatch_s > 0


def test_patrol_waypoints_nonempty() -> None:
    config = WarehouseScenarioConfig()
    assert config.patrol_waypoints
    assert len(config.patrol_waypoints) >= 1

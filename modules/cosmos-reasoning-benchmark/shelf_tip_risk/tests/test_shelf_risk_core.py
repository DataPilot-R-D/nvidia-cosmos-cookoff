import json

from sras_shelf_tip_risk.shelf_risk_core import (
    DEFAULT_SHELF,
    DEFAULT_WINDOW,
    EnvironmentFactors,
    ShelfState,
    WindowState,
    assessment_to_json,
    compute_tip_risk,
)


def test_compute_tip_risk_low_tilt() -> None:
    shelf = ShelfState("shelf_low", tilt_deg=4.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    risk = compute_tip_risk(shelf=shelf, window=None)
    assert risk.risk_level == 0


def test_compute_tip_risk_medium_tilt() -> None:
    shelf = ShelfState("shelf_medium", tilt_deg=10.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    risk = compute_tip_risk(shelf=shelf, window=None)
    assert risk.risk_level == 1


def test_compute_tip_risk_high_tilt() -> None:
    shelf = ShelfState("shelf_high", tilt_deg=18.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    risk = compute_tip_risk(shelf=shelf, window=None)
    assert risk.risk_level == 2


def test_compute_tip_risk_critical_tilt() -> None:
    shelf = ShelfState("shelf_critical", tilt_deg=26.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    risk = compute_tip_risk(shelf=shelf, window=None)
    assert risk.risk_level == 3


def test_compute_tip_risk_window_open_increases_score() -> None:
    shelf = ShelfState("shelf_window", tilt_deg=10.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    closed_window = WindowState("window_01", is_open=False, open_offset_m=0.8, position=(0.0, 0.0, 0.0))
    open_window = WindowState("window_01", is_open=True, open_offset_m=0.8, position=(0.0, 0.0, 0.0))

    closed = compute_tip_risk(shelf=shelf, window=closed_window)
    opened = compute_tip_risk(shelf=shelf, window=open_window)

    assert opened.risk_score > closed.risk_score


def test_compute_tip_risk_wind_increases_score() -> None:
    shelf = ShelfState("shelf_wind", tilt_deg=10.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    calm = compute_tip_risk(shelf=shelf, window=None, env=EnvironmentFactors(wind_speed_mps=1.0))
    windy = compute_tip_risk(shelf=shelf, window=None, env=EnvironmentFactors(wind_speed_mps=6.5))

    assert windy.risk_score > calm.risk_score


def test_compute_tip_risk_loaded_increases_score() -> None:
    unloaded = ShelfState("shelf_load", tilt_deg=9.0, position=(0.0, 0.0, 0.0), is_loaded=False)
    loaded = ShelfState("shelf_load", tilt_deg=9.0, position=(0.0, 0.0, 0.0), is_loaded=True)

    risk_unloaded = compute_tip_risk(shelf=unloaded, window=None)
    risk_loaded = compute_tip_risk(shelf=loaded, window=None)

    assert risk_loaded.risk_score > risk_unloaded.risk_score


def test_compute_tip_risk_evidence_fields() -> None:
    shelf = ShelfState("shelf_evidence", tilt_deg=18.0, position=(0.0, 0.0, 0.0), is_loaded=True)
    window = WindowState("window_01", is_open=True, open_offset_m=0.8, position=(0.0, 0.0, 0.0))
    env = EnvironmentFactors(wind_speed_mps=7.0, vibration_level=0.8)

    risk = compute_tip_risk(shelf=shelf, window=window, env=env)

    assert len(risk.evidence) >= 4
    evidence_joined = " ".join(risk.evidence)
    assert "shelf_tilt_deg" in evidence_joined
    assert "window_open" in evidence_joined
    assert "high_wind" in evidence_joined
    assert "shelf_loaded" in evidence_joined


def test_assessment_to_json() -> None:
    risk = compute_tip_risk(shelf=DEFAULT_SHELF, window=DEFAULT_WINDOW)
    serialized = assessment_to_json(risk)
    payload = json.loads(serialized)

    assert payload["shelf_id"] == "shelf_01"
    assert "risk_score" in payload
    assert "recommended_action" in payload


def test_default_shelf_matches_config() -> None:
    assert DEFAULT_SHELF.shelf_id == "shelf_01"
    assert DEFAULT_SHELF.tilt_deg == 18.0
    assert DEFAULT_SHELF.position == (6.2, 1.4, 0.75)
    assert DEFAULT_WINDOW.window_id == "window_01"
    assert DEFAULT_WINDOW.open_offset_m == 0.8
    assert DEFAULT_WINDOW.position == (9.8, -4.4, 2.2)

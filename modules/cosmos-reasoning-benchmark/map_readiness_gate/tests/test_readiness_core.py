from sras_map_readiness_gate.readiness_core import (
    STATUS_NAMES,
    ReadinessStatus,
    evaluate_readiness,
    json_to_readiness,
    readiness_to_json,
)


def test_evaluate_readiness_all_good() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=True,
        nav2_active=True,
        map_age_s=1.0,
        tf_age_s=0.2,
    )

    assert state.status == ReadinessStatus.READY


def test_evaluate_readiness_no_map() -> None:
    state = evaluate_readiness(
        map_received=False,
        tf_valid=False,
        nav2_active=False,
        map_age_s=999.0,
        tf_age_s=999.0,
    )

    assert state.status == ReadinessStatus.MAP_LOADING


def test_evaluate_readiness_no_tf() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=False,
        nav2_active=False,
        map_age_s=1.0,
        tf_age_s=999.0,
    )

    assert state.status == ReadinessStatus.LOCALIZING


def test_evaluate_readiness_no_nav2() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=True,
        nav2_active=False,
        map_age_s=1.0,
        tf_age_s=0.3,
    )

    assert state.status == ReadinessStatus.NOT_READY


def test_evaluate_readiness_stale_map() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=True,
        nav2_active=True,
        map_age_s=301.0,
        tf_age_s=1.0,
        max_map_age_s=300.0,
    )

    assert state.status == ReadinessStatus.DEGRADED


def test_evaluate_readiness_stale_tf() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=True,
        nav2_active=True,
        map_age_s=2.0,
        tf_age_s=6.0,
        max_tf_age_s=5.0,
    )

    assert state.status == ReadinessStatus.DEGRADED


def test_readiness_json_roundtrip() -> None:
    state = evaluate_readiness(
        map_received=True,
        tf_valid=True,
        nav2_active=True,
        map_age_s=0.5,
        tf_age_s=0.1,
    )

    encoded = readiness_to_json(state)
    decoded = json_to_readiness(encoded)

    assert decoded.status == state.status
    assert decoded.map_received == state.map_received
    assert decoded.tf_valid == state.tf_valid
    assert decoded.nav2_active == state.nav2_active
    assert len(decoded.checks) == len(state.checks)


def test_status_names_complete() -> None:
    assert set(STATUS_NAMES.keys()) == set(ReadinessStatus)

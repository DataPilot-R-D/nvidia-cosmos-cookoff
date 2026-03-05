import pytest

from sras_robot_situation_assessor.risk_assessment_core import (
    AlertOutput,
    BlindSpotInput,
    DetectionInput,
    RiskScore,
    combine_risks,
    compute_situation_assessment,
    risk_to_alert,
    score_blindspot_risk,
    score_detection_risk,
)


def test_score_detection_risk_person_high() -> None:
    detection = DetectionInput(
        detection_id="det-person-1",
        label="person",
        confidence=0.86,
        position=(0.5, 0.5, 0.0),
        source_camera_ids=["zone_restricted"],
    )

    risk = score_detection_risk(detection, proximity_threshold=2.0)

    assert risk.risk_level == 2
    assert risk.confidence == 0.86


def test_score_detection_risk_known_asset_low() -> None:
    detection = DetectionInput(
        detection_id="det-forklift-1",
        label="forklift",
        confidence=0.91,
        position=(3.0, 3.0, 0.0),
        source_camera_ids=["zone_loading"],
    )

    risk = score_detection_risk(detection)

    assert risk.risk_level == 0
    assert risk.recommended_action == "Continue monitoring."


def test_score_blindspot_risk_long_duration_critical() -> None:
    blindspot = BlindSpotInput(
        event_id="blind-1",
        camera_id="cam0",
        zone_id="zone_a",
        severity=3,
        confidence=0.93,
        duration_s=42.0,
        affected_asset_ids=["asset_01"],
    )

    risk = score_blindspot_risk(blindspot)

    assert risk.risk_level == 3
    assert risk.confidence == 0.93


def test_score_blindspot_risk_short_duration_low() -> None:
    blindspot = BlindSpotInput(
        event_id="blind-2",
        camera_id="cam1",
        zone_id="zone_b",
        severity=0,
        confidence=0.7,
        duration_s=2.0,
        affected_asset_ids=[],
    )

    risk = score_blindspot_risk(blindspot)

    assert risk.risk_level == 0


def test_combine_risks_takes_highest() -> None:
    risks = [
        RiskScore(0, 0.6, "low", "monitor", ["d1"], "zone_a"),
        RiskScore(2, 0.8, "high", "act", ["d2"], "zone_a"),
        RiskScore(1, 0.7, "medium", "check", ["d3"], "zone_a"),
    ]

    combined = combine_risks(risks)

    assert combined.risk_level == 2
    assert combined.recommended_action == "act"
    assert combined.confidence == pytest.approx((0.6 + 0.8 + 0.7) / 3.0)


def test_risk_to_alert_high_requires_action() -> None:
    risk = RiskScore(
        risk_level=2,
        confidence=0.8,
        description="High risk case",
        recommended_action="Dispatch now",
        source_detections=["d1"],
        zone_id="zone_a",
    )

    alert = risk_to_alert(risk)

    assert isinstance(alert, AlertOutput)
    assert alert.requires_action is True
    assert alert.severity == 2


def test_risk_to_alert_low_no_action() -> None:
    risk = RiskScore(
        risk_level=0,
        confidence=0.8,
        description="Low risk case",
        recommended_action="Observe",
        source_detections=["d1"],
        zone_id="zone_a",
    )

    alert = risk_to_alert(risk)

    assert alert.requires_action is False
    assert alert.severity == 0


def test_compute_situation_assessment_end_to_end() -> None:
    detections = [
        DetectionInput(
            detection_id="det-person-zone-a",
            label="person",
            confidence=0.88,
            position=(0.3, 0.2, 0.0),
            source_camera_ids=["zone_a"],
        ),
        DetectionInput(
            detection_id="det-forklift-zone-b",
            label="forklift",
            confidence=0.95,
            position=(4.0, 1.0, 0.0),
            source_camera_ids=["zone_b"],
        ),
    ]
    blindspots = [
        BlindSpotInput(
            event_id="blind-zone-a",
            camera_id="cam0",
            zone_id="zone_a",
            severity=2,
            confidence=0.9,
            duration_s=20.0,
            affected_asset_ids=["asset_07"],
        )
    ]

    risks, alerts = compute_situation_assessment(detections, blindspots, proximity_threshold=2.0)

    assert len(risks) == 2
    risk_map = {risk.zone_id: risk for risk in risks}
    assert risk_map["zone_a"].risk_level == 2
    assert risk_map["zone_b"].risk_level == 0
    assert len(alerts) == 1
    assert alerts[0].severity == 2
    assert alerts[0].requires_action is True

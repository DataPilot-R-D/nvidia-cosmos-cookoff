from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DetectionInput:
    detection_id: str
    label: str
    confidence: float
    position: tuple[float, float, float]
    source_camera_ids: list[str]


@dataclass
class BlindSpotInput:
    event_id: str
    camera_id: str
    zone_id: str
    severity: int
    confidence: float
    duration_s: float
    affected_asset_ids: list[str]


@dataclass
class RiskScore:
    risk_level: int
    confidence: float
    description: str
    recommended_action: str
    source_detections: list[str]
    zone_id: str


@dataclass
class AlertOutput:
    severity: int
    title: str
    message: str
    requires_action: bool
    related_task_id: str | None = None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _is_known_asset(label: str) -> bool:
    known_assets = {
        "forklift",
        "pallet",
        "box",
        "cart",
        "robot",
        "drone",
        "vehicle",
        "cone",
        "barrel",
    }
    return label.strip().lower() in known_assets


def _zone_from_detection(detection: DetectionInput) -> str:
    if detection.source_camera_ids:
        return detection.source_camera_ids[0]
    return "unknown"


def score_detection_risk(detection: DetectionInput, proximity_threshold: float = 2.0) -> RiskScore:
    label = detection.label.strip().lower()
    x, y, z = detection.position
    is_near_reference = (x * x + y * y + z * z) ** 0.5 <= max(0.0, proximity_threshold)

    if label == "person" and is_near_reference:
        level = 2
        description = "Person detected near a restricted operational area."
        action = "Dispatch nearby patrol and verify identity."
    elif _is_known_asset(label):
        level = 0
        description = f"Known asset '{detection.label}' observed with low local incident risk."
        action = "Continue monitoring."
    else:
        level = 1
        description = f"Unclassified object '{detection.label}' requires verification."
        action = "Request classification confirmation from operator or VLM."

    return RiskScore(
        risk_level=level,
        confidence=_clamp(float(detection.confidence), 0.0, 1.0),
        description=description,
        recommended_action=action,
        source_detections=[detection.detection_id],
        zone_id=_zone_from_detection(detection),
    )


def score_blindspot_risk(blindspot: BlindSpotInput) -> RiskScore:
    duration_s = float(blindspot.duration_s)
    if duration_s > 30.0:
        level = 3
        action = "Escalate immediately and dispatch physical verification."
    elif duration_s > 15.0:
        level = 2
        action = "Reposition camera or robot and verify the area."
    elif duration_s > 5.0:
        level = 1
        action = "Monitor and attempt rapid sensor recovery."
    else:
        level = 0
        action = "Continue monitoring."

    description = (
        f"Blind-spot in zone '{blindspot.zone_id}' from camera '{blindspot.camera_id}' "
        f"lasting {duration_s:.1f}s."
    )
    return RiskScore(
        risk_level=level,
        confidence=_clamp(float(blindspot.confidence), 0.0, 1.0),
        description=description,
        recommended_action=action,
        source_detections=[blindspot.event_id],
        zone_id=blindspot.zone_id or blindspot.camera_id,
    )


def combine_risks(risks: list[RiskScore]) -> RiskScore:
    if not risks:
        return RiskScore(
            risk_level=0,
            confidence=0.0,
            description="No active risk signals.",
            recommended_action="Continue monitoring.",
            source_detections=[],
            zone_id="unknown",
        )

    highest = max(risks, key=lambda risk: risk.risk_level)
    avg_confidence = sum(risk.confidence for risk in risks) / len(risks)

    source_detections: list[str] = []
    for risk in risks:
        for source in risk.source_detections:
            if source not in source_detections:
                source_detections.append(source)

    descriptions = " ".join(risk.description for risk in risks)
    if not descriptions:
        descriptions = "Risk signals combined."

    return RiskScore(
        risk_level=highest.risk_level,
        confidence=_clamp(avg_confidence, 0.0, 1.0),
        description=descriptions,
        recommended_action=highest.recommended_action,
        source_detections=source_detections,
        zone_id=highest.zone_id,
    )


def risk_to_alert(risk: RiskScore, source_node: str = "robot_situation_assessor") -> AlertOutput:
    title_by_level = {
        0: "Low Risk Observed",
        1: "Medium Risk Observed",
        2: "High Risk Incident",
        3: "Critical Risk Incident",
    }
    requires_action = risk.risk_level >= 2
    message = f"[{source_node}] {risk.description} Recommended: {risk.recommended_action}"

    return AlertOutput(
        severity=risk.risk_level,
        title=title_by_level.get(risk.risk_level, "Risk Incident"),
        message=message,
        requires_action=requires_action,
        related_task_id=None,
    )


def compute_situation_assessment(
    detections: list[DetectionInput],
    blindspots: list[BlindSpotInput],
    proximity_threshold: float = 2.0,
) -> tuple[list[RiskScore], list[AlertOutput]]:
    risks_by_zone: dict[str, list[RiskScore]] = {}

    for detection in detections:
        risk = score_detection_risk(detection, proximity_threshold=proximity_threshold)
        risks_by_zone.setdefault(risk.zone_id, []).append(risk)

    for blindspot in blindspots:
        risk = score_blindspot_risk(blindspot)
        risks_by_zone.setdefault(risk.zone_id, []).append(risk)

    combined_risks: list[RiskScore] = []
    alerts: list[AlertOutput] = []

    for zone_id in sorted(risks_by_zone.keys()):
        combined = combine_risks(risks_by_zone[zone_id])
        combined.zone_id = zone_id
        combined_risks.append(combined)
        if combined.risk_level >= 2:
            alerts.append(risk_to_alert(combined))

    return combined_risks, alerts

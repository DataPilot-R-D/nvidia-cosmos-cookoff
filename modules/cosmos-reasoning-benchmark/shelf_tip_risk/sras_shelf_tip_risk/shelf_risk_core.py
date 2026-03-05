from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass
class ShelfState:
    shelf_id: str
    tilt_deg: float
    position: tuple[float, float, float]
    is_loaded: bool = True


@dataclass
class WindowState:
    window_id: str
    is_open: bool
    open_offset_m: float
    position: tuple[float, float, float]


@dataclass
class EnvironmentFactors:
    wind_speed_mps: float = 0.0
    vibration_level: float = 0.0
    temperature_c: float = 20.0


@dataclass
class TipRiskAssessment:
    risk_level: int
    risk_score: float
    confidence: float
    description: str
    evidence: list[str]
    recommended_action: str
    shelf_id: str
    zone_id: str


TIP_RISK_THRESHOLDS = {
    "critical_tilt_deg": 25.0,
    "high_tilt_deg": 15.0,
    "medium_tilt_deg": 8.0,
}

DEFAULT_SHELF = ShelfState(
    shelf_id="shelf_01",
    tilt_deg=18.0,
    position=(6.2, 1.4, 0.75),
    is_loaded=True,
)

DEFAULT_WINDOW = WindowState(
    window_id="window_01",
    is_open=False,
    open_offset_m=0.8,
    position=(9.8, -4.4, 2.2),
)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _risk_level_from_tilt(tilt_deg: float) -> int:
    if tilt_deg >= TIP_RISK_THRESHOLDS["critical_tilt_deg"]:
        return 3
    if tilt_deg >= TIP_RISK_THRESHOLDS["high_tilt_deg"]:
        return 2
    if tilt_deg >= TIP_RISK_THRESHOLDS["medium_tilt_deg"]:
        return 1
    return 0


def _risk_level_from_score(risk_score: float) -> int:
    if risk_score >= 0.8:
        return 3
    if risk_score >= 0.5:
        return 2
    if risk_score >= 0.25:
        return 1
    return 0


def _recommended_action_for_level(risk_level: int) -> str:
    if risk_level >= 3:
        return "immediate_evacuation"
    if risk_level == 2:
        return "dispatch_robot_secure"
    if risk_level == 1:
        return "monitor_closely"
    return "no_action"


def compute_tip_risk(
    shelf: ShelfState,
    window: WindowState | None,
    env: EnvironmentFactors | None = None,
) -> TipRiskAssessment:
    env = env or EnvironmentFactors()
    evidence: list[str] = []

    tilt_deg = max(0.0, float(shelf.tilt_deg))
    base_score = _clamp(tilt_deg / 45.0)
    risk_score = base_score
    evidence.append(f"shelf_tilt_deg={tilt_deg:.2f}")

    if window is not None and window.is_open:
        risk_score += 0.2
        evidence.append(f"window_open offset_m={float(window.open_offset_m):.2f}")

    if float(env.wind_speed_mps) > 5.0:
        risk_score += 0.15
        evidence.append(f"high_wind_mps={float(env.wind_speed_mps):.2f}")

    if float(env.vibration_level) > 0.5:
        risk_score += 0.1
        evidence.append(f"high_vibration={float(env.vibration_level):.2f}")

    if shelf.is_loaded:
        risk_score += 0.1
        evidence.append("shelf_loaded=true")

    risk_score = _clamp(risk_score)
    risk_level = max(_risk_level_from_score(risk_score), _risk_level_from_tilt(tilt_deg))

    description = (
        f"Shelf '{shelf.shelf_id}' tip-risk level {risk_level} with score {risk_score:.2f}; "
        f"tilt={tilt_deg:.1f}deg."
    )
    recommended_action = _recommended_action_for_level(risk_level)
    confidence = _clamp(0.55 + 0.4 * risk_score)

    return TipRiskAssessment(
        risk_level=risk_level,
        risk_score=risk_score,
        confidence=confidence,
        description=description,
        evidence=evidence,
        recommended_action=recommended_action,
        shelf_id=shelf.shelf_id,
        zone_id="shelf_zone",
    )


def assessment_to_json(assessment: TipRiskAssessment) -> str:
    return json.dumps(asdict(assessment), sort_keys=True)

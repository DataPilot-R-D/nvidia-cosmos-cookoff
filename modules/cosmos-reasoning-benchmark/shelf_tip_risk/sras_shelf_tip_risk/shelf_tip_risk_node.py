from __future__ import annotations

import json
import uuid
from typing import Any

import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent, RiskAssessment

from .shelf_risk_core import (
    DEFAULT_SHELF,
    DEFAULT_WINDOW,
    EnvironmentFactors,
    ShelfState,
    WindowState,
    assessment_to_json,
    compute_tip_risk,
)


class ShelfTipRiskNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_shelf_tip_risk")
        self._declare_parameters()
        self._load_config()
        self._setup_state()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("asset_states_topic", "/perception/asset_states")
        self.declare_parameter("blindspot_events_topic", "/reasoning/blindspot_events")
        self.declare_parameter("risk_assessments_topic", "/reasoning/risk_assessments")
        self.declare_parameter("assessment_interval_s", 2.0)
        self.declare_parameter("shelf_tilt_deg", 18.0)
        self.declare_parameter("shelf_position", [6.2, 1.4, 0.75])
        self.declare_parameter("window_position", [9.8, -4.4, 2.2])
        self.declare_parameter("window_open_offset_m", 0.8)
        self.declare_parameter("zone_id", "shelf_zone")

    def _load_config(self) -> None:
        self.asset_states_topic = str(self.get_parameter("asset_states_topic").value)
        self.blindspot_events_topic = str(self.get_parameter("blindspot_events_topic").value)
        self.risk_assessments_topic = str(self.get_parameter("risk_assessments_topic").value)
        self.assessment_interval_s = float(self.get_parameter("assessment_interval_s").value)

        shelf_position_param = self.get_parameter("shelf_position").value
        window_position_param = self.get_parameter("window_position").value

        self.zone_id = str(self.get_parameter("zone_id").value)

        self.default_shelf = ShelfState(
            shelf_id=DEFAULT_SHELF.shelf_id,
            tilt_deg=float(self.get_parameter("shelf_tilt_deg").value),
            position=self._as_position_tuple(shelf_position_param, DEFAULT_SHELF.position),
            is_loaded=True,
        )
        self.default_window = WindowState(
            window_id=DEFAULT_WINDOW.window_id,
            is_open=False,
            open_offset_m=float(self.get_parameter("window_open_offset_m").value),
            position=self._as_position_tuple(window_position_param, DEFAULT_WINDOW.position),
        )

    def _setup_state(self) -> None:
        self.latest_shelf: ShelfState = self.default_shelf
        self.latest_window: WindowState = self.default_window
        self.latest_env = EnvironmentFactors()
        self.force_window_open = False
        self.current_assessment = compute_tip_risk(
            shelf=self.latest_shelf,
            window=self.latest_window,
            env=self.latest_env,
        )
        self.current_assessment.zone_id = self.zone_id

    def _setup_ros(self) -> None:
        self.risk_pub = self.create_publisher(RiskAssessment, self.risk_assessments_topic, 10)
        self.create_subscription(String, self.asset_states_topic, self._on_asset_states, 10)
        self.create_subscription(BlindSpotEvent, self.blindspot_events_topic, self._on_blindspot_event, 10)

        self.timer = self.create_timer(self.assessment_interval_s, self._on_timer)
        self.status_srv = self.create_service(Trigger, "~/get_status", self._handle_get_status)
        self.window_srv = self.create_service(Trigger, "~/simulate_window_open", self._handle_simulate_window_open)

    def _on_asset_states(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warning("invalid JSON received on asset_states topic")
            return

        assets = payload.get("assets", payload if isinstance(payload, list) else [])
        if not isinstance(assets, list):
            return

        parsed_shelf = self.latest_shelf
        parsed_window = self.latest_window

        for raw_asset in assets:
            if not isinstance(raw_asset, dict):
                continue

            if self._is_shelf_asset(raw_asset):
                tilt_deg = self._first_numeric(raw_asset, ["tilt_deg", "tilt", "shelf_tilt_deg"], parsed_shelf.tilt_deg)
                position = self._parse_position(raw_asset, parsed_shelf.position)
                is_loaded = bool(raw_asset.get("is_loaded", parsed_shelf.is_loaded))
                parsed_shelf = ShelfState(
                    shelf_id=str(raw_asset.get("asset_id", parsed_shelf.shelf_id)),
                    tilt_deg=float(tilt_deg),
                    position=position,
                    is_loaded=is_loaded,
                )

            if self._is_window_asset(raw_asset):
                is_open = self._parse_window_open(raw_asset, parsed_window.is_open)
                open_offset_m = self._first_numeric(
                    raw_asset,
                    ["open_offset_m", "window_open_offset_m", "offset_m"],
                    parsed_window.open_offset_m,
                )
                position = self._parse_position(raw_asset, parsed_window.position)
                parsed_window = WindowState(
                    window_id=str(raw_asset.get("asset_id", parsed_window.window_id)),
                    is_open=bool(is_open),
                    open_offset_m=float(open_offset_m),
                    position=position,
                )

        wind_speed_mps = self._first_numeric(payload, ["wind_speed_mps", "wind_mps"], self.latest_env.wind_speed_mps)
        vibration_level = self._first_numeric(payload, ["vibration_level"], self.latest_env.vibration_level)
        temperature_c = self._first_numeric(payload, ["temperature_c"], self.latest_env.temperature_c)

        self.latest_shelf = parsed_shelf
        self.latest_window = parsed_window
        self.latest_env = EnvironmentFactors(
            wind_speed_mps=float(wind_speed_mps),
            vibration_level=float(vibration_level),
            temperature_c=float(temperature_c),
        )

    def _on_blindspot_event(self, msg: BlindSpotEvent) -> None:
        parts = [msg.event_id, msg.zone_id, msg.camera_id, msg.description]
        signal = " ".join(str(item).lower() for item in parts if item)
        has_window_asset = any("window" in str(asset_id).lower() for asset_id in msg.affected_asset_ids)

        if "window_open" in signal or "window open" in signal or has_window_asset:
            self.latest_window = WindowState(
                window_id=self.latest_window.window_id,
                is_open=True,
                open_offset_m=self.latest_window.open_offset_m,
                position=self.latest_window.position,
            )

    def _on_timer(self) -> None:
        window_for_assessment = WindowState(
            window_id=self.latest_window.window_id,
            is_open=(self.latest_window.is_open or self.force_window_open),
            open_offset_m=self.latest_window.open_offset_m,
            position=self.latest_window.position,
        )

        assessment = compute_tip_risk(
            shelf=self.latest_shelf,
            window=window_for_assessment,
            env=self.latest_env,
        )
        assessment.zone_id = self.zone_id
        self.current_assessment = assessment

        msg = self._build_risk_assessment_msg(assessment)
        self.risk_pub.publish(msg)

    def _build_risk_assessment_msg(self, assessment) -> RiskAssessment:
        now = self.get_clock().now().to_msg()
        msg = RiskAssessment()
        msg.header.stamp = now
        msg.header.frame_id = self.zone_id
        msg.assessment_id = str(uuid.uuid4())
        msg.risk_level = int(assessment.risk_level)
        msg.confidence = float(assessment.confidence)
        msg.description = assessment.description
        msg.source_detections = list(assessment.evidence)
        msg.recommended_action = assessment.recommended_action
        msg.zone_id = self.zone_id
        msg.timestamp_assessed = self._to_time_msg(now)
        return msg

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = assessment_to_json(self.current_assessment)
        return response

    def _handle_simulate_window_open(
        self,
        _request: Trigger.Request,
        response: Trigger.Response,
    ) -> Trigger.Response:
        self.force_window_open = True
        response.success = True
        response.message = "window_open forced true"
        return response

    def _to_time_msg(self, stamp: TimeMsg) -> TimeMsg:
        msg = TimeMsg()
        msg.sec = int(stamp.sec)
        msg.nanosec = int(stamp.nanosec)
        return msg

    def _as_position_tuple(
        self,
        raw_value: Any,
        default: tuple[float, float, float],
    ) -> tuple[float, float, float]:
        if isinstance(raw_value, list) and len(raw_value) >= 3:
            try:
                return (float(raw_value[0]), float(raw_value[1]), float(raw_value[2]))
            except (TypeError, ValueError):
                return default
        return default

    def _parse_position(
        self,
        raw_asset: dict[str, Any],
        default: tuple[float, float, float],
    ) -> tuple[float, float, float]:
        position_raw = raw_asset.get("position", {})
        if isinstance(position_raw, dict):
            try:
                return (
                    float(position_raw.get("x", default[0])),
                    float(position_raw.get("y", default[1])),
                    float(position_raw.get("z", default[2])),
                )
            except (TypeError, ValueError):
                return default

        if isinstance(position_raw, list) and len(position_raw) >= 3:
            try:
                return (float(position_raw[0]), float(position_raw[1]), float(position_raw[2]))
            except (TypeError, ValueError):
                return default

        return default

    def _parse_window_open(self, raw_asset: dict[str, Any], default: bool) -> bool:
        if "is_open" in raw_asset:
            return bool(raw_asset.get("is_open"))
        if "open" in raw_asset:
            return bool(raw_asset.get("open"))
        state = str(raw_asset.get("state", "")).strip().lower()
        if state:
            return state in {"open", "opened", "window_open"}
        return default

    def _first_numeric(self, payload: dict[str, Any], keys: list[str], default: float) -> float:
        for key in keys:
            if key not in payload:
                continue
            try:
                return float(payload[key])
            except (TypeError, ValueError):
                continue
        return float(default)

    def _is_shelf_asset(self, raw_asset: dict[str, Any]) -> bool:
        text = " ".join(
            [
                str(raw_asset.get("asset_id", "")),
                str(raw_asset.get("label", "")),
                str(raw_asset.get("prim_path", "")),
            ]
        ).lower()
        return "shelf" in text

    def _is_window_asset(self, raw_asset: dict[str, Any]) -> bool:
        text = " ".join(
            [
                str(raw_asset.get("asset_id", "")),
                str(raw_asset.get("label", "")),
                str(raw_asset.get("prim_path", "")),
            ]
        ).lower()
        return "window" in text


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = ShelfTipRiskNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

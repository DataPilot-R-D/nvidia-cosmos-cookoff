from __future__ import annotations

import json
import uuid
from typing import Any

import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent, OperatorAlert, RiskAssessment

from .risk_assessment_core import BlindSpotInput, DetectionInput, compute_situation_assessment


class RobotSituationAssessorNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_robot_situation_assessor")
        self._declare_parameters()
        self._load_config()
        self._setup_state()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("assessment_interval_s", 3.0)
        self.declare_parameter("proximity_threshold", 2.0)
        self.declare_parameter("detections_topic", "/perception/detections_3d")
        self.declare_parameter("blindspot_events_topic", "/reasoning/blindspot_events")

    def _load_config(self) -> None:
        self.assessment_interval_s = float(self.get_parameter("assessment_interval_s").value)
        self.proximity_threshold = float(self.get_parameter("proximity_threshold").value)
        self.detections_topic = str(self.get_parameter("detections_topic").value)
        self.blindspot_events_topic = str(self.get_parameter("blindspot_events_topic").value)

    def _setup_state(self) -> None:
        self.latest_detections: list[DetectionInput] = []
        self.latest_blindspots: dict[str, BlindSpotInput] = {}
        self.stats = {
            "ticks": 0,
            "risk_assessments_published": 0,
            "alerts_published": 0,
            "errors": 0,
        }

    def _setup_ros(self) -> None:
        self.risk_pub = self.create_publisher(RiskAssessment, "/reasoning/risk_assessments", 10)
        self.alert_pub = self.create_publisher(OperatorAlert, "/ui/alerts", 10)
        self.summary_pub = self.create_publisher(String, "~/assessment_summary", 10)

        self.create_subscription(String, self.detections_topic, self._on_detections, 10)
        self.create_subscription(BlindSpotEvent, self.blindspot_events_topic, self._on_blindspot_event, 10)

        self.timer = self.create_timer(self.assessment_interval_s, self._on_assessment_timer)
        self.status_srv = self.create_service(Trigger, "~/get_status", self._handle_get_status)

    def _on_detections(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warning("invalid JSON on detections topic")
            return

        raw_items = payload.get("detections", payload if isinstance(payload, list) else [])
        if not isinstance(raw_items, list):
            self.latest_detections = []
            return

        parsed: list[DetectionInput] = []
        for item in raw_items:
            detection = self._parse_detection(item)
            if detection is not None:
                parsed.append(detection)
        self.latest_detections = parsed

    def _on_blindspot_event(self, msg: BlindSpotEvent) -> None:
        event = BlindSpotInput(
            event_id=msg.event_id,
            camera_id=msg.camera_id,
            zone_id=msg.zone_id,
            severity=int(msg.severity),
            confidence=float(msg.confidence),
            duration_s=float(msg.duration_s),
            affected_asset_ids=[str(asset_id) for asset_id in msg.affected_asset_ids],
        )
        key = msg.event_id or f"{msg.camera_id}:{msg.zone_id}"
        self.latest_blindspots[key] = event

    def _on_assessment_timer(self) -> None:
        self.stats["ticks"] += 1
        now = self.get_clock().now()
        now_s = now.nanoseconds / 1e9

        try:
            risks, alerts = compute_situation_assessment(
                detections=self.latest_detections,
                blindspots=list(self.latest_blindspots.values()),
                proximity_threshold=self.proximity_threshold,
            )

            for risk in risks:
                msg = self._build_risk_assessment_msg(risk, now_s)
                self.risk_pub.publish(msg)
                self.stats["risk_assessments_published"] += 1

            for alert in alerts:
                msg = self._build_operator_alert_msg(alert, now_s)
                self.alert_pub.publish(msg)
                self.stats["alerts_published"] += 1

            summary = {
                "timestamp_s": now_s,
                "risk_count": len(risks),
                "alert_count": len(alerts),
                "highest_risk_level": max((risk.risk_level for risk in risks), default=0),
                "zones": [risk.zone_id for risk in risks],
                "stats": dict(self.stats),
            }
            self._publish_summary(summary)
        except Exception as exc:  # noqa: BLE001
            self.stats["errors"] += 1
            self.get_logger().error(f"assessment tick failed: {exc}")

    def _parse_detection(self, raw: Any) -> DetectionInput | None:
        if not isinstance(raw, dict):
            return None

        position_raw = raw.get("position", {})
        if not isinstance(position_raw, dict):
            position_raw = {}

        source_camera_ids_raw = raw.get("source_camera_ids", [])
        if isinstance(source_camera_ids_raw, list):
            source_camera_ids = [str(value) for value in source_camera_ids_raw]
        else:
            source_camera_ids = []

        detection_id = str(raw.get("detection_id", "")).strip() or str(uuid.uuid4())
        label = str(raw.get("label", "unknown")).strip() or "unknown"
        confidence = float(raw.get("confidence", 0.0))
        position = (
            float(position_raw.get("x", 0.0)),
            float(position_raw.get("y", 0.0)),
            float(position_raw.get("z", 0.0)),
        )

        return DetectionInput(
            detection_id=detection_id,
            label=label,
            confidence=confidence,
            position=position,
            source_camera_ids=source_camera_ids,
        )

    def _build_risk_assessment_msg(self, risk, now_s: float) -> RiskAssessment:
        msg = RiskAssessment()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = risk.zone_id
        msg.assessment_id = str(uuid.uuid4())
        msg.risk_level = int(risk.risk_level)
        msg.confidence = float(risk.confidence)
        msg.description = risk.description
        msg.source_detections = list(risk.source_detections)
        msg.recommended_action = risk.recommended_action
        msg.zone_id = risk.zone_id
        msg.timestamp_assessed = self._to_time_msg(now_s)
        return msg

    def _build_operator_alert_msg(self, alert, now_s: float) -> OperatorAlert:
        msg = OperatorAlert()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = "operations"
        msg.alert_id = str(uuid.uuid4())
        msg.severity = int(alert.severity)
        msg.title = alert.title
        msg.message = alert.message
        msg.source_node = "robot_situation_assessor"
        msg.related_task_id = alert.related_task_id or ""
        msg.requires_action = bool(alert.requires_action)
        msg.timestamp_created = self._to_time_msg(now_s)
        return msg

    def _publish_summary(self, payload: dict[str, Any]) -> None:
        msg = String()
        msg.data = json.dumps(payload)
        self.summary_pub.publish(msg)

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        status = {
            "stats": dict(self.stats),
            "buffered_detections": len(self.latest_detections),
            "buffered_blindspots": len(self.latest_blindspots),
        }
        response.success = True
        response.message = json.dumps(status)
        return response

    def _to_time_msg(self, stamp_s: float) -> TimeMsg:
        secs = int(stamp_s)
        nanosecs = int((stamp_s - secs) * 1_000_000_000)
        msg = TimeMsg()
        msg.sec = secs
        msg.nanosec = nanosecs
        return msg


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = RobotSituationAssessorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

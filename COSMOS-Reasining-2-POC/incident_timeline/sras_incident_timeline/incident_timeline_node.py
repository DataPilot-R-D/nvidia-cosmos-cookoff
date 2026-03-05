from __future__ import annotations

import json
from threading import Lock
from typing import Any

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent, OperatorAlert, RiskAssessment, RobotTask, TaskStatus

from .timeline_core import (
    Timeline,
    alert_to_event,
    blindspot_to_event,
    risk_to_event,
    system_status_to_dict,
    task_request_to_event,
    task_status_to_event,
)


class IncidentTimelineNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_incident_timeline")
        self._lock = Lock()
        self._declare_parameters()
        self._load_parameters()

        self.timeline = Timeline(max_events=self.max_events)

        self.timeline_pub = self.create_publisher(String, "~/timeline_feed", 10)

        self.create_subscription(BlindSpotEvent, self.blindspot_events_topic, self._on_blindspot, 20)
        self.create_subscription(RiskAssessment, self.risk_assessments_topic, self._on_risk, 20)
        self.create_subscription(TaskStatus, self.task_status_topic, self._on_task_status, 20)
        self.create_subscription(OperatorAlert, self.operator_alerts_topic, self._on_alert, 20)
        self.create_subscription(RobotTask, self.task_requests_topic, self._on_task_request, 20)

        self.create_service(Trigger, "~/get_timeline", self._handle_get_timeline)
        self.create_service(Trigger, "~/get_status", self._handle_get_status)
        self.create_timer(self.feed_interval_s, self._publish_feed)

    def _declare_parameters(self) -> None:
        self.declare_parameter("max_events", 500)
        self.declare_parameter("feed_interval_s", 2.0)
        self.declare_parameter("blindspot_events_topic", "/reasoning/blindspot_events")
        self.declare_parameter("risk_assessments_topic", "/reasoning/risk_assessments")
        self.declare_parameter("task_status_topic", "/robot/task_status")
        self.declare_parameter("operator_alerts_topic", "/ui/alerts")
        self.declare_parameter("task_requests_topic", "/reasoning/task_requests")

    def _load_parameters(self) -> None:
        self.max_events = int(self.get_parameter("max_events").value)
        self.feed_interval_s = float(self.get_parameter("feed_interval_s").value)
        self.blindspot_events_topic = str(self.get_parameter("blindspot_events_topic").value)
        self.risk_assessments_topic = str(self.get_parameter("risk_assessments_topic").value)
        self.task_status_topic = str(self.get_parameter("task_status_topic").value)
        self.operator_alerts_topic = str(self.get_parameter("operator_alerts_topic").value)
        self.task_requests_topic = str(self.get_parameter("task_requests_topic").value)

    def _on_blindspot(self, msg: BlindSpotEvent) -> None:
        data = {
            "event_id": msg.event_id,
            "zone_id": msg.zone_id,
            "severity": int(msg.severity),
            "event_type": "blindspot_event",
            "description": msg.description,
            "source_cameras": [msg.camera_id] if msg.camera_id else [],
            "affected_assets": list(msg.affected_asset_ids),
            "timestamp_detected": self._stamp_to_dict(msg.timestamp_detected),
            "confidence": float(msg.confidence),
            "duration_s": float(msg.duration_s),
        }
        self._add_event(blindspot_to_event(data))

    def _on_risk(self, msg: RiskAssessment) -> None:
        data = {
            "assessment_id": msg.assessment_id,
            "zone_id": msg.zone_id,
            "risk_level": int(msg.risk_level),
            "risk_score": float(msg.confidence),
            "recommended_action": msg.recommended_action,
            "evidence": list(msg.source_detections),
            "description": msg.description,
            "timestamp_assessed": self._stamp_to_dict(msg.timestamp_assessed),
        }
        self._add_event(risk_to_event(data))

    def _on_task_status(self, msg: TaskStatus) -> None:
        data = {
            "task_id": msg.task_id,
            "status": int(msg.status),
            "progress_pct": float(msg.progress_pct),
            "current_pose": self._pose_to_dict(msg.current_pose),
            "status_message": msg.status_message,
            "timestamp_updated": self._stamp_to_dict(msg.timestamp_updated),
        }
        self._add_event(task_status_to_event(data))

    def _on_alert(self, msg: OperatorAlert) -> None:
        data = {
            "alert_id": msg.alert_id,
            "severity": int(msg.severity),
            "title": msg.title,
            "message": msg.message,
            "source_node": msg.source_node,
            "related_task_id": msg.related_task_id,
            "requires_action": bool(msg.requires_action),
            "timestamp_created": self._stamp_to_dict(msg.timestamp_created),
        }
        self._add_event(alert_to_event(data))

    def _on_task_request(self, msg: RobotTask) -> None:
        data = {
            "task_id": msg.task_id,
            "task_type": int(msg.task_type),
            "priority": int(msg.priority),
            "description": msg.description,
            "parameters": [msg.source_event_id],
            "timeout_s": float(msg.timeout_s),
            "timestamp_s": self._stamp_to_seconds(msg.header.stamp),
            "source_event_id": msg.source_event_id,
            "auto_approved": bool(msg.auto_approved),
        }
        self._add_event(task_request_to_event(data))

    def _add_event(self, event: Any) -> None:
        with self._lock:
            self.timeline.add_event(event)

    def _publish_feed(self) -> None:
        with self._lock:
            payload = self.timeline.to_json(limit=50)
        self.timeline_pub.publish(String(data=payload))

    def _handle_get_timeline(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        with self._lock:
            response.message = self.timeline.to_json(limit=self.max_events)
        response.success = True
        return response

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        with self._lock:
            status_payload = json.dumps(system_status_to_dict(self.timeline.get_status()), sort_keys=True)
        response.message = status_payload
        response.success = True
        return response

    def _pose_to_dict(self, pose_stamped: Any) -> dict[str, Any]:
        return {
            "frame_id": pose_stamped.header.frame_id,
            "position": {
                "x": float(pose_stamped.pose.position.x),
                "y": float(pose_stamped.pose.position.y),
                "z": float(pose_stamped.pose.position.z),
            },
            "orientation": {
                "x": float(pose_stamped.pose.orientation.x),
                "y": float(pose_stamped.pose.orientation.y),
                "z": float(pose_stamped.pose.orientation.z),
                "w": float(pose_stamped.pose.orientation.w),
            },
        }

    def _stamp_to_dict(self, stamp: Any) -> dict[str, int]:
        return {"sec": int(stamp.sec), "nanosec": int(stamp.nanosec)}

    def _stamp_to_seconds(self, stamp: Any) -> float:
        return float(stamp.sec) + float(stamp.nanosec) / 1_000_000_000.0


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = IncidentTimelineNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

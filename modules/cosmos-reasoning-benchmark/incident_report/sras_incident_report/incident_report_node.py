from __future__ import annotations

import json
import uuid
from threading import Lock
from typing import Any

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import OperatorAlert

from .report_core import generate_report, report_to_json


class IncidentReportNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_incident_report")
        self._lock = Lock()

        self._declare_parameters()
        self._load_parameters()

        self._events_by_incident: dict[str, list[dict[str, Any]]] = {}
        self._task_to_incident: dict[str, str] = {}
        self._last_report_json = ""

        self.report_pub = self.create_publisher(String, self.report_topic, 10)

        self.create_subscription(String, self.timeline_events_topic, self._on_timeline_events, 20)
        self.create_subscription(OperatorAlert, "/ui/alerts", self._on_operator_alert, 20)

        self.create_service(Trigger, "~/generate_report", self._handle_generate_report)
        self.create_service(Trigger, "~/get_last_report", self._handle_get_last_report)

    def _declare_parameters(self) -> None:
        self.declare_parameter("auto_generate_on_closure", True)
        self.declare_parameter("max_buffer_events", 200)
        self.declare_parameter("report_topic", "/reasoning/incident_reports")
        self.declare_parameter("timeline_events_topic", "/reasoning/timeline_feed")

    def _load_parameters(self) -> None:
        self.auto_generate_on_closure = bool(self.get_parameter("auto_generate_on_closure").value)
        self.max_buffer_events = max(1, int(self.get_parameter("max_buffer_events").value))
        self.report_topic = str(self.get_parameter("report_topic").value)
        self.timeline_events_topic = str(self.get_parameter("timeline_events_topic").value)

    def _on_timeline_events(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warning("invalid timeline JSON payload")
            return

        events: list[dict[str, Any]] = []
        if isinstance(payload, dict):
            if isinstance(payload.get("timeline"), list):
                events = [item for item in payload["timeline"] if isinstance(item, dict)]
            elif isinstance(payload.get("events"), list):
                events = [item for item in payload["events"] if isinstance(item, dict)]
        elif isinstance(payload, list):
            events = [item for item in payload if isinstance(item, dict)]

        if not events:
            return

        with self._lock:
            for event in sorted(events, key=lambda item: float(item.get("timestamp_s", 0.0))):
                incident_id = self._incident_id_for_event(event)
                bucket = self._events_by_incident.setdefault(incident_id, [])
                bucket.append(event)
                if len(bucket) > self.max_buffer_events:
                    self._events_by_incident[incident_id] = bucket[-self.max_buffer_events :]

                task_id = str(event.get("related_task_id", "")).strip()
                if task_id:
                    self._task_to_incident[task_id] = incident_id

    def _on_operator_alert(self, msg: OperatorAlert) -> None:
        title = (msg.title or "").strip().lower()
        is_closure = ("resolved" in title) or ("closed" in title)
        if not is_closure:
            return

        if not self.auto_generate_on_closure:
            return

        with self._lock:
            candidates = self._candidate_incidents_for_alert(msg)
            reports = [self._generate_report_locked(incident_id) for incident_id in candidates]

        for report_json in reports:
            if not report_json:
                continue
            self.report_pub.publish(String(data=report_json))

    def _candidate_incidents_for_alert(self, msg: OperatorAlert) -> list[str]:
        task_id = (msg.related_task_id or "").strip()
        if task_id and task_id in self._task_to_incident:
            return [self._task_to_incident[task_id]]

        if len(self._events_by_incident) == 1:
            return list(self._events_by_incident.keys())

        title = (msg.title or "").lower()
        description = (msg.message or "").lower()
        text = f"{title} {description}"
        matched = [incident_id for incident_id in self._events_by_incident if incident_id.lower() in text]
        if matched:
            return matched

        return list(self._events_by_incident.keys())

    def _incident_id_for_event(self, event: dict[str, Any]) -> str:
        zone_id = str(event.get("zone_id", "")).strip()
        if zone_id:
            return zone_id

        task_id = str(event.get("related_task_id", "")).strip()
        if task_id and task_id in self._task_to_incident:
            return self._task_to_incident[task_id]

        for incident_id, incident_events in self._events_by_incident.items():
            if incident_events:
                event_zone = str(incident_events[0].get("zone_id", "")).strip()
                if event_zone:
                    return incident_id

        return "incident_default"

    def _generate_report_locked(self, incident_id: str) -> str:
        events = list(self._events_by_incident.get(incident_id, []))
        if not events:
            return ""

        report = generate_report(
            incident_id=incident_id,
            events=events,
            report_id=f"{incident_id}-{uuid.uuid4()}",
        )
        report_json = report_to_json(report)
        self._last_report_json = report_json
        return report_json

    def _handle_generate_report(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        with self._lock:
            if not self._events_by_incident:
                response.success = False
                response.message = "no events available"
                return response

            incident_id = max(
                self._events_by_incident,
                key=lambda key: len(self._events_by_incident.get(key, [])),
            )
            report_json = self._generate_report_locked(incident_id)

        if not report_json:
            response.success = False
            response.message = "report generation failed"
            return response

        self.report_pub.publish(String(data=report_json))
        response.success = True
        response.message = report_json
        return response

    def _handle_get_last_report(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        if not self._last_report_json:
            response.success = False
            response.message = "no report generated yet"
            return response

        response.success = True
        response.message = self._last_report_json
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = IncidentReportNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

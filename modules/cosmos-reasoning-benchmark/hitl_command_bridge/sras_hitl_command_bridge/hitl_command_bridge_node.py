from __future__ import annotations

import json
import time
from concurrent.futures import Future
from typing import Any

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import OperatorAlert, TaskStatus
from warehouse_security_msgs.srv import SetTaskState

from .hitl_command_core import (
    CommandRequest,
    CommandResponse,
    STATUS_NAMES,
    TaskCommand,
    TaskStateView,
    json_to_command,
    response_to_json,
    task_status_to_view,
    validate_command,
)


class HITLCommandBridgeNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_hitl_command_bridge")
        self._declare_parameters()
        self._load_parameters()

        self.task_states: dict[str, TaskStateView] = {}
        self.latest_alert: dict[str, Any] = {}
        self.stats = {
            "commands_received": 0,
            "commands_valid": 0,
            "commands_rejected": 0,
            "service_calls": 0,
            "service_failures": 0,
            "status_messages": 0,
            "alerts_messages": 0,
        }

        self.results_pub = self.create_publisher(String, "~/command_results", 10)
        self.task_states_pub = self.create_publisher(String, "~/task_states", 10)

        self.create_subscription(TaskStatus, self.task_status_topic, self._on_task_status, 20)
        self.create_subscription(OperatorAlert, self.alerts_topic, self._on_alert, 20)
        self.create_subscription(String, self.command_topic, self._on_command_json, 20)

        self.set_task_state_client = self.create_client(SetTaskState, self.set_task_state_service)
        self.status_srv = self.create_service(Trigger, "~/get_status", self._handle_get_status)
        self.timer = self.create_timer(1.0, self._publish_task_states)

    def _declare_parameters(self) -> None:
        self.declare_parameter("task_status_topic", "/robot/task_status")
        self.declare_parameter("alerts_topic", "/ui/alerts")
        self.declare_parameter("command_topic", "/ui/set_task_state")
        self.declare_parameter("set_task_state_service", "/robot/set_task_state")

    def _load_parameters(self) -> None:
        self.task_status_topic = str(self.get_parameter("task_status_topic").value)
        self.alerts_topic = str(self.get_parameter("alerts_topic").value)
        self.command_topic = str(self.get_parameter("command_topic").value)
        self.set_task_state_service = str(self.get_parameter("set_task_state_service").value)

    def _on_task_status(self, msg: TaskStatus) -> None:
        self.stats["status_messages"] += 1
        view = task_status_to_view(
            {
                "task_id": msg.task_id,
                "status": int(msg.status),
                "progress_pct": float(msg.progress_pct),
                "status_message": msg.status_message,
                "timestamp_updated_s": float(msg.timestamp_updated.sec)
                + float(msg.timestamp_updated.nanosec) / 1_000_000_000.0,
            }
        )
        self.task_states[view.task_id] = view

    def _on_alert(self, msg: OperatorAlert) -> None:
        self.stats["alerts_messages"] += 1
        self.latest_alert = {
            "alert_id": msg.alert_id,
            "severity": int(msg.severity),
            "title": msg.title,
            "message": msg.message,
            "source_node": msg.source_node,
            "related_task_id": msg.related_task_id,
            "requires_action": bool(msg.requires_action),
            "timestamp_created_s": float(msg.timestamp_created.sec)
            + float(msg.timestamp_created.nanosec) / 1_000_000_000.0,
        }

    def _on_command_json(self, msg: String) -> None:
        self.stats["commands_received"] += 1

        try:
            request = json_to_command(msg.data)
        except Exception as exc:  # noqa: BLE001
            self.stats["commands_rejected"] += 1
            self._publish_response(
                CommandResponse(
                    success=False,
                    message=f"invalid command JSON: {exc}",
                    current_state=-1,
                    task_id="",
                )
            )
            return

        is_valid, validation_message = validate_command(request)
        if not is_valid:
            self.stats["commands_rejected"] += 1
            self._publish_response(
                CommandResponse(
                    success=False,
                    message=validation_message,
                    current_state=-1,
                    task_id=request.task_id,
                )
            )
            return

        self.stats["commands_valid"] += 1
        self._call_set_task_state(request)

    def _call_set_task_state(self, request: CommandRequest) -> None:
        if not self.set_task_state_client.wait_for_service(timeout_sec=0.2):
            self.stats["service_failures"] += 1
            self._publish_response(
                CommandResponse(
                    success=False,
                    message=f"service unavailable: {self.set_task_state_service}",
                    current_state=-1,
                    task_id=request.task_id,
                )
            )
            return

        service_request = SetTaskState.Request()
        service_request.task_id = request.task_id
        service_request.requested_state = int(request.command)
        service_request.reason = request.reason

        self.stats["service_calls"] += 1
        future = self.set_task_state_client.call_async(service_request)
        future.add_done_callback(lambda done: self._on_set_task_state_done(done, request))

    def _on_set_task_state_done(self, future: Future, request: CommandRequest) -> None:
        try:
            response = future.result()
        except Exception as exc:  # noqa: BLE001
            self.stats["service_failures"] += 1
            self._publish_response(
                CommandResponse(
                    success=False,
                    message=f"service call failed: {exc}",
                    current_state=-1,
                    task_id=request.task_id,
                )
            )
            return

        self._publish_response(
            CommandResponse(
                success=bool(response.success),
                message=str(response.message),
                current_state=int(response.current_state),
                task_id=request.task_id,
            )
        )

    def _publish_response(self, response: CommandResponse) -> None:
        msg = String()
        msg.data = response_to_json(response)
        self.results_pub.publish(msg)

    def _publish_task_states(self) -> None:
        states = [
            {
                "task_id": view.task_id,
                "status": view.status,
                "status_name": STATUS_NAMES.get(view.status, "UNKNOWN"),
                "progress_pct": view.progress_pct,
                "status_message": view.status_message,
                "last_updated_s": view.last_updated_s,
            }
            for view in sorted(self.task_states.values(), key=lambda entry: entry.task_id)
        ]

        payload = {
            "task_states": states,
            "latest_alert": self.latest_alert,
            "timestamp_s": time.time(),
            "count": len(states),
        }

        msg = String()
        msg.data = json.dumps(payload)
        self.task_states_pub.publish(msg)

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = json.dumps(
            {
                "stats": dict(self.stats),
                "tracked_tasks": len(self.task_states),
                "latest_alert": self.latest_alert,
                "service_name": self.set_task_state_service,
            }
        )
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = HITLCommandBridgeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

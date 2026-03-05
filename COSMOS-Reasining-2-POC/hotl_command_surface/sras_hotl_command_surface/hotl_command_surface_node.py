from __future__ import annotations

import json
import time
from typing import Any

import rclpy
from rclpy.node import Node
from rclpy.task import Future
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import OperatorAlert, TaskStatus
from warehouse_security_msgs.srv import SetTaskState

from .hotl_core import (
    HOTL_TO_SET_TASK_STATE,
    CommandOutcome,
    HOTLCommand,
    TaskLifecycleState,
    TaskView,
    create_command_payload,
    outcome_to_json,
    task_status_to_view,
    validate_command,
)


class HOTLCommandSurfaceNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_hotl_command_surface")
        self._declare_parameters()
        self._load_parameters()

        self._task_views: dict[str, TaskView] = {}
        self._alerts_by_task: dict[str, dict[str, Any]] = {}

        self._command_pub = self.create_publisher(String, self.command_topic, 20)
        self._outcomes_pub = self.create_publisher(String, "~/command_outcomes", 20)
        self._dashboard_pub = self.create_publisher(String, "~/dashboard_state", 20)

        self.create_subscription(TaskStatus, self.task_status_topic, self._on_task_status, 20)
        self.create_subscription(OperatorAlert, self.alerts_topic, self._on_alert, 20)

        self._set_task_state_client = self.create_client(SetTaskState, self.set_task_state_service)
        self.create_service(Trigger, "~/execute_command", self._handle_execute_command)
        self.create_service(Trigger, "~/get_dashboard", self._handle_get_dashboard)
        self.create_timer(self.dashboard_interval_s, self._publish_dashboard)

    def _declare_parameters(self) -> None:
        self.declare_parameter("task_status_topic", "/robot/task_status")
        self.declare_parameter("alerts_topic", "/ui/alerts")
        self.declare_parameter("command_topic", "/ui/set_task_state")
        self.declare_parameter("set_task_state_service", "/robot/set_task_state")
        self.declare_parameter("dashboard_interval_s", 1.0)
        self.declare_parameter("execute_command_json", "")

    def _load_parameters(self) -> None:
        self.task_status_topic = str(self.get_parameter("task_status_topic").value)
        self.alerts_topic = str(self.get_parameter("alerts_topic").value)
        self.command_topic = str(self.get_parameter("command_topic").value)
        self.set_task_state_service = str(self.get_parameter("set_task_state_service").value)
        self.dashboard_interval_s = float(self.get_parameter("dashboard_interval_s").value)

    def _on_task_status(self, msg: TaskStatus) -> None:
        updated_s = float(msg.timestamp_updated.sec) + float(msg.timestamp_updated.nanosec) / 1_000_000_000.0
        view = task_status_to_view(
            {
                "task_id": msg.task_id,
                "status": int(msg.status),
                "progress_pct": float(msg.progress_pct),
                "status_message": msg.status_message,
                "timestamp_updated_s": updated_s,
            }
        )
        self._task_views[view.task_id] = view

    def _on_alert(self, msg: OperatorAlert) -> None:
        created_s = float(msg.timestamp_created.sec) + float(msg.timestamp_created.nanosec) / 1_000_000_000.0
        related = str(msg.related_task_id).strip()
        if not related:
            return

        self._alerts_by_task[related] = {
            "alert_id": msg.alert_id,
            "severity": int(msg.severity),
            "title": msg.title,
            "message": msg.message,
            "source_node": msg.source_node,
            "related_task_id": related,
            "requires_action": bool(msg.requires_action),
            "timestamp_created_s": created_s,
        }

    def _handle_execute_command(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        raw_payload = str(self.get_parameter("execute_command_json").value)
        if not raw_payload.strip():
            response.success = False
            response.message = "execute_command_json parameter is empty"
            return response

        try:
            payload = json.loads(raw_payload)
        except Exception as exc:  # noqa: BLE001
            response.success = False
            response.message = f"invalid execute_command_json: {exc}"
            return response

        accepted, message = self._execute_from_payload(payload)
        response.success = accepted
        response.message = message
        return response

    def _execute_from_payload(self, payload: dict[str, Any]) -> tuple[bool, str]:
        task_id = str(payload.get("task_id", "")).strip()
        if not task_id:
            return False, "task_id missing"

        try:
            command = HOTLCommand(int(payload.get("command")))
        except Exception as exc:  # noqa: BLE001
            return False, f"invalid command: {exc}"

        reason = str(payload.get("reason", ""))
        task_view = self._task_views.get(task_id)
        if task_view is None:
            return False, f"task '{task_id}' not found in cache"

        is_valid, validation_msg = validate_command(command, task_view.state)
        if not is_valid:
            self._publish_outcome(
                CommandOutcome(
                    task_id=task_id,
                    command=command,
                    success=False,
                    message=validation_msg,
                    resulting_state=int(task_view.state),
                    timestamp_s=time.time(),
                )
            )
            return False, validation_msg

        command_payload = create_command_payload(task_id=task_id, command=command, reason=reason)
        self._publish_command(command_payload)

        if not self._set_task_state_client.wait_for_service(timeout_sec=0.2):
            self._publish_outcome(
                CommandOutcome(
                    task_id=task_id,
                    command=command,
                    success=True,
                    message=f"service unavailable; published to {self.command_topic}",
                    resulting_state=int(task_view.state),
                    timestamp_s=time.time(),
                )
            )
            return True, "published command to topic fallback"

        service_request = SetTaskState.Request()
        service_request.task_id = task_id
        service_request.requested_state = HOTL_TO_SET_TASK_STATE[command]
        service_request.reason = reason
        if command == HOTLCommand.REDEFINE:
            service_request.reason = f"[REDEFINE] {reason}".strip()

        future = self._set_task_state_client.call_async(service_request)
        future.add_done_callback(
            lambda done: self._on_set_task_state_done(done, task_id=task_id, command=command)
        )
        return True, "command accepted"

    def _on_set_task_state_done(self, future: Future, task_id: str, command: HOTLCommand) -> None:
        try:
            result = future.result()
            outcome = CommandOutcome(
                task_id=task_id,
                command=command,
                success=bool(result.success),
                message=str(result.message),
                resulting_state=int(result.current_state),
                timestamp_s=time.time(),
            )
        except Exception as exc:  # noqa: BLE001
            cached = self._task_views.get(task_id)
            outcome = CommandOutcome(
                task_id=task_id,
                command=command,
                success=False,
                message=f"set_task_state failed: {exc}",
                resulting_state=int(cached.state) if cached else int(TaskLifecycleState.QUEUED),
                timestamp_s=time.time(),
            )
        self._publish_outcome(outcome)

    def _publish_command(self, payload: dict[str, Any]) -> None:
        msg = String()
        msg.data = json.dumps(payload)
        self._command_pub.publish(msg)

    def _publish_outcome(self, outcome: CommandOutcome) -> None:
        msg = String()
        msg.data = outcome_to_json(outcome)
        self._outcomes_pub.publish(msg)

    def _dashboard_payload(self) -> dict[str, Any]:
        tasks = []
        for task_id in sorted(self._task_views):
            view = self._task_views[task_id]
            tasks.append(
                {
                    "task_id": view.task_id,
                    "state": int(view.state),
                    "state_name": view.state.name,
                    "progress_pct": view.progress_pct,
                    "status_message": view.status_message,
                    "last_updated_s": view.last_updated_s,
                    "allowed_commands": {
                        "pause": view.can_pause,
                        "resume": view.can_resume,
                        "stop": view.can_stop,
                        "redefine": view.can_redefine,
                    },
                    "latest_alert": self._alerts_by_task.get(view.task_id),
                }
            )

        return {
            "timestamp_s": time.time(),
            "tracked_tasks": len(tasks),
            "tasks": tasks,
        }

    def _publish_dashboard(self) -> None:
        msg = String()
        msg.data = json.dumps(self._dashboard_payload())
        self._dashboard_pub.publish(msg)

    def _handle_get_dashboard(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = json.dumps(self._dashboard_payload())
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = HOTLCommandSurfaceNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

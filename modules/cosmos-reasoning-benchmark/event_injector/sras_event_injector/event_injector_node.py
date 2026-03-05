from __future__ import annotations

import json

import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from rclpy.node import Node
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent

from .injector_core import (
    DEFAULT_DEMO_SCRIPT,
    PHASE_NAMES,
    DemoScript,
    EventPhase,
    ScriptedEvent,
    create_blindspot_event,
    create_manual_event,
    get_current_phase,
)


class EventInjectorNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_event_injector")
        self._declare_parameters()
        self._load_parameters()
        self._setup_script()
        self._setup_ros()

        self._start_time_s: float | None = None
        self._current_phase: EventPhase | None = None
        self._running = bool(self.auto_start)

        if self._running:
            self._reset_state()

    def _declare_parameters(self) -> None:
        self.declare_parameter("auto_start", True)
        self.declare_parameter("loop", True)
        self.declare_parameter("blindspot_topic", "/reasoning/blindspot_events")
        self.declare_parameter("phase_1_duration_s", 10.0)
        self.declare_parameter("phase_2_duration_s", 8.0)
        self.declare_parameter("phase_3_duration_s", 6.0)
        self.declare_parameter("phase_4_duration_s", 10.0)

    def _load_parameters(self) -> None:
        self.auto_start = bool(self.get_parameter("auto_start").value)
        self.loop = bool(self.get_parameter("loop").value)
        self.blindspot_topic = str(self.get_parameter("blindspot_topic").value)
        self.phase_1_duration_s = float(self.get_parameter("phase_1_duration_s").value)
        self.phase_2_duration_s = float(self.get_parameter("phase_2_duration_s").value)
        self.phase_3_duration_s = float(self.get_parameter("phase_3_duration_s").value)
        self.phase_4_duration_s = float(self.get_parameter("phase_4_duration_s").value)

    def _setup_script(self) -> None:
        p1 = max(0.0, self.phase_1_duration_s)
        p2 = max(0.0, self.phase_2_duration_s)
        p3 = max(0.0, self.phase_3_duration_s)
        p4 = max(0.0, self.phase_4_duration_s)

        _, base_e2 = DEFAULT_DEMO_SCRIPT.events[1]
        _, base_e3 = DEFAULT_DEMO_SCRIPT.events[2]
        _, base_e4 = DEFAULT_DEMO_SCRIPT.events[3]

        self.script = DemoScript(
            events=[
                (
                    0.0,
                    ScriptedEvent(
                        phase=EventPhase.NORMAL,
                        camera_id="cam3",
                        zone_id="shelf_zone",
                        severity=0,
                        confidence=0.0,
                        description="All cameras clear — normal operation",
                        affected_asset_ids=[],
                        duration_s=0.0,
                    ),
                ),
                (
                    p1,
                    ScriptedEvent(
                        phase=base_e2.phase,
                        camera_id=base_e2.camera_id,
                        zone_id=base_e2.zone_id,
                        severity=base_e2.severity,
                        confidence=base_e2.confidence,
                        description=base_e2.description,
                        affected_asset_ids=list(base_e2.affected_asset_ids),
                        duration_s=p2,
                    ),
                ),
                (
                    p1 + p2,
                    ScriptedEvent(
                        phase=base_e3.phase,
                        camera_id=base_e3.camera_id,
                        zone_id=base_e3.zone_id,
                        severity=base_e3.severity,
                        confidence=base_e3.confidence,
                        description=base_e3.description,
                        affected_asset_ids=list(base_e3.affected_asset_ids),
                        duration_s=p3,
                    ),
                ),
                (
                    p1 + p2 + p3,
                    ScriptedEvent(
                        phase=base_e4.phase,
                        camera_id=base_e4.camera_id,
                        zone_id=base_e4.zone_id,
                        severity=base_e4.severity,
                        confidence=base_e4.confidence,
                        description=base_e4.description,
                        affected_asset_ids=list(base_e4.affected_asset_ids),
                        duration_s=p4,
                    ),
                ),
            ],
            loop=self.loop,
        )

    def _setup_ros(self) -> None:
        self.events_pub = self.create_publisher(BlindSpotEvent, self.blindspot_topic, 10)
        self.create_timer(1.0, self._on_timer)
        self.create_service(Trigger, "~/inject_event", self._handle_inject_event)
        self.create_service(Trigger, "~/get_status", self._handle_get_status)
        self.create_service(Trigger, "~/reset", self._handle_reset)

    def _reset_state(self) -> None:
        self._start_time_s = self._now_s()
        self._current_phase = None
        self._publish_if_phase_changed(elapsed_s=0.0)

    def _on_timer(self) -> None:
        if not self._running:
            return

        if self._start_time_s is None:
            self._start_time_s = self._now_s()

        elapsed_s = self._now_s() - self._start_time_s
        self._publish_if_phase_changed(elapsed_s=elapsed_s)

    def _publish_if_phase_changed(self, elapsed_s: float) -> None:
        phase, event = get_current_phase(elapsed_s=elapsed_s, script=self.script)
        if event is None or phase == self._current_phase:
            return

        now_s = self._now_s()
        event_dict = create_blindspot_event(event, now_s)
        msg = self._dict_to_msg(event_dict)
        self.events_pub.publish(msg)
        self._current_phase = phase

        self.get_logger().info(
            f"Published blindspot phase transition: {PHASE_NAMES.get(phase, str(int(phase)))} "
            f"(camera={event.camera_id}, zone={event.zone_id}, severity={event.severity})"
        )

    def _handle_inject_event(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        manual_event = create_manual_event(
            camera_id="cam3",
            zone_id="shelf_zone",
            severity=BlindSpotEvent.SEVERITY_HIGH,
            description="Manual blindspot inject: forklift occluding cam3 view",
            affected_assets=["forklift_01"],
            duration_s=self.phase_2_duration_s,
        )
        event_dict = create_blindspot_event(manual_event, self._now_s())
        msg = self._dict_to_msg(event_dict)
        self.events_pub.publish(msg)

        response.success = True
        response.message = "Manual HIGH blindspot event published for cam3/shelf_zone"
        return response

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        elapsed_s = 0.0
        if self._running and self._start_time_s is not None:
            elapsed_s = max(0.0, self._now_s() - self._start_time_s)

        phase, _ = get_current_phase(elapsed_s=elapsed_s, script=self.script)
        status = {
            "running": self._running,
            "loop": self.script.loop,
            "elapsed_s": elapsed_s,
            "current_phase": int(phase),
            "current_phase_name": PHASE_NAMES.get(phase, "unknown"),
            "phase_start_offsets_s": [delay for delay, _ in self.script.events],
        }

        response.success = True
        response.message = json.dumps(status, sort_keys=True)
        return response

    def _handle_reset(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        self._running = True
        self._reset_state()
        response.success = True
        response.message = "Event script reset to phase 1 (normal)."
        return response

    def _dict_to_msg(self, payload: dict) -> BlindSpotEvent:
        msg = BlindSpotEvent()
        msg.header.stamp = self._time_from_dict(payload["header"]["stamp"])
        msg.header.frame_id = str(payload["header"].get("frame_id", ""))
        msg.event_id = str(payload["event_id"])
        msg.camera_id = str(payload["camera_id"])
        msg.zone_id = str(payload["zone_id"])
        msg.severity = int(payload["severity"])
        msg.confidence = float(payload["confidence"])
        msg.description = str(payload["description"])
        msg.affected_asset_ids = [str(asset_id) for asset_id in payload["affected_asset_ids"]]
        msg.timestamp_detected = self._time_from_dict(payload["timestamp_detected"])
        msg.duration_s = float(payload["duration_s"])
        return msg

    def _time_from_dict(self, stamp: dict[str, int]) -> TimeMsg:
        msg = TimeMsg()
        msg.sec = int(stamp.get("sec", 0))
        msg.nanosec = int(stamp.get("nanosec", 0))
        return msg

    def _now_s(self) -> float:
        return self.get_clock().now().nanoseconds / 1e9


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = EventInjectorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

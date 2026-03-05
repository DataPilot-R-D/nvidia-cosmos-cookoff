from __future__ import annotations

import json

import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent

from .blindspot_gen_core import (
    DEFAULT_SCENARIO,
    DynamicBlindspotGenerator,
    OcclusionType,
    ScenarioConfig,
    coverage_impact_to_json,
    occlusion_to_blindspot_event,
    occlusion_to_dict,
)


class DynamicBlindspotGenNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_dynamic_blindspot_gen")
        self._declare_parameters()
        self._load_parameters()
        self._setup_core()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("scenario_id", DEFAULT_SCENARIO.scenario_id)
        self.declare_parameter("zone_ids", DEFAULT_SCENARIO.zone_ids)
        self.declare_parameter("camera_ids", DEFAULT_SCENARIO.camera_ids)
        self.declare_parameter("event_interval_s", DEFAULT_SCENARIO.event_interval_s)
        self.declare_parameter("max_concurrent_occlusions", DEFAULT_SCENARIO.max_concurrent_occlusions)
        self.declare_parameter(
            "severity_weights_json",
            json.dumps({str(k): v for k, v in DEFAULT_SCENARIO.severity_weights.items()}),
        )
        self.declare_parameter(
            "occlusion_type_weights_json",
            json.dumps({k.name: v for k, v in DEFAULT_SCENARIO.occlusion_type_weights.items()}),
        )
        self.declare_parameter("generation_interval_s", 5.0)
        self.declare_parameter("auto_generate", True)

    def _load_parameters(self) -> None:
        self.scenario_id = str(self.get_parameter("scenario_id").value)
        self.zone_ids = [str(zone_id) for zone_id in self.get_parameter("zone_ids").value]
        self.camera_ids = [str(camera_id) for camera_id in self.get_parameter("camera_ids").value]
        self.event_interval_s = float(self.get_parameter("event_interval_s").value)
        self.max_concurrent_occlusions = int(self.get_parameter("max_concurrent_occlusions").value)
        self.severity_weights = self._parse_severity_weights(
            json.loads(str(self.get_parameter("severity_weights_json").value))
        )
        self.occlusion_type_weights = self._parse_occlusion_type_weights(
            json.loads(str(self.get_parameter("occlusion_type_weights_json").value))
        )
        self.generation_interval_s = float(self.get_parameter("generation_interval_s").value)
        self.auto_generate = bool(self.get_parameter("auto_generate").value)

    def _setup_core(self) -> None:
        config = ScenarioConfig(
            scenario_id=self.scenario_id,
            zone_ids=self.zone_ids,
            camera_ids=self.camera_ids,
            event_interval_s=self.event_interval_s,
            max_concurrent_occlusions=self.max_concurrent_occlusions,
            severity_weights=self.severity_weights,
            occlusion_type_weights=self.occlusion_type_weights,
        )
        self.generator = DynamicBlindspotGenerator(config=config)

    def _setup_ros(self) -> None:
        self.events_pub = self.create_publisher(BlindSpotEvent, "/reasoning/blindspot_events", 10)
        self.status_pub = self.create_publisher(String, "~/generator_status", 10)

        self.create_service(Trigger, "~/trigger_event", self._handle_trigger_event)
        self.create_service(Trigger, "~/get_status", self._handle_get_status)
        self.create_service(Trigger, "~/reset", self._handle_reset)

        self.create_timer(max(0.1, self.generation_interval_s), self._on_timer)

    def _on_timer(self) -> None:
        if self.auto_generate:
            occlusion = self.generator.generate_event(current_time_s=self._now_s())
            self.events_pub.publish(self._dict_to_msg(occlusion_to_blindspot_event(occlusion)))

        self._publish_status()

    def _publish_status(self) -> None:
        now_s = self._now_s()
        active = self.generator.active_occlusions(now_s)
        impact = self.generator.compute_coverage_impact(active)
        payload = {
            "scenario_id": self.generator.config.scenario_id,
            "auto_generate": self.auto_generate,
            "generation_interval_s": self.generation_interval_s,
            "active_occlusion_count": len(active),
            "max_concurrent_occlusions": self.generator.config.max_concurrent_occlusions,
            "active_occlusions": [occlusion_to_dict(event) for event in active],
            "coverage_impact": impact,
            "coverage_impact_json": coverage_impact_to_json(impact),
        }
        msg = String()
        msg.data = json.dumps(payload, sort_keys=True)
        self.status_pub.publish(msg)

    def _handle_trigger_event(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        occlusion = self.generator.generate_event(current_time_s=self._now_s())
        self.events_pub.publish(self._dict_to_msg(occlusion_to_blindspot_event(occlusion)))
        self._publish_status()

        response.success = True
        response.message = json.dumps(occlusion_to_dict(occlusion), sort_keys=True)
        return response

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        now_s = self._now_s()
        active = self.generator.active_occlusions(now_s)
        impact = self.generator.compute_coverage_impact(active)
        payload = {
            "scenario_id": self.generator.config.scenario_id,
            "auto_generate": self.auto_generate,
            "generation_interval_s": self.generation_interval_s,
            "total_generated": len(self.generator._events),
            "active_occlusion_count": len(active),
            "active_occlusions": [occlusion_to_dict(event) for event in active],
            "coverage_impact": impact,
        }

        response.success = True
        response.message = json.dumps(payload, sort_keys=True)
        return response

    def _handle_reset(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        self.generator.reset()
        self._publish_status()
        response.success = True
        response.message = "Dynamic blindspot generator reset."
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
        msg.affected_asset_ids = [str(asset_id) for asset_id in payload.get("affected_asset_ids", [])]
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

    def _parse_severity_weights(self, raw: object) -> dict[int, float]:
        default = dict(DEFAULT_SCENARIO.severity_weights)
        if not isinstance(raw, dict):
            return default

        parsed: dict[int, float] = {}
        for key, value in raw.items():
            try:
                severity = int(key)
                if severity < 0 or severity > 3:
                    continue
                parsed[severity] = max(0.0, float(value))
            except (TypeError, ValueError):
                continue

        for missing in range(4):
            parsed.setdefault(missing, default[missing])
        return parsed

    def _parse_occlusion_type_weights(self, raw: object) -> dict[OcclusionType, float]:
        default = dict(DEFAULT_SCENARIO.occlusion_type_weights)
        if not isinstance(raw, dict):
            return default

        parsed: dict[OcclusionType, float] = {}
        for key, value in raw.items():
            occlusion_type: OcclusionType | None = None
            if isinstance(key, int):
                try:
                    occlusion_type = OcclusionType(int(key))
                except ValueError:
                    occlusion_type = None
            else:
                key_text = str(key)
                if key_text.isdigit():
                    try:
                        occlusion_type = OcclusionType(int(key_text))
                    except ValueError:
                        occlusion_type = None
                else:
                    try:
                        occlusion_type = OcclusionType[key_text]
                    except KeyError:
                        occlusion_type = None

            if occlusion_type is None:
                continue
            try:
                parsed[occlusion_type] = max(0.0, float(value))
            except (TypeError, ValueError):
                continue

        for key, value in default.items():
            parsed.setdefault(key, value)

        return parsed


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = DynamicBlindspotGenNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

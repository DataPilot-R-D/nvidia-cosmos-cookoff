"""Unit tests for ROS2↔Cosmos bridge with mocked ROS2 and Socket.IO."""

from __future__ import annotations

import base64
import importlib
import json
import sys
import types
from types import SimpleNamespace


class StubSocketClient:
    def __init__(self, connected: bool = True, raise_on_connect: bool = False) -> None:
        self.connected = connected
        self.raise_on_connect = raise_on_connect
        self.connect_calls = 0
        self.disconnect_calls = 0
        self.emits: list[tuple[str, dict]] = []
        self._events: dict[str, object] = {}

    def event(self, fn):
        self._events[fn.__name__] = fn
        return fn

    def on(self, name: str):
        def decorator(fn):
            self._events[name] = fn
            return fn

        return decorator

    def connect(self, *_args, **_kwargs) -> None:
        self.connect_calls += 1
        if self.raise_on_connect:
            raise RuntimeError("connect failed")
        self.connected = True

    def disconnect(self) -> None:
        self.disconnect_calls += 1
        self.connected = False

    def emit(self, event: str, payload: dict) -> None:
        self.emits.append((event, payload))


def _install_fake_socketio(monkeypatch) -> None:
    socketio_mod = types.ModuleType("socketio")

    class FakeSocketClient(StubSocketClient):
        def __init__(self, *args, **kwargs) -> None:
            del args, kwargs
            super().__init__(connected=False)

    socketio_mod.Client = FakeSocketClient  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "socketio", socketio_mod)


class StubAgent:
    def __init__(self) -> None:
        self.frames: list[str] = []

    def analyze_frame(self, frame_b64: str) -> dict:
        self.frames.append(frame_b64)
        return {"status": "ok", "anomalies": []}


def _install_fake_ros2(monkeypatch, spin_raises: bool = False) -> types.ModuleType:
    rclpy_mod = types.ModuleType("rclpy")
    state = {"ok": False, "init": 0, "shutdown": 0, "spin": 0, "spin_raises": spin_raises}

    class FakeNode:
        def __init__(self) -> None:
            self.subscriptions: list[tuple[object, str, object, int]] = []
            self.destroyed = False

        def create_subscription(self, msg_type, topic, callback, qos):
            self.subscriptions.append((msg_type, topic, callback, qos))
            return object()

        def destroy_node(self) -> None:
            self.destroyed = True

    def ok() -> bool:
        return state["ok"]

    def init(args=None) -> None:
        del args
        state["ok"] = True
        state["init"] += 1

    def shutdown() -> None:
        state["shutdown"] += 1
        state["ok"] = False

    def create_node(_name: str) -> FakeNode:
        return FakeNode()

    def spin_once(_node, timeout_sec=0.1) -> None:
        del timeout_sec
        state["spin"] += 1
        if state["spin_raises"]:
            raise RuntimeError("spin failed")

    rclpy_mod.ok = ok  # type: ignore[attr-defined]
    rclpy_mod.init = init  # type: ignore[attr-defined]
    rclpy_mod.shutdown = shutdown  # type: ignore[attr-defined]
    rclpy_mod.create_node = create_node  # type: ignore[attr-defined]
    rclpy_mod.spin_once = spin_once  # type: ignore[attr-defined]
    rclpy_mod._state = state  # type: ignore[attr-defined]

    sensor_msgs_mod = types.ModuleType("sensor_msgs")
    sensor_msgs_msg_mod = types.ModuleType("sensor_msgs.msg")

    class FakeImage:
        pass

    sensor_msgs_msg_mod.Image = FakeImage  # type: ignore[attr-defined]
    sensor_msgs_mod.msg = sensor_msgs_msg_mod  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "rclpy", rclpy_mod)
    monkeypatch.setitem(sys.modules, "sensor_msgs", sensor_msgs_mod)
    monkeypatch.setitem(sys.modules, "sensor_msgs.msg", sensor_msgs_msg_mod)
    return rclpy_mod


def _reload_bridge(monkeypatch, with_ros2: bool, spin_raises: bool = False):
    sys.modules.pop("src.bridge.ros2_cosmos_bridge", None)
    _install_fake_socketio(monkeypatch)
    if with_ros2:
        _install_fake_ros2(monkeypatch, spin_raises=spin_raises)
    else:
        sys.modules.pop("rclpy", None)
        sys.modules.pop("sensor_msgs", None)
        sys.modules.pop("sensor_msgs.msg", None)
    return importlib.import_module("src.bridge.ros2_cosmos_bridge")


def test_import_guard_without_ros2(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=False)
    assert bridge_mod.ROS2_AVAILABLE is False

    bridge = bridge_mod.ROS2CosmosBridge(
        socket_client=StubSocketClient(),
        cosmos_client=object(),
        agent=StubAgent(),
    )
    bridge.spin_once()  # Should not crash even when ROS2 is missing.


def test_ros_image_bgr8_to_jpeg_base64(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)

    msg = SimpleNamespace(
        encoding="bgr8",
        width=2,
        height=2,
        step=6,
        data=bytes(
            [
                0,
                0,
                255,
                0,
                255,
                0,
                255,
                0,
                0,
                255,
                255,
                255,
            ]
        ),
    )
    jpeg_b64 = bridge_mod.ROS2CosmosBridge.ros_image_to_base64_jpeg(msg)
    jpeg = base64.b64decode(jpeg_b64)
    assert jpeg[:2] == b"\xff\xd8"


def test_ros_image_rgb8_to_jpeg_base64(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)

    msg = SimpleNamespace(
        encoding="rgb8",
        width=2,
        height=2,
        step=6,
        data=bytes(
            [
                255, 0, 0,
                0, 255, 0,
                0, 0, 255,
                255, 255, 255,
            ]
        ),
    )
    jpeg_b64 = bridge_mod.ROS2CosmosBridge.ros_image_to_base64_jpeg(msg)
    jpeg = base64.b64decode(jpeg_b64)
    assert jpeg[:2] == b"\xff\xd8"


def test_ros_image_array_data_converted_to_bytes(monkeypatch):
    """Isaac Sim may publish image data as a list/array instead of bytes."""
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)

    msg = SimpleNamespace(
        encoding="rgb8",
        width=2,
        height=2,
        step=6,
        data=list(range(12)),  # list, not bytes
    )
    jpeg_b64 = bridge_mod.ROS2CosmosBridge.ros_image_to_base64_jpeg(msg)
    jpeg = base64.b64decode(jpeg_b64)
    assert jpeg[:2] == b"\xff\xd8"


def test_process_frame_emits_cosmos_event(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)
    socket_client = StubSocketClient(connected=True)
    agent = StubAgent()
    bridge = bridge_mod.ROS2CosmosBridge(
        ros_topic="/camera/image_raw",
        interval=2.0,
        socket_client=socket_client,
        cosmos_client=object(),
        agent=agent,
    )

    bridge._latest_image = SimpleNamespace(
        encoding="bgr8",
        width=2,
        height=2,
        step=6,
        data=bytes([0, 0, 0] * 4),
    )
    bridge._process_latest_frame(now=10.0)

    assert len(agent.frames) == 1
    assert len(socket_client.emits) == 1
    event, payload = socket_client.emits[0]
    assert event == "cosmos_event"
    assert payload["topic"] == "/camera/image_raw"
    assert payload["analysis"]["status"] == "ok"


def test_spin_once_reconnects_socket_and_resets_ros_on_spin_error(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True, spin_raises=True)
    socket_client = StubSocketClient(connected=False)
    bridge = bridge_mod.ROS2CosmosBridge(
        socket_client=socket_client,
        cosmos_client=object(),
        agent=StubAgent(),
    )

    bridge.spin_once()

    assert socket_client.connect_calls == 1
    assert bridge._node is None


def test_post_incident_posts_when_anomalies_present(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)
    socket_client = StubSocketClient(connected=True)
    bridge = bridge_mod.ROS2CosmosBridge(
        ws_url="http://socket-host:8081",
        dashboard_url="http://dashboard-host:3000",
        socket_client=socket_client,
        cosmos_client=object(),
        agent=StubAgent(),
    )

    calls: list[tuple[str, dict, float]] = []

    class StubResponse:
        status_code = 201

        def raise_for_status(self) -> None:
            return None

    def fake_post(url: str, json: dict, timeout: float):
        calls.append((url, json, timeout))
        return StubResponse()

    monkeypatch.setattr(bridge_mod.httpx, "post", fake_post)
    result = {
        "severity": "high",
        "anomalies": [{"description": "Person detected in restricted area"}],
        "meta": {"source": "cosmos"},
    }
    bridge._post_incident(result)

    assert len(calls) == 1
    url, payload, timeout = calls[0]
    assert url == "http://dashboard-host:3000/api/incidents"
    assert timeout == 5.0
    assert payload["title"] == "Person detected in restricted area"
    assert json.loads(payload["description"]) == result
    assert payload["status"] == "New"
    assert payload["severity"] == "High"
    assert payload["cameraSourceId"] is None
    assert payload["robotId"] is None


def test_post_incident_skips_when_no_anomalies(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)
    bridge = bridge_mod.ROS2CosmosBridge(
        socket_client=StubSocketClient(connected=True),
        cosmos_client=object(),
        agent=StubAgent(),
    )

    called = {"count": 0}

    def fake_post(*_args, **_kwargs):
        called["count"] += 1
        raise AssertionError("httpx.post should not be called when anomalies are empty")

    monkeypatch.setattr(bridge_mod.httpx, "post", fake_post)

    bridge._post_incident({"anomalies": [], "severity": "low"})

    assert called["count"] == 0


def test_bridge_uses_v3_agent_by_default(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)

    bridge = bridge_mod.ROS2CosmosBridge(
        socket_client=StubSocketClient(connected=True),
        cosmos_client=object(),
    )

    assert isinstance(bridge.agent, bridge_mod.SurveillanceAgentV3)


def test_bridge_ignores_legacy_mode_env_and_keeps_v3(monkeypatch):
    bridge_mod = _reload_bridge(monkeypatch, with_ros2=True)
    monkeypatch.setenv("SURVEILLANCE_AGENT_MODE", "v2")

    bridge = bridge_mod.ROS2CosmosBridge(
        socket_client=StubSocketClient(connected=True),
        cosmos_client=object(),
    )

    assert isinstance(bridge.agent, bridge_mod.SurveillanceAgentV3)

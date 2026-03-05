"""Tests for dashboard_notifications — throttle + schema logic."""

from __future__ import annotations

import json

import pytest

from sras_robot_task_planner.dashboard_notifications import (
    DashboardNotification,
    NotificationThrottle,
    ThrottleConfig,
    build_notification,
)


class FakeClock:
    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def tick(self, delta: float) -> None:
        self.now += delta

    def __call__(self) -> float:
        return self.now


# ---------------------------------------------------------------------------
# Schema / serialisation
# ---------------------------------------------------------------------------


class TestDashboardNotification:
    def test_to_json_roundtrip(self) -> None:
        n = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder Detected",
            message="Person seen in zone A",
            incident_key="inc-1",
            now_fn=FakeClock(42.0),
        )
        parsed = json.loads(n.to_json())
        assert parsed["category"] == "intruder_detected"
        assert parsed["level"] == "warning"
        assert parsed["title"] == "Intruder Detected"
        assert parsed["timestamp_s"] == 42.0

    def test_frozen(self) -> None:
        n = build_notification(
            category="plan_scheduled",
            level="info",
            title="Plan",
            message="ok",
            now_fn=FakeClock(),
        )
        with pytest.raises(AttributeError):
            n.category = "nope"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Throttle — dedup & rate-limiting
# ---------------------------------------------------------------------------


class TestThrottle:
    """Core throttle behaviour."""

    @staticmethod
    def _make_throttle(clock: FakeClock) -> NotificationThrottle:
        return NotificationThrottle(config=ThrottleConfig(), now_fn=clock)

    # -- Basic pass/suppress --------------------------------------------------

    def test_first_notification_always_passes(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="seen",
            incident_key="inc-1",
            now_fn=clock,
        )
        assert throttle.should_publish(n) is True

    def test_identical_within_window_suppressed(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="seen",
            incident_key="inc-1",
            now_fn=clock,
        )
        assert throttle.should_publish(n) is True
        clock.tick(1.0)  # within 5s window
        n2 = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="seen again",
            incident_key="inc-1",
            now_fn=clock,
        )
        assert throttle.should_publish(n2) is False

    def test_different_incident_key_not_deduped(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="A",
            incident_key="inc-1",
            now_fn=clock,
        )
        n2 = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="B",
            incident_key="inc-2",
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        assert throttle.should_publish(n2) is True

    def test_different_task_id_not_deduped(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="task_state_changed",
            level="info",
            title="Active",
            message="t1 active",
            task_id="t1",
            metadata={"to_state": "ACTIVE"},
            now_fn=clock,
        )
        n2 = build_notification(
            category="task_state_changed",
            level="info",
            title="Active",
            message="t2 active",
            task_id="t2",
            metadata={"to_state": "ACTIVE"},
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        assert throttle.should_publish(n2) is True

    # -- Window expiry --------------------------------------------------------

    def test_window_expiry_allows_republish(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="seen",
            incident_key="inc-1",
            now_fn=clock,
        )
        assert throttle.should_publish(n) is True
        clock.tick(5.1)  # past 5s window
        n2 = build_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder",
            message="seen again",
            incident_key="inc-1",
            now_fn=clock,
        )
        assert throttle.should_publish(n2) is True

    # -- robot_action_monitor rate-limit (2s) ---------------------------------

    def test_robot_action_monitor_rate_limited(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        for i in range(5):
            n = build_notification(
                category="robot_action_monitor",
                level="info",
                title="Nav",
                message=f"dist={i}",
                task_id="t1",
                now_fn=clock,
            )
            if i == 0:
                assert throttle.should_publish(n) is True
            else:
                # 0.1s apart — should be suppressed
                assert throttle.should_publish(n) is False
            clock.tick(0.1)

    def test_robot_action_monitor_passes_after_2s(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="robot_action_monitor",
            level="info",
            title="Nav",
            message="dist=5",
            task_id="t1",
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        clock.tick(2.1)
        n2 = build_notification(
            category="robot_action_monitor",
            level="info",
            title="Nav",
            message="dist=3",
            task_id="t1",
            now_fn=clock,
        )
        assert throttle.should_publish(n2) is True

    # -- task_state_changed dedup (1s, keyed on task_id + to_state) ----------

    def test_task_state_same_state_deduped(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="task_state_changed",
            level="info",
            title="Active",
            message="t1 ACTIVE",
            task_id="t1",
            metadata={"to_state": "ACTIVE"},
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        clock.tick(0.5)
        n2 = build_notification(
            category="task_state_changed",
            level="info",
            title="Active",
            message="t1 ACTIVE again",
            task_id="t1",
            metadata={"to_state": "ACTIVE"},
            now_fn=clock,
        )
        assert throttle.should_publish(n2) is False

    def test_task_state_different_state_not_deduped(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="task_state_changed",
            level="info",
            title="Active",
            message="t1 ACTIVE",
            task_id="t1",
            metadata={"to_state": "ACTIVE"},
            now_fn=clock,
        )
        n2 = build_notification(
            category="task_state_changed",
            level="success",
            title="Succeeded",
            message="t1 SUCCEEDED",
            task_id="t1",
            metadata={"to_state": "SUCCEEDED"},
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        assert throttle.should_publish(n2) is True

    # -- Cleanup guard --------------------------------------------------------

    def test_cleanup_does_not_break_under_load(self) -> None:
        clock = FakeClock()
        config = ThrottleConfig(max_entries=10)
        throttle = NotificationThrottle(config=config, now_fn=clock)
        for i in range(20):
            n = build_notification(
                category="intruder_detected",
                level="warning",
                title="I",
                message=f"#{i}",
                incident_key=f"inc-{i}",
                now_fn=clock,
            )
            throttle.should_publish(n)
            clock.tick(6.0)  # past window each time

    # -- Unknown category falls back to default window -----------------------

    def test_unknown_category_uses_default_window(self) -> None:
        clock = FakeClock()
        throttle = self._make_throttle(clock)
        n1 = build_notification(
            category="custom_thing",
            level="info",
            title="X",
            message="y",
            now_fn=clock,
        )
        assert throttle.should_publish(n1) is True
        clock.tick(0.5)
        n2 = build_notification(
            category="custom_thing",
            level="info",
            title="X",
            message="y2",
            now_fn=clock,
        )
        # Unknown categories should use a sensible default (5s)
        assert throttle.should_publish(n2) is False

"""Core planning logic for robot_task_planner_node.

This module intentionally avoids ROS imports to keep the critical planner
behavior unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Protocol
import math
import time
import uuid


class TaskLifecycleState(str, Enum):
    PENDING_APPROVAL = "pending_approval"
    DISPATCHED = "dispatched"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELED = "canceled"
    FAILED = "failed"


class PlannerCommand(str, Enum):
    APPROVE = "approve"
    CANCEL = "cancel"
    PAUSE = "pause"
    RESUME = "resume"


@dataclass
class PlannerConfig:
    dedup_window_s: float = 45.0
    incident_ttl_s: float = 300.0
    queue_max_size: int = 200
    max_active_tasks: int = 1
    auto_approve_max_severity: float = 0.55
    default_task_priority: float = 0.5
    require_map: bool = True
    map_stale_timeout_s: float = 5.0
    require_nav_ready: bool = False
    langgraph_enabled: bool = False
    cosmos_enabled: bool = False
    deep_conf_threshold: float = 0.8
    deep_timeout_s: float = 3.0
    max_reentries: int = 2


@dataclass
class PlannerEvent:
    incident_key: str
    event_type: str
    severity: str | float
    confidence: float
    asset_criticality: float = 0.5
    has_signal_conflict: bool = False
    details: dict[str, Any] = field(default_factory=dict)
    source: str = "unknown"
    timestamp_s: float | None = None


@dataclass
class PlannerTask:
    task_id: str
    incident_key: str
    task_type: str
    priority: float
    state: TaskLifecycleState
    created_at_s: float
    updated_at_s: float
    payload: dict[str, Any] = field(default_factory=dict)
    route: str = "deterministic"
    requires_approval: bool = False


@dataclass
class PlannerAlert:
    level: str
    message: str
    task_id: str | None = None
    incident_key: str | None = None
    timestamp_s: float = 0.0


@dataclass
class DeepPlanningState:
    incident_key: str
    attempts: int
    reentries: int
    max_reentries: int
    last_error: str = ""


class PlannerJournal(Protocol):
    def log_event(self, event: PlannerEvent, accepted: bool, reason: str = "") -> None: ...

    def log_task(self, task: PlannerTask, event: PlannerEvent) -> None: ...

    def log_transition(
        self,
        *,
        task_id: str,
        source: str,
        from_state: str,
        to_state: str,
        reason: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def log_alert(self, alert: PlannerAlert) -> None: ...


@dataclass
class _MapState:
    width: int = 0
    height: int = 0
    resolution: float = 0.0
    stamp_s: float = 0.0
    received_at_s: float = 0.0


class PlannerEngine:
    """Deterministic task planner with optional deep-reasoning override."""

    def __init__(
        self,
        config: PlannerConfig,
        now_fn: Callable[[], float] | None = None,
    ) -> None:
        self.config = config
        self._now = now_fn or time.time
        self._queue: list[PlannerEvent] = []
        self._tasks: dict[str, PlannerTask] = {}
        self._incident_last_seen: dict[str, float] = {}
        self._alerts: list[PlannerAlert] = []
        self._map = _MapState()
        self._nav_ready = not config.require_nav_ready
        self._deep_client: Any = None
        self._journal: PlannerJournal | None = None

        self._stats: dict[str, int | float] = {
            "ingested_events": 0,
            "deduplicated_events": 0,
            "dropped_events": 0,
            "expired_events": 0,
            "tasks_created": 0,
            "tasks_dispatched": 0,
            "tasks_waiting_approval": 0,
            "tasks_canceled": 0,
            "tasks_paused": 0,
            "deep_attempts": 0,
            "deep_successes": 0,
            "deep_fallbacks": 0,
            "deep_reentry_attempts": 0,
            "deep_verification_failures": 0,
            "journal_writes": 0,
            "journal_failures": 0,
        }

    def set_deep_planner_client(self, client: Any) -> None:
        self._deep_client = client

    def set_journal(self, journal: PlannerJournal | None) -> None:
        self._journal = journal

    def ingest_event(self, event: PlannerEvent) -> bool:
        now = self._now()
        event.timestamp_s = event.timestamp_s if event.timestamp_s is not None else now
        self._expire_dedup_cache(now)
        self._expire_queue(now)

        last_seen = self._incident_last_seen.get(event.incident_key)
        if last_seen is not None and now - last_seen <= self.config.dedup_window_s:
            self._stats["deduplicated_events"] += 1
            self._write_journal(
                lambda: self._journal.log_event(event, accepted=False, reason="deduplicated")
            )
            return False

        if len(self._queue) >= self.config.queue_max_size:
            self._queue.pop(0)
            self._stats["dropped_events"] += 1

        self._queue.append(event)
        self._incident_last_seen[event.incident_key] = now
        self._stats["ingested_events"] += 1
        self._write_journal(lambda: self._journal.log_event(event, accepted=True))
        return True

    def update_map_metadata(
        self,
        width: int,
        height: int,
        resolution: float,
        stamp_s: float,
        received_at_s: float | None = None,
    ) -> None:
        self._map = _MapState(
            width=int(width),
            height=int(height),
            resolution=float(resolution),
            stamp_s=float(stamp_s),
            received_at_s=float(received_at_s if received_at_s is not None else self._now()),
        )

    def update_nav_ready(self, is_ready: bool) -> None:
        self._nav_ready = bool(is_ready)

    def tick(self) -> list[PlannerTask]:
        now = self._now()
        self._expire_queue(now)

        if not self._queue:
            return []

        if not self._is_dispatch_safe(now):
            return []

        active = self._active_task_count()
        if active >= self.config.max_active_tasks:
            return []

        self._queue.sort(key=lambda evt: self._score_event(evt, now), reverse=True)
        event = self._queue.pop(0)
        task = self._build_task(event, now)
        self._tasks[task.task_id] = task
        self._stats["tasks_created"] += 1
        self._write_journal(lambda: self._journal.log_task(task, event))

        if task.requires_approval:
            self._stats["tasks_waiting_approval"] += 1
            self._emit_alert(
                level="warning",
                message=(
                    f"Task {task.task_id} requires operator approval "
                    f"(incident={task.incident_key})."
                ),
                task_id=task.task_id,
                incident_key=task.incident_key,
            )
            return []

        task.state = TaskLifecycleState.DISPATCHED
        task.updated_at_s = now
        self._stats["tasks_dispatched"] += 1
        return [task]

    def apply_command(
        self,
        task_id: str,
        command: PlannerCommand | str,
    ) -> tuple[bool, str, PlannerTask | None]:
        now = self._now()
        parsed = self._parse_command(command)
        if parsed is None:
            return False, "Unknown command", None

        task = self._tasks.get(task_id)
        if task is None:
            return False, f"Task {task_id} not found", None

        if parsed == PlannerCommand.APPROVE:
            if task.state != TaskLifecycleState.PENDING_APPROVAL:
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:not_pending_approval",
                    )
                )
                return False, "Task is not pending approval", task
            if not self._is_dispatch_safe(now):
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:dispatch_gate_blocked",
                    )
                )
                return False, "Planner gate blocked dispatch", task
            if self._active_task_count(exclude_task_id=task_id) >= self.config.max_active_tasks:
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:max_active_tasks",
                    )
                )
                return False, "Max active tasks reached", task
            from_state = task.state.value
            task.state = TaskLifecycleState.DISPATCHED
            task.updated_at_s = now
            self._stats["tasks_dispatched"] += 1
            self._write_journal(
                lambda: self._journal.log_transition(
                    task_id=task.task_id,
                    source=f"operator_command:{parsed.value}",
                    from_state=from_state,
                    to_state=task.state.value,
                    reason="accepted",
                )
            )
            self._emit_alert(
                level="info",
                message=f"Task {task.task_id} approved and dispatched.",
                task_id=task.task_id,
                incident_key=task.incident_key,
            )
            return True, "Task approved", task

        if parsed == PlannerCommand.CANCEL:
            if task.state in {
                TaskLifecycleState.CANCELED,
                TaskLifecycleState.COMPLETED,
            }:
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:already_terminal",
                    )
                )
                return False, "Task is already terminal", task
            from_state = task.state.value
            task.state = TaskLifecycleState.CANCELED
            task.updated_at_s = now
            self._stats["tasks_canceled"] += 1
            self._write_journal(
                lambda: self._journal.log_transition(
                    task_id=task.task_id,
                    source=f"operator_command:{parsed.value}",
                    from_state=from_state,
                    to_state=task.state.value,
                    reason="accepted",
                )
            )
            self._emit_alert(
                level="warning",
                message=f"Task {task.task_id} canceled by operator.",
                task_id=task.task_id,
                incident_key=task.incident_key,
            )
            return True, "Task canceled", task

        if parsed == PlannerCommand.PAUSE:
            if task.state not in {
                TaskLifecycleState.DISPATCHED,
                TaskLifecycleState.IN_PROGRESS,
            }:
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:invalid_state_for_pause",
                    )
                )
                return False, "Task cannot be paused in current state", task
            from_state = task.state.value
            task.state = TaskLifecycleState.PAUSED
            task.updated_at_s = now
            self._stats["tasks_paused"] += 1
            self._write_journal(
                lambda: self._journal.log_transition(
                    task_id=task.task_id,
                    source=f"operator_command:{parsed.value}",
                    from_state=from_state,
                    to_state=task.state.value,
                    reason="accepted",
                )
            )
            self._emit_alert(
                level="info",
                message=f"Task {task.task_id} paused.",
                task_id=task.task_id,
                incident_key=task.incident_key,
            )
            return True, "Task paused", task

        if parsed == PlannerCommand.RESUME:
            if task.state != TaskLifecycleState.PAUSED:
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:not_paused",
                    )
                )
                return False, "Task is not paused", task
            if not self._is_dispatch_safe(now):
                self._write_journal(
                    lambda: self._journal.log_transition(
                        task_id=task.task_id,
                        source=f"operator_command:{parsed.value}",
                        from_state=task.state.value,
                        to_state=task.state.value,
                        reason="rejected:resume_gate_blocked",
                    )
                )
                return False, "Planner gate blocked resume", task
            from_state = task.state.value
            task.state = TaskLifecycleState.DISPATCHED
            task.updated_at_s = now
            self._write_journal(
                lambda: self._journal.log_transition(
                    task_id=task.task_id,
                    source=f"operator_command:{parsed.value}",
                    from_state=from_state,
                    to_state=task.state.value,
                    reason="accepted",
                )
            )
            self._emit_alert(
                level="info",
                message=f"Task {task.task_id} resumed.",
                task_id=task.task_id,
                incident_key=task.incident_key,
            )
            return True, "Task resumed", task

        return False, "Unhandled command", task

    def update_task_status(
        self,
        task_id: str,
        status: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        task = self._tasks.get(task_id)
        if task is None:
            return False

        normalized = status.strip().lower()
        mapping = {
            "dispatched": TaskLifecycleState.DISPATCHED,
            "in_progress": TaskLifecycleState.IN_PROGRESS,
            "paused": TaskLifecycleState.PAUSED,
            "completed": TaskLifecycleState.COMPLETED,
            "canceled": TaskLifecycleState.CANCELED,
            "failed": TaskLifecycleState.FAILED,
        }
        state = mapping.get(normalized)
        if state is None:
            return False

        meta = metadata or {}
        from_state = task.state.value
        task.state = state
        task.updated_at_s = self._now()
        self._write_journal(
            lambda: self._journal.log_transition(
                task_id=task.task_id,
                source="executor_status",
                from_state=from_state,
                to_state=task.state.value,
                reason=f"status:{normalized}",
                metadata=meta,
            )
        )
        if "nav_ready" in meta:
            self.update_nav_ready(bool(meta["nav_ready"]))
        return True

    def get_tasks(self, state: TaskLifecycleState | None = None) -> list[PlannerTask]:
        values = list(self._tasks.values())
        if state is None:
            return sorted(values, key=lambda task: task.created_at_s)
        return sorted(
            [task for task in values if task.state == state],
            key=lambda task: task.created_at_s,
        )

    def pop_alerts(self) -> list[PlannerAlert]:
        alerts = self._alerts[:]
        self._alerts.clear()
        return alerts

    def get_stats(self) -> dict[str, Any]:
        deep_attempts = int(self._stats["deep_attempts"])
        deep_successes = int(self._stats["deep_successes"])
        success_rate = 0.0 if deep_attempts == 0 else deep_successes / deep_attempts

        return {
            **self._stats,
            "queue_size": len(self._queue),
            "task_count": len(self._tasks),
            "active_task_count": self._active_task_count(),
            "map_ready": self._is_map_ready(self._now()),
            "nav_ready": self._nav_ready,
            "deep_success_rate": float(success_rate),
            "journal_enabled": self._journal is not None,
        }

    def _build_task(self, event: PlannerEvent, now: float) -> PlannerTask:
        severity_score = self._severity_to_score(event.severity)
        requires_approval = severity_score > self.config.auto_approve_max_severity
        route = "deterministic"
        task_type = self._task_type_for_event(event)
        priority = self._score_event(event, now)
        payload: dict[str, Any] = {
            "event_type": event.event_type,
            "incident_key": event.incident_key,
            "source": event.source,
            "details": event.details,
        }

        if self._should_use_deep_route(event):
            deep_plan, deep_state = self._plan_with_reentry(event)
            if deep_plan is not None:
                route = "deep"
                self._stats["deep_successes"] += 1
                task_type = str(deep_plan.get("task_type", task_type))
                priority = self._priority_from_deep_plan(
                    deep_plan_value=deep_plan.get("priority"),
                    fallback=priority,
                )
                payload.update(deep_plan.get("payload", {}))
            else:
                route = "deterministic_fallback"
                self._stats["deep_fallbacks"] += 1
                self._emit_alert(
                    level="warning",
                    message=(
                        f"Deep planning fallback for incident {event.incident_key}; "
                        f"deterministic planner used (attempts={deep_state.attempts}, "
                        f"reentries={deep_state.reentries}, reason={deep_state.last_error or 'n/a'})."
                    ),
                    incident_key=event.incident_key,
                )

        initial_state = (
            TaskLifecycleState.PENDING_APPROVAL
            if requires_approval
            else TaskLifecycleState.DISPATCHED
        )

        return PlannerTask(
            task_id=self._new_task_id(),
            incident_key=event.incident_key,
            task_type=task_type,
            priority=priority,
            state=initial_state,
            created_at_s=now,
            updated_at_s=now,
            payload=payload,
            route=route,
            requires_approval=requires_approval,
        )

    def _plan_with_reentry(self, event: PlannerEvent) -> tuple[dict[str, Any] | None, DeepPlanningState]:
        state = DeepPlanningState(
            incident_key=event.incident_key,
            attempts=0,
            reentries=0,
            max_reentries=max(0, int(self.config.max_reentries)),
        )

        if not (self.config.langgraph_enabled and self.config.cosmos_enabled):
            state.last_error = "deep route disabled"
            return None, state

        if self._deep_client is None:
            state.last_error = "deep planner client unavailable"
            return None, state

        while True:
            state.attempts += 1
            self._stats["deep_attempts"] += 1
            deep_plan, error = self._try_deep_plan_once(event)
            if deep_plan is not None:
                return deep_plan, state

            state.last_error = error or "deep planner returned no response"
            if state.reentries >= state.max_reentries:
                return None, state

            state.reentries += 1
            self._stats["deep_reentry_attempts"] += 1

    def _try_deep_plan_once(self, event: PlannerEvent) -> tuple[dict[str, Any] | None, str]:
        try:
            result = self._deep_client.plan(event, timeout_s=self.config.deep_timeout_s)
        except Exception as exc:
            return None, str(exc)

        if not isinstance(result, dict):
            return None, "deep planner response is not an object"

        if not self._verify_deep_plan(result):
            self._stats["deep_verification_failures"] += 1
            return None, "deep planner response failed verification"

        return result, ""

    @staticmethod
    def _verify_deep_plan(plan: dict[str, Any]) -> bool:
        task_type = plan.get("task_type")
        if task_type is not None and (not isinstance(task_type, str) or not task_type.strip()):
            return False

        payload = plan.get("payload")
        if payload is not None and not isinstance(payload, dict):
            return False

        return True

    def _should_use_deep_route(self, event: PlannerEvent) -> bool:
        if not self.config.langgraph_enabled:
            return False
        severity_score = self._severity_to_score(event.severity)
        if severity_score >= 0.55:
            return True
        if event.confidence < self.config.deep_conf_threshold:
            return True
        if event.has_signal_conflict:
            return True
        return False

    def _task_type_for_event(self, event: PlannerEvent) -> str:
        event_type = event.event_type.strip().lower()
        if event_type in {"blindspot", "blindspot_event", "blindspot_detected"}:
            return "INSPECT_BLINDSPOT"
        if event_type in {"risk", "risk_assessment"}:
            return "INSPECT_POI"
        return "INVESTIGATE_ALERT"

    def _score_event(self, event: PlannerEvent, now: float) -> float:
        severity_score = self._severity_to_score(event.severity)
        confidence_score = self._clamp(event.confidence)
        asset_score = self._clamp(event.asset_criticality)

        age = max(0.0, now - float(event.timestamp_s or now))
        ttl = max(1.0, self.config.incident_ttl_s)
        recency_score = math.exp(-age / ttl)

        score = (
            0.45 * severity_score
            + 0.20 * confidence_score
            + 0.25 * asset_score
            + 0.10 * recency_score
        )
        return self._clamp(score)

    def _is_dispatch_safe(self, now: float) -> bool:
        if self.config.require_map and not self._is_map_ready(now):
            self._emit_alert(level="warning", message="Dispatch blocked: map is not ready.")
            return False
        if self.config.require_nav_ready and not self._nav_ready:
            self._emit_alert(level="warning", message="Dispatch blocked: nav is not ready.")
            return False
        return True

    def _is_map_ready(self, now: float) -> bool:
        if not self.config.require_map:
            return True
        if self._map.width <= 0 or self._map.height <= 0:
            return False
        if self._map.resolution <= 0:
            return False

        freshest_reference = max(self._map.received_at_s, self._map.stamp_s)
        return (now - freshest_reference) <= self.config.map_stale_timeout_s

    def _active_task_count(self, exclude_task_id: str | None = None) -> int:
        active_states = {
            TaskLifecycleState.DISPATCHED,
            TaskLifecycleState.IN_PROGRESS,
        }
        count = 0
        for task in self._tasks.values():
            if exclude_task_id is not None and task.task_id == exclude_task_id:
                continue
            if task.state in active_states:
                count += 1
        return count

    def _emit_alert(
        self,
        level: str,
        message: str,
        task_id: str | None = None,
        incident_key: str | None = None,
    ) -> None:
        alert = PlannerAlert(
            level=level,
            message=message,
            task_id=task_id,
            incident_key=incident_key,
            timestamp_s=self._now(),
        )
        self._alerts.append(alert)
        self._write_journal(lambda: self._journal.log_alert(alert))

    def _expire_dedup_cache(self, now: float) -> None:
        ttl = max(1.0, self.config.dedup_window_s)
        stale = [key for key, stamp in self._incident_last_seen.items() if (now - stamp) > ttl]
        for key in stale:
            del self._incident_last_seen[key]

    def _expire_queue(self, now: float) -> None:
        ttl = max(1.0, self.config.incident_ttl_s)
        kept: list[PlannerEvent] = []
        expired = 0
        for event in self._queue:
            event_age = now - float(event.timestamp_s or now)
            if event_age > ttl:
                expired += 1
            else:
                kept.append(event)
        if expired:
            self._stats["expired_events"] += expired
        self._queue = kept

    @staticmethod
    def _parse_command(command: PlannerCommand | str) -> PlannerCommand | None:
        if isinstance(command, PlannerCommand):
            return command
        normalized = command.strip().lower()
        for candidate in PlannerCommand:
            if candidate.value == normalized:
                return candidate
        return None

    @staticmethod
    def _severity_to_score(value: str | float) -> float:
        if isinstance(value, (int, float)):
            return PlannerEngine._clamp(float(value))

        mapping = {
            "info": 0.1,
            "low": 0.25,
            "green": 0.25,
            "medium": 0.55,
            "yellow": 0.55,
            "high": 0.75,
            "red": 0.9,
            "critical": 1.0,
        }
        return mapping.get(value.strip().lower(), 0.5)

    @staticmethod
    def _new_task_id() -> str:
        return f"task-{uuid.uuid4().hex[:10]}"

    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    def _priority_from_deep_plan(self, deep_plan_value: Any, fallback: float) -> float:
        known_labels = {"info", "low", "green", "medium", "yellow", "high", "red", "critical"}

        if deep_plan_value is None:
            return self._clamp(fallback)

        if isinstance(deep_plan_value, (int, float)):
            return self._clamp(float(deep_plan_value))

        if isinstance(deep_plan_value, str):
            value = deep_plan_value.strip().lower()
            try:
                return self._clamp(float(value))
            except ValueError:
                if value in known_labels:
                    return self._severity_to_score(value)
                return self._clamp(fallback)

        return self._clamp(fallback)

    def _write_journal(self, operation: Callable[[], None]) -> None:
        if self._journal is None:
            return
        try:
            operation()
            self._stats["journal_writes"] += 1
        except Exception:
            self._stats["journal_failures"] += 1

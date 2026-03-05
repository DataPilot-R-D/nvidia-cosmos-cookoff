"""SQLite-backed planner journal for observability and postmortem replay."""

from __future__ import annotations

import json
import os
import queue
import sqlite3
import threading
import time
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .planner_core import PlannerAlert, PlannerEvent, PlannerTask


class SQLitePlannerJournal:
    """Append-only journaling sink for planner events and lifecycle transitions."""

    def __init__(
        self,
        db_path: str,
        *,
        flush_interval_s: float = 0.05,
        batch_size: int = 64,
        queue_max_size: int = 2048,
    ) -> None:
        if not db_path.strip():
            raise ValueError("db_path must not be empty")

        self._db_path = os.path.abspath(db_path)
        parent = os.path.dirname(self._db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._flush_interval_s = max(0.01, float(flush_interval_s))
        self._batch_size = max(1, int(batch_size))
        self._queue: queue.Queue[tuple[str, tuple[Any, ...]] | None] = queue.Queue(
            maxsize=max(32, int(queue_max_size))
        )
        self._fatal_error: str | None = None
        self._write_failures = 0

        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._initialize_schema()
        self._worker = threading.Thread(
            target=self._writer_loop,
            name="planner-journal-writer",
            daemon=True,
        )
        self._worker.start()

    @property
    def db_path(self) -> str:
        return self._db_path

    @property
    def write_failures(self) -> int:
        return self._write_failures

    def close(self) -> None:
        if self._conn is None:
            return

        self._stop_event.set()
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            # Writer wakes up on timeout even if sentinel cannot be enqueued.
            pass

        self._worker.join(timeout=5.0)

        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def log_event(self, event: PlannerEvent, accepted: bool, reason: str = "") -> None:
        status = "accepted" if accepted else "rejected"
        self._enqueue(
            """
            INSERT INTO planner_events (
                timestamp_s, incident_key, event_type, status, reason, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                float(event.timestamp_s or 0.0),
                event.incident_key,
                event.event_type,
                status,
                reason,
                json.dumps(event.details, ensure_ascii=True),
            ),
        )

    def log_task(self, task: PlannerTask, event: PlannerEvent) -> None:
        payload = {
            "event_type": event.event_type,
            "source": event.source,
            "task_payload": task.payload,
        }
        self._enqueue(
            """
            INSERT INTO planner_tasks (
                timestamp_s,
                task_id,
                incident_key,
                task_type,
                priority,
                state,
                route,
                requires_approval,
                payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                float(task.created_at_s),
                task.task_id,
                task.incident_key,
                task.task_type,
                float(task.priority),
                task.state.value,
                task.route,
                1 if task.requires_approval else 0,
                json.dumps(payload, ensure_ascii=True),
            ),
        )

    def log_transition(
        self,
        *,
        task_id: str,
        source: str,
        from_state: str,
        to_state: str,
        reason: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self._enqueue(
            """
            INSERT INTO planner_transitions (
                timestamp_s, task_id, source, from_state, to_state, reason, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                self._timestamp(),
                task_id,
                source,
                from_state,
                to_state,
                reason,
                json.dumps(metadata or {}, ensure_ascii=True),
            ),
        )

    def log_alert(self, alert: PlannerAlert) -> None:
        payload = {"task_id": alert.task_id, "incident_key": alert.incident_key}
        self._enqueue(
            """
            INSERT INTO planner_alerts (
                timestamp_s, level, message, task_id, incident_key, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                float(alert.timestamp_s),
                alert.level,
                alert.message,
                alert.task_id,
                alert.incident_key,
                json.dumps(payload, ensure_ascii=True),
            ),
        )

    def _initialize_schema(self) -> None:
        self._execute_batch(
            [
                (
                    """
                    CREATE TABLE IF NOT EXISTS planner_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp_s REAL NOT NULL,
                        incident_key TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        reason TEXT NOT NULL DEFAULT '',
                        payload_json TEXT NOT NULL
                    )
                    """,
                    (),
                ),
                (
                    """
                    CREATE TABLE IF NOT EXISTS planner_tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp_s REAL NOT NULL,
                        task_id TEXT NOT NULL,
                        incident_key TEXT NOT NULL,
                        task_type TEXT NOT NULL,
                        priority REAL NOT NULL,
                        state TEXT NOT NULL,
                        route TEXT NOT NULL,
                        requires_approval INTEGER NOT NULL,
                        payload_json TEXT NOT NULL
                    )
                    """,
                    (),
                ),
                (
                    """
                    CREATE TABLE IF NOT EXISTS planner_transitions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp_s REAL NOT NULL,
                        task_id TEXT NOT NULL,
                        source TEXT NOT NULL,
                        from_state TEXT NOT NULL,
                        to_state TEXT NOT NULL,
                        reason TEXT NOT NULL DEFAULT '',
                        metadata_json TEXT NOT NULL
                    )
                    """,
                    (),
                ),
                (
                    """
                    CREATE TABLE IF NOT EXISTS planner_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp_s REAL NOT NULL,
                        level TEXT NOT NULL,
                        message TEXT NOT NULL,
                        task_id TEXT,
                        incident_key TEXT,
                        payload_json TEXT NOT NULL
                    )
                    """,
                    (),
                ),
            ]
        )

    def _enqueue(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        if self._conn is None:
            raise RuntimeError("planner journal is closed")
        if self._fatal_error is not None:
            raise RuntimeError(f"planner journal failed: {self._fatal_error}")
        try:
            self._queue.put_nowait((sql, params))
        except queue.Full as exc:
            raise RuntimeError("planner journal queue is full") from exc

    def _writer_loop(self) -> None:
        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                first = self._queue.get(timeout=self._flush_interval_s)
            except queue.Empty:
                continue

            if first is None:
                continue

            batch: list[tuple[str, tuple[Any, ...]]] = [first]
            while len(batch) < self._batch_size:
                try:
                    item = self._queue.get_nowait()
                except queue.Empty:
                    break
                if item is None:
                    continue
                batch.append(item)

            try:
                self._execute_batch(batch)
            except Exception as exc:
                self._write_failures += len(batch)
                self._fatal_error = str(exc)

    def _execute_batch(self, batch: list[tuple[str, tuple[Any, ...]]]) -> None:
        with self._lock:
            if self._conn is None:
                raise RuntimeError("planner journal is closed")
            self._conn.execute("BEGIN")
            try:
                for sql, params in batch:
                    self._conn.execute(sql, params)
            except Exception:
                self._conn.rollback()
                raise
            self._conn.commit()

    @staticmethod
    def _timestamp() -> float:
        return float(time.time())

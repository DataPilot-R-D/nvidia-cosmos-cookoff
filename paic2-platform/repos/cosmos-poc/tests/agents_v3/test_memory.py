"""Sliding memory window tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.memory import SlidingMemoryWindow


def test_sliding_memory_window_keeps_last_n_items() -> None:
    memory = SlidingMemoryWindow(max_items=2)

    memory.add({"frame_id": "f1", "summary": "empty hallway"})
    memory.add({"frame_id": "f2", "summary": "door opened"})
    memory.add({"frame_id": "f3", "summary": "person entered"})

    assert memory.snapshot() == [
        {"frame_id": "f2", "summary": "door opened"},
        {"frame_id": "f3", "summary": "person entered"},
    ]


def test_sliding_memory_snapshot_returns_copy() -> None:
    memory = SlidingMemoryWindow(max_items=3)
    memory.add({"frame_id": "f1", "summary": "baseline"})

    snapshot = memory.snapshot()
    snapshot.append({"frame_id": "tampered", "summary": "should not persist"})

    assert memory.snapshot() == [{"frame_id": "f1", "summary": "baseline"}]

"""Sliding memory window utilities for V3 temporal context."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SlidingMemoryWindow:
    """Keep only the last N memory entries."""

    max_items: int = 5
    _items: list[dict[str, Any]] = field(default_factory=list)

    def add(self, item: dict[str, Any]) -> None:
        self._items.append(dict(item))
        if len(self._items) > self.max_items:
            self._items = self._items[-self.max_items :]

    def snapshot(self) -> list[dict[str, Any]]:
        return [dict(entry) for entry in self._items]

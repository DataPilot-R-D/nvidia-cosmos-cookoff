from __future__ import annotations

import json
import re
from dataclasses import dataclass


@dataclass
class MoondreamObjectsConfig:
    max_objects: int = 12


class MoondreamObjectsLocalModel:
    def __init__(self, base_vlm, *, max_objects: int = 12):
        self._base_vlm = base_vlm
        self._cfg = MoondreamObjectsConfig(max_objects=max_objects)
        self._name_to_id: dict[str, str] = {}
        self._next_id = 1

    def start(self) -> None:
        if hasattr(self._base_vlm, "start"):
            self._base_vlm.start()

    def stop(self) -> None:
        if hasattr(self._base_vlm, "stop"):
            self._base_vlm.stop()

    def _alloc_id(self, name: str) -> str:
        name = name.strip().lower()
        if not name:
            return ""
        if name not in self._name_to_id:
            self._name_to_id[name] = f"E{self._next_id}"
            self._next_id += 1
        return self._name_to_id[name]

    def _extract_window(self, query: str) -> tuple[float, float]:
        m = re.search(r'"start_s"\s*:\s*([-0-9.]+)', query)
        n = re.search(r'"end_s"\s*:\s*([-0-9.]+)', query)
        if m and n:
            try:
                return float(m.group(1)), float(n.group(1))
            except ValueError:
                pass
        return 0.0, 0.0

    def _prompt_objects_only(self) -> str:
        return (
            "List the distinct objects you can see in the image. "
            "Return ONLY a comma-separated list of short object names (no JSON, no extra text). "
            "Example: person, laptop, keyboard, mug"
        )

    def _parse_objects(self, text: str) -> list[str]:
        if not text:
            return []
        text = text.strip()
        text = re.sub(r"^[A-Za-z ]*:", "", text).strip()
        text = text.strip("`\n ")
        parts = [p.strip() for p in re.split(r"[,\n;]+", text) if p.strip()]
        cleaned: list[str] = []
        for p in parts:
            p = re.sub(r"\s+", " ", p)
            p = re.sub(r"[^a-zA-Z0-9 _-]", "", p).strip().lower()
            if not p:
                continue
            if p in {"unknown", "n/a", "none"}:
                continue
            if p not in cleaned:
                cleaned.append(p)
            if len(cleaned) >= self._cfg.max_objects:
                break
        return cleaned

    def _objects_to_temporal_json(self, objects: list[str], *, window: tuple[float, float]) -> str:
        start_s, end_s = window
        ids = [self._alloc_id(o) for o in objects]
        ids = [i for i in ids if i]

        data = {
            "window": {"start_s": start_s, "end_s": end_s},
            "caption": ", ".join(objects),
            "entities_present": [{"id": i, "confidence": 0.5} for i in ids],
            "new_entities": [
                {"id": i, "type": "object", "descriptor": name}
                for name, i in zip(objects, ids, strict=False)
            ],
            "relations": [],
            "on_screen_text": [],
            "uncertainties": [],
            "confidence": 0.5,
        }
        return json.dumps(data, ensure_ascii=False)

    def query(self, image, query: str, response_format=None, **kwargs) -> str:
        window = self._extract_window(query)
        prompt = self._prompt_objects_only()
        raw = self._base_vlm.query(image, prompt, response_format=response_format, **kwargs)
        objects = self._parse_objects(raw)
        return self._objects_to_temporal_json(objects, window=window)

    def query_batch(self, images: list, query: str, response_format=None, **kwargs) -> list[str]:
        window = self._extract_window(query)
        prompt = self._prompt_objects_only()
        raws = self._base_vlm.query_batch(images, prompt, response_format=response_format, **kwargs)
        results: list[str] = []
        for raw in raws:
            objects = self._parse_objects(raw)
            results.append(self._objects_to_temporal_json(objects, window=window))
        if len(results) < len(images):
            results.extend([self._objects_to_temporal_json([], window=window)] * (len(images) - len(results)))
        return results

    def __getattr__(self, name):
        return getattr(self._base_vlm, name)

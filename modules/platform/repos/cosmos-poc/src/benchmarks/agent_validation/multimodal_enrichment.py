"""Multimodal validation helpers: image frame + structured metadata prompts."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Any

from src.benchmarks.agent_validation.foundation import COSMOS2_DIR
from src.benchmarks.agent_validation.oracle_track_b import (
    find_largest_scene_cluster,
    load_track_b_rows,
)
from src.benchmarks.agent_validation.response_contract import (
    ResponseContractError,
    parse_strict_json_object,
    validate_required_numeric_fields,
)
from src.connectors.cosmos_client import CosmosClient

TRACK_B_DB_PATH = COSMOS2_DIR / "objects.db"


def get_track_b_scene_case() -> dict[str, Any]:
    """Return deterministic scene case anchored to largest frame-hash cluster."""

    return find_largest_scene_cluster(load_track_b_rows())


def export_timestamp_frame(timestamp: float, output_dir: Path) -> Path:
    """Export a representative JPEG frame for a specific timestamp."""

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"scene_{timestamp:.7f}.jpg"

    with sqlite3.connect(TRACK_B_DB_PATH) as connection:
        row = connection.execute(
            """
            SELECT camera_frame_jpeg
            FROM detections
            WHERE timestamp = ?
            LIMIT 1
            """,
            (timestamp,),
        ).fetchone()
    if row is None or row[0] is None:
        raise FileNotFoundError(f"No frame BLOB found for timestamp {timestamp}")

    output_path.write_bytes(row[0])
    return output_path


def build_scene_enrichment_prompt(scene_case: dict[str, Any]) -> str:
    """Build strict JSON prompt combining image reasoning + tabular candidates."""

    candidates = scene_case["object_names"]
    timestamp = scene_case["timestamp"]
    return (
        "You are given one camera frame image and structured metadata candidates.\n"
        "Use the image as primary evidence, and metadata to constrain labels.\n\n"
        "Task:\n"
        "- Identify which candidate_object_names are visibly present in the image.\n"
        "- Do not invent labels outside candidate_object_names.\n\n"
        "Timestamp rule:\n"
        f"- The response field `timestamp` MUST equal {timestamp} exactly.\n\n"
        "Return ONLY strict JSON with schema:\n"
        f'{{"timestamp": {timestamp}, "visible_objects": ["..."]}}\n\n'
        f"timestamp = {timestamp}\n"
        f"candidate_object_names = {json.dumps(candidates, ensure_ascii=False)}"
    )


@dataclass
class AgentMultimodalValidationRunner:
    """Run multimodal enrichment validation queries against Cosmos."""

    cosmos_client: CosmosClient
    work_dir: Path
    max_tokens: int = 600

    def query_largest_scene_with_image_enrichment(self) -> dict[str, Any]:
        scene_case = get_track_b_scene_case()
        frame_path = export_timestamp_frame(scene_case["timestamp"], output_dir=self.work_dir)
        prompt = build_scene_enrichment_prompt(scene_case)

        raw = self.cosmos_client.chat_with_video(
            video_path_or_url=str(frame_path),
            prompt=prompt,
            temperature=0.0,
            max_tokens=self.max_tokens,
        )
        payload = parse_strict_json_object(raw)

        validate_required_numeric_fields(
            payload=payload,
            required_keys={"timestamp"},
            numeric_keys={"timestamp"},
        )
        visible_objects = payload.get("visible_objects")
        if not isinstance(visible_objects, list):
            raise ResponseContractError("Field 'visible_objects' must be a list")
        for index, object_name in enumerate(visible_objects):
            if not isinstance(object_name, str):
                raise ResponseContractError(
                    f"Field 'visible_objects[{index}]' must be text, got {type(object_name).__name__}"
                )
        return payload

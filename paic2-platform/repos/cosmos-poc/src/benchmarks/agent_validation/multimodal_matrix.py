"""Multimodal evidence matrix: A/B comparison + decoys + conflict checks."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from statistics import mean
from typing import Any

from src.benchmarks.agent_validation.multimodal_enrichment import export_timestamp_frame
from src.benchmarks.agent_validation.oracle_track_b import load_track_b_rows
from src.benchmarks.agent_validation.response_contract import (
    ResponseContractError,
    parse_strict_json_object,
    validate_required_numeric_fields,
)
from src.connectors.cosmos_client import CosmosClient


@dataclass(frozen=True)
class MultimodalCase:
    """Single timestamp case with oracle objects + decoys + exported frame."""

    case_id: str
    timestamp: float
    frame_path: Path
    oracle_objects: list[str]
    decoy_objects: list[str]
    candidate_objects: list[str]


def _unique_ordered(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _rows_grouped_by_timestamp() -> list[tuple[float, list[str]]]:
    rows = load_track_b_rows()
    grouped: dict[float, list[str]] = {}
    for row in rows:
        grouped.setdefault(row.timestamp, []).append(row.object_name)
    return [(timestamp, _unique_ordered(names)) for timestamp, names in sorted(grouped.items())]


def build_multimodal_cases(
    output_dir: Path,
    max_cases: int = 6,
    decoy_count: int = 3,
) -> list[MultimodalCase]:
    """Build deterministic cases across timestamps with fixed-size decoy sets."""

    grouped = _rows_grouped_by_timestamp()
    all_objects = _unique_ordered([name for _, names in grouped for name in names])

    cases: list[MultimodalCase] = []
    for index, (timestamp, oracle_objects) in enumerate(grouped[:max_cases]):
        pool = [name for name in all_objects if name not in oracle_objects]
        if len(pool) < decoy_count:
            raise ValueError("Not enough decoy candidates to build multimodal cases")

        start = index % len(pool)
        rotated = pool[start:] + pool[:start]
        decoy_objects = rotated[:decoy_count]
        candidate_objects = oracle_objects + decoy_objects

        frame_path = export_timestamp_frame(timestamp=timestamp, output_dir=output_dir)
        cases.append(
            MultimodalCase(
                case_id=f"track_b_ts_{index}",
                timestamp=timestamp,
                frame_path=frame_path,
                oracle_objects=oracle_objects,
                decoy_objects=decoy_objects,
                candidate_objects=candidate_objects,
            )
        )
    return cases


def score_object_sets(predicted: set[str], expected: set[str]) -> dict[str, Any]:
    """Compute precision/recall/F1 with TP/FP/FN counts."""

    tp = len(predicted.intersection(expected))
    fp = len(predicted.difference(expected))
    fn = len(expected.difference(predicted))
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    if precision + recall == 0.0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def _build_image_prompt(case: MultimodalCase) -> str:
    return (
        "You are given one camera frame and candidate labels.\n"
        "Use the image as primary evidence.\n"
        "Do not output labels outside candidates.\n"
        "Return strict JSON:\n"
        f'{{"timestamp": {case.timestamp}, "visible_objects": ["..."], "metadata_consistent": true}}\n\n'
        f"timestamp MUST equal {case.timestamp}\n"
        f"candidate_object_names = {json.dumps(case.candidate_objects, ensure_ascii=False)}"
    )


def _build_metadata_only_prompt(case: MultimodalCase) -> str:
    return (
        "No image is provided. Use metadata candidates only.\n"
        "Return strict JSON with a best-effort subset of likely visible objects.\n"
        "Return strict JSON:\n"
        f'{{"timestamp": {case.timestamp}, "visible_objects": ["..."], "metadata_consistent": true}}\n\n'
        f"timestamp MUST equal {case.timestamp}\n"
        f"candidate_object_names = {json.dumps(case.candidate_objects, ensure_ascii=False)}"
    )


def _build_conflict_prompt(image_case: MultimodalCase, metadata_case: MultimodalCase) -> str:
    return (
        "You are given one camera frame and metadata from another timestamp.\n"
        "Decide if metadata is consistent with image.\n"
        "Return strict JSON:\n"
        f'{{"image_timestamp": {image_case.timestamp}, "metadata_timestamp": {metadata_case.timestamp}, '
        '"metadata_consistent": false, "visible_objects": ["..."]}}\n\n'
        f"image_timestamp MUST equal {image_case.timestamp}\n"
        f"metadata_timestamp MUST equal {metadata_case.timestamp}\n"
        f"candidate_object_names = {json.dumps(metadata_case.candidate_objects, ensure_ascii=False)}"
    )


def _validate_payload(
    payload: dict[str, Any],
    *,
    numeric_keys: set[str],
    required_keys: set[str],
) -> dict[str, Any]:
    validate_required_numeric_fields(payload=payload, required_keys=required_keys, numeric_keys=numeric_keys)
    visible = payload.get("visible_objects")
    if not isinstance(visible, list):
        raise ResponseContractError("Field 'visible_objects' must be a list")
    for index, obj in enumerate(visible):
        if not isinstance(obj, str):
            raise ResponseContractError(
                f"Field 'visible_objects[{index}]' must be text, got {type(obj).__name__}"
            )
    if "metadata_consistent" in payload and not isinstance(payload["metadata_consistent"], bool):
        raise ResponseContractError("Field 'metadata_consistent' must be boolean")
    return payload


@dataclass
class MultimodalEvidenceRunner:
    """Execute multimodal A/B and conflict matrix with score aggregation."""

    cosmos_client: CosmosClient
    work_dir: Path
    max_tokens: int = 700

    def query_image_enriched(self, case: MultimodalCase) -> dict[str, Any]:
        raw = self.cosmos_client.chat_with_video(
            video_path_or_url=str(case.frame_path),
            prompt=_build_image_prompt(case),
            temperature=0.0,
            max_tokens=self.max_tokens,
        )
        payload = parse_strict_json_object(raw)
        return _validate_payload(
            payload,
            numeric_keys={"timestamp"},
            required_keys={"timestamp", "visible_objects"},
        )

    def query_metadata_only(self, case: MultimodalCase) -> dict[str, Any]:
        raw = self.cosmos_client.chat(
            messages=[{"role": "user", "content": _build_metadata_only_prompt(case)}],
            temperature=0.0,
            max_tokens=self.max_tokens,
        )
        payload = parse_strict_json_object(raw)
        return _validate_payload(
            payload,
            numeric_keys={"timestamp"},
            required_keys={"timestamp", "visible_objects"},
        )

    def query_conflict(self, image_case: MultimodalCase, metadata_case: MultimodalCase) -> dict[str, Any]:
        raw = self.cosmos_client.chat_with_video(
            video_path_or_url=str(image_case.frame_path),
            prompt=_build_conflict_prompt(image_case, metadata_case),
            temperature=0.0,
            max_tokens=self.max_tokens,
        )
        payload = parse_strict_json_object(raw)
        return _validate_payload(
            payload,
            numeric_keys={"image_timestamp", "metadata_timestamp"},
            required_keys={"image_timestamp", "metadata_timestamp", "visible_objects", "metadata_consistent"},
        )

    def run_evidence_matrix(
        self,
        max_cases: int = 6,
        decoy_count: int = 3,
    ) -> dict[str, Any]:
        cases = build_multimodal_cases(output_dir=self.work_dir, max_cases=max_cases, decoy_count=decoy_count)

        per_case: list[dict[str, Any]] = []
        image_f1: list[float] = []
        metadata_f1: list[float] = []
        image_decoy_hits: list[int] = []
        metadata_decoy_hits: list[int] = []
        conflict_correct_flags: list[bool] = []

        for index, case in enumerate(cases):
            image_payload = self.query_image_enriched(case)
            metadata_payload = self.query_metadata_only(case)
            conflict_metadata_case = cases[(index + 1) % len(cases)]
            conflict_payload = self.query_conflict(case, conflict_metadata_case)

            oracle_set = set(case.oracle_objects)
            decoy_set = set(case.decoy_objects)
            image_set = set(image_payload["visible_objects"])
            metadata_set = set(metadata_payload["visible_objects"])

            image_score = score_object_sets(image_set, oracle_set)
            metadata_score = score_object_sets(metadata_set, oracle_set)
            image_f1.append(image_score["f1"])
            metadata_f1.append(metadata_score["f1"])

            image_decoys = len(image_set.intersection(decoy_set))
            metadata_decoys = len(metadata_set.intersection(decoy_set))
            image_decoy_hits.append(image_decoys)
            metadata_decoy_hits.append(metadata_decoys)

            conflict_correct = conflict_payload.get("metadata_consistent") is False
            conflict_correct_flags.append(conflict_correct)

            per_case.append(
                {
                    "case_id": case.case_id,
                    "timestamp": case.timestamp,
                    "oracle_objects": case.oracle_objects,
                    "decoy_objects": case.decoy_objects,
                    "image_enriched": {
                        "payload": image_payload,
                        "score": image_score,
                        "decoy_false_positives": image_decoys,
                    },
                    "metadata_only": {
                        "payload": metadata_payload,
                        "score": metadata_score,
                        "decoy_false_positives": metadata_decoys,
                    },
                    "conflict_test": {
                        "image_timestamp": case.timestamp,
                        "metadata_timestamp": conflict_metadata_case.timestamp,
                        "payload": conflict_payload,
                        "expected_metadata_consistent": False,
                        "correct": conflict_correct,
                    },
                }
            )

        case_count = len(cases)
        avg_f1_image = mean(image_f1) if image_f1 else 0.0
        avg_f1_meta = mean(metadata_f1) if metadata_f1 else 0.0
        f1_lift = avg_f1_image - avg_f1_meta
        image_decoy_rate = sum(1 for hit in image_decoy_hits if hit > 0) / case_count if case_count else 0.0
        metadata_decoy_rate = (
            sum(1 for hit in metadata_decoy_hits if hit > 0) / case_count if case_count else 0.0
        )
        conflict_detection_rate = (
            sum(1 for ok in conflict_correct_flags if ok) / case_count if case_count else 0.0
        )

        thresholds = {
            "min_avg_f1_image_enriched": 0.60,
            "min_f1_lift_image_minus_metadata": 0.05,
            "max_decoy_false_positive_rate_image": 0.25,
            "min_conflict_detection_rate": 0.80,
        }
        threshold_results = {
            "avg_f1_image_enriched": avg_f1_image >= thresholds["min_avg_f1_image_enriched"],
            "f1_lift_image_minus_metadata": f1_lift >= thresholds["min_f1_lift_image_minus_metadata"],
            "decoy_false_positive_rate_image": image_decoy_rate <= thresholds[
                "max_decoy_false_positive_rate_image"
            ],
            "conflict_detection_rate": conflict_detection_rate
            >= thresholds["min_conflict_detection_rate"],
        }

        return {
            "case_count": case_count,
            "avg_f1_image_enriched": avg_f1_image,
            "avg_f1_metadata_only": avg_f1_meta,
            "f1_lift_image_minus_metadata": f1_lift,
            "decoy_false_positive_rate_image": image_decoy_rate,
            "decoy_false_positive_rate_metadata_only": metadata_decoy_rate,
            "conflict_detection_rate": conflict_detection_rate,
            "thresholds": thresholds,
            "threshold_results": threshold_results,
            "overall_pass": all(threshold_results.values()),
            "per_case": per_case,
        }


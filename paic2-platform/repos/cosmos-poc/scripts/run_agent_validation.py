#!/usr/bin/env python3
"""Run deterministic oracle checks and optional agent-vs-oracle comparisons."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.benchmarks.agent_validation.agent_runner import (  # noqa: E402
    AgentValidationRunner,
    compare_numeric_fields,
)
from src.benchmarks.agent_validation.foundation import verify_pinned_artifacts  # noqa: E402
from src.benchmarks.agent_validation.oracle_track_a import (  # noqa: E402
    compute_spatial_extremes,
    find_co_located_pairs,
    find_cross_timestamp_relabel_candidates,
    group_object_names_by_timestamp,
    load_track_a_rows,
    summarize_track_a,
)
from src.benchmarks.agent_validation.oracle_track_b import (  # noqa: E402
    compute_object_persistence,
    find_largest_scene_cluster,
    load_track_b_rows,
    summarize_track_b,
    validate_timestamp_frame_hash_consistency,
)
from src.benchmarks.agent_validation.multimodal_matrix import (  # noqa: E402
    MultimodalEvidenceRunner,
)
from src.benchmarks.agent_validation.v2_v3_metrics import (  # noqa: E402
    build_default_v2_v3_metrics,
)
from src.connectors.cosmos_client import CosmosClient  # noqa: E402


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _run_oracle_checks() -> dict:
    track_a_rows = load_track_a_rows()
    track_b_rows = load_track_b_rows()

    track_a_group_by_timestamp = {
        str(timestamp): object_names
        for timestamp, object_names in group_object_names_by_timestamp(track_a_rows).items()
    }

    return {
        "track_a_summary": summarize_track_a(track_a_rows),
        "track_a_group_by_timestamp": track_a_group_by_timestamp,
        "track_a_spatial_extremes": compute_spatial_extremes(track_a_rows),
        "track_a_colocated_pairs": {"pairs": find_co_located_pairs(track_a_rows)},
        "track_a_relabel_candidates": {
            "candidates": find_cross_timestamp_relabel_candidates(track_a_rows)
        },
        "track_b_summary": summarize_track_b(track_b_rows),
        "track_b_timestamp_hash_consistency": validate_timestamp_frame_hash_consistency(
            track_b_rows
        ),
        "track_b_largest_scene_cluster": find_largest_scene_cluster(track_b_rows),
        "track_b_object_persistence": compute_object_persistence(track_b_rows),
    }


def _mismatch_for_query(query: str, actual: dict, expected: dict) -> list[str]:
    if query in {
        "track_a_summary",
        "track_b_summary",
        "track_b_timestamp_hash_consistency",
        "track_b_largest_scene_cluster",
    }:
        mismatches = compare_numeric_fields(actual, expected, abs_tol=1e-6)
        if query == "track_b_timestamp_hash_consistency":
            if actual.get("each_timestamp_single_hash") != expected.get(
                "each_timestamp_single_hash"
            ):
                mismatches.append("each_timestamp_single_hash mismatch")
            if actual.get("hash_group_row_counts") != expected.get("hash_group_row_counts"):
                mismatches.append("hash_group_row_counts mismatch")
        if query == "track_b_largest_scene_cluster":
            if actual.get("object_names") != expected.get("object_names"):
                mismatches.append("object_names mismatch")
        return mismatches

    if query == "track_a_spatial_extremes":
        near = compare_numeric_fields(
            actual=actual.get("nearest", {}),
            expected=expected.get("nearest", {}),
            abs_tol=1e-6,
        )
        far = compare_numeric_fields(
            actual=actual.get("farthest", {}),
            expected=expected.get("farthest", {}),
            abs_tol=1e-6,
        )
        mismatches = [f"nearest: {msg}" for msg in near] + [f"farthest: {msg}" for msg in far]
        if actual.get("nearest", {}).get("object_name") != expected.get("nearest", {}).get(
            "object_name"
        ):
            mismatches.append("nearest.object_name mismatch")
        if actual.get("farthest", {}).get("object_name") != expected.get("farthest", {}).get(
            "object_name"
        ):
            mismatches.append("farthest.object_name mismatch")
        return mismatches

    if query == "track_a_relabel_candidates":
        actual_candidates = actual.get("candidates", [])
        expected_candidates = expected.get("candidates", [])
        if len(actual_candidates) != len(expected_candidates):
            return [
                "candidate_count mismatch "
                f"(expected {len(expected_candidates)} got {len(actual_candidates)})"
            ]
        mismatches: list[str] = []
        for index in range(len(expected_candidates)):
            numeric = compare_numeric_fields(
                actual=actual_candidates[index],
                expected=expected_candidates[index],
                abs_tol=1e-6,
            )
            mismatches.extend([f"candidates[{index}]: {entry}" for entry in numeric])
        return mismatches

    if actual != expected:
        return ["payload mismatch"]
    return []


def _run_agent_checks(runs: int, oracle: dict) -> dict:
    cosmos = CosmosClient()
    if not cosmos.health_check():
        return {"status": "unavailable", "reason": "Cosmos endpoint not available"}

    runner = AgentValidationRunner(cosmos_client=cosmos)

    responses_by_query: dict[str, list[dict]] = {}
    mismatches_by_query: dict[str, list[list[str]]] = {}

    for _ in range(runs):
        matrix = runner.run_matrix_once()
        for query, response in matrix.items():
            responses_by_query.setdefault(query, []).append(response)
            expected = oracle[query]
            mismatches_by_query.setdefault(query, []).append(
                _mismatch_for_query(query, response, expected)
            )

    return {"status": "ok", "runs": runs, "responses": responses_by_query, "mismatches": mismatches_by_query}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Issue #28 oracle checks and optional Cosmos comparisons.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(PROJECT_ROOT / "tests" / "results" / "agent_validation"),
        help="Directory for JSON outputs.",
    )
    parser.add_argument(
        "--skip-agent",
        action="store_true",
        help="Skip endpoint-dependent agent calls and emit oracle outputs only.",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="Number of repeated runs for agent checks.",
    )
    parser.add_argument(
        "--include-multimodal",
        action="store_true",
        help="Include multimodal evidence matrix (image+metadata) when agent checks run.",
    )
    parser.add_argument(
        "--multimodal-cases",
        type=int,
        default=4,
        help="Number of multimodal matrix cases to evaluate when enabled.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    artifact_checks = verify_pinned_artifacts()
    oracle = _run_oracle_checks()

    _write_json(output_dir / "oracle_track_a.json", oracle["track_a_summary"])
    _write_json(output_dir / "oracle_track_b.json", oracle["track_b_summary"])
    _write_json(output_dir / "oracle_matrix.json", oracle)

    summary = {
        "generated_at_utc": _utc_now_iso(),
        "artifacts": [
            {
                "name": check.path.name,
                "path": str(check.path),
                "sha256": check.actual_sha256,
            }
            for check in artifact_checks
        ],
        "oracle": oracle,
        "v2_vs_v3": build_default_v2_v3_metrics(),
    }
    _write_json(output_dir / "v2_v3_metrics.json", summary["v2_vs_v3"])

    if not args.skip_agent:
        summary["agent"] = _run_agent_checks(runs=args.runs, oracle=oracle)
        if args.include_multimodal and summary["agent"].get("status") == "ok":
            runner = MultimodalEvidenceRunner(
                cosmos_client=CosmosClient(),
                work_dir=output_dir / "multimodal_frames",
            )
            summary["multimodal"] = runner.run_evidence_matrix(max_cases=args.multimodal_cases)
            _write_json(output_dir / "multimodal_evidence.json", summary["multimodal"])

    _write_json(output_dir / "summary.json", summary)
    print(f"Wrote validation outputs to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

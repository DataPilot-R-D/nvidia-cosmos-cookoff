#!/usr/bin/env python3
"""Rule-based evaluator for benchmark outputs using prompt ground truth.

This script compares benchmark raw outputs (for example benchmark_v4_raw.json)
against expected outcomes from tests/inputs/prompts/benchmark_prompts.json.
It is deterministic and reproducible (no model-in-the-loop judging).
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


DEFAULT_RESULTS = Path("tests/results/benchmark_v4_raw.json")
DEFAULT_PROMPTS = Path("tests/inputs/prompts/benchmark_prompts.json")
DEFAULT_THRESHOLD = 0.70


@dataclass(frozen=True)
class Check:
    """Single weighted scoring check."""

    name: str
    score: float  # normalized [0, 1]
    weight: float


@dataclass(frozen=True)
class RuleSpec:
    """Mapping between prompt test ID and benchmark result ID."""

    result_id: str
    evaluator: str


# Mapping from prompt-ground-truth cases to run_benchmarks_v4 result IDs.
# Only cases with semantic parity are mapped.
RULE_SPECS: dict[str, RuleSpec] = {
    "B2_counting_balloons": RuleSpec("B2.2", "b2_counting_balloons"),
    "B2_counting_chairs": RuleSpec("B2.3", "b2_counting_chairs"),
    "B2_counting_table_items": RuleSpec("B2.4", "b2_counting_table_items"),
    "B2_state_door": RuleSpec("B2.6", "b2_state_door"),
    "B3_change_mug_general": RuleSpec("B3.1", "b3_change_mug_general"),
    "B3_change_mug_targeted": RuleSpec("B3.2", "b3_change_mug_targeted"),
    "B3_change_roses_general": RuleSpec("B3.3", "b3_change_roses_general"),
    "B3_change_roses_targeted": RuleSpec("B3.4", "b3_change_roses_targeted"),
    "B3_change_roller_general": RuleSpec("B3.5", "b3_change_roller_general"),
    "B3_change_roller_targeted": RuleSpec("B3.6", "b3_change_roller_targeted"),
    "B3_lighting_comparison": RuleSpec("B3.7", "b3_lighting_comparison"),
    "B4_motion_frames": RuleSpec("B4.1", "b4_motion"),
    "B4_motion_video": RuleSpec("B4.2", "b4_motion"),
    "B4_person_detection": RuleSpec("B4.3_1", "b4_person_detection"),
    "B4_person_tracking": RuleSpec("B4.4", "b4_person_tracking"),
    "B4_activity_recognition": RuleSpec("B4.5", "b4_activity"),
    "B5_security_door": RuleSpec("B5.1", "b5_security_door"),
    "B5_door_sequence": RuleSpec("B5.3", "b5_door_sequence"),
    "B6_room_dimensions": RuleSpec("B6.1", "b6_room_dimensions"),
    "B6_stability": RuleSpec("B6.2", "b6_stability"),
}


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def _answer_text(row: dict) -> str:
    text = str(row.get("answer") or row.get("text") or "")
    if text.startswith("<think>") and "</think>" in text:
        text = text.split("</think>", 1)[1]
    return text.strip()


def _has_any(text: str, terms: list[str]) -> bool:
    return any(t in text for t in terms)


def _extract_numbers(text: str) -> list[float]:
    return [float(x) for x in re.findall(r"\b\d+(?:\.\d+)?\b", text)]


def _extract_first_number(text: str) -> float | None:
    nums = _extract_numbers(text)
    return nums[0] if nums else None


def _weighted_score(checks: list[Check]) -> tuple[float, list[dict]]:
    total_weight = sum(c.weight for c in checks)
    if total_weight <= 0:
        return 0.0, []
    weighted = sum(c.score * c.weight for c in checks)
    score = max(0.0, min(1.0, weighted / total_weight))
    details = [
        {
            "name": c.name,
            "score": round(c.score, 4),
            "weight": c.weight,
        }
        for c in checks
    ]
    return score, details


def _count_score(pred: float | None, expected: int, *, soft_delta: int = 1) -> float:
    if pred is None:
        return 0.0
    diff = abs(pred - expected)
    if diff == 0:
        return 1.0
    if diff <= soft_delta:
        return 0.5
    if diff <= soft_delta + 1:
        return 0.25
    return 0.0


def _approx_count_score(pred: float | None, target: int, *, low: int, high: int) -> float:
    if pred is None:
        return 0.0
    if low <= pred <= high:
        return 1.0
    if low - 1 <= pred <= high + 1:
        return 0.5
    return 0.0


def _left_to_right(text: str) -> bool:
    if re.search(r"left\s*(?:to|->|→|-)\s*right", text):
        return True
    return "left" in text and "right" in text and _has_any(text, ["move", "moving", "roll", "direction"])


def _right_to_left(text: str) -> bool:
    if re.search(r"right\s*(?:to|->|→|-)\s*left", text):
        return True
    return "right" in text and "left" in text and _has_any(text, ["move", "moving", "walk", "return", "back"])


def _is_negative_person_response(text: str) -> bool:
    return _has_any(
        text,
        [
            "no person",
            "there is no person",
            "no one",
            "nobody",
            "not visible",
            "absent",
        ],
    )


def _evaluate_b2_counting_balloons(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    pred = _extract_first_number(text)
    colors = 0
    if _has_any(text, ["yellow"]):
        colors += 1
    if _has_any(text, ["red"]):
        colors += 1
    if _has_any(text, ["green", "lime"]):
        colors += 1
    if _has_any(text, ["cyan", "turquoise", "blue"]):
        colors += 1
    checks = [
        Check("count_equals_4", _count_score(pred, 4), 0.65),
        Check("color_coverage", colors / 4.0, 0.35),
    ]
    return _weighted_score(checks)


def _evaluate_b2_counting_chairs(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    pred = _extract_first_number(_normalize(answer))
    checks = [Check("count_equals_3", _count_score(pred, 3), 1.0)]
    return _weighted_score(checks)


def _evaluate_b2_counting_table_items(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    pred = _extract_first_number(_normalize(answer))
    checks = [Check("count_approx_7", _approx_count_score(pred, 7, low=6, high=8), 1.0)]
    return _weighted_score(checks)


def _evaluate_b2_state_door(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    open_score = 1.0 if _has_any(text, ["open", "partially open", "ajar"]) else 0.0
    curtain = _has_any(text, ["curtain", "sheer"])
    movement = _has_any(text, ["blow", "blowing", "moving", "airflow", "draft"])
    curtain_motion_score = 1.0 if curtain and movement else (0.5 if curtain else 0.0)
    checks = [
        Check("door_open", open_score, 0.6),
        Check("curtain_motion", curtain_motion_score, 0.4),
    ]
    return _weighted_score(checks)


def _evaluate_b3_change_mug_general(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    object_score = 0.0
    if _has_any(text, ["mug", "cup"]):
        object_score = 1.0 if "orange" in text else (0.7 if "red" in text else 0.5)
    change_score = 1.0 if _has_any(text, ["add", "added", "new", "appeared", "placed"]) else 0.0
    checks = [
        Check("mug_object", object_score, 0.55),
        Check("added_change", change_score, 0.45),
    ]
    return _weighted_score(checks)


def _evaluate_b3_change_mug_targeted(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    object_score = 0.0
    if _has_any(text, ["mug", "cup"]):
        object_score = 1.0 if "orange" in text else (0.7 if "red" in text else 0.5)
    add_score = 1.0 if _has_any(text, ["add", "added", "new", "appeared"]) else 0.0
    location_score = 1.0 if _has_any(text, ["left", "center", "centre", "center-left"]) else 0.0
    checks = [
        Check("mug_object", object_score, 0.45),
        Check("added_change", add_score, 0.35),
        Check("rough_location", location_score, 0.20),
    ]
    return _weighted_score(checks)


def _evaluate_b3_change_roses_general(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    checks = [
        Check("mentions_roses_or_vase", 1.0 if _has_any(text, ["rose", "roses", "vase", "bouquet"]) else 0.0, 0.4),
        Check("mentions_movement", 1.0 if _has_any(text, ["moved", "shifted", "relocated", "position changed"]) else 0.0, 0.4),
        Check("mentions_left_and_right", 1.0 if ("left" in text and "right" in text) else 0.0, 0.2),
    ]
    return _weighted_score(checks)


def _evaluate_b3_change_roses_targeted(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    return _evaluate_b3_change_roses_general(answer, _ground_truth)


def _evaluate_b3_change_roller_general(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    checks = [
        Check("mentions_roller", 1.0 if _has_any(text, ["roller", "foam roller", "mat"]) else 0.0, 0.4),
        Check("mentions_removed", 1.0 if _has_any(text, ["removed", "missing", "gone", "absent"]) else 0.0, 0.4),
        Check("mentions_green_container", 1.0 if _has_any(text, ["green container", "green bin", "basket", "box"]) else 0.0, 0.2),
    ]
    return _weighted_score(checks)


def _evaluate_b3_change_roller_targeted(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    return _evaluate_b3_change_roller_general(answer, _ground_truth)


def _evaluate_b3_lighting_comparison(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    first_off = bool(re.search(r"(first|image 1|frame 1|1st).{0,80}(off|dark)", text))
    second_overhead = bool(re.search(r"(second|image 2|frame 2|2nd).{0,120}(overhead|ceiling|main).{0,40}(on|lit|bright)", text))
    third_mirror = bool(re.search(r"(third|image 3|frame 3|3rd).{0,120}(mirror|vanity).{0,40}(on|lit|light)", text))
    checks = [
        Check("state_1_all_off_dark", 1.0 if first_off else 0.0, 1.0 / 3.0),
        Check("state_2_overhead_on", 1.0 if second_overhead else 0.0, 1.0 / 3.0),
        Check("state_3_mirror_on", 1.0 if third_mirror else 0.0, 1.0 / 3.0),
    ]
    return _weighted_score(checks)


def _evaluate_b4_motion(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    checks = [
        Check("mentions_roller", 1.0 if _has_any(text, ["roller", "foam roller", "mat"]) else 0.0, 0.30),
        Check("direction_left_to_right", 1.0 if _left_to_right(text) else 0.0, 0.40),
        Check("speed_slow_or_steady", 1.0 if _has_any(text, ["slow", "steady", "gradual", "smooth"]) else 0.0, 0.30),
    ]
    return _weighted_score(checks)


def _evaluate_b4_person_detection(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    negative = _is_negative_person_response(text)
    affirmative = not negative and _has_any(text, ["yes", "person", "man", "male"])
    clothing = _has_any(text, ["green", "polka", "dot"]) and _has_any(text, ["shirt", "t-shirt", "tee"])
    lower = _has_any(text, ["navy", "pants", "trousers"])
    checks = [
        Check("affirmative_person_detected", 1.0 if affirmative else 0.0, 0.50),
        Check("describes_green_polka_top", 1.0 if clothing else 0.0, 0.30),
        Check("describes_navy_pants", 1.0 if lower else 0.0, 0.20),
    ]
    return _weighted_score(checks)


def _evaluate_b4_person_tracking(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    movement = _has_any(text, ["walk", "walking", "move", "moving", "enter", "leave", "turn"])
    checks = [
        Check("mentions_person_motion", 1.0 if movement else 0.0, 0.30),
        Check("mentions_left_to_right", 1.0 if _left_to_right(text) else 0.0, 0.25),
        Check("mentions_right_to_left", 1.0 if _right_to_left(text) else 0.0, 0.25),
        Check("mentions_window_or_turn", 1.0 if _has_any(text, ["window", "turn", "back"]) else 0.0, 0.20),
    ]
    return _weighted_score(checks)


def _evaluate_b4_activity(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    checks = [
        Check("mentions_standing", 1.0 if _has_any(text, ["standing", "stand"]) else 0.0, 0.40),
        Check("mentions_turning_or_looking", 1.0 if _has_any(text, ["turn", "looking", "look around"]) else 0.0, 0.30),
        Check("mentions_walking", 1.0 if _has_any(text, ["walking", "walk"]) else 0.0, 0.30),
    ]
    return _weighted_score(checks)


def _evaluate_b5_security_door(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    alert_high = _has_any(text, ["yellow", "orange", "red", "high risk", "medium risk", "elevated"])
    alert_low = _has_any(text, ["green", "low risk", "safe"])
    if alert_high and not alert_low:
        alert_score = 1.0
    elif alert_high:
        alert_score = 0.5
    else:
        alert_score = 0.0
    curtain = _has_any(text, ["curtain", "sheer"])
    movement = _has_any(text, ["blow", "blowing", "moving", "airflow", "draft"])
    checks = [
        Check("door_open", 1.0 if _has_any(text, ["open", "partially open", "ajar"]) else 0.0, 0.40),
        Check("curtain_motion", 1.0 if curtain and movement else (0.5 if curtain else 0.0), 0.30),
        Check("alert_level_yellow_plus", alert_score, 0.30),
    ]
    return _weighted_score(checks)


def _evaluate_b5_door_sequence(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    change = _has_any(text, ["change", "changed", "from", "to", "transition"])
    open_state = _has_any(text, ["open", "opened", "partially open", "ajar"])
    closed_state = _has_any(text, ["closed", "shut"])
    curtain_motion = _has_any(text, ["curtain", "sheer"]) and _has_any(
        text, ["blow", "blowing", "moving", "airflow", "draft"]
    )
    checks = [
        Check("mentions_state_change", 1.0 if change else 0.0, 0.30),
        Check("mentions_closed_to_open", 1.0 if open_state and closed_state else (0.5 if open_state else 0.0), 0.40),
        Check("mentions_curtain_motion", 1.0 if curtain_motion else 0.0, 0.30),
    ]
    return _weighted_score(checks)


def _evaluate_b6_room_dimensions(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    nums = _extract_numbers(text)
    best_closeness = 0.0
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            a = nums[i]
            b = nums[j]
            err = min(abs(a - 7.0) + abs(b - 5.0), abs(a - 5.0) + abs(b - 7.0))
            closeness = max(0.0, 1.0 - (err / 8.0))
            if closeness > best_closeness:
                best_closeness = closeness
    has_units = _has_any(text, ["m", "meter", "meters", "metre", "metres"])
    checks = [
        Check("dimensions_close_to_7x5", best_closeness, 0.80),
        Check("mentions_units", 1.0 if has_units else 0.0, 0.20),
    ]
    return _weighted_score(checks)


def _evaluate_b6_stability(answer: str, _ground_truth: str) -> tuple[float, list[dict]]:
    text = _normalize(answer)
    unstable = _has_any(text, ["unstable", "tipping", "tip", "fall", "leaning", "hazard", "risk"])
    object_ref = _has_any(text, ["stool", "chair", "wooden stool", "wooden chair"])
    checks = [
        Check("mentions_stool_or_chair", 1.0 if object_ref else 0.0, 0.50),
        Check("mentions_instability_risk", 1.0 if unstable else 0.0, 0.50),
    ]
    return _weighted_score(checks)


EVALUATORS: dict[str, Callable[[str, str], tuple[float, list[dict]]]] = {
    "b2_counting_balloons": _evaluate_b2_counting_balloons,
    "b2_counting_chairs": _evaluate_b2_counting_chairs,
    "b2_counting_table_items": _evaluate_b2_counting_table_items,
    "b2_state_door": _evaluate_b2_state_door,
    "b3_change_mug_general": _evaluate_b3_change_mug_general,
    "b3_change_mug_targeted": _evaluate_b3_change_mug_targeted,
    "b3_change_roses_general": _evaluate_b3_change_roses_general,
    "b3_change_roses_targeted": _evaluate_b3_change_roses_targeted,
    "b3_change_roller_general": _evaluate_b3_change_roller_general,
    "b3_change_roller_targeted": _evaluate_b3_change_roller_targeted,
    "b3_lighting_comparison": _evaluate_b3_lighting_comparison,
    "b4_motion": _evaluate_b4_motion,
    "b4_person_detection": _evaluate_b4_person_detection,
    "b4_person_tracking": _evaluate_b4_person_tracking,
    "b4_activity": _evaluate_b4_activity,
    "b5_security_door": _evaluate_b5_security_door,
    "b5_door_sequence": _evaluate_b5_door_sequence,
    "b6_room_dimensions": _evaluate_b6_room_dimensions,
    "b6_stability": _evaluate_b6_stability,
}


def _category_key(identifier: str) -> str:
    match = re.match(r"(B\d+)", identifier)
    return match.group(1) if match else "OTHER"


def evaluate(
    *,
    results_path: Path,
    prompts_path: Path,
    out_path: Path,
    pass_threshold: float,
) -> dict:
    raw_results = json.loads(results_path.read_text(encoding="utf-8"))
    prompt_data = json.loads(prompts_path.read_text(encoding="utf-8"))
    prompt_tests: dict = prompt_data.get("tests", {})

    scored_cases: list[dict] = []
    skipped_cases: list[dict] = []
    missing_result_cases: list[dict] = []
    no_ground_truth_cases: list[str] = []

    for prompt_test_id, definition in prompt_tests.items():
        ground_truth = definition.get("ground_truth")
        if not ground_truth:
            no_ground_truth_cases.append(prompt_test_id)
            continue

        spec = RULE_SPECS.get(prompt_test_id)
        if spec is None:
            skipped_cases.append(
                {
                    "prompt_test_id": prompt_test_id,
                    "reason": "no_result_mapping",
                }
            )
            continue

        result_id = spec.result_id
        row = raw_results.get(result_id)
        if row is None:
            missing_result_cases.append(
                {
                    "prompt_test_id": prompt_test_id,
                    "result_id": result_id,
                    "reason": "result_id_missing_in_raw_results",
                }
            )
            continue

        finish_reason = str(row.get("finish_reason") or "")
        if finish_reason.startswith("skipped_"):
            skipped_cases.append(
                {
                    "prompt_test_id": prompt_test_id,
                    "result_id": result_id,
                    "reason": f"result_skipped_in_run:{finish_reason}",
                }
            )
            continue

        evaluator = EVALUATORS[spec.evaluator]
        answer = _answer_text(row)
        score, details = evaluator(answer, str(ground_truth))
        score = round(score, 4)

        scored_cases.append(
            {
                "prompt_test_id": prompt_test_id,
                "result_id": result_id,
                "ground_truth": ground_truth,
                "score": score,
                "pass_threshold": pass_threshold,
                "passed": score >= pass_threshold,
                "finish_reason": row.get("finish_reason"),
                "latency_s": row.get("latency") if row.get("latency") is not None else row.get("total"),
                "prompt_tokens": row.get("prompt_tokens"),
                "completion_tokens": row.get("completion_tokens"),
                "error": row.get("error"),
                "details": details,
                "answer_excerpt": answer[:300],
            }
        )

    scores = [c["score"] for c in scored_cases]
    summary = {
        "eligible_ground_truth_cases": len(
            [k for k, v in prompt_tests.items() if isinstance(v, dict) and v.get("ground_truth")]
        ),
        "scored_cases": len(scored_cases),
        "passed_cases": sum(1 for c in scored_cases if c["passed"]),
        "pass_rate": round(
            sum(1 for c in scored_cases if c["passed"]) / len(scored_cases), 4
        )
        if scored_cases
        else 0.0,
        "mean_score": round(statistics.mean(scores), 4) if scores else 0.0,
        "median_score": round(statistics.median(scores), 4) if scores else 0.0,
        "min_score": round(min(scores), 4) if scores else 0.0,
        "max_score": round(max(scores), 4) if scores else 0.0,
    }

    category_scores: dict[str, dict] = {}
    for case in scored_cases:
        cat = _category_key(case["result_id"])
        category_scores.setdefault(cat, {"scores": [], "passed": 0, "total": 0})
        category_scores[cat]["scores"].append(case["score"])
        category_scores[cat]["total"] += 1
        if case["passed"]:
            category_scores[cat]["passed"] += 1

    category_scores_out: dict[str, dict] = {}
    for cat, data in sorted(category_scores.items(), key=lambda kv: int(kv[0][1:])):
        vals = data["scores"]
        category_scores_out[cat] = {
            "cases": data["total"],
            "mean_score": round(statistics.mean(vals), 4),
            "pass_rate": round(data["passed"] / data["total"], 4) if data["total"] else 0.0,
        }

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "results_path": str(results_path),
        "prompts_path": str(prompts_path),
        "pass_threshold": pass_threshold,
        "summary": summary,
        "category_scores": category_scores_out,
        "scored_cases": sorted(scored_cases, key=lambda c: c["prompt_test_id"]),
        "skipped_cases": sorted(skipped_cases, key=lambda c: c["prompt_test_id"]),
        "missing_result_cases": sorted(missing_result_cases, key=lambda c: c["prompt_test_id"]),
        "no_ground_truth_cases": sorted(no_ground_truth_cases),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate benchmark raw outputs against benchmark_prompts ground truth.",
    )
    parser.add_argument(
        "--results",
        type=Path,
        default=DEFAULT_RESULTS,
        help=f"Path to raw benchmark results JSON (default: {DEFAULT_RESULTS})",
    )
    parser.add_argument(
        "--prompts",
        type=Path,
        default=DEFAULT_PROMPTS,
        help=f"Path to benchmark prompts JSON (default: {DEFAULT_PROMPTS})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path for evaluator JSON (default: <results_stem>_ground_truth_eval.json)",
    )
    parser.add_argument(
        "--pass-threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Pass threshold per scored case in [0,1] (default: {DEFAULT_THRESHOLD})",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if not (0.0 <= args.pass_threshold <= 1.0):
        raise SystemExit("--pass-threshold must be between 0 and 1")

    out_path = args.out
    if out_path is None:
        out_path = args.results.with_name(f"{args.results.stem}_ground_truth_eval.json")

    report = evaluate(
        results_path=args.results,
        prompts_path=args.prompts,
        out_path=out_path,
        pass_threshold=args.pass_threshold,
    )

    summary = report["summary"]
    print(f"results: {args.results}")
    print(f"prompts: {args.prompts}")
    print(f"output:  {out_path}")
    print(
        "scored={scored}/{eligible} pass_rate={rate:.1%} mean_score={mean:.3f}".format(
            scored=summary["scored_cases"],
            eligible=summary["eligible_ground_truth_cases"],
            rate=summary["pass_rate"],
            mean=summary["mean_score"],
        )
    )


if __name__ == "__main__":
    main()

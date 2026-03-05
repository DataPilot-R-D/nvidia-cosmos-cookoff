#!/usr/bin/env python3
"""Run configurable benchmark matrix and select a winner configuration.

This orchestrates multiple runs of scripts/run_benchmarks_v4.py with isolated
outputs, optional parallel execution, automatic ground-truth evaluation, and a
winner summary.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MATRIX_PATH = REPO_ROOT / "configs" / "benchmark-matrix" / "alt_config_search_v1.json"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tests" / "results" / "alt_benchmarks"
DEFAULT_PROMPTS_PATH = REPO_ROOT / "tests" / "inputs" / "prompts" / "benchmark_prompts.json"


@dataclass(frozen=True)
class ConfigRun:
    name: str
    mode: str
    reasoning_mode: str
    max_tokens: int
    timeout_seconds: int


def _slug(text: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "_", text.strip())
    return value.strip("._-") or "config"


def _load_matrix(path: Path) -> tuple[str, list[ConfigRun]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    matrix_name = payload.get("name") or path.stem
    raw_configs = payload.get("configs", [])
    if not raw_configs:
        raise SystemExit(f"no configs found in {path}")

    configs: list[ConfigRun] = []
    for idx, item in enumerate(raw_configs):
        if not isinstance(item, dict):
            raise SystemExit(f"invalid config at index {idx} in {path}")
        name = item.get("name")
        if not name:
            raise SystemExit(f"missing 'name' at index {idx} in {path}")
        mode = str(item.get("mode", "all")).strip().lower()
        reasoning_mode = str(item.get("reasoning_mode", "default")).strip().lower()
        max_tokens = int(item.get("max_tokens", 1200))
        timeout_seconds = int(item.get("timeout_seconds", 180))
        if mode not in {"all", "frames", "videos"}:
            raise SystemExit(f"invalid mode={mode} for config={name}")
        if reasoning_mode not in {"default", "on", "off"}:
            raise SystemExit(f"invalid reasoning_mode={reasoning_mode} for config={name}")
        configs.append(
            ConfigRun(
                name=name,
                mode=mode,
                reasoning_mode=reasoning_mode,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        )
    return matrix_name, configs


def _summarize_raw(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False}
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = [v for v in raw.values() if isinstance(v, dict)]
    latencies = []
    for row in rows:
        if isinstance(row.get("latency"), (int, float)):
            latencies.append(float(row["latency"]))
        elif isinstance(row.get("total"), (int, float)):
            latencies.append(float(row["total"]))
    finish = {}
    for row in rows:
        fr = row.get("finish_reason")
        if fr:
            finish[fr] = finish.get(fr, 0) + 1
    skipped = sum(1 for row in rows if str(row.get("finish_reason", "")).startswith("skipped_"))
    errors = sum(1 for row in rows if row.get("error"))
    return {
        "exists": True,
        "tests": len(rows),
        "latency_avg_s": round(statistics.mean(latencies), 3) if latencies else None,
        "finish_reason_counts": finish,
        "skipped_cases": skipped,
        "error_cases": errors,
        "stop_rate": round(finish.get("stop", 0) / len(rows), 4) if rows else 0.0,
    }


def _run_subprocess(cmd: list[str], env: dict[str, str], log_path: Path) -> tuple[int, str]:
    started = time.perf_counter()
    proc = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    elapsed = time.perf_counter() - started
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        f"$ {' '.join(cmd)}\n\n[stdout]\n{proc.stdout}\n\n[stderr]\n{proc.stderr}\n",
        encoding="utf-8",
    )
    return proc.returncode, f"{elapsed:.2f}"


def _run_single_config(
    cfg: ConfigRun,
    *,
    run_dir: Path,
    prompts_path: Path,
    pass_threshold: float,
    api_base: str | None,
    model: str | None,
    dry_run: bool,
) -> dict[str, Any]:
    slug = _slug(cfg.name)
    raw_out = run_dir / f"{slug}.raw.json"
    partial_out = run_dir / f"{slug}.raw.partial.json"
    bench_log = run_dir / f"{slug}.benchmark.log"
    eval_out = run_dir / f"{slug}.ground_truth_eval.json"
    eval_log = run_dir / f"{slug}.eval.log"

    env = os.environ.copy()
    env["COSMOS_BENCHMARK_RUN_LABEL"] = cfg.name
    env["COSMOS_BENCHMARK_MODE"] = cfg.mode
    env["COSMOS_BENCHMARK_REASONING_MODE"] = cfg.reasoning_mode
    env["COSMOS_BENCHMARK_MAX_TOKENS"] = str(cfg.max_tokens)
    env["COSMOS_BENCHMARK_TIMEOUT_SECONDS"] = str(cfg.timeout_seconds)
    env["COSMOS_BENCHMARK_OUT_PATH"] = str(raw_out)
    env["COSMOS_BENCHMARK_PARTIAL_OUT_PATH"] = str(partial_out)
    if api_base:
        env["COSMOS_API_BASE"] = api_base
    if model:
        env["COSMOS_MODEL"] = model

    bench_cmd = [sys.executable, "scripts/run_benchmarks_v4.py"]
    if dry_run:
        return {
            "config": {
                "name": cfg.name,
                "mode": cfg.mode,
                "reasoning_mode": cfg.reasoning_mode,
                "max_tokens": cfg.max_tokens,
                "timeout_seconds": cfg.timeout_seconds,
            },
            "benchmark": {
                "exit_code": 0,
                "elapsed_s": 0.0,
                "log_path": str(bench_log),
                "raw_path": str(raw_out),
                "partial_path": str(partial_out),
                "summary": {"exists": False, "dry_run": True},
                "command": " ".join(bench_cmd),
                "env_preview": {
                    "COSMOS_BENCHMARK_MODE": cfg.mode,
                    "COSMOS_BENCHMARK_REASONING_MODE": cfg.reasoning_mode,
                    "COSMOS_BENCHMARK_MAX_TOKENS": str(cfg.max_tokens),
                    "COSMOS_BENCHMARK_TIMEOUT_SECONDS": str(cfg.timeout_seconds),
                    "COSMOS_BENCHMARK_OUT_PATH": str(raw_out),
                    "COSMOS_BENCHMARK_PARTIAL_OUT_PATH": str(partial_out),
                },
            },
            "evaluation": {
                "exit_code": 0,
                "elapsed_s": 0.0,
                "log_path": str(eval_log),
                "eval_path": str(eval_out),
                "summary": {"dry_run": True},
                "category_scores": {},
            },
        }

    bench_code, bench_elapsed = _run_subprocess(bench_cmd, env, bench_log)
    raw_summary = _summarize_raw(raw_out)

    eval_cmd = [
        sys.executable,
        "scripts/evaluate_ground_truth.py",
        "--results",
        str(raw_out),
        "--prompts",
        str(prompts_path),
        "--out",
        str(eval_out),
        "--pass-threshold",
        str(pass_threshold),
    ]
    eval_code, eval_elapsed = _run_subprocess(eval_cmd, env, eval_log)
    eval_payload = None
    if eval_out.exists():
        eval_payload = json.loads(eval_out.read_text(encoding="utf-8"))

    return {
        "config": {
            "name": cfg.name,
            "mode": cfg.mode,
            "reasoning_mode": cfg.reasoning_mode,
            "max_tokens": cfg.max_tokens,
            "timeout_seconds": cfg.timeout_seconds,
        },
        "benchmark": {
            "exit_code": bench_code,
            "elapsed_s": float(bench_elapsed),
            "log_path": str(bench_log),
            "raw_path": str(raw_out),
            "partial_path": str(partial_out),
            "summary": raw_summary,
        },
        "evaluation": {
            "exit_code": eval_code,
            "elapsed_s": float(eval_elapsed),
            "log_path": str(eval_log),
            "eval_path": str(eval_out),
            "summary": (eval_payload or {}).get("summary"),
            "category_scores": (eval_payload or {}).get("category_scores"),
        },
    }


def _winner(cases: list[dict[str, Any]]) -> dict[str, Any] | None:
    viable = []
    for case in cases:
        eval_summary = (case.get("evaluation") or {}).get("summary") or {}
        raw_summary = ((case.get("benchmark") or {}).get("summary") or {})
        if case["benchmark"]["exit_code"] != 0:
            continue
        if case["evaluation"]["exit_code"] != 0:
            continue
        if not eval_summary:
            continue
        if "mean_score" not in eval_summary:
            continue
        viable.append(
            (
                -float(eval_summary.get("mean_score", 0.0)),
                -float(eval_summary.get("pass_rate", 0.0)),
                -float(raw_summary.get("stop_rate", 0.0)),
                float(raw_summary.get("latency_avg_s") or 1e9),
                case,
            )
        )
    if not viable:
        return None
    viable.sort(key=lambda item: item[:4])
    return viable[0][4]


def _write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = []
    lines.append("# Alternative Benchmark Matrix Summary")
    lines.append("")
    lines.append(f"- Run ID: `{report['run_id']}`")
    lines.append(f"- Generated (UTC): `{report['generated_at_utc']}`")
    lines.append(f"- Matrix: `{report['matrix_name']}`")
    lines.append(f"- Parallel workers: `{report['parallel_workers']}`")
    lines.append("")
    lines.append("| Config | Mode | Reasoning | Max Tokens | Mean Score | Pass Rate | Stop Rate | Avg Latency (s) |")
    lines.append("|---|---|---|---:|---:|---:|---:|---:|")
    for case in report["runs"]:
        cfg = case["config"]
        eval_summary = (case["evaluation"] or {}).get("summary") or {}
        raw_summary = ((case["benchmark"] or {}).get("summary") or {})
        lines.append(
            "| {name} | {mode} | {reasoning} | {max_tokens} | {mean_score} | {pass_rate} | {stop_rate} | {lat} |".format(
                name=cfg["name"],
                mode=cfg["mode"],
                reasoning=cfg["reasoning_mode"],
                max_tokens=cfg["max_tokens"],
                mean_score=eval_summary.get("mean_score", "n/a"),
                pass_rate=eval_summary.get("pass_rate", "n/a"),
                stop_rate=raw_summary.get("stop_rate", "n/a"),
                lat=raw_summary.get("latency_avg_s", "n/a"),
            )
        )
    lines.append("")
    winner = report.get("winner")
    if winner:
        lines.append("## Winner")
        lines.append("")
        lines.append(f"- Config: `{winner['config']['name']}`")
        lines.append(f"- Mean score: `{winner['evaluation']['summary']['mean_score']}`")
        lines.append(f"- Pass rate: `{winner['evaluation']['summary']['pass_rate']}`")
        lines.append(f"- Stop rate: `{winner['benchmark']['summary']['stop_rate']}`")
        lines.append(f"- Avg latency: `{winner['benchmark']['summary']['latency_avg_s']}`")
    else:
        lines.append("## Winner")
        lines.append("")
        lines.append("No winner could be selected (missing successful benchmark/evaluation runs).")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run alternative benchmark matrix and choose winner config.")
    parser.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX_PATH, help="Matrix config JSON path")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT, help="Root directory for matrix outputs")
    parser.add_argument("--parallel", type=int, default=1, help="Number of benchmark configs to run in parallel")
    parser.add_argument("--pass-threshold", type=float, default=0.70, help="Ground-truth pass threshold for evaluator")
    parser.add_argument("--prompts", type=Path, default=DEFAULT_PROMPTS_PATH, help="Prompt ground-truth JSON path")
    parser.add_argument("--api-base", default=None, help="Optional COSMOS_API_BASE override for all configs")
    parser.add_argument("--model", default=None, help="Optional COSMOS_MODEL override for all configs")
    parser.add_argument("--dry-run", action="store_true", help="Render matrix plan without executing benchmark calls")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.parallel <= 0:
        raise SystemExit("--parallel must be >= 1")
    if not (0.0 <= args.pass_threshold <= 1.0):
        raise SystemExit("--pass-threshold must be between 0 and 1")

    matrix_name, configs = _load_matrix(args.matrix)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.output_root / f"{_slug(matrix_name)}_{run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"matrix={matrix_name} configs={len(configs)} parallel={args.parallel}")
    print(f"output_dir={run_dir}")

    runs: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        future_map = {
            pool.submit(
                _run_single_config,
                cfg,
                run_dir=run_dir,
                prompts_path=args.prompts,
                pass_threshold=args.pass_threshold,
                api_base=args.api_base,
                model=args.model,
                dry_run=args.dry_run,
            ): cfg.name
            for cfg in configs
        }
        for future in as_completed(future_map):
            name = future_map[future]
            result = future.result()
            runs.append(result)
            bench_code = result["benchmark"]["exit_code"]
            eval_code = result["evaluation"]["exit_code"]
            eval_summary = result["evaluation"]["summary"] or {}
            print(
                f"[done] {name} bench_exit={bench_code} eval_exit={eval_code} "
                f"mean_score={eval_summary.get('mean_score', 'n/a')} "
                f"pass_rate={eval_summary.get('pass_rate', 'n/a')}"
            )

    runs_sorted = sorted(runs, key=lambda r: r["config"]["name"])
    winner = _winner(runs_sorted)
    report = {
        "run_id": run_id,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "matrix_name": matrix_name,
        "matrix_config_path": str(args.matrix),
        "parallel_workers": args.parallel,
        "prompts_path": str(args.prompts),
        "api_base_override": args.api_base,
        "model_override": args.model,
        "pass_threshold": args.pass_threshold,
        "runs": runs_sorted,
        "winner": winner,
    }

    json_path = run_dir / "matrix_summary.json"
    md_path = run_dir / "matrix_summary.md"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    _write_markdown(report, md_path)

    print(f"summary_json={json_path}")
    print(f"summary_md={md_path}")
    if winner:
        print(f"winner={winner['config']['name']}")
    else:
        print("winner=none")


if __name__ == "__main__":
    main()

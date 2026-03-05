#!/usr/bin/env python3
"""Run text, vision, and latency benchmarks against Cosmos Reason2."""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from src.connectors.cosmos_client import CosmosClient

RESULTS_PATH = Path(__file__).resolve().parents[2] / "docs" / "BENCHMARKS.md"


def _benchmark_text(client: CosmosClient) -> dict:
    """Basic text completion benchmark."""
    prompts = [
        "Describe what a security camera typically monitors.",
        "List 5 common anomalies in an office building at night.",
        "Explain the difference between LiDAR and camera-based detection.",
    ]
    results = []
    for p in prompts:
        start = time.perf_counter()
        resp = client.chat([{"role": "user", "content": p}])
        elapsed = time.perf_counter() - start
        results.append({
            "prompt": p[:60],
            "response_len": len(resp),
            "latency_s": round(elapsed, 3),
            "success": bool(resp),
        })
    return {"text_benchmarks": results}


def _benchmark_latency(client: CosmosClient, n: int = 10) -> dict:
    """Latency statistics."""
    return {"latency": client.benchmark_latency(n=n)}


def _benchmark_vision(client: CosmosClient) -> dict:
    """Vision benchmark (placeholder — needs sample image)."""
    sample = Path(__file__).resolve().parents[2] / "data" / "samples" / "test.jpg"
    if not sample.exists():
        return {"vision": {"status": "skipped", "reason": "no sample image at data/samples/test.jpg"}}
    start = time.perf_counter()
    resp = client.chat_with_video(str(sample), "Describe this image in detail.")
    elapsed = time.perf_counter() - start
    return {"vision": {"response_len": len(resp), "latency_s": round(elapsed, 3), "success": bool(resp)}}


def write_results(results: dict) -> None:
    """Write benchmark results to docs/BENCHMARKS.md."""
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    md = f"# Benchmark Results\n\n> Generated: {ts}\n\n```json\n{json.dumps(results, indent=2)}\n```\n"
    RESULTS_PATH.write_text(md)
    print(f"Results written to {RESULTS_PATH}")


def main() -> None:
    client = CosmosClient()

    if not client.health_check():
        print("ERROR: Cosmos endpoint not reachable. Aborting benchmarks.", file=sys.stderr)
        sys.exit(1)

    results: dict = {"timestamp": datetime.now(timezone.utc).isoformat()}
    print("Running text benchmarks...")
    results.update(_benchmark_text(client))
    print("Running latency benchmarks...")
    results.update(_benchmark_latency(client))
    print("Running vision benchmarks...")
    results.update(_benchmark_vision(client))

    write_results(results)
    print("Done.")


if __name__ == "__main__":
    main()

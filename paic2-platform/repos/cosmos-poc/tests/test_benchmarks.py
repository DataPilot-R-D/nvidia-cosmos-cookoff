"""Benchmark result validation tests."""

import pytest
from tests.conftest import requires_cosmos, integration


@requires_cosmos
@integration
def test_latency_benchmark_returns_stats(cosmos_client):
    """benchmark_latency returns dict with expected keys."""
    result = cosmos_client.benchmark_latency(n=2)
    assert "avg" in result
    assert "min" in result
    assert "max" in result
    assert "p95" in result
    assert result["n"] == 2
    assert result["min"] <= result["avg"] <= result["max"]

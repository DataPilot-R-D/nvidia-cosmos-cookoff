"""Shared fixtures for Issue #28 agent validation tests."""

from __future__ import annotations

import os

import pytest

from src.benchmarks.agent_validation.foundation import verify_pinned_artifacts


@pytest.fixture(scope="session", autouse=True)
def _verify_required_artifacts_once():
    """Fail fast if pinned inputs are missing or changed."""

    return verify_pinned_artifacts()


@pytest.fixture(scope="session")
def numeric_abs_tol() -> float:
    return float(os.getenv("AGENT_VALIDATION_ABS_TOL", "1e-6"))


@pytest.fixture(scope="session")
def agent_validation_runs() -> int:
    return int(os.getenv("AGENT_VALIDATION_RUNS", "3"))


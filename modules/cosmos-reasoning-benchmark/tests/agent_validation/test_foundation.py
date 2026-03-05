"""Foundation tests for Issue #28 validation harness."""

from src.benchmarks.agent_validation.foundation import (
    PINNED_ARTIFACTS,
    verify_pinned_artifacts,
)


def test_pinned_artifacts_include_required_files():
    assert set(PINNED_ARTIFACTS) == {"message.csv", "objects.db"}


def test_verify_pinned_artifacts_for_cosmos2_samples():
    checks = verify_pinned_artifacts()
    assert {check.path.name for check in checks} == {"message.csv", "objects.db"}

"""Shared filesystem helpers for deterministic validation tests."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
COSMOS2_DIR = PROJECT_ROOT / "data" / "sensor_samples" / "cosmos2"

PINNED_ARTIFACTS: dict[str, str] = {
    "message.csv": "1592fd8412fca8aa844dc65934b288c5d9bf0e322b84f01e2e01c0a840f801ac",
    "objects.db": "3b91c8b36499d64b36564f6edd9b47724a0b029fad8de4661027cefca0084285",
}


@dataclass(frozen=True)
class ArtifactCheck:
    """Resolved pin validation details for a required input artifact."""

    path: Path
    expected_sha256: str
    actual_sha256: str


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_pinned_artifacts(base_dir: Path = COSMOS2_DIR) -> list[ArtifactCheck]:
    """Validate required artifacts exist and match pinned SHA256 hashes."""

    checks: list[ArtifactCheck] = []
    mismatches: list[ArtifactCheck] = []

    for filename, expected_sha256 in PINNED_ARTIFACTS.items():
        path = base_dir / filename
        if not path.is_file():
            raise FileNotFoundError(f"Required artifact not found: {path}")

        check = ArtifactCheck(
            path=path,
            expected_sha256=expected_sha256,
            actual_sha256=sha256_file(path),
        )
        checks.append(check)

        if check.actual_sha256 != check.expected_sha256:
            mismatches.append(check)

    if mismatches:
        detail = ", ".join(
            f"{item.path.name}=expected:{item.expected_sha256} actual:{item.actual_sha256}"
            for item in mismatches
        )
        raise ValueError(f"Pinned artifact hash mismatch: {detail}")

    return checks


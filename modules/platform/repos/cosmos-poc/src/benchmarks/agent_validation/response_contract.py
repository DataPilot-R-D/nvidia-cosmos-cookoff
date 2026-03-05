"""Strict JSON response contract validation helpers."""

from __future__ import annotations

import json
import re
from typing import Any


class ResponseContractError(ValueError):
    """Raised when response payload breaks the validation contract."""


def parse_strict_json_object(raw_response: str) -> dict[str, Any]:
    """Parse a response into a strict top-level JSON object."""

    normalized = raw_response.strip()
    normalized = re.sub(r"^```(?:json)?\s*", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s*```$", "", normalized)

    try:
        payload = json.loads(normalized)
    except json.JSONDecodeError as exc:
        raise ResponseContractError("Response is not valid JSON") from exc

    if not isinstance(payload, dict):
        raise ResponseContractError("Top-level JSON payload must be an object")
    return payload


def validate_required_numeric_fields(
    payload: dict[str, Any],
    required_keys: set[str],
    numeric_keys: set[str],
) -> None:
    """Ensure required keys exist and expected numeric fields are numeric."""

    missing = required_keys.difference(payload)
    if missing:
        ordered = ", ".join(sorted(missing))
        raise ResponseContractError(f"Missing required keys: {ordered}")

    for key in sorted(numeric_keys):
        value = payload.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ResponseContractError(f"Field '{key}' must be numeric, got {type(value).__name__}")

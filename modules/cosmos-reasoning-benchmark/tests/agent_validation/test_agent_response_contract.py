"""Response contract checks for strict JSON and numeric typing."""

from __future__ import annotations

import pytest

from src.benchmarks.agent_validation.response_contract import (
    ResponseContractError,
    parse_strict_json_object,
    validate_required_numeric_fields,
)


def test_parse_strict_json_object_rejects_non_json_text():
    with pytest.raises(ResponseContractError):
        parse_strict_json_object("not-json")


def test_parse_strict_json_object_accepts_markdown_fenced_json():
    payload = parse_strict_json_object("```json\n{\"row_count\": 9}\n```")
    assert payload == {"row_count": 9}


def test_parse_strict_json_object_rejects_non_object_top_level():
    with pytest.raises(ResponseContractError):
        parse_strict_json_object("[1, 2, 3]")


def test_validate_required_numeric_fields_rejects_missing_keys():
    payload = {"row_count": 9}
    with pytest.raises(ResponseContractError):
        validate_required_numeric_fields(
            payload=payload,
            required_keys={"row_count", "timestamp_min"},
            numeric_keys={"row_count", "timestamp_min"},
        )


def test_validate_required_numeric_fields_rejects_stringified_numbers():
    payload = {"row_count": "9", "timestamp_min": 1771345677.1569738}
    with pytest.raises(ResponseContractError):
        validate_required_numeric_fields(
            payload=payload,
            required_keys={"row_count", "timestamp_min"},
            numeric_keys={"row_count", "timestamp_min"},
        )


def test_validate_required_numeric_fields_accepts_valid_payload():
    payload = {"row_count": 9, "timestamp_min": 1771345677.1569738}
    validate_required_numeric_fields(
        payload=payload,
        required_keys={"row_count", "timestamp_min"},
        numeric_keys={"row_count", "timestamp_min"},
    )

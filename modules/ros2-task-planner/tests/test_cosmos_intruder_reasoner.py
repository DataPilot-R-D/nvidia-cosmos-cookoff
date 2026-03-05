"""Tests for cosmos_intruder_reasoner — TDD RED phase."""

import json
from unittest.mock import patch, MagicMock

import pytest

from sras_robot_task_planner.cosmos_intruder_reasoner import (
    CosmosIntruderReasonerClient,
    ThreatAssessment,
)
from sras_robot_task_planner.detection_buffer import SceneSummary


def _summary(
    class_counts: dict[str, int] | None = None,
    class_positions: dict[str, dict[str, float]] | None = None,
) -> SceneSummary:
    return SceneSummary(
        class_counts=class_counts or {"person": 1},
        class_positions=class_positions or {"person": {"x": 1.0, "y": 2.0}},
        changes=(),
        buffer_duration_s=5.0,
        snapshot_count=3,
        latest_timestamp_s=100.0,
    )


class TestThreatAssessmentIsFrozen:
    def test_cannot_mutate(self) -> None:
        ta = ThreatAssessment(
            threat_level="high",
            reasoning="Unauthorized person",
            target_position={"x": 1.0, "y": 2.0},
            recommended_task="INVESTIGATE_ALERT",
            confidence=0.9,
            raw_response="{}",
        )
        with pytest.raises(AttributeError):
            ta.threat_level = "low"  # type: ignore[misc]


class TestClientInit:
    def test_normalizes_api_base(self) -> None:
        client = CosmosIntruderReasonerClient(
            api_base="http://localhost:8899/v1/",
            model="nvidia/Cosmos-Reason2-2B",
        )
        assert client.api_base == "http://localhost:8899"

    def test_rejects_empty_api_base(self) -> None:
        with pytest.raises(ValueError):
            CosmosIntruderReasonerClient(api_base="", model="x")


class TestPromptBuilding:
    def test_prompt_contains_scene_data(self) -> None:
        client = CosmosIntruderReasonerClient(
            api_base="http://localhost:8899",
            model="nvidia/Cosmos-Reason2-2B",
        )
        summary = _summary(class_counts={"person": 2, "backpack": 1})
        robot_pos = {"x": 0.0, "y": 0.0}
        prompt = client._build_prompt(summary, robot_pos)
        assert "person" in prompt
        assert "backpack" in prompt
        assert "2" in prompt  # count


class TestResponseParsing:
    def test_parses_valid_json_response(self) -> None:
        response = json.dumps({
            "threat_level": "high",
            "reasoning": "Unauthorized person in restricted area",
            "target_position": {"x": 1.0, "y": 2.0},
            "recommended_task": "INVESTIGATE_ALERT",
            "confidence": 0.85,
        })
        ta = CosmosIntruderReasonerClient._parse_assessment(response)
        assert ta.threat_level == "high"
        assert ta.reasoning == "Unauthorized person in restricted area"
        assert ta.target_position == {"x": 1.0, "y": 2.0}
        assert ta.recommended_task == "INVESTIGATE_ALERT"
        assert ta.confidence == 0.85

    def test_parses_markdown_wrapped_json(self) -> None:
        response = '```json\n{"threat_level": "low", "reasoning": "Staff member", "target_position": null, "recommended_task": "NONE", "confidence": 0.7}\n```'
        ta = CosmosIntruderReasonerClient._parse_assessment(response)
        assert ta.threat_level == "low"
        assert ta.recommended_task == "NONE"

    def test_raises_on_invalid_json(self) -> None:
        with pytest.raises(ValueError):
            CosmosIntruderReasonerClient._parse_assessment("not json at all")

    def test_defaults_missing_fields(self) -> None:
        response = json.dumps({"threat_level": "medium"})
        ta = CosmosIntruderReasonerClient._parse_assessment(response)
        assert ta.threat_level == "medium"
        assert ta.reasoning == ""
        assert ta.target_position is None
        assert ta.recommended_task == "INVESTIGATE_ALERT"
        assert ta.confidence == 0.5


class TestAssessWithMockedHTTP:
    def test_assess_returns_threat_assessment(self) -> None:
        cosmos_response = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "threat_level": "high",
                        "reasoning": "Person detected",
                        "target_position": {"x": 1.0, "y": 2.0},
                        "recommended_task": "INVESTIGATE_ALERT",
                        "confidence": 0.9,
                    })
                }
            }]
        }

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(cosmos_response).encode("utf-8")
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)

        client = CosmosIntruderReasonerClient(
            api_base="http://localhost:8899",
            model="nvidia/Cosmos-Reason2-2B",
        )

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = client.assess(_summary(), robot_position={"x": 0.0, "y": 0.0})

        assert isinstance(result, ThreatAssessment)
        assert result.threat_level == "high"

    def test_assess_retries_on_failure(self) -> None:
        client = CosmosIntruderReasonerClient(
            api_base="http://localhost:8899",
            model="nvidia/Cosmos-Reason2-2B",
            max_retries=1,
        )

        cosmos_response = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "threat_level": "low",
                        "reasoning": "ok",
                        "target_position": None,
                        "recommended_task": "NONE",
                        "confidence": 0.5,
                    })
                }
            }]
        }
        mock_ok = MagicMock()
        mock_ok.read.return_value = json.dumps(cosmos_response).encode("utf-8")
        mock_ok.__enter__ = lambda s: s
        mock_ok.__exit__ = MagicMock(return_value=False)

        from urllib.error import URLError
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise URLError("timeout")
            return mock_ok

        with patch("urllib.request.urlopen", side_effect=side_effect):
            result = client.assess(_summary(), robot_position=None)

        assert isinstance(result, ThreatAssessment)
        assert call_count == 2

    def test_assess_raises_after_exhausted_retries(self) -> None:
        client = CosmosIntruderReasonerClient(
            api_base="http://localhost:8899",
            model="nvidia/Cosmos-Reason2-2B",
            max_retries=0,
        )

        from urllib.error import URLError
        with patch("urllib.request.urlopen", side_effect=URLError("timeout")):
            with pytest.raises(RuntimeError, match="failed"):
                client.assess(_summary(), robot_position=None)

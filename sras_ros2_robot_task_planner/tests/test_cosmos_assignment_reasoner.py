import json
from unittest.mock import MagicMock, patch
from urllib import error as url_error

import pytest

from sras_robot_task_planner.cosmos_assignment_reasoner import (
    AssignmentPlan,
    CosmosAssignmentReasonerClient,
    RobotAssignment,
)


def _mock_response(content: str) -> MagicMock:
    body = json.dumps({
        "choices": [{"message": {"content": content}}],
    }).encode("utf-8")
    mock = MagicMock()
    mock.read.return_value = body
    mock.__enter__ = lambda s: s
    mock.__exit__ = MagicMock(return_value=False)
    return mock


def _valid_plan_json() -> str:
    return json.dumps({
        "assignments": [
            {
                "robot_id": "robot0",
                "task_type": "PURSUE_THIEF",
                "priority": 0.9,
                "reasoning": "Fast quadruped suited for pursuit",
                "payload": {"target_x": 1.0, "target_y": 2.0},
            },
            {
                "robot_id": "robot1",
                "task_type": "BLOCK_EXIT",
                "priority": 0.8,
                "reasoning": "Humanoid can physically block exit",
                "payload": {"target_x": 5.0, "target_y": 3.0},
            },
        ]
    })


# --- Frozen dataclass immutability ---


class TestFrozenDataclasses:
    def test_robot_assignment_is_frozen(self) -> None:
        assignment = RobotAssignment(
            robot_id="r0",
            task_type="PURSUE_THIEF",
            priority=0.9,
            reasoning="test",
            payload={},
        )
        with pytest.raises(AttributeError):
            assignment.priority = 0.5  # type: ignore[misc]

    def test_assignment_plan_is_frozen(self) -> None:
        plan = AssignmentPlan(assignments=(), raw_response="")
        with pytest.raises(AttributeError):
            plan.raw_response = "changed"  # type: ignore[misc]


# --- Client construction ---


class TestClientConstruction:
    def test_raises_on_empty_api_base(self) -> None:
        with pytest.raises(ValueError, match="api_base must not be empty"):
            CosmosAssignmentReasonerClient(api_base="", model="test-model")

    def test_strips_trailing_v1(self) -> None:
        client = CosmosAssignmentReasonerClient(
            api_base="http://localhost:8000/v1/",
            model="test-model",
        )
        assert client.api_base == "http://localhost:8000"


# --- Parsing ---


class TestParsePlan:
    def test_parses_valid_plan(self) -> None:
        plan = CosmosAssignmentReasonerClient._parse_plan(_valid_plan_json())
        assert len(plan.assignments) == 2
        assert plan.assignments[0].robot_id == "robot0"
        assert plan.assignments[0].task_type == "PURSUE_THIEF"
        assert plan.assignments[0].priority == 0.9
        assert plan.assignments[1].robot_id == "robot1"
        assert plan.assignments[1].task_type == "BLOCK_EXIT"

    def test_parses_plan_with_markdown_fences(self) -> None:
        content = f"```json\n{_valid_plan_json()}\n```"
        plan = CosmosAssignmentReasonerClient._parse_plan(content)
        assert len(plan.assignments) == 2

    def test_parses_empty_assignments(self) -> None:
        content = json.dumps({"assignments": []})
        plan = CosmosAssignmentReasonerClient._parse_plan(content)
        assert len(plan.assignments) == 0

    def test_raises_on_non_object(self) -> None:
        with pytest.raises(ValueError, match="not a JSON object"):
            CosmosAssignmentReasonerClient._parse_plan("[1, 2, 3]")

    def test_raises_on_non_list_assignments(self) -> None:
        with pytest.raises(ValueError, match="assignments must be a list"):
            CosmosAssignmentReasonerClient._parse_plan(
                json.dumps({"assignments": "not_a_list"})
            )

    def test_skips_non_dict_entries(self) -> None:
        content = json.dumps({
            "assignments": [
                {"robot_id": "robot0", "task_type": "PURSUE_THIEF", "priority": 0.9},
                "not_a_dict",
                42,
            ]
        })
        plan = CosmosAssignmentReasonerClient._parse_plan(content)
        assert len(plan.assignments) == 1

    def test_uses_defaults_for_missing_fields(self) -> None:
        content = json.dumps({
            "assignments": [{"robot_id": "robot0"}]
        })
        plan = CosmosAssignmentReasonerClient._parse_plan(content)
        assert plan.assignments[0].task_type == "INVESTIGATE_ALERT"
        assert plan.assignments[0].priority == 0.5
        assert plan.assignments[0].reasoning == ""
        assert plan.assignments[0].payload == {}


# --- HTTP interaction ---


class TestAssign:
    @patch("urllib.request.urlopen")
    def test_successful_assignment(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response(_valid_plan_json())

        client = CosmosAssignmentReasonerClient(
            api_base="http://localhost:8000",
            model="test-model",
            api_key="test-key",
        )
        plan = client.assign(
            event_summary={"event_type": "intruder_detected", "severity": "high"},
            robot_states=[
                {"robot_id": "robot0", "robot_type": "quadruped"},
                {"robot_id": "robot1", "robot_type": "humanoid"},
            ],
            timeout_s=2.0,
        )

        assert len(plan.assignments) == 2
        assert plan.assignments[0].robot_id == "robot0"
        assert mock_urlopen.call_count == 1

    @patch("urllib.request.urlopen")
    def test_retries_on_failure(self, mock_urlopen: MagicMock) -> None:
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise url_error.URLError("connection refused")
            return _mock_response(_valid_plan_json())

        mock_urlopen.side_effect = side_effect

        client = CosmosAssignmentReasonerClient(
            api_base="http://localhost:8000",
            model="test-model",
            max_retries=1,
        )
        plan = client.assign(
            event_summary={"event_type": "intruder_detected"},
            robot_states=[],
        )

        assert len(plan.assignments) == 2
        assert call_count == 2

    @patch("urllib.request.urlopen")
    def test_raises_after_exhausted_retries(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.side_effect = url_error.URLError("connection refused")

        client = CosmosAssignmentReasonerClient(
            api_base="http://localhost:8000",
            model="test-model",
            max_retries=1,
        )
        with pytest.raises(RuntimeError, match="Cosmos assignment reasoner failed"):
            client.assign(
                event_summary={"event_type": "intruder_detected"},
                robot_states=[],
            )
        assert mock_urlopen.call_count == 2


# --- Prompt building ---


class TestBuildPrompt:
    def test_prompt_contains_event_and_fleet(self) -> None:
        prompt = CosmosAssignmentReasonerClient._build_prompt(
            event_summary={"event_type": "intruder_detected"},
            robot_states=[{"robot_id": "robot0"}],
        )
        assert "event=" in prompt
        assert "fleet=" in prompt
        assert "intruder_detected" in prompt
        assert "robot0" in prompt
        assert "Return JSON only." in prompt

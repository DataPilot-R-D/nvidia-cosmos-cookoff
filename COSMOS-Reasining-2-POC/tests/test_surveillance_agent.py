"""Tests for the agentic surveillance loop."""

from __future__ import annotations

import base64

import pytest

from src.agents.v3 import runtime as sa


class MockCosmosClient:
    """Sync mock matching CosmosClient chat/chat_with_video interface."""

    def __init__(self, chat_responses: list[str] | None = None, video_responses: list[str] | None = None):
        self._chat_responses = list(chat_responses or [])
        self._video_responses = list(video_responses or [])
        self.chat_calls: list[tuple[list[dict], float, int]] = []
        self.video_calls: list[tuple[str, str, float, int]] = []

    def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 300) -> str:
        self.chat_calls.append((messages, temperature, max_tokens))
        if not self._chat_responses:
            raise RuntimeError("No mock chat responses left")
        return self._chat_responses.pop(0)

    def chat_with_video(
        self,
        frame: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 300,
    ) -> str:
        self.video_calls.append((frame, prompt, temperature, max_tokens))
        if not self._video_responses:
            raise RuntimeError("No mock video responses left")
        return self._video_responses.pop(0)


def _sample_frame_base64() -> str:
    return base64.b64encode(b"fake-jpeg-bytes").decode("ascii")


def _c2_cycle_alert_responses() -> list[str]:
    return [
        '{"scene":"Backyard view","anomalies":["open gate"],"confidence":0.82,"alert_level":"yellow"}',
        '{"assessments":[{"detection":"open gate","threat_level":"suspicious","reasoning":"entry point unsecured","confidence":0.84}],"overall_threat":"medium","recommended_priority":"investigate"}',
        '{"scenarios":[{"name":"likely","description":"gate remains open","probability":0.8,"time_estimate_minutes":10,"required_response":"alert"}],"recommended_action":"notify operator"}',
        '{"action":"notify operator","alert":{"level":"warning","notify":["operator"],"message":"gate open"},"robot_command":{"action":"investigate","target":"gate","parameters":{}},"escalation_triggers":["intrusion"],"monitoring_focus":["gate"]}',
        '{"resolved":"partial","resolution_details":"gate still open","new_issues":[],"robot_status":"pending","recommendation":"continue_monitoring","confidence":0.83}',
    ]


@pytest.mark.asyncio
async def test_patrol_loop_five_step_with_mocked_cosmos(monkeypatch: pytest.MonkeyPatch) -> None:
    cosmos = MockCosmosClient(chat_responses=_c2_cycle_alert_responses())
    agent = sa.SurveillanceAgent(cosmos=cosmos)

    events: dict[str, int] = {"scene": 0, "window": 0, "door": 0, "report": 0}

    def mock_describe_scene(description: str) -> dict[str, str]:
        events["scene"] += 1
        return {"logged": True, "description": description}

    def mock_check_window_status(window_id: str = "main") -> dict[str, str]:
        events["window"] += 1
        return {"window_id": window_id, "status": "closed", "source": "test"}

    def mock_check_door_status(door_id: str = "front") -> dict[str, str]:
        events["door"] += 1
        return {"door_id": door_id, "status": "closed", "source": "test"}

    def mock_report_anomaly(description: str, severity: str = "medium") -> dict[str, str]:
        events["report"] += 1
        return {"reported": True, "severity": severity, "description": description}

    monkeypatch.setattr(sa, "describe_scene", mock_describe_scene)
    monkeypatch.setattr(sa, "check_window_status", mock_check_window_status)
    monkeypatch.setattr(sa, "check_door_status", mock_check_door_status)
    monkeypatch.setattr(sa, "report_anomaly", mock_report_anomaly)

    await agent.enqueue_frame(_sample_frame_base64())
    await agent.patrol_loop(max_iterations=1)

    assert len(agent.context_history) == 1
    assert agent.context_history[0]["action"] == "alert"
    assert events == {"scene": 1, "window": 1, "door": 1, "report": 1}
    assert len(cosmos.chat_calls) == 5


@pytest.mark.parametrize(
    "raw, expected_description, expected_anomalies",
    [
        (
            "<think>reasoning</think>```json\n{\"scene\":\"Kitchen\",\"anomalies\":[\"broken glass\"],\"alert_level\":\"red\"}\n```",
            "Kitchen",
            ["broken glass"],
        ),
        (
            "<think>analysis</think>{\"description\":\"Hallway\",\"anomalies\":[\"door ajar\"],\"confidence\":0.66,\"severity\":\"medium\"}",
            "Hallway",
            ["door ajar"],
        ),
        (
            "<think>looping",
            "looping",
            [],
        ),
    ],
)
def test_c2_response_parsing_edge_cases(
    raw: str,
    expected_description: str,
    expected_anomalies: list[str],
) -> None:
    agent = sa.SurveillanceAgent(cosmos=MockCosmosClient())
    parsed = agent._normalize_detection(agent._parse_c2_response(raw))

    assert parsed["description"] == expected_description
    assert parsed["anomalies"] == expected_anomalies


@pytest.mark.asyncio
async def test_alert_cooldown_downgrades_escalation() -> None:
    first_cycle = [
        '{"scene":"Entry","anomalies":["intruder"],"confidence":0.96,"alert_level":"red"}',
        '{"assessments":[{"detection":"intruder","threat_level":"critical","reasoning":"unknown person inside","confidence":0.97}],"overall_threat":"critical","recommended_priority":"respond"}',
        '{"scenarios":[{"name":"worst_case","description":"intruder advances","probability":0.7,"time_estimate_minutes":5,"required_response":"dispatch"}],"recommended_action":"dispatch"}',
        '{"action":"dispatch guard","alert":{"level":"critical","notify":["security team"],"message":"intruder detected"},"robot_command":{"action":"investigate","target":"entry","parameters":{}},"escalation_triggers":["weapon seen"],"monitoring_focus":["intruder path"]}',
        '{"resolved":"no","resolution_details":"intruder still present","new_issues":[],"robot_status":"moving","recommendation":"escalate","confidence":0.96}',
    ]
    second_cycle = [
        '{"scene":"Entry","anomalies":["intruder"],"confidence":0.96,"alert_level":"red"}',
        '{"assessments":[{"detection":"intruder","threat_level":"critical","reasoning":"unknown person inside","confidence":0.97}],"overall_threat":"critical","recommended_priority":"respond"}',
        '{"scenarios":[{"name":"worst_case","description":"intruder advances","probability":0.7,"time_estimate_minutes":5,"required_response":"dispatch"}],"recommended_action":"dispatch"}',
        '{"action":"dispatch guard","alert":{"level":"critical","notify":["security team"],"message":"intruder detected"},"robot_command":{"action":"investigate","target":"entry","parameters":{}},"escalation_triggers":["weapon seen"],"monitoring_focus":["intruder path"]}',
        '{"resolved":"no","resolution_details":"intruder still present","new_issues":[],"robot_status":"moving","recommendation":"escalate","confidence":0.96}',
    ]

    cosmos = MockCosmosClient(chat_responses=first_cycle + second_cycle)
    agent = sa.SurveillanceAgent(cosmos=cosmos, alert_cooldown_seconds=60)

    frame = _sample_frame_base64()
    await agent.patrol_loop(frame_base64_jpeg=frame, max_iterations=1)
    first_alert_time = agent.last_alert_time

    await agent.patrol_loop(frame_base64_jpeg=frame, max_iterations=1)

    assert agent.context_history[0]["action"] == "escalate"
    assert agent.context_history[1]["action"] == "log"
    assert agent.last_alert_time == first_alert_time


@pytest.mark.asyncio
async def test_cosmos_retry_succeeds_before_max_attempts() -> None:
    class FlakyCosmos:
        def __init__(self) -> None:
            self.calls = 0
            self.responses = _c2_cycle_alert_responses()

        def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 300) -> str:
            self.calls += 1
            if self.calls < 3:
                raise RuntimeError("temporary failure")
            return self.responses.pop(0)

    cosmos = FlakyCosmos()
    agent = sa.SurveillanceAgent(cosmos=cosmos, retry_delay_seconds=0, max_retries=3)

    await agent.patrol_loop(frame_base64_jpeg=_sample_frame_base64(), max_iterations=1)

    assert cosmos.calls == 7
    assert agent.context_history[0]["action"] == "alert"


@pytest.mark.asyncio
async def test_reasoning_loop_detection_retries() -> None:
    """When Cosmos returns <think> without </think>, _chat_retry should retry."""
    looped = "<think>reasoning forever without closing"
    good_responses = _c2_cycle_alert_responses()
    # First call returns loop, second returns good detect, rest are normal
    all_responses = [looped] + good_responses

    cosmos = MockCosmosClient(chat_responses=all_responses)
    agent = sa.SurveillanceAgent(cosmos=cosmos, retry_delay_seconds=0, max_retries=3)

    await agent.patrol_loop(frame_base64_jpeg=_sample_frame_base64(), max_iterations=1)

    # First call looped (retry), then 5 successful = 6 total
    assert len(cosmos.chat_calls) == 6
    # Second call should have bumped max_tokens (800 * 1.5 = 1200)
    assert cosmos.chat_calls[1][2] == 1200


@pytest.mark.asyncio
async def test_cosmos_retry_raises_after_max_attempts() -> None:
    class FailingCosmos:
        def __init__(self) -> None:
            self.calls = 0

        def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 300) -> str:
            self.calls += 1
            raise RuntimeError("permanent failure")

    cosmos = FailingCosmos()
    agent = sa.SurveillanceAgent(cosmos=cosmos, retry_delay_seconds=0, max_retries=3)

    with pytest.raises(RuntimeError, match="failed after retries"):
        await agent.patrol_loop(frame_base64_jpeg=_sample_frame_base64(), max_iterations=1)

    assert cosmos.calls == 3


def test_max_tokens_sufficient_for_reasoning() -> None:
    """max_tokens for detect/verify must be >= 800 when reasoning is enabled."""
    from src.prompts.prompt_templates import C2PromptTemplates, MAX_TOKENS, SAMPLING_REASONING

    assert MAX_TOKENS["detect"] >= 800, f"detect max_tokens too low: {MAX_TOKENS['detect']}"
    assert MAX_TOKENS["verify"] >= 800, f"verify max_tokens too low: {MAX_TOKENS['verify']}"
    assert "presence_penalty" not in SAMPLING_REASONING, "presence_penalty should be omitted, not set to 0.0"


@pytest.mark.asyncio
async def test_c2_prompt_templates_are_used_in_all_steps() -> None:
    cosmos = MockCosmosClient(chat_responses=_c2_cycle_alert_responses())
    agent = sa.SurveillanceAgent(cosmos=cosmos)

    await agent.patrol_loop(frame_base64_jpeg=_sample_frame_base64(), context="sector B", max_iterations=1)

    assert len(cosmos.chat_calls) == 5

    prompts: list[str] = []
    for messages, _temperature, _max_tokens in cosmos.chat_calls:
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        content = messages[1]["content"]
        assert content[0]["type"] == "image_url"
        assert content[-1]["type"] == "text"
        prompts.append(content[-1]["text"])

    assert "Analyze this frame and report" in prompts[0]
    assert "Detection results from surveillance camera" in prompts[1]
    assert "Project 3 scenarios for the next 5-15 minutes" in prompts[2]
    assert "Make a decision" in prompts[3]
    assert "verify" in prompts[4].lower()

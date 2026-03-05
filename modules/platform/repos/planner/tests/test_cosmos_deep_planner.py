import pytest

from sras_robot_task_planner.cosmos_deep_planner import CosmosDeepPlannerClient


def test_api_base_normalization_strips_trailing_v1() -> None:
    client = CosmosDeepPlannerClient(api_base="https://cosmos.example/v1", model="x")
    assert client.api_base == "https://cosmos.example"

    client = CosmosDeepPlannerClient(api_base="https://cosmos.example/v1/", model="x")
    assert client.api_base == "https://cosmos.example"

    client = CosmosDeepPlannerClient(api_base="https://cosmos.example", model="x")
    assert client.api_base == "https://cosmos.example"


def test_api_base_normalization_rejects_empty_value() -> None:
    with pytest.raises(ValueError):
        CosmosDeepPlannerClient(api_base="", model="x")

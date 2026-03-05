"""Tests for Cosmos Reason2 client connectivity and response format."""

import pytest
from tests.conftest import requires_cosmos, integration


@requires_cosmos
@integration
def test_health_check(cosmos_client):
    """Model endpoint responds to /v1/models."""
    assert cosmos_client.health_check() is True


@requires_cosmos
@integration
def test_text_completion(cosmos_client):
    """Basic text prompt returns a non-empty string."""
    result = cosmos_client.chat([{"role": "user", "content": "Say hello."}])
    assert isinstance(result, str)
    assert len(result) > 0


@requires_cosmos
@integration
def test_response_format(cosmos_client):
    """Response follows OpenAI chat completion format."""
    response = cosmos_client.client.chat.completions.create(
        model=cosmos_client.model,
        messages=[{"role": "user", "content": "Hi"}],
        max_tokens=10,
    )
    assert response.choices
    assert response.choices[0].message.content
    assert response.model


@requires_cosmos
@integration
def test_latency(cosmos_client):
    """Single response completes under 5 seconds."""
    import time
    start = time.perf_counter()
    cosmos_client.chat([{"role": "user", "content": "Hello"}], max_tokens=20)
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"Response took {elapsed:.2f}s (limit 5s)"

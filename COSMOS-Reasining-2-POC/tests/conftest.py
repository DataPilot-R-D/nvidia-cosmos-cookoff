"""Shared fixtures for Cosmos hackathon tests."""

import os
import sys
import pytest

# Add project root to PYTHONPATH to enable src imports
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.connectors.cosmos_client import CosmosClient


def _endpoint_available() -> bool:
    try:
        return CosmosClient().health_check()
    except Exception:
        return False


requires_cosmos = pytest.mark.skipif(
    not os.getenv("COSMOS_API_BASE") and not _endpoint_available(),
    reason="Cosmos endpoint not available",
)
integration = pytest.mark.integration


@pytest.fixture
def cosmos_client() -> CosmosClient:
    return CosmosClient()

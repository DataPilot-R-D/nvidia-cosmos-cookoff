"""OpenAI-compatible client for NVIDIA Cosmos Reason2."""

import base64
import os
import time
import statistics
from pathlib import Path

import httpx
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

DEFAULT_BASE_URL = os.getenv("COSMOS_API_BASE", "http://<pod_host>:8899/v1")
DEFAULT_MODEL = "nvidia/Cosmos-Reason2-8B"


def _read_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


DEFAULT_MAX_MODEL_LEN = _read_int_env("COSMOS_MAX_MODEL_LEN", 32768)
DEFAULT_MAX_TOKENS = _read_int_env("COSMOS_MAX_TOKENS", 1024)


class CosmosClient:
    """Thin wrapper around OpenAI SDK targeting Cosmos Reason2 via vLLM."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.base_url = base_url or os.getenv("COSMOS_API_BASE", DEFAULT_BASE_URL)
        self.model = model or os.getenv("COSMOS_MODEL", DEFAULT_MODEL)
        self.max_model_len = _read_int_env("COSMOS_MAX_MODEL_LEN", DEFAULT_MAX_MODEL_LEN)
        self.default_max_tokens = _read_int_env("COSMOS_MAX_TOKENS", DEFAULT_MAX_TOKENS)
        self.client = OpenAI(base_url=self.base_url, api_key="EMPTY")

    # ------------------------------------------------------------------
    # Text chat
    # ------------------------------------------------------------------
    def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Send a chat completion and return the content string."""
        max_tokens = self.default_max_tokens if max_tokens is None else max_tokens
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    # ------------------------------------------------------------------
    # Vision / Video chat
    # ------------------------------------------------------------------
    def chat_with_video(
        self,
        video_path_or_url: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Send a video/image with a text prompt for visual reasoning."""
        max_tokens = self.default_max_tokens if max_tokens is None else max_tokens
        if video_path_or_url.startswith(("http://", "https://")):
            image_content = {
                "type": "image_url",
                "image_url": {"url": video_path_or_url},
            }
        else:
            path = Path(video_path_or_url)
            data = base64.b64encode(path.read_bytes()).decode()
            mime = "image/jpeg" if path.suffix in (".jpg", ".jpeg") else "image/png"
            image_content = {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{data}"},
            }

        messages = [
            {
                "role": "user",
                "content": [
                    image_content,
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------
    def health_check(self) -> bool:
        """Return True if the /v1/models endpoint responds."""
        try:
            r = httpx.get(f"{self.base_url}/models", timeout=10)
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    # ------------------------------------------------------------------
    # Latency benchmark
    # ------------------------------------------------------------------
    def benchmark_latency(
        self,
        prompt: str = "Say hello in one sentence.",
        n: int = 10,
    ) -> dict:
        """Run *n* chat calls and return latency stats (seconds)."""
        times: list[float] = []
        messages = [{"role": "user", "content": prompt}]

        for _ in range(n):
            start = time.perf_counter()
            self.chat(messages, max_tokens=50)
            elapsed = time.perf_counter() - start
            times.append(elapsed)

        times.sort()
        p95_idx = int(0.95 * len(times))
        return {
            "avg": statistics.mean(times),
            "min": min(times),
            "max": max(times),
            "p95": times[p95_idx] if p95_idx < len(times) else times[-1],
            "n": n,
        }

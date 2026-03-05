# Cosmos Reason2 — Connection & Configuration Guide

## Endpoint

| Key | Value |
|-----|-------|
| Base URL | `http://<pod_host>:8899` |
| API Path | `/v1` |
| Model | `nvidia/Cosmos-Reason2-8B` |
| API Style | OpenAI-compatible (vLLM 0.15.1) |
| Context Window | **32768 tokens** (NVIDIA recommended) |
| API Key | `EMPTY` (not required) |
| GPU | NVIDIA L4 24GB |

## Deploy Command

```bash
HF_TOKEN=<your-token> vllm serve nvidia/Cosmos-Reason2-8B \
  --max-model-len 32768 \
  --reasoning-parser qwen3 \
  --gpu-memory-utilization 0.95 \
  --trust-remote-code \
  --port 8899
```

**Required flags:**
- `--max-model-len 32768` — NVIDIA recommended, fixes reasoning loops at 4096
- `--reasoning-parser qwen3` — enables `<think>` tag parsing
- `--trust-remote-code` — required for Cosmos model
- `HF_TOKEN` — needed first time (model download). After cached, set `HF_HUB_OFFLINE=1`

## RunPod Managed Deployment

Instead of manually launching vLLM, use the lifecycle script for automated setup:

```bash
# First run — creates venv, installs vLLM, downloads model, starts serving
python3 scripts/runpod_cosmos.py ensure --bootstrap-service

# Subsequent runs — skips install (marker file), just starts vLLM if not running
python3 scripts/runpod_cosmos.py ensure --bootstrap-service

# Export for other scripts
eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)
curl "$COSMOS_API_BASE/models"
```

The script uses a marker file (`/workspace/cosmos/.bootstrap_done`) to skip
reinstallation on pod restarts — the network volume persists the venv and model
weights across sessions.

For the full operations guide with timings, FAQ, and troubleshooting:
see [RUNPOD_OPERATIONS.md](RUNPOD_OPERATIONS.md).

## Quick Test (curl)

### Text

```bash
curl http://<pod_host>:8899/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/Cosmos-Reason2-8B",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, what can you do?"}
    ],
    "max_tokens": 200,
    "temperature": 0.7
  }'
```

### Image (base64)

```bash
curl http://<pod_host>:8899/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/Cosmos-Reason2-8B",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<BASE64>"}},
        {"type": "text", "text": "Is anyone in this image?"}
      ]}
    ],
    "max_tokens": 300,
    "temperature": 0.7
  }'
```

**⚠️ Media MUST come before text in the content array** (NVIDIA training convention).

## Sampling Parameters

| Mode | temperature | top_p | presence_penalty | max_tokens |
|------|:-----------:|:-----:|:----------------:|:----------:|
| **Without reasoning** | 0.7 | 0.8 | 1.5 | 300-600 |
| **With reasoning** | 0.6 | 0.95 | — | 800-1000 |

## Reasoning (`<think>`)

Reasoning works on multimodal inputs via **format instruction** (not suffix):

```python
# ✅ Works — format instruction in user prompt
{"role": "user", "content": [
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}},
    {"type": "text", "text": "Think step by step. Show reasoning in <think>...</think> tags before your answer. Is the door open or closed?"}
]}

# ❌ Does NOT work — \n<think>\n suffix
{"role": "user", "content": "Is the door open?\n<think>\n"}
```

**When to use reasoning:**
- ✅ Change detection, security sequences
- ❌ Person detection (causes false positives), spatial tasks (loops)

## Input Formats

| Input | Tokens | Notes |
|-------|:------:|-------|
| 1 frame 640p | ~760 | Best quality/token ratio |
| 3 frames 640p | ~2280 | Recommended for comparison |
| 10s video 1080p | ~6010 | Exceeds 4096, needs 32768 context |
| 10s video 480p | ~1600 | OK but lower quality |

**Frames > Video** for analysis quality. Sample at 1-2 fps for surveillance.

## Known Quirks

1. **Media before text** — content array order matters (training convention)
2. **Reasoning loops** — spatial/distance tasks can loop with reasoning enabled; use `max_tokens` cap
3. **JSON termination** — model can't self-close long JSON; keep `max_tokens` under 500 for structured output
4. **Person detection + reasoning** — causes false positives; skip reasoning for this task
5. **`reasoning_content` field stays null** — even with `--reasoning-parser qwen3`, reasoning goes in `content` with `<think>` tags
6. **Hallucination** — phantom objects in inventories (~10-15% rate), more in PL than EN

## Python Client

```python
from src.connectors.cosmos_client import CosmosClient

client = CosmosClient()
print(client.health_check())
print(client.chat([{"role": "user", "content": "Hello"}]))
```

## Resources

- [Cosmos Cookbook](https://nvidia-cosmos.github.io/cosmos-cookbook/)
- [VSS Recipe](https://nvidia-cosmos.github.io/cosmos-cookbook/recipes/inference/reason2/vss/inference.html)
- [Prompt Guide](PROMPT_GUIDE.md) — detailed prompting rules
- [Benchmarks](BENCHMARKS_V3_8192.md) — full test results
- [Final Report](FINAL_REPORT.md) — architecture recommendation

# Cosmos Hackathon — DataPilot R&D

> **NVIDIA Cosmos Cookoff** hackathon repo for the DataPilot R&D team.
> Benchmarking **Cosmos Reason2-8B** for real-time video surveillance in the PAIC2 security robot.

## Architecture

```
Camera Feed              Cosmos Reason2 (fast eyes)       Claude (brain)
+------------------+     +----------------------+        +---------------------+
| 640p frames      |---->| Scene description    |------->| Threat assessment   |
| every 2s         |     | 2.8s latency, $0     |        | every 30s, ~$60/day |
+------------------+     | Person detection     |        | Decision + Actions  |
                         | Motion tracking      |        +---------------------+
                         | vLLM (24GB GPU)      |
                         +----------------------+
```

## Model Endpoint

| Key | Value |
|-----|-------|
| Base URL | `http://<pod_host>:8899` |
| Model | `nvidia/Cosmos-Reason2-8B` |
| API | OpenAI-compatible (vLLM) |
| Context | 32768 tokens (NVIDIA recommended) |
| Cost | $0 (self-hosted on RunPod) |

## Project Structure

```
cosmos-hackathon/
├── src/
│   ├── connectors/
│   │   └── cosmos_client.py       # OpenAI-compatible Cosmos API client
│   ├── agents/
│   │   └── surveillance_agent.py  # PAIC2 surveillance agent logic
│   └── benchmarks/
│       └── run_benchmarks.py      # Benchmark runner
│
├── tests/
│   ├── inputs/
│   │   ├── images/                # 24 test images (640p JPEGs)
│   │   ├── videos/                # 3 test video clips (MP4)
│   │   ├── prompts/
│   │   │   └── benchmark_prompts.json  # All prompts + ground truth + params
│   │   └── README.md              # File descriptions & ground truth table
│   ├── results/                   # Raw benchmark results (JSON)
│   │   ├── v3_retest_raw.json     # 48 tests, no reasoning, 8192 context
│   │   ├── benchmark_v3_raw.json  # 45 tests, with reasoning, 8192 context
│   │   ├── benchmark_b13_raw.json # 11 tests, 2D grounding
│   │   ├── benchmark_v1_raw.json  # Historical: pre-guide prompting
│   │   └── benchmark_v2_raw.json  # Historical: with NVIDIA prompting
│   ├── test_cosmos_client.py
│   ├── test_benchmarks.py
│   └── conftest.py
│
├── docs/
│   ├── FINAL_REPORT.md            # Executive summary (ratings, architecture, conclusions)
│   ├── BENCHMARKS_V3_8192.md      # Detailed per-test results with raw data
│   ├── PROMPT_GUIDE.md            # NVIDIA official prompting rules
│   ├── COSMOS_GUIDE.md            # General Cosmos notes
│   ├── RUNPOD_OPERATIONS.md       # RunPod lifecycle operations guide + FAQ
│   └── archive/                   # Historical V1/V2 results
│       ├── BENCHMARKS_V1.md
│       ├── BENCHMARKS_V2.md
│       └── PLAN.md
│
├── scripts/
│   ├── runpod_cosmos.py           # RunPod lifecycle manager (ensure, prompt, stop)
│   ├── cosmos_webrtc_bridge.py    # WebRTC bridge for Isaac Sim → Cosmos
│   ├── run_benchmarks_v3.py       # V3 benchmark runner (8192 context)
│   ├── run_benchmarks_v4.py       # V4 benchmark runner (configurable via env)
│   ├── evaluate_ground_truth.py   # Deterministic scorer vs benchmark ground truth
│   ├── run_benchmark_matrix.py    # Alternative config search + winner selection
│   ├── run_b13_grounding.py       # 2D grounding tests
│   └── archive/                   # Historical runners
│
├── data/samples/                  # Sample data (gitkeep)
├── .github/workflows/ci.yml      # CI pipeline
├── .env.example                   # Environment template
├── requirements.txt
└── README.md
```

## Key Findings

### What Cosmos 8B Does Well

| Capability | Rating | Notes |
|-----------|:------:|-------|
| TTFT (streaming) | 5/5 | 181ms to first token — real-time ready |
| Scene description | 4/5 | Rich, accurate single-frame captions (10-15 objects) |
| Person detection | 4/5 | 5/5 without reasoning (reasoning causes false positives) |
| Relative positioning | 4/5 | 4/4 correct — LEFT, BEHIND, CLOSER all accurate |
| Video motion | 3.5/5 | Direction + speed + object ID from video clips |
| Latency | 4/5 | 2.8s/frame, 60+ tok/s |

### What Cosmos 8B Cannot Do

| Capability | Rating | Notes |
|-----------|:------:|-------|
| Counting | 2.5/5 | Balloons correct (4/4), chairs/cushions inconsistent |
| Change detection | 2/5 | Targeted prompts partially work, general prompts hallucinate |
| Room dimensions | 1.5/5 | ~40% error vs actual (3.6m vs 7m) |
| Person tracking | 1/5 | No cross-frame memory |
| Security (door) | 1/5 | Says "closed" when door is visibly open |
| Motion (frames) | 1/5 | Cannot detect motion from sequential frames (use video) |

### Critical Prompting Rules

> Wrong prompting drops accuracy by 1-2 stars. See [`docs/PROMPT_GUIDE.md`](docs/PROMPT_GUIDE.md).

1. **Media BEFORE text** in content array (matches training convention)
2. **System prompt:** `"You are a helpful assistant."`
3. **Reasoning mode:** Format instruction in user prompt (not suffix or prefill)
4. **Disable reasoning for person detection** — reasoning causes false positives
5. **Sampling:** `temp=0.6, top_p=0.95` with reasoning; `temp=0.7, top_p=0.8, presence_penalty=1.5` without

### Recommended PAIC2 Architecture

- **Cosmos** as fast "eyes": every 2s frame analysis, $0/day
- **Claude** as "brain": every 30s reasoning cycle, ~$60/day
- **Total cost:** ~$60/day vs ~$2,500/day with Claude on every frame (**97.6% savings**)

> Full report: [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md)
> Detailed per-test results: [`docs/BENCHMARKS_V3_8192.md`](docs/BENCHMARKS_V3_8192.md)

## Quick Start

```bash
# Setup
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run tests
python3 -m pytest tests/ -m "not integration"

# Run benchmarks (requires Cosmos endpoint)
python3 scripts/run_benchmarks_v3.py
```

## RunPod Deployment

> Full operations guide with timing data, FAQ, and architecture details:
> [`docs/RUNPOD_OPERATIONS.md`](docs/RUNPOD_OPERATIONS.md)

### First-Time Setup (~15 min)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env → set RUNPOD_API_KEY and HF_ACCESS_TOKEN

# 2. Create network volume (one-time, persists venv + model weights)
python3 scripts/runpod_cosmos.py create-volume --name cosmos-reason2-8b --size 400

# 3. Create pod, install vLLM, download model, start serving
python3 scripts/runpod_cosmos.py ensure --bootstrap-service --no-stop
```

### Daily Usage (~4-6 min cold start)

```bash
# Start session — export API URL for scripts
eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)

# Send prompts (~2-3s warm response time)
python3 scripts/runpod_cosmos.py prompt --message "Hello" --bootstrap-service --no-stop

# Or use curl with the exported URL
curl "$COSMOS_API_BASE/chat/completions" -H "Content-Type: application/json" \
  -d '{"model":"nvidia/Cosmos-Reason2-8B","messages":[{"role":"user","content":"Hello"}],"max_tokens":256}'

# End session
python3 scripts/runpod_cosmos.py stop
```

### Measured Timings (L40S)

| Operation | Time |
|-----------|------|
| GPU auto-discovery + pod creation | ~15s |
| Restart stopped pod + API ready | ~4-6 min |
| First-time setup (install + model download) | ~12-18 min |
| Prompt response (warm) | ~2-3s at 30 tok/s |
| Prompt response (cold, first request) | ~13s at 5 tok/s |

### Command Reference

| Command | Description |
|---------|-------------|
| `ensure --bootstrap-service` | Start pod, install vLLM if needed, print `COSMOS_API_BASE` |
| `ensure --bootstrap-service --export` | Same, prints `export COSMOS_API_BASE="..."` for `eval` |
| `prompt --message "..." --bootstrap-service` | Full lifecycle: ensure + bootstrap + send prompt |
| `cloud` | List available GPUs and pricing |
| `status` | Show pod status |
| `stop` | Stop the pod |
| `start` | Start pod (SSH only, no API bootstrap) |
| `create-volume` | Create a RunPod network volume |
| `ssh-endpoint` | Print SSH `host port` (for manual debugging) |

## Reproducible Benchmarks

All test inputs are committed to `tests/inputs/` for reproducibility:
- **24 images** — real room footage at 640p
- **3 video clips** — motion and scene scan
- **Prompt definitions** — `tests/inputs/prompts/benchmark_prompts.json` with exact prompts, sampling params, and ground truth

To rerun benchmarks with a different model (e.g., Cosmos 7B, 14B):
```bash
# Update .env with new endpoint
COSMOS_API_BASE=http://new-endpoint:8899/v1
COSMOS_MODEL=nvidia/Cosmos-Reason2-7B

# Run same prompts
python3 scripts/run_benchmarks_v3.py
```

### Ground-Truth Evaluator

Evaluate raw benchmark output against `tests/inputs/prompts/benchmark_prompts.json`:

```bash
python3 scripts/evaluate_ground_truth.py \
  --results tests/results/benchmark_v4_raw.json \
  --out tests/results/benchmark_v4_raw_ground_truth_eval.json
```

### Alternative Config Matrix (Reasoning/Max Tokens/Media Mode)

Run alternative benchmark configurations without overwriting baseline reports:

```bash
python3 scripts/run_benchmark_matrix.py \
  --matrix configs/benchmark-matrix/alt_config_search_v1.json \
  --parallel 2
```

Outputs are written to timestamped folders in `tests/results/alt_benchmarks/`
with per-config raw results, evaluator outputs, and a `matrix_summary.*` winner report.

## Cosmos WebRTC Bridge

Real-time analysis of Isaac Sim camera via Dashboard WebSocket tap.

### Startup Sequence

```bash
# Terminal 1 — Isaac Sim + ROS2 stack (on AWS GPU instance)
~/go2_omniverse/run_sim_custom.sh
ros2 launch sras_bringup go2_stack.launch.py

# Terminal 2 — Dashboard (ros-bridge + websocket-server on port 8081)
cd Dashboard_Robotics
# Start ros-bridge and websocket-server

# Terminal 3 — Cosmos Bridge (this repo)
python3 scripts/cosmos_webrtc_bridge.py --ws-url http://localhost:8081 --interval 2.0

# Remote Dashboard example (Tailscale)
python3 scripts/cosmos_webrtc_bridge.py --ws-url http://100.79.41.70:8081 --save-frames
```

### CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--ws-url` | `http://localhost:8081` | Dashboard WebSocket server URL |
| `--interval` | `2.0` | Analysis interval in seconds (min: 2.0) |
| `--cosmos-url` | `http://<pod_host>:8899` | Cosmos API base URL |
| `--save-frames` | off | Save analyzed frames as JPEG |
| `--log-dir` | `./logs` | Log output directory |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COSMOS_API_KEY` | `EMPTY` | API key for Cosmos endpoint (vLLM local = `EMPTY`) |

### How It Works

The bridge connects to the same Socket.IO WebSocket as the Dashboard UI as a **read-only observer**. It:

1. Receives `video_frame` events (JPEG from ros-bridge camera_publisher)
2. Buffers the latest frame, samples every `--interval` seconds
3. Resizes to 640p, base64 encodes
4. Sends to Cosmos Reason2-2B with **SCENE/CHANGE alternation** (2× SCENE, 1× CHANGE, repeating)
5. Prints analysis to console and logs to `logs/SESSION_TIMESTAMP/`

Logs include: `responses.jsonl`, `session_summary.json`, and optionally `frames/` (with `--save-frames`).

Graceful shutdown with Ctrl+C — prints session summary and saves to disk.

## Resources

- [Cosmos Cookbook](https://nvidia-cosmos.github.io/cosmos-cookbook/)
- [Cosmos Reason2 Prompt Guide](https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html)
- [VSS Recipe](https://nvidia-cosmos.github.io/cosmos-cookbook/recipes/inference/reason2/vss/inference.html)
- [DataPilot PAIC2 Project Board](https://github.com/orgs/DataPilot-R-D/projects/7)
- [Cosmos Hackathon Board](https://github.com/orgs/DataPilot-R-D/projects/8)

# RunPod Operations Guide — Cosmos Reason2-8B

Complete guide for operating `scripts/runpod_cosmos.py` — the lifecycle manager
for running Cosmos Reason2-8B on RunPod GPU instances.

## Measured Timings (L40S, US-TX-3, Feb 2026)

| Operation | Time | Notes |
|-----------|------|-------|
| GPU discovery (cloud listing) | ~3-5s | Single API call to RunPod |
| GPU auto-discovery + pod creation | ~15s | Tries preferred GPUs in order; each fail ~3-5s |
| Pod EXITED → RUNNING | ~30s | RunPod restarts the container |
| SSH ready after pod start | ~30s | Probed every 5s |
| Bootstrap: venv + vLLM install | 5-10 min | First time only; skipped on restarts (marker file) |
| Bootstrap: model download (HF) | 2-3 min | First time only; cached on network volume (17GB) |
| vLLM model load into GPU | 3-5 min | Every restart; loads 16GB of weights into VRAM |
| CUDA graph compilation | ~1 min | Part of vLLM startup, after weight loading |
| **Total cold start (first ever)** | **~12-18 min** | Volume empty, installs everything |
| **Total warm restart (stopped pod)** | **~4-6 min** | Skip install, just load model |
| Prompt → response (cold, first request) | ~13s | 5 tok/s generation (CUDA graphs not warmed) |
| Prompt → response (warm) | ~2-3s | 30 tok/s generation, 65 tokens |
| Pod stop command | ~2s | Immediate API call |

## Prerequisites

### Required Software (local machine)

- Python 3.11+
- `runpodctl` CLI ([install guide](https://docs.runpod.io/cli/install))
- SSH client (OpenSSH)
- `python-dotenv` (`pip install python-dotenv`)

### Required Accounts & Keys

| Key | Where to get it | What it does |
|-----|-----------------|--------------|
| `RUNPOD_API_KEY` | [RunPod Settings](https://www.runpod.io/console/user/settings) | Authenticates all RunPod API calls |
| `HF_ACCESS_TOKEN` | [Hugging Face Tokens](https://huggingface.co/settings/tokens) | Downloads Cosmos model weights (first time) |

### Configure runpodctl

```bash
runpodctl config --apiKey "rpa_YOUR_KEY_HERE"
# Verify:
runpodctl get cloud
```

The key is stored in `~/.runpod/config.toml`. The script also reads this file as
a fallback when `RUNPOD_API_KEY` is not in the environment.

## Step-by-Step: First-Time Setup

### Step 1: Clone and configure environment

```bash
git clone <repo-url> cosmos-hackathon && cd cosmos-hackathon
cp .env.example .env
```

Edit `.env` and set these two values:

```bash
RUNPOD_API_KEY=rpa_YOUR_KEY_HERE
HF_ACCESS_TOKEN=hf_YOUR_TOKEN_HERE
```

All other values have sensible defaults.

### Step 2: Check available GPUs

```bash
python3 scripts/runpod_cosmos.py cloud
```

Output:
```
GPU                                         MEM VCPU     SPOT ONDEMAND
------------------------------------------------------------------------
NVIDIA A100 80GB PCIe                       117   16   $0.820   $1.390
NVIDIA L40S                                  94   16   $0.260   $0.860
NVIDIA GeForce RTX 4090                      83   16   $0.290   $0.590
...
```

The 8B model needs 24GB+ VRAM. Recommended GPUs (in preference order):

| GPU | VRAM | Price/hr | Notes |
|-----|------|----------|-------|
| A100 80GB | 80GB | $1.39 | Best performance, often unavailable |
| L40S | 48GB | $0.86 | Good balance, usually available |
| L40 | 48GB | $0.99 | Similar to L40S |
| RTX A6000 | 48GB | $0.49 | Budget option |
| RTX 4090 | 24GB | $0.59 | Works but tight on VRAM |

### Step 3: Configure GPU preferences

Edit `configs/runpod-cosmos/config.json`:

```json
{
  "preferred_gpus": [
    "NVIDIA A100 80GB PCIe",
    "NVIDIA A100-SXM4-80GB",
    "NVIDIA L40S",
    "NVIDIA L40",
    "NVIDIA RTX A6000",
    "NVIDIA GeForce RTX 4090"
  ]
}
```

Auto-discovery tries each GPU in order and picks the first available one.

### Step 4: Create a network volume

```bash
python3 scripts/runpod_cosmos.py create-volume \
  --name cosmos-reason2-8b \
  --size 400 \
  --datacenter US-TX-3
```

Output:
```
created volume ugfz2qkt08
  name=cosmos-reason2-8b
  size=400GB
  datacenter=US-TX-3
persisted to configs/runpod-cosmos/config.json
```

The volume persists venv (16GB), model weights (17GB), and all config across pod
restarts. 400GB gives headroom for larger models later.

**Only do this once.** The volume ID is saved to `config.json` automatically.

### Step 5: First ensure + bootstrap

```bash
python3 scripts/runpod_cosmos.py ensure --bootstrap-service --no-stop
```

This does everything:
1. Discovers an available GPU from your preference list (~15s)
2. Creates a new pod with SSH + HTTP ports (~5s)
3. Waits for pod RUNNING + SSH ready (~1 min)
4. Installs Python venv + vLLM on the volume (~5-10 min, first time only)
5. Writes bootstrap marker (`/workspace/cosmos/.bootstrap_done`)
6. Starts vLLM serve in the background
7. Waits for the model to load and API to respond (~3-5 min)
8. Prints `COSMOS_API_BASE` URL

**Expected total time: 12-18 minutes (first run).**

Output:
```
[runpod-cosmos] no pod configured; auto-discovering
[runpod-cosmos] trying GPU: NVIDIA A100 80GB PCIe
[runpod-cosmos] NVIDIA A100 80GB PCIe: failed to create pod
[runpod-cosmos] trying GPU: NVIDIA L40S
[runpod-cosmos] created pod: deo5swo36ex2d3 (NVIDIA L40S)
[runpod-cosmos] pod ready with NVIDIA L40S: deo5swo36ex2d3
[runpod-cosmos] bootstrapping Cosmos service on deo5swo36ex2d3 (checking install state)
[runpod-cosmos] ensuring vLLM serve is running
[runpod-cosmos] waiting for vLLM to load model and become ready (this can take several minutes)
[runpod-cosmos] using SSH API tunnel 127.0.0.1:18899 -> 209.170.80.132:8899
http://127.0.0.1:18899/v1
```

### Step 6: Verify with a prompt

```bash
python3 scripts/runpod_cosmos.py prompt \
  --message "Hello, what can you do?" \
  --bootstrap-service \
  --no-stop
```

Expected response (~2-3s warm):
```
I'm Qwen, a large-scale language model independently developed by Alibaba Group.
I can answer questions, create text such as stories or official documents, and
even perform logical reasoning.
```

(Cosmos Reason2-8B is based on Qwen3-VL architecture.)

### Step 7: Stop the pod

```bash
python3 scripts/runpod_cosmos.py stop
```

```
[runpod-cosmos] stopped deo5swo36ex2d3
```

The pod enters EXITED state. **You stop paying for GPU time**, but the network
volume ($0.07/GB/month) keeps your venv + model cached.

## Daily Usage

### Start session

```bash
# Start pod + bootstrap + wait for API, export URL
eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)
echo $COSMOS_API_BASE
# → http://127.0.0.1:18899/v1
```

**Time: ~4-6 minutes** (restarting stopped pod, model already cached).

### Send prompts

```bash
# Via script
python3 scripts/runpod_cosmos.py prompt \
  --message "Describe what you see in this room." \
  --bootstrap-service --no-stop

# Via curl (using exported COSMOS_API_BASE)
curl "$COSMOS_API_BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/Cosmos-Reason2-8B",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello"}
    ],
    "max_tokens": 256
  }'

# Get raw JSON response
python3 scripts/runpod_cosmos.py prompt \
  --message "What are your capabilities?" \
  --raw-json --no-stop --bootstrap-service
```

### Check status

```bash
python3 scripts/runpod_cosmos.py status
```

```
ID: deo5swo36ex2d3
NAME: cosmos-reason2-8b
GPU: 1 L40S
STATUS: RUNNING
VCPU: 16
MEM: 62
LOCATION: US
```

### End session

```bash
python3 scripts/runpod_cosmos.py stop
```

Or let auto-stop handle it (default: 60 minutes after last `ensure`/`prompt`).

## Command Reference

### ensure

The primary command. Ensures a pod is running, optionally bootstraps vLLM, and
prints the API base URL.

```bash
python3 scripts/runpod_cosmos.py ensure [OPTIONS]
```

| Flag | Description |
|------|-------------|
| `--bootstrap-service` | Install venv + vLLM if needed, start serving |
| `--export` | Print `export COSMOS_API_BASE="..."` for `eval` |
| `--pod-id ID` | Use specific pod instead of config/auto-discovery |
| `--warm-minutes N` | Auto-stop after N minutes (default: 60) |
| `--no-stop` | Disable auto-stop timer |

**Without `--bootstrap-service`:** Only verifies SSH connectivity, prints `host port`.
**With `--bootstrap-service`:** Full lifecycle — install, start vLLM, wait for API.

### prompt

Send a chat completion request. Automatically starts the pod if needed.

```bash
python3 scripts/runpod_cosmos.py prompt --message "TEXT" [OPTIONS]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--message TEXT` | (required) | User prompt text |
| `--bootstrap-service` | off | Start vLLM if API unavailable |
| `--model NAME` | env `COSMOS_MODEL` | Override model name |
| `--max-tokens N` | env `COSMOS_MAX_TOKENS` | Max response tokens |
| `--temperature F` | 0.2 | Sampling temperature |
| `--system-prompt TEXT` | "You are a helpful assistant." | System prompt |
| `--raw-json` | off | Print full API response JSON |
| `--no-stop` | off | Disable auto-stop timer |

### cloud

List available GPUs with pricing.

```bash
python3 scripts/runpod_cosmos.py cloud
```

### status

Show pod details.

```bash
python3 scripts/runpod_cosmos.py status [--pod-id ID]
```

### stop / start

```bash
python3 scripts/runpod_cosmos.py stop [--pod-id ID]
python3 scripts/runpod_cosmos.py start [--pod-id ID] [--warm-minutes N] [--no-stop]
```

`start` only brings up SSH; use `ensure --bootstrap-service` for full API readiness.

### api-base

Print `COSMOS_API_BASE` for the configured provider.

```bash
python3 scripts/runpod_cosmos.py api-base --ensure --bootstrap-service [--export]
```

### create-volume

Create a RunPod network volume (one-time).

```bash
python3 scripts/runpod_cosmos.py create-volume \
  --name cosmos-reason2-8b \
  --size 400 \
  --datacenter US-TX-3
```

### ssh-endpoint

Print SSH host and port for the pod (useful for manual debugging).

```bash
python3 scripts/runpod_cosmos.py ssh-endpoint
# → 209.170.80.132 20062
ssh -p 20062 root@209.170.80.132
```

## How It Works (Architecture)

### Files on the pod (`/workspace/` — network volume)

```
/workspace/
├── cosmos/
│   ├── .venv/              # Python venv with vLLM (16GB)
│   ├── .bootstrap_done     # Marker: skip reinstall on restart
│   ├── vllm.log            # vLLM server log
│   ├── vllm.pid            # PID of running vLLM process
│   └── pip-install.log     # pip install output
└── cache/
    └── huggingface/        # HF model cache (17GB)
```

Everything under `/workspace/` survives pod stop/start because it's a network
volume mount. Container disk (`/root`, `/tmp`, etc.) is ephemeral.

### Bootstrap flow

```
ensure --bootstrap-service
  │
  ├─ Pod not running? → Start it (or auto-discover a new one)
  ├─ Wait for RUNNING + SSH ready
  │
  ├─ Phase 1: Install (idempotent)
  │   ├─ /workspace/cosmos/.bootstrap_done exists? → SKIP
  │   └─ Missing? → Create venv, pip install vLLM, touch marker
  │
  ├─ Phase 2: Serve (idempotent)
  │   ├─ /workspace/cosmos/vllm.pid alive? → SKIP
  │   └─ Not running? → setsid vllm serve ... & disown
  │
  └─ Wait for API ready (GET /v1/models returns 200)
      └─ Falls back to SSH tunnel if public HTTP port unavailable
```

### API access methods

The script tries two methods to reach the vLLM API:

1. **Public HTTP port** — RunPod maps container port 8899 to a public IP:port.
   Fastest, but RunPod sometimes only exposes it as "private" (`prv`).

2. **SSH tunnel fallback** — Opens `ssh -N -L 127.0.0.1:18899:127.0.0.1:8899`
   through the pod's SSH port. Always works if SSH is up. The tunnel process runs
   in the background and is tracked in `logs/runpod-cosmos/api-tunnel-<pod>.json`.

### Auto-stop scheduling

When `--warm-minutes N` is set (default: 60), the script spawns a background
process that sleeps for N minutes, then stops the pod if it's still the active
one in config. This prevents forgotten pods from burning money.

Use `--no-stop` to disable for long-running sessions.

## Configuration Files

### `.env` (project root)

Main environment configuration. Auto-loaded by the script via `python-dotenv`.

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNPOD_API_KEY` | (required) | RunPod API key |
| `HF_ACCESS_TOKEN` | (required for bootstrap) | Hugging Face token |
| `COSMOS_MODEL` | `nvidia/Cosmos-Reason2-8B` | Model to serve |
| `COSMOS_MAX_MODEL_LEN` | `32768` | vLLM max context length |
| `COSMOS_MAX_TOKENS` | `1024` | Default max response tokens |
| `COSMOS_API_KEY` | `EMPTY` | API key for vLLM (not needed for self-hosted) |
| `RUNPOD_COSMOS_DEFAULT_WARM_MINUTES` | `60` | Auto-stop timer |
| `RUNPOD_COSMOS_LOCAL_TUNNEL_PORT` | `18899` | Local port for SSH tunnel |
| `RUNPOD_COSMOS_BOOTSTRAP_TIMEOUT_SECONDS` | `1800` | Max time for bootstrap SSH |
| `RUNPOD_COSMOS_PROMPT_TIMEOUT_SECONDS` | `120` | HTTP timeout for prompts |
| `RUNPOD_SSH_USER` | `root` | SSH user on the pod |

### `configs/runpod-cosmos/config.json`

Persistent state managed by the script.

| Key | Description |
|-----|-------------|
| `network_volume_id` | RunPod volume ID (set by `create-volume`) |
| `runpod_pod_id` | Current pod ID (auto-updated) |
| `preferred_gpus` | GPU preference order for auto-discovery |
| `pod_template` | Container image, disk, ports, name |

### `~/.runpod/config.toml`

runpodctl CLI config. Fallback source for `RUNPOD_API_KEY`.

```toml
apikey = "rpa_YOUR_KEY"
apiurl = "https://api.runpod.io/graphql"
```

## FAQ

### "auto-discovery failed: no preferred GPU could start a pod"

**Cause:** None of the GPUs in your `preferred_gpus` list are available in the
datacenter where your volume is located.

**Fix:**
1. Run `python3 scripts/runpod_cosmos.py cloud` to see what's available
2. Add available GPUs to `preferred_gpus` in `configs/runpod-cosmos/config.json`
3. Any GPU with 24GB+ VRAM works: L40S, L40, RTX A6000, RTX 4090, H100
4. If nothing is available in your datacenter, you may need to create a volume
   in a different region (`--datacenter EU-RO-1`, `US-OR-1`, etc.)

### "SSH endpoint not ready" / SSH operations time out

**Cause:** On macOS, the SSH agent socket may not be available outside a login shell.

**Fix:** The script auto-detects macOS and runs `launchctl getenv SSH_AUTH_SOCK`
to find the socket. If you still have issues:

```bash
# Verify SSH agent is running
ssh-add -l

# If no identities, add your key
ssh-add ~/.ssh/id_ed25519

# Manual fix for non-login shells
export SSH_AUTH_SOCK=$(launchctl getenv SSH_AUTH_SOCK)
```

### "runpodctl returned empty output during pod creation"

**Cause:** RunPod returned an error without a parseable pod ID. Usually means the
requested GPU type has no available instances in the secure cloud.

**What happens:** The script catches this, skips that GPU, and tries the next one
in your `preferred_gpus` list. Not a fatal error unless all GPUs fail.

### "COSMOS_API_BASE not available yet"

**Cause:** The vLLM server hasn't finished loading the model into GPU memory.
This takes 3-5 minutes after pod restart.

**Fix:**
1. Wait and retry: `python3 scripts/runpod_cosmos.py ensure --bootstrap-service`
2. Check vLLM log: `ssh -p PORT root@HOST "tail -20 /workspace/cosmos/vllm.log"`
3. Look for `Application startup complete.` in the log — that means the API is ready

### "HF_ACCESS_TOKEN (or HF_TOKEN) is required"

**Cause:** First-time bootstrap needs to download the model from Hugging Face.

**Fix:** Set `HF_ACCESS_TOKEN` in `.env`:
```bash
HF_ACCESS_TOKEN=hf_YOUR_TOKEN_HERE
```

Get a token at https://huggingface.co/settings/tokens (read access is sufficient).

After the first download, model weights are cached on the network volume. You can
set `HF_HUB_OFFLINE=1` to skip token validation on subsequent runs.

### Bootstrap runs every time even though marker exists

**Cause:** If you see "no bootstrap marker — installing venv + vLLM" on every
restart, the marker file was lost.

**Possible reasons:**
- You created a new pod without the network volume attached
- The volume was deleted or recreated
- Someone manually deleted `/workspace/cosmos/.bootstrap_done`

**Fix:** The install is idempotent — it checks for existing venv and vLLM before
reinstalling. Even without the marker, it only adds ~30s if everything is cached.

### vLLM process dies after SSH disconnects

**Cause:** Background processes can be killed by SIGHUP when the SSH session ends.

**Fix:** The script uses `setsid` + `disown` to fully detach vLLM from the SSH
session. If you're starting vLLM manually, use:

```bash
setsid /workspace/cosmos/.venv/bin/vllm serve nvidia/Cosmos-Reason2-8B \
  --max-model-len 32768 --reasoning-parser qwen3 --trust-remote-code \
  --dtype auto --gpu-memory-utilization 0.90 --host 0.0.0.0 --port 8899 \
  >/workspace/cosmos/vllm.log 2>&1 < /dev/null &
disown $!
```

### "statuscode 401" / "statuscode 503" from runpodctl

**Cause:**
- **401**: Invalid or expired RunPod API key
- **503**: Transient RunPod API issue (usually resolves in seconds)

**Fix for 401:**
```bash
# Check your key works
runpodctl get pod
# If it fails, reconfigure
runpodctl config --apiKey "rpa_YOUR_NEW_KEY"
# Also update .env
```

**Fix for 503:** Just retry. The script handles transient 503s during normal flow.

### "http.client.BadStatusLine: SSH-2.0-OpenSSH"

**Cause:** The script probed an SSH port with an HTTP request (happens during
auto-discovery when RunPod's port mapping is ambiguous).

**Fix:** Already handled in the code. The `_api_is_ready` function catches all
non-HTTP responses gracefully. If you see this as an unhandled exception, update
to the latest version of the script.

### How to SSH into the pod manually

```bash
# Get SSH endpoint
python3 scripts/runpod_cosmos.py ssh-endpoint
# → 209.170.80.132 20062

# Connect
ssh -p 20062 root@209.170.80.132

# Check vLLM status
tail -20 /workspace/cosmos/vllm.log
cat /workspace/cosmos/vllm.pid
kill -0 $(cat /workspace/cosmos/vllm.pid) && echo "running" || echo "stopped"
```

### How to see real-time vLLM logs

```bash
HOST_PORT=$(python3 scripts/runpod_cosmos.py ssh-endpoint)
HOST=$(echo $HOST_PORT | cut -d' ' -f1)
PORT=$(echo $HOST_PORT | cut -d' ' -f2)
ssh -p $PORT root@$HOST "tail -f /workspace/cosmos/vllm.log"
```

### How to restart vLLM without restarting the pod

```bash
ssh -p PORT root@HOST "
  kill \$(cat /workspace/cosmos/vllm.pid) 2>/dev/null
  rm -f /workspace/cosmos/vllm.pid
"
# Then re-bootstrap:
python3 scripts/runpod_cosmos.py ensure --bootstrap-service --no-stop
```

### How to force a fresh install (nuke the marker)

```bash
ssh -p PORT root@HOST "rm -f /workspace/cosmos/.bootstrap_done"
python3 scripts/runpod_cosmos.py ensure --bootstrap-service --no-stop
```

### How much does this cost?

| Item | Cost | Notes |
|------|------|-------|
| GPU (L40S, on-demand) | $0.86/hr | Only while pod is RUNNING |
| GPU (L40S, spot) | $0.26/hr | Cheaper but can be preempted |
| Network volume (400GB) | $28/mo | Always on, stores venv + model |
| **Typical daily use** (4 hrs) | **~$3.50/day** | L40S on-demand + volume |

Auto-stop at 60 minutes prevents forgotten pods. Use `--no-stop` only for
active sessions.

## Lifecycle Diagram

```
                    ┌─────────────────────────────────────────┐
                    │            ensure --bootstrap-service    │
                    └─────────┬───────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Pod ID in config?  │
                    └──┬──────────┬─────┘
                       │ yes      │ no
                       │          │
              ┌────────▼──┐  ┌───▼──────────────┐
              │ Get status │  │ Auto-discover GPU │ ──► create pod
              └──┬────────┘  └───────┬──────────┘
                 │                   │
        ┌────────▼────────┐         │
        │ RUNNING? EXITED? │        │
        └──┬──────────┬───┘        │
           │ RUNNING   │ EXITED    │
           │           │           │
           │    ┌──────▼────┐      │
           │    │ start pod │      │
           │    └──────┬────┘      │
           │           │           │
           ├───────────┴───────────┤
           │                       │
  ┌────────▼────────┐             │
  │ Wait SSH ready   │◄────────────┘
  └────────┬────────┘
           │
  ┌────────▼────────────────────────┐
  │ Phase 1: Install (if no marker) │
  │ • venv + pip install vLLM       │
  │ • touch .bootstrap_done         │
  └────────┬────────────────────────┘
           │
  ┌────────▼────────────────────────┐
  │ Phase 2: Serve (if PID dead)    │
  │ • setsid vllm serve ... &       │
  │ • disown, write vllm.pid        │
  └────────┬────────────────────────┘
           │
  ┌────────▼────────────────┐
  │ Wait for API ready      │
  │ GET /v1/models → 200    │
  │ (up to 10 min timeout)  │
  └────────┬────────────────┘
           │
  ┌────────▼────────────────┐
  │ Print COSMOS_API_BASE   │
  │ Schedule auto-stop      │
  └─────────────────────────┘
```

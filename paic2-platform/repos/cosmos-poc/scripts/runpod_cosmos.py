#!/usr/bin/env python3
"""RunPod Cosmos helper: discovery, lifecycle management, and warm-stop handling."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# macOS: ensure SSH agent socket is available outside login shells.
# Without this, SSH operations silently fail when run outside a login shell
# (e.g. from launchd, cron, or IDE terminals).
if sys.platform == "darwin" and not os.environ.get("SSH_AUTH_SOCK"):
    try:
        _ssh_sock_result = subprocess.run(
            ["launchctl", "getenv", "SSH_AUTH_SOCK"],
            capture_output=True, text=True, timeout=5,
        )
        _ssh_sock = _ssh_sock_result.stdout.strip()
        if _ssh_sock:
            os.environ["SSH_AUTH_SOCK"] = _ssh_sock
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent

try:
    from dotenv import load_dotenv
    load_dotenv(_REPO_ROOT / ".env")
except ImportError:
    pass
_CONFIG_PATH = _REPO_ROOT / "configs" / "runpod-cosmos" / "config.json"
_DEFAULT_PREFERENCES = [
    "NVIDIA A100 80GB PCIe",
    "NVIDIA A100-SXM4-80GB",
    "NVIDIA H100",
]
_DEFAULT_TEMPLATE = {
    "image_name": "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
    "container_disk_gb": 100,
    "volume_path": "/workspace",
    "ports": ["22/tcp", "8899/http"],
    "name": "cosmos-reason2-8b",
}
_DEFAULT_CONTAINER_START_ARGS = ["--startSSH"]
_POD_TIMEOUT_SECONDS = 180
_SSH_WAIT_SECONDS = 120
_API_WAIT_SECONDS = 120
_API_HOST_OVERRIDE_ENV = "RUNPOD_COSMOS_API_HOST"
_API_PORT_OVERRIDE_ENV = "RUNPOD_COSMOS_API_PORT"
_SSH_USER = os.getenv("RUNPOD_SSH_USER", "root")
_LOCAL_TUNNEL_PORT_BASE = int(os.getenv("RUNPOD_COSMOS_LOCAL_TUNNEL_PORT", "18899") or "18899")
_PROMPT_TIMEOUT_SECONDS = int(os.getenv("RUNPOD_COSMOS_PROMPT_TIMEOUT_SECONDS", "120") or "120")
_BOOTSTRAP_TIMEOUT_SECONDS = int(os.getenv("RUNPOD_COSMOS_BOOTSTRAP_TIMEOUT_SECONDS", "1800") or "1800")
_BOOTSTRAP_MARKER = "/workspace/cosmos/.bootstrap_done"

@dataclass(frozen=True)
class GpuInfo:
    gpu_type: str
    mem_gb: int
    vcpu: int
    spot_price: float | None
    on_demand_price: float | None


@dataclass(frozen=True)
class PodPort:
    host: str
    host_port: int
    container_port: int
    visibility: str
    protocol: str


def _api_override() -> tuple[str, int] | None:
    host = os.getenv(_API_HOST_OVERRIDE_ENV) or _cfg_value("runpod_api_host", None)
    port = os.getenv(_API_PORT_OVERRIDE_ENV) or _cfg_value("runpod_api_port", None)
    if host is None and port is None:
        return None
    if not host or not port:
        _die(
            f"{_API_HOST_OVERRIDE_ENV} and {_API_PORT_OVERRIDE_ENV} "
            "must be set together"
        )
    return host, int(port)


def _normalize_ws(value: str) -> str:
    return value.replace("\u00a0", " ").strip()


def _log(message: str) -> None:
    print(f"[runpod-cosmos] {message}")


def _die(message: str, code: int = 1) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(code)


def _run(
    cmd: list[str],
    *,
    capture: bool = True,
    check: bool = True,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            text=True,
            capture_output=capture,
            check=check,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        _die(f"command not found: {cmd[0]}")
    except subprocess.TimeoutExpired as exc:
        _die(f"command timeout ({timeout}s): {' '.join(cmd)}", code=exc.returncode or 1)
    except subprocess.CalledProcessError as exc:
        if check:
            output = ((exc.stdout or "") + (exc.stderr or "")).strip()
            _die(f"command failed: {' '.join(cmd)}\n{output}")
        fallback = subprocess.CompletedProcess(cmd, exc.returncode, exc.stdout or "", exc.stderr or "")
        return fallback
    raise SystemExit(1)


def _runpodctl(
    args: list[str],
    *,
    capture: bool = True,
    check: bool = True,
    timeout: int | None = None,
) -> str:
    proc = _run(["runpodctl", *args], capture=capture, check=check, timeout=timeout)
    return proc.stdout if proc.stdout is not None else ""


def _load_config() -> dict:
    if not _CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _die(f"failed to load {_CONFIG_PATH}: {exc}")


def _write_config(cfg: dict) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(
        json.dumps(cfg, indent=2) + "\n",
        encoding="utf-8",
    )


def _cfg_value(key: str, default):
    cfg = _load_config()
    return cfg.get(key, default)


def _cfg_set_values(**values: object) -> None:
    cfg = _load_config()
    cfg.update({k: v for k, v in values.items() if v is not None})
    _write_config(cfg)


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _find_free_local_port(start: int) -> int:
    for candidate in range(start, start + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", candidate))
                return candidate
            except OSError:
                continue
    _die(f"unable to find free local tunnel port starting at {start}")
    return start


def _preferred_gpus() -> list[str]:
    return _cfg_value("preferred_gpus", _DEFAULT_PREFERENCES)


def _pod_template() -> dict:
    cfg = _cfg_value("pod_template", {})
    merged = dict(_DEFAULT_TEMPLATE)
    merged.update(cfg or {})
    return merged


def _pod_id_from_config() -> str | None:
    return os.getenv("RUNPOD_POD_ID", None) or _cfg_value("runpod_pod_id", None)


def _network_volume_id() -> str | None:
    return _cfg_value("network_volume_id", None)


def _log_dir() -> Path:
    env_dir = os.getenv("RUNPOD_COSMOS_LOG_DIR")
    cfg_dir = _cfg_value("log_dir", None)
    path = env_dir or cfg_dir or "logs/runpod-cosmos"
    return _REPO_ROOT / path


def _normalize_api_base(raw_base: str) -> str:
    if not raw_base:
        _die("invalid empty API base")
    value = raw_base.strip().strip('"').strip("'")
    value = value.rstrip("/")
    return value if value.endswith("/v1") else f"{value}/v1"


def _cosmos_provider(cli_provider: str | None = None) -> str:
    provider = (cli_provider or os.getenv("COSMOS_PROVIDER", "runpod")).strip().lower()
    if not provider:
        provider = "runpod"
    if provider not in {"runpod", "aws"}:
        _die("COSMOS_PROVIDER must be 'runpod' or 'aws'")
    return provider


def _aws_api_base() -> str:
    aws_base = os.getenv("COSMOS_AWS_API_BASE") or os.getenv("COSMOS_API_BASE")
    if not aws_base:
        _die("AWS provider selected but COSMOS_AWS_API_BASE is not set")
    return _normalize_api_base(aws_base)


def _api_key() -> str:
    if os.getenv("RUNPOD_API_KEY"):
        return os.environ["RUNPOD_API_KEY"]
    toml_path = Path.home() / ".runpod" / "config.toml"
    if toml_path.exists():
        for line in toml_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("apikey"):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    vault_path = Path.home() / ".openclaw" / ".env"
    if vault_path.exists():
        for line in vault_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("RUNPOD_API_KEY="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    _die("RUNPOD_API_KEY not found. Set it in env, .env, or ~/.runpod/config.toml / ~/.openclaw/.env")


def _runpod_graphql(query: str, variables: dict | None = None) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    req = Request(
        "https://api.runpod.io/graphql",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
            "User-Agent": "runpod-cosmos/1.0",
        },
    )
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        _die(f"RunPod GraphQL HTTP {exc.code}: {body}")
    except URLError as exc:
        _die(f"RunPod GraphQL request failed: {exc}")

    if data.get("errors"):
        _die(f"RunPod API returned errors: {json.dumps(data['errors'], indent=2)}")
    return data


def _parse_int(value: str) -> int:
    match = re.search(r"\d+", value or "")
    return int(match.group(0)) if match else 0


def _parse_price(value: str) -> float | None:
    value = _normalize_ws(value)
    if not value or value.lower() == "reserved":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_cloud_output(raw: str) -> list[GpuInfo]:
    lines = [_normalize_ws(l) for l in raw.splitlines() if _normalize_ws(l)]
    if len(lines) <= 1:
        return []

    pending_gpu = None
    pending_cols: list[str] = []
    results: list[GpuInfo] = []

    for line in lines[1:]:
        cols = [_normalize_ws(c) for c in line.split("\t")]
        has_payload = len(cols) >= 4 and any(c for c in cols[1:])

        if has_payload:
            if pending_gpu:
                results.append(_build_gpu_info(pending_gpu, pending_cols))
            gpu_name = cols[0]
            if gpu_name.startswith("1x "):
                gpu_name = gpu_name[3:]
            pending_gpu = gpu_name
            pending_cols = cols[1:]
        elif pending_gpu:
            continuation = _normalize_ws(line)
            if continuation:
                pending_gpu = f"{pending_gpu} {continuation}"

    if pending_gpu:
        results.append(_build_gpu_info(pending_gpu, pending_cols))

    return results


def _build_gpu_info(name: str, cols: list[str]) -> GpuInfo:
    mem_gb = _parse_int(cols[0] if len(cols) > 0 else "")
    vcpu = _parse_int(cols[1] if len(cols) > 1 else "")
    spot = _parse_price(cols[2] if len(cols) > 2 else "")
    on_demand = _parse_price(cols[3] if len(cols) > 3 else "")
    return GpuInfo(
        gpu_type=name,
        mem_gb=mem_gb,
        vcpu=vcpu,
        spot_price=spot,
        on_demand_price=on_demand,
    )


def _get_available_gpus() -> list[GpuInfo]:
    raw = _runpodctl(
        ["get", "cloud", "--secure", "--vcpu", "16", "--mem", "80", "--disk", "200"]
    )
    return [g for g in _parse_cloud_output(raw) if g.on_demand_price is not None]


def _parse_pod_row(raw: str) -> dict[str, str]:
    header, rows = _parse_tsv_table(raw)
    if not header or not rows:
        _die(f"unexpected runpodctl pod output: {raw!r}")
    return {h: _normalize_ws(v) for h, v in zip(header, rows[0])}


def _parse_tsv_table(raw: str) -> tuple[list[str], list[list[str]]]:
    lines = [line for line in raw.splitlines() if _normalize_ws(line)]
    if not lines:
        return [], []

    header = [col.strip() for col in lines[0].split("\t")]
    rows: list[list[str]] = []
    for line in lines[1:]:
        row = [col.strip() for col in line.split("\t")]
        if len(row) > len(header):
            row = row[: len(header) - 1] + ["\t".join(row[len(header) - 1 :])]
        if len(row) != len(header):
            continue
        rows.append([_normalize_ws(v) for v in row])
    return header, rows


def _get_pod_row_optional(pod_id: str) -> dict[str, str] | None:
    raw = _runpodctl(["get", "pod", pod_id, "--allfields"], check=False)
    header, rows = _parse_tsv_table(raw)
    if not header or not rows:
        return None
    return {h: v for h, v in zip(header, rows[0])}


def _list_pod_rows() -> list[dict[str, str]]:
    raw = _runpodctl(["get", "pod", "--allfields"], check=False)
    header, rows = _parse_tsv_table(raw)
    if not header:
        return []
    return [{h: v for h, v in zip(header, row)} for row in rows]


def _get_pod_row(pod_id: str) -> dict[str, str]:
    return _parse_pod_row(_runpodctl(["get", "pod", pod_id, "--allfields"]))


def _get_pod_status(pod_id: str) -> str:
    return _get_pod_row(pod_id).get("STATUS", "UNKNOWN")


def _get_pod_status_optional(pod_id: str) -> str | None:
    row = _get_pod_row_optional(pod_id)
    return row.get("STATUS", None) if row else None


def _parse_ports(raw: str) -> list[PodPort]:
    out: list[PodPort] = []
    pattern = re.compile(
        r"(?P<host>\d+\.\d+\.\d+\.\d+):(?P<host_port>\d+)->(?P<container_port>\d+)\s*\((?P<visibility>[^,]+),(?P<protocol>[a-z0-9]+)\)"
    )
    for match in pattern.finditer(_normalize_ws(raw)):
        out.append(
            PodPort(
                host=match.group("host"),
                host_port=int(match.group("host_port")),
                container_port=int(match.group("container_port")),
                visibility=match.group("visibility"),
                protocol=match.group("protocol"),
            )
        )
    return out


def _graph_ports(pod_id: str) -> list[PodPort]:
    data = _runpod_graphql(
        """
        {
          myself {
            pods {
              id
              runtime {
                ports {
                  ip
                  isIpPublic
                  privatePort
                  publicPort
                  type
                }
              }
            }
          }
        }
        """
    )
    for pod in data.get("data", {}).get("myself", {}).get("pods", []):
        if pod.get("id") != pod_id:
            continue
        out: list[PodPort] = []
        for item in pod.get("runtime", {}).get("ports", []) if isinstance(pod.get("runtime"), dict) else []:
            if not isinstance(item, dict):
                continue
            host = str(item.get("ip", "")).strip()
            if not host:
                continue
            public_port = _parse_int(str(item.get("publicPort", "")))
            private_port = _parse_int(str(item.get("privatePort", "")))
            visibility = "pub" if bool(item.get("isIpPublic")) else "prv"
            protocol = str(item.get("type", "")).strip().lower()
            if not public_port or not private_port or not protocol:
                continue
            out.append(
                PodPort(
                    host=host,
                    host_port=public_port,
                    container_port=private_port,
                    visibility=visibility,
                    protocol=protocol,
                )
            )
        return out
    return []


def _resolve_endpoint(
    pod_id: str,
    *,
    container_port: int,
    protocol: str,
    require_public: bool = True,
    quiet: bool = False,
    label: str = "container",
) -> tuple[str, int]:
    row = _get_pod_row(pod_id)
    ports = _parse_ports(row.get("PORTS", ""))
    for p in ports:
        if (
            p.container_port == container_port
            and p.protocol == protocol
            and (not require_public or p.visibility == "pub")
        ):
            return p.host, p.host_port

    try:
        graph_ports = _graph_ports(pod_id)
    except SystemExit:
        graph_ports = []
    for p in graph_ports:
        if (
            p.container_port == container_port
            and p.protocol == protocol
            and (not require_public or p.visibility == "pub")
        ):
            return p.host, p.host_port

    if quiet:
        raise SystemExit(1)
    _die(
        f"no public {label} port mapping found for pod {pod_id} "
        f"(need container {container_port}/{protocol}). "
        "Set both RUNPOD_COSMOS_API_HOST and RUNPOD_COSMOS_API_PORT if auto-discovery fails."
    )
    return "", 0


def _resolve_ssh_endpoint(pod_id: str, *, quiet: bool = False) -> tuple[str, int]:
    return _resolve_endpoint(
        pod_id,
        container_port=22,
        protocol="tcp",
        require_public=True,
        quiet=quiet,
        label="ssh",
    )


def _resolve_api_endpoint(pod_id: str, *, quiet: bool = False) -> tuple[str, int]:
    if override := _api_override():
        return override
    return _resolve_endpoint(
        pod_id,
        container_port=8899,
        protocol="http",
        require_public=True,
        quiet=quiet,
        label="api",
    )


def _api_is_ready(base_url: str, *, timeout: int = 6) -> bool:
    req = Request(f"{base_url}/models")
    try:
        with urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except HTTPError as exc:
        return exc.code in {401, 403}
    except URLError:
        return False
    except (OSError, ValueError):
        return False
    except Exception:
        # Catches BadStatusLine (SSH port probed via HTTP) and similar
        return False


def _wait_for_api_base(
    pod_id: str,
    timeout: int = _API_WAIT_SECONDS,
) -> tuple[str, int] | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = _get_pod_status(pod_id)
        if status == "RUNNING":
            try:
                host, port = _resolve_api_endpoint(pod_id, quiet=True)
                base = _normalize_api_base(f"http://{host}:{port}")
                if _api_is_ready(base):
                    return host, port
            except SystemExit:
                pass
        elif status in {"EXITED", "TERMINATED", "ERROR", "FAILED"}:
            return None
        time.sleep(5)
    return None


def _wait_for_live_api_base(pod_id: str, timeout: int = _API_WAIT_SECONDS) -> str | None:
    endpoint = _wait_for_api_base(pod_id, timeout=timeout)
    if endpoint:
        host, port = endpoint
        return _normalize_api_base(f"http://{host}:{port}")
    return _wait_for_api_via_tunnel(pod_id, timeout=max(20, min(timeout, 60)))


def _bootstrap_cosmos_service(
    pod_id: str,
    *,
    model: str,
    max_model_len: int,
    gpu_memory_utilization: float = 0.90,
) -> None:
    endpoint = _wait_for_ssh_endpoint(pod_id)
    if not endpoint:
        _die(f"{pod_id}: SSH endpoint not ready; cannot bootstrap Cosmos service")
    host, ssh_port = endpoint

    hf_token = os.getenv("HF_ACCESS_TOKEN") or os.getenv("HF_TOKEN")
    if not hf_token:
        _die("HF_ACCESS_TOKEN (or HF_TOKEN) is required to bootstrap Cosmos model download")

    # Phase 1: Install venv + vLLM if marker is missing (idempotent).
    # Skips the 5-10 min pip install on restarts when the volume already has
    # everything from a previous bootstrap.
    install_cmd = (
        "set -euo pipefail; "
        "mkdir -p /workspace/cosmos /workspace/cache/huggingface; "
        f"if [ -f {_BOOTSTRAP_MARKER} ]; then "
        "  echo 'bootstrap marker found — skipping install'; "
        "else "
        "  echo 'no bootstrap marker — installing venv + vLLM'; "
        "  if [ ! -x /workspace/cosmos/.venv/bin/python ]; then python3 -m venv /workspace/cosmos/.venv; fi; "
        "  source /workspace/cosmos/.venv/bin/activate; "
        "  python -m pip install --upgrade pip >/workspace/cosmos/pip-install.log 2>&1; "
        "  python -c 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec(\"vllm\") else 1)' "
        "  || python -m pip install vllm >>/workspace/cosmos/pip-install.log 2>&1; "
        f"  touch {_BOOTSTRAP_MARKER}; "
        "fi"
    )
    _log(f"bootstrapping Cosmos service on {pod_id} (checking install state)")
    _ssh_exec(
        host,
        ssh_port,
        f"bash -lc {shlex.quote(install_cmd)}",
        capture=True,
        check=True,
        timeout=_BOOTSTRAP_TIMEOUT_SECONDS,
    )

    # Phase 2: Start vLLM serve if not already running.
    # Uses setsid + disown to fully detach from SSH session so the process
    # survives after the SSH connection closes.  Avoid `set -e` here because
    # background-job management is incompatible with errexit.
    # NOTE: We check the PID file instead of `pgrep -f` because pgrep would
    # match the parent bash -c process (whose cmdline contains "vllm serve").
    serve_cmd = (
        "VLLM_RUNNING=false; "
        "if [ -f /workspace/cosmos/vllm.pid ]; then "
        "  OLD_PID=$(cat /workspace/cosmos/vllm.pid); "
        "  if kill -0 $OLD_PID 2>/dev/null; then VLLM_RUNNING=true; fi; "
        "fi; "
        "if $VLLM_RUNNING; then "
        "  echo \"vLLM already running (pid $OLD_PID)\"; "
        "else "
        f"  export HF_TOKEN={shlex.quote(hf_token)}; "
        "  export HF_HOME=/workspace/cache/huggingface; "
        "  export HUGGINGFACE_HUB_CACHE=/workspace/cache/huggingface; "
        "  setsid /workspace/cosmos/.venv/bin/vllm serve "
        f"  {shlex.quote(model)} "
        f"  --max-model-len {max_model_len} "
        "  --reasoning-parser qwen3 "
        "  --trust-remote-code "
        "  --dtype auto "
        f"  --gpu-memory-utilization {gpu_memory_utilization:.2f} "
        "  --host 0.0.0.0 "
        "  --port 8899 "
        "  >/workspace/cosmos/vllm.log 2>&1 < /dev/null & "
        "  VLLM_PID=$!; "
        "  echo $VLLM_PID >/workspace/cosmos/vllm.pid; "
        "  disown $VLLM_PID 2>/dev/null || true; "
        "  sleep 2; "
        "  if kill -0 $VLLM_PID 2>/dev/null; then "
        "    echo \"vLLM serve started (pid $VLLM_PID)\"; "
        "  else "
        "    echo 'vLLM failed to start — check /workspace/cosmos/vllm.log' >&2; "
        "    exit 1; "
        "  fi; "
        "fi"
    )
    _log("ensuring vLLM serve is running")
    _ssh_exec(
        host,
        ssh_port,
        f"bash -c {shlex.quote(serve_cmd)}",
        capture=True,
        check=True,
        timeout=60,
    )


def _chat_completion(
    base_url: str,
    *,
    model: str,
    message: str,
    system_prompt: str | None,
    max_tokens: int,
    temperature: float,
    timeout: int = _PROMPT_TIMEOUT_SECONDS,
) -> dict:
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.getenv('COSMOS_API_KEY', 'EMPTY')}",
        },
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        _die(f"chat/completions HTTP {exc.code}: {body}")
    except URLError as exc:
        _die(f"chat/completions request failed: {exc}")
    return {}


def _runpod_api_base(
    pod_id: str,
    *,
    ensure_running: bool,
    warm_minutes: int | None,
    no_stop: bool,
    bootstrap_service: bool = False,
) -> str:
    status_opt = _get_pod_status_optional(pod_id)
    if status_opt is None:
        _log(f"{pod_id}: not found, auto-discovering")
        pod_id = _auto_discover_pod()
        status_opt = _get_pod_status_optional(pod_id)

    if ensure_running:
        status = status_opt or "UNKNOWN"
        if status in {"EXITED", "TERMINATED", "ERROR", "FAILED"}:
            _log(f"{pod_id}: {status}, starting")
            _start_pod(pod_id)
        elif status not in {"RUNNING", "STARTING", "PROVISIONING", "RESTARTING"}:
            _start_pod(pod_id)

        if not _wait_for_running(pod_id):
            if _network_volume_id():
                _log(f"{pod_id} failed to reach RUNNING, attempting pod failover")
                _remove_pod(pod_id)
                pod_id = _auto_discover_pod()
            else:
                _die(
                    f"{pod_id} failed to reach RUNNING and auto-discovery is unavailable "
                    "(network_volume_id missing)"
                )

        base = _wait_for_live_api_base(pod_id)
        if not base and bootstrap_service:
            model = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
            max_len = int(os.getenv("COSMOS_MAX_MODEL_LEN", "32768"))
            _bootstrap_cosmos_service(
                pod_id,
                model=model,
                max_model_len=max_len,
            )
            base = _wait_for_live_api_base(pod_id, timeout=max(_API_WAIT_SECONDS, 240))
        if not base:
            if _network_volume_id():
                _log(f"{pod_id} has no usable API endpoint, attempting pod failover")
                _remove_pod(pod_id)
                pod_id = _auto_discover_pod()
                base = _wait_for_live_api_base(pod_id)
            if not base:
                _die(
                    f"{pod_id} has no usable API endpoint. "
                    "If the pod only exposes SSH, run with --bootstrap-service to start vLLM."
                )
        _maybe_schedule_stop(pod_id, warm_minutes, no_stop)
        _cfg_set_values(runpod_pod_id=pod_id)
        return base

    base = _wait_for_live_api_base(pod_id)
    if not base:
        status = _get_pod_status_optional(pod_id)
        if status != "RUNNING":
            _die(
                f"{pod_id} is not RUNNING (status={status or 'MISSING'}). "
                "Use --ensure to start/wake it first."
            )
        _die(f"{pod_id} is running but has no usable API endpoint yet")
    return base


def _resolved_api_base(args: argparse.Namespace) -> str:
    provider = _cosmos_provider(args.provider)
    if provider == "aws":
        return _aws_api_base()

    pod_id = args.pod_id or _pod_id_from_config()
    if not pod_id:
        _log("no RUNPOD_POD_ID configured; auto-discovering")
        pod_id = _auto_discover_pod()
    return _runpod_api_base(
        pod_id,
        ensure_running=args.ensure,
        warm_minutes=args.warm_minutes,
        no_stop=args.no_stop,
        bootstrap_service=getattr(args, "bootstrap_service", False),
    )


def _extract_pod_id_from_create_output(raw: str) -> str:
    for line in reversed(_normalize_ws(raw).splitlines()[::-1]):
        match = re.search(r"\b[a-z0-9]{10,}\b", line)
        if match:
            return match.group(0)
    _die(f"unable to parse pod id from create output: {raw!r}")


def _create_pod(gpu_type: str) -> str:
    template = _pod_template()
    if not _network_volume_id():
        _die("no network_volume_id set in config.json; run create-volume first")

    args = [
        "create", "pod",
        "--gpuType", gpu_type,
        "--imageName", template.get("image_name", _DEFAULT_TEMPLATE["image_name"]),
        "--containerDiskSize", str(template.get("container_disk_gb", _DEFAULT_TEMPLATE["container_disk_gb"])),
        "--volumePath", str(template.get("volume_path", _DEFAULT_TEMPLATE["volume_path"])),
        "--name", str(template.get("name", _DEFAULT_TEMPLATE["name"])),
    ]
    args.extend(_DEFAULT_CONTAINER_START_ARGS)
    args.append("--secureCloud")
    args.extend(["--networkVolumeId", _network_volume_id()])
    for port in template.get("ports", ["22/tcp", "8899/http"]):
        args.extend(["--ports", str(port)])

    out = _runpodctl(args, capture=True, check=False) or ""
    if not out.strip():
        _die("runpodctl returned empty output during pod creation")

    pod_id = _extract_pod_id_from_create_output(out)
    _cfg_set_values(runpod_pod_id=pod_id)
    _log(f"created pod: {pod_id} ({gpu_type})")
    return pod_id


def _remove_pod(pod_id: str) -> None:
    _log(f"removing pod {pod_id}")
    _runpodctl(["remove", "pod", pod_id], check=False)


def _start_pod(pod_id: str) -> None:
    _runpodctl(["start", "pod", pod_id], check=False)


def _stop_pod(pod_id: str) -> None:
    _runpodctl(["stop", "pod", pod_id], check=False)


def _is_running_or_healthy(pod_id: str) -> bool:
    status = _get_pod_status(pod_id)
    return status == "RUNNING"


def _wait_for_running(pod_id: str, timeout: int = _POD_TIMEOUT_SECONDS, interval: int = 5) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _is_running_or_healthy(pod_id):
            return True
        status = _get_pod_status(pod_id)
        if status in {"EXITED", "TERMINATED", "ERROR", "FAILED"}:
            return False
        time.sleep(interval)
    return False


def _probe_ssh(host: str, port: int) -> bool:
    proc = _run(
        [
            "ssh",
            "-p", str(port),
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=5",
            f"root@{host}",
            "echo OK",
        ],
        capture=True,
        check=False,
        timeout=15,
    )
    return proc.returncode == 0


def _ssh_cmd(host: str, port: int, remote_cmd: str) -> list[str]:
    return [
        "ssh",
        "-p",
        str(port),
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        f"{_SSH_USER}@{host}",
        remote_cmd,
    ]


def _ssh_exec(
    host: str,
    port: int,
    remote_cmd: str,
    *,
    capture: bool = True,
    check: bool = True,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    return _run(
        _ssh_cmd(host, port, remote_cmd),
        capture=capture,
        check=check,
        timeout=timeout,
    )


def _tunnel_meta_path(pod_id: str) -> Path:
    return _log_dir() / f"api-tunnel-{pod_id}.json"


def _load_tunnel_meta(pod_id: str) -> dict | None:
    path = _tunnel_meta_path(pod_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_tunnel_meta(pod_id: str, *, pid: int, local_port: int, remote_port: int, host: str, ssh_port: int) -> None:
    path = _tunnel_meta_path(pod_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "pid": pid,
                "local_port": local_port,
                "remote_port": remote_port,
                "host": host,
                "ssh_port": ssh_port,
                "updated_at": int(time.time()),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def _candidate_api_container_ports(pod_id: str) -> list[int]:
    ports: list[int] = [8899]
    row = _get_pod_row_optional(pod_id)
    if row:
        for p in _parse_ports(row.get("PORTS", "")):
            if p.protocol in {"http", "tcp"}:
                ports.append(p.container_port)
    try:
        for p in _graph_ports(pod_id):
            if p.protocol in {"http", "tcp"}:
                ports.append(p.container_port)
    except SystemExit:
        pass
    dedup: list[int] = []
    for p in ports:
        if p > 0 and p not in dedup:
            dedup.append(p)
    return dedup


def _start_ssh_tunnel(
    pod_id: str,
    *,
    host: str,
    ssh_port: int,
    remote_port: int,
    local_port: int,
) -> int | None:
    log_dir = _log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"api-tunnel-{pod_id}-{remote_port}-{local_port}.log"
    with log_path.open("a", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [
                "ssh",
                "-N",
                "-L",
                f"127.0.0.1:{local_port}:127.0.0.1:{remote_port}",
                "-p",
                str(ssh_port),
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "BatchMode=yes",
                "-o",
                "ExitOnForwardFailure=yes",
                "-o",
                "ServerAliveInterval=15",
                "-o",
                "ServerAliveCountMax=4",
                f"{_SSH_USER}@{host}",
            ],
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            text=True,
        )
    time.sleep(1)
    if proc.poll() is not None:
        return None
    return proc.pid


def _wait_for_api_via_tunnel(pod_id: str, timeout: int = 45) -> str | None:
    meta = _load_tunnel_meta(pod_id)
    if meta:
        pid = int(meta.get("pid", 0))
        local_port = int(meta.get("local_port", 0))
        if _is_pid_alive(pid) and local_port > 0:
            base = _normalize_api_base(f"http://127.0.0.1:{local_port}")
            if _api_is_ready(base, timeout=4):
                return base

    endpoint = _wait_for_ssh_endpoint(pod_id, timeout=min(timeout, _SSH_WAIT_SECONDS))
    if not endpoint:
        return None
    host, ssh_port = endpoint
    start_port = _LOCAL_TUNNEL_PORT_BASE
    candidate_ports = _candidate_api_container_ports(pod_id)
    if not candidate_ports:
        candidate_ports = [8899]

    for idx, remote_port in enumerate(candidate_ports):
        local_port = _find_free_local_port(start_port + idx)
        pid = _start_ssh_tunnel(
            pod_id,
            host=host,
            ssh_port=ssh_port,
            remote_port=remote_port,
            local_port=local_port,
        )
        if not pid:
            continue
        base = _normalize_api_base(f"http://127.0.0.1:{local_port}")
        deadline = time.time() + timeout
        while time.time() < deadline:
            if not _is_pid_alive(pid):
                break
            if _api_is_ready(base, timeout=4):
                _write_tunnel_meta(
                    pod_id,
                    pid=pid,
                    local_port=local_port,
                    remote_port=remote_port,
                    host=host,
                    ssh_port=ssh_port,
                )
                _log(f"using SSH API tunnel 127.0.0.1:{local_port} -> {host}:{remote_port}")
                return base
            time.sleep(2)
        try:
            os.kill(pid, 15)
        except OSError:
            pass
    return None


def _wait_for_ssh_endpoint(pod_id: str, timeout: int = _SSH_WAIT_SECONDS) -> tuple[str, int] | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = _get_pod_status(pod_id)
        if status == "RUNNING":
            try:
                host, port = _resolve_ssh_endpoint(pod_id, quiet=True)
            except SystemExit:
                continue
            if _probe_ssh(host, port):
                return host, port
        elif status in {"EXITED", "TERMINATED", "ERROR", "FAILED"}:
            return None
        time.sleep(5)
    return None


def _auto_discover_pod() -> str:
    if not _network_volume_id():
        _die("no network_volume_id in config; run create-volume first")

    gpus = _get_available_gpus()
    if not gpus:
        _die("no GPU entries returned by runpodctl get cloud")

    available = {g.gpu_type: g for g in gpus}
    preferences = _preferred_gpus()

    for gpu in preferences:
        if gpu not in available:
            _log(f"{gpu}: not available, skipping")
            continue

        _log(f"trying GPU: {gpu}")
        try:
            pod_id = _create_pod(gpu)
            if _wait_for_running(pod_id) and _wait_for_ssh_endpoint(pod_id):
                _log(f"pod ready with {gpu}: {pod_id}")
                return pod_id
            _log(f"{pod_id}: did not become ssh-ready, removing")
            _remove_pod(pod_id)
        except SystemExit:
            _log(f"{gpu}: failed to create pod")

    _die("auto-discovery failed: no preferred GPU could start a pod")


def _maybe_schedule_stop(pod_id: str, warm_minutes: int | None, keep_running: bool) -> None:
    if keep_running:
        return
    minutes = 60 if warm_minutes is None else warm_minutes
    if minutes <= 0:
        return

    log_dir = _log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    delay_seconds = max(0, int(minutes * 60))
    stamp = int(time.time())
    log_path = log_dir / f"auto-stop-{pod_id}-{stamp}.log"
    with log_path.open("a", encoding="utf-8") as log_file:
        subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).resolve()),
                "_auto_stop",
                "--pod-id", pod_id,
                "--delay-seconds", str(delay_seconds),
            ],
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            text=True,
        )
        _log(f"scheduled auto-stop in {minutes} minutes for pod {pod_id}")
        print(
            f"[runpod-cosmos] auto-stop log: {log_path}",
            file=log_file,
        )


def cmd_cloud(_args: argparse.Namespace) -> None:
    gpus = _get_available_gpus()
    print(f"{'GPU':<42} {'MEM':>4} {'VCPU':>4} {'SPOT':>8} {'ONDEMAND':>8}")
    print("-" * 72)
    for g in gpus:
        spot = "N/A" if g.spot_price is None else f"${g.spot_price:.3f}"
        on_demand = "N/A" if g.on_demand_price is None else f"${g.on_demand_price:.3f}"
        print(
            f"{g.gpu_type:<42} {g.mem_gb:>4} {g.vcpu:>4} "
            f"{spot:>8} {on_demand:>8}"
        )


def cmd_status(_args: argparse.Namespace) -> None:
    pod_id = _args.pod_id or _pod_id_from_config()
    if not pod_id:
        _die("no RUNPOD_POD_ID set and no runpod_pod_id in config")
    row = _get_pod_row(pod_id)
    for key in ["ID", "NAME", "GPU", "STATUS", "VCPU", "MEM", "LOCATION", "POD TYPE", "IMAGE NAME", "PORTS"]:
        if key in row:
            print(f"{key}: {row[key]}")


def cmd_stop(args: argparse.Namespace) -> None:
    pod_id = args.pod_id or _pod_id_from_config()
    if not pod_id:
        _die("no pod id configured")
    _stop_pod(pod_id)
    _log(f"stopped {pod_id}")


def cmd_start(args: argparse.Namespace) -> None:
    pod_id = args.pod_id or _pod_id_from_config()
    if not pod_id:
        _log("no pod configured; falling back to auto-discovery")
        pod_id = _auto_discover_pod()
    if not _is_running_or_healthy(pod_id):
        _start_pod(pod_id)
        if not _wait_for_running(pod_id):
            _die(f"pod {pod_id} did not reach RUNNING")
    endpoint = _wait_for_ssh_endpoint(pod_id)
    if not endpoint:
        _log(f"pod {pod_id} started but SSH endpoint not ready yet")
        _die("wait for ssh endpoint timed out")
    host, port = endpoint
    print(f"{host} {port}")
    _maybe_schedule_stop(pod_id, args.warm_minutes, args.no_stop)


def cmd_ensure(args: argparse.Namespace) -> None:
    bootstrap_service = getattr(args, "bootstrap_service", False)
    export_mode = getattr(args, "export", False)

    pod_id = args.pod_id or _pod_id_from_config()
    if not pod_id:
        _log("no pod configured; auto-discovering")
        pod_id = _auto_discover_pod()
    else:
        status = _get_pod_status(pod_id)
        if status == "RUNNING":
            ssh_ok = _wait_for_ssh_endpoint(pod_id)
            if not ssh_ok:
                _log(f"{pod_id}: RUNNING but SSH not ready, probing...")
                _start_pod(pod_id)
        elif status in {"EXITED", "TERMINATED", "ERROR", "FAILED"}:
            _log(f"{pod_id}: {status}, restarting")
            _start_pod(pod_id)
        else:
            _log(f"{pod_id}: status={status}, waiting")
            _start_pod(pod_id)

        if not _wait_for_running(pod_id):
            _log(f"{pod_id}: did not start, attempting failover")
            _remove_pod(pod_id)
            pod_id = _auto_discover_pod()

    endpoint = _wait_for_ssh_endpoint(pod_id)
    if not endpoint:
        _die(f"{pod_id} failed to expose SSH after start")

    # Try to resolve API endpoint
    api_base = _wait_for_live_api_base(pod_id, timeout=15)

    if not api_base and bootstrap_service:
        model = os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
        max_len = int(os.getenv("COSMOS_MAX_MODEL_LEN", "32768"))
        _bootstrap_cosmos_service(
            pod_id,
            model=model,
            max_model_len=max_len,
        )
        _log("waiting for vLLM to load model and become ready (this can take several minutes)")
        api_base = _wait_for_live_api_base(pod_id, timeout=max(_API_WAIT_SECONDS, 600))

    _maybe_schedule_stop(pod_id, args.warm_minutes, args.no_stop)
    _cfg_set_values(runpod_pod_id=pod_id)

    if api_base:
        if export_mode:
            print(f'export COSMOS_API_BASE="{api_base}"')
        else:
            print(api_base)
    else:
        host, port = endpoint
        _log(f"SSH ready at {host}:{port} but API not yet available")
        if not bootstrap_service:
            _log("hint: re-run with --bootstrap-service to install and start vLLM")
        if export_mode:
            print(f'# COSMOS_API_BASE not available yet (pod {pod_id})')
        else:
            print(f"{host} {port}")


def cmd_ssh_endpoint(_args: argparse.Namespace) -> None:
    pod_id = _args.pod_id or _pod_id_from_config()
    if not pod_id:
        _die("no pod id configured")
    host, port = _resolve_ssh_endpoint(pod_id)
    print(f"{host} {port}")


def cmd_cosmos_api_base(_args: argparse.Namespace) -> None:
    base = _resolved_api_base(_args)
    if _args.export:
        print(f'export COSMOS_API_BASE="{base}"')
    else:
        print(base)


def cmd_prompt(args: argparse.Namespace) -> None:
    provider = _cosmos_provider(args.provider)
    if provider == "aws":
        base = _aws_api_base()
    else:
        pod_id = args.pod_id or _pod_id_from_config()
        if not pod_id:
            _log("no pod configured; auto-discovering")
            pod_id = _auto_discover_pod()
        base = _runpod_api_base(
            pod_id,
            ensure_running=True,
            warm_minutes=args.warm_minutes,
            no_stop=args.no_stop,
            bootstrap_service=args.bootstrap_service,
        )

    model = args.model or os.getenv("COSMOS_MODEL", "nvidia/Cosmos-Reason2-8B")
    max_tokens = args.max_tokens if args.max_tokens is not None else int(os.getenv("COSMOS_MAX_TOKENS", "256"))
    result = _chat_completion(
        base,
        model=model,
        message=args.message,
        system_prompt=args.system_prompt,
        max_tokens=max_tokens,
        temperature=args.temperature,
        timeout=args.timeout_seconds,
    )
    if args.raw_json:
        print(json.dumps(result, indent=2))
        return
    content = (
        result.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if content:
        print(content)
    else:
        print(json.dumps(result, indent=2))


def cmd_create_volume(args: argparse.Namespace) -> None:
    query = """
    mutation CreateNetworkVolume($input: CreateNetworkVolumeInput!) {
      createNetworkVolume(input: $input) {
        id
        name
        size
        dataCenterId
      }
    }
    """
    variables = {
        "input": {
            "name": args.name,
            "size": args.size,
            "dataCenterId": args.datacenter,
        }
    }
    data = _runpod_graphql(query, variables)

    vol = data.get("data", {}).get("createNetworkVolume", {})
    vol_id = vol.get("id")
    if not vol_id:
        _die(f"no volume id in response: {json.dumps(data, indent=2)}")
    _cfg_set_values(network_volume_id=vol_id)
    print(f"created volume {vol_id}")
    print(f"  name={vol.get('name')}")
    print(f"  size={vol.get('size')}GB")
    print(f"  datacenter={vol.get('dataCenterId')}")
    print(f"persisted to {_CONFIG_PATH}")


def cmd_auto_stop(args: argparse.Namespace) -> None:
    # Internal command used by background auto-stop scheduling.
    time.sleep(args.delay_seconds)
    pod_id = args.pod_id
    current = _pod_id_from_config()
    if current != pod_id:
        return
    if _get_pod_status(pod_id) == "RUNNING":
        _stop_pod(pod_id)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "RunPod lifecycle manager for Cosmos Reason2.\n\n"
            "Key commands:\n"
            "  ensure   Start pod, optionally bootstrap vLLM, print COSMOS_API_BASE\n"
            "  prompt   Send a chat completion request\n"
            "  status   Show pod status\n"
            "  stop     Stop the pod\n"
            "  cloud    List available GPUs"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True)

    cloud = sub.add_parser("cloud", help="List available GPUs from runpodctl")
    cloud.set_defaults(func=cmd_cloud)

    status = sub.add_parser("status", help="Show configured pod status")
    status.add_argument("--pod-id", help="Override configured pod id")
    status.set_defaults(func=cmd_status)

    start = sub.add_parser("start", help="Start configured pod or run auto-discovery if absent")
    start.add_argument("--pod-id")
    start.add_argument(
        "--warm-minutes",
        type=int,
        default=int(os.getenv("RUNPOD_COSMOS_DEFAULT_WARM_MINUTES", "60")),
        help="Keep pod warm for N minutes, then auto-stop",
    )
    start.add_argument(
        "--no-stop",
        action="store_true",
        help="Do not schedule auto-stop",
    )
    start.set_defaults(func=cmd_start)

    stop = sub.add_parser("stop", help="Stop configured pod")
    stop.add_argument("--pod-id")
    stop.set_defaults(func=cmd_stop)

    ensure = sub.add_parser(
        "ensure",
        help="Ensure pod is ready and print COSMOS_API_BASE",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  # First-time setup (installs venv + vLLM, waits for API)\n"
            "  python3 scripts/runpod_cosmos.py ensure --bootstrap-service\n"
            "\n"
            "  # Daily usage — export for shell scripts\n"
            "  eval $(python3 scripts/runpod_cosmos.py ensure --bootstrap-service --export)\n"
            "  echo $COSMOS_API_BASE\n"
            "\n"
            "  # Just verify SSH readiness (no bootstrap)\n"
            "  python3 scripts/runpod_cosmos.py ensure\n"
            "\n"
            "environment variables:\n"
            "  RUNPOD_API_KEY              RunPod API key (required)\n"
            "  HF_ACCESS_TOKEN / HF_TOKEN  Hugging Face token (for --bootstrap-service)\n"
            "  COSMOS_MODEL                Model name (default: nvidia/Cosmos-Reason2-8B)\n"
            "  COSMOS_MAX_MODEL_LEN        vLLM max context (default: 32768)\n"
        ),
    )
    ensure.add_argument("--pod-id")
    ensure.add_argument(
        "--warm-minutes",
        type=int,
        default=int(os.getenv("RUNPOD_COSMOS_DEFAULT_WARM_MINUTES", "60")),
        help="Keep pod warm for N minutes, then auto-stop",
    )
    ensure.add_argument(
        "--no-stop",
        action="store_true",
        help="Do not schedule auto-stop",
    )
    ensure.add_argument(
        "--bootstrap-service",
        action="store_true",
        help="Install venv + vLLM and start serving if API is not already available",
    )
    ensure.add_argument(
        "--export",
        action="store_true",
        help="Print shell export statement for COSMOS_API_BASE",
    )
    ensure.set_defaults(func=cmd_ensure)

    cosmos_api_base = sub.add_parser(
        "api-base",
        help="Print COSMOS_API_BASE for the selected provider",
    )
    cosmos_api_base.add_argument(
        "--provider",
        choices=["aws", "runpod"],
        default=None,
        help="Override COSMOS_PROVIDER env (default: auto from env)",
    )
    cosmos_api_base.add_argument("--pod-id", help="RunPod pod id (runpod provider)")
    cosmos_api_base.add_argument(
        "--ensure",
        action="store_true",
        help="Ensure runpod pod is running and API endpoint is ready",
    )
    cosmos_api_base.add_argument(
        "--warm-minutes",
        type=int,
        default=int(os.getenv("RUNPOD_COSMOS_DEFAULT_WARM_MINUTES", "60")),
        help="Keep runpod pod warm for N minutes, then auto-stop",
    )
    cosmos_api_base.add_argument(
        "--no-stop",
        action="store_true",
        help="For runpod ensure: keep pod running after this command",
    )
    cosmos_api_base.add_argument(
        "--bootstrap-service",
        action="store_true",
        help="For runpod ensure: bootstrap/start vLLM via SSH if API is unavailable",
    )
    cosmos_api_base.add_argument(
        "--export",
        action="store_true",
        help="Print shell export statement for COSMOS_API_BASE",
    )
    cosmos_api_base.set_defaults(func=cmd_cosmos_api_base)

    prompt = sub.add_parser(
        "prompt",
        help="Ensure Cosmos endpoint is ready (runpod/aws) and send one chat prompt",
    )
    prompt.add_argument("--provider", choices=["aws", "runpod"], default=None)
    prompt.add_argument("--pod-id", help="RunPod pod id (runpod provider)")
    prompt.add_argument("--message", required=True, help="User prompt text")
    prompt.add_argument(
        "--system-prompt",
        default="You are a helpful assistant.",
        help="Optional system prompt",
    )
    prompt.add_argument("--model", default=None, help="Override COSMOS_MODEL")
    prompt.add_argument(
        "--max-tokens",
        type=int,
        default=None,
        help="Override max tokens (defaults to COSMOS_MAX_TOKENS)",
    )
    prompt.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="Sampling temperature",
    )
    prompt.add_argument(
        "--timeout-seconds",
        type=int,
        default=_PROMPT_TIMEOUT_SECONDS,
        help="HTTP timeout for chat/completions request",
    )
    prompt.add_argument(
        "--warm-minutes",
        type=int,
        default=int(os.getenv("RUNPOD_COSMOS_DEFAULT_WARM_MINUTES", "60")),
        help="Keep runpod pod warm for N minutes, then auto-stop",
    )
    prompt.add_argument(
        "--no-stop",
        action="store_true",
        help="Keep runpod pod running after prompt",
    )
    prompt.add_argument(
        "--bootstrap-service",
        action="store_true",
        help="When runpod API is unavailable, install/start vLLM on pod via SSH and retry",
    )
    prompt.add_argument(
        "--raw-json",
        action="store_true",
        help="Print raw JSON response instead of assistant text only",
    )
    prompt.set_defaults(func=cmd_prompt)

    ssh_endpoint = sub.add_parser("ssh-endpoint", help="Print host and SSH port for pod")
    ssh_endpoint.add_argument("--pod-id")
    ssh_endpoint.set_defaults(func=cmd_ssh_endpoint)

    volume = sub.add_parser("create-volume", help="Create a RunPod network volume")
    volume.add_argument("--name", required=False, default="cosmos-reason2-8b", help="Volume name")
    volume.add_argument("--size", required=False, type=int, default=400, help="Size in GB")
    volume.add_argument("--datacenter", required=False, default="US-TX-3", help="RunPod datacenter")
    volume.set_defaults(func=cmd_create_volume)

    auto_stop = sub.add_parser("_auto_stop", help=argparse.SUPPRESS)
    auto_stop.add_argument("--pod-id", required=True)
    auto_stop.add_argument("--delay-seconds", required=True, type=int)
    auto_stop.set_defaults(func=cmd_auto_stop)

    return p


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

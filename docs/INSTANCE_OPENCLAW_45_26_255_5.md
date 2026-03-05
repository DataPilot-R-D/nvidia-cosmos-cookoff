# Instance Runbook: `openclaw-host-45.26.255.5`

Last verified: 2026-02-11

## Login (SSH)

```bash
ssh -i ~/.ssh/id_rsa -p 2222 piotr@45.26.255.5
```

Optional SSH config:

```sshconfig
Host openclaw-host
  HostName 45.26.255.5
  User piotr
  Port 2222
  IdentityFile ~/.ssh/id_rsa
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Then connect with:

```bash
ssh openclaw-host
```

## Where OpenClaw agents live (workspace dirs)

Agent workspaces are configured in `~/.openclaw-*/openclaw.json` via the `workspace` field.

- `orchestrator`: `/srv/ash-agents/orchestrator`
- `dev`: `/srv/ash-agents/dev`
- `qa`: `/srv/ash-agents/qa`
- `infra`: `/srv/ash-agents/infra`
- `assistant`: `/srv/ash-agents/assistant`
- `hr`: `/srv/ash-agents/hr`
- `strategist`: `/srv/ash-agents/strategist`

## Quick verification commands on the host

Print all configured workspace paths:

```bash
for f in ~/.openclaw-*/openclaw.json; do
  [ -f "$f" ] || continue
  echo "=== $f ==="
  grep -n '"workspace"' "$f"
done
```

Show current CWD of running OpenClaw gateway processes:

```bash
for pid in $(pgrep -f openclaw-gateway); do
  printf "PID=%s CWD=%s\n" "$pid" "$(readlink -f /proc/$pid/cwd)"
done
```

## Note about working directory

- `systemd --user` units currently show `WorkingDirectory=/home/piotr`.
- Agent-specific project roots are still defined by each OpenClaw profile `workspace` path listed above.

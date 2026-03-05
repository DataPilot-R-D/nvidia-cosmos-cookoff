# Systemd Conventions for PAIC2

Use systemd units to run long-lived PAIC2 services on runtime hosts.

## Managed service classes

- bringup and ROS launch orchestration
- rosbridge server
- websocket bridge and dashboard backend services
- local model serving processes required by runtime

## Unit file standards

- `Restart=always`
- explicit `WorkingDirectory`
- explicit environment file path from `ops/env/`
- logs to journald
- dependency ordering via `After=` and `Requires=` where needed

## Naming convention

- `sras-bringup.service`
- `sras-rosbridge.service`
- `sras-websocket.service`
- `sras-reasoning.service`

## Deployment rule

Systemd unit files are managed in git and promoted through platform lock workflow.

# SRAS Docs

Last verified: 2026-02-10

This folder is a practical knowledge base (runbooks + “where is what”) for SRAS robotics infrastructure and ROS2 components.

If you are looking for the big-picture architecture, start with `docs/architektura.md`.

## Index

- `docs/ACCESS.md`: how to login (SSH/VNC/DCV), and how to open Security Group access via AWS CLI.
- `docs/INSTANCES.md`: AWS EC2 inventory (which instances exist, regions, IPs).
- `docs/INSTANCE_ISAAC_SIM_1.md`: runbook + layout for the GPU instance (`isaac-sim-1`).
- `docs/INSTANCE_OPENCLAW_45_26_255_5.md`: how to SSH into the OpenClaw host and where each agent workspace lives.
- `docs/VIDEO_STREAMING_OPERATOR.md`: investigation + plan to achieve stable 30/60 FPS operator camera streaming (WebRTC/go2rtc vs fallback).
- `docs/ROS2_STACK.md`: how the ROS2 stack is composed (Nav2, SLAM, rosbridge, vision LLM, DimOS bridge).
- `docs/REPO_MAPPING.md`: map ROS2 packages and server directories to GitHub repos.
- `docs/MAPS.md`: where maps/posegraphs live and how they are used.
- `docs/NEXT_STEPS.md`: improvements to make this setup easier to maintain/reproduce.

## Security Note (Please Read)

- Do not commit secrets (SSH private keys, passwords, API keys) into git.
- Put secrets in a secure store (1Password, AWS SSM Parameter Store/Secrets Manager) and reference them in docs.

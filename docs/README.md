# PAIC2 Docs

This folder is a practical knowledge base (runbooks + "where is what") for PAIC2 robotics infrastructure and ROS 2 components.

If you are looking for the big-picture architecture, start with `REASONING_LAYER_ARCHITECTURE.md`.

## Index

- `ACCESS.md` — How to login (SSH/VNC/DCV), and how to open Security Group access via AWS CLI.
- `INSTANCES.md` — AWS EC2 inventory (which instances exist, regions, IPs).
- `INSTANCE_ISAAC_SIM_1.md` — Runbook + layout for the GPU instance (`isaac-sim-1`).
- `INSTANCE_OPENCLAW_45_26_255_5.md` — How to SSH into the OpenClaw host and where each agent workspace lives.
- `VIDEO_STREAMING_OPERATOR.md` — Investigation + plan for stable operator camera streaming (WebRTC/go2rtc vs fallback).
- `ROS2_STACK.md` — How the ROS 2 stack is composed (Nav2, SLAM, rosbridge, vision LLM, DimOS bridge).
- `REPO_MAPPING.md` — Map of modules to server directories and ROS 2 packages.
- `MAPS.md` — Where maps/posegraphs live and how they are used.
- `REASONING_LAYER_ARCHITECTURE.md` — Target reasoning layer design.
- `COSMOS_GUIDE.md` — NVIDIA Cosmos integration guide.
- `COSMOS_PROMPT_GUIDE.md` — Cosmos Reason prompt engineering guide.
- `COSMOS_CONFIG_RECOMMENDATION.md` — Cosmos configuration recommendations.
- `COSMOS_RUNPOD_OPERATIONS.md` — RunPod lifecycle and operations for Cosmos.
- `NEXT_STEPS.md` — Improvements to make this setup easier to maintain/reproduce.

## Monorepo structure

This hackathon monorepo consolidates all modules under `modules/` and infrastructure under `infra/`. See the root `README.md` for the full layout.

## Security note

- Do not commit secrets (SSH private keys, passwords, API keys) into git.
- Put secrets in a secure store (1Password, AWS SSM Parameter Store/Secrets Manager) and reference them in docs.

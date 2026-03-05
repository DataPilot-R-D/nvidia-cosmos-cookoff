# Proposed Improvements (to make future development easier)

Last verified: 2026-02-10

This is a “what to capture next / what to fix” list so the setup stays reproducible.

## 1. Make the server reproducible from git

- Ensure every ROS2 package in `/home/ubuntu/ros2_ws/src` maps to a canonical Git repo.
- Replace copied folders (no `.git`) with proper clones.
- Create a `ros2_ws.repos` file + bootstrap script (`vcs import` + `colcon build`).

## 2. Turn ad-hoc processes into managed services

- Use `systemd` units for:
  - rosbridge
  - bringup stack
  - VNC/DCV (if needed)
  - any LLM backend service
- Store logs in journald, add `Restart=always`, and record “how to restart”.

## 3. Fix secret handling

- Do not store passwords/keys in repos.
- Move VNC password and any API keys to:
  - AWS SSM Parameter Store / Secrets Manager
  - or 1Password
- Add a short “how to rotate” procedure.

## 4. Reduce the need for inbound rules

- Prefer AWS SSM Session Manager for SSH-like access.
- If VNC/DCV is required, restrict inbound to VPN ranges (e.g., Pritunl) instead of many `/32` rules.

## 5. Add an “operational snapshot” script

Create a script that prints the current state in one shot:

- instance metadata (region, SGs, IP)
- listening ports
- running ROS nodes and their launch commands
- disk usage hotspots
- current git status of all repos in `~/ros2_ws/src` and `~/go2_omniverse`

This becomes a single command to refresh docs and debug incidents.

## 6. Make operator video streaming a first-class runbook

- Stop validating video quality via VNC (it re-encodes the whole desktop and is often the bottleneck).
- Make WebRTC (go2rtc) the default operator path and avoid the WebSocket JPEG fallback for day-to-day use.
- Capture the exact camera FPS/resolution settings in the sim so 30/60 FPS is reproducible.
- Document and automate required networking (Security Group UDP ports, ICE candidate config).

See: `docs/VIDEO_STREAMING_OPERATOR.md`.

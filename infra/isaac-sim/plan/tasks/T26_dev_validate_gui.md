# T26_dev_validate_gui

Status: TODO  
Depends on: T25_dev_instance_launch, T05_preflight_vpn_routes  
Outputs: Verified GUI Dev workstation usable by team.

## Purpose

Confirm the Dev tier meets latency and usability requirements.

## Steps

1. Connect to VPN.
2. Use Amazon DCV thick client to connect:
   - `<dev-private-ip>:8443#console`
3. Authenticate with Linux user.
4. Run Isaac Sim GUI sample and check FPS/latency.
5. Validate multi‑user collaboration by adding a second user to `isaac-devs`.

## Acceptance

- DCV session connects without public IP.
- Isaac Sim GUI runs stably.
- Collaboration works (expected limitations: shared input, no multi‑monitor).

## Rollback

- If DCV fails, use SSM to debug; re‑bootstrap or re‑bake AMI if needed.


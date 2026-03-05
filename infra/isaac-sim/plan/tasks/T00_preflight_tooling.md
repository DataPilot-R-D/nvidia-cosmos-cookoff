# T00_preflight_tooling

Status: TODO  
Depends on: —  
Outputs: Local workstation ready for AWS CLI‑first provisioning.

## Purpose

Ensure the local machine you’ll run AWS CLI from has the required tooling for scripted provisioning and remote access.

## Steps

1. Install AWS CLI v2.
2. Install helper tools used by scripts: `jq`, `python3`, `curl`, `wget`, `git`.
3. Install AWS Session Manager plugin (needed for `aws ssm start-session` on macOS/Linux).
4. Confirm OpenVPN client is installed and you can connect to your VPN.

## Commands (macOS examples)

```bash
# AWS CLI v2
brew install awscli
aws --version

# Helpers
brew install jq python3 curl wget git

# Session Manager plugin
brew install session-manager-plugin
session-manager-plugin --version

# OpenVPN client (if not already)
brew install openvpn
openvpn --version
```

## Acceptance

- `aws --version` prints v2.x.
- `jq --version` works.
- `session-manager-plugin --version` works.
- You can successfully connect to OpenVPN (validation in T05).

## Rollback

None required.


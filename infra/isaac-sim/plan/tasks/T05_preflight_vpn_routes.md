# T05_preflight_vpn_routes

Status: TODO  
Depends on: T04_preflight_config_file  
Outputs: VPN reachability to VPC private subnets.

## Purpose

DCV/SSH are private‑only; VPN routing must work before you attempt GUI access.

## Steps

1. Connect to your OpenVPN.
2. Confirm your client gets routes to `VPC_CIDR` (or to the specific private subnet CIDRs).
3. After any private instance exists, validate connectivity.

## Validation Commands

```bash
# Check routes on client (macOS)
netstat -rn | grep 10.50

# Once a dev builder or dev instance is up:
ssh -i ~/.ssh/${KEYPAIR_NAME}.pem ubuntu@<private-ip>
```

## Acceptance

- Client routing table includes `VPC_CIDR` or specific subnets.
- SSH to a private instance succeeds over VPN.

## Rollback

Fix VPN server route pushes / VPC routing before continuing.


# Isaac Sim AWS – Current Ops Snapshot

Last updated: 2025-12-15

## Instances
- New primary: `i-049196cd8dcf0aefc` (g6.2xlarge, eu-central-1a) — **running**
  - Public IP: `35.159.78.16`
  - Private IP: `10.50.0.251`
  - AMI: `ami-0cbcdf6eaed50adc7` (baked from previous node)
  - SG: `sg-075c80b222a90fb31` (currently 22/8443 open to 0.0.0.0/0 + VPN CIDRs)
  - IAM instance profile: `isaacsim-ec2-profile`
  - Keys on `ubuntu`: `piotrgerke@Piotrs-Air` and `szymon.paluch@golem.network` (ssh-rsa)
- Old node: `i-07738aa2d8cba3ec3` (private subnet) — **stopped**; holds EIP via secondary ENI (not needed now).

## Access
- SSH: `ssh ubuntu@35.159.78.16` with the above public keys. SSM online (agent 3.3.2299.0) as fallback.
- DCV: service active; connect to `https://35.159.78.16:8443` (Console). Workstation password currently `IsaacSim!2025` — rotate after use.
- Security warning: lock SG/iptables to trusted IPs when done testing; 22/8443 are wide open now.

## Isaac Sim runtime
- Docker image present: `nvcr.io/nvidia/isaac-sim:2023.1.1`.
- Runtime dependencies: NVIDIA driver 580.95.05 on L4 GPU; `nvidia-container-toolkit` installed and docker runtime configured.
- Running container: `c53c9f88f775` (`nvcr.io/nvidia/isaac-sim:2023.1.1`) started via `/opt/isaac-sim/run-container.sh`.
  - Stop: `docker stop c53c9f88f775`.
  - Restart (detached example): `docker run -d --gpus all --network host -e DISPLAY=:0 -e ACCEPT_EULA=Y -e PRIVACY_CONSENT=Y -v /tmp/.X11-unix:/tmp/.X11-unix -v /tmp/.docker.xauth:/root/.Xauthority -v /shared:/shared -v /home/workstation/.nvidia-omniverse:/home/root/.nvidia-omniverse -v /home/workstation/.cache:/home/root/.cache -v /home/workstation/.local:/home/root/.local nvcr.io/nvidia/isaac-sim:2023.1.1`.

## Networking notes
- Current public path works for SSH/DCV (tested with `nc` on 22/8443).
- Old VPN path was failing due to Client VPN routing/auth; instance now in public subnet `subnet-015e886e2cd1a622c` with IGW, avoiding VPN dependency.
- EIP `18.158.208.62` still attached to old ENI; can re-associate to new instance if desired.

## Next recommended actions
- Tighten SG/iptables to your IPs.
- Rotate DCV credentials.
- Optional: re-associate the EIP to the new instance and decommission unused VPN artifacts if no longer needed.

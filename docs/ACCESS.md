# Access (SSH, AWS, VNC/DCV)

Last verified: 2026-02-10

## AWS CLI sanity check

```bash
aws --version
aws sts get-caller-identity --output json
```

This workspace was verified with AWS account `043509841182` (user `spaluch.datapilot.agent`).

## SSH key setup

Expected key location (local machine):

- `~/.ssh/isaac-sim-1-key.pem`

Permissions:

```bash
chmod 600 ~/.ssh/isaac-sim-1-key.pem
```

## Login (SSH)

```bash
ssh -i ~/.ssh/isaac-sim-1-key.pem ubuntu@63.182.177.92
```

Optional `~/.ssh/config` entry:

```sshconfig
Host isaac-sim-1
  HostName 63.182.177.92
  User ubuntu
  IdentityFile ~/.ssh/isaac-sim-1-key.pem
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Then:

```bash
ssh isaac-sim-1
```

## If SSH/VNC times out: open your IP in the Security Group

The instance `63.182.177.92` is in `eu-central-1`, security group:

- `sg-0fd741f3ed3a5df90` (`isaac-sim-1-sg`)

Get your current public IP:

```bash
MY_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')
echo "$MY_IP"
```

Allow SSH (`tcp/22`) from your IP `/32`:

```bash
aws ec2 authorize-security-group-ingress \
  --region eu-central-1 \
  --group-id sg-0fd741f3ed3a5df90 \
  --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":22,\"ToPort\":22,\"IpRanges\":[{\"CidrIp\":\"${MY_IP}/32\",\"Description\":\"temp access\"}]}]"
```

Allow VNC (`tcp/5900`) from your IP `/32` (only if you actually need VNC):

```bash
aws ec2 authorize-security-group-ingress \
  --region eu-central-1 \
  --group-id sg-0fd741f3ed3a5df90 \
  --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":5900,\"ToPort\":5900,\"IpRanges\":[{\"CidrIp\":\"${MY_IP}/32\",\"Description\":\"temp VNC access\"}]}]"
```

Remove access when done (revoke with the same permission payload):

```bash
aws ec2 revoke-security-group-ingress \
  --region eu-central-1 \
  --group-id sg-0fd741f3ed3a5df90 \
  --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":22,\"ToPort\":22,\"IpRanges\":[{\"CidrIp\":\"${MY_IP}/32\"}]}]"

aws ec2 revoke-security-group-ingress \
  --region eu-central-1 \
  --group-id sg-0fd741f3ed3a5df90 \
  --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":5900,\"ToPort\":5900,\"IpRanges\":[{\"CidrIp\":\"${MY_IP}/32\"}]}]"
```

## VNC (GUI access)

- Host: `63.182.177.92`
- Port: `5900`

On the instance, VNC is served by `x11vnc` and uses an auth file:

- `/home/ubuntu/.vnc/passwd`

Do not store VNC passwords in git. Keep it in a secure store and rotate as needed.

If you need local developer convenience, store the password in a **local-only** `.env` (gitignored) as:

- `ISAAC_SIM_1_VNC_PASSWORD=...`

## NICE DCV (alternative GUI)

- URL: `https://63.182.177.92:8443`

DCV access is also controlled by the Security Group. If you need it, open `tcp/8443` to your IP `/32`.

## Recommendation: avoid opening inbound ports long-term

For long-lived access, prefer:

- AWS SSM Session Manager (no inbound `22` needed)
- VPN (there is a `Pritunl1` instance in this AWS account; see `docs/INSTANCES.md`)

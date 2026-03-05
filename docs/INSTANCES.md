# AWS EC2 Instances

Last verified: 2026-02-10

This is a snapshot of **running** EC2 instances in AWS account `043509841182` across regions.

## SRAS-related

| Name | Region | InstanceId | Type | State | Public IP |
|---|---|---|---|---|---|
| `isaac-sim-1` | `eu-central-1` | `i-0da8f19d3053d21e6` | `g6.4xlarge` | `running` | `63.182.177.92` |

See the runbook in `docs/INSTANCE_ISAAC_SIM_1.md`.

## Other instances in the same AWS account

| Name | Region | InstanceId | Type | State | Public IP |
|---|---|---|---|---|---|
| `ImageMorphAI-Production` | `ap-northeast-1` | `i-05f71d6b9be55e6d3` | `t3.small` | `running` | `13.113.155.176` |
| `ECS Instance - investigation-studio-demo` | `us-west-1` | `i-0868ad74a59a3aa18` | `t3.large` | `running` | `3.101.191.231` |
| `Pritunl1` | `us-west-1` | `i-0beaae5ebd9b1cebe` | `t3.micro` | `running` | `54.183.101.243` |
| `datapilot-windows-target` | `us-west-1` | `i-0b52a7c37ccb723f2` | `t3.large` | `running` | `13.57.241.161` |

## How to refresh this list

Quick list for a single region:

```bash
aws ec2 describe-instances \
  --region eu-central-1 \
  --filters Name=instance-state-name,Values=pending,running,stopped,stopping \
  --query 'Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,Type:InstanceType,AZ:Placement.AvailabilityZone,PublicIp:PublicIpAddress,Name:Tags[?Key==`Name`]|[0].Value}' \
  --output table
```

Cross-region inventory (non-terminated) in one shot:

```bash
python3 - <<'PY'
import json, subprocess

def aws_json(args):
    p=subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode!=0:
        raise RuntimeError(p.stderr.strip())
    return json.loads(p.stdout or 'null')

regions=subprocess.check_output([
    'aws','ec2','describe-regions','--query','Regions[].RegionName','--output','text'
]).decode().split()

rows=[]
for r in regions:
    try:
        data=aws_json([
            'aws','ec2','describe-instances','--region',r,
            '--filters','Name=instance-state-name,Values=pending,running,stopped,stopping',
            '--output','json',
            '--query',
            'Reservations[].Instances[].{Region:`'+r+'`,InstanceId:InstanceId,State:State.Name,Type:InstanceType,AZ:Placement.AvailabilityZone,PublicIp:PublicIpAddress,Name:Tags[?Key==`Name`]|[0].Value}'
        ])
    except Exception:
        continue
    for inst in data or []:
        rows.append(inst)

rows.sort(key=lambda x: (x['Region'], x.get('Name') or '', x['InstanceId']))
print(json.dumps(rows, indent=2))
PY
```


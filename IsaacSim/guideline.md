Below is a terminal-first, AWS-native blueprint (Frankfurt / `eu-central-1`) for running **Isaac Sim 5.1.x** with a **shared interactive GUI workstation (Amazon DCV)** plus an **on-demand “heavy” training environment** that can be switched between GPU sizes/types without rewriting the whole environment.

I’m going to treat what you wrote as the final requirements and proceed directly to the guideline.

---

## 1) Executive design summary

### Goal

* **Always-on dev workstation (“light”)**: RTX-capable GPU, interactive Isaac Sim GUI with **lowest possible latency**, shared among multiple users via **Amazon DCV**, reachable only over your existing **OpenVPN** (no public IP).
* **On-demand training (“heavy”)**: starts/stops/terminates to control cost (often Spot), mounts the **same shared workspace** as dev, runs headless or batch workloads; can scale later to multi-GPU.

### Key constraints discovered in research

1. **Official NVIDIA “Isaac Sim Development Workstation (Linux)” AWS Marketplace AMI is g6e-only** (and NVIDIA specifically documents g6e for that AMI). If you want the option to use **cheaper GPU families** (g4dn/g5/g6) for the dev box, you should plan a **scripted install / custom AMI** path.
2. Isaac Sim **5.1.x** supports **Ubuntu 22.04 / 24.04** and expects an **RTX-capable GPU**; NVIDIA publishes a tested Linux driver version for 5.1.0 (use this as your baseline for driver pinning).
3. Amazon DCV is suitable for “remote workstation feel” and supports:

   * default port **8443** (TCP), plus optional **QUIC/UDP** for improved responsiveness if UDP is permitted
   * collaboration (multiple users in the **same session**) by granting **`display`** permission, with limitations (e.g., multi-monitor disabled; shared input)
   * no extra license charge on EC2 (but the server performs license checks against an S3 bucket, so provide S3 reachability via NAT or an S3 VPC endpoint)

### Recommended pattern (matches your “Model 2”)

* **Dev instance**: always on, smaller RTX GPU (still GPU) + DCV shared “console” session.
* **Training instance**: created on-demand (Spot preferred) using a larger instance type list; uses the *same* EFS shared workspace and pushes artifacts/checkpoints to S3.

---

## 2) Instance family strategy in Frankfurt (`eu-central-1`)

Frankfurt supports multiple NVIDIA GPU instance families relevant to Isaac Sim (including G4dn/G5/G6/G6e).

### Practical recommendations (start simple)

**Dev (“light”, always-on, GUI):**

* Pick an instance type that meets Isaac Sim’s practical minimums (RTX + enough RAM/VRAM); Isaac Sim’s requirements call out RTX-class GPUs and substantial memory, and you will feel RAM pressure in real scenes.
* If you want “modern + efficient”: **G6 (NVIDIA L4)** is attractive; AWS positions G6 with L4 GPUs (24 GB VRAM per GPU).
* If you want “legacy cheaper”: G4dn (T4) can work for GUI, but may feel tight depending on scenes.

**Training (“heavy”, on-demand):**

* For “more VRAM / headroom”: **G6e (NVIDIA L40S)** provides 48 GB VRAM per GPU (and scales to multi-GPU sizes later).
* For multi-GPU later, keep a list of allowed training types and let Spot pick capacity.

---

## 3) Network & security architecture (no public IP, VPN-first, SSM fallback)

### Network

* Dedicated VPC in **eu-central-1** with **private subnets** (2 AZs).
* Dev + training instances:

  * **no public IP**
  * inbound allowed only from your **OpenVPN client CIDR(s)** (and/or VPN subnet routes)
* Use **SSM Session Manager** as the break-glass path (requires either NAT egress or SSM VPC interface endpoints).

### Remote desktop (Amazon DCV)

* Use DCV on **port 8443** by default.
* Enable QUIC (UDP) when possible for better interactive feel; QUIC can be disabled/enabled via `dcv.conf`.
* Connection format for the thick client is: `server_ip:port#session_id`.

### Multi-user “single shared desktop session”

* Use an **automatic console session** that is created at DCV server startup, and authorize a **Linux group** to connect to it.
* Collaboration requires granting the **`display`** permission; note multi-monitor is disabled for collaboration, and all collaborators share mouse/keyboard input.

---

## 4) Storage & persistence design (EFS + S3 + small local scratch)

### Shared workspace (EFS)

* One **EFS** file system, mounted by both dev and training (e.g., `/shared`).
* Use:

  * encryption at rest (EFS supports encryption)
  * encryption in transit (mount with TLS)
  * **Elastic throughput** (good default for bursty dev/training).

### Artifacts/checkpoints (S3)

* S3 bucket for:

  * model checkpoints
  * synthetic dataset exports
  * experiment logs
  * immutable build artifacts

### Local performance (EBS/NVMe)

* Give each instance its own root EBS + optional data EBS/NVMe for caches (Omniverse cache, pip cache, container layers). Keep EFS for shared canonical data.

---

## 5) Provisioning approach (CLI-driven, team-friendly)

You said “not one magic command” and want scripts/templates your team can adapt. The most maintainable CLI-first approach is:

1. **CloudFormation deployed via AWS CLI** for baseline infrastructure (VPC, subnets, SGs, EFS, endpoints, IAM instance profile).
2. **Bash scripts using AWS CLI** for:

   * launching/stopping dev
   * creating/terminating training Spot instances
   * rotating instance types (“hardware switching”)
   * attaching consistent user-data for EFS mount + config

This keeps everything terminal-driven, repeatable, and reviewable in Git.

---

## 6) Reference implementation: repo layout

```
aws-isaacsim/
  cfn/
    infra.yaml
  scripts/
    00_env.sh
    10_deploy_infra.sh
    20_launch_dev.sh
    30_configure_dcv_shared.sh
    40_launch_train_spot.sh
    50_terminate_train.sh
    60_sync_artifacts.sh
```

Below are **working-style templates** (you will still adapt CIDRs, instance types, and AMI strategy).

---

## 7) Step-by-step guide with scripts

### Step 0 — AWS CLI + SSO profile (recommended)

Use AWS CLI v2 with IAM Identity Center / SSO:

```bash
aws configure sso --profile dev-isaac
aws sts get-caller-identity --profile dev-isaac --region eu-central-1
```

---

### Step 1 — Deploy baseline infrastructure (VPC + EFS + endpoints) via CloudFormation

#### `scripts/00_env.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="dev-isaac"
export AWS_REGION="eu-central-1"

# Naming
export PROJECT="isaacsim"
export STACK_NAME="${PROJECT}-infra"

# CIDRs (EDIT THESE)
export VPC_CIDR="10.50.0.0/16"
export PUBLIC_SUBNET_CIDR="10.50.0.0/24"
export PRIVATE_SUBNET_1_CIDR="10.50.1.0/24"
export PRIVATE_SUBNET_2_CIDR="10.50.2.0/24"

# Your OpenVPN client CIDR(s) that should reach DCV/SSH
export VPN_CIDR="10.8.0.0/24"
```

#### `scripts/10_deploy_infra.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "cfn/infra.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName="$PROJECT" \
    VpcCidr="$VPC_CIDR" \
    PublicSubnetCidr="$PUBLIC_SUBNET_CIDR" \
    PrivateSubnet1Cidr="$PRIVATE_SUBNET_1_CIDR" \
    PrivateSubnet2Cidr="$PRIVATE_SUBNET_2_CIDR" \
    VpnCidr="$VPN_CIDR"
```

#### `cfn/infra.yaml` (reference template)

This is intentionally “baseline but complete” (VPC, NAT for outbound, S3 endpoint, SSM endpoints, EFS, SGs, instance role).

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Isaac Sim baseline infra (eu-central-1): private subnets, EFS, SSM endpoints, SGs

Parameters:
  ProjectName:
    Type: String
    Default: isaacsim
  VpcCidr:
    Type: String
  PublicSubnetCidr:
    Type: String
  PrivateSubnet1Cidr:
    Type: String
  PrivateSubnet2Cidr:
    Type: String
  VpnCidr:
    Type: String
    Description: CIDR of OpenVPN clients allowed to reach DCV/SSH

Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !Ref VpcCidr
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Sub "${ProjectName}-vpc"

  Igw:
    Type: AWS::EC2::InternetGateway
    Properties:
      Tags:
        - Key: Name
          Value: !Sub "${ProjectName}-igw"

  VpcIgwAttach:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref Vpc
      InternetGatewayId: !Ref Igw

  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: !Ref PublicSubnetCidr
      MapPublicIpOnLaunch: true
      AvailabilityZone: !Select [0, !GetAZs ""]
      Tags:
        - Key: Name
          Value: !Sub "${ProjectName}-public-a"

  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: !Ref PrivateSubnet1Cidr
      MapPublicIpOnLaunch: false
      AvailabilityZone: !Select [0, !GetAZs ""]
      Tags:
        - Key: Name
          Value: !Sub "${ProjectName}-private-a"

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref Vpc
      CidrBlock: !Ref PrivateSubnet2Cidr
      MapPublicIpOnLaunch: false
      AvailabilityZone: !Select [1, !GetAZs ""]
      Tags:
        - Key: Name
          Value: !Sub "${ProjectName}-private-b"

  PublicRt:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: VpcIgwAttach
    Properties:
      RouteTableId: !Ref PublicRt
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref Igw

  PublicRtAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet
      RouteTableId: !Ref PublicRt

  NatEip:
    Type: AWS::EC2::EIP
    Properties:
      Domain: vpc

  NatGw:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatEip.AllocationId
      SubnetId: !Ref PublicSubnet

  PrivateRt:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref Vpc

  PrivateDefaultRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRt
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGw

  PrivateRtAssoc1:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet1
      RouteTableId: !Ref PrivateRt

  PrivateRtAssoc2:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet2
      RouteTableId: !Ref PrivateRt

  # Security groups
  DevSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Dev workstation SG (DCV + SSH from VPN)
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 22
          ToPort: 22
          CidrIp: !Ref VpnCidr
        - IpProtocol: tcp
          FromPort: 8443
          ToPort: 8443
          CidrIp: !Ref VpnCidr
        - IpProtocol: udp
          FromPort: 8443
          ToPort: 8443
          CidrIp: !Ref VpnCidr
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  TrainSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Training SG (SSH from VPN)
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 22
          ToPort: 22
          CidrIp: !Ref VpnCidr
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  EfsSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: EFS SG (NFS from Dev/Train)
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 2049
          ToPort: 2049
          SourceSecurityGroupId: !Ref DevSg
        - IpProtocol: tcp
          FromPort: 2049
          ToPort: 2049
          SourceSecurityGroupId: !Ref TrainSg
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  EndpointSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Interface endpoints SG (443 from Dev/Train)
      VpcId: !Ref Vpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          SourceSecurityGroupId: !Ref DevSg
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          SourceSecurityGroupId: !Ref TrainSg
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  # VPC endpoints for private SSM usage
  SsmEndpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub "com.amazonaws.${AWS::Region}.ssm"
      VpcEndpointType: Interface
      SubnetIds: [!Ref PrivateSubnet1, !Ref PrivateSubnet2]
      SecurityGroupIds: [!Ref EndpointSg]
      PrivateDnsEnabled: true

  Ec2MessagesEndpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub "com.amazonaws.${AWS::Region}.ec2messages"
      VpcEndpointType: Interface
      SubnetIds: [!Ref PrivateSubnet1, !Ref PrivateSubnet2]
      SecurityGroupIds: [!Ref EndpointSg]
      PrivateDnsEnabled: true

  SsmMessagesEndpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub "com.amazonaws.${AWS::Region}.ssmmessages"
      VpcEndpointType: Interface
      SubnetIds: [!Ref PrivateSubnet1, !Ref PrivateSubnet2]
      SecurityGroupIds: [!Ref EndpointSg]
      PrivateDnsEnabled: true

  LogsEndpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub "com.amazonaws.${AWS::Region}.logs"
      VpcEndpointType: Interface
      SubnetIds: [!Ref PrivateSubnet1, !Ref PrivateSubnet2]
      SecurityGroupIds: [!Ref EndpointSg]
      PrivateDnsEnabled: true

  # S3 gateway endpoint (also supports DCV license check S3 reachability patterns)
  S3Endpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref Vpc
      ServiceName: !Sub "com.amazonaws.${AWS::Region}.s3"
      VpcEndpointType: Gateway
      RouteTableIds: [!Ref PrivateRt]

  # Shared EFS
  SharedEfs:
    Type: AWS::EFS::FileSystem
    Properties:
      Encrypted: true
      PerformanceMode: generalPurpose
      ThroughputMode: elastic
      FileSystemTags:
        - Key: Name
          Value: !Sub "${ProjectName}-efs"

  EfsMountTarget1:
    Type: AWS::EFS::MountTarget
    Properties:
      FileSystemId: !Ref SharedEfs
      SubnetId: !Ref PrivateSubnet1
      SecurityGroups: [!Ref EfsSg]

  EfsMountTarget2:
    Type: AWS::EFS::MountTarget
    Properties:
      FileSystemId: !Ref SharedEfs
      SubnetId: !Ref PrivateSubnet2
      SecurityGroups: [!Ref EfsSg]

  EfsAccessPoint:
    Type: AWS::EFS::AccessPoint
    Properties:
      FileSystemId: !Ref SharedEfs
      PosixUser:
        Uid: "1000"
        Gid: "1000"
      RootDirectory:
        Path: /shared
        CreationInfo:
          OwnerUid: "1000"
          OwnerGid: "1000"
          Permissions: "0775"

  # S3 bucket for artifacts
  ArtifactsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${ProjectName}-${AWS::AccountId}-${AWS::Region}-artifacts"
      VersioningConfiguration:
        Status: Enabled
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256

  # EC2 instance role/profile
  Ec2Role:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "${ProjectName}-ec2-role"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Service: ec2.amazonaws.com }
            Action: "sts:AssumeRole"
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
      Policies:
        - PolicyName: !Sub "${ProjectName}-s3-access"
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - "s3:ListBucket"
                Resource: !GetAtt ArtifactsBucket.Arn
              - Effect: Allow
                Action:
                  - "s3:GetObject"
                  - "s3:PutObject"
                  - "s3:DeleteObject"
                Resource: !Sub "${ArtifactsBucket.Arn}/*"

  Ec2InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      InstanceProfileName: !Sub "${ProjectName}-ec2-profile"
      Roles: [!Ref Ec2Role]

Outputs:
  VpcId:
    Value: !Ref Vpc
  PrivateSubnet1Id:
    Value: !Ref PrivateSubnet1
  PrivateSubnet2Id:
    Value: !Ref PrivateSubnet2
  DevSecurityGroupId:
    Value: !Ref DevSg
  TrainSecurityGroupId:
    Value: !Ref TrainSg
  EfsFileSystemId:
    Value: !Ref SharedEfs
  EfsAccessPointId:
    Value: !Ref EfsAccessPoint
  InstanceProfileName:
    Value: !Ref Ec2InstanceProfile
  ArtifactsBucketName:
    Value: !Ref ArtifactsBucket
```

**Notes on this infra choice**

* I included a NAT Gateway for “it just works” outbound (apt, containers, updates). If you later want fully private egress, remove NAT and stage dependencies in S3 plus endpoints.
* EFS uses **Elastic throughput** and encryption.

---

### Step 2 — Launch the always-on dev workstation (no public IP)

You have two viable AMI strategies:

#### Strategy A (fastest, lowest build risk): NVIDIA Marketplace AMI

* Pros: fewer driver/graphics pitfalls; may already include pieces you need.
* Con: **g6e-only** per NVIDIA documentation.

#### Strategy B (more flexible hardware switching): your own Ubuntu-based AMI

* Pros: can run on g4dn/g5/g6/g6e; you control images and can standardize.
* Con: you own driver + Isaac Sim install automation.

Given your goal (“weaker when idle”), Strategy B is usually what teams choose.

---

#### `scripts/20_launch_dev.sh` (Strategy B: Ubuntu + user-data hooks)

This script launches an instance and leaves the DCV/Isaac installation to your bootstrap (next steps).

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

# Pull outputs from the stack
OUT=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" --output json)

get_out() { echo "$OUT" | python3 -c "import sys,json; o=json.load(sys.stdin); print([x['OutputValue'] for x in o if x['OutputKey']=='$1'][0])"; }

SUBNET_ID=$(get_out PrivateSubnet1Id)
SG_ID=$(get_out DevSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)

# Choose your dev instance type (EDIT)
DEV_INSTANCE_TYPE="g6.2xlarge"

# Ubuntu 22.04 AMI via SSM public parameter (stable pattern)
UBUNTU_AMI=$(aws ssm get-parameter \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
  --query "Parameter.Value" --output text)

cat > /tmp/dev-userdata.sh <<'EOF'
#!/bin/bash
set -euxo pipefail

# Basic packages
apt-get update
apt-get install -y unzip jq ca-certificates curl nfs-common

# Create shared mountpoint (EFS will be mounted after you set up efs-utils or mount helper)
mkdir -p /shared
EOF

INSTANCE_ID=$(aws ec2 run-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-id "$UBUNTU_AMI" \
  --instance-type "$DEV_INSTANCE_TYPE" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --no-associate-public-ip-address \
  --user-data file:///tmp/dev-userdata.sh \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-dev},{Key=Project,Value=${PROJECT}},{Key=Role,Value=dev}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Dev instance launched: $INSTANCE_ID"
```

---

### Step 3 — Install/configure Amazon DCV for a shared console session (single shared desktop)

You want everyone sharing one Linux desktop session. The cleanest DCV implementation is:

* **Automatic console session** (`console`) created at boot
* **System authentication**
* **Permissions file** granting a group `display` access (collaboration)

#### What you will do on the dev instance

1. Install DCV Server on Ubuntu (AWS documents the Ubuntu 22.04/24.04 `.tgz` workflow).
2. Configure `/etc/dcv/dcv.conf`:

   * enable auto console session
   * set owner user
   * point to a custom permissions file
   * (optional) ensure QUIC is enabled and UDP 8443 allowed
3. Create Linux users, add them to a group (e.g., `isaac-devs`).
4. Provide teammates the private IP over VPN: `PRIVATE_IP:8443#console`.

#### `scripts/30_configure_dcv_shared.sh` (run via SSH/SSM on the dev instance)

This is a reference bootstrap. It follows AWS’s DCV install approach for Ubuntu (download `.tgz`, install `.deb`).

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1) Install a desktop (choose one; GNOME shown)
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ubuntu-desktop

# 2) Install Amazon DCV Server (Ubuntu 22.04 x86_64 example)
# AWS documents: import GPG key, download tgz, install .deb packages. 
cd /tmp
wget -q https://d1uj6qtbmh3dt5.cloudfront.net/NICE-GPG-KEY
gpg --import NICE-GPG-KEY

wget -q https://d1uj6qtbmh3dt5.cloudfront.net/nice-dcv-ubuntu2204-x86_64.tgz
tar -xvzf nice-dcv-ubuntu2204-x86_64.tgz
cd nice-dcv-*-ubuntu2204-x86_64

sudo apt-get install -y ./nice-dcv-server_*_amd64.ubuntu2204.deb
sudo apt-get install -y ./nice-dcv-web-viewer_*_amd64.ubuntu2204.deb
sudo apt-get install -y ./nice-xdcv_*_amd64.ubuntu2204.deb || true

# AWS also notes adding dcv user to video group 
sudo usermod -aG video dcv

# 3) Create a shared "session owner" user (the desktop session runs as this user)
sudo useradd -m -s /bin/bash workstation || true
sudo passwd workstation

# 4) Create a Linux group for people allowed to connect to the shared desktop
sudo groupadd isaac-devs || true

# Example: add users (repeat per teammate)
# sudo useradd -m -s /bin/bash alice && sudo passwd alice && sudo usermod -aG isaac-devs alice
# sudo useradd -m -s /bin/bash bob   && sudo passwd bob   && sudo usermod -aG isaac-devs bob

# 5) Create a permissions file that allows collaboration to the console session
# Collaboration requires `display` permission. 
sudo tee /etc/dcv/isaac.perm >/dev/null <<'EOF'
[groups]
isaac-devs = group:isaac-devs

[permissions]
# Allow group members to connect/view/control the shared session
isaac-devs allow display clipboard file-transfer

# Owner keeps full control
user:workstation allow builtin
EOF

# 6) Configure DCV: system auth, QUIC (optional), and automatic console session
# Auto console session is configured in dcv.conf; AWS documents create-session/owner config. 
# DCV also supports permissions-file for automatic console session. 
sudo tee /etc/dcv/dcv.conf >/dev/null <<'EOF'
[security]
authentication="system"

[connectivity]
# QUIC may improve responsiveness when UDP is allowed. 
enable-quic-frontend=true
web-port=8443
quic-port=8443

[session-management]
create-session=true

[session-management/automatic-console-session]
owner="workstation"
permissions-file="/etc/dcv/isaac.perm"
# Optional: cap concurrent clients; -1 means no limit. 
max-concurrent-clients=-1
EOF

sudo systemctl enable --now dcvserver
sudo systemctl restart dcvserver

echo "DCV configured. Users connect to: <dev-private-ip>:8443#console"
```

**Important operational notes**

* Collaboration disables multi-monitor.
* All collaborators share the same mouse/keyboard input (this is how DCV collaboration works).

---

### Step 4 — Mount EFS on both dev and training

Use EFS for `/shared`.

From a design perspective, EFS supports encryption and you should mount with TLS for in-transit encryption.

On Ubuntu, install the EFS mount helper (`amazon-efs-utils`) or mount NFS4 directly. The mount helper is strongly recommended for TLS.

**Example (NFSv4 simple mount):**

```bash
sudo apt-get install -y nfs-common
sudo mkdir -p /shared
sudo mount -t nfs4 -o nfsvers=4.1 <EFS_DNS_NAME>:/ /shared
```

(Your team will likely standardize this in user-data.)

---

## 8) Training environment: Spot instance on demand, “hardware switching” via instance-type list

### Spot interruption handling (mandatory for cost-friendly training)

AWS gives a **two-minute interruption notice** for Spot. Plan checkpointing to EFS/S3.

### `scripts/40_launch_train_spot.sh`

This launches training instance(s) using EC2 Fleet with capacity-optimized allocation. You can switch hardware by editing the instance type overrides list.

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

OUT=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" --output json)

get_out() { echo "$OUT" | python3 -c "import sys,json; o=json.load(sys.stdin); print([x['OutputValue'] for x in o if x['OutputKey']=='$1'][0])"; }

SUBNET_ID=$(get_out PrivateSubnet2Id)
LAUNCH_TEMPLATE_ID="${TRAIN_LAUNCH_TEMPLATE_ID:?Set TRAIN_LAUNCH_TEMPLATE_ID in env}"
JOB_ID="${1:-$(date +%Y%m%d-%H%M%S)}"

# Create fleet with capacity-optimized allocation across multiple instance types
FLEET_ID=$(aws ec2 create-fleet \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --type instant \
  --target-capacity-specification TargetCapacity=1,DefaultTargetCapacityType=spot \
  --spot-options AllocationStrategy=capacity-optimized,InstanceInterruptionBehavior=terminate \
  --launch-template-configs '[{
    "LaunchTemplateSpecification": {
      "LaunchTemplateId": "'"$LAUNCH_TEMPLATE_ID"'",
      "Version": "$Latest"
    },
    "Overrides": [
      {"InstanceType": "g6e.4xlarge", "SubnetId": "'"$SUBNET_ID"'"},
      {"InstanceType": "g6e.2xlarge", "SubnetId": "'"$SUBNET_ID"'"},
      {"InstanceType": "g5.4xlarge", "SubnetId": "'"$SUBNET_ID"'"},
      {"InstanceType": "g5.2xlarge", "SubnetId": "'"$SUBNET_ID"'"}
    ]
  }]' \
  --tag-specifications "ResourceType=fleet,Tags=[{Key=Name,Value=${PROJECT}-train-fleet},{Key=JobId,Value=${JOB_ID}}]" \
  --query "FleetId" --output text)

# Get launched instance ID
INSTANCE_ID=$(aws ec2 describe-fleet-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --fleet-id "$FLEET_ID" \
  --query "ActiveInstances[0].InstanceId" --output text)

# Tag the instance with JobId for job runner
aws ec2 create-tags \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --resources "$INSTANCE_ID" \
  --tags Key=JobId,Value="$JOB_ID"

echo "Training Fleet launched: $FLEET_ID"
echo "Instance: $INSTANCE_ID"
echo "Job ID: $JOB_ID"
```

### `scripts/50_terminate_train.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

TRAIN_INSTANCE_ID="${1:?pass instance-id}"
aws ec2 terminate-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --instance-ids "$TRAIN_INSTANCE_ID"
```

---

## 9) Isaac Sim / Isaac Lab installation notes (what I recommend in practice)

### Isaac Sim 5.1.x base requirements

* Ubuntu 22.04/24.04 supported
* RTX-capable GPU with NVIDIA driver:
  * **Recommended**: `535.129.03` (stable, tested baseline for kernel 5.15.x)
  * **Alternative**: `560.35.03+` (for Ubuntu 22.04.5+ with kernel 6.8+)
* For Isaac Lab, Ubuntu 22.04 is called out as a supported environment for local install workflows.
* Python 3.10 is recommended for Isaac Lab compatibility.

### Two approaches you can standardize

**Option 1 (simplify ops): “Golden AMI”**

* Build one dev AMI (interactive) and one train AMI (headless) by:

  1. launching a “builder” instance
  2. installing GPU driver, DCV (dev), Isaac Sim, dependencies
  3. `aws ec2 create-image` to bake it into an AMI
* Then your scripts only launch from your AMI IDs.

**Option 2 (full bootstrap): user-data installs**

* Fully automated, but slower launches and more moving parts (driver installs can be brittle).

Given you want team usability, I recommend **Golden AMIs + simple launch scripts**.

---

## 10) Remote access runbook (for your team)

### Connect workflow

1. Connect to OpenVPN.
2. Use DCV thick client:

   * `DEV_PRIVATE_IP:8443#console`
3. Authenticate with your Linux username/password (system auth).

### If DCV breaks

* Use SSM Session Manager as fallback (no inbound ports needed), assuming SSM endpoints are present.

---

## 11) Key gotchas & how to avoid them

1. **Marketplace AMI hardware lock-in**

   * If you use the official NVIDIA Isaac Sim workstation AMI, plan around **g6e-only**.
   * If you need cheaper hardware for dev, plan custom AMIs.

2. **DCV collaboration ergonomics**

   * Single shared desktop is workable but can be chaotic (shared input); also multi-monitor disabled.
   * Consider norms: one person “drives” at a time; others observe or pair-program.

3. **Spot interruptions**

   * Always write checkpoints to EFS/S3; remember the **2-minute notice**.

4. **EFS performance**

   * Keep heavy caches local; EFS for shared canonical assets and results.

---

## 12) What I would do next (practical next iteration for your team)

1. Decide: **Marketplace g6e-only** vs **custom AMIs**.
2. If custom:

   * Build **one dev AMI** (DCV + Isaac Sim GUI + toolchain)
   * Build **one train AMI** (driver + toolchain + training deps; no desktop needed)
3. Convert the training launcher to an **instance-type list** (Fleet) if you want better Spot capacity.
4. Add a simple “job runner” convention:

   * `s3://…/jobs/<job-id>.json`
   * training instance boots, pulls job JSON, runs, writes results back.

If you want, I can provide:

* a Fleet-based Spot launcher (capacity-optimized across multiple GPU types),
* a concrete “golden AMI bake” script sequence using only AWS CLI,
* and a hardened EFS mount + fstab pattern with Access Points.

But the above is already a complete, terminal-driven blueprint aligned with your requirements (Frankfurt region, VPN-only access, shared GUI via DCV, and scalable hardware switching via a separate training tier).


#!/usr/bin/env bash
# Bootstrap script for Dev workstation to enable shared DCV console session and mount EFS.
# Run on the Dev builder/instance after base OS + driver install.
set -euo pipefail

EFS_FS_ID="${EFS_FS_ID:-}"
EFS_ACCESS_POINT_ID="${EFS_ACCESS_POINT_ID:-}"
MOUNT_POINT="${MOUNT_POINT:-/shared}"

if [[ -z "${EFS_FS_ID}" || -z "${EFS_ACCESS_POINT_ID}" ]]; then
  echo "EFS_FS_ID and EFS_ACCESS_POINT_ID must be set (export before running)." >&2
  exit 1
fi

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ubuntu-desktop amazon-efs-utils nfs-common wget curl jq gpg

# Install Amazon DCV Server (Ubuntu 22.04 example)
cd /tmp
wget -q https://d1uj6qtbmh3dt5.cloudfront.net/NICE-GPG-KEY
gpg --import NICE-GPG-KEY

wget -q https://d1uj6qtbmh3dt5.cloudfront.net/nice-dcv-ubuntu2204-x86_64.tgz
tar -xvzf nice-dcv-ubuntu2204-x86_64.tgz
cd nice-dcv-*-ubuntu2204-x86_64

sudo apt-get install -y ./nice-dcv-server_*_amd64.ubuntu2204.deb
sudo apt-get install -y ./nice-dcv-web-viewer_*_amd64.ubuntu2204.deb
sudo apt-get install -y ./nice-xdcv_*_amd64.ubuntu2204.deb || true

sudo usermod -aG video dcv

# Create shared session owner and group
sudo useradd -m -s /bin/bash workstation || true
sudo groupadd isaac-devs || true
sudo usermod -aG isaac-devs workstation

# Permissions file for collaboration
sudo tee /etc/dcv/isaac.perm >/dev/null <<'EOF'
[permissions]
user:workstation allow builtin
group:isaac-devs allow display clipboard file-transfer
EOF

# DCV config for automatic console session
sudo tee /etc/dcv/dcv.conf >/dev/null <<'EOF'
[security]
authentication="system"

[connectivity]
enable-quic-frontend=true
web-port=8443
quic-port=8443

[session-management]
create-session=true

[session-management/automatic-console-session]
owner="workstation"
permissions-file="/etc/dcv/isaac.perm"
max-concurrent-clients=-1
EOF

# Mount EFS with TLS + Access Point
sudo mkdir -p "${MOUNT_POINT}"
sudo mount -t efs -o tls,accesspoint="${EFS_ACCESS_POINT_ID}" "${EFS_FS_ID}":/ "${MOUNT_POINT}"
echo "${EFS_FS_ID}:/ ${MOUNT_POINT} efs _netdev,tls,accesspoint=${EFS_ACCESS_POINT_ID} 0 0" | sudo tee -a /etc/fstab

sudo systemctl enable --now dcvserver
sudo systemctl restart dcvserver

echo "DCV configured. Connect with: <dev-private-ip>:8443#console"

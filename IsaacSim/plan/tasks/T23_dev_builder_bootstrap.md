# T23_dev_builder_bootstrap

Status: TODO
Depends on: T22_dev_builder_launch
Outputs: Dev builder ready to bake into AMI.

## Purpose

Install and configure everything required for the GUI Dev workstation.

## Steps (on the builder)

1. Update system packages.
2. Install NVIDIA driver `535.129.03` (or `560.35.03+` for kernel 6.8+).
3. Install desktop environment (GNOME/Ubuntu Desktop).
4. Install Amazon DCV server + web viewer.
5. Configure shared **automatic console session**:
   - create `workstation` user
   - create `isaac-devs` group
   - `/etc/dcv/isaac.perm` permissions file
   - `/etc/dcv/dcv.conf` auto console config (+ QUIC if UDP allowed)
6. Mount EFS at `/shared` using TLS + Access Point; add to fstab.
7. Install Omniverse Launcher and Isaac Sim 5.1.x.
8. Install Isaac Lab and Python dependencies.
9. Reboot and validate.

## Reference Commands

### Step 2: NVIDIA Driver Installation

```bash
# Add NVIDIA repository
sudo add-apt-repository -y ppa:graphics-drivers/ppa
sudo apt-get update

# Install specific driver version (535 for kernel 5.15.x)
sudo apt-get install -y nvidia-driver-535

# OR for newer kernels (6.8+), use 560+
# sudo apt-get install -y nvidia-driver-560

# Verify after reboot
nvidia-smi
```

### Step 6: EFS Mount with fstab Persistence

```bash
# Install EFS mount helper
sudo apt-get install -y amazon-efs-utils nfs-common

# Get EFS ID and Access Point ID from infra outputs
EFS_FS_ID="<from-infra-outputs>"
EFS_AP_ID="<from-infra-outputs>"

# Create mount point
sudo mkdir -p /shared

# Mount with TLS and IAM
sudo mount -t efs -o tls,accesspoint=${EFS_AP_ID},iam ${EFS_FS_ID}:/ /shared

# Add to fstab for persistence across reboots
echo "${EFS_FS_ID}:/ /shared efs _netdev,tls,accesspoint=${EFS_AP_ID},iam 0 0" | sudo tee -a /etc/fstab

# Verify mount survives remount
sudo umount /shared
sudo mount -a
ls -la /shared
```

### Step 7: Omniverse Launcher Installation

```bash
# Download Omniverse Launcher AppImage
cd /tmp
wget https://install.launcher.omniverse.nvidia.com/installers/omniverse-launcher-linux.AppImage
chmod +x omniverse-launcher-linux.AppImage

# Install to system-wide location
sudo mkdir -p /opt/nvidia/omniverse
sudo mv omniverse-launcher-linux.AppImage /opt/nvidia/omniverse/

# Create desktop entry for workstation user
mkdir -p /home/workstation/.local/share/applications
cat > /home/workstation/.local/share/applications/omniverse-launcher.desktop << 'EOF'
[Desktop Entry]
Name=NVIDIA Omniverse Launcher
Exec=/opt/nvidia/omniverse/omniverse-launcher-linux.AppImage --no-sandbox
Icon=nvidia
Type=Application
Categories=Development;Graphics;
Terminal=false
EOF

# Set ownership
sudo chown -R workstation:workstation /home/workstation/.local
sudo chown -R workstation:workstation /opt/nvidia/omniverse

# Create Omniverse data directories
sudo mkdir -p /opt/nvidia/omniverse/data
sudo mkdir -p /opt/nvidia/omniverse/cache
sudo chown -R workstation:workstation /opt/nvidia/omniverse
```

**Note:** Isaac Sim 5.1.x will be installed via the Omniverse Launcher GUI after first login:
1. Launch Omniverse Launcher
2. Sign in with NVIDIA account
3. Go to Exchange > Apps > Isaac Sim
4. Install Isaac Sim 5.1.x
5. Typical install path: `~/.local/share/ov/pkg/isaac-sim-5.1.0`

### Step 8: Isaac Lab and Python Dependencies

```bash
# Install miniforge for conda management
cd /tmp
wget https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b -p /opt/miniforge3

# Add to system profile
echo 'export PATH="/opt/miniforge3/bin:$PATH"' | sudo tee /etc/profile.d/conda.sh

# Create Isaac Lab environment
source /opt/miniforge3/bin/activate
conda create -y -n isaaclab python=3.10
conda activate isaaclab

# Install Isaac Lab (after Isaac Sim is installed via Launcher)
# Clone to shared workspace for team access
cd /shared
git clone https://github.com/isaac-sim/IsaacLab.git
cd IsaacLab

# Install dependencies (run after Isaac Sim path is available)
# ./isaaclab.sh --install
```

## DCV Configuration (from guideline.md)

Use the script from `guideline.md` (`scripts/30_configure_dcv_shared.sh`) for:
- DCV server installation
- Automatic console session configuration
- `isaac-devs` group and permissions

## Acceptance

- `nvidia-smi` shows RTX GPU and driver version `535.x` or `560.x`.
- `systemctl status dcvserver` is active.
- `/shared` is mounted and writable.
- `mount | grep shared` shows `efs` with `tls` option.
- `/etc/fstab` contains EFS entry.
- Omniverse Launcher starts successfully.
- Isaac Sim GUI launches from Launcher.

## Rollback

- Fix bootstrap and re-run; if irreparable, terminate builder and relaunch.

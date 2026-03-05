# Repo Mapping (GitHub ↔ server ↔ ROS2 packages)

Last verified: 2026-02-10

This is the “where does this code live” mapping.

## GitHub repos (SRAS ROS2 components)

- Bringup stack (navigation + mapping + rosbridge wiring):
  - GitHub: `DataPilot-R-D/sras_ros2_bringup`
  - Local clone (this machine): `./sras_ros2_bringup`
  - Server path in ROS2 workspace: `/home/ubuntu/ros2_ws/src/sras_bringup`
  - Note (important): on the server, `/home/ubuntu/ros2_ws/src/sras_bringup` was **not** a git repo at the time of verification.

- DimOS VLM bridge (temporal/spatial memory, reasoning):
  - GitHub: `DataPilot-R-D/sras_ros2_dimos_bridge`
  - Local clone (this machine): `./sras_ros2_dimos_bridge`
  - Server repo: `/home/ubuntu/ros2_ws/src/ros2_dimos_bridge` (git, on `main`)
  - Note: there were uncommitted changes on the server (modified `spatial_memory_node.py`, `temporal_memory_node.py`, plus extra configs).

## Other ROS2 deps present on the server

In `/home/ubuntu/ros2_ws/src`:

- `simulation_interfaces`
  - Git: `https://github.com/ros-simulation/simulation_interfaces.git`
  - State: detached HEAD at tag/commit `1.1.0`

- `m-explore-ros2`
  - Git: `https://github.com/robo-friends/m-explore-ros2.git`
  - State: `main` with a local modification to `explore/config/params.yaml`

Also present but **not** git repos (at time of verification, 2026-02-10):

- `vision_llm_srv`
- `sras_qos_tools`
- `my_srvs`
- `sras_bringup` (see above)

Recommendation: create/identify canonical GitHub repos for these packages, or move them under existing SRAS repos, so the server can be reproduced from git.

Package names (from `package.xml` on the server):

- folder `vision_llm_srv` → package `vision_llm_srv`
- folder `sras_qos_tools` → package `sras_qos_tools`
- folder `my_srvs` → package `my_srvs` (interfaces)

## Simulation code

- `/home/ubuntu/go2_omniverse`
  - Git remote: `https://github.com/abizovnuralem/go2_omniverse/`
  - Branch: `added_copter` (local modifications + untracked helper scripts)

This is not in the `DataPilot-R-D/*` org. If this becomes core SRAS infrastructure, it should be forked into the org and pinned to a known commit/tag.

## Proposed “single source of truth” for the server workspace

Add a `ros2_ws.repos` file (vcstool format) and use:

```bash
sudo apt-get update && sudo apt-get install -y python3-vcstool
mkdir -p ~/ros2_ws/src
vcs import ~/ros2_ws/src < ros2_ws.repos
colcon build
```

This makes server bootstrap deterministic and avoids “mystery copied folders”.

## Recommended dev workflow (pragmatic)

1. Make changes in git (local machine) and push to GitHub.
2. On the server, pull updates into the workspace:

```bash
cd ~/ros2_ws/src/ros2_dimos_bridge
git pull
```

3. Rebuild only what changed:

```bash
cd ~/ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select dimos_vlm_bridge sras_bringup vision_llm_srv sras_qos_tools my_srvs
source ~/ros2_ws/install/setup.bash
```

4. Restart the relevant launch (or restart `systemd` services if/when those exist).

If you must hotfix directly on the server, commit or stash immediately and push back to GitHub to avoid divergence.

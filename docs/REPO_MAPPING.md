# Module Mapping (monorepo modules -> server -> ROS 2 packages)

Last updated: 2026-03-05

This is the "where does this code live" mapping for the hackathon monorepo.

## Monorepo modules

| Module | Description | Server path (ROS 2 workspace) |
|---|---|---|
| `modules/ros2-bringup` | Bringup stack (navigation + mapping + rosbridge) | `/home/ubuntu/ros2_ws/src/sras_bringup` |
| `modules/ros2-dimos-bridge` | DimOS VLM bridge (temporal/spatial memory, reasoning) | `/home/ubuntu/ros2_ws/src/ros2_dimos_bridge` |
| `modules/ros2-task-executor` | Robot task execution via Nav2 | `/home/ubuntu/ros2_ws/src/sras_ros2_robot_task_executor` |
| `modules/ros2-task-planner` | Robot task planning with guardrails | `/home/ubuntu/ros2_ws/src/sras_ros2_robot_task_planner` |
| `modules/cosmos-reasoning-benchmark` | Cosmos Reason2 benchmarking + bridge integrations | N/A (runs separately) |
| `modules/dashboard` | Web dashboard + websocket/rosbridge | N/A (runs on operator machine) |
| `modules/simulation` | Isaac Sim / robot simulation (go2_omniverse) | `/home/ubuntu/go2_omniverse` |
| `modules/platform` | Platform orchestration, CI/CD, workspace tooling | N/A |
| `infra/isaac-sim` | AWS Isaac Sim instance setup, CFN, VPN | N/A |

## Other ROS 2 deps present on the server

In `/home/ubuntu/ros2_ws/src`:

- `simulation_interfaces` — `https://github.com/ros-simulation/simulation_interfaces.git` (tag `1.1.0`)
- `m-explore-ros2` — `https://github.com/robo-friends/m-explore-ros2.git` (`main`, local modification to `explore/config/params.yaml`)

Also present but not git repos:

- `vision_llm_srv`
- `sras_qos_tools`
- `my_srvs`

Package names (from `package.xml`):

- `vision_llm_srv` -> package `vision_llm_srv`
- `sras_qos_tools` -> package `sras_qos_tools`
- `my_srvs` -> package `my_srvs` (interfaces)

## Dev workflow

1. Make changes in this monorepo and push.
2. On the server, pull updates into the workspace:

```bash
cd ~/ros2_ws/src/<package>
git pull
```

3. Rebuild only what changed:

```bash
cd ~/ros2_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select dimos_vlm_bridge sras_bringup vision_llm_srv sras_qos_tools my_srvs
source ~/ros2_ws/install/setup.bash
```

4. Restart the relevant launch.

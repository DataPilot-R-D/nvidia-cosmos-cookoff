"""
Louvre Simulation with RL-controlled Go2 Robot and CCTV Cameras
Publishes sensor data via UDP to ROS2 bridge
Receives cmd_vel commands from ROS2 via UDP
"""

import argparse
from isaaclab.app import AppLauncher

# Parse arguments
parser = argparse.ArgumentParser(description="Louvre Simulation with RL Go2")
parser.add_argument("--num_envs", type=int, default=1, help="Number of robot instances")
AppLauncher.add_app_launcher_args(parser)
args = parser.parse_args()

# Launch Isaac Sim
app_launcher = AppLauncher(args)
simulation_app = app_launcher.app

# Imports after SimulationApp
import os
import sys
import torch
import gymnasium as gym
import numpy as np
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import omni.usd
import omni.replicator.core as rep
from isaacsim.core.utils.stage import open_stage
from pxr import UsdGeom, Sdf, Gf

# IsaacLab imports
from isaaclab.envs import ManagerBasedRLEnv
from isaaclab_rl.rsl_rl import RslRlVecEnvWrapper
from rsl_rl.runners import OnPolicyRunner

# Local imports
from custom_rl_env import UnitreeGo2CustomEnvCfg, base_command
from agent_cfg import unitree_go2_agent_cfg
from isaac_camera_udp_publisher import CameraUDPPublisher
from udp_command_bridge import UDPCommandBridge


# ============================================================================
# Configuration
# ============================================================================

CCTV_POSITIONS = [
    (0.0, 6.5, 17),
    (0.0, 6.5, -17.0),
]

CCTV_ROTATIONS_XYZ_DEG = [
    (-25, 0, 0),
    (-25, 180, 0),
]

CAMERA_PARAMS = {
    'focal_length': 24.0,
    'horizontal_aperture': 20.955,
    'width': 640,
    'height': 480,
}


# ============================================================================
# Helper Functions
# ============================================================================

def calculate_camera_intrinsics(focal_length_mm, horizontal_aperture_mm, width, height):
    """Calculate camera intrinsic parameters"""
    fx = (focal_length_mm / horizontal_aperture_mm) * width
    fy = fx
    cx = width / 2.0
    cy = height / 2.0
    return fx, fy, cx, cy


def create_usd_camera(stage, cam_path, position, rotation_xyz_deg):
    """Create a USD camera with position and rotation"""
    parent_path = cam_path.rsplit('/', 1)[0]
    root_xform = UsdGeom.Xform.Define(stage, Sdf.Path(parent_path))
    root_xformable = UsdGeom.Xformable(root_xform)
    root_xformable.ClearXformOpOrder()
    root_xformable.AddTranslateOp().Set(Gf.Vec3d(*position))
    root_xformable.AddRotateXYZOp().Set(Gf.Vec3f(*rotation_xyz_deg))

    camera = UsdGeom.Camera.Define(stage, Sdf.Path(cam_path))
    camera.GetFocalLengthAttr().Set(CAMERA_PARAMS['focal_length'])
    camera.GetHorizontalApertureAttr().Set(CAMERA_PARAMS['horizontal_aperture'])
    camera.GetClippingRangeAttr().Set(Gf.Vec2f(0.1, 100000.0))

    return camera


def setup_cctv_cameras(stage):
    """Setup CCTV cameras and return render products"""
    render_products = []

    for i, (pos, rot) in enumerate(zip(CCTV_POSITIONS, CCTV_ROTATIONS_XYZ_DEG)):
        cam_path = f"/World/cctv_{i}/camera"
        create_usd_camera(stage, cam_path, pos, rot)

        render_product = rep.create.render_product(
            cam_path,
            (CAMERA_PARAMS['width'], CAMERA_PARAMS['height'])
        )
        render_products.append(render_product)

        print(f"Created CCTV camera {i} at {pos}")

    return render_products


def setup_annotators(render_products):
    """Create annotators for render products"""
    annotators = []
    for rp in render_products:
        rgb_annotator = rep.AnnotatorRegistry.get_annotator("rgb")
        rgb_annotator.attach([rp])
        annotators.append(rgb_annotator)
    return annotators


def publish_camera_data(annotators, camera_names, udp_publisher, fx, fy, cx, cy, frame_count):
    """Publish camera images via UDP"""
    sim_time = time.time()

    for i, (annotator, name) in enumerate(zip(annotators, camera_names)):
        if annotator is None:
            continue

        data = annotator.get_data()

        if data is not None and len(data) > 0:
            rgb_array = np.array(data)
            if rgb_array.dtype != np.uint8:
                rgb_array = (rgb_array * 255).astype(np.uint8)

            if len(rgb_array.shape) == 3 and rgb_array.shape[2] == 4:
                rgb_array = rgb_array[:, :, :3]

            if len(rgb_array.shape) == 3 and rgb_array.shape[2] == 3:
                udp_publisher.publish_image(i, rgb_array, sim_time)

                if frame_count % 30 == 0:
                    height, width = rgb_array.shape[:2]
                    udp_publisher.publish_camera_info(
                        i, width, height, fx, fy, cx, cy, sim_time
                    )


def get_checkpoint_path(log_root_path, run_regex, checkpoint_pattern):
    """Find the latest checkpoint matching the pattern"""
    import re
    from pathlib import Path

    # Find matching run directory
    log_path = Path(log_root_path)
    if not log_path.exists():
        raise FileNotFoundError(f"Log directory not found: {log_root_path}")

    run_dirs = [d for d in log_path.iterdir() if d.is_dir() and re.match(run_regex, d.name)]
    if not run_dirs:
        raise FileNotFoundError(f"No run directories matching '{run_regex}' in {log_root_path}")

    # Get the latest run
    latest_run = max(run_dirs, key=lambda d: d.stat().st_mtime)

    # Find matching checkpoint - convert regex pattern to glob pattern
    # model_.*.pt -> model_*.pt
    glob_pattern = checkpoint_pattern.replace('.*', '*').replace('.', '.')
    checkpoint_files = list(latest_run.glob(glob_pattern))
    
    if not checkpoint_files:
        # Try direct glob without conversion
        checkpoint_files = list(latest_run.glob('model_*.pt'))
    
    if not checkpoint_files:
        raise FileNotFoundError(f"No checkpoints matching '{checkpoint_pattern}' in {latest_run}")

    # Get the latest checkpoint (or highest number)
    def get_checkpoint_number(path):
        import re
        match = re.search(r'model_(\d+)\.pt', path.name)
        return int(match.group(1)) if match else 0
    
    latest_checkpoint = max(checkpoint_files, key=get_checkpoint_number)

    return str(latest_checkpoint)


def update_robot_commands(env, num_envs, cmd_bridge):
    """Update robot commands from UDP bridge"""
    global base_command

    for i in range(num_envs):
        cmd = cmd_bridge.get_command(f"go2_{i}")
        base_command[str(i)] = cmd

        # Update command manager if available
        if hasattr(env.unwrapped, 'command_manager') and 'base_velocity' in env.unwrapped.command_manager._terms:
            env.unwrapped.command_manager._terms['base_velocity'].command[i, 0] = cmd[0]  # lin_vel_x
            env.unwrapped.command_manager._terms['base_velocity'].command[i, 1] = cmd[1]  # lin_vel_y
            env.unwrapped.command_manager._terms['base_velocity'].command[i, 2] = cmd[2]  # ang_vel_z


def publish_robot_state(env, num_envs, cmd_bridge):
    """Publish robot state via UDP"""
    robot = env.unwrapped.scene["robot"]

    for i in range(num_envs):
        # Get robot state
        pos = robot.data.root_pos_w[i].cpu().numpy()
        quat = robot.data.root_quat_w[i].cpu().numpy()  # [w, x, y, z] in Isaac
        lin_vel = robot.data.root_lin_vel_w[i].cpu().numpy()
        ang_vel = robot.data.root_ang_vel_w[i].cpu().numpy()

        # Get joint states
        joint_pos = robot.data.joint_pos[i].cpu().numpy()
        joint_names = robot.joint_names

        joint_states = {name: float(pos) for name, pos in zip(joint_names, joint_pos)}

        # Publish (convert quat from [w,x,y,z] to [x,y,z,w] for ROS)
        cmd_bridge.publish_state(
            robot_id=f"go2_{i}",
            position=pos.tolist(),
            orientation=[quat[1], quat[2], quat[3], quat[0]],  # [x,y,z,w]
            linear_vel=lin_vel.tolist(),
            angular_vel=ang_vel.tolist(),
            joint_states=joint_states
        )


# ============================================================================
# Main Simulation
# ============================================================================

def main():
    # Load scene
    usd_path = "/home/ubuntu/go2_omniverse/scenes/Luvr_sky.usda"
    open_stage(usd_path)
    stage = omni.usd.get_context().get_stage()

    print("=" * 60)
    print("Louvre Simulation - RL-controlled Go2 Robot")
    print("=" * 60)

    # Setup CCTV cameras
    cctv_render_products = setup_cctv_cameras(stage)
    cctv_annotators = setup_annotators(cctv_render_products)

    # Setup environment configuration
    env_cfg = UnitreeGo2CustomEnvCfg()
    env_cfg.scene.num_envs = 1  # Force single robot for existing scene

    # Modify robot spawn path to match scene
    from isaaclab_assets.robots.unitree import UNITREE_GO2_CFG
    env_cfg.scene.robot = UNITREE_GO2_CFG.replace(
        prim_path="/World/Luvr/Go2",
        init_state=UNITREE_GO2_CFG.init_state.replace(pos=(0.0, 0.0, 0.5))
    )
    
    # Disable terrain (we're using Louvre scene)
    env_cfg.scene.terrain.terrain_type = "plane"
    env_cfg.scene.terrain.prim_path = "/World/ground"
    
    # Update sensor paths to match robot location (no ENV_REGEX_NS)
    env_cfg.scene.height_scanner.prim_path = "/World/Luvr/Go2/base"
    env_cfg.scene.contact_forces.prim_path = "/World/Luvr/Go2/.*"

    # Create environment
    print("\nCreating IsaacLab environment...")
    env = gym.make("Isaac-Velocity-Rough-Unitree-Go2-v0", cfg=env_cfg)
    env = RslRlVecEnvWrapper(env)

    # Load RL policy
    print("\nLoading RL policy...")
    agent_cfg = unitree_go2_agent_cfg
    log_root_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "logs", "rsl_rl", agent_cfg["experiment_name"]
    )
    log_root_path = os.path.abspath(log_root_path)

    try:
        resume_path = get_checkpoint_path(
            log_root_path,
            agent_cfg["load_run"],
            agent_cfg["load_checkpoint"]
        )
        print(f"Loading checkpoint from: {resume_path}")

        ppo_runner = OnPolicyRunner(env, agent_cfg, log_dir=None, device=agent_cfg["device"])
        ppo_runner.load(resume_path)
        policy = ppo_runner.get_inference_policy(device=env.unwrapped.device)

        print("✓ Policy loaded successfully")
    except Exception as e:
        print(f"⚠ Warning: Could not load policy: {e}")
        print("Robot will use zero actions (will fall)")
        policy = None

    # Reset environment
    obs, _ = env.get_observations()

    # Initialize UDP bridges
    camera_udp = CameraUDPPublisher(host='127.0.0.1', port=9870)
    command_udp = UDPCommandBridge(host='127.0.0.1', cmd_port=9871, state_port=9872)

    # Calculate camera intrinsics
    fx, fy, cx, cy = calculate_camera_intrinsics(
        CAMERA_PARAMS['focal_length'],
        CAMERA_PARAMS['horizontal_aperture'],
        CAMERA_PARAMS['width'],
        CAMERA_PARAMS['height']
    )

    camera_names = [f"cctv{i}" for i in range(len(cctv_render_products))]

    print("\n" + "=" * 60)
    print("Simulation ready!")
    print(f"CCTV cameras: {len(cctv_render_products)}")
    print(f"Go2 robots: {args.num_envs}")
    print(f"Policy: {'Loaded' if policy else 'Not loaded'}")
    print("\nUDP Ports:")
    print("  Camera data: 9870 (Isaac -> ROS2)")
    print("  Commands: 9871 (ROS2 -> Isaac)")
    print("  Robot state: 9872 (Isaac -> ROS2)")
    print("\nStart ROS2 bridge: python3 ros2_sensor_bridge.py")
    print("=" * 60 + "\n")

    # Main simulation loop
    frame_count = 0

    try:
        while simulation_app.is_running():
            # Update commands from ROS2
            update_robot_commands(env, args.num_envs, command_udp)

            # Run RL policy
            with torch.inference_mode():
                if policy is not None:
                    actions = policy(obs)
                else:
                    actions = torch.zeros(args.num_envs, env.unwrapped.num_actions, device=env.unwrapped.device)

                obs, _, _, _ = env.step(actions)

            # Publish camera data every 3 frames (~10 Hz at 30 FPS)
            if frame_count % 3 == 0:
                publish_camera_data(
                    cctv_annotators,
                    camera_names,
                    camera_udp,
                    fx, fy, cx, cy,
                    frame_count
                )

            # Publish robot state every 6 frames (~5 Hz)
            if frame_count % 6 == 0:
                publish_robot_state(env, args.num_envs, command_udp)

            frame_count += 1

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        camera_udp.close()
        command_udp.close()
        simulation_app.close()


if __name__ == "__main__":
    main()

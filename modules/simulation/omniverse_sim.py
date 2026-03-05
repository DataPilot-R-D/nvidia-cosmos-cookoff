# Copyright (c) 2024, RoboVerse community
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


"""Script to play a checkpoint if an RL agent from RSL-RL."""

from __future__ import annotations


"""Launch Isaac Sim Simulator first."""
import argparse
from isaaclab.app import AppLauncher


import cli_args
import time
import os
import threading


# add argparse arguments
parser = argparse.ArgumentParser(description="Train an RL agent with RSL-RL.")
# parser.add_argument("--device", type=str, default="cpu", help="Use CPU pipeline.")
parser.add_argument(
    "--disable_fabric",
    action="store_true",
    default=False,
    help="Disable fabric and use USD I/O operations.",
)
parser.add_argument(
    "--num_envs", type=int, default=1, help="Number of environments to simulate."
)
parser.add_argument(
    "--task",
    type=str,
    default="Isaac-Velocity-Rough-Unitree-Go2-v0",
    help="Name of the task.",
)
parser.add_argument(
    "--seed", type=int, default=None, help="Seed used for the environment"
)
parser.add_argument(
    "--custom_env", type=str, default="", help="Setup the environment"
)
parser.add_argument("--robot", type=str, default="go2", help="Setup the robot")
parser.add_argument(
    "--robot_amount", type=int, default=1, help="Setup the robot amount"
)
parser.add_argument(
    "--with_g1",
    action="store_true",
    default=False,
    help="Spawn a G1 humanoid alongside the Go2 robot.",
)

parser.add_argument(
    "--with_h1",
    action="store_true",
    default=False,
    help="Spawn an H1 humanoid alongside the Go2 robot.",
)


# append RSL-RL cli arguments
cli_args.add_rsl_rl_args(parser)


# append AppLauncher cli args
AppLauncher.add_app_launcher_args(parser)
args_cli = parser.parse_args()


# launch omniverse app
app_launcher = AppLauncher(args_cli)
simulation_app = app_launcher.app


import omni
import omni.timeline

ext_manager = omni.kit.app.get_app().get_extension_manager()
ext_manager.set_extension_enabled_immediate("isaacsim.ros2.bridge", True)

# FOR VR SUPPORT
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.core", True)
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.system.steamvr", True)
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.system.simulatedxr", True)
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.system.openxr", True)
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.telemetry", True)
# ext_manager.set_extension_enabled_immediate("omni.kit.xr.profile.vr", True)


"""Rest everything follows."""
import gymnasium as gym
import torch
import carb


from isaaclab_tasks.utils import get_checkpoint_path
from isaaclab_rl.rsl_rl import (
    RslRlOnPolicyRunnerCfg,
    RslRlVecEnvWrapper,
)
import isaaclab.sim as sim_utils
import omni.appwindow
from rsl_rl.runners import OnPolicyRunner


import rclpy
from ros2 import (
    RobotBaseNode,
    G1BaseNode,
    H1BaseNode,
    add_camera,
    add_cctv_cameras,
    add_copter_camera,
    add_rtx_lidar,
    add_g1_camera,
    add_g1_lidar,
    add_h1_camera,
    add_h1_lidar,
    pub_robo_data_ros2,
    pub_g1_data_ros2,
    pub_h1_data_ros2,
)
from geometry_msgs.msg import Twist


from agent_cfg import unitree_go2_agent_cfg, unitree_g1_agent_cfg, unitree_h1_agent_cfg
from custom_rl_env import UnitreeGo2CustomEnvCfg, G1RoughEnvCfg, G1StandaloneEnvCfg, DualRobotEnvCfg, DualRobotWithH1EnvCfg
import custom_rl_env

from robots.copter.config import CRAZYFLIE_CFG
from isaaclab.assets import Articulation


from omnigraph import create_front_cam_omnigraph, create_cctv_omnigraph, create_g1_front_cam_omnigraph, create_h1_front_cam_omnigraph


G1_HEIGHT_SCAN_DIM = 187  # GridPatternCfg(resolution=0.1, size=[1.6, 1.0]) -> 17x11


class _G1EnvShim:
    """Minimal shim exposing G1 obs/action dims so OnPolicyRunner builds the right network.
    Dimensions are derived at runtime from the actual g1_robot articulation.
    """
    def __init__(self, wrapped_env):
        self._env = wrapped_env
        g1 = wrapped_env.unwrapped.scene["g1_robot"]
        self.num_actions = g1.num_joints
        self.num_obs = 3 + 3 + 3 + 3 + self.num_actions + self.num_actions + self.num_actions + G1_HEIGHT_SCAN_DIM
        self.num_envs = wrapped_env.num_envs
        self.device = wrapped_env.device
        self.cfg = getattr(wrapped_env, "cfg", None)

    def get_observations(self):
        return torch.zeros(self.num_envs, self.num_obs, device=self.device), {"observations": {}}

    def step(self, actions):
        return torch.zeros(self.num_envs, self.num_obs, device=self.device), None, None, None

    def reset(self):
        return torch.zeros(self.num_envs, self.num_obs, device=self.device), {}


def _build_g1_obs(env, last_action):
    """Build the G1 observation vector from the scene articulation data.
    Matches the ObservationsCfg order: base_lin_vel(3), base_ang_vel(3),
    projected_gravity(3), velocity_commands(3), joint_pos_rel(N), joint_vel_rel(N),
    last_action(N), height_scan(H).
    """
    from isaaclab.utils.math import quat_rotate_inverse
    g1 = env.unwrapped.scene["g1_robot"]
    num_envs = g1.data.root_state_w.shape[0]
    device = g1.data.root_state_w.device

    base_lin_vel = g1.data.root_lin_vel_b
    base_ang_vel = g1.data.root_ang_vel_b

    gravity_w = torch.tensor([0.0, 0.0, -1.0], device=device).unsqueeze(0).expand(num_envs, -1)
    projected_gravity = quat_rotate_inverse(g1.data.root_quat_w, gravity_w)

    vel_cmd = torch.zeros(num_envs, 3, device=device)
    for i in range(num_envs):
        if str(i) in custom_rl_env.g1_base_command:
            vel_cmd[i] = torch.tensor(custom_rl_env.g1_base_command[str(i)], device=device)

    joint_pos_rel = g1.data.joint_pos - g1.data.default_joint_pos
    joint_vel_rel = g1.data.joint_vel - g1.data.default_joint_vel

    height_scan = torch.zeros(num_envs, G1_HEIGHT_SCAN_DIM, device=device)

    obs = torch.cat([
        base_lin_vel,
        base_ang_vel,
        projected_gravity,
        vel_cmd,
        joint_pos_rel,
        joint_vel_rel,
        last_action,
        height_scan,
    ], dim=-1)
    return obs



H1_NUM_JOINTS = 19  # H1 has 19 actuated joints
H1_OBS_DIM = 69     # 3+3+3+3+19+19+19 = 69 (no height scan)


class _H1EnvShim:
    """Minimal shim exposing H1 obs/action dims so we can build obs tensors."""
    def __init__(self, wrapped_env):
        self._env = wrapped_env
        h1 = wrapped_env.unwrapped.scene["h1_robot"]
        self.num_actions = h1.num_joints
        self.num_obs = H1_OBS_DIM
        self.num_envs = wrapped_env.num_envs
        self.device = wrapped_env.device


def _build_h1_obs(env, last_action):
    """Build H1 observation: base_lin_vel(3), base_ang_vel(3), projected_gravity(3),
    velocity_commands(3), joint_pos_rel(19), joint_vel_rel(19), last_action(19) = 69."""
    from isaaclab.utils.math import quat_rotate_inverse
    h1 = env.unwrapped.scene["h1_robot"]
    num_envs = h1.data.root_state_w.shape[0]
    device = h1.data.root_state_w.device

    base_lin_vel = h1.data.root_lin_vel_b
    base_ang_vel = h1.data.root_ang_vel_b

    gravity_w = torch.tensor([0.0, 0.0, -1.0], device=device).unsqueeze(0).expand(num_envs, -1)
    projected_gravity = quat_rotate_inverse(h1.data.root_quat_w, gravity_w)

    vel_cmd = torch.zeros(num_envs, 3, device=device)
    for i in range(num_envs):
        if str(i) in custom_rl_env.h1_base_command:
            vel_cmd[i] = torch.tensor(custom_rl_env.h1_base_command[str(i)], device=device)

    joint_pos_rel = h1.data.joint_pos - h1.data.default_joint_pos
    joint_vel_rel = h1.data.joint_vel - h1.data.default_joint_vel

    obs = torch.cat([
        base_lin_vel,
        base_ang_vel,
        projected_gravity,
        vel_cmd,
        joint_pos_rel,
        joint_vel_rel,
        last_action,
    ], dim=-1)
    return obs


def sub_keyboard_event(event, *args, **kwargs) -> bool:

    if len(custom_rl_env.base_command) > 0:
        if event.type == carb.input.KeyboardEventType.KEY_PRESS:
            if event.input.name == "W":
                custom_rl_env.base_command["0"] = [1, 0, 0]
            if event.input.name == "S":
                custom_rl_env.base_command["0"] = [-1, 0, 0]
            if event.input.name == "A":
                custom_rl_env.base_command["0"] = [0, 1, 0]
            if event.input.name == "D":
                custom_rl_env.base_command["0"] = [0, -1, 0]
            if event.input.name == "Q":
                custom_rl_env.base_command["0"] = [0, 0, 1]
            if event.input.name == "E":
                custom_rl_env.base_command["0"] = [0, 0, -1]

            if len(custom_rl_env.g1_base_command) > 0:
                if event.input.name == "I":
                    custom_rl_env.g1_base_command["0"] = [1, 0, 0]
                if event.input.name == "K":
                    custom_rl_env.g1_base_command["0"] = [-1, 0, 0]
                if event.input.name == "J":
                    custom_rl_env.g1_base_command["0"] = [0, 1, 0]
                if event.input.name == "L":
                    custom_rl_env.g1_base_command["0"] = [0, -1, 0]
                if event.input.name == "U":
                    custom_rl_env.g1_base_command["0"] = [0, 0, 1]
                if event.input.name == "O":
                    custom_rl_env.g1_base_command["0"] = [0, 0, -1]
            if len(custom_rl_env.h1_base_command) > 0:
                if event.input.name == "NUMPAD_8":
                    custom_rl_env.h1_base_command["0"] = [1, 0, 0]
                if event.input.name == "NUMPAD_2":
                    custom_rl_env.h1_base_command["0"] = [-1, 0, 0]
                if event.input.name == "NUMPAD_4":
                    custom_rl_env.h1_base_command["0"] = [0, 1, 0]
                if event.input.name == "NUMPAD_6":
                    custom_rl_env.h1_base_command["0"] = [0, -1, 0]
                if event.input.name == "NUMPAD_7":
                    custom_rl_env.h1_base_command["0"] = [0, 0, 1]
                if event.input.name == "NUMPAD_9":
                    custom_rl_env.h1_base_command["0"] = [0, 0, -1]

        elif event.type == carb.input.KeyboardEventType.KEY_RELEASE:
            if event.input.name in ["W", "S", "A", "D", "Q", "E"]:
                for i in range(len(custom_rl_env.base_command)):
                    custom_rl_env.base_command[str(i)] = [0, 0, 0]
            if event.input.name in ["I", "K", "J", "L", "U", "O"]:
                for i in range(len(custom_rl_env.g1_base_command)):
                    custom_rl_env.g1_base_command[str(i)] = [0, 0, 0]
            if event.input.name in ["NUMPAD_8", "NUMPAD_2", "NUMPAD_4", "NUMPAD_6", "NUMPAD_7", "NUMPAD_9"]:
                for i in range(len(custom_rl_env.h1_base_command)):
                    custom_rl_env.h1_base_command[str(i)] = [0, 0, 0]
    return True


def move_copter(copter):

    # TODO tmp solution for test
    if custom_rl_env.base_command["0"] == [0, 0, 0]:
        copter_move_cmd = torch.tensor(
            [[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [1, 0, 0]:
        copter_move_cmd = torch.tensor(
            [[1.0, 0.0, 0.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [-1, 0, 0]:
        copter_move_cmd = torch.tensor(
            [[-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [0, 1, 0]:
        copter_move_cmd = torch.tensor(
            [[0.0, 1.0, 0.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [0, -1, 0]:
        copter_move_cmd = torch.tensor(
            [[0.0, -1.0, 0.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [0, 0, 1]:
        copter_move_cmd = torch.tensor(
            [[0.0, 0.0, 1.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    if custom_rl_env.base_command["0"] == [0, 0, -1]:
        copter_move_cmd = torch.tensor(
            [[0.0, 0.0, -1.0, 0.0, 0.0, 0.0]], device="cuda:0"
        )

    copter.write_root_velocity_to_sim(copter_move_cmd)
    copter.write_data_to_sim()


def setup_custom_env():
    try:
        if args_cli.custom_env == "warehouse" or args_cli.custom_env == "small_warehouse":
            cfg_scene = sim_utils.UsdFileCfg(usd_path="https://omniverse-content-production.s3-us-west-2.amazonaws.com/Assets/Isaac/4.5/Isaac/Environments/Simple_Warehouse/warehouse.usd")
            #cfg_scene = sim_utils.UsdFileCfg(usd_path="/home/ubuntu/go2_omniverse/warehouse_with_window.usda")
            cfg_scene.func("/World/warehouse", cfg_scene, translation=(0.0, 0.0, 0.0))

        print(f"[DEBUG] custom_env = {args_cli.custom_env}", flush=True)
        if args_cli.custom_env == "louvre":
            cfg_scene = sim_utils.UsdFileCfg(usd_path="/home/ubuntu/go2_omniverse/scenes/Luvr.usd")
            # Scene at Z=0, robots will spawn higher
            cfg_scene.func("/World/louvre", cfg_scene, translation=(0.0, 0.0, 0.0))
            # Y-up -> Z-up rotation (DAZ Studio exports Y-up, Isaac Sim uses Z-up)
            from pxr import UsdGeom
            stage = omni.usd.get_context().get_stage()
            prim = stage.GetPrimAtPath("/World/louvre")
            if prim.IsValid():
                xformable = UsdGeom.Xformable(prim)
                xformable.AddRotateXOp().Set(90.0)
                print("[DEBUG] Louvre rotated -90 X (Y-up -> Z-up)", flush=True)
            else:
                print("[DEBUG] ERROR: /World/louvre prim not found!", flush=True)

            # Add lighting for Louvre scene
            from pxr import UsdLux
            light = UsdLux.DistantLight.Define(stage, "/World/LouvreLight")
            light.CreateIntensityAttr(3000)
            light.CreateAngleAttr(0.53)
            print("[INFO] Louvre DistantLight added", flush=True)

            # Add collision boxes for Louvre gallery (lightweight, no per-mesh collision)
            from pxr import UsdPhysics, Gf
            def _add_collision_box(stg, name, pos, scale):
                path = f"/World/louvre/Collision/{name}"
                cube = UsdGeom.Cube.Define(stg, path)
                cube.CreateSizeAttr(1.0)
                cube.CreatePurposeAttr("guide")  # invisible in render
                xf = UsdGeom.Xformable(cube)
                xf.AddTranslateOp().Set(Gf.Vec3d(*pos))
                xf.AddScaleOp().Set(Gf.Vec3f(*scale))
                UsdPhysics.CollisionAPI.Apply(cube.GetPrim())

            # Gallery dims: X ~10m, Y ~41.4m, Z ~8.15m (post Y->Z rotation)
            # Floor at Z=0, walls 2m high (robots spawn at ~Z=0.5)
            _add_collision_box(stage, "WallPosX", (5.1, 0, 1.0),   (0.2, 41.4, 2.0))
            _add_collision_box(stage, "WallNegX", (-5.1, 0, 1.0),  (0.2, 41.4, 2.0))
            _add_collision_box(stage, "WallPosY", (0, 20.8, 1.0),  (10, 0.2, 2.0))
            _add_collision_box(stage, "WallNegY", (0, -20.8, 1.0), (10, 0.2, 2.0))
            print("[INFO] Louvre collision: 5 boxes (floor + 4 walls)", flush=True)
            print("[DEBUG] Louvre scene loaded!", flush=True)

        if args_cli.custom_env == "office":
            cfg_scene = sim_utils.UsdFileCfg(usd_path="./envs/office.usd")
            cfg_scene.func("/World/office", cfg_scene, translation=(0.0, 0.0, 0.0))
    except Exception as e:
        import traceback; traceback.print_exc()
        print(
            "Error loading custom environment. You should download custom envs folder from: https://drive.google.com/drive/folders/1vVGuO1KIX1K6mD6mBHDZGm9nk2vaRyj3?usp=sharing"
        )

    add_cctv_cameras()
    for i in range(3):
        create_cctv_omnigraph(i)


def cmd_vel_cb(msg, num_robot):
    x = msg.linear.x
    y = msg.linear.y
    z = msg.angular.z
    custom_rl_env.base_command[str(num_robot)] = [x, y, z]
    print(f"[CMD_VEL] Go2 robot{num_robot}: linear.x={x}, linear.y={y}, angular.z={z}", flush=True)
    print(f"[CMD_VEL] base_command dict keys: {list(custom_rl_env.base_command.keys())}", flush=True)


def g1_cmd_vel_cb(msg, num_robot):
    x = msg.linear.x
    y = msg.linear.y
    z = msg.angular.z
    custom_rl_env.g1_base_command[str(num_robot)] = [x, y, z]


def h1_cmd_vel_cb(msg, num_robot):
    x = msg.linear.x
    y = msg.linear.y
    z = msg.angular.z
    custom_rl_env.h1_base_command[str(num_robot)] = [x, y, z]


def add_cmd_sub(num_envs, with_g1=False, with_h1=False):
    node_test = rclpy.create_node("position_velocity_publisher")
    print(f"[INFRA-DEBUG] add_cmd_sub called, num_envs={num_envs}, with_g1={with_g1}, with_h1={with_h1}", flush=True)
    print(f"[INFRA-DEBUG] Initializing base_command dict with {num_envs} entries", flush=True)
    for i in range(num_envs):
        custom_rl_env.base_command[str(i)] = [0.0, 0.0, 0.0]
        node_test.create_subscription(
            Twist, f"robot{i}/cmd_vel", lambda msg, i=i: cmd_vel_cb(msg, str(i)), 10
        )
        print(f"[INFRA-DEBUG] Created subscription for robot{i}/cmd_vel", flush=True)
    if with_g1:
        for i in range(num_envs):
            node_test.create_subscription(
                Twist, f"g1_{i}/cmd_vel", lambda msg, i=i: g1_cmd_vel_cb(msg, str(i)), 10
            )
    if with_h1:
        for i in range(num_envs):
            node_test.create_subscription(
                Twist, f"h1_{i}/cmd_vel", lambda msg, i=i: h1_cmd_vel_cb(msg, str(i)), 10
            )
    print(f"[INFRA-DEBUG] base_command dict after init: {custom_rl_env.base_command}", flush=True)
    # Spin in a separate thread
    thread = threading.Thread(target=rclpy.spin, args=(node_test,), daemon=True)
    thread.start()
    print("[INFRA-DEBUG] cmd_vel subscriber thread started", flush=True)


def specify_cmd_for_robots(numv_envs):
    for i in range(numv_envs):
        custom_rl_env.base_command[str(i)] = [0, 0, 0]


def run_sim():

    # acquire input interface
    _input = carb.input.acquire_input_interface()
    _appwindow = omni.appwindow.get_default_app_window()
    if _appwindow is not None:
        _keyboard = _appwindow.get_keyboard()
        _sub_keyboard = _input.subscribe_to_keyboard_events(_keyboard, sub_keyboard_event)
    else:
        print("[WARN] No app window available, keyboard disabled", flush=True)

    """Play with RSL-RL agent."""
    # parse configuration

    env_cfg = UnitreeGo2CustomEnvCfg()

    if args_cli.robot == "g1":
        env_cfg = G1RoughEnvCfg()
    elif args_cli.with_g1:
        env_cfg = DualRobotEnvCfg()
    elif args_cli.with_h1:
        env_cfg = DualRobotWithH1EnvCfg()

    # TODO need to think about better copter integration.
    # copter_cfg = CRAZYFLIE_CFG
    # copter_cfg.spawn.func(
    #     "/World/Crazyflie/Robot_1", copter_cfg.spawn, translation=(1.5, 0.5, 2.42)
    # )

    # # create handles for the robots
    # copter = Articulation(copter_cfg.replace(prim_path="/World/Crazyflie/Robot.*"))

    # add N robots to env
    env_cfg.scene.num_envs = args_cli.robot_amount

    specify_cmd_for_robots(env_cfg.scene.num_envs)

    agent_cfg: RslRlOnPolicyRunnerCfg = unitree_go2_agent_cfg

    if args_cli.robot == "g1":
        agent_cfg: RslRlOnPolicyRunnerCfg = unitree_g1_agent_cfg

    # create isaac environment
    env = gym.make(args_cli.task, cfg=env_cfg)
    # wrap around environment for rsl-rl
    env = RslRlVecEnvWrapper(env)

    # specify directory for logging experiments
    log_root_path = os.path.join("logs", "rsl_rl", agent_cfg["experiment_name"])
    log_root_path = os.path.abspath(log_root_path)
    print(f"[INFO] Loading experiment from directory: {log_root_path}")

    resume_path = get_checkpoint_path(
        log_root_path, agent_cfg["load_run"], agent_cfg["load_checkpoint"]
    )

    # load previously trained model
    ppo_runner = OnPolicyRunner(
        env, agent_cfg, log_dir=None, device=agent_cfg["device"]
    )
    ppo_runner.load(resume_path)
    print(f"[INFO]: Loading model checkpoint from: {resume_path}")

    # obtain the trained policy for inference
    policy = ppo_runner.get_inference_policy(device=env.unwrapped.device)

    # reset environment
    obs, _ = env.get_observations()

    # --- G1 humanoid alongside Go2 ---
    g1_policy = None
    g1_obs = None
    g1_node = None
    g1_annotator_lst = []
    g1_last_action = None

    if args_cli.with_g1 and args_cli.robot != "g1":
        g1_log_root_path = os.path.abspath(
            os.path.join("logs", "rsl_rl", unitree_g1_agent_cfg["experiment_name"])
        )
        print(f"[INFO] Loading G1 experiment from directory: {g1_log_root_path}")
        g1_resume_path = get_checkpoint_path(
            g1_log_root_path,
            unitree_g1_agent_cfg["load_run"],
            unitree_g1_agent_cfg["load_checkpoint"],
        )
        g1_runner = OnPolicyRunner(
            _G1EnvShim(env), unitree_g1_agent_cfg, log_dir=None, device=unitree_g1_agent_cfg["device"]
        )
        g1_runner.load(g1_resume_path)
        print(f"[INFO]: Loading G1 model checkpoint from: {g1_resume_path}")
        g1_policy = g1_runner.get_inference_policy(device=env.unwrapped.device)

    # initialize ROS2 node
    rclpy.init()
    base_node = RobotBaseNode(env_cfg.scene.num_envs)
    # --- H1 humanoid alongside Go2 (init vars) ---
    h1_policy_model = None
    h1_last_action = None

    # add_cmd_sub moved after H1 policy load

    try:
        annotator_lst = add_rtx_lidar(env_cfg.scene.num_envs, args_cli.robot, "UnitreeL1", False)
    except NameError as e:
        print(f"[WARN] Skipping RTX Lidar: {e}", flush=True)
        annotator_lst = []
    add_camera(env_cfg.scene.num_envs, args_cli.robot)
    # add_copter_camera()
   
    # create ros2 camera stream omnigraph
    for i in range(env_cfg.scene.num_envs):
        create_front_cam_omnigraph(i)

    if g1_policy is not None:
        g1_node = G1BaseNode(args_cli.robot_amount)
        g1_annotator_lst = add_g1_lidar(args_cli.robot_amount)
        add_g1_camera(args_cli.robot_amount)
        for i in range(args_cli.robot_amount):
            create_g1_front_cam_omnigraph(i)
        g1_robot = env.unwrapped.scene["g1_robot"]
        g1_num_joints = g1_robot.num_joints
        g1_last_action = torch.zeros(args_cli.robot_amount, g1_num_joints, device=env.unwrapped.device)
        for i in range(args_cli.robot_amount):
            custom_rl_env.g1_base_command[str(i)] = [0, 0, 0]

    # --- H1 humanoid alongside Go2 ---
    h1_policy_model = None
    h1_last_action = None

    if args_cli.with_h1 and args_cli.robot != "h1":
        import os as _os
        h1_policy_path = _os.path.join(_os.path.dirname(__file__), "h1_assets", "policy", "h1_policy.pt")
        print(f"[INFO] Loading H1 TorchScript policy from: {h1_policy_path}")
        h1_policy_model = torch.jit.load(h1_policy_path, map_location=env.unwrapped.device)
        h1_policy_model.eval()
        h1_robot = env.unwrapped.scene["h1_robot"]
        h1_num_joints = h1_robot.num_joints
        h1_last_action = torch.zeros(args_cli.robot_amount, h1_num_joints, device=env.unwrapped.device)
        for i in range(args_cli.robot_amount):
            custom_rl_env.h1_base_command[str(i)] = [0, 0, 0]
        print(f"[INFO] H1 loaded: {h1_num_joints} joints, TorchScript policy")

    # --- H1 sensors and ROS2 node ---
    h1_node = None
    h1_annotator_lst = []
    if h1_policy_model is not None:
        h1_node = H1BaseNode(args_cli.robot_amount)
        h1_annotator_lst = add_h1_lidar(args_cli.robot_amount)
        add_h1_camera(args_cli.robot_amount)
        for i in range(args_cli.robot_amount):
            create_h1_front_cam_omnigraph(i)

    setup_custom_env()

    # cmd_vel subscriptions directly on base_node (avoids rclpy spin conflict / wait set index bug)
    from geometry_msgs.msg import Twist
    for i in range(env_cfg.scene.num_envs):
        custom_rl_env.base_command[str(i)] = [0.0, 0.0, 0.0]
        base_node.create_subscription(
            Twist, f"robot{i}/cmd_vel", lambda msg, i=i: cmd_vel_cb(msg, str(i)), 10
        )
        print(f"[INFO] Created cmd_vel subscription for robot{i} on base_node", flush=True)
    if h1_policy_model is not None:
        for i in range(env_cfg.scene.num_envs):
            custom_rl_env.h1_base_command[str(i)] = [0.0, 0.0, 0.0]
            base_node.create_subscription(
                Twist, f"h1_{i}/cmd_vel", lambda msg, i=i: h1_cmd_vel_cb(msg, str(i)), 10
            )
            print(f"[INFO] Created cmd_vel subscription for h1_{i} on base_node", flush=True)
    if g1_policy is not None:
        for i in range(env_cfg.scene.num_envs):
            custom_rl_env.g1_base_command[str(i)] = [0.0, 0.0, 0.0]
            base_node.create_subscription(
                Twist, f"g1_{i}/cmd_vel", lambda msg, i=i: g1_cmd_vel_cb(msg, str(i)), 10
            )
            print(f"[INFO] Created cmd_vel subscription for g1_{i} on base_node", flush=True)
    print(f"[INFO] All cmd_vel subscriptions on base_node. base_command={custom_rl_env.base_command}", flush=True)

    # Apply dark metallic material to H1 (default USD has no textures)
    if args_cli.with_h1:
        try:
            from pxr import Usd, UsdShade, Sdf, Gf
            stage = omni.usd.get_context().get_stage()
            # Create dark metallic material
            mat_path = "/World/H1_Material"
            mat_prim = stage.DefinePrim(mat_path, "Material")
            mat = UsdShade.Material(mat_prim)
            shader = UsdShade.Shader.Define(stage, mat_path + "/Shader")
            shader.CreateIdAttr("UsdPreviewSurface")
            shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.18, 0.20, 0.22))
            shader.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(0.7)
            shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.55)
            shader.CreateInput("specularColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.4, 0.4, 0.45))
            mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), "surface")
            # Apply to all H1 mesh prims
            h1_root = stage.GetPrimAtPath("/World/envs/env_0/H1Robot")
            if h1_root.IsValid():
                count = 0
                for prim in Usd.PrimRange(h1_root):
                    if prim.GetTypeName() == "Mesh":
                        UsdShade.MaterialBindingAPI.Apply(prim)
                        UsdShade.MaterialBindingAPI(prim).Bind(mat)
                        count += 1
                print(f"[INFO] Applied dark metallic material to {count} H1 meshes", flush=True)
            else:
                print("[WARN] H1Robot prim not found for material application", flush=True)
        except Exception as e:
            print(f"[WARN] H1 material application failed: {e}", flush=True)
    timeline = omni.timeline.get_timeline_interface()

    # simulate environment
    while simulation_app.is_running():
        # run everything in inference mode
        with torch.inference_mode():
            # publish clock
            sim_time = timeline.get_current_time()
            base_node.publish_clock(sim_time)
            rclpy.spin_once(base_node, timeout_sec=0)
            # agent stepping
            actions = policy(obs)
            # env stepping
            obs, _, _, _ = env.step(actions)
            
            # Update command_manager with ROS2 commands AFTER env.step() (env.step resets it!)
            if hasattr(env.unwrapped, 'command_manager') and 'base_velocity' in env.unwrapped.command_manager._terms:
                for i in range(env_cfg.scene.num_envs):
                    if str(i) in custom_rl_env.base_command:
                        cmd = custom_rl_env.base_command[str(i)]
                        # Set command directly in command_manager: [lin_vel_x, lin_vel_y, ang_vel_z]
                        env.unwrapped.command_manager._terms['base_velocity'].command[i, 0] = cmd[0]  # lin_vel_x
                        env.unwrapped.command_manager._terms['base_velocity'].command[i, 1] = cmd[1]  # lin_vel_y
                        env.unwrapped.command_manager._terms['base_velocity'].command[i, 2] = cmd[2]  # ang_vel_z
                        # Debug: print update (only for robot 0, every 50 steps)
                        if i == 0 and hasattr(env, '_cmd_mgr_debug_counter'):
                            env._cmd_mgr_debug_counter += 1
                        elif i == 0:
                            env._cmd_mgr_debug_counter = 0
                        if i == 0 and env._cmd_mgr_debug_counter % 50 == 0:
                            new_cmd = env.unwrapped.command_manager._terms['base_velocity'].command[i]
                            print(f"[CMD_MANAGER_AFTER_STEP_UPDATE] robot{i}: command={new_cmd.cpu().numpy()}, base_command={cmd}", flush=True)
            pub_robo_data_ros2(
                args_cli.robot,
                env_cfg.scene.num_envs,
                base_node,
                env,
                annotator_lst,
            )
            # move_copter(copter)

            if g1_policy is not None:
                g1_obs = _build_g1_obs(env, g1_last_action)
                g1_actions = g1_policy(g1_obs)
                g1_last_action = g1_actions.clone()
                g1_robot = env.unwrapped.scene["g1_robot"]
                g1_robot.set_joint_position_target(g1_actions * 0.5)
                rclpy.spin_once(g1_node, timeout_sec=0)
                pub_g1_data_ros2(
                    args_cli.robot_amount,
                    g1_node,
                    env,
                    g1_annotator_lst,
                )

            # --- H1 stepping ---
            if h1_policy_model is not None:
                h1_obs = _build_h1_obs(env, h1_last_action)
                with torch.no_grad():
                    h1_actions = h1_policy_model(h1_obs)
                h1_last_action = h1_actions.clone()
                h1_robot = env.unwrapped.scene["h1_robot"]
                # Policy outputs DELTA from default pos, apply as: default + action * scale
                h1_robot.set_joint_position_target(h1_robot.data.default_joint_pos + h1_actions * 0.5)
                if h1_node is not None:
                    rclpy.spin_once(h1_node, timeout_sec=0)
                    pub_h1_data_ros2(args_cli.robot_amount, h1_node, env, h1_annotator_lst)

    env.close()


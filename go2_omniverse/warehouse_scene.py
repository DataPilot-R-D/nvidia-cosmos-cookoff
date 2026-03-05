from __future__ import annotations

import argparse
import os
import sys
import time

from patrol_controller import WaypointPatrolController
from warehouse_config import WarehouseConfig

try:
    from isaaclab.app import AppLauncher
except Exception as exc:
    AppLauncher = None
    _APP_IMPORT_ERROR = exc
else:
    _APP_IMPORT_ERROR = None


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Isaac Sim warehouse patrol demo scene.")
    parser.add_argument("--ros2", action="store_true", default=False)
    parser.add_argument("--patrol-speed", type=float, default=0.7)
    parser.add_argument("--patrol-dt", type=float, default=1.0 / 60.0)
    return parser


def _ensure_app_launcher() -> None:
    if AppLauncher is not None:
        return
    print("Failed to import Isaac Lab AppLauncher:", _APP_IMPORT_ERROR)
    print("Run this script from an Isaac Lab/Isaac Sim python environment.")
    raise SystemExit(1)


def _import_isaac_runtime():
    try:
        import omni
        import omni.timeline
        import omni.graph.core as og
        import omni.kit.commands
        import isaaclab.sim as sim_utils
        from isaaclab_assets.robots.unitree import UNITREE_GO2_CFG
        from isaaclab.sensors import Camera, CameraCfg
        from pxr import Gf, UsdGeom, UsdLux, Sdf
    except Exception as exc:
        print("Failed to import Isaac Sim runtime modules:", exc)
        raise SystemExit(1) from exc

    return omni, og, sim_utils, UNITREE_GO2_CFG, Camera, CameraCfg, Gf, UsdGeom, UsdLux, Sdf


class WarehouseSceneDemo:
    def __init__(
        self,
        cfg: WarehouseConfig,
        patrol_speed_mps: float,
        sim_utils,
        unitree_go2_cfg,
        camera_cls,
        camera_cfg_cls,
        omni,
        og,
        gf,
        usd_geom,
        usd_lux,
        sdf,
        ros2_enabled: bool,
    ) -> None:
        self.cfg = cfg
        self._sim_utils = sim_utils
        self._unitree_go2_cfg = unitree_go2_cfg
        self._camera_cls = camera_cls
        self._camera_cfg_cls = camera_cfg_cls
        self._omni = omni
        self._og = og
        self._Gf = gf
        self._UsdGeom = usd_geom
        self._UsdLux = usd_lux
        self._Sdf = sdf
        self._ros2_enabled = ros2_enabled
        self._stage = omni.usd.get_context().get_stage()
        self._patrol = WaypointPatrolController(cfg.patrol_waypoints, speed_mps=patrol_speed_mps)

    def setup(self) -> None:
        self._spawn_warehouse()
        self._spawn_go2()
        self._setup_lighting()
        self._create_shelf_and_window()
        self._setup_camera()
        if self._ros2_enabled:
            self._create_camera_ros_graph()
        self._setup_lidar()

    def _spawn_warehouse(self) -> None:
        scene_cfg = self._sim_utils.UsdFileCfg(usd_path=self.cfg.warehouse_usd)
        scene_cfg.func(self.cfg.warehouse_prim_path, scene_cfg, translation=(0.0, 0.0, 0.0))

    def _spawn_go2(self) -> None:
        robot_cfg = self._unitree_go2_cfg.replace(prim_path=self.cfg.robot_prim_path)
        robot_cfg.spawn.func(
            self.cfg.robot_prim_path,
            robot_cfg.spawn,
            translation=self.cfg.robot_spawn_xyz,
            orientation=self._euler_to_quat(*self.cfg.robot_spawn_rpy_deg),
        )

    def _setup_lighting(self) -> None:
        dome = self._UsdLux.DomeLight.Define(self._stage, self._Sdf.Path("/World/Lights/Ambient"))
        dome.CreateIntensityAttr(self.cfg.ambient_intensity)
        dome.CreateColorAttr(self._Gf.Vec3f(0.5, 0.5, 0.55))

        for light_cfg in self.cfg.spot_lights:
            light = self._UsdLux.SphereLight.Define(self._stage, self._Sdf.Path(light_cfg.prim_path))
            light.CreateIntensityAttr(light_cfg.intensity)
            light.CreateColorTemperatureAttr(light_cfg.color_temperature)
            light.CreateRadiusAttr(0.08)
            xform = self._UsdGeom.Xformable(light.GetPrim())
            self._set_or_create_translate(xform, light_cfg.position)
            self._set_or_create_rotate_xyz(xform, light_cfg.rotation_xyz_deg)

    def _create_shelf_and_window(self) -> None:
        shelf_prim = self._UsdGeom.Xform.Define(
            self._stage, self._Sdf.Path(self.cfg.shelf.prim_path)
        )
        shelf_cube = self._UsdGeom.Cube.Define(
            self._stage, self._Sdf.Path(f"{self.cfg.shelf.prim_path}/Geometry")
        )
        shelf_cube.CreateSizeAttr(1.0)
        shelf_cube.AddScaleOp().Set((1.0, 0.35, 1.6))
        shelf_xform = self._UsdGeom.Xformable(shelf_prim.GetPrim())
        self._set_or_create_translate(shelf_xform, self.cfg.shelf.translation)
        self._set_or_create_rotate_xyz(shelf_xform, self.cfg.shelf.rotation_xyz_deg)

        window_prim = self._UsdGeom.Xform.Define(
            self._stage, self._Sdf.Path(self.cfg.window.prim_path)
        )
        window_cube = self._UsdGeom.Cube.Define(
            self._stage, self._Sdf.Path(f"{self.cfg.window.prim_path}/Geometry")
        )
        window_cube.CreateSizeAttr(1.0)
        window_cube.AddScaleOp().Set((1.2, 0.05, 0.8))
        window_xform = self._UsdGeom.Xformable(window_prim.GetPrim())
        self._set_or_create_translate(window_xform, self.cfg.window.translation)
        self._set_or_create_rotate_xyz(window_xform, self.cfg.window.rotation_xyz_deg)

    def set_shelf_tilt(self, tilt_deg: float) -> None:
        prim = self._stage.GetPrimAtPath(self.cfg.shelf.prim_path)
        if not prim.IsValid():
            return
        xform = self._UsdGeom.Xformable(prim)
        self._set_or_create_rotate_xyz(xform, (tilt_deg, 0.0, 0.0))

    def set_window_open(self, is_open: bool) -> None:
        prim = self._stage.GetPrimAtPath(self.cfg.window.prim_path)
        if not prim.IsValid():
            return
        xform = self._UsdGeom.Xformable(prim)
        base_x, base_y, base_z = self.cfg.window.translation
        offset = self.cfg.window_open_offset_m if is_open else 0.0
        self._set_or_create_translate(xform, (base_x + offset, base_y, base_z))

    def _setup_camera(self) -> None:
        cam_cfg = self._camera_cfg_cls(
            prim_path=self.cfg.camera_prim_path,
            update_period=1.0 / 30.0,
            height=self.cfg.camera_resolution[1],
            width=self.cfg.camera_resolution[0],
            data_types=["rgb"],
            spawn=self._sim_utils.PinholeCameraCfg(
                focal_length=24.0,
                focus_distance=400.0,
                horizontal_aperture=20.955,
                clipping_range=(0.1, 1.0e5),
            ),
            offset=self._camera_cfg_cls.OffsetCfg(
                pos=(0.32487, -0.00095, 0.05362),
                rot=(0.5, -0.5, 0.5, -0.5),
                convention="ros",
            ),
        )
        self._camera_cls(cam_cfg)

    def _create_camera_ros_graph(self) -> None:
        keys = self._og.Controller.Keys
        graph_path = "/ROS/warehouse_camera"
        self._og.Controller.edit(
            {
                "graph_path": graph_path,
                "evaluator_name": "execution",
                "pipeline_stage": self._og.GraphPipelineStage.GRAPH_PIPELINE_STAGE_SIMULATION,
            },
            {
                keys.CREATE_NODES: [
                    ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
                    ("IsaacCreateRenderProduct", "isaacsim.core.nodes.IsaacCreateRenderProduct"),
                    ("ROS2CameraHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                    ("ROS2CameraInfoHelper", "isaacsim.ros2.bridge.ROS2CameraHelper"),
                ],
                keys.SET_VALUES: [
                    ("IsaacCreateRenderProduct.inputs:cameraPrim", self.cfg.camera_prim_path),
                    ("IsaacCreateRenderProduct.inputs:enabled", True),
                    ("IsaacCreateRenderProduct.inputs:width", self.cfg.camera_resolution[0]),
                    ("IsaacCreateRenderProduct.inputs:height", self.cfg.camera_resolution[1]),
                    ("ROS2CameraHelper.inputs:type", "rgb"),
                    ("ROS2CameraHelper.inputs:topicName", self.cfg.camera_topic),
                    ("ROS2CameraHelper.inputs:frameId", self.cfg.camera_frame),
                    ("ROS2CameraInfoHelper.inputs:type", "camera_info"),
                    ("ROS2CameraInfoHelper.inputs:topicName", self.cfg.camera_info_topic),
                    ("ROS2CameraInfoHelper.inputs:frameId", self.cfg.camera_frame),
                ],
                keys.CONNECT: [
                    ("OnPlaybackTick.outputs:tick", "IsaacCreateRenderProduct.inputs:execIn"),
                    ("IsaacCreateRenderProduct.outputs:execOut", "ROS2CameraHelper.inputs:execIn"),
                    (
                        "IsaacCreateRenderProduct.outputs:renderProductPath",
                        "ROS2CameraHelper.inputs:renderProductPath",
                    ),
                    ("OnPlaybackTick.outputs:tick", "ROS2CameraInfoHelper.inputs:execIn"),
                    (
                        "IsaacCreateRenderProduct.outputs:renderProductPath",
                        "ROS2CameraInfoHelper.inputs:renderProductPath",
                    ),
                ],
            },
        )

    def _setup_lidar(self) -> None:
        if not os.path.exists(self.cfg.lidar_config_file):
            print(
                f"Warning: lidar config file not found at {self.cfg.lidar_config_file}. "
                "Expected Unitree_L1 config in Isaac Sim extension path."
            )
        qx, qy, qz, qw = self.cfg.lidar_orientation_xyzw
        self._omni.kit.commands.execute(
            "IsaacSensorCreateRtxLidar",
            path=self.cfg.lidar_prim_path,
            parent=None,
            translation=self.cfg.lidar_translation,
            orientation=self._Gf.Quatd(qw, qx, qy, qz),
            config=self.cfg.lidar_config_name,
        )

    def step_patrol(self, dt: float) -> None:
        prim = self._stage.GetPrimAtPath(self.cfg.robot_prim_path)
        if not prim.IsValid():
            return
        xform = self._UsdGeom.Xformable(prim)
        local_xform = xform.GetLocalTransformation()
        translation = local_xform.ExtractTranslation()
        cmd = self._patrol.update(float(translation[0]), float(translation[1]))
        next_pos = (
            float(translation[0]) + cmd.vx * dt,
            float(translation[1]) + cmd.vy * dt,
            self.cfg.robot_spawn_xyz[2],
        )
        self._set_or_create_translate(xform, next_pos)
        self._set_or_create_rotate_xyz(xform, (0.0, 0.0, cmd.yaw))

    def _set_or_create_translate(self, xform, xyz: tuple[float, float, float]) -> None:
        for op in xform.GetOrderedXformOps():
            if op.GetOpType() == self._UsdGeom.XformOp.TypeTranslate:
                op.Set(self._Gf.Vec3d(*xyz))
                return
        xform.AddTranslateOp().Set(self._Gf.Vec3d(*xyz))

    def _set_or_create_rotate_xyz(self, xform, rpy_deg: tuple[float, float, float]) -> None:
        for op in xform.GetOrderedXformOps():
            if op.GetOpType() == self._UsdGeom.XformOp.TypeRotateXYZ:
                op.Set(self._Gf.Vec3f(*rpy_deg))
                return
        xform.AddRotateXYZOp().Set(self._Gf.Vec3f(*rpy_deg))

    @staticmethod
    def _euler_to_quat(roll_deg: float, pitch_deg: float, yaw_deg: float) -> tuple[float, float, float, float]:
        import math

        roll = math.radians(roll_deg)
        pitch = math.radians(pitch_deg)
        yaw = math.radians(yaw_deg)

        cy = math.cos(yaw * 0.5)
        sy = math.sin(yaw * 0.5)
        cp = math.cos(pitch * 0.5)
        sp = math.sin(pitch * 0.5)
        cr = math.cos(roll * 0.5)
        sr = math.sin(roll * 0.5)

        qw = cr * cp * cy + sr * sp * sy
        qx = sr * cp * cy - cr * sp * sy
        qy = cr * sp * cy + sr * cp * sy
        qz = cr * cp * sy - sr * sp * cy
        return (qw, qx, qy, qz)


def main() -> None:
    _ensure_app_launcher()
    parser = _build_parser()
    AppLauncher.add_app_launcher_args(parser)
    args = parser.parse_args()

    app_launcher = AppLauncher(args)
    simulation_app = app_launcher.app

    omni, og, sim_utils, unitree_go2_cfg, camera_cls, camera_cfg_cls, gf, usd_geom, usd_lux, sdf = _import_isaac_runtime()

    if args.ros2:
        ext_mgr = omni.kit.app.get_app().get_extension_manager()
        ext_mgr.set_extension_enabled_immediate("isaacsim.ros2.bridge", True)

    cfg = WarehouseConfig()
    demo = WarehouseSceneDemo(
        cfg=cfg,
        patrol_speed_mps=args.patrol_speed,
        sim_utils=sim_utils,
        unitree_go2_cfg=unitree_go2_cfg,
        camera_cls=camera_cls,
        camera_cfg_cls=camera_cfg_cls,
        omni=omni,
        og=og,
        gf=gf,
        usd_geom=usd_geom,
        usd_lux=usd_lux,
        sdf=sdf,
        ros2_enabled=args.ros2,
    )
    demo.setup()

    timeline = omni.timeline.get_timeline_interface()
    timeline.play()

    last = time.monotonic()
    start = last
    while simulation_app.is_running():
        now = time.monotonic()
        dt = min(max(now - last, 1e-3), 0.1)
        last = now

        demo.step_patrol(dt if args.patrol_dt <= 0.0 else args.patrol_dt)

        elapsed = now - start
        demo.set_shelf_tilt(cfg.shelf_tilt_deg if int(elapsed / 6.0) % 2 == 0 else 0.0)
        demo.set_window_open(int(elapsed / 4.0) % 2 == 0)
        simulation_app.update()

    timeline.stop()
    simulation_app.close()


if __name__ == "__main__":
    main()

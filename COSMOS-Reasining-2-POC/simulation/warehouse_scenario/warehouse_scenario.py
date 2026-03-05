from __future__ import annotations

import argparse
import math
from dataclasses import replace
from typing import Any

from .cctv_graph_builder import create_cctv_ros_graph
from .scenario_config import WarehouseScenarioConfig


class WarehouseScenarioBuilder:
    """Build and run the warehouse CCTV blindspot demo scenario in Isaac Sim."""

    def __init__(
        self,
        config: WarehouseScenarioConfig | None = None,
        *,
        headless: bool = False,
        ros2: bool = False,
        narrative: bool = False,
        loop_override: bool | None = None,
    ) -> None:
        self.config = config or WarehouseScenarioConfig()
        self.headless = headless
        self.ros2_enabled = ros2
        self.narrative_enabled = narrative
        self.loop_override = loop_override

        self._sim_app: Any = None
        self._world: Any = None
        self._stage: Any = None
        self._og: Any = None

        self._elapsed_s = 0.0
        self._phase = 1
        self._phase_elapsed_s = 0.0
        self._event_blindspot_emitted = False
        self._event_hazard_emitted = False

        self._robot_target_waypoint_idx = 0

    def setup(self) -> None:
        self.config.validate()

        try:
            from isaacsim import SimulationApp
            import omni.graph.core as og
            import omni.usd
            from omni.isaac.core import World
            from omni.isaac.core.utils.stage import add_reference_to_stage
            from pxr import Sdf, UsdGeom
        except ImportError as exc:
            raise RuntimeError(
                "Isaac Sim Python modules are required to run warehouse_scenario.py"
            ) from exc

        self._sim_app = SimulationApp({"headless": self.headless})
        self._og = og
        self._world = World(stage_units_in_meters=1.0)
        self._stage = omni.usd.get_context().get_stage()

        add_reference_to_stage(self.config.warehouse_usd, self.config.warehouse_prim_path)

        self._ensure_xform(self.config.warehouse_prim_path)
        self._spawn_lights()
        self._spawn_robot_placeholder()
        self._spawn_interactables()
        self._spawn_cctv_cameras()
        self._spawn_occluder()

        self._world.reset()

        if self.narrative_enabled and self.loop_override is not None:
            self.config.narrative = replace(self.config.narrative, loop=self.loop_override)

        print("[warehouse_scenario] setup complete")

    def step(self, dt: float = 1.0 / 60.0) -> None:
        if self._world is None:
            raise RuntimeError("setup() must be called before step()")

        if self.narrative_enabled:
            self.run_narrative(dt)
        else:
            self._advance_patrol(dt)

        self._world.step(render=True)

    def run_narrative(self, dt: float) -> None:
        self._elapsed_s += dt
        self._phase_elapsed_s += dt

        n = self.config.narrative

        if self._phase == 1:
            self._advance_patrol(dt)
            if self._phase_elapsed_s >= n.phase_1_normal_s:
                self._phase = 2
                self._phase_elapsed_s = 0.0
                self._event_blindspot_emitted = False
                print("[narrative] phase 2: occluder creating CCTV blindspot")

        elif self._phase == 2:
            progress = min(1.0, self._phase_elapsed_s / n.phase_2_occlude_s)
            self._move_occluder(progress)
            self._advance_patrol(dt)
            if not self._event_blindspot_emitted and progress >= 0.65:
                self._event_blindspot_emitted = True
                print("[blindspot_events] cam1 visibility blocked by forklift")
            if self._phase_elapsed_s >= n.phase_2_occlude_s:
                self._phase = 3
                self._phase_elapsed_s = 0.0
                self._event_hazard_emitted = False
                print("[narrative] phase 3: window opens and shelf tilts")

        elif self._phase == 3:
            progress = min(1.0, self._phase_elapsed_s / n.phase_3_window_open_s)
            self._animate_window_and_shelf(progress)
            self._advance_patrol(dt)
            if not self._event_hazard_emitted and progress >= 0.6:
                self._event_hazard_emitted = True
                print("[hazard] open window + unstable shelf detected")
            if self._phase_elapsed_s >= n.phase_3_window_open_s:
                self._phase = 4
                self._phase_elapsed_s = 0.0
                print("[narrative] phase 4: robot dispatched to incident zone")

        else:
            self._dispatch_robot_to_incident(dt)
            if self._phase_elapsed_s >= n.phase_4_dispatch_s:
                if n.loop:
                    self._reset_narrative_state()
                    print("[narrative] loop restart")
                else:
                    self._advance_patrol(dt)

    def shutdown(self) -> None:
        if self._sim_app is not None:
            self._sim_app.close()
            self._sim_app = None

    def _ensure_xform(self, prim_path: str) -> Any:
        from pxr import Sdf, UsdGeom

        xform = UsdGeom.Xform.Define(self._stage, Sdf.Path(prim_path))
        return xform

    def _get_or_create_translate_op(self, prim_path: str) -> Any:
        from pxr import UsdGeom

        xformable = UsdGeom.Xformable(self._stage.GetPrimAtPath(prim_path))
        for op in xformable.GetOrderedXformOps():
            if op.GetOpType() == UsdGeom.XformOp.TypeTranslate:
                return op
        return xformable.AddTranslateOp()

    def _get_or_create_rotate_xyz_op(self, prim_path: str) -> Any:
        from pxr import UsdGeom

        xformable = UsdGeom.Xformable(self._stage.GetPrimAtPath(prim_path))
        for op in xformable.GetOrderedXformOps():
            if op.GetOpType() == UsdGeom.XformOp.TypeRotateXYZ:
                return op
        return xformable.AddRotateXYZOp()

    def _set_translation(self, prim_path: str, xyz: tuple[float, float, float]) -> None:
        from pxr import Gf

        op = self._get_or_create_translate_op(prim_path)
        op.Set(Gf.Vec3d(*xyz))

    def _set_rotation_xyz(self, prim_path: str, rpy_deg: tuple[float, float, float]) -> None:
        from pxr import Gf

        op = self._get_or_create_rotate_xyz_op(prim_path)
        op.Set(Gf.Vec3f(*rpy_deg))

    def _spawn_lights(self) -> None:
        from pxr import Sdf, UsdLux

        for idx, pos in enumerate(self.config.light_positions, start=1):
            light_path = f"/World/Lights/SpotLight{idx}"
            light = UsdLux.SpotLight.Define(self._stage, Sdf.Path(light_path))
            light.CreateIntensityAttr(self.config.light_intensity)
            light.CreateColorAttr((1.0, 1.0, 1.0))
            light.CreateConeAngleAttr(45.0)
            self._set_translation(light_path, pos)
            self._set_rotation_xyz(light_path, (-65.0, 0.0, 0.0))

    def _spawn_robot_placeholder(self) -> None:
        from pxr import Sdf, UsdGeom

        self._ensure_xform("/World/Robots")
        robot = UsdGeom.Capsule.Define(self._stage, Sdf.Path(self.config.robot_prim_path))
        robot.CreateRadiusAttr(0.23)
        robot.CreateHeightAttr(0.55)
        self._set_translation(self.config.robot_prim_path, self.config.robot_spawn_xyz)
        self._set_rotation_xyz(self.config.robot_prim_path, self.config.robot_spawn_rpy_deg)

    def _spawn_interactables(self) -> None:
        from pxr import Sdf, UsdGeom

        self._ensure_xform("/World/Interactables")

        shelf = UsdGeom.Cube.Define(self._stage, Sdf.Path(self.config.shelf_prim_path))
        shelf.CreateSizeAttr(1.0)
        self._set_translation(self.config.shelf_prim_path, self.config.shelf_translation)

        window = UsdGeom.Cube.Define(self._stage, Sdf.Path(self.config.window_prim_path))
        window.CreateSizeAttr(0.8)
        self._set_translation(self.config.window_prim_path, self.config.window_translation)

    def _spawn_cctv_cameras(self) -> None:
        from pxr import Sdf, UsdGeom

        self._ensure_xform("/World/CCTV")

        for idx, cam_cfg in enumerate(self.config.cctv_cameras, start=1):
            camera = UsdGeom.Camera.Define(self._stage, Sdf.Path(cam_cfg.prim_path))
            camera.CreateFocalLengthAttr(cam_cfg.focal_length)
            self._set_translation(cam_cfg.prim_path, cam_cfg.position)
            self._set_rotation_xyz(cam_cfg.prim_path, cam_cfg.rotation_xyz_deg)

            if self.ros2_enabled:
                create_cctv_ros_graph(self._og, cam_cfg, idx)

    def _spawn_occluder(self) -> None:
        from pxr import Sdf, UsdGeom

        self._ensure_xform("/World/Actors")
        occluder = UsdGeom.Cube.Define(self._stage, Sdf.Path(self.config.occluder.prim_path))
        occluder.CreateSizeAttr(1.0)

        xformable = UsdGeom.Xformable(self._stage.GetPrimAtPath(self.config.occluder.prim_path))
        has_scale = False
        for op in xformable.GetOrderedXformOps():
            if op.GetOpType() == UsdGeom.XformOp.TypeScale:
                op.Set(self.config.occluder.scale)
                has_scale = True
                break
        if not has_scale:
            xformable.AddScaleOp().Set(self.config.occluder.scale)

        self._set_translation(self.config.occluder.prim_path, self.config.occluder.start_position)

    def _move_occluder(self, progress: float) -> None:
        start = self.config.occluder.start_position
        end = self.config.occluder.blocking_position
        pos = tuple(s + (e - s) * progress for s, e in zip(start, end))
        self._set_translation(self.config.occluder.prim_path, pos)

    def _animate_window_and_shelf(self, progress: float) -> None:
        wx, wy, wz = self.config.window_translation
        window_pos = (wx + self.config.window_open_offset_m * progress, wy, wz)
        self._set_translation(self.config.window_prim_path, window_pos)

        shelf_tilt = self.config.shelf_tilt_deg * progress
        self._set_rotation_xyz(self.config.shelf_prim_path, (shelf_tilt, 0.0, 0.0))

    def _advance_patrol(self, dt: float) -> None:
        current = self._get_translation(self.config.robot_prim_path)
        target = self.config.patrol_waypoints[self._robot_target_waypoint_idx]

        speed_mps = 0.9
        dx = target[0] - current[0]
        dy = target[1] - current[1]
        dz = target[2] - current[2]
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)

        if dist < 0.08:
            self._robot_target_waypoint_idx = (self._robot_target_waypoint_idx + 1) % len(
                self.config.patrol_waypoints
            )
            return

        step_dist = min(dist, speed_mps * dt)
        nx = current[0] + dx / dist * step_dist
        ny = current[1] + dy / dist * step_dist
        nz = current[2] + dz / dist * step_dist

        yaw = math.degrees(math.atan2(dy, dx)) if dist > 1e-6 else 0.0
        self._set_translation(self.config.robot_prim_path, (nx, ny, nz))
        self._set_rotation_xyz(self.config.robot_prim_path, (0.0, 0.0, yaw))

    def _dispatch_robot_to_incident(self, dt: float) -> None:
        current = self._get_translation(self.config.robot_prim_path)
        incident = (
            self.config.shelf_translation[0] - 0.8,
            self.config.shelf_translation[1] - 0.7,
            self.config.robot_spawn_xyz[2],
        )

        speed_mps = 1.2
        dx = incident[0] - current[0]
        dy = incident[1] - current[1]
        dz = incident[2] - current[2]
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)

        if dist < 0.05:
            return

        step_dist = min(dist, speed_mps * dt)
        nx = current[0] + dx / dist * step_dist
        ny = current[1] + dy / dist * step_dist
        nz = current[2] + dz / dist * step_dist

        yaw = math.degrees(math.atan2(dy, dx)) if dist > 1e-6 else 0.0
        self._set_translation(self.config.robot_prim_path, (nx, ny, nz))
        self._set_rotation_xyz(self.config.robot_prim_path, (0.0, 0.0, yaw))

    def _get_translation(self, prim_path: str) -> tuple[float, float, float]:
        from pxr import UsdGeom

        xformable = UsdGeom.Xformable(self._stage.GetPrimAtPath(prim_path))
        for op in xformable.GetOrderedXformOps():
            if op.GetOpType() == UsdGeom.XformOp.TypeTranslate:
                v = op.Get()
                return float(v[0]), float(v[1]), float(v[2])
        return 0.0, 0.0, 0.0

    def _reset_narrative_state(self) -> None:
        self._phase = 1
        self._phase_elapsed_s = 0.0
        self._event_blindspot_emitted = False
        self._event_hazard_emitted = False
        self._set_translation(self.config.occluder.prim_path, self.config.occluder.start_position)
        self._set_translation(self.config.window_prim_path, self.config.window_translation)
        self._set_rotation_xyz(self.config.shelf_prim_path, (0.0, 0.0, 0.0))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Warehouse CCTV scenario for Isaac Sim")
    parser.add_argument("--headless", action="store_true", help="Run without UI")
    parser.add_argument("--ros2", action="store_true", help="Enable ROS2 camera publishers")
    parser.add_argument(
        "--narrative",
        action="store_true",
        help="Run scripted demo sequence (normal -> occlude -> window -> dispatch)",
    )
    parser.add_argument("--loop", action="store_true", help="Force narrative loop mode")
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    scenario = WarehouseScenarioBuilder(
        headless=args.headless,
        ros2=args.ros2,
        narrative=args.narrative,
        loop_override=True if args.loop else None,
    )

    scenario.setup()

    try:
        while scenario._sim_app.is_running():
            scenario.step()
    finally:
        scenario.shutdown()


if __name__ == "__main__":
    main()

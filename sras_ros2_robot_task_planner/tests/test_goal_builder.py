"""Tests for goal_builder — TDD RED phase."""

import math

import pytest

from sras_robot_task_planner.goal_builder import (
    build_goal_from_detection,
    pick_target_position,
)


class TestBuildGoalFromDetection:
    def test_yaw_faces_target(self) -> None:
        goal = build_goal_from_detection(
            target_x=3.0, target_y=4.0, robot_x=0.0, robot_y=0.0, frame_id="map"
        )
        expected_yaw = math.atan2(4.0, 3.0)
        assert goal["yaw"] == pytest.approx(expected_yaw)
        assert goal["x"] == 3.0
        assert goal["y"] == 4.0
        assert goal["z"] == 0.0
        assert goal["frame_id"] == "map"

    def test_yaw_zero_when_robot_unknown(self) -> None:
        goal = build_goal_from_detection(
            target_x=1.0, target_y=2.0, robot_x=None, robot_y=None, frame_id="odom"
        )
        assert goal["yaw"] == 0.0
        assert goal["x"] == 1.0
        assert goal["y"] == 2.0
        assert goal["frame_id"] == "odom"

    def test_yaw_pi_when_target_behind(self) -> None:
        goal = build_goal_from_detection(
            target_x=-5.0, target_y=0.0, robot_x=0.0, robot_y=0.0, frame_id="map"
        )
        assert goal["yaw"] == pytest.approx(math.pi)

    def test_yaw_negative_half_pi_when_below(self) -> None:
        goal = build_goal_from_detection(
            target_x=0.0, target_y=-3.0, robot_x=0.0, robot_y=0.0, frame_id="map"
        )
        assert goal["yaw"] == pytest.approx(-math.pi / 2)

    def test_same_position_yields_zero_yaw(self) -> None:
        goal = build_goal_from_detection(
            target_x=1.0, target_y=1.0, robot_x=1.0, robot_y=1.0, frame_id="map"
        )
        assert goal["yaw"] == 0.0

    def test_default_frame_id(self) -> None:
        goal = build_goal_from_detection(
            target_x=1.0, target_y=2.0, robot_x=0.0, robot_y=0.0
        )
        assert goal["frame_id"] == "map"


class TestPickTargetPosition:
    def test_cosmos_target_takes_priority(self) -> None:
        cosmos = {"x": 10.0, "y": 20.0}
        detections = [{"x": 1.0, "y": 2.0}, {"x": 3.0, "y": 4.0}]
        result = pick_target_position(cosmos, detections)
        assert result == (10.0, 20.0)

    def test_falls_back_to_detection_centroid(self) -> None:
        detections = [{"x": 2.0, "y": 4.0}, {"x": 4.0, "y": 6.0}]
        result = pick_target_position(None, detections)
        assert result == pytest.approx((3.0, 5.0))

    def test_single_detection_centroid(self) -> None:
        detections = [{"x": 7.0, "y": 8.0}]
        result = pick_target_position(None, detections)
        assert result == (7.0, 8.0)

    def test_returns_none_when_both_empty(self) -> None:
        result = pick_target_position(None, [])
        assert result is None

    def test_returns_none_when_no_args(self) -> None:
        result = pick_target_position(None, None)
        assert result is None

    def test_cosmos_target_with_empty_detections(self) -> None:
        cosmos = {"x": 5.0, "y": 6.0}
        result = pick_target_position(cosmos, [])
        assert result == (5.0, 6.0)

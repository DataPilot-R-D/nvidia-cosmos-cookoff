#!/usr/bin/env python3
"""
RTAB-Map 3D colored map builder.

Uruchamia:
  1. rtabmap_odom/icp_odometry  – odometria z LiDARu
  2. rtabmap_slam/rtabmap        – SLAM z LiDARem + RGB-D (depth + kamera)
  3. colorize_cloud              – koloruje bieżącą chmurę (opcjonalnie, do RViz)

Topiki wejściowe (domyślne, można nadpisać przez argumenty):
  scan_cloud  : /robot0/point_cloud2_L1
  rgb         : /robot0/front_cam/rgb
  depth       : /robot0/front_cam/depth
  camera_info : /robot0/front_cam/camera_info
  odom        : /robot0/odom

Użycie:
  source /opt/ros/humble/setup.bash
  ros2 launch dimos_vlm_bridge rtabmap_3d_map.launch.py
  ros2 launch dimos_vlm_bridge rtabmap_3d_map.launch.py use_sim_time:=true
  ros2 launch dimos_vlm_bridge rtabmap_3d_map.launch.py localization:=true
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, GroupAction
from launch.substitutions import LaunchConfiguration, PythonExpression
from launch.conditions import IfCondition, UnlessCondition
from launch_ros.actions import Node


def generate_launch_description():

    # ------------------------------------------------------------------ args
    args = [
        DeclareLaunchArgument("use_sim_time",   default_value="true"),
        DeclareLaunchArgument("localization",   default_value="false",
                              description="true = localization only, false = mapping"),

        # topics
        DeclareLaunchArgument("scan_cloud_topic",  default_value="/robot0/point_cloud2_L1"),
        DeclareLaunchArgument("rgb_topic",         default_value="/robot0/front_cam/rgb"),
        DeclareLaunchArgument("depth_topic",       default_value="/robot0/front_cam/depth"),
        DeclareLaunchArgument("camera_info_topic", default_value="/robot0/front_cam/camera_info"),
        DeclareLaunchArgument("odom_topic",        default_value="/robot0/odom"),

        # frames
        DeclareLaunchArgument("base_frame",   default_value="robot0/base_link"),
        DeclareLaunchArgument("odom_frame",   default_value="odom"),
        DeclareLaunchArgument("map_frame",    default_value="map"),
        DeclareLaunchArgument("camera_frame", default_value="robot0/front_cam_optical_frame"),

        # tuning
        DeclareLaunchArgument("voxel_size",   default_value="0.05",
                              description="Voxel size for point cloud downsampling [m]"),
        DeclareLaunchArgument("max_depth",    default_value="6.0",
                              description="Max depth image range [m]"),
    ]

    use_sim_time   = LaunchConfiguration("use_sim_time")
    localization   = LaunchConfiguration("localization")
    scan_cloud     = LaunchConfiguration("scan_cloud_topic")
    rgb            = LaunchConfiguration("rgb_topic")
    depth          = LaunchConfiguration("depth_topic")
    camera_info    = LaunchConfiguration("camera_info_topic")
    odom_topic     = LaunchConfiguration("odom_topic")
    base_frame     = LaunchConfiguration("base_frame")
    odom_frame     = LaunchConfiguration("odom_frame")
    map_frame      = LaunchConfiguration("map_frame")
    camera_frame   = LaunchConfiguration("camera_frame")
    voxel_size     = LaunchConfiguration("voxel_size")
    max_depth      = LaunchConfiguration("max_depth")

    # -------------------------------------------------------- icp_odometry
    icp_odom_node = Node(
        package="rtabmap_odom",
        executable="icp_odometry",
        name="icp_odometry",
        output="screen",
        parameters=[{
            "use_sim_time":        use_sim_time,
            "frame_id":            base_frame,
            "odom_frame_id":       odom_frame,
            "guess_frame_id":      base_frame,
            "publish_tf":          False,
            "wait_for_transform":  0.5,
            # ICP params — RTAB-Map string params (passed as strings intentionally)
            "Icp/VoxelSize":       "0.05",
            "Icp/MaxCorrespondenceDistance": "1.0",
            "Icp/PointToPlane":    "true",
            "Odom/ResetCountdown": "0",
        }],
        remappings=[
            ("scan",        "/scan_disabled"),
            ("scan_cloud",  scan_cloud),
            ("odom",        odom_topic),
        ],
    )

    # ------------------------------------------------ point_cloud_xyzrgb
    # Konwertuje depth image + RGB → kolorowa chmura punktów (PointCloud2 XYZRGB)
    # Ta chmura trafia do rtabmap jako scan_cloud → mapa 3D ma kolory
    colored_cloud_topic = "/rtabmap/colored_scan_cloud"

    colored_cloud_node = Node(
        package="rtabmap_util",
        executable="point_cloud_xyzrgb",
        name="point_cloud_xyzrgb",
        output="screen",
        parameters=[{
            "use_sim_time":                 use_sim_time,
            "decimation":                   1,
            "max_depth":                    10.0,
            "min_depth":                    0.1,
            "voxel_size":                   0.0,
            "noise_filter_radius":          0.0,
            "noise_filter_min_neighbors":   0,
            "approx_sync":                  True,
            "approx_sync_max_interval":     1.0,
            "qos":                          1,
        }],
        remappings=[
            ("rgb/image",       rgb),
            ("depth/image",     depth),
            ("rgb/camera_info", camera_info),
            ("cloud",           colored_cloud_topic),
        ],
    )

    # -------------------------------------------------------- rtabmap SLAM
    rtabmap_common_params = {
        "use_sim_time":           use_sim_time,
        "frame_id":               base_frame,
        "odom_frame_id":          odom_frame,
        "map_frame_id":           map_frame,

        # subskrypcje
        "subscribe_scan_cloud":   True,
        "subscribe_scan":         False,
        "subscribe_rgb":          True,
        "subscribe_depth":        True,
        "subscribe_stereo":       False,

        # synchronizacja
        "approx_sync":            True,
        "approx_sync_max_interval": 0.1,
        "wait_for_transform":     0.5,

        # QoS — symulacja publikuje BEST_EFFORT
        "qos_image":              1,
        "qos_camera_info":        1,
        "qos_scan":               1,
        "qos_odom":               1,

        # TF
        "publish_tf":             True,

        # jakość mapy 3D — ros params (double)
        "cloud_voxel_size":       0.05,
        "cloud_max_depth":        6.0,
        "cloud_min_depth":        0.2,
        "cloud_noise_filtering_radius":        0.05,
        "cloud_noise_filtering_min_neighbors": 5,

        # RTAB-Map core — string params
        "RGBD/AngularUpdate":        "0.05",
        "RGBD/LinearUpdate":         "0.05",
        "RGBD/OptimizeFromGraphEnd": "false",
        "Mem/IncrementalMemory":     "true",
        "Mem/InitWMWithAllNodes":    "false",
        "Grid/3D":                   "true",
        "Grid/RangeMax":             "6.0",
        "Grid/CellSize":             "0.05",
        "Kp/MaxFeatures":            "500",
        "Vis/MinInliers":            "15",

        # wyłącz zapis do bazy danych
        "Mem/NotLinkedNodesKept": "false",
        "DbSqlite3/InMemory":     "true",

        # publikuj chmurę 3D zawsze
        "cloud_output_voxelized": True,
        "map_always_update":      True,
        "map_empty_ray_tracing":  False,
    }

    rtabmap_mapping_node = Node(
        package="rtabmap_slam",
        executable="rtabmap",
        name="rtabmap",
        output="screen",
        condition=UnlessCondition(localization),
        parameters=[{
            **rtabmap_common_params,
            "Mem/IncrementalMemory": "true",
        }],
        remappings=[
            ("odom",            odom_topic),
            ("scan_cloud",      colored_cloud_topic),
            ("rgb/image",       rgb),
            ("depth/image",     depth),
            ("rgb/camera_info", camera_info),
        ],
        arguments=["--delete_db_on_start"],
    )

    rtabmap_localization_node = Node(
        package="rtabmap_slam",
        executable="rtabmap",
        name="rtabmap",
        output="screen",
        condition=IfCondition(localization),
        parameters=[{
            **rtabmap_common_params,
            "Mem/IncrementalMemory":  "false",
            "Mem/InitWMWithAllNodes": "true",
        }],
        remappings=[
            ("odom",            odom_topic),
            ("scan_cloud",      colored_cloud_topic),
            ("rgb/image",       rgb),
            ("depth/image",     depth),
            ("rgb/camera_info", camera_info),
        ],
    )

    return LaunchDescription(args + [
        icp_odom_node,
        colored_cloud_node,
        rtabmap_mapping_node,
        rtabmap_localization_node,
        # rtabmap_viz_node,  # odkomentuj jeśli chcesz wbudowany viewer RTAB-Map
    ])

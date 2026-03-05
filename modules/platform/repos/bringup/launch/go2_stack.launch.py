import os

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, TimerAction, ExecuteProcess, SetEnvironmentVariable
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
from launch.launch_description_sources import AnyLaunchDescriptionSource


def generate_launch_description():
    use_sim_time = LaunchConfiguration("use_sim_time")
    map_yaml = LaunchConfiguration("map")
    nav2_params = LaunchConfiguration("nav2_params")

    # Topics
    pc_in = LaunchConfiguration("pointcloud_in")
    scan_out = LaunchConfiguration("scan_out")
    cmd_vel_in = LaunchConfiguration("cmd_vel_in")
    cmd_vel_robot = LaunchConfiguration("cmd_vel_robot")
    cam_rgb = LaunchConfiguration("camera_rgb")

    pc_throttled = LaunchConfiguration("pointcloud_throttled")
    cam_throttled = LaunchConfiguration("camera_throttled")

    # SLAM posegraph
    posegraph_file = LaunchConfiguration("posegraph_file")
    slam_deserialize_delay_s = LaunchConfiguration("slam_deserialize_delay_s")

    # Vision LLM env/config
    openai_base_url = LaunchConfiguration("openai_base_url")
    openai_api_key = LaunchConfiguration("openai_api_key")
    openai_model = LaunchConfiguration("openai_model")

    # Includes
    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory("rosbridge_server"),
                "launch",
                "rosbridge_websocket_launch.xml",
            )
        )
    )

    rosapi_node = Node(
        package="rosapi",
        executable="rosapi_node",
        name="rosapi",
        output="screen",
    )

    rosbridge_node = Node(
        package="rosbridge_server",
        executable="rosbridge_websocket",
        name="rosbridge_websocket",
        output="screen",
        parameters=[{
            # opcjonalnie:
            # "port": 9090
        }],
    )


    nav2_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory("nav2_bringup"),
                "launch",
                "navigation_launch.py",
            )
        ),
        launch_arguments={
            "use_sim_time": use_sim_time,
            "map": map_yaml,
            "params_file": nav2_params,
        }.items(),
    )

    # Nodes
    pointcloud_to_laserscan = Node(
        package="pointcloud_to_laserscan",
        executable="pointcloud_to_laserscan_node",
        name="pointcloud_to_laserscan",
        output="screen",
        parameters=[{"target_frame": "robot0/base_link"}],
        remappings=[("cloud_in", pc_in), ("scan", scan_out)],
    )

    slam_toolbox = Node(
        package="slam_toolbox",
        executable="async_slam_toolbox_node",
        name="slam_toolbox",
        output="screen",
        parameters=[{
            "use_sim_time": use_sim_time,
            "base_frame": "robot0/base_link",
        }],
    )

    cmd_vel_relay = Node(
        package="topic_tools",
        executable="relay",
        name="cmd_vel_relay",
        output="screen",
        arguments=[cmd_vel_in, cmd_vel_robot],
    )

    throttle_pointcloud = Node(
        package="topic_tools",
        executable="throttle",
        name="pc_throttle",
        output="screen",
        arguments=["messages", pc_in, "1.0", pc_throttled],
    )

    throttle_camera = Node(
        package="topic_tools",
        executable="throttle",
        name="cam_throttle",
        output="screen",
        arguments=["messages", cam_rgb, "2.0", cam_throttled],
    )

    map_republisher = Node(
        package="sras_qos_tools",
        executable="map_republisher",
        name="map_republisher",
        output="screen",
        parameters=[{
            "in_topic": "/map",
            "out_topic": "/map_live",
            "republish_period_s": 1.0,
        }],
    )

    # Vision LLM server
    vision_llm_server = Node(
        package="vision_llm_srv",
        executable="vision_llm_server",
        name="vision_llm_server",
        output="screen",
        parameters=[{"image_topic": cam_rgb}],
    )

    # Deserialization: easiest robust approach
    # We set POSEGRAPH_FILE env var then run a bash command after a delay.
    set_posegraph_env = SetEnvironmentVariable("POSEGRAPH_FILE", posegraph_file)

    slam_deserialize = TimerAction(
        period=slam_deserialize_delay_s,
        actions=[
            ExecuteProcess(
                cmd=[
                    "bash", "-lc",
                    "ros2 service call /slam_toolbox/deserialize_map "
                    "slam_toolbox/srv/DeserializePoseGraph "
                    "\"{filename: '$POSEGRAPH_FILE', match_type: 1, initial_pose: {x: 0.0, y: 0.0, theta: 0.0}}\""
                ],
                output="screen",
            )
        ],
    )

    # OpenAI env (global for this launch session)
    openai_env = [
        SetEnvironmentVariable("OPENAI_BASE_URL", openai_base_url),
        SetEnvironmentVariable("OPENAI_API_KEY", openai_api_key),
        SetEnvironmentVariable("OPENAI_MODEL", openai_model),
    ]

    return LaunchDescription([
        # Args
        DeclareLaunchArgument("use_sim_time", default_value="false"),
        DeclareLaunchArgument("map", default_value="/home/ubuntu/maps/office_map.yaml"),
        DeclareLaunchArgument("nav2_params", default_value=os.path.expanduser("~/go2_nav2/config/nav2_params.yaml")),

        DeclareLaunchArgument("pointcloud_in", default_value="/robot0/point_cloud2_L1"),
        DeclareLaunchArgument("scan_out", default_value="/scan"),
        DeclareLaunchArgument("cmd_vel_in", default_value="/cmd_vel"),
        DeclareLaunchArgument("cmd_vel_robot", default_value="/robot0/cmd_vel"),
        DeclareLaunchArgument("camera_rgb", default_value="/robot0/front_cam/rgb"),

        DeclareLaunchArgument("pointcloud_throttled", default_value="/robot0/point_cloud2_L1_throttled"),
        DeclareLaunchArgument("camera_throttled", default_value="/robot0/front_cam/rgb_throttled"),

        DeclareLaunchArgument("posegraph_file", default_value="/home/ubuntu/maps/office_posegraph"),
        DeclareLaunchArgument("slam_deserialize_delay_s", default_value="5.0"),

        DeclareLaunchArgument("openai_base_url", default_value="http://localhost:1234/v1"),
        DeclareLaunchArgument("openai_api_key", default_value="lmstudio"),
        DeclareLaunchArgument("openai_model", default_value="zai-org/glm-4.6v-flash"),

        # Stack
        #rosapi_node,
        #rosbridge_node,
        rosbridge_launch,
        pointcloud_to_laserscan,
        slam_toolbox,

        set_posegraph_env,
        slam_deserialize,

        nav2_launch,
        cmd_vel_relay,
        throttle_pointcloud,
        throttle_camera,
        map_republisher,

        *openai_env,
        vision_llm_server,
    ])


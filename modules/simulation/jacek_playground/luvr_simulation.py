"""
Louvre Simulation with CCTV Cameras and Robots
Publishes sensor data via UDP to ROS2 bridge
"""

from omni.isaac.kit import SimulationApp

# Launch Isaac Sim
simulation_app = SimulationApp({"headless": False})

# Imports must be after SimulationApp initialization
import omni.usd
import omni.kit.commands
import omni.replicator.core as rep
from omni.isaac.core.utils.stage import open_stage
from pxr import UsdGeom, Sdf, Gf
import numpy as np
import time

from isaac_camera_udp_publisher import CameraUDPPublisher

# ============================================================================
# Configuration
# ============================================================================

CCTV_POSITIONS = [
    (0.0, 6.5, 17),  # Camera 0: one end center
    (0.0, 6.5, -17.0),  # Camera 1: other end center
]

CCTV_ROTATIONS_XYZ_DEG = [
    (-25, 0, 0),  # Camera 0: looking down at angle
    (-25, 180, 0),  # Camera 1: looking down at angle
]

ROBOT_CONFIGS = {
    'go2': {
        'base_path': '/World/Luvr/Go2',
        'camera_path': '/World/Luvr/Go2/base/front_cam',
        'lidar_path': '/World/Luvr/Go2/base/lidar_sensor',
        'lidar_translation': (0.293, 0.0, -0.08),
        'lidar_rotation': (0, 165, 0),  # degrees
    },
    'g1': {
        'base_path': '/World/Luvr/G1',
        'camera_path': '/World/Luvr/G1/head_link/front_cam',
        'lidar_path': '/World/Luvr/G1/head_link/lidar_sensor',
        'lidar_translation': (0.0, 0.0, 0.0),
        'lidar_rotation': (0, 0, 0),
    }
}

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
    # Create parent Xform for positioning
    parent_path = cam_path.rsplit('/', 1)[0]
    root_xform = UsdGeom.Xform.Define(stage, Sdf.Path(parent_path))
    root_xformable = UsdGeom.Xformable(root_xform)
    root_xformable.ClearXformOpOrder()
    root_xformable.AddTranslateOp().Set(Gf.Vec3d(*position))
    root_xformable.AddRotateXYZOp().Set(Gf.Vec3f(*rotation_xyz_deg))

    # Create camera
    camera = UsdGeom.Camera.Define(stage, Sdf.Path(cam_path))
    camera.GetFocalLengthAttr().Set(CAMERA_PARAMS['focal_length'])
    camera.GetHorizontalApertureAttr().Set(CAMERA_PARAMS['horizontal_aperture'])
    camera.GetClippingRangeAttr().Set(Gf.Vec2f(0.1, 100000.0))

    return camera


def euler_to_quaternion(roll, pitch, yaw):
    """Convert Euler angles (radians) to quaternion (x, y, z, w)"""
    import math

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

    return qx, qy, qz, qw


def create_rtx_lidar(stage, lidar_path, translation, rotation_deg, config="Unitree_L1"):
    """Create RTX Lidar sensor"""
    # Convert rotation to quaternion
    import math
    roll, pitch, yaw = [math.radians(d) for d in rotation_deg]
    qx, qy, qz, qw = euler_to_quaternion(roll, pitch, yaw)

    _, lidar_sensor = omni.kit.commands.execute(
        "IsaacSensorCreateRtxLidar",
        path=lidar_path,
        parent=None,
        translation=translation,
        orientation=Gf.Quatd(qw, qx, qy, qz),
        config=config,
    )

    return lidar_sensor


# ============================================================================
# Sensor Setup
# ============================================================================

def setup_cctv_cameras(stage):
    """Setup CCTV cameras and return render products"""
    render_products = []

    for i, (pos, rot) in enumerate(zip(CCTV_POSITIONS, CCTV_ROTATIONS_XYZ_DEG)):
        cam_path = f"/World/cctv_{i}/camera"
        create_usd_camera(stage, cam_path, pos, rot)

        # Create render product
        render_product = rep.create.render_product(
            cam_path,
            (CAMERA_PARAMS['width'], CAMERA_PARAMS['height'])
        )
        render_products.append(render_product)

        print(f"Created CCTV camera {i} at {pos}")

    return render_products


def setup_robot_sensors(stage, robot_name, config):
    """Setup camera and lidar for a robot"""
    sensors = {}

    # Check if robot exists in scene
    if not stage.GetPrimAtPath(config['base_path']):
        print(f"Robot {robot_name} not found at {config['base_path']}, skipping")
        return None

    # Setup camera if path exists
    cam_prim = stage.GetPrimAtPath(config['camera_path'])
    if cam_prim and cam_prim.IsValid():
        render_product = rep.create.render_product(
            config['camera_path'],
            (CAMERA_PARAMS['width'], CAMERA_PARAMS['height'])
        )
        sensors['camera'] = render_product
        print(f"Setup camera for {robot_name}")
    else:
        # Create camera if it doesn't exist
        parent_path = config['camera_path'].rsplit('/', 1)[0]
        if stage.GetPrimAtPath(parent_path):
            create_usd_camera(stage, config['camera_path'], (0, 0, 0), (0, 0, 0))
            render_product = rep.create.render_product(
                config['camera_path'],
                (CAMERA_PARAMS['width'], CAMERA_PARAMS['height'])
            )
            sensors['camera'] = render_product
            print(f"Created and setup camera for {robot_name}")

    # Setup lidar
    lidar_prim = stage.GetPrimAtPath(config['lidar_path'])
    if not lidar_prim or not lidar_prim.IsValid():
        try:
            lidar_sensor = create_rtx_lidar(
                stage,
                config['lidar_path'],
                config['lidar_translation'],
                config['lidar_rotation']
            )
            print(f"Created lidar for {robot_name}")

            # Create lidar render product only if sensor was created successfully
            lidar_texture = rep.create.render_product(config['lidar_path'], [1, 1])
            sensors['lidar'] = {
                'render_product': lidar_texture,
                'sensor': lidar_sensor
            }
        except Exception as e:
            print(f"Failed to create lidar for {robot_name}: {e}")
            sensors['lidar'] = None
    else:
        print(f"Using existing lidar for {robot_name}")
        try:
            lidar_texture = rep.create.render_product(config['lidar_path'], [1, 1])
            sensors['lidar'] = {
                'render_product': lidar_texture,
                'sensor': lidar_prim
            }
        except Exception as e:
            print(f"Failed to create render product for existing lidar {robot_name}: {e}")
            sensors['lidar'] = None

    return sensors


def setup_annotators(render_products):
    """Create annotators for render products"""
    annotators = []
    for rp in render_products:
        rgb_annotator = rep.AnnotatorRegistry.get_annotator("rgb")
        rgb_annotator.attach([rp])
        annotators.append(rgb_annotator)
    return annotators


def setup_lidar_annotators(lidar_sensors):
    """Create annotators for lidar sensors"""
    lidar_annotators = []
    for sensor_info in lidar_sensors:
        if sensor_info:
            annotator = rep.AnnotatorRegistry.get_annotator("RtxSensorCpuIsaacCreateRTXLidarScanBuffer")
            annotator.attach(sensor_info['render_product'])
            lidar_annotators.append(annotator)
        else:
            lidar_annotators.append(None)
    return lidar_annotators


# ============================================================================
# Data Publishing
# ============================================================================

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

            # Handle RGBA -> RGB conversion
            if len(rgb_array.shape) == 3 and rgb_array.shape[2] == 4:
                rgb_array = rgb_array[:, :, :3]

            if len(rgb_array.shape) == 3 and rgb_array.shape[2] == 3:
                udp_publisher.publish_image(i, rgb_array, sim_time)

                # Publish camera_info less frequently
                if frame_count % 30 == 0:
                    height, width = rgb_array.shape[:2]
                    udp_publisher.publish_camera_info(
                        i, width, height, fx, fy, cx, cy, sim_time
                    )


def publish_lidar_data(lidar_annotators, robot_names, udp_publisher, frame_count):
    """Publish lidar point clouds via UDP"""
    # Future work: lidar data publishing via PointCloud2
    # This will require extending the UDP publisher to handle PointCloud2 messages
    pass


# ============================================================================
# Main Simulation Loop
# ============================================================================

def main():
    # Load scene
    usd_path = "/home/ubuntu/go2_omniverse/scenes/Luvr_smoke_final.usda"
    open_stage(usd_path)
    stage = omni.usd.get_context().get_stage()

    print("=" * 60)
    print("Louvre Simulation - CCTV & Robot Sensors")
    print("=" * 60)

    # Setup CCTV cameras
    cctv_render_products = setup_cctv_cameras(stage)
    cctv_annotators = setup_annotators(cctv_render_products)

    # Setup robot sensors
    robot_sensors = {}
    for robot_name, config in ROBOT_CONFIGS.items():
        sensors = setup_robot_sensors(stage, robot_name, config)
        if sensors:
            robot_sensors[robot_name] = sensors

    # Collect all camera render products and create annotators
    all_camera_rps = cctv_render_products.copy()
    camera_names = [f"cctv{i}" for i in range(len(cctv_render_products))]

    for robot_name, sensors in robot_sensors.items():
        if 'camera' in sensors:
            all_camera_rps.append(sensors['camera'])
            camera_names.append(f"{robot_name}_camera")

    all_camera_annotators = setup_annotators(all_camera_rps)

    # Setup lidar annotators
    lidar_sensors_list = [
        robot_sensors.get('go2', {}).get('lidar'),
        robot_sensors.get('g1', {}).get('lidar')
    ]
    lidar_annotators = setup_lidar_annotators(lidar_sensors_list)

    # Initialize UDP publisher
    udp_publisher = CameraUDPPublisher(host='127.0.0.1', port=9870)

    # Calculate camera intrinsics
    fx, fy, cx, cy = calculate_camera_intrinsics(
        CAMERA_PARAMS['focal_length'],
        CAMERA_PARAMS['horizontal_aperture'],
        CAMERA_PARAMS['width'],
        CAMERA_PARAMS['height']
    )

    print("\n" + "=" * 60)
    print("Simulation ready!")
    print(f"CCTV cameras: {len(cctv_render_products)}")
    print(f"Robot cameras: {len(robot_sensors)}")
    print(f"Total cameras: {len(all_camera_annotators)}")
    print("\nPublishing via UDP to port 9870")
    print("Start ROS2 bridge: python3 ros2_camera_udp_bridge.py")
    print("=" * 60 + "\n")

    # Main simulation loop
    frame_count = 0

    try:
        while simulation_app.is_running():
            simulation_app.update()

            # Publish camera data every 3 frames (~10 Hz at 30 FPS)
            if frame_count % 3 == 0:
                publish_camera_data(
                    all_camera_annotators,
                    camera_names,
                    udp_publisher,
                    fx, fy, cx, cy,
                    frame_count
                )

            # Publish lidar data every 6 frames (~5 Hz at 30 FPS)
            if frame_count % 6 == 0:
                publish_lidar_data(
                    lidar_annotators,
                    ['go2', 'g1'],
                    udp_publisher,
                    frame_count
                )

            frame_count += 1
            time.sleep(0.033)  # ~30 Hz

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        udp_publisher.close()
        simulation_app.close()


if __name__ == "__main__":
    main()

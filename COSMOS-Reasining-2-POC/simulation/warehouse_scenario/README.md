# Warehouse Scenario (Isaac Sim)

Reproducible Isaac Sim demo scenario for the narrative:

1. Normal warehouse operations with CCTV coverage and Go2 patrol
2. CCTV blindspot caused by moving occluder (forklift)
3. Open window and tilted shelf hazard event
4. Robot dispatch to investigate incident zone

## Files

- `scenario_config.py`: dataclass configuration for scene objects and timings
- `cctv_graph_builder.py`: per-camera ROS2 OmniGraph builder
- `warehouse_scenario.py`: scene setup + narrative execution loop

## Run

From Isaac Sim Python environment:

```bash
python3 -m simulation.warehouse_scenario.warehouse_scenario --narrative --ros2
```

Headless run:

```bash
python3 -m simulation.warehouse_scenario.warehouse_scenario --headless --narrative --ros2
```

Force narrative loop:

```bash
python3 -m simulation.warehouse_scenario.warehouse_scenario --narrative --loop
```

## CLI Arguments

- `--headless`: disable Isaac Sim UI
- `--ros2`: enable ROS2 camera and camera_info publishing for all CCTV cameras
- `--narrative`: run scripted 4-phase demo sequence
- `--loop`: force narrative to loop continuously

## ROS2 Topics

Each CCTV camera publishes:

- `/cctv/cam{i}/image_raw`
- `/cctv/cam{i}/camera_info`

with `i in [1..4]`.

## Notes

- The warehouse USD uses NVIDIA Simple Warehouse asset.
- Interactables (window, shelf) and lighting are configured to match the `go2_omniverse` demo style.
- In environments without Isaac Sim modules, config tests still run, but the scenario runtime requires Isaac Sim.

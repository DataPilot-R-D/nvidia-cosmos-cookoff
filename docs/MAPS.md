# Maps and Posegraphs

Last verified: 2026-02-10

## Where maps live (on `isaac-sim-1`)

Directory:

- `/home/ubuntu/maps`

Files observed:

- `office_map.yaml`
- `office_map.pgm`
- `office_posegraph.posegraph`
- `office_posegraph.data`

## How maps are used by the stack

The bringup launch file (`sras_bringup/launch/go2_stack.launch.py`) accepts:

- `map`: YAML map file, default `/home/ubuntu/maps/office_map.yaml`
- `posegraph_file`: base path, default `/home/ubuntu/maps/office_posegraph`
- `slam_deserialize_delay_s`: delay before calling `/slam_toolbox/deserialize_map`

Example:

```bash
ros2 launch sras_bringup go2_stack.launch.py \
  map:=/home/ubuntu/maps/office_map.yaml \
  posegraph_file:=/home/ubuntu/maps/office_posegraph \
  slam_deserialize_delay_s:=5.0
```

## How to verify the posegraph was loaded

The system uses the service:

- `/slam_toolbox/deserialize_map`

Manual call (same structure as in the bringup launch file):

```bash
POSEGRAPH_FILE=/home/ubuntu/maps/office_posegraph
ros2 service call /slam_toolbox/deserialize_map slam_toolbox/srv/DeserializePoseGraph \
  \"{filename: '$POSEGRAPH_FILE', match_type: 1, initial_pose: {x: 0.0, y: 0.0, theta: 0.0}}\"
```

If you change maps, update both the `.yaml/.pgm` and the posegraph base name accordingly.


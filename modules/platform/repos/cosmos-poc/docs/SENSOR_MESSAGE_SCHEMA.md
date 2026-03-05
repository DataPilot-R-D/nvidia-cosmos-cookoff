# Sensor message schema (Cosmos2 fusion candidate)

This repo includes two sample detection datasets:

- `data/sensor_samples/cosmos2/message.csv` (CSV)
- `data/sensor_samples/cosmos2/objects.db` (SQLite with camera frame JPEG BLOB)

## Format

### CSV format

CSV with header row (`message.csv`).

### Columns

| field | type | description |
|---|---:|---|
| `id` | int | Unique row id (within file). |
| `timestamp` | float | Unix epoch seconds (can be fractional). |
| `object_name` | string | Detected object class / label. |
| `object_description` | string | Free-text description of the object. |
| `robot_x`,`robot_y`,`robot_z` | float | Robot pose/position in `frame_id` coordinates. |
| `object_x`,`object_y`,`object_z` | float | Object position in `frame_id` coordinates. |
| `confidence` | float | Detection confidence (0..1). |
| `bbox_x_min`,`bbox_y_min`,`bbox_x_max`,`bbox_y_max` | int | 2D image bounding box in pixel coordinates (top-left/bottom-right). |
| `frame_id` | string | Coordinate frame (e.g. `map`). |

### SQLite format with frame BLOB

`objects.db` uses the same `detections` fields and adds:

| field | type | description |
|---|---:|---|
| `camera_frame_jpeg` | BLOB | JPEG bytes of the source camera frame for the detection row. |

Matching SQL schema:

- `data/sensor_samples/cosmos2/detections_schema_with_camera_blob.sql`

Helper script for querying/exporting frames:

- `scripts/query_object_database.py`

## Intended use (agent eval)

We want to test whether an agent (Cosmos2 + our orchestration) can:

1) Parse the schema reliably.
2) Ground objects spatially (near/far, relative ordering, clustering).
3) Cross-reference with image context (`bbox_*`) when an RGB frame is available.
4) Answer actionable questions.

## Validation ideas

### Deterministic parsing
- Return a JSON summary with:
  - list of objects
  - unique `object_name` set + counts
  - min/max timestamps
  - bbox sanity checks (`min < max`)

### Spatial reasoning
- Compute (or describe) distances from robot to each object.
- Identify nearest object(s) and top-N by confidence.

### Consistency / de-duplication
- Detect duplicates (same bbox + same object position) and reconcile.

### Example “expected answers”
- "List objects detected at timestamp T with confidence ≥ 0.5."
- "Which objects are wall-mounted and at what approximate positions?"
- "Return JSON: outlets/panels/labels with (x,y,z) and bbox."

### Frame-BLOB-specific checks
- "How many detections have `camera_frame_jpeg` present?"
- "Export JPEG frames for object filter `rack` and return saved file names."
- "Validate that each timestamp maps to one unique frame hash (same frame reused across rows at that timestamp)."

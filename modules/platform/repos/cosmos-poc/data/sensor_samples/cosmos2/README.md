# Cosmos2 sensor samples

Sample detections data for evaluating whether an agent can read and reason over fused perception data (LiDAR + camera + robot pose).

## Files

- `message.csv` - CSV sample data
- `detections_schema.sql` - base SQL schema (no frame blob)
- `objects.db` - SQLite sample with `camera_frame_jpeg` BLOB per detection
- `detections_schema_with_camera_blob.sql` - SQL schema matching `objects.db`

Schema notes: see `docs/SENSOR_MESSAGE_SCHEMA.md`.

`message.csv` is identical to the original `~/Downloads/message.txt` sample.

## Extracting images from BLOB

Use:

```bash
python3 scripts/query_object_database.py --stats
python3 scripts/query_object_database.py --export-frames data/sensor_samples/cosmos2/extracted_frames
```

Optional filters:

```bash
python3 scripts/query_object_database.py --export-frames data/sensor_samples/cosmos2/extracted_frames --frames-filter "rack" --frames-limit 10
```

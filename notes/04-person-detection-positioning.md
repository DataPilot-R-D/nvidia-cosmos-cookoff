# Module 2: Person Detection with Position Mapping

## What It Does

Uses Cosmos Reason2 to detect people in camera frames and map their positions relative to the environment. This feeds the reasoning layer with spatial awareness.

## How It Works

### Detection Pipeline

```
Camera frame (CCTV or robot)
  -> Cosmos Reason2-8B
  -> Structured output: {person_detected, count, positions, description}
  -> Position mapped to map frame via TF2
  -> Published to /perception/detections_3d
```

### Position Mapping

- Cosmos provides relative positioning ("person near desk, left side of frame")
- Combined with robot odometry + TF2 transforms
- Normalized to unified `map` frame
- All CCTV + robot detections in same coordinate system

## Cosmos Capabilities for Detection

From benchmark results:
- **Person detection accuracy: 4/5** (in direct mode, no reasoning)
- Relative positioning: 4/5
- Can describe spatial relationships ("person standing near the bookshelf")
- Handles multiple people in frame
- Works with varying lighting conditions

## Integration with LoRA

For smoke scenarios, the standard Cosmos model drops to 53.3% person detection.
The LoRA adapter (cosmos-lora-smoke module) brings this back to 96.2%.

```
Normal conditions:  Camera -> Cosmos Reason2 (base) -> 4/5 detection
Smoke conditions:   Camera -> Cosmos Reason2 + LoRA v6a -> 96.2% detection
```

## DimOS Memory Integration

The ros2-dimos-bridge module adds persistence:
- **Temporal memory**: "When was the last person seen in zone A?"
- **Spatial memory**: "Where have people been detected in the last hour?"
- Entity tracking across frames and time
- CLIP embeddings for semantic search

## Key Data Format

```json
{
  "detections_3d": [
    {
      "class": "person",
      "position": {"x": 2.3, "y": 1.1, "z": 0.0},
      "frame": "map",
      "confidence": 0.92,
      "source": "cctv_1",
      "timestamp": "2026-03-05T12:00:00Z"
    }
  ]
}
```

## Key Files

- `modules/cosmos-reasoning-benchmark/src/connectors/cosmos_client.py`
- `modules/cosmos-reasoning-benchmark/src/agents/surveillance_agent.py`
- `modules/ros2-dimos-bridge/src/nodes/spatial_memory_node.py`
- `docs/REASONING_LAYER_ARCHITECTURE.md` (spatial_object_recognition_node spec)

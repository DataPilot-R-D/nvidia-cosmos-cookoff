# Thermal Imaging & Smoke Detection Primer

## How Thermal Cameras Work

Thermal (FLIR) cameras detect **long-wave infrared radiation** (8-14 μm) emitted by objects based on their temperature. Unlike visible-light cameras, they don't need ambient light and can "see" heat signatures.

**Key advantage:** Human body heat (~37°C) creates a strong thermal signature that stands out against cooler backgrounds — even through certain types of smoke.

## Smoke Types & Penetration

| Smoke Type | Blocks Visible | Blocks Thermal | Blocks LiDAR | Real-World Use |
|------------|---------------|----------------|--------------|----------------|
| Cold smoke (M18) | ✅ Yes | ⚠️ Partially | ⚠️ Partially | Training, civilian |
| Hot smoke (fire) | ✅ Yes | ❌ No (heat visible) | ⚠️ Partially | Fire scenarios |
| VIRSS (military) | ✅ Yes | ✅ Yes | ⚠️ Partially | Military operations |

## Why This Matters for Security

Cold smoke grenades are commercially available and increasingly used by criminals to:
- Rob stores/warehouses (smoke screen → grab → run)
- Evade perimeter security systems
- Create confusion during intrusions

Standard RGB CCTV becomes useless. **Thermal cameras + AI** can maintain detection capability.

## The Challenge

While thermal cameras can detect heat through smoke, the resulting images are:
- **Noisy** — smoke particles scatter IR radiation
- **Low contrast** — smoke partially attenuates thermal signatures
- **Ambiguous** — warm objects (engines, pipes) can mimic human signatures

This is why a fine-tuned VLM (like our LoRA-adapted Cosmos) outperforms zero-shot approaches.

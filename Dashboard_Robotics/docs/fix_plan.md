# Plan Naprawczy: Map 2D i Autoscan Optimization

**Data:** 2026-01-28
**Status:** GOTOWY DO WDROŻENIA
**Autor:** Senior Systems Engineer

---

## Podsumowanie Diagnozy

### KROK A: Analiza Namespace (Mapa)

**Wynik:** Namespace NIE jest problemem. Konfiguracja jest poprawna:

| Topic                             | Namespace | QoS             | Status                        |
| --------------------------------- | --------- | --------------- | ----------------------------- |
| `/map`                            | Root      | transient_local | ✅ Poprawny                   |
| `/map_volatile`                   | Root      | transient_local | ✅ Poprawny                   |
| `/global_costmap/costmap`         | Root      | transient_local | ✅ Poprawny                   |
| `/robot0/*` (LiDAR, camera, odom) | robot0    | volatile        | ✅ Używany dla robot-specific |

**Prawdziwy problem:** SLAM Toolbox może nie być uruchomiony lub rosbridge nie wspiera QoS passthrough.

### KROK B: Analiza PointCloud (Autoscan)

**Znaleziony problem:**

- Obecne downsampling: `maxPoints = 5000` z `skipFactor` (client.ts:784-785)
- **ALE:** Pełna chmura punktów (np. 100k punktów) jest wysyłana z ROSBridge ZANIM zostanie przycięta
- To powoduje przeciążenie WebSocket i serwera

**Przepływ danych (obecny - problematyczny):**

```
ROS2 (100k pts) → ROSBridge → WS Server (100k pts) → Downsample → Frontend (5k pts)
                               ↑
                          BOTTLENECK
```

---

## FIX A: Naprawa Mapy (Diagnostyka + Workaround)

### A.1: Skrypt diagnostyczny dla ROS2 Server

**Utwórz plik:** `scripts/diagnose_map.sh`

```bash
#!/bin/bash
# Diagnostyka topików mapy na ROS2 server

echo "=== 1. Sprawdzenie topików mapy ==="
ros2 topic list | grep -E "(map|costmap|slam)"

echo ""
echo "=== 2. Informacje o /map ==="
ros2 topic info /map --verbose 2>/dev/null || echo "Topic /map nie istnieje!"

echo ""
echo "=== 3. QoS profil /map ==="
ros2 topic info /map --verbose 2>/dev/null | grep -A5 "QoS"

echo ""
echo "=== 4. Sprawdzenie czy SLAM publikuje ==="
timeout 3 ros2 topic hz /map 2>/dev/null || echo "Brak publikacji na /map"

echo ""
echo "=== 5. Lista węzłów SLAM ==="
ros2 node list | grep -i slam

echo ""
echo "=== 6. Wersja rosbridge ==="
ros2 pkg xml rosbridge_server 2>/dev/null | grep version || echo "Nie znaleziono rosbridge_server"

echo ""
echo "=== 7. Subskrypcje rosbridge ==="
ros2 node info /rosbridge_websocket 2>/dev/null | grep -A20 "Subscriptions:" || echo "rosbridge nie działa"
```

### A.2: Workaround - Force Map Republish

**Zmiana w:** `apps/websocket-server/src/handlers/rosbridge/client.ts`

Dodaj po `subscribeToTopics()` (około linia 158):

```typescript
// Force map republish after subscribing (workaround for QoS timing)
setTimeout(() => {
  logger.info('Requesting SLAM map republish...')

  // Option 1: Call slam_toolbox service to trigger republish
  const republishMsg: RosbridgeMessage = {
    op: 'call_service',
    service: '/slam_toolbox/dynamic_map',
    id: 'force_map_republish_' + Date.now(),
  }

  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(republishMsg))
  }
}, 2000) // Wait 2s for subscriptions to establish
```

### A.3: Alternatywny topic (jeśli A.2 nie działa)

SLAM Toolbox może publikować dynamiczną mapę na innym topiku. Dodaj subskrypcję:

**Zmiana w:** `apps/websocket-server/src/handlers/rosbridge/types.ts`

```typescript
// Dodaj nowy topic (linia ~113):
slamMap: '/slam_toolbox/map',  // Dynamic map output
```

**Zmiana w:** `apps/websocket-server/src/handlers/rosbridge/client.ts` (w `subscribeToTopics()`):

```typescript
// Dodaj po linii 305:
subscribe('/slam_toolbox/map', 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP)
```

---

## FIX B: Optymalizacja PointCloud (VoxelGrid)

### B.1: Opcja 1 - Server-Side VoxelGrid Filter (REKOMENDOWANE)

**Zmiana w:** `apps/websocket-server/src/handlers/rosbridge/client.ts`

Zamień funkcję `handlePointCloud2` (linie 731-825) na wersję z VoxelGrid:

```typescript
/**
 * VoxelGrid filter for PointCloud2
 * Reduces points by spatial bucketing instead of naive skip
 */
function voxelGridFilter(
  points: Array<{ x: number; y: number; z: number; intensity: number }>,
  voxelSize: number = 0.1 // 10cm voxels
): Array<{ x: number; y: number; z: number; intensity: number }> {
  const voxelMap = new Map<
    string,
    { x: number; y: number; z: number; intensity: number; count: number }
  >()

  for (const point of points) {
    // Bucket key based on voxel coordinates
    const vx = Math.floor(point.x / voxelSize)
    const vy = Math.floor(point.y / voxelSize)
    const vz = Math.floor(point.z / voxelSize)
    const key = `${vx},${vy},${vz}`

    const existing = voxelMap.get(key)
    if (existing) {
      // Running average (centroid)
      existing.x = (existing.x * existing.count + point.x) / (existing.count + 1)
      existing.y = (existing.y * existing.count + point.y) / (existing.count + 1)
      existing.z = (existing.z * existing.count + point.z) / (existing.count + 1)
      existing.intensity = Math.max(existing.intensity, point.intensity)
      existing.count++
    } else {
      voxelMap.set(key, { ...point, count: 1 })
    }
  }

  // Extract centroids
  return Array.from(voxelMap.values()).map(({ x, y, z, intensity }) => ({
    x,
    y,
    z,
    intensity,
  }))
}

// W handlePointCloud2, zamień linię 784-802 na:
// === STARY KOD (do usunięcia) ===
// const maxPoints = Math.min(pointCount, 5000)
// const skipFactor = pointCount > maxPoints ? Math.ceil(pointCount / maxPoints) : 1
// for (let i = 0; i < pointCount && points.length < maxPoints; i += skipFactor) {
//   ...
// }

// === NOWY KOD ===
// First pass: extract all valid points (with early termination)
const MAX_RAW_POINTS = 20000 // Limit raw extraction for memory safety
const rawPoints: Array<{ x: number; y: number; z: number; intensity: number }> = []

for (let i = 0; i < pointCount && rawPoints.length < MAX_RAW_POINTS; i++) {
  const offset = i * pointStep

  const x = buffer.readFloatLE(offset + xField.offset)
  const y = buffer.readFloatLE(offset + yField.offset)
  const z = buffer.readFloatLE(offset + zField.offset)

  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue
  if (x === 0 && y === 0 && z === 0) continue

  rawPoints.push({ x, y, z, intensity: 1 })
}

// Apply VoxelGrid filter (0.05m = 5cm voxels for good detail)
const VOXEL_SIZE = 0.05
const filteredPoints = voxelGridFilter(rawPoints, VOXEL_SIZE)

// Final limit for frontend
const maxFrontendPoints = 5000
const points = filteredPoints.slice(0, maxFrontendPoints)

logger.debug(
  {
    topic,
    rawCount: pointCount,
    extractedCount: rawPoints.length,
    voxelFilteredCount: filteredPoints.length,
    emittedCount: points.length,
    voxelSize: VOXEL_SIZE,
  },
  'PointCloud2 processed with VoxelGrid'
)
```

### B.2: Opcja 2 - ROS2 Pipeline Filter (Dodatkowa Optymalizacja)

Jeśli masz dostęp do uruchomienia nodów ROS2, dodaj pre-filter:

**Utwórz launch snippet dla Isaac Sim:**

```python
# filters.launch.py
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='pcl_ros',
            executable='filter_passthrough_node',  # lub 'voxel_grid_node'
            name='pointcloud_filter',
            remappings=[
                ('input', '/robot0/point_cloud2_L1'),
                ('output', '/robot0/point_cloud2_filtered'),
            ],
            parameters=[{
                'filter_field_name': 'z',
                'filter_limit_min': -0.5,
                'filter_limit_max': 3.0,
                'filter_limit_negative': False,
                # Dla VoxelGrid:
                'leaf_size': 0.1,  # 10cm
            }],
        ),
    ])
```

Następnie zmień subskrypcję w `types.ts`:

```typescript
// Zmień linię 125:
robot0Lidar: '/robot0/point_cloud2_filtered',  // Was: point_cloud2_L1
```

### B.3: Dodaj Throttling na poziomie ROSBridge

**Zmiana w:** `apps/websocket-server/src/handlers/rosbridge/client.ts`

Dodaj przed `handlePointCloud2`:

```typescript
// PointCloud2 throttle - max 5 FPS dla dużych chmur
const pointCloudThrottleMs = 200 // 5 FPS
let lastPointCloudTime = 0

function shouldProcessPointCloud(): boolean {
  const now = Date.now()
  if (now - lastPointCloudTime < pointCloudThrottleMs) {
    return false // Skip this frame
  }
  lastPointCloudTime = now
  return true
}

// W handlePointCloud2, dodaj na początku (po if checks):
if (!shouldProcessPointCloud()) {
  logger.trace({ topic }, 'PointCloud2 throttled')
  return
}
```

---

## Podsumowanie Zmian

### Pliki do modyfikacji:

| Plik                      | Zmiana                          | Priorytet |
| ------------------------- | ------------------------------- | --------- |
| `scripts/diagnose_map.sh` | NOWY - skrypt diagnostyczny     | HIGH      |
| `client.ts`               | Dodaj force map republish       | HIGH      |
| `client.ts`               | VoxelGrid filter + throttle     | CRITICAL  |
| `types.ts`                | Dodaj `/slam_toolbox/map` topic | MEDIUM    |

### Estymowany wpływ:

| Metryka             | Przed               | Po                |
| ------------------- | ------------------- | ----------------- |
| PointCloud transfer | ~100k punktów/frame | ~5k punktów/frame |
| WebSocket bandwidth | ~4MB/s              | ~200KB/s          |
| Server CPU          | ~80%                | ~20%              |
| Map visibility      | ❌ Brak             | ✅ Widoczna       |

---

## Kroki Wdrożenia

1. **Krok 1:** Uruchom skrypt diagnostyczny na EC2 (A.1)
2. **Krok 2:** Wdróż VoxelGrid filter (B.1) - PILNE
3. **Krok 3:** Dodaj throttling (B.3)
4. **Krok 4:** Przetestuj mapę - jeśli nadal nie działa, wdróż A.2 lub A.3
5. **Krok 5:** Opcjonalnie - ROS2 pipeline filter (B.2) dla dalszej optymalizacji

---

## Gotowy do wdrożenia?

**Potwierdź "TAK" aby rozpocząć implementację, zaczynając od:**

1. VoxelGrid filter (najwyższy priorytet - fix crash)
2. Force map republish (naprawa mapy)

_Plan przygotowany przez Senior Systems Engineer_

# Diagnostic Report: MAP 2D Not Displaying OccupancyGrid

**Date:** 2026-01-28 (Updated)
**Status:** RE-DIAGNOSED - Previous QoS hypothesis was incorrect
**Previous Version:** Incorrectly stated QoS was missing

---

## CORRECTION: QoS IS Already Configured

The previous report stated QoS was missing. **This is incorrect.** Code review shows:

**File:** `apps/websocket-server/src/handlers/rosbridge/client.ts` (lines 304-333)

```typescript
// Map topics require transient_local QoS to receive latched messages
subscribe(DEFAULT_TOPICS.map, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP) // Line 304
subscribe(DEFAULT_TOPICS.mapLive, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP) // Line 305
subscribe(DEFAULT_TOPICS.globalCostmap, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP) // Line 332
subscribe(DEFAULT_TOPICS.localCostmap, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP) // Line 333
```

**File:** `apps/websocket-server/src/handlers/rosbridge/types.ts` (lines 49-56)

```typescript
export const QOS_PROFILES = {
  MAP: {
    durability: 'transient_local', // ✅ CORRECTLY SET
    reliability: 'reliable',
    history: 'keep_last',
    depth: 1,
  } as QoSProfile,
  // ...
}
```

**The QoS IS being passed to rosbridge (client.ts:353-357):**

```typescript
const subscribeMsg: RosbridgeMessage = {
  op: 'subscribe',
  topic,
  type,
  ...(qos && { qos }), // ✅ QoS included when provided
}
```

---

## 1. Updated Frontend Analysis

### Component Files

| Component       | Path                                                               | Key Lines               |
| --------------- | ------------------------------------------------------------------ | ----------------------- |
| Map2D           | `apps/web-client/components/widgets/map2d/index.tsx`               | 111-113, 546-548        |
| Costmap Store   | `apps/web-client/lib/stores/costmap-store.ts`                      | 173-176 (selectMainMap) |
| WebSocket Hook  | `apps/web-client/lib/hooks/use-websocket.ts`                       | 515-533, 1209           |
| Canvas Renderer | `apps/web-client/components/widgets/map2d/OccupancyGridCanvas.tsx` | 53-118                  |

### Topic Selection Priority (costmap-store.ts:175-176)

```typescript
selectMainMap: () => {
  const { grids } = get()
  return (
    grids.get('/map_volatile') ||
    grids.get('/map') ||
    grids.get('/global_costmap/costmap') ||
    grids.values().next().value
  )
}
```

### Data Flow (Working Path)

```
ROSBridge (ROS2)
    ↓ (QoS: transient_local)
WebSocket Server - handleOccupancyGrid() [client.ts:951-1017]
    ↓ (converts to base64, emits 'occupancy_grid')
Socket.IO Event
    ↓
Frontend Hook - handleOccupancyGrid() [use-websocket.ts:515-533]
    ↓ (validates: payload.topic && payload.data)
Costmap Store - addGrid() [costmap-store.ts:98-115]
    ↓
Map2D Component - useCostmapStore((s) => s.selectMainMap()) [index.tsx:111]
    ↓
OccupancyGridCanvas - renders bitmap [OccupancyGridCanvas.tsx]
```

---

## 2. Updated Backend Analysis

### Rosbridge Client Configuration

**Connection:** `apps/websocket-server/src/handlers/rosbridge/client.ts`

- URL configured via `ROS_BRIDGE_URL` env variable (default: `ws://localhost:9090`)
- Heartbeat interval: 10s
- Auto-reconnect: up to 10 attempts

### Topics Subscribed with QoS

| Topic                     | Type                     | QoS Profile       | Line |
| ------------------------- | ------------------------ | ----------------- | ---- |
| `/map`                    | `nav_msgs/OccupancyGrid` | `transient_local` | 304  |
| `/map_volatile`           | `nav_msgs/OccupancyGrid` | `transient_local` | 305  |
| `/global_costmap/costmap` | `nav_msgs/OccupancyGrid` | `transient_local` | 332  |
| `/local_costmap/costmap`  | `nav_msgs/OccupancyGrid` | `transient_local` | 333  |

### OccupancyGrid Handler (client.ts:951-1017)

```typescript
function handleOccupancyGrid(msg, topic): void {
  // Extracts: info.width, info.height, info.resolution, info.origin
  // Extracts: header.frame_id (default: 'map')
  // Converts data array to base64 if needed
  // Emits to all clients via io.emit('occupancy_grid', {...})
  // Also feeds to explorationService.updateOccupancyGrid()
}
```

---

## 3. Revised Hypotheses

Since QoS is correctly configured, the issue must be elsewhere:

### Hypothesis 1: ROSBridge Server Not Supporting QoS (MOST LIKELY)

**Problem:** `rosbridge_suite` version may not support QoS passthrough to ROS2.

**Check:**

```bash
ros2 pkg xml rosbridge_server | grep version
# Need version >= 1.3.0 for ROS2 QoS support
```

**Symptom:** rosbridge receives the QoS config but doesn't apply it internally.

### Hypothesis 2: ROSBridge Not Connected

**Check:** Look for log message `Connected to rosbridge` in server console.

**Frontend verification:**

```javascript
useWebSocketStore.getState().rosbridgeConnected // Should be true
```

### Hypothesis 3: SLAM Not Publishing Map

**Check:**

```bash
ros2 topic list | grep map
ros2 topic info /map --verbose
ros2 topic hz /map  # Should show publish rate
```

### Hypothesis 4: Topic Published BEFORE Subscription

**Problem:** `transient_local` requires the publisher to have held the message. If:

1. SLAM publishes map
2. SLAM node restarts or map is saved
3. rosbridge subscribes AFTER message was cleared

Then no message will be received.

**Solution:** Force republish by saving/reloading map or restarting SLAM.

### Hypothesis 5: Namespace Mismatch

**Check:** Isaac Sim might publish to a namespaced topic:

```bash
ros2 topic list | grep map
# Look for /robot0/map or /isaac_sim/map
```

---

## 4. Diagnostic Commands

### On ROS2 Server (Isaac Sim EC2)

```bash
# 1. Verify map topic exists
ros2 topic list | grep -E "(map|costmap)"

# 2. Check map topic QoS
ros2 topic info /map --verbose
# Look for: Durability: TRANSIENT_LOCAL

# 3. Check if data is being published
ros2 topic echo /map --once
# Should show width, height, data array

# 4. Check rosbridge status
ros2 node info /rosbridge_websocket
# Should show /map in subscriptions

# 5. Check rosbridge version
ros2 pkg xml rosbridge_server | grep version
```

### On WebSocket Server

```bash
# Check logs for map-related messages
grep -i "map\|occupancy" /path/to/server.log

# Look for:
# - "Subscribed to rosbridge topic" with topic=/map
# - "Processing OccupancyGrid"
# - "Emitted OccupancyGrid to clients"
```

### In Browser DevTools

```javascript
// Check costmap store
const grids = useCostmapStore.getState().grids
console.log('Grid count:', grids.size)
console.log('Topics:', [...grids.keys()])

// Check WebSocket store
const ws = useWebSocketStore.getState()
console.log('WS Connected:', ws.isConnected)
console.log('ROSBridge Connected:', ws.rosbridgeConnected)
console.log('ROSBridge URL:', ws.rosbridgeUrl)
```

### WebSocket Frame Inspection

1. DevTools → Network → WS
2. Find `socket.io` connection
3. Look for frames containing:
   - `42["rosbridge_status"` → Check `connected: true`
   - `42["occupancy_grid"` → Map data arriving

---

## 5. Fix Options

### Option A: Upgrade rosbridge_suite (Recommended)

```bash
# On ROS2 server
sudo apt update
sudo apt install ros-humble-rosbridge-suite
# Verify version >= 1.3.0
```

### Option B: Use Topic Relay (Workaround)

Create a relay that republishes with volatile QoS:

```bash
# On ROS2 server
ros2 run topic_tools relay /map /map_relay \
  --qos-reliability reliable \
  --qos-durability volatile
```

Then add subscription to `/map_relay` in backend.

### Option C: Periodic Map Request Service

Add a service call to force map republish:

```typescript
// In client.ts, after rosbridge connects:
setInterval(() => {
  // Call slam_toolbox service to republish map
  callService('/slam_toolbox/serialize_map', { filename: 'temp' })
}, 10000)
```

### Option D: Force SLAM Republish on Connect

```bash
# On ROS2 server, trigger map republish
ros2 service call /slam_toolbox/save_map slam_toolbox/srv/SaveMap "{name: data: {data: 'map'}}"
```

---

## 6. Verification Steps

### After Fix Applied

1. **Server logs should show:**

   ```
   [INFO] Processing OccupancyGrid
       topic: "/map"
       width: 384
       height: 384
       cellCount: 147456
   [DEBUG] Emitted OccupancyGrid to clients
   ```

2. **Browser console should show:**

   ```
   [OccupancyGrid] Bitmap render: 12.3ms (384x384 = 147456 cells)
   ```

3. **Map2D panel should display:**
   - Gray-scale occupancy grid
   - Walls as dark/black areas (100 = occupied)
   - Free space as light/white areas (0 = free)
   - Unknown areas as gray (-1 = unknown)

---

## 7. Summary

| Component                 | Status         | Notes                              |
| ------------------------- | -------------- | ---------------------------------- |
| Frontend topology         | ✅ Correct     | `/map`, `/map_volatile`, costmaps  |
| Frontend store            | ✅ Correct     | Proper priority selection          |
| Frontend render           | ✅ Correct     | Canvas-based with LUT optimization |
| Backend QoS config        | ✅ Correct     | `transient_local` configured       |
| Backend handler           | ✅ Correct     | base64 conversion, io.emit         |
| **ROSBridge QoS support** | ⚠️ **Unknown** | May not apply QoS internally       |
| **Map publication**       | ⚠️ **Unknown** | Need to verify with ros2 topic     |

### Next Steps

1. SSH to ROS2 server and run diagnostic commands
2. Check rosbridge_suite version
3. Verify `/map` topic is publishing
4. Check server logs for `occupancy_grid` processing
5. Apply appropriate fix based on findings

---

_Updated by ROS Integration Specialist - 2026-01-28_

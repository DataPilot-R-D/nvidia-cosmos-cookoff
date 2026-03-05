# Research Summary: Nawigacja MAP 2D + Autoscan

**Data:** 2026-01-28
**Status:** Faza Analizy (Architect)

---

## 1. Analiza Zewnętrzna (dimensionalOS)

### 1.1 Repozytoria dimensionalOS

| Repozytorium     | Opis                                            | Relevancja                     |
| ---------------- | ----------------------------------------------- | ------------------------------ |
| **go2_ros2_sdk** | Unofficial ROS2 SDK for Unitree GO2 AIR/PRO/EDU | Wysokie - topiki ROS           |
| **dimos**        | The Dimensional Framework (41 stars)            | Średnia - architektura         |
| **PCT_planner**  | 3D navigation based on point cloud tomography   | Niska - zaawansowana nawigacja |
| **Open3D**       | 3D Data Processing                              | Niska - biblioteka 3D          |

### 1.2 Topiki ROS (GO2 SDK)

```yaml
# Sensory
/scan: sensor_msgs/LaserScan # LiDAR 2D
/point_cloud: sensor_msgs/PointCloud2 # LiDAR 3D
/odom: nav_msgs/Odometry # Odometria
/go2_camera/color/image: sensor_msgs/Image # Kamera frontowa
/imu: sensor_msgs/Imu # IMU

# Nawigacja
/cmd_vel: geometry_msgs/Twist # Komendy ruchu
/map: nav_msgs/OccupancyGrid # Mapa SLAM
/goal_pose: geometry_msgs/PoseStamped # Cel nawigacji (topic)
/navigate_to_pose: nav2_msgs/action/NavigateToPose # Cel nawigacji (ACTION!)

# Detekcja
/detected_objects: vision_msgs/Detection2DArray
```

**Ważne:** GO2 SDK używa **Nav2 Action Interface** (nie topic publishing) do nawigacji.

---

## 2. Analiza Lokalna

### 2.1 Topiki ROS w projekcie

**Plik:** `apps/websocket-server/src/handlers/rosbridge/types.ts`

```typescript
export const DEFAULT_TOPICS = {
  // Nawigacja
  scan: '/scan',
  cmdVel: '/cmd_vel',
  odom: '/odom',
  map: '/map',
  mapLive: '/map_volatile',
  goalPose: '/goal_pose',
  plan: '/plan',
  localPlan: '/local_plan',

  // Robot0 (Go2 Unitree / Isaac Sim)
  robot0CmdVel: '/robot0/cmd_vel',
  robot0Camera: '/robot0/front_cam/rgb',
  robot0Odom: '/robot0/odom',
  robot0Lidar: '/robot0/point_cloud2_L1',

  // Costmaps
  globalCostmap: '/global_costmap/costmap',
  localCostmap: '/local_costmap/costmap',

  // SLAM
  slamGraph: '/slam_toolbox/graph_visualization',
  slamScan: '/slam_toolbox/scan_visualization',

  // Nav2 Action Feedback
  navFeedback: '/navigate_to_pose/_action/feedback',
  navStatus: '/navigate_to_pose/_action/status',
}
```

### 2.2 Komponenty Frontendowe

#### MAP 2D

**Plik:** `apps/web-client/components/widgets/map2d/index.tsx`

| Element          | Plik                        | Linie | Stan               |
| ---------------- | --------------------------- | ----- | ------------------ |
| Główny komponent | `index.tsx`                 | 788   | ✅ Działa          |
| Canvas rendering | `VisualizationLayer.tsx`    | 548   | ✅ Zoptymalizowany |
| OccupancyGrid    | `OccupancyGridCanvas.tsx`   | -     | ✅ Działa          |
| Goal handler     | `GoalClickHandler.tsx`      | 60    | ✅ Działa          |
| Nav status       | `NavigationStatusPanel.tsx` | -     | ✅ Działa          |
| Map library      | `MapLibraryPanel.tsx`       | -     | ✅ Działa          |

**Funkcjonalności MAP 2D:**

- ✅ Wizualizacja OccupancyGrid (`/map`, `/global_costmap`, `/local_costmap`)
- ✅ Renderowanie ścieżki nawigacji (`/plan`)
- ✅ Ustawianie celu (goal) z wyborem theta
- ✅ Tryb waypoints (patrol)
- ✅ Canvas-based LiDAR overlay (50k+ punktów @60fps)
- ✅ Trail tracking (historia pozycji robota)
- ✅ SLAM nodes visualization
- ✅ NavigationStatusPanel (postęp, dystans, recoveries)

#### LiDAR Module

**Plik:** `apps/web-client/components/widgets/LidarModule.tsx`

| Element              | Linie   | Stan      |
| -------------------- | ------- | --------- |
| Three.js PointCloud  | 42-159  | ✅ Działa |
| Auto-detect topic    | 634-674 | ✅ Działa |
| **Auto Scan button** | 483-490 | ✅ Działa |
| ExplorationControls  | 398-588 | ✅ Działa |
| Save/Load map        | 452-472 | ✅ Działa |

**Funkcjonalności LiDAR:**

- ✅ Wizualizacja 3D point cloud (do 100k punktów)
- ✅ Auto-detect LIDAR topic (priority: `/scan` > `/robot0/lidar` > etc.)
- ✅ Accumulated map (SLAM history)
- ✅ **Auto Scan** = `socket.emit('start_slam')` → SLAM + Explore Lite
- ✅ Save/Load map do bazy SQLite
- ✅ Clear accumulated button

### 2.3 Backend - ROSBridge Handler

**Plik:** `apps/websocket-server/src/handlers/rosbridge/client.ts`

#### Nawigacja (linie 1429-1531)

```typescript
// Goal pose → Nav2 Action (NIE topic!)
socket.on('set_goal_pose', (data) => {
  const actionGoal = {
    op: 'send_action_goal',
    action: '/navigate_to_pose',
    action_type: 'nav2_msgs/action/NavigateToPose',
    args: { pose: { header, pose } },
    feedback: true,
    id: actionGoalId,
  }
  rosbridgeClient.ws.send(JSON.stringify(actionGoal))
})

// Cancel navigation
socket.on('cancel_navigation', () => {
  // 1. Stop velocity
  publish('/cmd_vel', { linear: { x: 0 }, angular: { z: 0 } })
  // 2. Cancel Nav2 action
  ws.send({ op: 'call_service', service: '/navigate_to_pose/_action/cancel_goal' })
})
```

#### Exploration (linie 1533-1598)

```typescript
socket.on('start_exploration', (data) => {
  explorationService.start({ maxWaypoints: data.maxWaypoints || 100 })
})

socket.on('stop_exploration', () => {
  explorationService.stop()
})
```

### 2.4 Zustand Stores

| Store                  | Plik      | Odpowiedzialność                                  |
| ---------------------- | --------- | ------------------------------------------------- |
| `path-store.ts`        | 329 linii | Goals, paths, waypoints, navigation progress      |
| `exploration-store.ts` | 372 linie | SLAM mode, map loading/saving, exploration status |
| `costmap-store.ts`     | -         | OccupancyGrid data                                |
| `websocket-store.ts`   | 246 linii | Socket communication, sendGoalPose()              |
| `lidar-store.ts`       | -         | LiDAR subscriptions, accumulated points           |

---

## 3. Architektura Przepływu Danych

### 3.1 Flow: Ustawienie Celu Nawigacji

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User clicks map                                                            │
│       │                                                                     │
│       ▼                                                                     │
│  GoalClickHandler.tsx                                                       │
│  (screen → flow → map coordinates)                                          │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                               │
│  │ path-store.ts   │────▶│ websocket-store │                               │
│  │ setGoalPose()   │     │ sendGoalPose()  │                               │
│  │ status: pending │     │ emit('set_goal')│                               │
│  └─────────────────┘     └────────┬────────┘                               │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ Socket.IO
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js)                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  rosbridge/client.ts                                                        │
│  socket.on('set_goal_pose')                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────┐                       │
│  │ ROSBridge WebSocket                             │                       │
│  │ op: 'send_action_goal'                          │                       │
│  │ action: '/navigate_to_pose'                     │                       │
│  │ action_type: 'nav2_msgs/action/NavigateToPose'  │                       │
│  └─────────────────────────────────────────────────┘                       │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ ROSBridge Protocol
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ROS 2 / Nav2                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  bt_navigator ───▶ planner_server ───▶ controller_server                   │
│                                                                             │
│  Feedback:                                                                  │
│  /navigate_to_pose/_action/feedback → distance_remaining, nav_time         │
│  /navigate_to_pose/_action/status   → SUCCEEDED(4), CANCELED(5), ABORTED(6)│
│  /plan                              → nav_msgs/Path (planned path)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FEEDBACK LOOP                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  rosbridge/client.ts                                                        │
│  handleActionFeedback() ───▶ io.emit('navigation_feedback')                │
│  handleActionResult()   ───▶ io.emit('navigation_status')                  │
│                                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  path-store.ts                                                              │
│  updateNavigationProgress({ distanceRemaining, navigationTime })           │
│  updateGoalStatus('reached' | 'failed' | 'canceled')                       │
│                                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  NavigationStatusPanel.tsx (UI update)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Flow: Auto Scan (SLAM + Explore)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LidarModule.tsx → ExplorationControls                                     │
│  "Auto Scan" button click                                                   │
│       │                                                                     │
│       ▼                                                                     │
│  handleToggleSlam()                                                         │
│  socket.emit('start_slam')                                                  │
│  exploration-store.startSlam()                                              │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  socket.on('start_slam')                                                    │
│       │                                                                     │
│       ▼                                                                     │
│  MapManagerService.startSlam()                                              │
│  ├── ros2 launch slam_toolbox online_async_launch.py                       │
│  └── ros2 launch explore_lite explore.launch.py                            │
│                                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  ExplorationService.start()                                                 │
│  ├── Frontier detection (from /global_costmap/costmap)                     │
│  ├── Select best frontier → send_action_goal(/navigate_to_pose)            │
│  ├── Wait for navigation result                                             │
│  └── Loop until exploredPercent >= 90% or failures > 3                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Topiki ROS - Kompletna Lista

### 4.1 Wizualizacja (Map 2D)

| Topic                     | Typ                      | Źródło          | Cel               |
| ------------------------- | ------------------------ | --------------- | ----------------- |
| `/map`                    | `nav_msgs/OccupancyGrid` | SLAM            | Główna mapa       |
| `/map_volatile`           | `nav_msgs/OccupancyGrid` | SLAM            | Mapa live         |
| `/global_costmap/costmap` | `nav_msgs/OccupancyGrid` | Nav2            | Globalna costmapa |
| `/local_costmap/costmap`  | `nav_msgs/OccupancyGrid` | Nav2            | Lokalna costmapa  |
| `/plan`                   | `nav_msgs/Path`          | Nav2 Planner    | Globalna ścieżka  |
| `/local_plan`             | `nav_msgs/Path`          | Nav2 Controller | Lokalna ścieżka   |

### 4.2 Nawigacja

| Topic/Action                            | Typ                               | Kierunek       | Cel                                   |
| --------------------------------------- | --------------------------------- | -------------- | ------------------------------------- |
| `/navigate_to_pose`                     | `nav2_msgs/action/NavigateToPose` | OUT → Nav2     | **Główny interfejs nawigacji**        |
| `/navigate_to_pose/_action/feedback`    | Feedback                          | IN ← Nav2      | Postęp nawigacji                      |
| `/navigate_to_pose/_action/status`      | Status                            | IN ← Nav2      | Status celu (4=OK, 5=Cancel, 6=Abort) |
| `/navigate_to_pose/_action/cancel_goal` | Service                           | OUT → Nav2     | Anulowanie nawigacji                  |
| `/goal_pose`                            | `geometry_msgs/PoseStamped`       | Topic (legacy) | Wizualizacja celu                     |
| `/cmd_vel`                              | `geometry_msgs/Twist`             | OUT → Robot    | Teleop / Stop                         |

### 4.3 LiDAR / SLAM

| Topic                               | Typ                              | Źródło       |
| ----------------------------------- | -------------------------------- | ------------ |
| `/scan`                             | `sensor_msgs/LaserScan`          | LiDAR 2D     |
| `/robot0/point_cloud2_L1`           | `sensor_msgs/PointCloud2`        | Go2 LiDAR 3D |
| `/slam_toolbox/graph_visualization` | `visualization_msgs/MarkerArray` | SLAM nodes   |
| `/slam_toolbox/scan_visualization`  | `sensor_msgs/LaserScan`          | SLAM scan    |

### 4.4 Robot State

| Topic               | Typ                  | Źródło          |
| ------------------- | -------------------- | --------------- |
| `/odom`             | `nav_msgs/Odometry`  | Robot odometria |
| `/robot0/odom`      | `nav_msgs/Odometry`  | Go2 odometria   |
| `/tf`, `/tf_static` | `tf2_msgs/TFMessage` | Transformacje   |

---

## 5. Pliki do Edycji

### 5.1 Frontend

| Plik                                                          | Priorytet | Zmiany |
| ------------------------------------------------------------- | --------- | ------ |
| `components/widgets/map2d/index.tsx`                          | Wysoki    | -      |
| `components/widgets/map2d/GoalClickHandler.tsx`               | Wysoki    | -      |
| `components/widgets/map2d/overlays/NavigationStatusPanel.tsx` | Średni    | -      |
| `components/widgets/LidarModule.tsx`                          | Wysoki    | -      |
| `lib/stores/path-store.ts`                                    | Średni    | -      |
| `lib/stores/exploration-store.ts`                             | Średni    | -      |

### 5.2 Backend

| Plik                              | Priorytet | Zmiany            |
| --------------------------------- | --------- | ----------------- |
| `handlers/rosbridge/client.ts`    | Wysoki    | -                 |
| `handlers/rosbridge/types.ts`     | Niski     | Topic definitions |
| `services/exploration-service.ts` | Średni    | -                 |
| `services/map-manager.ts`         | Średni    | -                 |

### 5.3 Shared Types

| Plik                                      | Priorytet  | Zmiany           |
| ----------------------------------------- | ---------- | ---------------- |
| `packages/shared-types/src/navigation.ts` | Nowy       | Navigation types |
| `packages/shared-types/src/maps.ts`       | Istniejący | Map types        |

---

## 6. Wnioski

### 6.1 Co już działa ✅

1. **Nawigacja MAP 2D**
   - Ustawianie celu z wyborem kierunku (theta)
   - Wysyłanie do Nav2 via Action Interface
   - Odbieranie feedback (dystans, czas, recoveries)
   - Wizualizacja ścieżki `/plan`
   - Anulowanie nawigacji

2. **Auto Scan (LiDAR)**
   - Przycisk "Auto Scan" triggery SLAM + Explore Lite
   - Wizualizacja 3D point cloud (Three.js)
   - Akumulacja punktów (map building)
   - Save/Load map do SQLite

3. **Wizualizacja**
   - OccupancyGrid overlay (map, global/local costmap)
   - Canvas-based rendering (50k+ punktów @60fps)
   - SLAM nodes visualization
   - Robot trail tracking

### 6.2 Potencjalne Usprawnienia

| Obszar      | Problem                                     | Propozycja                     |
| ----------- | ------------------------------------------- | ------------------------------ |
| UX          | Brak wizualnego feedbacku podczas nawigacji | Animowana ścieżka, ETA display |
| UX          | Waypoints wymagają ręcznego startu          | Auto-patrol mode               |
| Performance | Costmap updates mogą być częste             | Throttling/debouncing          |
| Reliability | Brak recovery po utracie połączenia         | Auto-reconnect + state sync    |

### 6.3 Architektura - Podsumowanie

```
┌─────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │    Map2dModule   │  │   LidarModule    │  │ Zustand Stores│ │
│  │  - ReactFlow     │  │  - Three.js      │  │ - path-store  │ │
│  │  - Canvas layers │  │  - PointCloud    │  │ - exploration │ │
│  │  - GoalHandler   │  │  - ExploreCtrl   │  │ - costmap     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                     │                     │         │
│           └─────────────────────┴─────────────────────┘         │
│                                 │                               │
│                    Socket.IO Events                             │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────┐
│                        NODE.JS BACKEND                          │
│                                 ▼                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ROSBridge Client Handler                    │  │
│  │  - set_goal_pose → Nav2 Action                          │  │
│  │  - start_slam → MapManager → SLAM + Explore             │  │
│  │  - Topic subscriptions → Event broadcast                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                 │                               │
│                    ROSBridge WebSocket                          │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────┐
│                          ROS 2 / Nav2                           │
│                                 ▼                               │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────┐ │
│  │slam_toolbox│  │bt_navigator │  │planner_srv │  │ctrl_srv  │ │
│  │            │  │             │  │            │  │          │ │
│  │/map        │  │/navigate_to │  │/compute    │  │/cmd_vel  │ │
│  │            │  │_pose        │  │_path       │  │          │ │
│  └────────────┘  └─────────────┘  └────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Następne Kroki

Po zatwierdzeniu tego dokumentu, przejść do fazy `/plan`:

1. **Plan implementacji** - szczegółowy podział na taski
2. **TDD** - testy przed kodem
3. **Iteracyjne wdrożenie** - po jednej funkcjonalności

---

_Dokument wygenerowany przez Architect Agent_
_Ostatnia aktualizacja: 2026-01-28_

# Architecture Audit Report

**Data audytu:** 2026-01-26
**Audytor:** Claude Code (Lead System Architect)
**Projekt:** Security Robot Command Center

---

## Executive Summary

Codebase jest funkcjonalny, ale zawiera znaczący dług techniczny:

- **3 pliki przekraczajace 800 linii** (max: 1,776 LOC)
- **22 console.log w kodzie produkcyjnym**
- **Zduplikowane systemy zarzadzania layoutem** (dashboard-store vs tab-store)
- **Hardcoded URLs** (w tym zewnetrzny IP AWS)

---

## 🔴 Critical Refactors

### 1. Monolityczny `rosbridge.ts` (1,776 linii)

**Lokalizacja:** `apps/websocket-server/src/handlers/rosbridge.ts`

**Problem:** Jeden plik obsluguje WSZYSTKIE typy wiadomosci ROS:

- Camera frames
- LIDAR point clouds
- Odometry
- IMU
- SLAM
- Navigation (Nav2)
- Costmaps
- Transforms (TF)

**Impact:**

- Niemozliwe testowanie jednostkowe
- Kazda zmiana w jednym handlerze wymaga przebudowy calego pliku
- Brak separacji odpowiedzialnosci

**Rekomendacja:**

```
handlers/
├── rosbridge/
│   ├── index.ts           # Orchestrator + connection management
│   ├── camera-handler.ts  # Video frames
│   ├── lidar-handler.ts   # Point cloud parsing
│   ├── nav-handler.ts     # Navigation + paths
│   ├── sensor-handler.ts  # IMU, odometry
│   ├── slam-handler.ts    # SLAM graph
│   └── types.ts           # Shared interfaces
```

---

### 2. Monolityczny `Map2dModule.tsx` (1,413 linii)

**Lokalizacja:** `apps/web-client/components/widgets/Map2dModule.tsx`

**Problem:** Komponent zawiera:

- Custom React Flow nodes (RobotNode, WaypointNode, SlamNode, etc.)
- Canvas rendering dla OccupancyGrid
- Stats overlay
- Goal click handling
- Coordinate conversion helpers
- Trail point management

**Impact:**

- Ponowne renderowanie calego komponentu przy kazdej zmianie
- Trudnosci w testowaniu pojedynczych funkcji
- Brak reuzywialnosci

**Rekomendacja:**

```
widgets/map2d/
├── index.tsx              # Main component (orchestrator)
├── OccupancyGridCanvas.tsx
├── StatsOverlay.tsx
├── GoalClickHandler.tsx
├── nodes/
│   ├── RobotNode.tsx
│   ├── WaypointNode.tsx
│   └── SlamNode.tsx
└── utils/
    ├── coordinate-transform.ts
    └── trail-manager.ts
```

---

### 3. Monolityczny `use-websocket.ts` (1,038 linii)

**Lokalizacja:** `apps/web-client/lib/hooks/use-websocket.ts`

**Problem:** Hook zawiera:

- Connection lifecycle management
- Reconnection logic z exponential backoff
- Message parsing i validation
- Store synchronization dla 10+ stores
- Error handling

**Rekomendacja:**

```
hooks/websocket/
├── index.ts               # Main hook (public API)
├── connection-manager.ts  # Connect/disconnect/reconnect
├── message-handlers.ts    # Per-message-type handlers
├── store-sync.ts          # Store update orchestration
└── types.ts
```

---

### 4. Hardcoded AWS IP Address

**Lokalizacja:** `apps/websocket-server/src/index.ts:37`

```typescript
const ROS_BRIDGE_URL = process.env.ROS_BRIDGE_URL ?? 'ws://18.156.176.87:9090'
```

**Problem:**

- Zewnetrzny IP w kodzie zrodlowym
- Zmiana wymaga rebuildu
- Potencjalne ryzyko bezpieczenstwa

**Rekomendacja:**

- Usunac fallback IP
- Wymagac konfiguracji przez `.env`
- Dodac walidacje przy starcie serwera

---

### 5. Hardcoded URL w Client

**Lokalizacja:** `apps/web-client/app/page.tsx:66`

```typescript
useWebSocket('http://localhost:8080')
```

**Problem:** Hardcoded zamiast `process.env.NEXT_PUBLIC_WS_URL`

---

## 🟡 Optimizations

### 1. Console.log Statements (22 wystapienia)

| Plik                   | Linie                        | Typ                 |
| ---------------------- | ---------------------------- | ------------------- |
| `use-websocket.ts`     | 215, 268, 281, 327, 335, 422 | Debug flow          |
| `websocket-store.ts`   | 161, 170, 218                | Command tracing     |
| `video-frame-store.ts` | 142, 145                     | Frame debugging     |
| `CameraModule.tsx`     | 210, 223                     | Canvas rendering    |
| `Map2dModule.tsx`      | 1132, 1137                   | Goal sending        |
| `LidarModule.tsx`      | 438, 445, 449, 696, 701, 717 | Exploration + topic |

**Rekomendacja:** Usunac wszystkie lub zamien na conditional logging:

```typescript
const DEBUG = process.env.NODE_ENV === 'development'
if (DEBUG) console.log('[DEBUG]', ...)
```

---

### 2. Zduplikowane Store Concepts

**Problem:** Dwa systemy zarzadzania layoutem:

| Store                | Linie | Przeznaczenie                   |
| -------------------- | ----- | ------------------------------- |
| `dashboard-store.ts` | 334   | Grid layout z react-grid-layout |
| `tab-store.ts`       | 545   | Tab-based layout z widgets      |

Oba eksportuja podobne typy (`WidgetConfig`, `Layout`).

**Rekomendacja:**

- Skonsolidowac do jednego `layout-store.ts`
- Tab store powinien tylko zarzadzac tabs (CRUD)
- Layout logika w jednym miejscu

---

### 3. Store Selector Underutilization

**Nieuzywane selektory (tylko w definicji + testach):**

| Selektor                 | Store               | Uzycie         |
| ------------------------ | ------------------- | -------------- |
| `selectMainMap`          | costmap-store       | 1 miejsce      |
| `selectLocalCostmap`     | costmap-store       | 0 (tylko test) |
| `selectRobot0Imu`        | imu-store           | 1 miejsce      |
| `selectTopicsByType`     | topic-store         | 0 (tylko test) |
| `selectSensorTopics`     | topic-store         | 0              |
| `selectNavigationTopics` | topic-store         | 0              |
| `selectExplorationInfo`  | exploration-store   | 0              |
| `selectCurrentTarget`    | exploration-store   | 0              |
| `selectFrontiers`        | exploration-store   | 0              |
| `selectSavedMaps`        | exploration-store   | 0              |
| `selectAssignedPanels`   | panel-routing-store | 0              |

**Rekomendacja:** Usunac nieuzywane selektory lub zaczac ich uzywac dla performance optimization (shallow comparison).

---

### 4. Store Subscription Granularity

**Problem:** Komponenty subskrybuja cale stores zamiast selektorow:

```typescript
// Obecnie (re-render przy KAZDEJ zmianie store)
const { robots, selectedRobotId } = useRobotStore()

// Lepiej (re-render tylko gdy zmieni sie robots)
const robots = useRobotStore((state) => state.robots)
const selectedRobotId = useRobotStore((state) => state.selectedRobotId)
```

**Impact:** Nadmiarowe re-rendery przy wysokiej czestotliwosci aktualizacji (60Hz LIDAR, 15 FPS video).

---

### 5. LIDAR Point Cloud Memory

**Lokalizacja:** `LidarModule.tsx`

```typescript
const MAX_RENDER_POINTS: 100_000
```

**Problem:** Cala tablica punktow jest tworzona od nowa przy kazdej aktualizacji.

**Rekomendacja:**

- Uzyj `BufferGeometry` z poolingiem
- Implementuj double buffering dla smooth updates

---

## 🗑️ Dead Code

### Pliki/Funkcje do usuniecia:

| Element                  | Lokalizacja            | Powod                   |
| ------------------------ | ---------------------- | ----------------------- |
| `DEFAULT_WIDGETS`        | dashboard-store.ts     | Stary system layoutu    |
| `DEFAULT_LAYOUT`         | dashboard-store.ts     | Stary system layoutu    |
| `selectLocalCostmap`     | costmap-store.ts       | Nieuzywany              |
| `selectTopicsByType`     | topic-store.ts         | Nieuzywany (tylko test) |
| `selectSensorTopics`     | topic-store.ts         | Nieuzywany              |
| `selectNavigationTopics` | topic-store.ts         | Nieuzywany              |
| `selectExplorationInfo`  | exploration-store.ts   | Nieuzywany              |
| `selectCurrentTarget`    | exploration-store.ts   | Nieuzywany              |
| `selectFrontiers`        | exploration-store.ts   | Nieuzywany              |
| `selectSavedMaps`        | exploration-store.ts   | Nieuzywany              |
| `selectAssignedPanels`   | panel-routing-store.ts | Nieuzywany              |

### Sprawdz i potencjalnie usun:

| Element                             | Lokalizacja          | Status                     |
| ----------------------------------- | -------------------- | -------------------------- |
| `.env.example` z `ENABLE_MOCK_DATA` | web-client           | Sprawdz czy uzywane        |
| `exploration-store.ts` API_BASE     | exploration-store.ts | Hardcoded http://localhost |

---

## 🟢 Proposed New Architecture

### Docelowa struktura `apps/web-client/`:

```
apps/web-client/
├── app/
│   ├── page.tsx           # Entry point (clean)
│   └── layout.tsx
│
├── components/
│   ├── shell/             # App shell components
│   │   ├── DashboardShell.tsx
│   │   ├── TopBar.tsx
│   │   ├── SidebarTabs.tsx
│   │   └── WidgetTray.tsx
│   │
│   ├── widgets/           # Widget modules (SPLIT)
│   │   ├── camera/
│   │   │   ├── index.tsx
│   │   │   ├── CameraSelector.tsx
│   │   │   ├── TopicSelector.tsx
│   │   │   └── VideoCanvas.tsx
│   │   │
│   │   ├── lidar/
│   │   │   ├── index.tsx
│   │   │   ├── PointCloudRenderer.tsx
│   │   │   └── ExplorationControls.tsx
│   │   │
│   │   ├── map2d/
│   │   │   ├── index.tsx
│   │   │   ├── OccupancyGridCanvas.tsx
│   │   │   ├── StatsOverlay.tsx
│   │   │   └── nodes/
│   │   │       ├── RobotNode.tsx
│   │   │       └── WaypointNode.tsx
│   │   │
│   │   └── common/
│   │       ├── ModuleRegistry.tsx
│   │       └── WidgetWrapper.tsx
│   │
│   └── dashboard/
│       ├── DashboardGrid.tsx
│       └── DropZone.tsx
│
├── lib/
│   ├── stores/            # Zustand stores (CONSOLIDATED)
│   │   ├── index.ts
│   │   ├── layout-store.ts     # Merged dashboard + tab
│   │   ├── robot-store.ts
│   │   ├── sensors/
│   │   │   ├── camera-store.ts
│   │   │   ├── lidar-store.ts
│   │   │   └── imu-store.ts
│   │   ├── navigation/
│   │   │   ├── path-store.ts
│   │   │   └── costmap-store.ts
│   │   └── websocket-store.ts
│   │
│   ├── hooks/
│   │   ├── websocket/          # SPLIT
│   │   │   ├── index.ts
│   │   │   ├── connection-manager.ts
│   │   │   └── message-handlers.ts
│   │   └── use-camera-stream.ts
│   │
│   └── utils/
│       └── coordinate-transform.ts
│
└── config/
    └── constants.ts       # All magic numbers here
```

### Docelowa struktura `apps/websocket-server/`:

```
apps/websocket-server/
├── src/
│   ├── index.ts           # Entry point (slim)
│   │
│   ├── handlers/
│   │   ├── rosbridge/
│   │   │   ├── index.ts   # Connection orchestrator
│   │   │   ├── camera-handler.ts
│   │   │   ├── lidar-handler.ts
│   │   │   ├── nav-handler.ts
│   │   │   ├── sensor-handler.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── camera.ts
│   │   └── webrtc.ts
│   │
│   ├── services/
│   │   └── exploration-service.ts
│   │
│   └── utils/
│       └── frontier-detection.ts
│
└── config/
    └── rosbridge-config.ts  # All ROS topic mappings
```

---

## Metryki Obecne vs Docelowe

| Metryka           | Obecna            | Docelowa   |
| ----------------- | ----------------- | ---------- |
| Max file size     | 1,776 LOC         | <500 LOC   |
| Console.log count | 22                | 0          |
| Hardcoded URLs    | 3                 | 0          |
| Store count       | 16                | 12         |
| Duplicate stores  | 2 (dashboard/tab) | 1 (layout) |
| Unused selectors  | 11                | 0          |

---

## Priorytety Refaktoryzacji

### Phase 1: Critical (Sprint 1)

1. [ ] Usun hardcoded AWS IP z `index.ts`
2. [ ] Usun wszystkie console.log
3. [ ] Podziel `rosbridge.ts` na moduly

### Phase 2: High (Sprint 2)

4. [ ] Podziel `Map2dModule.tsx` na komponenty
5. [ ] Podziel `use-websocket.ts` na moduly
6. [ ] Usun nieuzywane selektory

### Phase 3: Medium (Sprint 3)

7. [ ] Skonsoliduj dashboard-store + tab-store
8. [ ] Dodaj selective store subscriptions
9. [ ] Implementuj LIDAR memory optimization

---

## Pozytywne Aspekty

Co dziala dobrze:

- ✅ Zod validation na wszystkich message types
- ✅ TypeScript strict mode
- ✅ Immutable state patterns w Zustand
- ✅ Monorepo z shared-types
- ✅ Testy jednostkowe dla stores i hooks
- ✅ Dark tactical theme konsekwentny
- ✅ Brak circular dependencies
- ✅ Error handling w message parsing

---

**Koniec raportu**

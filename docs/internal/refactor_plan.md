# Refactoring Plan

**Data:** 2026-01-26
**Bazuje na:** `architecture_audit.md`
**Strategia:** Delete First → Extract Shared → Move Business Logic → Split Monoliths

---

## Zasady Refaktoryzacji

1. **Jeden krok = jeden commit** - kazdy krok konczy sie dzialajacym buildem
2. **Checkpoint przed i po** - weryfikacja ze UI dziala
3. **Immutability** - nie modyfikuj istniejacych plikow, tworzac nowe
4. **Feature flags** - duze zmiany za flagami (opcjonalne)

---

## Phase 0: Preparation (15 min)

### Step 0.1: Create baseline snapshot

```bash
# Utworz branch refactor
git checkout -b refactor/architecture-cleanup

# Zapisz baseline metryki
wc -l apps/web-client/components/widgets/*.tsx > metrics_before.txt
wc -l apps/websocket-server/src/handlers/*.ts >> metrics_before.txt
```

**Checkpoint:**

```bash
pnpm build && pnpm test
```

---

## Phase 1: Delete Dead Code (30 min)

> Najtansza operacja - usuwamy niepotrzebny kod zanim zaczniemy refaktorowac

### Step 1.1: Remove all console.log statements

**Pliki do edycji:**
| Plik | Linie do usuniecia |
|------|---------------------|
| `use-websocket.ts` | 215, 268, 281, 327, 335, 422 |
| `websocket-store.ts` | 161, 170, 218 |
| `video-frame-store.ts` | 142, 145 |
| `CameraModule.tsx` | 210, 223 |
| `Map2dModule.tsx` | 1132, 1137 |
| `LidarModule.tsx` | 438, 445, 449, 696, 701, 717 |

**Akcja:**

```bash
# Znajdz wszystkie console.log
grep -rn "console.log" apps/web-client/lib apps/web-client/components --include="*.ts" --include="*.tsx"

# Usun recznie lub przez sed (ostroznie!)
```

**Checkpoint:**

```bash
pnpm build && pnpm test
# UI test: Otworz dashboard, sprawdz DevTools console - powinno byc czysto
```

**Commit:** `chore: remove all console.log statements from production code`

---

### Step 1.2: Remove unused selectors from stores

**Selektory do usuniecia:**

| Selektor                 | Plik                   | Akcja  |
| ------------------------ | ---------------------- | ------ |
| `selectLocalCostmap`     | costmap-store.ts       | DELETE |
| `selectTopicsByType`     | topic-store.ts         | DELETE |
| `selectSensorTopics`     | topic-store.ts         | DELETE |
| `selectNavigationTopics` | topic-store.ts         | DELETE |
| `selectExplorationInfo`  | exploration-store.ts   | DELETE |
| `selectCurrentTarget`    | exploration-store.ts   | DELETE |
| `selectFrontiers`        | exploration-store.ts   | DELETE |
| `selectSavedMaps`        | exploration-store.ts   | DELETE |
| `selectAssignedPanels`   | panel-routing-store.ts | DELETE |

**Przed usunieciem - weryfikacja:**

```bash
# Upewnij sie ze selektor nie jest uzywany
grep -rn "selectLocalCostmap" apps/web-client --include="*.ts" --include="*.tsx"
```

**Checkpoint:**

```bash
pnpm type-check && pnpm test
```

**Commit:** `chore: remove 9 unused store selectors`

---

### Step 1.3: Remove dead exports from index.ts

**Plik:** `apps/web-client/lib/stores/index.ts`

Usun re-exporty dla usunietych selektorow.

**Checkpoint:**

```bash
pnpm build
```

**Commit:** `chore: clean up store index exports`

---

### Step 1.4: Remove hardcoded AWS IP

**Plik:** `apps/websocket-server/src/index.ts:37`

**Przed:**

```typescript
const ROS_BRIDGE_URL = process.env.ROS_BRIDGE_URL ?? 'ws://18.156.176.87:9090'
```

**Po:**

```typescript
const ROS_BRIDGE_URL = process.env.ROS_BRIDGE_URL

if (!ROS_BRIDGE_URL) {
  logger.error('ROS_BRIDGE_URL environment variable is required')
  process.exit(1)
}
```

**Aktualizuj `.env.example`:**

```env
ROS_BRIDGE_URL=ws://localhost:9090  # Required - ROSBridge WebSocket URL
```

**Checkpoint:**

```bash
# Bez .env powinien upasc z clear error
ROS_BRIDGE_URL= pnpm --filter websocket-server dev
# Z .env powinien dzialac
```

**Commit:** `fix: require ROS_BRIDGE_URL env var, remove hardcoded IP`

---

### Step 1.5: Fix hardcoded URL in page.tsx

**Plik:** `apps/web-client/app/page.tsx:66`

**Przed:**

```typescript
useWebSocket('http://localhost:8080')
```

**Po:**

```typescript
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080'
useWebSocket(WS_URL)
```

**Checkpoint:**

```bash
pnpm build:web
```

**Commit:** `fix: use env var for WebSocket URL in page.tsx`

---

## Phase 2: Extract Shared Logic (1h)

> Wyciagamy logike biznesowa z komponentow UI do `lib/`

### Step 2.1: Create TopicRegistry module

**Cel:** Centralizacja logiki kategoryzacji topiców ROS

**Nowy plik:** `apps/web-client/lib/ros/topic-registry.ts`

```typescript
/**
 * ROS Topic Registry
 *
 * Centralized topic categorization and routing logic.
 * Extracted from TopicListWidget.tsx for reusability.
 */

import type { ModuleType } from '@/components/widgets/ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

export interface TopicCategory {
  name: string
  icon: string
  color: string
  pattern: RegExp
  targetModule: ModuleType | null
}

export interface CategorizedTopic {
  name: string
  type: string
  category: TopicCategory | null
  color: string
  icon: string
  shortType: string
}

// =============================================================================
// Configuration
// =============================================================================

export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    name: 'LIDAR',
    icon: '~',
    color: '#00ffff',
    pattern: /sensor_msgs\/(LaserScan|PointCloud2)/,
    targetModule: 'lidar',
  },
  {
    name: 'Camera',
    icon: '[]',
    color: '#ff00ff',
    pattern: /sensor_msgs\/(Image|CompressedImage)/,
    targetModule: 'camera',
  },
  {
    name: 'Odometry',
    icon: '<>',
    color: '#00ff00',
    pattern: /nav_msgs\/Odometry/,
    targetModule: 'map-2d',
  },
  {
    name: 'Pose',
    icon: '+',
    color: '#ffff00',
    pattern: /geometry_msgs\/(Pose|PoseStamped|PoseWithCovariance)/,
    targetModule: 'map-2d',
  },
  {
    name: 'Map',
    icon: '#',
    color: '#ff8800',
    pattern: /nav_msgs\/(OccupancyGrid|Path)/,
    targetModule: 'map-2d',
  },
  {
    name: 'IMU',
    icon: '*',
    color: '#88ff00',
    pattern: /sensor_msgs\/Imu/,
    targetModule: null,
  },
  {
    name: 'TF',
    icon: '@',
    color: '#8888ff',
    pattern: /tf2_msgs\/TFMessage/,
    targetModule: null,
  },
  {
    name: 'Twist',
    icon: '>',
    color: '#ff88ff',
    pattern: /geometry_msgs\/Twist/,
    targetModule: 'controls',
  },
]

// =============================================================================
// Functions
// =============================================================================

export function getTopicCategory(type: string): TopicCategory | null {
  return TOPIC_CATEGORIES.find((cat) => cat.pattern.test(type)) || null
}

export function getTopicColor(type: string): string {
  const category = getTopicCategory(type)
  return category?.color || '#666666'
}

export function getTopicIcon(type: string): string {
  const category = getTopicCategory(type)
  return category?.icon || '?'
}

export function getShortTypeName(type: string): string {
  const parts = type.split('/')
  return parts[parts.length - 1] || type
}

export function categorizeTopic(name: string, type: string): CategorizedTopic {
  const category = getTopicCategory(type)
  return {
    name,
    type,
    category,
    color: category?.color || '#666666',
    icon: category?.icon || '?',
    shortType: getShortTypeName(type),
  }
}

export function filterTopicsByCategory(
  topics: Array<{ name: string; type: string }>,
  categoryName: string
): Array<{ name: string; type: string }> {
  const category = TOPIC_CATEGORIES.find((c) => c.name === categoryName)
  if (!category) return []
  return topics.filter((t) => category.pattern.test(t.type))
}

export function filterCameraTopics(
  topics: Array<{ name: string; type: string }>
): Array<{ name: string; type: string }> {
  return filterTopicsByCategory(topics, 'Camera')
}

export function filterLidarTopics(
  topics: Array<{ name: string; type: string }>
): Array<{ name: string; type: string }> {
  return filterTopicsByCategory(topics, 'LIDAR')
}
```

**Checkpoint:**

```bash
pnpm type-check
```

**Commit:** `feat: extract TopicRegistry module from UI components`

---

### Step 2.2: Create lib/ros/index.ts barrel

**Nowy plik:** `apps/web-client/lib/ros/index.ts`

```typescript
export * from './topic-registry'
```

**Commit:** `chore: add ros module barrel export`

---

### Step 2.3: Update TopicListWidget to use TopicRegistry

**Plik:** `apps/web-client/components/widgets/TopicListWidget.tsx`

**Zmiany:**

1. Usun lokalna definicje `TOPIC_CATEGORIES`
2. Usun lokalne funkcje helper
3. Importuj z `@/lib/ros`

```typescript
// PRZED (linki 37-130)
const TOPIC_CATEGORIES: TopicCategory[] = [...]
function getTopicCategory(type: string): TopicCategory | null {...}
function getTopicColor(type: string): string {...}
function getTopicIcon(type: string): string {...}
function getShortTypeName(type: string): string {...}

// PO
import {
  TOPIC_CATEGORIES,
  getTopicCategory,
  getTopicColor,
  getTopicIcon,
  getShortTypeName,
  type TopicCategory,
} from '@/lib/ros'
```

**Checkpoint:**

```bash
pnpm build && pnpm test
# UI test: Otworz TopicListWidget, sprawdz czy kategoryzacja dziala
```

**Commit:** `refactor: TopicListWidget uses TopicRegistry`

---

### Step 2.4: Update CameraModule to use TopicRegistry

**Plik:** `apps/web-client/components/widgets/CameraModule.tsx`

Zastap lokalna logike filtrowania:

```typescript
// PRZED (linia ~485)
return allTopics.filter((topic) => {
  const type = topic.type.toLowerCase()
  return type.includes('image') || type.includes('compressedimage')
})

// PO
import { filterCameraTopics } from '@/lib/ros'
// ...
return filterCameraTopics(allTopics)
```

**Checkpoint:**

```bash
pnpm build
# UI test: Otworz CameraModule, sprawdz dropdown z topikami
```

**Commit:** `refactor: CameraModule uses TopicRegistry for filtering`

---

### Step 2.5: Update LidarModule to use TopicRegistry

**Plik:** `apps/web-client/components/widgets/LidarModule.tsx`

```typescript
// PRZED (linia ~619)
return allTopics.filter((topic) => {
  const type = topic.type.toLowerCase()
  return type.includes('pointcloud') || type.includes('laserscan')
})

// PO
import { filterLidarTopics } from '@/lib/ros'
// ...
return filterLidarTopics(allTopics)
```

**Checkpoint:**

```bash
pnpm build
# UI test: Otworz LidarModule, sprawdz dropdown z topikami
```

**Commit:** `refactor: LidarModule uses TopicRegistry for filtering`

---

### Step 2.6: Create CoordinateTransform utility

**Cel:** Wyciagnac logike transformacji wspolrzednych z Map2dModule

**Nowy plik:** `apps/web-client/lib/utils/coordinate-transform.ts`

```typescript
/**
 * Coordinate Transform Utilities
 *
 * Converts between ROS world coordinates and screen/canvas coordinates.
 * Extracted from Map2dModule.tsx.
 */

export interface MapMetadata {
  resolution: number
  width: number
  height: number
  origin: {
    x: number
    y: number
  }
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface WorldPoint {
  x: number
  y: number
}

/**
 * Convert ROS world coordinates to screen pixel coordinates
 */
export function worldToScreen(
  world: WorldPoint,
  mapMeta: MapMetadata,
  canvasWidth: number,
  canvasHeight: number
): ScreenPoint {
  const { resolution, origin, width, height } = mapMeta

  // Calculate scale factors
  const scaleX = canvasWidth / (width * resolution)
  const scaleY = canvasHeight / (height * resolution)
  const scale = Math.min(scaleX, scaleY)

  // Transform coordinates
  const screenX = ((world.x - origin.x) / resolution) * scale
  const screenY = canvasHeight - ((world.y - origin.y) / resolution) * scale

  return { x: screenX, y: screenY }
}

/**
 * Convert screen pixel coordinates to ROS world coordinates
 */
export function screenToWorld(
  screen: ScreenPoint,
  mapMeta: MapMetadata,
  canvasWidth: number,
  canvasHeight: number
): WorldPoint {
  const { resolution, origin, width, height } = mapMeta

  const scaleX = canvasWidth / (width * resolution)
  const scaleY = canvasHeight / (height * resolution)
  const scale = Math.min(scaleX, scaleY)

  const worldX = (screen.x / scale) * resolution + origin.x
  const worldY = ((canvasHeight - screen.y) / scale) * resolution + origin.y

  return { x: worldX, y: worldY }
}

/**
 * Calculate heading angle from two points (in radians)
 */
export function calculateHeading(from: WorldPoint, to: WorldPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/**
 * Normalize angle to [-PI, PI]
 */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI
  while (angle < -Math.PI) angle += 2 * Math.PI
  return angle
}
```

**Checkpoint:**

```bash
pnpm type-check
```

**Commit:** `feat: extract CoordinateTransform utility`

---

### Step 2.7: Create lib/utils/index.ts barrel

**Nowy plik:** `apps/web-client/lib/utils/index.ts`

```typescript
export * from './coordinate-transform'
```

**Commit:** `chore: add utils barrel export`

---

## Phase 3: Split Monolithic Files (2-3h)

> Podziel duze pliki na mniejsze moduly

### Step 3.1: Split rosbridge.ts - Create directory structure

**Utworz strukture:**

```bash
mkdir -p apps/websocket-server/src/handlers/rosbridge
```

**Commit:** `chore: create rosbridge handlers directory`

---

### Step 3.2: Extract types to rosbridge/types.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/types.ts`

Przenies wszystkie interfejsy z rosbridge.ts:

- `RosbridgeMessage`
- `LidarPointCloud`
- `RosbridgeClientState`
- `ROSBRIDGE_CONFIG`
- `DEFAULT_TOPICS`

**Checkpoint:**

```bash
pnpm --filter websocket-server type-check
```

**Commit:** `refactor: extract rosbridge types to separate file`

---

### Step 3.3: Extract camera-handler.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/camera-handler.ts`

Przenies:

- `cameraFrameState` (Map)
- `handleCameraMessage()`
- `processImageMessage()`
- Frame throttling logic

**Interfejs:**

```typescript
export function handleCameraMessage(
  msg: unknown,
  topic: string,
  io: SocketIOServer,
  logger: Logger
): void
```

**Checkpoint:**

```bash
pnpm --filter websocket-server build
```

**Commit:** `refactor: extract camera handler from rosbridge`

---

### Step 3.4: Extract lidar-handler.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/lidar-handler.ts`

Przenies:

- `handlePointCloud2Message()`
- `handleLaserScanMessage()`
- Point cloud parsing logic

**Checkpoint:**

```bash
pnpm --filter websocket-server build
```

**Commit:** `refactor: extract lidar handler from rosbridge`

---

### Step 3.5: Extract nav-handler.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/nav-handler.ts`

Przenies:

- `handlePathMessage()`
- `handleNavigationStatus()`
- `handleGoalPose()`
- Nav2 action client logic

**Checkpoint:**

```bash
pnpm --filter websocket-server build
```

**Commit:** `refactor: extract navigation handler from rosbridge`

---

### Step 3.6: Extract sensor-handler.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/sensor-handler.ts`

Przenies:

- `handleOdometryMessage()`
- `handleImuMessage()`

**Checkpoint:**

```bash
pnpm --filter websocket-server build
```

**Commit:** `refactor: extract sensor handler from rosbridge`

---

### Step 3.7: Extract slam-handler.ts

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/slam-handler.ts`

Przenies:

- `handleSlamGraphMessage()`
- SLAM visualization logic

**Checkpoint:**

```bash
pnpm --filter websocket-server build
```

**Commit:** `refactor: extract SLAM handler from rosbridge`

---

### Step 3.8: Create rosbridge/index.ts orchestrator

**Nowy plik:** `apps/websocket-server/src/handlers/rosbridge/index.ts`

```typescript
/**
 * ROSBridge Handler Orchestrator
 *
 * Manages WebSocket connection to ROSBridge server.
 * Delegates message handling to specialized handlers.
 */

import { handleCameraMessage } from './camera-handler'
import { handleLidarMessage } from './lidar-handler'
import { handleNavMessage } from './nav-handler'
import { handleSensorMessage } from './sensor-handler'
import { handleSlamMessage } from './slam-handler'
import type { RosbridgeMessage } from './types'

// Export main functions
export { createRosbridgeClient } from './connection'
export * from './types'
```

**Checkpoint:**

```bash
pnpm --filter websocket-server build && pnpm --filter websocket-server test
```

**Commit:** `refactor: create rosbridge orchestrator index`

---

### Step 3.9: Update main index.ts imports

**Plik:** `apps/websocket-server/src/index.ts`

```typescript
// PRZED
import { createRosbridgeClient } from './handlers/rosbridge'

// PO (bez zmian - barrel export)
import { createRosbridgeClient } from './handlers/rosbridge'
```

**Checkpoint:**

```bash
pnpm --filter websocket-server dev
# Test: Polacz z ROSBridge, sprawdz czy wiadomosci przechodzi
```

**Commit:** `refactor: rosbridge split complete - 1776 LOC -> ~300 LOC per file`

---

### Step 3.10: Split Map2dModule - Create directory structure

**Utworz strukture:**

```bash
mkdir -p apps/web-client/components/widgets/map2d/nodes
mkdir -p apps/web-client/components/widgets/map2d/overlays
```

**Commit:** `chore: create map2d component directory`

---

### Step 3.11: Extract OccupancyGridCanvas.tsx

**Nowy plik:** `apps/web-client/components/widgets/map2d/OccupancyGridCanvas.tsx`

Przenies:

- Canvas rendering logic
- `drawOccupancyGrid()` function
- Grid color mapping

**Props interface:**

```typescript
interface OccupancyGridCanvasProps {
  gridData: OccupancyGridData | null
  width: number
  height: number
  showGrid: boolean
}
```

**Checkpoint:**

```bash
pnpm build:web
```

**Commit:** `refactor: extract OccupancyGridCanvas from Map2dModule`

---

### Step 3.12: Extract StatsOverlay.tsx

**Nowy plik:** `apps/web-client/components/widgets/map2d/overlays/StatsOverlay.tsx`

Przenies:

- Stats display component
- FPS, robot count, trail points, etc.

**Checkpoint:**

```bash
pnpm build:web
```

**Commit:** `refactor: extract StatsOverlay from Map2dModule`

---

### Step 3.13: Extract RobotNode.tsx

**Nowy plik:** `apps/web-client/components/widgets/map2d/nodes/RobotNode.tsx`

Przenies:

- Robot marker React Flow node
- Robot icon SVG
- Heading indicator

**Checkpoint:**

```bash
pnpm build:web
```

**Commit:** `refactor: extract RobotNode from Map2dModule`

---

### Step 3.14: Extract WaypointNode.tsx

**Nowy plik:** `apps/web-client/components/widgets/map2d/nodes/WaypointNode.tsx`

**Checkpoint:**

```bash
pnpm build:web
```

**Commit:** `refactor: extract WaypointNode from Map2dModule`

---

### Step 3.15: Create map2d/index.tsx orchestrator

**Nowy plik:** `apps/web-client/components/widgets/map2d/index.tsx`

Slim orchestrator importujacy sub-komponenty.

**Checkpoint:**

```bash
pnpm build:web && pnpm test
# UI test: Otworz Map2D, sprawdz wszystkie funkcje
```

**Commit:** `refactor: Map2dModule split complete - 1413 LOC -> ~200 LOC per file`

---

### Step 3.16: Update ModuleRegistry imports

**Plik:** `apps/web-client/components/widgets/ModuleRegistry.tsx`

```typescript
// Update import path
const Map2dModule = dynamic(() => import('./map2d'), { ... })
```

**Checkpoint:**

```bash
pnpm build:web
# UI test: Dodaj Map2D widget z tray, sprawdz czy laduje
```

**Commit:** `refactor: update ModuleRegistry for map2d split`

---

## Phase 4: Consolidate Stores (1h)

### Step 4.1: Analyze dashboard-store vs tab-store usage

**Przed konsolidacja - sprawdz uzycie:**

```bash
grep -rn "useDashboardStore" apps/web-client --include="*.tsx"
grep -rn "useTabStore" apps/web-client --include="*.tsx"
```

**Decyzja:**

- Jesli `useDashboardStore` jest uzywany tylko w testach → usun
- Jesli oba sa aktywnie uzywane → skonsoliduj do `layout-store.ts`

**Checkpoint:**

```bash
# Document current usage
```

**Commit:** `docs: document store usage before consolidation`

---

### Step 4.2: Deprecate dashboard-store (if unused)

Jesli `useDashboardStore` nie jest uzywany w produkcji:

**Plik:** `apps/web-client/lib/stores/dashboard-store.ts`

Dodaj deprecation notice:

```typescript
/**
 * @deprecated Use useTabStore instead. This store will be removed in next release.
 */
export const useDashboardStore = ...
```

**Checkpoint:**

```bash
pnpm build
```

**Commit:** `deprecate: mark dashboard-store as deprecated`

---

### Step 4.3: Remove DEFAULT_WIDGETS and DEFAULT_LAYOUT

**Plik:** `apps/web-client/lib/stores/dashboard-store.ts`

Usun:

- `DEFAULT_WIDGETS`
- `DEFAULT_LAYOUT`

Zaktualizuj `index.ts` exports.

**Checkpoint:**

```bash
pnpm build && pnpm test
```

**Commit:** `chore: remove deprecated DEFAULT_WIDGETS and DEFAULT_LAYOUT`

---

## Phase 5: Performance Optimizations (30 min)

### Step 5.1: Add selective store subscriptions

**Przykladowa zmiana w Map2dModule:**

```typescript
// PRZED
const { robots, paths, waypoints } = useRobotStore()

// PO
const robots = useRobotStore((state) => state.robots)
const paths = usePathStore((state) => state.paths)
const waypoints = useMapStore((state) => state.waypoints)
```

**Checkpoint:**

```bash
# React DevTools Profiler: sprawdz re-render count
```

**Commit:** `perf: add selective store subscriptions to map components`

---

### Step 5.2: Memoize expensive computations

**Przyklad w LidarModule:**

```typescript
// PRZED
const filteredTopics = allTopics.filter(...)

// PO
const filteredTopics = useMemo(
  () => filterLidarTopics(allTopics),
  [allTopics]
)
```

**Checkpoint:**

```bash
pnpm build
```

**Commit:** `perf: memoize topic filtering in widget components`

---

## Phase 6: Final Verification (30 min)

### Step 6.1: Run full test suite

```bash
pnpm test
pnpm test:e2e
```

### Step 6.2: Measure improvement

```bash
# Compare with baseline
wc -l apps/web-client/components/widgets/**/*.tsx > metrics_after.txt
wc -l apps/websocket-server/src/handlers/**/*.ts >> metrics_after.txt

diff metrics_before.txt metrics_after.txt
```

### Step 6.3: Manual UI testing checklist

- [ ] Dashboard loads without errors
- [ ] Map2D shows occupancy grid
- [ ] Map2D shows robot position
- [ ] Camera widget streams video
- [ ] LIDAR widget shows point cloud
- [ ] Topic list categorizes correctly
- [ ] WebSocket reconnects on disconnect
- [ ] Goal pose sending works
- [ ] Exploration start/stop works

### Step 6.4: Create PR

```bash
git push -u origin refactor/architecture-cleanup
gh pr create --title "refactor: architecture cleanup per audit" --body "..."
```

---

## Summary

| Phase                   | Steps  | Estimated Time |
| ----------------------- | ------ | -------------- |
| 0. Preparation          | 1      | 15 min         |
| 1. Delete Dead Code     | 5      | 30 min         |
| 2. Extract Shared Logic | 7      | 1h             |
| 3. Split Monoliths      | 16     | 2-3h           |
| 4. Consolidate Stores   | 3      | 1h             |
| 5. Performance          | 2      | 30 min         |
| 6. Verification         | 4      | 30 min         |
| **TOTAL**               | **38** | **~6-7h**      |

---

## Metryki Docelowe

| Metryka           | Przed     | Po               |
| ----------------- | --------- | ---------------- |
| Max file size     | 1,776 LOC | <500 LOC         |
| rosbridge.ts      | 1,776 LOC | ~300 LOC (index) |
| Map2dModule.tsx   | 1,413 LOC | ~200 LOC (index) |
| use-websocket.ts  | 1,038 LOC | ~400 LOC         |
| console.log count | 22        | 0                |
| Unused selectors  | 11        | 0                |
| Hardcoded URLs    | 3         | 0                |

---

## Rollback Plan

Jesli cokolwiek pójdzie nie tak:

```bash
git checkout master
git branch -D refactor/architecture-cleanup
```

Kazdy krok ma swoj commit - mozna tez wrocic do konkretnego punktu.

---

**Koniec planu**

# Machine Usage & Robot Status Dashboard - Implementation Plan

> **Data:** 2026-01-27
> **Status:** DRAFT - Awaiting Approval
> **Runtime:** Bun (nie Node.js)
> **Pattern:** Checkpoint-Based Evals

---

## Executive Summary

Plan implementacji dashboardu "Machine Usage" (CPU/RAM serwera AWS) oraz "Robot Status" (wykorzystanie istniejących `RobotTelemetry`). Plan wykorzystuje wzorzec **Checkpoint-Based Evals** z 3 ścisłymi punktami kontrolnymi.

### Key Constraints

| Constraint          | Impact                                               |
| ------------------- | ---------------------------------------------------- |
| Bun runtime         | Musi zweryfikować kompatybilność `systeminformation` |
| Event loop blocking | Stats collection MUSI być async/non-blocking         |
| Ghost tabs bug      | Nowy widok nie może reaktywować tego buga            |
| Existing infra      | Wykorzystać `useWebSocket` + Zustand patterns        |

---

## 1. Backend Strategy (Bun-First)

### 1.1 Library Selection Decision

**Opcja A: `systeminformation` (Rekomendowana)**

```bash
pnpm --filter websocket-server add systeminformation
```

| Pros                                   | Cons                            |
| -------------------------------------- | ------------------------------- |
| 50+ system info functions              | ~2MB package size               |
| Cross-platform (Linux, macOS, Windows) | May need native rebuild for Bun |
| Active maintenance (2026)              | Some functions are sync         |
| GPU support (NVIDIA, AMD)              |                                 |

**Opcja B: Native `os` + Bun APIs (Fallback)**

```typescript
import os from 'os'
import { $ } from 'bun'

// CPU usage requires manual calculation
const cpus = os.cpus()
const loadavg = os.loadavg()

// Memory is straightforward
const totalMem = os.totalmem()
const freeMem = os.freemem()

// GPU requires shell command (nvidia-smi)
const gpuStats =
  await $`nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits`.text()
```

| Pros               | Cons                     |
| ------------------ | ------------------------ |
| Zero dependencies  | Manual CPU % calculation |
| Native Bun support | No GPU abstraction       |
| Minimal footprint  | Platform-specific code   |

**Decyzja:** Rozpoczynamy od Opcji A (`systeminformation`) z fallback do Opcji B jeśli Bun compatibility test zawiedzie.

### 1.2 Handler Architecture

**Lokalizacja:** `apps/websocket-server/src/handlers/machine-stats.ts`

```typescript
// Architektura handlera
export interface MachineStatsHandler {
  // Inicjalizacja - weryfikacja dostępności biblioteki
  initialize(): Promise<boolean>

  // Periodic emission (non-blocking)
  startEmitting(io: Server, intervalMs: number): void

  // Cleanup
  stop(): void
}

// Event emitowany do klientów
const EVENT_NAME = 'server:stats'

// Interwał emisji (konfigurowalny)
const DEFAULT_INTERVAL_MS = 5000 // 5 sekund
```

### 1.3 Non-Blocking Collection Pattern

```typescript
// ❌ WRONG: Blocking the event loop
function collectStats() {
  const cpu = si.currentLoad() // SYNC - blocks!
  return cpu
}

// ✅ CORRECT: Async with setImmediate
async function collectStatsNonBlocking(): Promise<MachineStats> {
  return new Promise((resolve) => {
    setImmediate(async () => {
      const [cpu, mem, gpu] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.graphics().catch(() => null), // GPU optional
      ])
      resolve(formatStats(cpu, mem, gpu))
    })
  })
}
```

---

## 2. Frontend Strategy

### 2.1 Zod Schema Definition

**Lokalizacja:** `packages/shared-types/src/machine-stats.ts`

```typescript
import { z } from 'zod'

// === CPU Stats ===
export const CpuStatsSchema = z.object({
  usage: z.number().min(0).max(100),
  cores: z.number().int().positive(),
  temperature: z.number().optional(), // Celsius, may not be available
  model: z.string().optional(),
})

// === Memory Stats ===
export const MemoryStatsSchema = z.object({
  used: z.number().nonnegative(), // bytes
  total: z.number().positive(), // bytes
  percent: z.number().min(0).max(100),
  swap: z
    .object({
      used: z.number().nonnegative(),
      total: z.number().nonnegative(),
    })
    .optional(),
})

// === GPU Stats (Optional) ===
export const GpuStatsSchema = z
  .object({
    usage: z.number().min(0).max(100),
    memoryUsed: z.number().nonnegative(), // bytes
    memoryTotal: z.number().nonnegative(), // bytes
    temperature: z.number().optional(),
    name: z.string().optional(),
  })
  .optional()

// === Disk Stats ===
export const DiskStatsSchema = z
  .object({
    used: z.number().nonnegative(),
    total: z.number().positive(),
    percent: z.number().min(0).max(100),
    mount: z.string(),
  })
  .optional()

// === Network Stats ===
export const NetworkStatsSchema = z
  .object({
    bytesIn: z.number().nonnegative(),
    bytesOut: z.number().nonnegative(),
    latency: z.number().nonnegative().optional(), // ms
  })
  .optional()

// === Main Message Schema ===
export const MachineStatsMessageSchema = z.object({
  type: z.literal('server:stats'),
  timestamp: z.number(),
  serverId: z.string(), // Identifier for the server (e.g., 'aws-ec2-main')
  cpu: CpuStatsSchema,
  memory: MemoryStatsSchema,
  gpu: GpuStatsSchema,
  disk: DiskStatsSchema,
  network: NetworkStatsSchema,
})

export type MachineStatsMessage = z.infer<typeof MachineStatsMessageSchema>
export type CpuStats = z.infer<typeof CpuStatsSchema>
export type MemoryStats = z.infer<typeof MemoryStatsSchema>
export type GpuStats = z.infer<typeof GpuStatsSchema>
```

### 2.2 Zustand Store Design

**Lokalizacja:** `apps/web-client/lib/stores/machine-stats-store.ts`

```typescript
import { create } from 'zustand'
import type { MachineStatsMessage } from '@workspace/shared-types'

interface MachineStatsState {
  // Current stats (latest)
  currentStats: MachineStatsMessage | null

  // Historical data (last 60 samples = 5 min @ 5s interval)
  history: MachineStatsMessage[]

  // Connection status
  isReceiving: boolean
  lastReceivedAt: number | null

  // Actions
  updateStats: (stats: MachineStatsMessage) => void
  clearHistory: () => void
  setReceiving: (isReceiving: boolean) => void
}

const MAX_HISTORY_LENGTH = 60 // 5 minutes of data

export const useMachineStatsStore = create<MachineStatsState>((set) => ({
  currentStats: null,
  history: [],
  isReceiving: false,
  lastReceivedAt: null,

  updateStats: (stats) =>
    set((state) => ({
      currentStats: stats,
      history: [...state.history.slice(-(MAX_HISTORY_LENGTH - 1)), stats],
      lastReceivedAt: Date.now(),
    })),

  clearHistory: () => set({ history: [], currentStats: null }),

  setReceiving: (isReceiving) => set({ isReceiving }),
}))
```

### 2.3 useWebSocket Hook Extension

**Modyfikacja:** `apps/web-client/lib/hooks/use-websocket.ts`

```typescript
// Dodaj import
import { useMachineStatsStore } from '@/lib/stores/machine-stats-store'
import { MachineStatsMessageSchema } from '@workspace/shared-types'

// W setupSocketHandlers():
socket.on('server:stats', (data: unknown) => {
  const parsed = MachineStatsMessageSchema.safeParse(data)
  if (parsed.success) {
    useMachineStatsStore.getState().updateStats(parsed.data)
    useMachineStatsStore.getState().setReceiving(true)
  } else {
    console.warn('[WS] Invalid server:stats message:', parsed.error)
  }
})

// Dodaj timeout detection dla isReceiving
const STATS_TIMEOUT_MS = 15000 // 3x interval
setInterval(() => {
  const { lastReceivedAt, setReceiving } = useMachineStatsStore.getState()
  if (lastReceivedAt && Date.now() - lastReceivedAt > STATS_TIMEOUT_MS) {
    setReceiving(false)
  }
}, 5000)
```

---

## 3. UI Components

### 3.1 Machine Usage Widget

**Lokalizacja:** `apps/web-client/components/widgets/MachineUsageModule.tsx`

**Layout (Tactical Dark Theme):**

```
┌─────────────────────────────────────────────┐
│ MACHINE USAGE                    [AWS-EC2]  │
├─────────────────────────────────────────────┤
│                                             │
│  CPU ████████████░░░░░░  67%    4 cores    │
│      Model: AMD EPYC 7R13                   │
│                                             │
│  RAM █████████░░░░░░░░░  48%   32GB total  │
│      15.4 GB / 32.0 GB                      │
│                                             │
│  GPU ██████░░░░░░░░░░░░  35%   NVIDIA T4   │
│      5.2 GB / 16.0 GB  •  42°C             │
│                                             │
│  ──────────────────────────────────────    │
│  [Mini sparkline chart - last 5 min]       │
│                                             │
└─────────────────────────────────────────────┘
```

**Components:**

1. `UsageBar` - Horizontal progress bar with threshold colors
2. `StatRow` - Label + bar + percentage + details
3. `SparklineChart` - Mini line chart for history (optional)

**Threshold Colors:**

- 0-60%: `accent-primary` (cyan)
- 60-85%: `accent-warning` (yellow)
- 85-100%: `accent-danger` (red)

### 3.2 Robot Status List Widget

**Lokalizacja:** `apps/web-client/components/widgets/RobotStatusListModule.tsx`

**Wykorzystuje istniejące `RobotTelemetry`:**

```typescript
// packages/shared-types/src/robot.ts (already defined!)
interface RobotTelemetry {
  cpuUsage?: number // 0-100
  memoryUsage?: number // 0-100
  temperature?: number // Celsius
  networkLatency?: number // ms
}
```

**Layout:**

```
┌─────────────────────────────────────────────┐
│ ROBOT STATUS                    [3 online]  │
├─────────────────────────────────────────────┤
│                                             │
│  ● GO2-001     CPU 45%  RAM 62%  🌡️ 38°C   │
│    Online • Battery 87% • Latency 12ms      │
│                                             │
│  ● GO2-002     CPU 23%  RAM 41%  🌡️ 35°C   │
│    Online • Battery 92% • Latency 8ms       │
│                                             │
│  ○ GO2-003     --       --       --         │
│    Offline • Last seen 5 min ago            │
│                                             │
└─────────────────────────────────────────────┘
```

**Features:**

- Status dot (online/offline/warning)
- Mini usage bars for CPU/RAM
- Temperature with warning threshold
- Network latency indicator
- Battery level
- Last seen timestamp

---

## 4. Checkpoints (Strict Eval Gates)

### Checkpoint 1: Backend PoC

**Objective:** Verify `systeminformation` works in Bun runtime without crashing.

**Entry Criteria:**

- [ ] Research summary reviewed
- [ ] Plan approved

**Implementation Steps:**

1. **Install dependency:**

   ```bash
   pnpm --filter websocket-server add systeminformation
   ```

2. **Create verification script:**

   ```typescript
   // apps/websocket-server/scripts/verify-stats.ts
   import si from 'systeminformation'

   async function verifyBunCompatibility() {
     console.log('🔍 Testing systeminformation in Bun...\n')

     try {
       // Test 1: CPU
       console.log('Test 1: CPU Load')
       const cpu = await si.currentLoad()
       console.log(`  ✅ CPU Usage: ${cpu.currentLoad.toFixed(1)}%`)
       console.log(`  ✅ Cores: ${cpu.cpus.length}`)

       // Test 2: Memory
       console.log('\nTest 2: Memory')
       const mem = await si.mem()
       console.log(`  ✅ Used: ${(mem.used / 1e9).toFixed(2)} GB`)
       console.log(`  ✅ Total: ${(mem.total / 1e9).toFixed(2)} GB`)

       // Test 3: GPU (optional, may fail)
       console.log('\nTest 3: GPU (optional)')
       try {
         const graphics = await si.graphics()
         if (graphics.controllers.length > 0) {
           console.log(`  ✅ GPU: ${graphics.controllers[0].model}`)
         } else {
           console.log('  ⚠️ No GPU detected')
         }
       } catch {
         console.log('  ⚠️ GPU stats not available')
       }

       // Test 4: Event loop blocking check
       console.log('\nTest 4: Event Loop Blocking')
       const start = performance.now()
       await Promise.all([
         si.currentLoad(),
         si.mem(),
         new Promise((r) => setTimeout(r, 100)), // Should complete ~100ms
       ])
       const elapsed = performance.now() - start
       if (elapsed < 500) {
         console.log(`  ✅ Non-blocking: ${elapsed.toFixed(0)}ms`)
       } else {
         console.log(`  ❌ Blocking detected: ${elapsed.toFixed(0)}ms`)
         process.exit(1)
       }

       console.log('\n✅ All tests passed! systeminformation is Bun-compatible.')
       process.exit(0)
     } catch (error) {
       console.error('\n❌ Verification failed:', error)
       console.log('\n🔄 Fallback: Use native os module instead')
       process.exit(1)
     }
   }

   verifyBunCompatibility()
   ```

3. **Run verification:**
   ```bash
   cd apps/websocket-server
   bun run scripts/verify-stats.ts
   ```

**Success Criteria:**

- [ ] Script exits with code 0
- [ ] CPU usage returns valid percentage (0-100)
- [ ] Memory returns valid bytes
- [ ] Event loop test completes in <500ms
- [ ] No native binding errors

**Failure Handling:**
If verification fails → implement Opcja B (native `os` module) and re-run checkpoint.

**Deliverables:**

- `apps/websocket-server/scripts/verify-stats.ts`
- Console output screenshot/log

---

### Checkpoint 2: Transport Layer

**Objective:** WebSocket emits `server:stats`, frontend receives and logs to console (no UI yet).

**Entry Criteria:**

- [ ] Checkpoint 1 passed

**Implementation Steps:**

1. **Create shared types:**

   ```
   packages/shared-types/src/machine-stats.ts
   packages/shared-types/src/index.ts (add export)
   ```

2. **Create backend handler:**

   ```
   apps/websocket-server/src/handlers/machine-stats.ts
   apps/websocket-server/src/index.ts (register handler)
   ```

3. **Create frontend store:**

   ```
   apps/web-client/lib/stores/machine-stats-store.ts
   ```

4. **Extend useWebSocket:**

   ```
   apps/web-client/lib/hooks/use-websocket.ts (add handler)
   ```

5. **Add console logging for verification:**
   ```typescript
   // Temporary console.log in store
   updateStats: (stats) => {
     console.log('[MachineStats] Received:', {
       cpu: stats.cpu.usage.toFixed(1) + '%',
       ram: stats.memory.percent.toFixed(1) + '%',
       timestamp: new Date(stats.timestamp).toISOString(),
     })
     // ... rest of implementation
   }
   ```

**Verification Script:**

```typescript
// apps/web-client/scripts/verify-transport.ts (run in browser console)
// 1. Open DevTools Console
// 2. Wait 10 seconds
// 3. Check for '[MachineStats] Received:' logs
// 4. Verify data updates every ~5 seconds

// Expected output:
// [MachineStats] Received: {cpu: "67.3%", ram: "48.2%", timestamp: "2026-01-27T..."}
// [MachineStats] Received: {cpu: "65.1%", ram: "48.4%", timestamp: "2026-01-27T..."}
```

**Success Criteria:**

- [ ] Backend emits `server:stats` every 5s
- [ ] Frontend receives and validates with Zod
- [ ] Console shows at least 3 consecutive messages
- [ ] Store `currentStats` is populated
- [ ] Store `history` accumulates entries
- [ ] No WebSocket errors in console

**Deliverables:**

- `packages/shared-types/src/machine-stats.ts`
- `apps/websocket-server/src/handlers/machine-stats.ts`
- `apps/web-client/lib/stores/machine-stats-store.ts`
- Modified `use-websocket.ts`
- Console output screenshot showing 3+ messages

---

### Checkpoint 3: UI Integration

**Objective:** Connect store to UI components, verify no "ghost tabs" bug.

**Entry Criteria:**

- [ ] Checkpoint 2 passed
- [ ] Console logging verified

**Implementation Steps:**

1. **Create MachineUsageModule:**

   ```
   apps/web-client/components/widgets/MachineUsageModule.tsx
   apps/web-client/components/widgets/__tests__/MachineUsageModule.test.tsx
   ```

2. **Create RobotStatusListModule:**

   ```
   apps/web-client/components/widgets/RobotStatusListModule.tsx
   apps/web-client/components/widgets/__tests__/RobotStatusListModule.test.tsx
   ```

3. **Register widgets:**

   ```
   apps/web-client/lib/dashboard/types.ts (add WidgetType)
   apps/web-client/lib/dashboard/registry.ts (add to registry)
   ```

4. **Add to default layout (optional):**

   ```typescript
   // dashboard-store.ts
   { id: 'machine-usage', type: 'machine_usage', ... }
   { id: 'robot-status-list', type: 'robot_status_list', ... }
   ```

5. **Remove temporary console.log from store**

**Ghost Tabs Regression Test:**

```typescript
// apps/web-client/e2e/ghost-tabs-regression.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Ghost Tabs Regression', () => {
  test('adding Machine Usage widget does not create ghost tabs', async ({ page }) => {
    await page.goto('/')

    // Count initial tabs
    const initialTabCount = await page.locator('[data-testid="sidebar-tab"]').count()

    // Add Machine Usage widget
    await page.click('[data-testid="add-widget-button"]')
    await page.click('[data-testid="widget-machine-usage"]')

    // Wait for widget to render
    await page.waitForSelector('[data-testid="machine-usage-widget"]')

    // Count tabs again
    const finalTabCount = await page.locator('[data-testid="sidebar-tab"]').count()

    // Should not create extra tabs
    expect(finalTabCount).toBe(initialTabCount)
  })

  test('widget updates without creating duplicate subscriptions', async ({ page }) => {
    await page.goto('/')

    // Monitor WebSocket messages
    const messages: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('[MachineStats]')) {
        messages.push(msg.text())
      }
    })

    // Wait for 15 seconds (3 update cycles)
    await page.waitForTimeout(15000)

    // Should have ~3 messages, not 6 or 9 (duplicate subscriptions)
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(messages.length).toBeLessThanOrEqual(5)
  })
})
```

**Success Criteria:**

- [ ] MachineUsageModule renders CPU/RAM bars
- [ ] Bars update in real-time (every 5s)
- [ ] Threshold colors work (green/yellow/red)
- [ ] RobotStatusListModule shows robot telemetry
- [ ] Ghost tabs E2E test passes
- [ ] No duplicate WebSocket subscriptions
- [ ] Unit tests pass (80%+ coverage)
- [ ] Build succeeds (`pnpm build`)

**Deliverables:**

- `MachineUsageModule.tsx` + tests
- `RobotStatusListModule.tsx` + tests
- E2E test file
- Screenshot of working UI
- Test coverage report

---

## 5. Files Summary

### New Files (to create)

| File                                                      | Checkpoint | Purpose                |
| --------------------------------------------------------- | ---------- | ---------------------- |
| `websocket-server/scripts/verify-stats.ts`                | 1          | Bun compatibility test |
| `shared-types/src/machine-stats.ts`                       | 2          | Zod schemas + types    |
| `websocket-server/src/handlers/machine-stats.ts`          | 2          | Backend stats emitter  |
| `web-client/lib/stores/machine-stats-store.ts`            | 2          | Zustand store          |
| `web-client/components/widgets/MachineUsageModule.tsx`    | 3          | CPU/RAM widget         |
| `web-client/components/widgets/RobotStatusListModule.tsx` | 3          | Robot list widget      |
| `web-client/e2e/ghost-tabs-regression.spec.ts`            | 3          | E2E regression test    |

### Modified Files

| File                                    | Checkpoint | Changes                    |
| --------------------------------------- | ---------- | -------------------------- |
| `shared-types/src/index.ts`             | 2          | Export machine-stats types |
| `websocket-server/src/index.ts`         | 2          | Register stats handler     |
| `web-client/lib/hooks/use-websocket.ts` | 2          | Add server:stats handler   |
| `web-client/lib/dashboard/types.ts`     | 3          | Add WidgetType enum values |

---

## 6. Risk Mitigation

| Risk                                      | Probability | Impact | Mitigation                                     |
| ----------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| `systeminformation` incompatible with Bun | Medium      | High   | Checkpoint 1 verifies; fallback to native `os` |
| GPU stats unavailable on EC2              | High        | Low    | Make GPU optional in schema                    |
| Event loop blocking                       | Medium      | High   | setImmediate wrapper; verify in Checkpoint 1   |
| Ghost tabs bug recurrence                 | Low         | High   | Dedicated E2E test in Checkpoint 3             |
| High CPU from frequent polling            | Low         | Medium | Configurable interval (default 5s)             |

---

## 7. Approval Request

**Plan Status:** DRAFT

**Awaiting approval to proceed with:**

1. ✅ Checkpoint 1: Backend PoC (systeminformation verification)
2. ✅ Checkpoint 2: Transport Layer (WebSocket + Store)
3. ✅ Checkpoint 3: UI Integration (Widgets + Regression tests)

**Estimated effort per checkpoint:**

- Checkpoint 1: ~1-2 hours
- Checkpoint 2: ~2-3 hours
- Checkpoint 3: ~3-4 hours

**Total:** ~6-9 hours

---

> **Please reply with "APPROVED" to begin implementation, or provide feedback for revisions.**

---

---

# Previous Plan: Security Robot Command Center - TDD Implementation Plan

## Executive Summary

Plan implementacji dashboardu Security Robot Command Center z użyciem podejścia TDD (RED-GREEN-REFACTOR). Implementacja podzielona na **5 faz** z **20 krokami**, każdy z referencją do designu Pencil i logiki WebSocket.

**Architektura:**

- **Dashboard Grid**: React Grid Layout (drag & drop widgety)
- **2D Mapa**: React Flow (@xyflow/react) dla wizualizacji robotów
- **State Management**: Zustand (osobne stores: robots, dashboard, websocket)
- **Real-time**: Socket.IO client z reconnection logic
- **Validation**: Zod schemas z @workspace/shared-types

---

## Pencil Design Components Reference

| Pencil ID | Component        | Usage                             |
| --------- | ---------------- | --------------------------------- |
| `7c4ZA`   | Button/Primary   | STOP button (orange/gold #8B6F47) |
| `O8WT8`   | Button/Secondary | AUTO button (outline)             |
| `kbK35`   | Button/Tertiary  | DOCK button (outline)             |
| `38GXX`   | Label/Large      | Widget titles (9px, tracking 1)   |
| `TuIGF`   | Label/Medium     | Section headers (7px)             |
| `CA20H`   | Label/Small      | Camera labels (5px)               |
| `htihy`   | Card/Camera      | Camera thumbnails (76x42px)       |
| `Hs7C6`   | Card/MainImage   | Main video view (160x90px)        |
| `tg9t2`   | Recording        | REC indicator (red dot + text)    |
| `IgHwB`   | Dot/White        | Online status                     |
| `NL1ey`   | Dot/Gray         | Offline status                    |
| `4lur6`   | Dot/Red          | Alert status                      |
| `tQlVp`   | Menu/Active      | Active sidebar item (orange bg)   |
| `LeDPK`   | Menu/Default     | Default sidebar item              |
| `A5ih9`   | Menu/Danger      | Emergency Stop item (red dot)     |
| `33GZe`   | Circle           | Joystick control (46x46px)        |
| `wbP9j`   | Icon/Menu        | 3-dot menu icon                   |

---

## Default Layout Configuration

```typescript
const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'map-3d',
    type: 'robot_map',
    title: '3D MAP',
    position: { x: 0, y: 0, w: 6, h: 5 },
    visible: true,
    locked: false,
  },
  {
    id: 'map-2d',
    type: 'robot_map',
    title: '2D MAP',
    position: { x: 6, y: 0, w: 3, h: 3 },
    visible: true,
    locked: false,
  },
  {
    id: 'lidar',
    type: 'telemetry_chart',
    title: 'LIDAR SCAN',
    position: { x: 9, y: 0, w: 3, h: 3 },
    visible: true,
    locked: false,
  },
  {
    id: 'chat',
    type: 'alerts_panel',
    title: 'AI CHAT',
    position: { x: 0, y: 5, w: 4, h: 2 },
    visible: true,
    locked: false,
  },
  {
    id: 'controls',
    type: 'command_panel',
    title: 'PRECISION CONTROLS',
    position: { x: 4, y: 5, w: 6, h: 2 },
    visible: true,
    locked: false,
  },
]
```

---

## Phase 1: Foundation - Stores & WebSocket (Steps 1-4)

### Step 1: WebSocket Connection Store

**Files:**

- `apps/web-client/lib/stores/websocket-store.ts`
- `apps/web-client/lib/stores/__tests__/websocket-store.test.ts`

**TDD Cycle:**

```
RED:   Test initial state is disconnected
GREEN: Create Zustand store with ConnectionStatus
REFACTOR: Use ConnectionStatusSchema from shared-types
```

**Test Cases:**

1. Initial state: `{ status: 'disconnected', clientId: null, error: null }`
2. `connect()` → status = 'connecting'
3. `setConnected(clientId)` → status = 'connected'
4. `disconnect()` → status = 'disconnected', clientId = null
5. `setError(msg)` → status = 'error'

---

### Step 2: Robot State Store

**Files:**

- `apps/web-client/lib/stores/robot-store.ts`
- `apps/web-client/lib/stores/__tests__/robot-store.test.ts`

**TDD Cycle:**

```
RED:   Test store can add/update robots
GREEN: Create store with Map<string, RobotEntity>
REFACTOR: Add selectors (activeRobots, robotById)
```

**Test Cases:**

1. Initial state: empty robots Map
2. `setRobot(robot)` adds new robot
3. `updateRobot(id, partial)` merges data immutably
4. `removeRobot(id)` deletes robot
5. `getRobotById(id)` returns correct robot
6. `getActiveRobots()` filters by status

---

### Step 3: Dashboard Layout Store

**Files:**

- `apps/web-client/lib/stores/dashboard-store.ts`
- `apps/web-client/lib/stores/__tests__/dashboard-store.test.ts`

**TDD Cycle:**

```
RED:   Test layout persists to localStorage
GREEN: Create store with persist middleware
REFACTOR: Add layout versioning for migrations
```

**Test Cases:**

1. Initial state loads DEFAULT_WIDGETS
2. `updateWidgetPosition(id, pos)` changes x,y,w,h
3. `toggleWidgetVisibility(id)` flips visible
4. `setSelectedRobot(id)` updates selection
5. `toggleSidebar()` flips sidebarOpen
6. Layout persists to localStorage on change
7. Layout loads from localStorage on mount

---

### Step 4: useWebSocket Custom Hook

**Files:**

- `apps/web-client/lib/hooks/use-websocket.ts`
- `apps/web-client/lib/hooks/__tests__/use-websocket.test.ts`

**TDD Cycle:**

```
RED:   Test hook connects on mount
GREEN: Create hook with socket.io-client
REFACTOR: Add exponential backoff reconnection
```

**Test Cases:**

1. Connects to WS_URL on mount
2. Validates messages with `parseWebSocketMessage()`
3. Dispatches robot_state to robot store
4. Dispatches connection to websocket store
5. Exposes `sendCommand(cmd)` function
6. Handles disconnect with reconnect
7. Cleans up socket on unmount

---

## Phase 2: Widget Container System (Steps 5-9)

### Step 5: WidgetWrapper Component

**Files:**

- `apps/web-client/components/widgets/WidgetWrapper.tsx`
- `apps/web-client/components/widgets/__tests__/WidgetWrapper.test.tsx`

**TDD Cycle:**

```
RED:   Test wrapper renders title + children
GREEN: Create component with card-tactical styling
REFACTOR: Add drag handle region
```

**Pencil Design References:**

- Title: `38GXX` (Label/Large) - uppercase, fontSize 9, tracking 1
- Container: dark tactical theme with border-tactical-700

**Test Cases:**

1. Renders children inside card
2. Displays title from config
3. Shows visibility toggle button
4. Shows lock/unlock button
5. Applies correct dimensions

---

### Step 6: Static Widget Grid (Drag & Drop Phase A)

**Files:**

- `apps/web-client/components/dashboard/WidgetGrid.tsx`
- `apps/web-client/components/dashboard/__tests__/WidgetGrid.test.tsx`

**Dependencies:**

```bash
pnpm --filter web-client add react-grid-layout
pnpm --filter web-client add -D @types/react-grid-layout
```

**TDD Cycle:**

```
RED:   Test grid renders widgets in positions
GREEN: Install react-grid-layout, render static
REFACTOR: Extract layout utilities
```

**Test Cases:**

1. Renders all visible widgets
2. Positions match x,y,w,h config
3. Uses 12-column grid
4. Hidden widgets not rendered
5. Row height = 60px

---

### Step 7: Draggable Widgets (Phase B)

**Files:** Same as Step 6

**TDD Cycle:**

```
RED:   Test drag updates position in store
GREEN: Enable isDraggable
REFACTOR: Add drag handle feedback
```

**Test Cases:**

1. Drag triggers onLayoutChange
2. Store receives updated position
3. Locked widgets cannot drag
4. Ghost preview on drag
5. Collision prevention

---

### Step 8: Resizable Widgets (Phase C)

**Files:** Same as Step 6

**TDD Cycle:**

```
RED:   Test resize updates dimensions
GREEN: Enable isResizable with min/max
REFACTOR: Tactical-styled resize handles
```

**Test Cases:**

1. Resize handles appear on hover
2. Resize triggers onLayoutChange
3. Respects minW: 2, minH: 2
4. Respects maxW: 12, maxH: 8
5. Locked widgets cannot resize

---

### Step 9: Layout Persistence (Phase D)

**Files:** Dashboard store + WidgetGrid

**TDD Cycle:**

```
RED:   Test layout survives refresh
GREEN: Zustand persist with localStorage
REFACTOR: Version migrations
```

**Test Cases:**

1. Saves to `dashboard-layout-v1`
2. Loads on mount
3. Invalid data → default layout
4. Reset button clears localStorage

---

## Phase 3: Map Widgets (Steps 10-13)

### Step 10: Robot Map Node Component

**Files:**

- `apps/web-client/components/map/RobotNode.tsx`
- `apps/web-client/components/map/__tests__/RobotNode.test.tsx`

**Pencil Design References:**

- Card styling: `htihy` (Card/Camera)
- Status dots: `IgHwB` (white), `NL1ey` (gray), `4lur6` (red)

**TDD Cycle:**

```
RED:   Test node shows robot + status
GREEN: Create custom React Flow node
REFACTOR: Add status animations
```

**Test Cases:**

1. Displays robot name
2. Correct status color
3. Battery indicator
4. Selected = highlight border
5. Hover = tooltip

---

### Step 11: 3D Map Widget (Main Map)

**Files:**

- `apps/web-client/components/widgets/RobotMapWidget.tsx`
- `apps/web-client/components/widgets/__tests__/RobotMapWidget.test.tsx`

**TDD Cycle:**

```
RED:   Test widget renders React Flow
GREEN: Create with ReactFlowProvider
REFACTOR: Add MiniMap + Controls
```

**Test Cases:**

1. ReactFlow at full widget size
2. Node per robot in store
3. Positions update in real-time
4. Click node → select robot
5. Zoom/pan controls work
6. MiniMap shows overview

---

### Step 12: 2D Grid Map Widget

**Files:**

- `apps/web-client/components/widgets/GridMapWidget.tsx`
- `apps/web-client/components/widgets/__tests__/GridMapWidget.test.tsx`

**TDD Cycle:**

```
RED:   Test grid shows waypoints
GREEN: SVG/canvas grid view
REFACTOR: Add zone overlays
```

**Test Cases:**

1. Grid with configurable cells
2. Robot dots on grid
3. Patrol waypoints visible
4. Zone boundaries
5. Click shows coordinates

---

### Step 13: LIDAR Scan Widget

**Files:**

- `apps/web-client/components/widgets/LidarWidget.tsx`
- `apps/web-client/components/widgets/__tests__/LidarWidget.test.tsx`

**TDD Cycle:**

```
RED:   Test radar visualization
GREEN: SVG radar with sweep
REFACTOR: Add data point trails
```

**Test Cases:**

1. Radar circle + grid lines
2. Animated sweep line
3. Data points appear
4. Points fade over time
5. Shows selected robot's LIDAR

---

## Phase 4: Control Widgets (Steps 14-17)

### Step 14: Sidebar Navigation

**Files:**

- `apps/web-client/components/layout/Sidebar.tsx`
- `apps/web-client/components/layout/__tests__/Sidebar.test.tsx`

**Pencil Design References:**

- Active item: `tQlVp` (Menu/Active) - orange bg #8B6F4730
- Default item: `LeDPK` (Menu/Default)
- Danger item: `A5ih9` (Menu/Danger) - red dot

**TDD Cycle:**

```
RED:   Test sidebar with menu items
GREEN: Create with Pencil components
REFACTOR: Collapsible behavior
```

**Test Cases:**

1. MONITORING label (TuIGF)
2. Live View (active), Recordings, Emergency Stop
3. Correct styling per state
4. Toggle open/closed
5. Width: 240px open, 64px collapsed

---

### Step 15: Precision Controls Widget

**Files:**

- `apps/web-client/components/widgets/ControlsWidget.tsx`
- `apps/web-client/components/widgets/__tests__/ControlsWidget.test.tsx`

**Pencil Design References:**

- Joystick: `33GZe` (Circle) - 46x46px nested circles
- Buttons: `7c4ZA` (STOP), `O8WT8` (AUTO), `kbK35` (DOCK)

**TDD Cycle:**

```
RED:   Test joystick + buttons render
GREEN: Create controls component
REFACTOR: Joystick drag logic
```

**Test Cases:**

1. Joystick renders
2. Buttons render (AUTO, DOCK, STOP)
3. Button clicks → sendCommand()
4. Joystick drag → velocity command
5. Buttons disabled when no robot selected
6. STOP always enabled

---

### Step 16: AI Chat Widget

**Files:**

- `apps/web-client/components/widgets/AIChatWidget.tsx`
- `apps/web-client/components/widgets/__tests__/AIChatWidget.test.tsx`

**Pencil Design References:**

- Message text: `FWp2a` (Caption) - fontSize 6

**TDD Cycle:**

```
RED:   Test displays system messages
GREEN: Scrollable message list
REFACTOR: Input placeholder
```

**Test Cases:**

1. Message list container
2. Displays alert messages
3. Auto-scroll to bottom
4. Timestamps shown
5. Different styling per type

---

### Step 17: Camera Feed Widget

**Files:**

- `apps/web-client/components/widgets/CameraWidget.tsx`
- `apps/web-client/components/widgets/__tests__/CameraWidget.test.tsx`

**Pencil Design References:**

- Main view: `Hs7C6` (Card/MainImage)
- Thumbnails: `htihy` (Card/Camera)
- REC indicator: `tg9t2` (Recording)

**TDD Cycle:**

```
RED:   Test video placeholder
GREEN: Video element container
REFACTOR: REC indicator + thumbnails
```

**Test Cases:**

1. Video container renders
2. "No Feed" when disconnected
3. REC indicator when recording
4. Thumbnail grid
5. Click thumbnail → switch main

---

## Phase 5: Integration (Steps 18-20)

### Step 18: Widget Toolbox (Phase E)

**Files:**

- `apps/web-client/components/dashboard/WidgetToolbox.tsx`
- `apps/web-client/components/dashboard/__tests__/WidgetToolbox.test.tsx`

**TDD Cycle:**

```
RED:   Test toolbox shows widget types
GREEN: Draggable widget palette
REFACTOR: Categories + search
```

**Test Cases:**

1. Shows available WidgetTypes
2. Drag-to-add widget
3. Already-added shows checkmark
4. Preview on hover
5. Collapsible to icon

---

### Step 19: Dashboard Page Integration

**Files:**

- `apps/web-client/app/page.tsx`
- `apps/web-client/app/layout.tsx`
- `apps/web-client/app/__tests__/page.test.tsx`

**TDD Cycle:**

```
RED:   Test page renders all components
GREEN: Assemble header + sidebar + grid
REFACTOR: Loading states + error boundaries
```

**Test Cases:**

1. Header + sidebar + grid render
2. WebSocket connects on mount
3. Connection status in header
4. Robot data populates widgets
5. Commands work
6. Layout persists

---

### Step 20: E2E Tests with Playwright

**Files:**

- `apps/web-client/e2e/dashboard.spec.ts`
- `apps/web-client/playwright.config.ts`

**TDD Cycle:**

```
RED:   Critical flows fail
GREEN: Flows pass with mock WS
REFACTOR: Visual regression tests
```

**Test Cases:**

1. Dashboard loads all widgets
2. Drag widget → verify persistence
3. Resize widget → verify persistence
4. Send command → verify WS message
5. Robot appears when state received
6. Emergency stop always works

---

## Critical Files

| File                                     | Purpose                  |
| ---------------------------------------- | ------------------------ |
| `packages/shared-types/src/websocket.ts` | Zod schemas for messages |
| `packages/shared-types/src/dashboard.ts` | Widget/Layout schemas    |
| `apps/web-client/app/page.tsx`           | Main dashboard page      |
| `apps/web-client/app/globals.css`        | Tactical theme CSS       |
| `apps/websocket-server/src/index.ts`     | WS server implementation |

---

## Verification Checklist

Po każdym kroku:

- [ ] Testy przechodzą (RED → GREEN)
- [ ] Coverage ≥ 80%
- [ ] Brak console.log w kodzie produkcyjnym
- [ ] Immutable state updates
- [ ] TypeScript strict mode bez błędów
- [ ] Referencja do Pencil komponentu zachowana

Po całym planie:

- [ ] `pnpm test` wszystkie testy przechodzą
- [ ] `pnpm build` buduje bez błędów
- [ ] `pnpm e2e` E2E testy przechodzą
- [ ] Dashboard wygląda jak design Pencil
- [ ] Drag & drop działa płynnie
- [ ] WebSocket reconnection działa

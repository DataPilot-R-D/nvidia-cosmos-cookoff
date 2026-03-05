# Security Robot Command Center - Development Guidelines

## Project Overview

This is a pnpm monorepo for a real-time Security Robot Command Center with:

- **apps/web-client**: Next.js 14+ Dashboard (App Router, Tailwind CSS, React Flow)
- **apps/websocket-server**: Node.js WebSocket Server (Socket.IO, Express, TypeScript)
- **apps/ros-bridge**: Python ROS 2 Bridge (websockets, Pydantic, asyncio)
- **packages/shared-types**: TypeScript Types + Zod Schemas
- **packages/typescript-config**: Shared TypeScript Configurations

---

## Stack-Specific Rules

### Next.js 14+ (App Router)

```typescript
// ✅ CORRECT: Server Components by default
export default function DashboardPage() {
  return <Dashboard />
}

// ✅ CORRECT: 'use client' only when necessary
'use client'
export function InteractiveMap() {
  const [zoom, setZoom] = useState(1)
  // ...
}

// ❌ WRONG: Adding 'use client' unnecessarily
'use client'
export function StaticCard({ title }: { title: string }) {
  return <div>{title}</div>  // No hooks, no events - doesn't need 'use client'
}
```

- Place API routes in `app/api/` directory
- Use React Server Actions for mutations when possible
- Co-locate components with routes when specific to that route
- Use `@/` import alias for project-level imports

### WebSocket Communication

```typescript
// ✅ CORRECT: Use types from shared-types + validate with Zod
import { WebSocketMessageSchema, parseWebSocketMessage } from '@workspace/shared-types'

socket.on('message', (raw) => {
  const message = parseWebSocketMessage(raw)
  if (!message) {
    logger.error('Invalid message received')
    return
  }
  // Type-safe message handling
})

// ❌ WRONG: Direct type assertions without validation
socket.on('message', (data) => {
  const message = data as RobotStateMessage // Unsafe!
})
```

- ALL messages MUST use types from `@workspace/shared-types`
- Validate ALL incoming messages with Zod schemas
- Handle reconnection with exponential backoff
- Implement heartbeat/ping-pong for connection health

### State Management (Zustand)

```typescript
// ✅ CORRECT: Immutable state updates
import { create } from 'zustand'

interface RobotStore {
  robots: Map<string, RobotEntity>
  updateRobot: (id: string, data: Partial<RobotEntity>) => void
}

export const useRobotStore = create<RobotStore>((set) => ({
  robots: new Map(),
  updateRobot: (id, data) =>
    set((state) => ({
      robots: new Map(state.robots).set(id, {
        ...state.robots.get(id)!,
        ...data,
      }),
    })),
}))

// ❌ WRONG: Mutating state directly
updateRobot: (id, data) =>
  set((state) => {
    state.robots.get(id)!.status = data.status // MUTATION!
    return state
  })
```

- Use Zustand for client-side global state
- Keep WebSocket state separate from UI state
- NEVER store WebSocket connection in React state

### Dark Tactical Theme

```tsx
// ✅ CORRECT: Use Tailwind utility classes
<div className="card-tactical p-6">
  <h2 className="text-tactical-label">Status</h2>
  <span className="status-indicator status-online" />
</div>

// ✅ CORRECT: Use predefined component classes
<button className="btn-primary">Start Patrol</button>
<button className="btn-danger">Emergency Stop</button>

// ❌ WRONG: Hardcoded colors
<div style={{ backgroundColor: '#1a1f23' }}>
```

**Theme Color Reference:**

- Background: `tactical-950` (darkest), `tactical-900`, `tactical-800`
- Accent: `accent-primary` (cyan), `accent-secondary` (green), `accent-warning`, `accent-danger`
- Status: `status-online`, `status-offline`, `status-warning`, `status-idle`, `status-patrol`, `status-alert`

### TypeScript

```typescript
// ✅ CORRECT: Use unknown + type guards
function handleMessage(data: unknown): RobotStateMessage | null {
  const result = RobotStateMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

// ✅ CORRECT: Export types from shared-types
export type { RobotEntity, RobotStatus } from '@workspace/shared-types'

// ❌ WRONG: Using 'any'
function handleMessage(data: any): RobotStateMessage {
  return data as RobotStateMessage
}
```

- NO `any` types (use `unknown` and type guards)
- Use Zod for runtime validation + type inference
- Prefer interfaces for object shapes, types for unions/intersections

### Python ROS 2 Bridge

```python
# ✅ CORRECT: Async/await for all I/O
async def send_robot_state(self, state: RobotStateData) -> None:
    await self.ws_client.send(state.model_dump(by_alias=True))

# ✅ CORRECT: Type hints + Pydantic validation
class RobotStateData(BaseModel):
    robot_id: str = Field(alias="robotId")
    position: RobotPosition
    battery: float = Field(ge=0, le=100)

# ❌ WRONG: Missing type hints
def send_robot_state(self, state):
    self.ws_client.send(state)
```

- Use async/await for all I/O operations
- Type hints required for all functions
- Use Pydantic for data validation
- Follow PEP 8 style guide
- Black formatting (line-length: 100)

---

## Workspace Commands

```bash
# Development
pnpm dev              # Run all apps in parallel
pnpm dev:web          # Run web client only (port 3000)
pnpm dev:ws           # Run WebSocket server only (port 8080)

# Building
pnpm build            # Build all apps
pnpm build:web        # Build web client
pnpm build:ws         # Build WebSocket server

# Testing
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm test:e2e         # E2E tests (Playwright)

# Code Quality
pnpm lint             # Lint all workspaces
pnpm format           # Format all files (Prettier)
pnpm type-check       # TypeScript type checking

# Docker
pnpm docker:up        # Run all services in Docker
pnpm docker:dev       # Run with development overrides
```

---

## Monorepo Best Practices

### Adding Dependencies

```bash
# Root workspace dependency
pnpm add -w <package>

# Specific app dependency
pnpm --filter web-client add <package>
pnpm --filter websocket-server add <package>

# Workspace dependency (internal package)
pnpm --filter websocket-server add @workspace/shared-types
```

### Creating New Packages

1. Create directory in `packages/`
2. Add `package.json` with `name` starting with `@workspace/`
3. Run `pnpm install` to link workspaces

### Shared Types Usage

```typescript
// web-client or websocket-server
import { RobotStateMessage, CommandMessage, parseWebSocketMessage } from '@workspace/shared-types'
```

---

## File Structure Rules

### Size Limits

- Components: 200-400 lines (800 max)
- Utilities: Extract to separate files at 100 lines
- Pages: Extract sections to components at 300 lines

### Directory Organization

```
apps/web-client/
├── app/                 # Next.js App Router pages
│   ├── api/            # API routes
│   ├── dashboard/      # Dashboard route group
│   └── layout.tsx
├── components/
│   ├── ui/             # Reusable UI components
│   ├── dashboard/      # Dashboard-specific components
│   └── map/            # React Flow map components
├── lib/
│   ├── stores/         # Zustand stores
│   ├── hooks/          # Custom React hooks
│   └── utils/          # Utility functions
└── styles/
    └── theme.css       # CSS variables
```

---

## Security Checklist

Before ANY commit:

- [ ] Validate ALL WebSocket messages with Zod
- [ ] Sanitize robot commands before sending to ROS
- [ ] Implement rate limiting on WebSocket server
- [ ] Use environment variables for sensitive config
- [ ] Never expose internal ROS topics directly to web client
- [ ] Implement authentication for WebSocket connections
- [ ] No hardcoded secrets (check `.env.example` files)

---

## Performance Guidelines

### WebSocket Optimization

- Debounce rapid robot state updates (100-200ms)
- Batch WebSocket messages when possible
- Use binary protocols (MessagePack) for large data

### React Optimization

- Use `React.memo` for expensive dashboard components
- Implement virtual scrolling for large robot lists
- Use Web Workers for heavy computations
- Lazy load heavy components (React Flow)

```typescript
// ✅ CORRECT: Lazy loading React Flow
const RobotMap = dynamic(() => import('@/components/map/RobotMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})
```

---

## Testing Strategy

### Test Types Required

1. **Unit tests**: Functions, hooks, utilities (80%+ coverage)
2. **Integration tests**: WebSocket message flow, API routes
3. **E2E tests**: Critical dashboard flows (robot connection, command sending)

### TDD Workflow

1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Refactor (IMPROVE)
5. Verify coverage

---

## Error Handling

### WebSocket Disconnection

```typescript
// Auto-reconnect with exponential backoff
const reconnect = async (attempt = 1) => {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
  await sleep(delay)
  try {
    await connect()
  } catch {
    reconnect(attempt + 1)
  }
}
```

### ROS Communication Errors

- Log error + notify user
- Don't crash the bridge
- Attempt reconnection

### Form Validation

- Show inline errors with clear messages
- Use Zod schemas for validation

---

## Environment Variables

### Required Variables

**web-client:**

```
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

**websocket-server:**

```
PORT=8080
WS_CORS_ORIGIN=http://localhost:3000
```

**ros-bridge:**

```
WS_SERVER_URL=ws://localhost:8080
ROS_DOMAIN_ID=0
```

---

## Git Workflow

### Commit Message Format

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

### Branch Naming

- `feature/add-robot-map`
- `fix/websocket-reconnection`
- `refactor/extract-store`

---

## Quick Reference

| Task              | Command                         |
| ----------------- | ------------------------------- |
| Start development | `pnpm dev`                      |
| Build production  | `pnpm build`                    |
| Run tests         | `pnpm test`                     |
| Type check        | `pnpm type-check`               |
| Format code       | `pnpm format`                   |
| Add dependency    | `pnpm --filter <app> add <pkg>` |
| Docker start      | `pnpm docker:up`                |

---

## Active Backlog

### PHASE 1: NVIDIA Cosmos Integration — AI-Powered Robot Reasoning

**Priority:** HIGH
**Goal:** Zintegrować NVIDIA Cosmos Reason z Dashboard — operator pyta robota "co widzisz?" a Cosmos analizuje kamery z fizycznym rozumieniem świata.

#### TASK E: Cosmos Reason Docker Service [INFRA]

**Branch:** `feature/cosmos-integration`
**Scope:**

1. Dodaj `docker/docker-compose.cosmos.yml` z vLLM + Cosmos Reason 2B
2. Konfiguracja: `HF_TOKEN` env var, GPU passthrough, model cache volume
3. Health check endpoint
4. `.env.example` z wymaganymi zmiennymi
5. README sekcja: jak uruchomić Cosmos
   **Acceptance:** `docker compose -f docker/docker-compose.cosmos.yml up` → model ładuje się, API odpowiada na `curl localhost:8000/v1/models`

#### TASK F: WebSocket Server — Cosmos Proxy Endpoint [BACKEND]

**Branch:** `feature/cosmos-ws-proxy`
**Base:** Po merge TASK E
**Scope:**

1. Nowy endpoint w websocket-server: obsługa wiadomości `cosmos:reason`
2. Przyjmuje: frame (base64 JPEG) + prompt (text)
3. Wysyła do Cosmos Reason API (OpenAI-compatible format z image)
4. Zwraca response (z chain-of-thought reasoning)
5. Konfiguracja: `COSMOS_API_URL` env var (default: `http://cosmos-reason:8000`)
6. Error handling: timeout, model not ready, GPU OOM
7. Rate limiting: max 1 request/s per client
   **Acceptance:** WebSocket client wysyła frame + "co widzisz?" → dostaje reasoning response

#### TASK G: AI Chat Module — Cosmos Integration [FRONTEND]

**Branch:** `feature/cosmos-chat-ui`
**Base:** Po merge TASK F
**Scope:**

1. Update `AiChatModule.tsx` — nowy provider "Cosmos Reason" w ustawieniach
2. Update `vision-llm-store.ts` — obsługa Cosmos response format (thinking + answer)
3. UI: wyświetlanie chain-of-thought reasoning (collapsible `<think>` sekcja)
4. Przycisk "📷 Capture & Ask" — pobiera frame z aktywnej kamery + wysyła z promptem
5. Wskaźnik statusu: Cosmos connected/disconnected/loading
6. Fallback: jeśli Cosmos niedostępny → graceful error message
   **Acceptance:** Operator otwiera AI Chat → wybiera Cosmos → pyta "co widzisz?" → dostaje odpowiedź z reasoning

#### TASK H: Cosmos Planning Mode [FRONTEND+BACKEND]

**Branch:** `feature/cosmos-planning`
**Base:** Po merge TASK G
**Scope:**

1. Nowy tryb w AI Chat: "🎯 Mission Planner"
2. Operator opisuje cel ("jedź do pokoju B")
3. Cosmos Reason generuje plan kroków z reasoning
4. UI: plan wyświetlany jako lista kroków z checkboxami
5. Integracja z Controls Module: przycisk "Execute Step" (wysyła cmd_vel)
6. Opcjonalnie: wizualizacja planowanej trasy na Map2D
   **Acceptance:** Operator wpisuje cel → Cosmos generuje plan → kroki widoczne w UI

### Wymagania infrastrukturalne

- AWS instance z GPU (min 24GB VRAM dla modelu 2B)
- `nvidia-container-toolkit` zainstalowany
- HuggingFace token (darmowy)
- Docker + Docker Compose

### Kolejność: E → F → G → H (sekwencyjne, każdy task = PR)

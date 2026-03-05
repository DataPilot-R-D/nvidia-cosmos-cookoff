# CLAUDE.md — Dashboard Robotics

> Instrukcje dla Claude Code / Codex / AI agentów pracujących w tym repo.

## Projekt

**Dashboard Robotics** — real-time web dashboard do monitorowania i sterowania robotami przez ROS 2.

**Monorepo (Turborepo + pnpm workspaces):**

- `apps/web-client` — Next.js 14 frontend (React, TypeScript, Tailwind CSS)
- `apps/websocket-server` — Bun WebSocket server (TypeScript, MessagePack)
- `packages/shared` — Shared types, utils, protocol definitions

**Stack:**

- Runtime: Bun (websocket-server), Node.js (Next.js)
- Language: TypeScript (strict mode)
- Package manager: pnpm 9+
- Monorepo: Turborepo
- Frontend: Next.js 14 App Router, React 18, Tailwind CSS, shadcn/ui
- Protocol: MessagePack (binary) over WebSocket
- Robot integration: ROS 2 via roslibjs/rosbridge

## Komendy

```bash
# Install dependencies
pnpm install

# Build all
pnpm build

# Dev mode (all apps)
pnpm dev

# --- Testing ---
pnpm test              # Run all tests
pnpm test --filter web-client   # Only frontend tests
pnpm test --filter websocket-server  # Only backend tests

# --- Linting ---
pnpm lint              # ESLint across all packages
pnpm lint --fix        # Auto-fix

# --- Type checking ---
pnpm typecheck         # tsc --noEmit across all packages

# --- Single app dev ---
cd apps/web-client && pnpm dev          # Frontend on :3000
cd apps/websocket-server && bun run dev # WS server on :8081

# --- Format ---
pnpm format            # Prettier
pnpm format --check    # Check only
```

## Konwencje

### Git

- **Branch naming:** `<type>/<short-description>` (e.g., `feat/joint-visualization`, `fix/ws-reconnect`)
- **Base branch:** `feature/msgpack-integration` (NOT main)
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- **PR title:** Same as conventional commit

### Code Style

- **TypeScript strict** — no `any` unless absolutely necessary
- **Imports:** Use path aliases (`@/components/...`, `@shared/types/...`)
- **Components:** Functional components, named exports, co-located tests
- **Files:** kebab-case for files, PascalCase for components
- **CSS:** Tailwind utility classes, no custom CSS unless required
- **State management:** React hooks + context, no external state library
- **Error handling:** Always handle WebSocket disconnects gracefully

### MessagePack Protocol

- All WebSocket communication uses MessagePack binary encoding
- Type definitions in `packages/shared/src/protocol/`
- **NEVER** use JSON.stringify/parse for WebSocket messages

### Testing

- **Frontend:** Vitest + React Testing Library
- **Backend:** Bun test runner
- **Shared:** Vitest
- Write tests for: new components, utility functions, protocol handlers
- Minimum: happy path + one error case

## Ograniczenia

- **NIE modyfikuj** `package.json` w root bez wyraźnej instrukcji
- **NIE dodawaj** nowych dependencies bez uzasadnienia w PR description
- **NIE zmieniaj** konfiguracji Tailwind/TypeScript bez konsultacji
- **NIE commituj** `.env` plików, sekretów, hardcoded IP/portów
- **Port config:** Używaj zmiennych środowiskowych (`WS_PORT`, `NEXT_PORT`)
- **ROSBridge URL:** Zawsze konfigurowalny, nigdy hardcoded

## Architektura (key files)

```
apps/web-client/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   ├── ui/           # shadcn/ui base components
│   │   ├── dashboard/    # Dashboard-specific
│   │   └── visualization/# Robot visualization
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities
│   └── providers/        # Context providers (WebSocket, ROS)

apps/websocket-server/
├── src/
│   ├── index.ts          # Entry point, Bun.serve()
│   ├── handlers/         # Message handlers by topic
│   ├── ros/              # ROS bridge connection
│   └── protocol/         # MessagePack encode/decode

packages/shared/
├── src/
│   ├── types/            # Shared TypeScript types
│   ├── protocol/         # Message type definitions
│   └── utils/            # Shared utilities
```

## Dla agentów AI

1. **Zawsze** czytaj powiązany issue przed rozpoczęciem pracy
2. **Zawsze** twórz branch z `feature/msgpack-integration` (nie z main)
3. **Zawsze** uruchom `pnpm lint && pnpm typecheck && pnpm test` przed commitem
4. **W PR description** linkuj issue (`Closes #XX`) i opisz decyzje
5. Jeśli coś jest niejasne — dodaj komentarz na issue z pytaniem, NIE zgaduj
6. Dla zmian UI — dodaj screenshot/recording do PR

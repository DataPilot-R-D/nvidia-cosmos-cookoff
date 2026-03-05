# Local Development Guide (tinybox)

## Prerequisites

- Node >= 22, pnpm >= 10
- Docker Engine + Compose plugin
- Access to tinybox via SSH tunnel

## Quick Start (Docker)

### Dev mode (hot-reload)

```bash
cd /srv/robot-dashboard/repo
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up --build
```

Endpoints:

- Web Client: http://127.0.0.1:3000
- WebSocket Server: http://127.0.0.1:8080

### Production build

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Quick Start (native, no Docker)

```bash
cd /srv/robot-dashboard/repo
pnpm install
pnpm dev          # all apps in parallel
pnpm dev:web      # web-client only
pnpm dev:ws       # websocket-server only
```

## Testing

```bash
pnpm test          # all tests
pnpm test:unit     # unit tests only
pnpm test:e2e      # Playwright E2E (web-client)
pnpm lint          # linting
pnpm type-check    # TypeScript type checking
pnpm format:check  # Prettier check
```

## Workspace Layout

```
/srv/robot-dashboard/
  repo/          # git repo (this directory)
  artifacts/     # build outputs, test reports
  fixtures/      # test fixtures, mock data
  perf/          # performance benchmarks
  cache/         # build cache, node_modules cache
```

## Monorepo Structure

```
apps/
  web-client/          # Next.js dashboard
  websocket-server/    # Node.js WS server
  ros-bridge/          # Python ROS 2 bridge
packages/
  shared-types/        # TypeScript types
  flatbuffers-schema/  # FlatBuffers definitions
  typescript-config/   # Shared tsconfig
  wasm-processing/     # WASM processing module
```

## Environment & Secrets

- NEVER put secrets in Docker images or git
- Use .env files (gitignored) or env vars
- For CI: use GitHub Actions secrets
- Template: copy .env.example to .env and fill values

## SSH Tunnel (access from laptop)

```bash
ssh -L 3000:127.0.0.1:3000 -L 8080:127.0.0.1:8080 tinybox
```

Then open http://127.0.0.1:3000 in your browser.

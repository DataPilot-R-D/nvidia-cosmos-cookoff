# Additional: Command & Control Dashboard

## What It Does

Real-time web-based command center for monitoring and controlling the security robot system. Central hub for Human-Over-The-Loop operation.

## Stack

- Frontend: Next.js 14 + React 18 + Tailwind CSS
- Backend: Bun WebSocket Server + MessagePack binary protocol
- ROS Bridge: rosbridge_suite (JSON/WebSocket on :9090)
- Database: SQLite (maps, audit logs, evidence)

## Key Features

### Monitoring
- Live video feeds from robot cameras (WebRTC + fallback JPEG)
- Real-time 2D map with robot position + navigation goals
- LiDAR point cloud visualization (50K+ points)
- Machine stats (CPU/RAM/Disk)
- ROS topic inspector with message counts

### Control
- Joystick control (keyboard + touch)
- Click-to-navigate (publish Nav2 goals)
- Task approval / cancel / pause / resume
- Autonomous exploration mode (frontier detection)

### AI Integration
- "Capture & Ask" - send frame to Cosmos for analysis
- Vision LLM module for natural language queries
- Real-time Cosmos scene descriptions overlaid on feeds

### Alerts & Audit
- Alert timeline with severity levels
- Risk assessment display from Cosmos reasoning
- Evidence bundle system (capture + annotate)
- Full audit logging of all operator actions

## Human-Over-The-Loop in Dashboard

The dashboard embodies the HOTL philosophy:
- System runs autonomously (alerts appear, robots dispatch)
- Operator sees everything (timeline, map, feeds, reasoning)
- Operator CAN intervene (approve, cancel, pause, modify)
- Operator doesn't HAVE TO intervene (auto-approve for low severity)

## Data Flow

```
ROS 2 topics (30+)
  -> rosbridge (:9090)
  -> WebSocket server (:8080, MessagePack)
  -> Web client (:3000, React)
  -> Operator sees & decides
  -> Commands flow back: client -> WS -> rosbridge -> ROS 2
```

## Key Files

- `modules/dashboard/apps/web-client/` - Next.js frontend
- `modules/dashboard/apps/websocket-server/` - Bun backend
- `modules/dashboard/packages/shared-types/` - Zod schemas

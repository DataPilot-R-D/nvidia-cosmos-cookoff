# Architektura systemu - Security Robot Command Center

> Stan na: luty 2026 | Branch: `feature/msgpack-integration`

---

## 1. Diagram ogolny systemu

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INFRASTRUKTURA FIZYCZNA                            │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐    │
│  │  Unitree Go2  │     │  Kamery IP   │     │  Sensory (LiDAR, IMU)   │    │
│  │  (robot)      │     │  (RTSP)      │     │  PointCloud2, LaserScan │    │
│  └──────┬───────┘     └──────┬───────┘     └────────────┬─────────────┘    │
│         │                    │                           │                   │
│         └────────────┬───────┴───────────────────────────┘                   │
│                      ▼                                                       │
│           ┌─────────────────────┐                                           │
│           │    ROS 2 Humble     │  (DDS middleware)                          │
│           │    /cmd_vel         │                                           │
│           │    /odom            │                                           │
│           │    /scan            │                                           │
│           │    /camera/image    │                                           │
│           │    /map             │                                           │
│           │    /tf              │                                           │
│           └─────────┬──────────┘                                           │
│                     │ rosbridge v2.0 (JSON/WS)                              │
│                     ▼                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                      │
                      │  WebSocket (ws://ec2:9090)
                      │  rosbridge protocol v2.0
                      ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BUN WEBSOCKET SERVER (:8080)                         │
│                     apps/websocket-server/src/                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         index.ts (568 LOC)                          │   │
│  │  Bun.serve() + @socket.io/bun-engine + socket.io-msgpack-parser    │   │
│  │                                                                     │   │
│  │  HTTP Routes:                                                       │   │
│  │    GET /health          → status, uptime, rosbridge state           │   │
│  │    GET /api/maps        → lista zapisanych map (SQLite)             │   │
│  │    POST /api/maps/save  → zapis mapy do SQLite                      │   │
│  │    POST /api/rosbridge  → zmiana URL rosbridge w runtime            │   │
│  └─────────────┬───────────────────────────────────────┬───────────────┘   │
│                │                                       │                    │
│  ┌─────────────▼─────────────┐   ┌─────────────────────▼───────────────┐   │
│  │    HANDLERS (5 modulow)   │   │       SERVICES (3 moduly)           │   │
│  │                           │   │                                     │   │
│  │  rosbridge/client.ts      │   │  exploration-service.ts (579 LOC)   │   │
│  │    (1938 LOC)             │   │    Autonom. eksploracja frontier     │   │
│  │    30+ subskrypcji ROS    │   │    State machine: IDLE→EXPLORING    │   │
│  │    VoxelGrid filter       │   │    →NAVIGATING→COMPLETE             │   │
│  │    Sharp JPEG compress    │   │                                     │   │
│  │    Camera discovery       │   │  go2rtc-client.ts (407 LOC)         │   │
│  │                           │   │    REST client do go2rtc            │   │
│  │  webrtc.ts (500 LOC)     │   │    WebRTC SDP exchange              │   │
│  │    go2rtc mode + legacy   │   │    Stream management                │   │
│  │    SDP/ICE forwarding     │   │                                     │   │
│  │                           │   │  map-manager.ts (846 LOC)           │   │
│  │  camera.ts                │   │    MapServer/SLAM lifecycle         │   │
│  │    Registry + subscribe   │   │    SQLite persistence               │   │
│  │                           │   │    map_server ↔ SLAM switching      │   │
│  │  vision-llm.ts           │   │                                     │   │
│  │    OpenAI Vision API      │   └─────────────────────────────────────┘   │
│  │    Frame → description    │                                             │
│  │                           │   ┌─────────────────────────────────────┐   │
│  │  machine-stats.ts        │   │       UTILS (4 moduly)               │   │
│  │    CPU/RAM/Disk (si)      │   │                                     │   │
│  └───────────────────────────┘   │  BufferPool.ts (91 LOC)             │   │
│                                  │    10 x 5MB pre-alloc buffers       │   │
│                                  │    acquire/release pattern           │   │
│                                  │                                     │   │
│                                  │  message-throttler.ts (265 LOC)     │   │
│                                  │    Rate limiting per channel         │   │
│                                  │    100ms min interval                │   │
│                                  │                                     │   │
│                                  │  frontier-detection.ts (445 LOC)    │   │
│                                  │    DBSCAN clustering                 │   │
│                                  │    Frontier scoring algorithm        │   │
│                                  │                                     │   │
│                                  │  cleanup-manager.ts                  │   │
│                                  │    Graceful shutdown + resource      │   │
│                                  │    cleanup                           │   │
│                                  └─────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STORAGE: SQLite (bun:sqlite) → map-storage.ts                      │   │
│  │    Tabela: saved_maps (id, name, data BLOB, metadata JSON, date)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   │  Socket.IO (MessagePack parser)
                                   │  Binary frames + JSON events
                                   │  ws://server:8080
                                   ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                       NEXT.JS 14 WEB CLIENT (:3000)                         │
│                      apps/web-client/                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    use-websocket.ts (1300 LOC)                       │   │
│  │  Central hub: 35+ Socket.IO event listeners                         │   │
│  │  Zod validation na kazdym przychodzacym uzyciu                      │   │
│  │  Dispatch do 12+ Zustand stores                                     │   │
│  └─────────────┬───────────────────────────────────────────────────────┘   │
│                │                                                            │
│  ┌─────────────▼─────────────────────────────────────────────────────┐     │
│  │                    ZUSTAND STORES (17 plikow)                      │     │
│  │                                                                    │     │
│  │  Dane robota:           Sensory:              UI:                  │     │
│  │  ├─ robot-store         ├─ lidar-store        ├─ dashboard-store   │     │
│  │  ├─ command-store       ├─ costmap-store      ├─ tab-store         │     │
│  │  └─ path-store          ├─ imu-store          └─ panel-routing     │     │
│  │                         └─ map-store                               │     │
│  │  Media:                 Monitoring:                                │     │
│  │  ├─ camera-store        ├─ machine-stats      Rozne:              │     │
│  │  ├─ video-frame-store   └─ topic-store        ├─ websocket-store  │     │
│  │  └─ vision-llm-store                          └─ exploration      │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                │                                                            │
│  ┌─────────────▼─────────────────────────────────────────────────────┐     │
│  │                    WARSTWA PREZENTACJI                              │     │
│  │                                                                    │     │
│  │  app/page.tsx (300 LOC) → DashboardGrid → Tabs + Drag & Drop     │     │
│  │                                                                    │     │
│  │  Widgety (components/widgets/):                                    │     │
│  │  ┌──────────────────┬───────────────────┬──────────────────────┐  │     │
│  │  │ OccupancyGrid    │ CameraModule      │ RobotStatusModule   │  │     │
│  │  │ (Canvas + LUT)   │ (WebRTC/binary)   │ (battery, status)   │  │     │
│  │  ├──────────────────┼───────────────────┼──────────────────────┤  │     │
│  │  │ LidarModule      │ ControlsModule    │ AiChatModule        │  │     │
│  │  │ (Canvas 50K+pts) │ (Joystick+Nav2)   │ (Vision LLM)        │  │     │
│  │  ├──────────────────┼───────────────────┼──────────────────────┤  │     │
│  │  │ Map3dModule      │ ImuModule         │ MachineUsageModule  │  │     │
│  │  │ (Three.js)       │ (3-axis viz)      │ (CPU/RAM/Disk)      │  │     │
│  │  ├──────────────────┼───────────────────┼──────────────────────┤  │     │
│  │  │ TopicListWidget  │ InteractiveJoystick│ map2d/ (React Flow)│  │     │
│  │  │ (ROS topics)     │ (touch + keyboard) │ (2D nawigacja)     │  │     │
│  │  └──────────────────┴───────────────────┴──────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                        SHARED TYPES PACKAGE                                 │
│                    packages/shared-types/src/                                │
│                                                                             │
│  Zod schemas (runtime validation) + TypeScript types (compile-time)         │
│                                                                             │
│  base.ts        → bazowe typy (Position, Orientation, Quaternion)           │
│  robot.ts       → RobotStateMessage, RobotEntity, RobotStatus              │
│  camera.ts      → CameraDiscovered, CameraLost, CameraSubscribe            │
│  video.ts       → VideoFramePayload (binary + metadata)                    │
│  lidar.ts       → LaserScan, PointCloud2                                   │
│  maps.ts        → OccupancyGrid, MapMetadata                               │
│  websocket.ts   → ConnectionState, CommandMessage                          │
│  vision-llm.ts  → VisionAnalysisRequest/Response                           │
│  machine-stats.ts → CPU, RAM, Disk, Network metrics                        │
│  dashboard.ts   → TabConfig, PanelLayout                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Przeplywy danych

### 2.1 Glowny przepyw: Dane sensoryczne (Robot → Dashboard)

```
Unitree Go2                    AWS EC2                        Przegladarka
─────────────────────────────────────────────────────────────────────────────

  LiDAR scan ──► /scan ──────► rosbridge_server ──► WebSocket ──┐
  (LaserScan)    (ROS topic)   (port 9090)          (JSON)      │
                                                                 │
                                                                 ▼
                                                    Bun Server (index.ts)
                                                    rosbridge/client.ts
                                                         │
                                                    ┌────┴────┐
                                                    │ Przetwa-│
                                                    │ rzanie: │
                                                    │         │
                                                    │ LaserScan:
                                                    │  polar→  │
                                                    │  kartez. │
                                                    │         │
                                                    │ PointCloud2:
                                                    │  VoxelGrid│
                                                    │  filter  │
                                                    │  (redukc.│
                                                    │   50K→5K)│
                                                    └────┬────┘
                                                         │
                                                    Socket.IO emit
                                                    'lidar_scan' event
                                                    (binary/MessagePack)
                                                         │
                                                         ▼
                                                    use-websocket.ts
                                                    Zod validation
                                                         │
                                                         ▼
                                                    useLidarStore
                                                    (Zustand)
                                                         │
                                                         ▼
                                                    LidarModule.tsx
                                                    Canvas 2D API
                                                    (50K+ pts @60fps)
```

**Kluczowe optymalizacje w tym przeplywie:**

- **VoxelGrid filter** na serwerze redukuje 50K punktow do ~5K (90% redukcja)
- **MessagePack** zamiast JSON zmniejsza payload o 30-40%
- **Canvas 2D** zamiast DOM elementow (1200x mniej node'ow w drzewie)
- **BufferPool** eliminuje alokacje GC w hot loop

---

### 2.2 Przepyw video: Kamera → Dashboard

```
SCIEZKA A: WebRTC (preferowana, ~50ms latency)
═══════════════════════════════════════════════

  Kamera Go2                 go2rtc                    Przegladarka
  (ROS Image) ──► RTSP ──► (port 1984) ──► WebRTC ──► <video> element
                  stream    FFmpeg pipeline   SDP/ICE   (hardware decode)
                            H.264 encode      exchange
                                  ▲               │
                                  │               │
                            Bun Server            │
                            webrtc.ts             │
                            go2rtc-client.ts      │
                            (SDP relay)  ◄────────┘


SCIEZKA B: Binary fallback (~150-200ms latency)
═══════════════════════════════════════════════

  Kamera Go2               rosbridge           Bun Server
  (ROS Image) ──► /camera/ ──► WS ──► rosbridge/client.ts
  (sensor_msgs/   image_raw   JSON     │
   Image)                              ▼
                                 Sharp library
                                 Raw RGB → JPEG
                                 (quality: 75)
                                       │
                                       ▼
                                 BufferPool.acquire()
                                 Socket.IO emit
                                 'video_frame' (binary Buffer)
                                       │
                                       ▼
                                 use-websocket.ts
                                       │
                                       ▼
                                 useVideoFrameStore
                                       │
                                       ▼
                                 CameraModule.tsx
                                 Blob + URL.createObjectURL()
                                 <img src={blobUrl} />
```

**Roznica miedzy sciezkami:**

- **WebRTC (A)**: go2rtc serwer przetwarza RTSP → H.264 → WebRTC. Przegladarka dekoduje sprzetowo. Latencja ~50ms. Wymaga konfiguracji go2rtc.yaml + FFmpeg.
- **Binary fallback (B)**: Raw image z ROS → Sharp kompresja do JPEG → binary Buffer przez Socket.IO. Latencja ~150-200ms. Dziala od razu bez dodatkowej infrastruktury.

---

### 2.3 Przepyw nawigacji: Dashboard → Robot

```
  Uzytkownik klika     Przegladarka           Bun Server         Robot
  na mape 2D
────────────────────────────────────────────────────────────────────────

  Klik na punkt    ──► map2d/ component
  docelowy              React Flow
                        │
                        ▼
                  useCommandStore
                  { type: 'navigate',
                    goal: {x, y, theta} }
                        │
                        ▼
                  socket.emit('command', msg)
                  (Zod validated)
                        │
                        ▼
                  ──────────────────►  index.ts
                                      socket.on('command')
                                           │
                                           ▼
                                      rosbridge/client.ts
                                      publish to /navigate_to_pose
                                      (geometry_msgs/PoseStamped)
                                           │
                                           ▼
                                      rosbridge_server
                                      WS → ROS 2 DDS
                                           │
                                           ▼
                                      ──────────────► Nav2 Stack
                                                      (robot)
                                                      BT Navigator
                                                      Path Planner
                                                      Controller
                                                           │
                                      /plan (Path)  ◄─────┘
                                      /cmd_vel      ◄─────┘
                                           │
                                           ▼
                                      rosbridge → Bun Server
                                      'path_plan' event
                                      'robot_state' event (odom)
                                           │
                                      ◄────┘
                        │
                        ▼
                  usePathStore (planowana trasa)
                  useRobotStore (aktualna pozycja)
                        │
                        ▼
                  OccupancyGridModule
                  Canvas overlay: path + robot marker
```

---

### 2.4 Przepyw joystick/teleoperacja: Dashboard → Robot

```
  Uzytkownik         Przegladarka           Bun Server         Robot
─────────────────────────────────────────────────────────────────────

  Ruch joysticka ──► InteractiveJoystick.tsx
  (touch/WASD)       │
                     ▼
               Throttle 100ms
               (requestAnimationFrame)
                     │
                     ▼
               socket.emit('command', {
                 type: 'velocity',
                 linear: { x, y, z },
                 angular: { x, y, z }
               })
                     │
                     ▼
               ──────────────────────►  rosbridge/client.ts
                                        publish to /cmd_vel
                                        (geometry_msgs/Twist)
                                             │
                                             ▼
                                        rosbridge → ROS 2
                                             │
                                             ▼
                                        ──────────► Unitree Go2
                                                    Motor controller
                                                    Ruch robota
```

---

### 2.5 Przepyw AI Vision: Analiza klatki kamery

```
  Uzytkownik         Przegladarka           Bun Server          OpenAI
─────────────────────────────────────────────────────────────────────

  "Co widzisz?"  ──► AiChatModule.tsx
  (prompt)            │
                      ▼
                socket.emit('vision_llm_request', {
                  prompt: "Co widzisz?",
                  camera_topic: "/camera/image"
                })
                      │
                      ▼
                ──────────────────────►  vision-llm.ts
                                         │
                                         ▼
                                    Pobierz ostatnia
                                    klatke z kamery
                                    (Buffer JPEG)
                                         │
                                         ▼
                                    OpenAI Vision API
                                    gpt-4o-mini
                                    (image + prompt)
                                         │
                                    ──────────────► OpenAI ─────►
                                                                 │
                                    ◄────────────── response ◄───┘
                                         │
                                         ▼
                                    socket.emit(
                                      'vision_llm_response',
                                      { text: "Widze korytarz..." }
                                    )
                      │
                      ▼
                useVisionLlmStore
                      │
                      ▼
                AiChatModule.tsx
                Wyswietl odpowiedz
```

---

### 2.6 Przepyw mapy: Budowanie i wyswietlanie

```
  Robot (SLAM)        rosbridge          Bun Server           Przegladarka
─────────────────────────────────────────────────────────────────────────

  slam_toolbox     ──► /map ─────────► rosbridge/client.ts
  (OccupancyGrid)     (nav_msgs/       │
                       OccupancyGrid)   ▼
                                   map-manager.ts
                                   Lifecycle control:
                                   - MapServer mode (zaladuj)
                                   - SLAM mode (buduj)
                                        │
                                   Throttle (message-throttler)
                                   1 update / 500ms
                                        │
                                        ▼
                                   socket.emit('map_update', {
                                     width, height,
                                     resolution,
                                     origin: {x,y},
                                     data: Int8Array
                                   })
                                        │
                      ◄─────────────────┘
                      │
                      ▼
                useMapStore / useCostmapStore
                      │
                      ▼
                OccupancyGridModule.tsx
                ┌─────────────────────────┐
                │  Canvas rendering:       │
                │  1. Color LUT (pre-comp) │
                │  2. putImageData (bulk)  │
                │  3. Offscreen cache      │
                │  4. Transform on zoom    │
                └─────────────────────────┘


  Zapis mapy:

  Uzytkownik ──► "Zapisz mape" ──► POST /api/maps/save
                                        │
                                        ▼
                                   map-storage.ts
                                   SQLite (bun:sqlite)
                                   INSERT saved_maps
                                   (BLOB + metadata)
```

---

### 2.7 Przepyw autonomicznej eksploracji

```
  Uzytkownik         Przegladarka           Bun Server           Robot
─────────────────────────────────────────────────────────────────────

  "Start            socket.emit(
   Exploration" ──► 'start_exploration')
                         │
                         ▼
                   ──────────────────►  exploration-service.ts
                                        State Machine:
                                        │
                                    ┌───▼────────────────┐
                                    │  IDLE               │
                                    │  ↓ start()          │
                                    │  EXPLORING          │◄──────────┐
                                    │  ↓ findFrontiers()  │           │
                                    │                     │           │
                                    │  frontier-detection │           │
                                    │  DBSCAN clustering  │           │
                                    │  Score & rank       │           │
                                    │  ↓ best frontier    │           │
                                    │                     │           │
                                    │  NAVIGATING         │           │
                                    │  ↓ publish goal     │──► Nav2   │
                                    │    /navigate_to_pose│   stack   │
                                    │                     │           │
                                    │  Wait for result    │           │
                                    │  ↓ arrived          │           │
                                    │                     │───────────┘
                                    │  COMPLETE           │
                                    │  (no more frontiers)│
                                    └─────────────────────┘
                                        │
                                    emits 'exploration_status'
                                    {state, frontiers[], progress}
                         │
                         ▼
                   useExplorationStore
                         │
                         ▼
                   OccupancyGridModule
                   Rysuj frontiery na mapie
```

---

## 3. Warstwy technologiczne

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WARSTWA PREZENTACJI                           │
│                                                                     │
│  Next.js 14 (App Router) + React 18 + TailwindCSS                  │
│  ├─ React Flow (mapa 2D, nawigacja click-to-navigate)               │
│  ├─ Three.js (mapa 3D, LiDAR point cloud)                          │
│  ├─ Canvas 2D API (OccupancyGrid, sciezki, LiDAR 2D)              │
│  ├─ react-grid-layout (drag & drop dashboard panels)               │
│  └─ nipplejs (wirtualny joystick dotykowy)                          │
├─────────────────────────────────────────────────────────────────────┤
│                        WARSTWA STANU                                │
│                                                                     │
│  Zustand (17 stores)                                                │
│  ├─ Immutable updates (spread operator)                             │
│  ├─ Selektywne subskrypcje (re-render tylko zmienione dane)         │
│  └─ Rozdzielenie: dane robota / sensory / media / UI               │
├─────────────────────────────────────────────────────────────────────┤
│                    WARSTWA KOMUNIKACJI (frontend)                    │
│                                                                     │
│  use-websocket.ts (centralny hub)                                   │
│  ├─ Socket.IO client (auto-reconnect, exp. backoff)                 │
│  ├─ Zod validation (kazdy event walidowany schema)                  │
│  ├─ Binary transport (video frames jako Buffer/ArrayBuffer)         │
│  └─ MessagePack parser (30-40% mniejszy payload vs JSON)            │
├─────────────────────────────────────────────────────────────────────┤
│                    WARSTWA KOMUNIKACJI (backend)                     │
│                                                                     │
│  Socket.IO Server (@socket.io/bun-engine)                           │
│  ├─ MessagePack serialization (socket.io-msgpack-parser)            │
│  ├─ Binary frames (Buffer objects direct emit)                      │
│  ├─ Message throttling (rate limit per channel)                     │
│  └─ CORS configuration                                              │
├─────────────────────────────────────────────────────────────────────┤
│                     WARSTWA PRZETWARZANIA                            │
│                                                                     │
│  Bun Runtime (V8 JIT)                                               │
│  ├─ Sharp (Raw RGB → JPEG compression)                              │
│  ├─ VoxelGrid filter (PointCloud2 downsampling)                     │
│  ├─ BufferPool (10 x 5MB pre-allocated)                             │
│  ├─ Frontier detection (DBSCAN + scoring)                           │
│  ├─ Exploration service (autonomous state machine)                  │
│  └─ Map manager (SLAM ↔ MapServer lifecycle)                        │
├─────────────────────────────────────────────────────────────────────┤
│                     WARSTWA PERSYSTENCJI                             │
│                                                                     │
│  SQLite (bun:sqlite) - embedded, zero-config                        │
│  └─ saved_maps (BLOB + metadata JSON)                               │
├─────────────────────────────────────────────────────────────────────┤
│                     WARSTWA ROBOTYCZNA                               │
│                                                                     │
│  rosbridge_server v2.0 (JSON over WebSocket)                        │
│  ├─ ROS 2 Humble (DDS middleware)                                   │
│  ├─ Nav2 (nawigacja autonomiczna, BT, path planning)                │
│  ├─ slam_toolbox (SLAM, budowanie mapy)                             │
│  ├─ map_server (ladowanie zapisanych map)                           │
│  └─ Unitree Go2 SDK (hardware driver)                               │
├─────────────────────────────────────────────────────────────────────┤
│                     WARSTWA VIDEO                                    │
│                                                                     │
│  go2rtc (WebRTC media server)                                       │
│  ├─ RTSP input (kamera robota)                                      │
│  ├─ FFmpeg transcoding (H.264)                                      │
│  ├─ WebRTC output (SDP/ICE, ~50ms latency)                          │
│  └─ REST API (stream management)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Protokoly i formaty danych

```
Robot ◄────► ROS 2 DDS        : CDR (Common Data Representation)
ROS 2 ◄────► rosbridge        : JSON over WebSocket (rosbridge v2.0)
rosbridge ◄─► Bun Server      : WebSocket (ws://, JSON messages)
Bun Server ◄─► Next.js Client : Socket.IO (MessagePack binary)
go2rtc ◄────► Browser         : WebRTC (H.264, DTLS-SRTP)
Bun Server ──► Browser (video): Socket.IO binary (JPEG Buffer)
Browser ────► Bun Server (cmd): Socket.IO JSON (Zod validated)
Bun Server ──► OpenAI         : HTTPS REST (Vision API)
Bun Server ◄─► SQLite         : bun:sqlite (native binding)
```

### Porownanie protokolow transportu

```
┌──────────────────┬────────────────┬───────────────┬──────────────────┐
│ Protokol         │ Uzycie         │ Latencja      │ Format           │
├──────────────────┼────────────────┼───────────────┼──────────────────┤
│ WebRTC           │ Video stream   │ ~50ms         │ H.264 (hardware) │
│ Socket.IO binary │ Video fallback │ ~150-200ms    │ JPEG Buffer      │
│ Socket.IO MsgPack│ Sensor data    │ ~30-80ms      │ MessagePack      │
│ Socket.IO JSON   │ Commands       │ ~20-50ms      │ JSON             │
│ rosbridge WS     │ ROS ↔ Server   │ ~10-30ms      │ JSON             │
│ HTTP REST        │ Maps, health   │ ~50-200ms     │ JSON             │
│ OpenAI API       │ Vision LLM     │ ~2-5s         │ JSON (HTTPS)     │
└──────────────────┴────────────────┴───────────────┴──────────────────┘
```

---

## 5. Mapa komponentow frontend

```
app/page.tsx (Server Component)
│
├─► DashboardGrid.tsx (Client Component)
│   ├─► react-grid-layout (drag & drop panels)
│   ├─► Tab management (tab-store)
│   └─► Panel routing (panel-routing-store)
│
├─► ModuleRegistry.tsx
│   Mapuje nazwy modulow → komponenty React:
│
│   ┌─────────────────────────────────────────────────────────────┐
│   │  'occupancy-grid'  → OccupancyGridModule                   │
│   │  'camera'          → CameraModule                          │
│   │  'robot-status'    → RobotStatusModule                     │
│   │  'lidar'           → LidarModule                           │
│   │  'controls'        → ControlsModule                        │
│   │  'ai-chat'         → AiChatModule                          │
│   │  'map-3d'          → Map3dModule                           │
│   │  'imu'             → ImuModule                             │
│   │  'machine-usage'   → MachineUsageModule                    │
│   │  'topic-list'      → TopicListWidget                       │
│   │  'joystick'        → InteractiveJoystick                   │
│   │  'map-2d'          → map2d/ (React Flow)                   │
│   └─────────────────────────────────────────────────────────────┘
│
└─► DashboardWindowFrame.tsx (okno z tytulem, resize, close)
    └─► WidgetWrapper.tsx (error boundary + lazy loading)
```

---

## 6. Deployment topology (produkcja)

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│       AWS EC2 Instance       │     │     Klient (przegladarka)    │
│      (GPU - Isaac Sim)       │     │                              │
│                              │     │    Next.js 14 Dashboard      │
│  ┌────────────────────────┐  │     │    (static export lub SSR)   │
│  │  Unitree Go2 (sim)     │  │     │                              │
│  │  ROS 2 Humble          │  │     │    ┌────────────────────┐   │
│  │  Nav2 + SLAM           │  │     │    │  Socket.IO client  │   │
│  │  rosbridge_server:9090 │  │     │    │  WebRTC peer       │   │
│  └───────────┬────────────┘  │     │    └─────────┬──────────┘   │
│              │               │     │              │               │
│  ┌───────────▼────────────┐  │     └──────────────┼───────────────┘
│  │  Bun WS Server:8080   │  │                    │
│  │  Socket.IO + MsgPack   │◄─┼────────────────────┘
│  │  rosbridge client      │  │     WebSocket (wss://)
│  │  SQLite (maps)         │  │     + WebRTC (DTLS-SRTP)
│  └───────────┬────────────┘  │
│              │               │
│  ┌───────────▼────────────┐  │
│  │  go2rtc:1984           │  │
│  │  RTSP → WebRTC         │  │
│  │  FFmpeg H.264          │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  Isaac Sim (headless)  │  │
│  │  GPU rendering         │  │
│  │  Physics simulation    │  │
│  └────────────────────────┘  │
└──────────────────────────────┘

         ┌───────────────┐
         │   OpenAI API  │  (Vision LLM)
         │   gpt-4o-mini │
         └───────────────┘
```

---

## 7. Kluczowe decyzje architektoniczne

| Decyzja            | Wybor                               | Dlaczego                                               |
| ------------------ | ----------------------------------- | ------------------------------------------------------ |
| Runtime backend    | **Bun**                             | Natywny SQLite, szybki startup, kompatybilny z Node.js |
| Transport          | **Socket.IO + MessagePack**         | Binary frames, auto-reconnect, fallback polling        |
| State management   | **Zustand**                         | Lekki (~1KB), immutable, selektywne subskrypcje        |
| Video pipeline     | **go2rtc WebRTC** + fallback binary | Hardware decode H.264, ~50ms latency                   |
| 3D rendering       | **Three.js**                        | Mature, React Three Fiber, GPU point clouds            |
| 2D mapa/LiDAR      | **Canvas 2D API**                   | putImageData + LUT = 25-50x szybciej niz DOM           |
| Walidacja          | **Zod**                             | Runtime + compile-time, shared miedzy frontend/backend |
| ROS bridge         | **rosbridge v2.0**                  | Standard, JSON/WS, dziala z kazdym ROS 2               |
| Persistent storage | **SQLite (bun:sqlite)**             | Zero-config, embedded, wystarczajacy dla map           |
| Styling            | **TailwindCSS**                     | Dark tactical theme, utility-first, responsive         |
| Monorepo           | **pnpm workspaces**                 | Szybki, disk-efficient, native workspace support       |

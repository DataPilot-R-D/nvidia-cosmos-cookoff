# Security Robot Command Center - Pelny Research Rynkowy i Analiza Konkurencji

**Data:** 2026-02-02
**Wersja:** 3.0 (rozszerzona o dimensionalOS deep-dive, Rerun.io, Formant, InOrbit)
**Przeznaczenie:** Handover strategiczny - pozycjonowanie produktu i analiza mozliwosci

---

## Executive Summary

Rynek narzedzi do wizualizacji i zarzadzania robotami dzieli sie na 4 kategorie:

| Kategoria                       | Gracze                                                          | Nasz positioning                                           |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| **Enterprise SaaS**             | Foxglove ($18-90/user/mo), Formant (custom), InOrbit (freemium) | Alternatywa self-hosted, zero licencji                     |
| **Open Source Frameworks**      | Open-RMF, RViz2                                                 | Nowoczesniejszy stack, web-native                          |
| **SDK/Narzedzia deweloperskie** | Rerun.io, dimensionalOS                                         | Inny focus - oni SDK, my dashboard                         |
| **Nasza nisza**                 | Security Robot Command Center                                   | Jedyny security-focused, self-hosted, web-native dashboard |

**Kluczowy wniosek:** Zaden z konkurentow nie oferuje specjalizowanego dashboardu security z web-native UX, self-hosted deployment i agresywnymi optymalizacjami wydajnosci (Bun, MessagePack, Canvas rendering). To jest nasza unikalna przewaga.

---

## 1. Foxglove Studio

### 1.1 Profil

| Pole               | Wartosc                                     |
| ------------------ | ------------------------------------------- |
| **URL**            | https://foxglove.dev                        |
| **Rok zalozenia**  | 2021 (fork Webviz/Cruise)                   |
| **Finansowanie**   | $18.6M (Amplify Partners, Eclipse Ventures) |
| **Model**          | SaaS + Desktop (Electron)                   |
| **Pozycjonowanie** | "The observability stack for Physical AI"   |
| **Open source**    | Discontinued (Foxglove 2.0, marzec 2024)    |

### 1.2 Architektura

```
┌─────────────────────────────────────────────────────────────┐
│                    FOXGLOVE ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐     ┌──────────────────┐               │
│  │  Foxglove Agent  │────▶│  Foxglove Cloud  │               │
│  │  (Robot edge)    │     │  (SaaS backend)  │               │
│  │  - Data offload  │     │  - PostgreSQL    │               │
│  │  - Selective sync│     │  - Kubernetes    │               │
│  └──────────────────┘     │  - AWS infra     │               │
│                           └────────┬─────────┘               │
│                                    │                          │
│                           ┌────────▼─────────┐               │
│                           │  Foxglove Studio │               │
│                           │  (TypeScript)    │               │
│                           │  - Electron app  │               │
│                           │  - Web app       │               │
│                           │  - 20+ panels    │               │
│                           │  - WebGL viz     │               │
│                           │  - MCAP format   │               │
│                           └──────────────────┘               │
│                                                               │
│  Supported formats: MCAP, ROS bags, Protobuf, FlatBuffers    │
│  Protocols: Foxglove WebSocket, ROS 1/2, MCAP files          │
│  Tech: TypeScript, React, Rust (backend), C++ (agent)        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Tech Stack

| Warstwa  | Technologia                          |
| -------- | ------------------------------------ |
| Frontend | TypeScript, React, WebGL             |
| Desktop  | Electron                             |
| Backend  | Rust, Python, PostgreSQL             |
| Infra    | Kubernetes, AWS, Terraform           |
| Formaty  | MCAP (wlasny), Protobuf, FlatBuffers |
| Agent    | C++ (edge data offload)              |

### 1.4 Cennik

| Plan       | Cena         | Zawiera                    |
| ---------- | ------------ | -------------------------- |
| Free       | $0           | 3 users, 10GB storage      |
| Starter    | $18/user/mo  | Core observability         |
| Team       | $42/user/mo  | SSO/SAML, shared layouts   |
| Enterprise | $90+/user/mo | Custom SLA, on-prem option |

### 1.5 Kluczowe cechy

- 20+ wbudowanych paneli wizualizacyjnych
- MCAP - wlasny format nagrywania danych
- Foxglove Agent - edge data offload
- Layout history z wersjonowaniem
- Team collaboration (shared layouts, SSO)
- SOC 2 Type II certyfikacja
- Integracja z ROS 1/2

### 1.6 Slabosci Foxglove

- **Discontinued open source** - community fork (tier4/foxglove-studio) ale brak oficjalnego wsparcia
- **Electron overhead** - ~500MB RAM, ~2s startup
- **Vendor lock-in** - MCAP format, cloud storage
- **Generic design** - brak domain-specific UX
- **Brak real-time control** - focus na observability, nie command & control
- **Kosztowne skalowanie** - 10 userow Team = $420/mo = $5,040/rok

### 1.7 Nasze przewagi nad Foxglove

| Aspekt               | My                                            | Foxglove          |
| -------------------- | --------------------------------------------- | ----------------- |
| Koszt (10 users/rok) | ~$600 hosting                                 | $5,040 licencje   |
| Startup time         | ~300ms (Bun)                                  | ~2s (Electron)    |
| Memory footprint     | ~50MB (server)                                | ~500MB (Electron) |
| Command & control    | Joystick, Nav2 goals, Emergency Stop          | Brak              |
| Security UX          | Specjalizacja (patrol, alerts, dark tactical) | Generic           |
| Data control         | Pelna (self-hosted)                           | SaaS lock-in      |
| Binary transport     | MessagePack (30-40% mniejsze)                 | Standard          |
| Open source          | Tak                                           | Discontinued      |

---

## 2. Rerun.io

### 2.1 Profil

| Pole               | Wartosc                                        |
| ------------------ | ---------------------------------------------- |
| **URL**            | https://rerun.io                               |
| **GitHub**         | https://github.com/rerun-io/rerun (19k+ stars) |
| **Rok zalozenia**  | 2022                                           |
| **Model**          | Open-core (SDK free, Data Platform commercial) |
| **Pozycjonowanie** | "Multimodal data stack for Physical AI"        |
| **Jezyk core**     | Rust                                           |

### 2.2 Architektura

```
┌─────────────────────────────────────────────────────────────┐
│                     RERUN ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  SDK Layer (Multi-language)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  Python   │  │   Rust   │  │   C++    │                   │
│  │  SDK      │  │   SDK    │  │   SDK    │                   │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘                   │
│        │             │             │                          │
│        └─────────────┼─────────────┘                          │
│                      ▼                                        │
│  ┌────────────────────────────────────────┐                  │
│  │        Rust Core Engine                │                  │
│  │  - Columnar chunk-based storage       │                  │
│  │  - Entity Component System (ECS)      │                  │
│  │  - Time-aware queries                 │                  │
│  │  - Arrow-based data model             │                  │
│  └────────────────────┬───────────────────┘                  │
│                       ▼                                       │
│  ┌────────────────────────────────────────┐                  │
│  │        Visualization Layer             │                  │
│  │  - Native desktop (egui/wgpu)         │                  │
│  │  - Web viewer (WASM)                  │                  │
│  │  - 3D scenes, images, plots, text     │                  │
│  │  - Blueprints (programmable layouts)  │                  │
│  └────────────────────────────────────────┘                  │
│                                                               │
│  Data: Images, tensors, point clouds, meshes, text, scalars  │
│  Query: Pandas, Polars, DuckDB integration                   │
│  ROS: MCAP + reflection-based ROS2 support                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Tech Stack

| Warstwa   | Technologia                  |
| --------- | ---------------------------- |
| Core      | Rust (caly viewer + storage) |
| SDKs      | Python, Rust, C++            |
| Rendering | wgpu (WebGPU/Vulkan/Metal)   |
| Storage   | Columnar (Arrow-based)       |
| Web       | WASM (Rust → browser)        |
| Desktop   | egui (native Rust UI)        |

### 2.4 Cennik

| Plan            | Cena                                  |
| --------------- | ------------------------------------- |
| Open Source SDK | $0 (MIT/Apache 2.0)                   |
| Data Platform   | Commercial (nie ogloszony publicznie) |

### 2.5 Kluczowe cechy

- **Rust-native** - ekstremalnie wydajny viewer
- **Multi-language SDK** - Python, Rust, C++ (brak TypeScript/JS!)
- **Time-aware** - synchronizacja danych po timeline
- **Blueprints** - programowalne layouty
- **Data querying** - Pandas/Polars/DuckDB integration
- **ROS 2 MCAP** - reflection-based support
- **Adopters** - Hugging Face LeRobot, Meta Project Aria, Ultra Robotics

### 2.6 Slabosci Rerun

- **Brak web-native dashboard** - viewer jest WASM, ale to tool deweloperski, nie dashboard operacyjny
- **Brak command & control** - czysto wizualizacja/analiza
- **Brak fleet management** - single-robot focus
- **Brak JavaScript/TypeScript SDK** - nie mozna latwo integrowac z React/Next.js
- **Brak real-time streaming** - optymalizowany pod nagrania, nie live
- **Alpha maturity** - ciagle breaking changes

### 2.7 Nasze przewagi nad Rerun

| Aspekt            | My                             | Rerun                       |
| ----------------- | ------------------------------ | --------------------------- |
| Przeznaczenie     | Dashboard operacyjny           | Narzedzie deweloperskie     |
| Real-time         | <100ms latency                 | Optymalizowane pod nagrania |
| Command & control | Joystick, Nav2, Emergency Stop | Brak                        |
| Fleet view        | Multi-robot                    | Single-robot                |
| Web-native        | Next.js (pure web)             | WASM viewer (ograniczone)   |
| TypeScript        | End-to-end                     | Brak SDK                    |
| Deployment        | Docker, self-hosted            | Local only                  |
| Security UX       | Specjalizacja                  | Brak                        |

### 2.8 Co warto zaadaptowac z Rerun

- **Blueprints** - programowalne layouty dashboardu (mamy juz React Grid Layout)
- **Time-aware queries** - replay nagranych sesji (future feature)
- **Data export** - Pandas/Polars integration dla analizy historycznej

---

## 3. dimensionalOS (dimos)

### 3.1 Profil

| Pole               | Wartosc                                                 |
| ------------------ | ------------------------------------------------------- |
| **GitHub**         | https://github.com/dimensionalOS                        |
| **Glowne repo**    | `dimos` (51 stars, 7 forks, 188 open issues)            |
| **Wersja**         | v0.0.9 (alpha pre-release, styczen 2026)                |
| **Jezyk**          | Python (100%)                                           |
| **Licencja**       | Niestandardowa (NOASSERTION)                            |
| **Pozycjonowanie** | "The Agentive Operating System for Generalist Robotics" |
| **Zalozyciel**     | S. Pomichter (MIT)                                      |
| **Finansowanie**   | YC SAFE (early stage)                                   |

### 3.2 Repozytoria (19 repow)

| Repo                 | Stars | Jezyk  | Relevancja                            |
| -------------------- | ----- | ------ | ------------------------------------- |
| `dimos`              | 51    | Python | Glowny framework                      |
| `PCT_planner`        | 10    | -      | 3D nawigacja (Point Cloud Tomography) |
| `dimos_utils`        | 2     | Python | Narzedzia pomocnicze                  |
| `go2_ros2_sdk`       | 1     | Python | Unitree Go2 ROS2 SDK                  |
| `python_lcm_msgs`    | 1     | Python | LCM message definitions               |
| `rosettadrone`       | 1     | -      | DJI MAVLink + H.264                   |
| `go2_webrtc_connect` | 0     | Python | WebRTC driver (Go2)                   |
| `dimos-lcm`          | 0     | C++    | LCM transport                         |
| `lcm`                | 0     | Java   | LCM library fork                      |
| `Genesis`            | 0     | Python | Physics simulator                     |
| Pozostale (9)        | 0     | rozne  | ML/AI models, forki                   |

### 3.3 Architektura dimos

```
┌─────────────────────────────────────────────────────────────┐
│                    DIMOS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  CLI Layer                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  dimos --simulation run unitree-go2                   │    │
│  │  dimos --viewer-backend rerun-web run unitree-go2     │    │
│  │  humancli (agent text commands)                       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Core Layer (Python)                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │  Modules     │  │  Blueprints  │  │  Transport      │     │
│  │  In[T]/Out[T]│  │  autoconnect │  │  LCM, DDS, SHM  │     │
│  │  @rpc        │  │  compose     │  │  ROS 2           │     │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘     │
│         │                │                    │               │
│  ┌──────▼──────────────────────────────────────▼──────────┐  │
│  │                   Domain Modules                        │  │
│  ├────────────────┬────────────────┬──────────────────────┤  │
│  │ navigation/    │ manipulation/  │ perception/           │  │
│  │ - SLAM         │ - OMPL/IK     │ - Detection           │  │
│  │ - A*           │ - GraspNet    │ - Re-ID               │  │
│  │ - Frontier     │ - VLA         │ - Tracking             │  │
│  │ - Visual servo │ - Servo ctrl  │ - Depth estimation     │  │
│  ├────────────────┼────────────────┼──────────────────────┤  │
│  │ models/        │ agents/        │ mapping/              │  │
│  │ - Depth        │ - Skills       │ - OccupancyGrid       │  │
│  │ - Segmentation │ - LLM agents  │ - Point clouds         │  │
│  │ - Qwen VL     │ - MCP (exp.)  │ - Google Maps          │  │
│  │ - Embedding   │               │ - OSM                  │  │
│  └────────────────┴────────────────┴──────────────────────┘  │
│                                                               │
│  Robot Integrations                                           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Unitree Go2/G1 | DJI Mavic | AGIBOT | xArm | Piper │    │
│  │  + WebRTC driver (Go2) | MuJoCo simulation           │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Visualization                                                │
│  ┌────────────────────┐  ┌────────────────────────────────┐  │
│  │ Rerun (required!)  │  │ Foxglove extension (React/Vite)│  │
│  │ - 3D scenes        │  │ - Leaflet/D3.js costmap        │  │
│  │ - Time sync        │  │ - Socket.IO                    │  │
│  └────────────────────┘  └────────────────────────────────┘  │
│                                                               │
│  Web Interfaces                                               │
│  ┌────────────────────┐  ┌────────────────────────────────┐  │
│  │ dimos_interface     │  │ flask/fastapi server           │  │
│  │ Svelte + Tailwind  │  │ Robot control API              │  │
│  │ Vite               │  │ http://localhost:7779           │  │
│  └────────────────────┘  └────────────────────────────────┘  │
│                                                               │
│  Dependencies:                                                │
│  numpy, scipy, reactivex (RxPY), dask, pydantic, opencv,    │
│  open3d, numba/llvmlite, rerun-sdk, structlog, typer/textual │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Tech Stack dimensionalOS

| Warstwa        | Technologia                                    | Uwagi                    |
| -------------- | ---------------------------------------------- | ------------------------ |
| **Core**       | Python 3.10+                                   | Caly framework           |
| **Transport**  | LCM, DDS, SHM, ROS 2                           | Multi-transport          |
| **Reactive**   | RxPY (reactivex)                               | Stream processing        |
| **Validation** | Pydantic                                       | Data models              |
| **Compute**    | Dask, Numba/LLVM                               | Distributed + JIT        |
| **3D**         | Open3D, MuJoCo                                 | Point clouds, simulation |
| **Image**      | OpenCV, PyTurboJPEG                            | Fast JPEG encoding       |
| **AI/ML**      | Qwen VL, EdgeTAM, Depth models                 | Vision-Language          |
| **Viz**        | **Rerun** (WYMAGANY)                           | 3D viewer                |
| **Web 1**      | Foxglove extension (React + Vite + D3/Leaflet) | Costmap panel            |
| **Web 2**      | Svelte + Tailwind (dimos_interface)            | Robot control            |
| **Web 3**      | Flask/FastAPI                                  | Backend API              |
| **CLI**        | Typer + Textual                                | Terminal UI              |
| **Robots**     | Unitree Go2/G1, DJI, AGIBOT, xArm              | Multi-platform           |

### 3.5 Unikalne cechy dimensionalOS

1. **Module System** - `In[T]`/`Out[T]` typed streams z `autoconnect()` blueprints
2. **Multi-transport** - LCM + DDS + SHM + ROS 2 w jednym framework
3. **AI Agents (experimental)** - LLM-driven robot control z fizycznymi narzędziami
4. **MCP (experimental)** - sterowanie robotem z Cursor/Claude Code
5. **Manipulation stack** - OMPL, IK, GraspNet (nieujawniony)
6. **Multi-embodiment** - quadrupeds, drones, humanoids, arms
7. **Simulation** - MuJoCo integration z WebRTC bridge

### 3.6 Slabosci dimensionalOS

| Problem                           | Impact    | Szczegoly                                                                        |
| --------------------------------- | --------- | -------------------------------------------------------------------------------- |
| **Alpha quality**                 | Krytyczny | v0.0.9, 188 open issues, "expect breaking changes"                               |
| **Rerun dependency**              | Wysoki    | "There is NO WAY to use dimos without rerun rn" (ich komentarz w pyproject.toml) |
| **Fragmentacja web**              | Wysoki    | 3 rozne web interfaces (Svelte, React/Foxglove, Flask)                           |
| **Brak produkcyjnego dashboardu** | Wysoki    | Web UI to prototypy, nie production-grade                                        |
| **Python-only**                   | Sredni    | Brak TypeScript SDK, brak type-safe frontend                                     |
| **Ograniczona dokumentacja**      | Sredni    | README dobry, ale brak deep docs                                                 |
| **Male community**                | Sredni    | 51 stars, 7 forks, ~5 contributors                                               |
| **Licencja niejasna**             | Sredni    | NOASSERTION w GitHub                                                             |
| **Brak deployment story**         | Wysoki    | Brak Docker production setup                                                     |
| **Single-platform focus**         | Niski     | Linux primary, macOS "experimental beta"                                         |

### 3.7 Szczegolowa analiza vs nasz dashboard

| Aspekt           | dimensionalOS                      | Nasz Dashboard                               |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| **Jezyk**        | Python                             | TypeScript (end-to-end)                      |
| **Maturity**     | Alpha (v0.0.9, breaking changes)   | Production-ready (30+ commits optymalizacji) |
| **Dashboard**    | 3 fragmenty (Svelte, React, Flask) | Jednolity Next.js 14                         |
| **Viz engine**   | Rerun (wymuszony)                  | React Flow + Three.js + Canvas (flexible)    |
| **State mgmt**   | RxPY streams                       | Zustand (18 stores, immutable)               |
| **Transport**    | LCM + DDS + SHM + ROS 2            | Socket.IO + MessagePack                      |
| **Validation**   | Pydantic (Python)                  | Zod (TypeScript, end-to-end)                 |
| **Video**        | WebRTC (Go2 driver)                | WebRTC (go2rtc) + binary fallback            |
| **Navigation**   | SLAM, A\*, Frontier, Visual servo  | Nav2 Actions, Frontier, SLAM                 |
| **AI**           | Agents, Qwen VL, MCP               | Vision LLM, AI Chat                          |
| **Manipulation** | OMPL, GraspNet (unreleased)        | Brak (nie w scope)                           |
| **Robots**       | Go2, G1, DJI, AGIBOT, xArm         | Go2 (primary), extensible                    |
| **Security UX**  | Brak                               | Specjalizacja (patrol, alerts, emergency)    |
| **Web UX**       | Prototypy                          | Production-grade (drag-drop, responsive)     |
| **Deployment**   | Local only + Docker experimental   | Docker + EC2 + self-hosted                   |
| **Tests**        | Unittest                           | Jest + Playwright + Vitest (80%+ target)     |
| **Performance**  | Brak benchmarkow                   | Data-driven (WASM vs V8, Canvas vs DOM)      |

### 3.8 Szanse i zagrozenia z dimensionalOS

#### Szanse (co mozemy wykorzystac)

1. **Module/Blueprint pattern** - ich `autoconnect()` i typed streams (`In[T]`/`Out[T]`) to elegancki wzorzec. Mozemy zaadaptowac dla naszego widget systemu
2. **MCP integration** - sterowanie robotem z IDE to innowacyjny koncept. Mozemy dodac MCP server
3. **Multi-transport** - ich LCM + SHM daje nizsza latencje niz ROS Bridge. Mozemy rozwazyc bezposrednie LCM
4. **AI Agents** - ich podejscie do agentow z fizycznymi narzędziami jest przyszlosciowe
5. **PCT_planner** - 3D nawigacja z point cloud tomography (10 stars) moze byc warta zbadania

#### Zagrozenia

1. **Jesli doroja** - moga stac sie konkurentem z bardziej kompletnym ekosystemem
2. **Community growth** - jesli zyskaja traction, ich ecosystem moze nas przerosnac
3. **AI-native approach** - ich agent-first architecture moze byc bardziej atrakcyjna dla AI-focused teams

#### Mitygacje

- dimensionalOS jest Python-only → nie zagrazaja nam w web/dashboard space
- Ich web UI to fragmenty prototypow → nasz dashboard jest 10x bardziej dojrzaly
- Ich licencja jest niejasna → ryzyko dla adopcji enterprise
- 188 open issues w alpha → stabilnosc to problem

---

## 4. Open-RMF

### 4.1 Profil

| Pole              | Wartosc                              |
| ----------------- | ------------------------------------ |
| **URL**           | https://www.open-rmf.org             |
| **GitHub**        | https://github.com/open-rmf          |
| **Organizacja**   | Open Source Robotics Alliance (OSRA) |
| **Rok powstania** | 2018 (szpitale w Singapurze)         |
| **Model**         | Open source (Apache 2.0)             |
| **Focus**         | Multi-vendor fleet interoperability  |

### 4.2 Architektura

```
┌─────────────────────────────────────────────────────────────┐
│                    OPEN-RMF ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  rmf-web (React)                                              │
│  ├── Dashboard (legacy React)                                 │
│  ├── MicroApps architecture                                   │
│  └── REST API + WebSocket                                     │
│                                                               │
│  Fleet Adapters                                               │
│  ├── free_fleet (generic adapter)                             │
│  ├── MiR adapter                                              │
│  ├── ABB adapter                                              │
│  └── Custom adapters                                          │
│                                                               │
│  Core Services                                                │
│  ├── rmf_traffic (traffic negotiation)                        │
│  ├── rmf_task (task allocation, scheduling)                   │
│  ├── rmf_fleet (fleet state management)                       │
│  └── rmf_building_map (lifts, doors, charging)                │
│                                                               │
│  Infrastructure Integration                                   │
│  ├── Lifts/elevators                                          │
│  ├── Doors/access control                                     │
│  ├── Charging stations                                        │
│  └── Fire alarm integration                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Nasze przewagi nad Open-RMF

| Aspekt          | My                    | Open-RMF                |
| --------------- | --------------------- | ----------------------- |
| Stack           | Next.js 14 (modern)   | Legacy React            |
| Complexity      | Srednia               | Wysoka (fleet adapters) |
| 3D viz          | Three.js point clouds | Brak                    |
| Video streaming | WebRTC + fallback     | Brak                    |
| LiDAR           | 50k+ pts @60fps       | Brak                    |
| Deployment      | 5 min (Docker)        | 30+ min                 |
| Learning curve  | Niska                 | Wysoka                  |
| Security UX     | Specjalizacja         | Generic                 |

### 4.4 Przewagi Open-RMF nad nami

- **Traffic negotiation** - zaawansowane zarzadzanie ruchem miedzy flotami
- **Task allocation** - wbudowany scheduler zadan
- **Infrastructure integration** - windy, drzwi, ladowarki
- **Multi-vendor** - adaptery dla MiR, ABB, itp.
- **Dojrzalosc** - 6+ lat, deployments w szpitalach i na lotniskach

---

## 5. Formant.io

### 5.1 Profil

| Pole              | Wartosc                                        |
| ----------------- | ---------------------------------------------- |
| **URL**           | https://formant.io                             |
| **Rok zalozenia** | 2017                                           |
| **Finansowanie**  | $45M (BMW i Ventures, Ericsson, Intel Capital) |
| **Siedziba**      | Mill Valley, CA                                |
| **Pracownicy**    | ~35                                            |
| **Model**         | Enterprise SaaS (custom pricing)               |
| **Focus**         | Cloud robotics platform for enterprise         |

### 5.2 Kluczowe cechy

- **F3 Platform** - AI engine z voice commands i natural language interaction
- **Teleoperation** - secure remote control
- **Fleet Management** - heterogeneous robots
- **Workflows** - custom interfaces, event triggers
- **Integrations** - Slack, PagerDuty, Jira
- **AI Insights** - predykcyjne utrzymanie, root cause analysis
- **Enterprise** - SSO (Google, OIDC), audit logs, compliance

### 5.3 Architektura (estymowana)

```
┌─────────────────────────────────────────────────────────────┐
│                    FORMANT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Formant Agent (Robot edge)                                   │
│  ├── Data collection & streaming                              │
│  ├── Local diagnostics                                        │
│  └── Teleoperation relay                                      │
│                                                               │
│  Formant Cloud                                                │
│  ├── Fleet state aggregation                                  │
│  ├── AI/ML insights engine (F3)                               │
│  ├── Workflow automation                                      │
│  ├── Data storage & analytics                                 │
│  └── REST API + WebSocket                                     │
│                                                               │
│  Formant Web UI                                               │
│  ├── Fleet dashboard                                          │
│  ├── Teleoperation interface                                  │
│  ├── Mission control                                          │
│  ├── Custom modules (builder)                                 │
│  └── Performance analytics                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Nasze przewagi nad Formant

| Aspekt           | My                    | Formant                     |
| ---------------- | --------------------- | --------------------------- |
| Koszt            | $0 licencje           | Custom (enterprise pricing) |
| Data control     | Self-hosted           | SaaS (cloud)                |
| Open source      | Tak                   | Nie                         |
| Vendor lock-in   | Brak                  | Wysoki                      |
| ROS native       | ROS 2 Bridge          | Formant Agent               |
| Customization    | Full code access      | API/SDK limited             |
| 3D visualization | Three.js point clouds | Ograniczone                 |
| Security focus   | Specjalizacja         | Generic fleet               |

### 5.5 Przewagi Formant nad nami

- **Enterprise maturity** - $45M funding, enterprise deployments
- **AI/ML wbudowane** - F3 platform, predykcyjne utrzymanie
- **Integrations** - Slack, PagerDuty, Jira out-of-box
- **Teleoperation** - dedykowane, secure remote control
- **Compliance** - enterprise security, audit

---

## 6. InOrbit.AI

### 6.1 Profil

| Pole              | Wartosc                            |
| ----------------- | ---------------------------------- |
| **URL**           | https://www.inorbit.ai             |
| **Rok zalozenia** | ~2019                              |
| **Finansowanie**  | $10M Series A (wrzesien 2025)      |
| **Siedziba**      | Mountain View, CA                  |
| **Model**         | Freemium SaaS                      |
| **Focus**         | Robot orchestration for enterprise |

### 6.2 Cennik

| Plan              | Cena                   |
| ----------------- | ---------------------- |
| Free              | $0 (unlimited robots!) |
| Developer Edition | Custom                 |
| Premium Support   | $3,000/mo              |
| Enterprise        | Contact sales          |

### 6.3 Kluczowe cechy

- **Space Intelligence** - spatial computing + robot orchestration
- **Multi-vendor** - niezalezne od producenta robota
- **RTLS** - real-time location + forklifts, personnel
- **Adaptive Diagnostics** - inteligentna optymalizacja danych
- **Agentic AI** - autonomous decision-making (nowe)
- **Missions** - definiowanie, dispatching, analytics
- **Enterprise integration** - WMS, LMS, ERP

### 6.4 Nasze przewagi nad InOrbit

| Aspekt       | My                | InOrbit           |
| ------------ | ----------------- | ----------------- |
| Self-hosted  | Tak               | SaaS only         |
| Code access  | Full              | Brak              |
| Security UX  | Specjalizacja     | Generic warehouse |
| 3D viz       | Three.js + LiDAR  | Ograniczone       |
| Video        | WebRTC + fallback | Teleoperation     |
| Cost control | Pelna             | Vendor pricing    |
| ROS native   | Direct bridge     | Abstraction layer |

### 6.5 Przewagi InOrbit nad nami

- **Free tier z unlimited robots** - niski prog wejscia
- **RTLS integration** - sledzenie ludzi + robotow
- **Enterprise integrations** - WMS, ERP
- **Agentic AI** - nowa funkcja
- **$10M funding** - zasoby na rozwoj

---

## 7. RViz2

### 7.1 Profil

| Pole         | Wartosc                      |
| ------------ | ---------------------------- |
| **GitHub**   | https://github.com/ros2/rviz |
| **Jezyk**    | C++ / Qt                     |
| **Licencja** | BSD                          |
| **Platform** | Desktop only (Linux)         |
| **Status**   | Maintenance mode             |

### 7.2 Kluczowe ograniczenia

- **Desktop only** - wymaga X11, problemy z Wayland
- **Single robot** - brak fleet view
- **Remote access** - wymaga VNC/X11 forwarding
- **Stary UI** - Qt widgets z 2010s
- **Resource intensive** - OpenGL, nie dla Jetson
- **Encoded video** - wymaga dodatkowych decoder nodes
- **Brak command & control** - czysta wizualizacja

### 7.3 Nasze przewagi nad RViz2

| Aspekt      | My                            | RViz2                 |
| ----------- | ----------------------------- | --------------------- |
| Platform    | Web (any browser, any device) | Desktop (Linux + X11) |
| Remote      | Native (WebSocket)            | VNC required          |
| Multi-robot | Fleet view                    | Single robot          |
| Responsive  | Mobile/tablet                 | Desktop only          |
| Video       | WebRTC + binary               | Wymaga decoder node   |
| Modern UI   | React + Tailwind              | Qt widgets            |
| Deployment  | Docker, cloud                 | Per-workstation       |
| Wayland     | Native                        | Wymaga XCB workaround |

---

## 8. Macierz porownawcza

### 8.1 Feature Matrix (pelna)

| Feature           | Nasz       | Foxglove     | Rerun    | dimos    | Open-RMF | Formant | InOrbit   | RViz2  |
| ----------------- | ---------- | ------------ | -------- | -------- | -------- | ------- | --------- | ------ |
| Web-based         | ✅         | ✅           | ⚠️ WASM  | ⚠️ Frag. | ✅       | ✅      | ✅        | ❌     |
| Self-hosted       | ✅         | ❌ SaaS      | ✅       | ✅       | ✅       | ❌      | ❌        | ✅     |
| Real-time <100ms  | ✅         | ✅           | ⚠️       | ✅       | ✅       | ✅      | ✅        | ✅     |
| Multi-robot fleet | ✅         | ✅           | ❌       | ❌       | ✅✅     | ✅✅    | ✅✅      | ❌     |
| 3D Point Clouds   | ✅         | ✅           | ✅✅     | ✅       | ❌       | ⚠️      | ⚠️        | ✅     |
| 2D Map/Costmap    | ✅         | ✅           | ✅       | ✅       | ✅       | ⚠️      | ✅        | ✅     |
| Video WebRTC      | ✅         | ⚠️           | ❌       | ✅       | ❌       | ✅      | ✅        | ❌     |
| Command & control | ✅✅       | ❌           | ❌       | ✅       | ❌       | ✅      | ✅        | ❌     |
| Binary protocols  | ✅ MsgPack | ✅ MCAP      | ✅ Arrow | ✅ LCM   | ❌       | ❌      | ❌        | ❌     |
| Security UX       | ✅✅       | ❌           | ❌       | ❌       | ❌       | ❌      | ❌        | ❌     |
| AI/LLM            | ✅         | ❌           | ❌       | ✅✅     | ❌       | ✅✅    | ✅        | ❌     |
| Traffic mgmt      | ❌         | ❌           | ❌       | ❌       | ✅✅     | ❌      | ✅        | ❌     |
| Open source       | ✅         | ❌           | ✅       | ⚠️       | ✅       | ❌      | ❌        | ✅     |
| Modern stack      | ✅✅       | ✅           | ✅       | ⚠️       | ⚠️       | ✅      | ✅        | ❌     |
| **Koszt**         | **$0**     | **$18-90/u** | **$0**   | **$0**   | **$0**   | **$$$** | **Free+** | **$0** |

### 8.2 Architektura comparison

| Aspekt     | Nasz                | Foxglove          | Rerun               | dimos                  | Formant             |
| ---------- | ------------------- | ----------------- | ------------------- | ---------------------- | ------------------- |
| Frontend   | Next.js 14 (React)  | React (Electron)  | egui (Rust WASM)    | Svelte + React + Flask | Custom SaaS         |
| Backend    | Bun + Socket.IO     | Rust + PostgreSQL | Rust core           | Python + FastAPI       | Cloud (proprietary) |
| State      | Zustand (18 stores) | Redux-like        | ECS (Arrow)         | RxPY streams           | Cloud state         |
| Transport  | MessagePack         | MCAP/Protobuf     | Arrow IPC           | LCM/DDS/SHM            | Formant Agent       |
| Rendering  | Canvas + Three.js   | WebGL             | wgpu (WebGPU)       | Rerun (required)       | Custom              |
| Validation | Zod (end-to-end)    | Protobuf schemas  | Arrow schema        | Pydantic               | Proprietary         |
| Language   | TypeScript          | TypeScript + Rust | Rust + Python + C++ | Python                 | Unknown             |

### 8.3 Performance comparison

| Metryka     | Nasz                 | Foxglove          | Rerun           | RViz2       |
| ----------- | -------------------- | ----------------- | --------------- | ----------- |
| Startup     | ~300ms (Bun)         | ~2s (Electron)    | ~500ms (native) | ~1s (Qt)    |
| Memory      | ~50MB (server)       | ~500MB (Electron) | ~100MB (native) | ~200MB      |
| Payloads    | -30-40% (MsgPack)    | Standard          | -50% (Arrow)    | JSON        |
| Grid render | 1-2ms (putImageData) | ~10ms             | N/A             | GPU native  |
| Max points  | 100K (GPU-safe)      | Configurable      | Millions (Rust) | GPU-limited |

---

## 9. Pozycjonowanie rynkowe

### 9.1 Mapa rynku

```
                        ┌─────────────────────────────────────────┐
      Enterprise ──────►│                                         │
         SaaS           │  Formant ($45M)    InOrbit ($10M)      │
                        │     ●                   ●               │
                        │                                         │
                        │         Foxglove ($18.6M)               │
                        │              ●                          │
                        │                                         │
      Self-hosted ─────►│                  ┌────────────────┐     │
         Open           │                  │  NASZ DASHBOARD │     │
                        │                  │  Security-focus  │     │
                        │                  │  Web-native      │     │
                        │     Open-RMF ●   │  High-perf       │     │
                        │                  └────────────────┘     │
                        │                                         │
       SDK / Tool ─────►│  Rerun ●                dimos ●        │
                        │  (19K stars)           (51 stars)       │
                        │                                         │
       Legacy ─────────►│                         RViz2 ●        │
                        │                                         │
                        └─────────────────────────────────────────┘
                        Generic ──────────────► Specialized (Security)
```

### 9.2 SWOT Analysis

#### Strengths (Silne strony)

- Jedyny security-focused robot dashboard na rynku
- Modern tech stack (Next.js 14, Bun, TypeScript end-to-end)
- Agresywne, data-driven optymalizacje (5 faz, benchmarki)
- Self-hosted, zero licencji, zero vendor lock-in
- Web-native (any browser, any device, responsive)
- Production-ready code z refaktoryzacja i audytem

#### Weaknesses (Slabe strony)

- Male community (brak open-source release)
- Brak enterprise features (SSO, RBAC, audit logs)
- Single-vendor robot focus (Go2 primary)
- Brak traffic management
- Dług techniczny w kilku plikach (use-websocket.ts, rosbridge/client.ts)

#### Opportunities (Szanse)

- **Rynek robot security rosnie** - $882M do 2030 (CAGR 34%)
- **Foxglove discontinued open source** - rynek szuka alternatyw
- **AI/Agent trend** - MCP, LLM agents to gwiazda na horyzoncie
- **Mobile field operations** - zaden konkurent nie ma dobrego mobile UX
- **White-label** - OEM dla producentow robotow security

#### Threats (Zagrozenia)

- Formant/InOrbit dodaja security vertical
- dimensionalOS dorasta i buduje lepszy dashboard
- Rerun dodaje real-time + web dashboard
- Foxglove obnizy ceny lub otworzy zrodla ponownie

---

## 10. Rekomendacje strategiczne

### 10.1 Natychmiastowe dzialania (Q1 2026)

| #   | Dzialanie                            | Uzasadnienie                                                                      |
| --- | ------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | **Opublikowac jako open source**     | Foxglove zamknal zrodla → rynek szuka alternatyw. 19K stars Rerun pokazuje apetyt |
| 2   | **Dodac RBAC + SSO**                 | Warunek konieczny dla enterprise (Formant, InOrbit maja)                          |
| 3   | **Uruchomic go2rtc pipeline**        | Prawdziwe WebRTC daje 3x lepsza latencje video                                    |
| 4   | **Stworzyc demo video/landing page** | Zaden z konkurentow nie ma security-focused messaging                             |

### 10.2 Rozrozniacze do zbudowania (Q2-Q3 2026)

| #   | Feature                         | vs Konkurencja                                                   |
| --- | ------------------------------- | ---------------------------------------------------------------- |
| 1   | **AI Patrol Optimization**      | Brak w Foxglove/RViz2, dimos ma agents ale brak dashboardu       |
| 2   | **Mobile PWA**                  | Zaden konkurent nie ma dobrego mobile UX                         |
| 3   | **MCP Integration**             | dimos ma experimental, my mozemy byc pierwsi z production-grade  |
| 4   | **Alert + Incident Management** | Formant ma, ale nie security-focused                             |
| 5   | **Replay Mode**                 | Rerun robi to najlepiej - mozemy zaadaptowac dla security audytu |

### 10.3 Dlugoterminowa strategia (2026-2027)

| Scenariusz             | Strategia                                                    |
| ---------------------- | ------------------------------------------------------------ |
| **SaaS model**         | Oferowac hosted version (jak Foxglove Free → Starter → Team) |
| **OEM/White-label**    | Dashboard jako modul dla producentow robotow security        |
| **Plugin marketplace** | Otworzyc ekosystem (jak Foxglove extensions, ale lepiej)     |
| **Multi-vertical**     | Warehouse, healthcare (po ustabilizowaniu security vertical) |

---

## 11. Podsumowanie

### Co nas wyroznia (unikalna kombinacja)

1. **Security-focused UX** - jedyny na rynku
2. **Self-hosted + zero licencji** - vs Foxglove $5K+/rok, Formant $$, InOrbit $$
3. **Modern web-native** - vs RViz2 (desktop), dimos (fragmenty)
4. **Data-driven performance** - benchmarkowane WASM, Canvas, Binary transport
5. **Production-ready** - vs dimos (alpha), Rerun (SDK, nie dashboard)
6. **Command & control** - vs Foxglove (observability only), Rerun (viz only)

### Najwieksze zagrozenia

1. **Formant** - jesli dodadza security vertical ($45M funding)
2. **dimensionalOS** - jesli doroja (agent-first architecture jest przyszlosciowa)
3. **Rerun** - jesli dodadza real-time dashboard (19K stars community)

### Verdict

Security Robot Command Center zajmuje **unikalna nisze** na przecieciu:

- Web-native dashboard (vs desktop RViz2)
- Self-hosted (vs SaaS Foxglove/Formant/InOrbit)
- Security-specialized (vs generic dimos/Rerun/Open-RMF)
- Production-ready (vs alpha dimos, SDK Rerun)
- Command & control (vs observability-only Foxglove/Rerun)

Zaden z 7 analizowanych konkurentow nie oferuje tej kombinacji.

---

## Zrodla

### Foxglove

- [Foxglove Official](https://foxglove.dev)
- [Foxglove 2.0 Announcement](https://foxglove.dev/blog/foxglove-2-0-unifying-robotics-observability)
- [Foxglove Pricing](https://foxglove.dev/pricing)
- [Foxglove GitHub](https://github.com/foxglove/studio)
- [Foxglove 2.0 - ROS Discourse](https://discourse.openrobotics.org/t/foxglove-2-0-integrated-ui-new-pricing-and-open-source-changes/36583)

### Rerun.io

- [Rerun Official](https://rerun.io)
- [Rerun GitHub](https://github.com/rerun-io/rerun) (19K+ stars)
- [What is Rerun?](https://rerun.io/docs/overview/what-is-rerun)
- [Rerun Blueprints](https://rerun.io/docs/concepts/visualization/blueprints)
- [Rerun Deep Dive - Skywork AI](https://skywork.ai/skypage/en/Rerun.io-My-Deep-Dive-into-the-Go-To-Visualizer-for-Physical-AI/1975249775198138368)

### dimensionalOS

- [dimensionalOS GitHub](https://github.com/dimensionalOS)
- [dimos Repository](https://github.com/dimensionalOS/dimos) (51 stars, v0.0.9)
- [go2_webrtc_connect](https://github.com/dimensionalOS/go2_webrtc_connect)
- [PCT_planner](https://github.com/dimensionalOS/PCT_planner)

### Open-RMF

- [Open-RMF Official](https://www.open-rmf.org)
- [Open-RMF GitHub](https://github.com/open-rmf)
- [Deep Dive into OpenRMF - Ekumen](https://ekumenlabs.com/blog/posts/deep-dive-into-openrmf/)

### Formant

- [Formant Official](https://formant.io)
- [Formant Platform](https://formant.io/product/platform/)
- [Formant Workflows](https://formant.io/product/workflows/)

### InOrbit

- [InOrbit Official](https://www.inorbit.ai)
- [InOrbit Product](https://www.inorbit.ai/product)
- [InOrbit Pricing](https://developer.inorbit.ai/pricing-dev)
- [InOrbit $10M Series A](https://roboticsandautomationnews.com/2025/09/30/inorbit-ai-secures-10-million-series-a-funding-to-scale-robot-orchestration-platform/95063/)

### RViz2

- [RViz2 Documentation](https://docs.ros.org/en/humble/Tutorials/Intermediate/RViz/RViz-User-Guide/RViz-User-Guide.html)
- [RViz2 GitHub](https://github.com/ros2/rviz)

### Industry

- [Comparing RViz, Foxglove, Rerun - ReductStore](https://www.reduct.store/blog/comparison-rviz-foxglove-rerun)
- [Robot Fleet Management Software - Standard Bots](https://standardbots.com/blog/robot-fleet-management-software)
- [Software Tools for Robotics 2024 - Segments.ai](https://segments.ai/blog/software-tools-for-robotics-landscape/)

---

_Dokument wygenerowany: 2026-02-02_
_Wersja: 3.0_
_Zawiera: 7 konkurentow, deep-dive dimensionalOS, SWOT, rekomendacje strategiczne_

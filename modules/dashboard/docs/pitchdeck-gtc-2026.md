# Pitch Deck - NVIDIA GTC 2026

# Security Robot Command Center (SRCC)

**Wydarzenie:** NVIDIA GTC 2026 | 16-19 marca | San Jose, CA
**Produkt:** Security Robot Command Center (SRCC)
**Pozycjonowanie:** Brakujaca warstwa operacyjna w ekosystemie NVIDIA Isaac/OSMO

---

## Spis tresci

1. [Elevator Pitch](#1-elevator-pitch)
2. [Slajd 1: Tytulowy](#slajd-1-tytulowy)
3. [Slajd 2-3: Stack NVIDIA dzisiaj](#slajd-2-3-stack-nvidia-dzisiaj)
4. [Slajd 4: Luka - co po deploymencie?](#slajd-4-luka---co-po-deploymencie)
5. [Slajd 5: Foxglove Vacuum](#slajd-5-foxglove-vacuum)
6. [Slajd 6-7: Nasze rozwiazanie](#slajd-6-7-nasze-rozwiazanie)
7. [Slajd 8: Architektura](#slajd-8-architektura)
8. [Slajd 9-10: Moduly - Deep Dive](#slajd-9-10-moduly---deep-dive)
9. [Slajd 11: Benchmarki wydajnosci](#slajd-11-benchmarki-wydajnosci)
10. [Slajd 12-13: Integracja z NVIDIA OSMO](#slajd-12-13-integracja-z-nvidia-osmo)
11. [Slajd 14: Demo Scenario](#slajd-14-demo-scenario)
12. [Slajd 15: Matryca konkurencji](#slajd-15-matryca-konkurencji)
13. [Slajd 16: Model partnerstwa](#slajd-16-model-partnerstwa)
14. [Slajd 17: Roadmap integracji](#slajd-17-roadmap-integracji)
15. [Slajd 18: The Ask](#slajd-18-the-ask)
16. [GTC 2026 Action Plan](#gtc-2026-action-plan)
17. [Q&A Preparation](#qa-preparation)
18. [Visual Style Guide](#visual-style-guide)
19. [Kluczowe metryki do zapamietania](#kluczowe-metryki-do-zapamietania)

---

## 1. Elevator Pitch

### Wersja 10-sekundowa (badge scanning)

> "NVIDIA OSMO orkiestruje trening robotow. My orkiestrujemy operacje robotow. Razem: pelny cykl zycia - od symulacji do produkcji."

### Wersja 30-sekundowa

> "Kazdy robot wytrenowany w Isaac Sim trafia w koncu na produkcje. Kiedy to sie dzieje, operatorzy potrzebuja dashboardu do monitorowania, sterowania i zarzadzania flota. Foxglove zrezygnowal z open-source. RViz2 to desktop. NVIDIA nie ma webowej warstwy operacyjnej. My ja budujemy - self-hosted, security-focused, z natywna integracja Isaac i zerowym kosztem licencji."

### Wersja 3-minutowa

> "NVIDIA zbudowala najlepszy pipeline treningowy dla robotow na swiecie. Isaac Sim do symulacji, OSMO do orkiestracji workflowow treningowych, GR00T N1 jako foundation model, Isaac ROS do percepcji na GPU, Jetson Orin jako edge compute. To jest perfekcyjny stack od symulacji do deploymentu.
>
> Ale jest luka. Co sie dzieje PO deploymencie? Kiedy robot jezdzi po magazynie albo patroluje budynek? Kto monitoruje jego baterie, pozycje, kamerki? Kto wydaje komendy nawigacyjne? Kto widzi flote 10 robotow naraz w przegladarce?
>
> OSMO orkiestruje training pipelines - GPU scheduling, synthetic data generation, RL loops. To NIE jest narzedzie do real-time operacji.
>
> Foxglove byl odpowiedzia na wizualizacje, ale zrezygnowal z open-source w marcu 2024. Teraz to SaaS za $5000+ rocznie. RViz2 dziala tylko na desktopie i obsluguje jednego robota.
>
> My zbudowalismy Security Robot Command Center - webowy, self-hosted dashboard z 10+ modulami: mapy 2D z nawigacja click-to-move, LiDAR 3D z 50 tysiacami punktow przy 60fps, streaming video WebRTC, autonomiczna eksploracja z frontier detection w Rust WASM, AI vision do analizy zagrozen.
>
> Architektura jest data-driven: MessagePack zamiast JSON (30-40% mniejsze payloady), Canvas putImageData zamiast fillRect (25-50x szybszy render siatek), Bun runtime z 300ms cold start. Kazdy benchmark jest zmierzony, nie zadeklarowany.
>
> Integracja z NVIDIA jest natywna - juz dzialamy z Isaac Sim na AWS EC2, subskrybujemy te same ROS 2 topiki. Na Jetson Orin to jeden `docker compose up`. NVENC przez go2rtc daje zero-copy video do WebRTC.
>
> OSMO + SRCC = pelny cykl: trening, deploy, operacje. Szukamy partnerstwa ekosystemowego z NVIDIA - listing w dokumentacji Isaac, Inception program, i ewentualnie demo slot na GTC 2027."

---

## Slajd 1: Tytulowy

**Tytul:** Security Robot Command Center
**Podtytul:** Brakujaca warstwa operacyjna dla NVIDIA Isaac
**Tagline:** "Od symulacji do produkcji - jeden dashboard"

**Wizualizacja:** Pelnoekranowy screenshot dashboardu w dark tactical theme - robot na mapie 2D, chmura punktow LiDAR 3D, obraz z kamery, panele kontrolne. Ciemne tlo (#0a0a0a), akcenty teal/cyan.

**Notki dla prezentera:**

- [STARTUP PITCH] Otworz energicznie: "Pokaze wam cos, czego nikt na rynku nie ma"
- [ISAAC TEAM] Otworz technicznie: "Zbudowalismy warstwe operacyjna dla Isaac stack"
- Przedstaw sie w max 15 sekund, przejdz do problemu

---

## Slajd 2-3: Stack NVIDIA dzisiaj

**Tytul:** NVIDIA zbudowala najlepszy pipeline treningowy dla robotow

**Wizualizacja:** Poziomy diagram pipeline'u NVIDIA (od lewej do prawej):

```
Isaac Sim ──> Isaac Lab ──> GR00T N1.6 ──> OSMO ──> Isaac ROS ──> Jetson Orin/Thor
Symulacja     Benchmarki    Foundation     Orkiestracja  Percepcja   Edge
  (USD)       (Arena)        Model         Treningu      GPU-acc.    Compute
                                           (YAML)
```

**Kluczowe punkty:**

- **Isaac Sim** (Apache 2.0, open-source): symulacja fizyki, synthetic data generation, ROS 2 Humble/Jazzy bridge, Newton physics engine
- **OSMO** (open-source, GitHub): orkiestracja workflowow Physical AI - trening, symulacja, evaluation. Definiuje pipelines w YAML, rozdzielna zasoby: training GPUs (GB200, H100), simulation hardware (RTX PRO 6000), edge devices (Jetson)
- **GR00T N1.6**: foundation model dla humanoidow - vision-language reasoning + diffusion transformer dla ruchow. Cosmos Reason integracja.
- **Isaac ROS**: GPU-accelerated ROS 2 packages na Jetson - cuVSLAM, cuMotion, NVENC
- **Jetson T4000** (nowy, CES 2026): Blackwell architecture, 4x lepsza efektywnosc energetyczna, $1,999

**Statystyki ekosystemu:**

- 2 mln+ deweloperow robotyki w ekosystemie NVIDIA
- 660+ startupow robotycznych w NVIDIA Inception
- Partnerzy: Boston Dynamics, NEURA Robotics, LG Electronics, Richtech
- Hugging Face integracja (13 mln AI builderow)

**Notki dla prezentera:**

- [STARTUP PITCH] Skroc do 1 slajdu, podkresli skale ekosystemu (2 mln devow)
- [ISAAC TEAM] Pokaz znajomosc ich stacku, wymien konkretne komponenty (OSMO YAML, Isaac Lab-Arena). Podkresli: "Znamy wasz stack, bo go uzywamy"

---

## Slajd 4: Luka - co po deploymencie?

**Tytul:** Brakujace ogniwo: co po deploymencie?

**Wizualizacja:** Ten sam pipeline, ale z duzym czerwonym "?" miedzy Jetson a "Produkcja":

```
Isaac Sim ──> OSMO ──> Isaac ROS ──> Jetson ──> [ ??? ] ──> Flota robotow
                                                Monitoring?
                                                Sterowanie?
                                                Fleet mgmt?
                                                Dashboard?
```

**Kluczowe punkty:**

1. **OSMO orkiestruje TRENING, nie OPERACJE**
   - OSMO pipeline: SDG → Training → RL → SIL/HIL evaluation
   - OSMO NIE obsluguje: real-time monitoring, fleet control, operator UI
   - OSMO to Kubernetes-like scheduler dla GPU workloads, nie dashboard operacyjny

2. **GR00T N1 ma eval scripts, nie monitoring**
   - `eval_policy.py --plot` generuje wykresy offline
   - Brak dashboardu do real-time monitoringu skillow robota
   - Brak interfejsu dla operatora

3. **Foxglove - jedyna opcja wizualizacji NVIDIA**
   - Foxglove extension w Isaac Sim (WebSocket Protocol)
   - PROBLEM: Foxglove discontinued open-source (marzec 2024)
   - Teraz: SaaS $18-90/user/mies ($5,040+/rok dla 10 osob)
   - NVIDIA dokumentacja wciaz linkuje do Foxglove - luka w ekosystemie

4. **RViz2 - legacy**
   - Desktop-only (Qt/X11)
   - Jeden robot naraz
   - Brak dostepu webowego, mobilnego
   - Problemy z Wayland

**Pytanie retoryczne:** "NVIDIA ma najlepszy pipeline od symulacji do edge'a. Ale kto daje operatorom okno na dzialajace roboty?"

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli problem rynkowy: "10 mld USD rynek robotyki serwisowej do 2028, a nikt nie dal operatorom porzadnego dashboardu"
- [ISAAC TEAM] Podkresli luki techniczne: "Foxglove extension wciaz jest w waszej dokumentacji, ale ich open-source juz nie istnieje. My to zastepujemy."

---

## Slajd 5: Foxglove Vacuum

**Tytul:** Rynek wizualizacji robotycznej wlasnie sie otworl

**Wizualizacja:** Timeline:

```
Marzec 2024    Foxglove discontinues open-source
               (przechodzi wylacznie na platny SaaS)

2024-2025      Foxglove SaaS: $18-90/user/mies
               (Teams: $5,040+/rok za 10 osob)

Styczen 2026   dimensionalOS v0.0.9 alpha
               (188 open issues, 51 stars, fragmentaryczny UI)

Luty 2026      Rerun.io: 19K stars, ale to SDK deweloperski
               (brak fleet mgmt, brak C&C, brak web dashboard)

DZISIAJ ──>    BRAK realnej alternatywy:
               web-native + self-hosted + fleet + C&C + $0
```

**Analiza konkurencji (skrocona):**

| Aspekt           | Foxglove   | RViz2     | dimensionalOS | Rerun    | Formant   |
| ---------------- | ---------- | --------- | ------------- | -------- | --------- |
| Web-native       | Tak        | NIE       | Czesciowo     | NIE      | Tak       |
| Self-hosted      | NIE (SaaS) | Tak       | Tak           | Tak      | NIE       |
| $0 licencja      | NIE        | Tak       | Tak           | Tak      | NIE       |
| Fleet mgmt       | NIE        | NIE       | NIE           | NIE      | Tak       |
| C&C (sterowanie) | NIE        | NIE       | NIE           | NIE      | Czesciowo |
| Dojrzalosc       | Produkcja  | Produkcja | Alpha         | Dev tool | Produkcja |

**Wniosek:** Nikt nie oferuje jednoczesnie: web-native + self-hosted + fleet + C&C + $0

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli timing: "Okno rynkowe jest teraz. Foxglove zamknal open-source, dimensionalOS to alpha, Rerun to SDK"
- [ISAAC TEAM] Podkresli: "Foxglove extension w Isaac Sim wciaz dziala, ale community wersja desktopowa juz nie istnieje. Potrzebujecie alternatywy w ekosystemie"

---

## Slajd 6-7: Nasze rozwiazanie

**Tytul:** Security Robot Command Center - Web-Native. Self-Hosted. Production-Ready.

**Wizualizacja (Slajd 6):** Pelnoekranowy screenshot dashboardu z oznakowaniem modulow:

```
+-------------------+-------------------+-------------------+
|                   |                   |                   |
|   Map 2D          |   LiDAR 3D       |   Camera          |
|   (React Flow     |   (Three.js       |   (WebRTC /       |
|    + Canvas)      |    50K pts)       |    Binary WS)     |
|                   |                   |                   |
+-------------------+-------------------+-------------------+
|                   |                   |                   |
|   Robot Status    |   Controls        |   AI Vision Chat  |
|   (battery,       |   (joystick,      |   (Vision LLM,    |
|    velocity)      |    Nav2 goals)    |    threat assess.) |
|                   |                   |                   |
+-------------------+-------------------+-------------------+
|   Machine Usage   |   Navigation      |   Map Library     |
|   (CPU/RAM/GPU)   |   Status          |   (Save/Load)     |
+-------------------+-------------------+-------------------+
```

**Kluczowe cechy (Slajd 7):**

1. **10+ specjalizowanych modulow** - kazdy zoptymalizowany pod konkretny typ danych
2. **Czas rzeczywisty <100ms** - od sensora robota do piksela w przegladarce
3. **Zero instalacji** - dziala w kazdej przegladarce (Chrome, Firefox, Safari, mobile)
4. **Self-hosted** - Docker Compose, jedno polecenie: `docker compose up`
5. **$0 licencji** - brak vendor lock-in, pelna kontrola nad danymi
6. **Security-first UX** - dark tactical theme do operacji w slabym oswietleniu, statusy alarmowe, emergency stop
7. **ROS 2 native** - natywna integracja przez rosbridge, Zod validation na kazdym komunikacie

**11 modulow w szczegolach:**

| Modul             | Framework           | Funkcja                                                         |
| ----------------- | ------------------- | --------------------------------------------------------------- |
| Map 2D            | React Flow + Canvas | OccupancyGrid, sciezki Nav2, SLAM, click-to-navigate, costmapy  |
| LiDAR 3D          | Three.js            | Chmura punktow (50K+ @60fps), VoxelGrid filter, akumulacja mapy |
| Camera            | Canvas/Video        | WebRTC (go2rtc) + binary WS fallback, multi-camera              |
| IMU               | Three.js            | Orientacja 3D, przyspieszenia, predkosci katowe                 |
| Robot Status      | React               | Bateria, pozycja, predkosc, badges statusu                      |
| Controls          | React               | Joystick teleop, goal selection, emergency stop                 |
| AI Chat           | React               | Vision LLM, natural language commands, analiza zagrozen         |
| Machine Usage     | React               | CPU/RAM/GPU serwera, threshold alerts                           |
| Topic Inspector   | React               | Przegladarka ROS topics, subscribe/unsubscribe                  |
| Map Library       | React               | Save/Load/Delete map, SQLite persistence                        |
| Navigation Status | React               | Dystans, czas, recoveries, status Nav2                          |

**Notki dla prezentera:**

- [STARTUP PITCH] Pokaz screenshoty, podkresli "to dziala, to nie mockup". Pokaz ze jeden czlowiek moze monitorowac flote
- [ISAAC TEAM] Podkresli kompatybilnosc z ROS 2 Humble (ten sam co Isaac Sim), wymien konkretne topiki (/scan, /map, /cmd_vel, Nav2 actions)

---

## Slajd 8: Architektura

**Tytul:** Od ROS 2 Topics do przegladarki - ponizej 100ms

**Wizualizacja:** Diagram architektury:

```
+------------------------------------------+
|        Robot / Isaac Sim (ROS 2)         |
|  /scan  /map  /front_cam/rgb  /cmd_vel  |
|  /odom  Nav2 Action Server  /tf         |
+---------------------|--------------------+
                      | DDS
                      v
+------------------------------------------+
|         rosbridge_server (:9090)         |
|         (ROS 2 native bridge)            |
+---------------------|--------------------+
                      | WebSocket (rosbridge v2.0)
                      v
+------------------------------------------+
|     Bun WebSocket Server (:8080)         |
|  +-------------+  +------------------+  |
|  | ROS Bridge  |  | go2rtc Client    |  |
|  | Handler     |  | (WebRTC video)   |  |
|  +-------------+  +------------------+  |
|  +-------------+  +------------------+  |
|  | Exploration |  | Map Manager      |  |
|  | Service     |  | (SQLite)         |  |
|  +-------------+  +------------------+  |
|  +-------------+  +------------------+  |
|  | Machine     |  | Vision LLM      |  |
|  | Stats       |  | Handler          |  |
|  +-------------+  +------------------+  |
|         Socket.IO (MessagePack / Binary) |
+---------------------|--------------------+
                      v
+------------------------------------------+
|       Next.js 14 Web Client (:3000)      |
|  +------------+ +-------+ +-----------+  |
|  | 18 Zustand | | React | | Three.js  |  |
|  | stores     | | Flow  | | (LiDAR)   |  |
|  +------------+ +-------+ +-----------+  |
|  +------------+ +-------+ +-----------+  |
|  | Canvas API | | Rust  | | WebRTC    |  |
|  | (grids,    | | WASM  | | (camera)  |  |
|  |  paths)    | | 39KB  | |           |  |
|  +------------+ +-------+ +-----------+  |
+------------------------------------------+
```

**Kluczowe decyzje architektoniczne:**

| Decyzja             | Alternatywa      | Dlaczego nasz wybor                             |
| ------------------- | ---------------- | ----------------------------------------------- |
| Bun runtime         | Node.js / Deno   | ~300ms cold start, natywny TS, wbudowany SQLite |
| MessagePack         | JSON             | 30-40% mniejsze payloady                        |
| Socket.IO binary    | Base64 JSON      | 25% mniejsze, 10x szybszy decode                |
| Canvas putImageData | fillRect loop    | 25-50x szybszy render siatek                    |
| Canvas stroke()     | React Flow nodes | 1200x mniej elementow DOM                       |
| Rust WASM           | Pure JS          | 1.6x szybszy frontier detection (CPU-bound)     |
| JS V8 JIT           | WASM             | 14x szybszy PointCloud2 parsing (I/O-bound)     |

**WAZNE - podejscie data-driven:**
Benchmarkowalismy WASM vs V8 JIT dla kazdej funkcji osobno. JavaScript V8 wygrywa dla I/O (base64 decode, buffer reads - 14x szybszy), WASM wygrywa dla CPU-bound algorytmow (frontier detection - 1.6x szybszy). Uzywamy odpowiedniego narzedzia dla kazdego zadania - podejscie data-driven, nie ideologiczne.

**Notki dla prezentera:**

- [STARTUP PITCH] Uprosz diagram, podkresli "3 serwisy w Dockerze, jedno polecenie startuje wszystko"
- [ISAAC TEAM] Pokaz pelny diagram, podkresli rosbridge compatibility (v2.0 protocol), te same topiki co Isaac Sim, MessagePack performance

---

## Slajd 9-10: Moduly - Deep Dive

### Slajd 9: Mapa 2D + Nawigacja

**Tytul:** SLAM + Nav2 + Click-to-Navigate - w przegladarce

**Wizualizacja:** Annotowany screenshot Map2D z zaznaczonymi elementami:

- OccupancyGrid renderowany Canvas putImageData + Color LUT
- Robot node (React Flow)
- Sciezka nawigacji (Canvas stroke, neonowy zielony)
- Goal marker (pulsujacy ring, requestAnimationFrame)
- Costmap overlay toggle
- Panel Map Library

**Techniczne szczegoly:**

```
OccupancyGrid rendering pipeline:
1. Serwer: /map topic (nav_msgs/OccupancyGrid) → MessagePack → Socket.IO binary
2. Client: Zdekoduj MessagePack → Color LUT (pre-computed Uint8ClampedArray)
3. Canvas: ctx.createImageData() → bulk set pixels → ctx.putImageData()
4. Transform: Osobny useEffect na zoom/pan (nie rerenderuje danych!)

Wydajnosc: 384x384 grid = 1-2ms renderingu (vs 50-80ms fillRect)
```

**Nawigacja Nav2:**

- Click na mapie → wybierz orientacje → publish NavigateToPose action goal
- Real-time feedback: sciezka Nav2, status nawigacji, dystans, czas
- Patrol mode: definiuj wielopunktowe trasy
- Costmap visualization (global + local)
- Map Library: zapisuj/wczytuj mapy do SQLite

### Slajd 10: LiDAR 3D + Autonomiczna Eksploracja

**Tytul:** 50,000+ punktow @ 60fps + Frontier Detection w Rust WASM

**Wizualizacja (gorna czesc):** Screenshot LiDAR 3D - Three.js point cloud z viridis gradient, robot marker, fog effect

**Wizualizacja (dolna czesc):** Diagram petli eksploracji:

```
OccupancyGrid ──> Frontier Detection ──> Goal Selection ──> Nav2 Navigate ──> Powtorz
                  (Rust WASM, 0.68ms)    (najblizszy)       (action goal)
                       |                                          |
                       +──────────── Stan: exploring ─────────────+
```

**Techniczne szczegoly LiDAR:**

- Three.js z `DynamicDrawUsage` buffer attributes - geometria tworzona raz, aktualizowana in-place
- Pre-allocated work buffers na poziomie modulu - zero alokacji per frame
- VoxelGrid filter na serwerze: redukcja ilosci punktow przed transmisja
- Throttling 5 FPS server-side dla bandwidthu
- Viridis-inspired height coloring z age-based brightness
- Tryb akumulacji: buduje persistentna mape 3D z wielu skanow

**Techniczne szczegoly eksploracji:**

- State machine: idle → exploring → navigating → paused → complete → error
- Frontier detection: Rust WASM, 39KB binary (LTO optimization)
- Benchmark: WASM 0.68ms vs JavaScript 1.07ms = 1.6x szybszy
- Kazdy frontier = granica miedzy poznanym a nieznanym terenem
- Auto-selection: najblizszy frontier jako cel nawigacji

**Notki dla prezentera:**

- [STARTUP PITCH] Pokaz wizualnie imponujace elementy: rotacja chmury punktow 3D, autonomiczna eksploracja "robot sam odkrywa pomieszczenie"
- [ISAAC TEAM] Podkresli WASM: "Benchmarkowalismy oba podejscia. WASM wygrywa 1.6x dla algorytmu frontier, JS wygrywa 14x dla parsowania PointCloud2. Data-driven approach."

---

## Slajd 11: Benchmarki wydajnosci

**Tytul:** Zmierzone, nie zadeklarowane

**Wizualizacja:** Tabela benchmarkow:

| Operacja                 | Metoda bazowa               | Nasza metoda               | Poprawa                              |
| ------------------------ | --------------------------- | -------------------------- | ------------------------------------ |
| Transport video          | Base64 JSON (67KB)          | Binary Socket.IO (50KB)    | **25% mniejsze, 10x szybszy decode** |
| Render siatki 384x384    | fillRect loop (50ms)        | putImageData + LUT (1-2ms) | **25-50x szybszy**                   |
| Render sciezek (500 pts) | React Flow nodes (1200 DOM) | Canvas stroke (1 element)  | **1200x mniej DOM nodes**            |
| Alokacja buforow         | per-frame alloc             | Pre-allocated pool         | **Zero GC pressure**                 |
| Frontier detection       | JavaScript V8 (1.07ms)      | Rust WASM (0.68ms)         | **1.6x szybszy**                     |
| Start serwera            | Node.js (~2s)               | Bun runtime (~300ms)       | **~6x szybszy**                      |
| Rozmiar payloadu         | JSON                        | MessagePack                | **30-40% mniejszy**                  |
| Binarka WASM             | -                           | LTO optimized              | **39KB**                             |
| PointCloud2 parsing      | WASM (4.84ms)               | JavaScript V8 (0.34ms)     | **JS 14x szybszy**                   |

**Dodatkowe metryki real-time:**

- Latencja end-to-end: <100ms (sensor → piksel w przegladarce)
- LiDAR rendering: 50,000+ punktow @ 60fps
- Max polaczen: 100K+ concurrent (Socket.IO)
- Pamiec serwera: ~50MB (vs ~500MB Electron competitors)
- Zustand stores: 18 niezaleznych stores, immutable updates

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli 2-3 najbardziej imponujace liczby: "25-50x szybszy render, 1200x mniej DOM nodes, <100ms latency"
- [ISAAC TEAM] Pokaz tabele w calosci, podkresli data-driven approach: "Kazda decyzja oparta na benchmarku. Nie uzywamy WASM bo jest modne, uzywamy tam gdzie wygrywa"

---

## Slajd 12-13: Integracja z NVIDIA OSMO

### Slajd 12: OSMO + SRCC = Pelny cykl zycia robota

**Tytul:** NVIDIA OSMO orkiestruje trening. My orkiestrujemy operacje. Razem: pelny lifecycle.

**Wizualizacja:** Diagram dwoch uzupelniajacych sie systemow:

```
NVIDIA OSMO                              Security Robot Command Center
(Orkiestracja Treningu)                  (Orkiestracja Operacji)

+-------------------+                   +-------------------+
| Synthetic Data    |                   | Real-time         |
| Generation        |                   | Monitoring        |
+--------+----------+                   +--------+----------+
         |                                       |
+--------v----------+                   +--------v----------+
| Model Training    |                   | Command &         |
| (RL, IL, SFT)     |                   | Control           |
+--------+----------+                   +--------+----------+
         |                                       |
+--------v----------+                   +--------v----------+
| SIL/HIL           |                   | Fleet             |
| Evaluation        |                   | Management        |
+--------+----------+                   +--------+----------+
         |                                       |
+--------v----------+                   +--------v----------+
| Edge Deploy       | ═══════════════> | Operations &      |
| (Jetson)          |   DEPLOYMENT     | Analytics         |
+-------------------+                   +-------------------+

         BEFORE                                  AFTER
      DEPLOYMENT                              DEPLOYMENT
```

**Kluczowy przekaz:**

- OSMO konczy prace przy deploymencie na edge (Jetson Orin)
- Tam zaczyna sie nasza praca - monitoring, sterowanie, zarzadzanie flota
- Razem pokrywamy **100% cyklu zycia robota**
- To NIE jest konkurencja - to uzupelnienie

**Analogy:**

> "OSMO jest jak CI/CD pipeline w software - buduje, testuje, deployuje. My jestesmy jak Grafana/Datadog - monitorujemy i zarzadzamy tym, co zostalo zdeployowane."

### Slajd 13: Konkretne punkty integracji technnej

**Tytul:** Natywna integracja z kazdym elementem stacku NVIDIA

**Wizualizacja:** Tabela integracji:

| Komponent NVIDIA | Sposob integracji                                                                                             | Status                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Isaac Sim**    | Subskrypcja ROS 2 topics przez rosbridge (te same topiki: /scan, /map, /cmd_vel, Nav2)                        | GOTOWE - dziala na AWS EC2 |
| **Isaac ROS**    | GPU-accelerated perception outputs (cuVSLAM, cuMotion) sa standardowymi ROS 2 messages - konsumujemy natywnie | GOTOWE (architektura)      |
| **Jetson Orin**  | Docker Compose deploy, Bun na ARM64                                                                           | W TRAKCIE                  |
| **NVENC**        | go2rtc wspiera NVENC hardware encoding - zero-copy video do WebRTC na Jetson                                  | PLANOWANE (Q2)             |
| **GR00T N1**     | Monitoring skillow robota: wizualizacja policy output, status wykonania zadania                               | PLANOWANE (Q3)             |
| **Cosmos**       | Wizualizacja world models w module Map 2D                                                                     | KONCEPT                    |
| **OSMO**         | OSMO deployuje na edge → SRCC monitoruje na produkcji. Pipeline callback: deploy done → dashboard ready       | KONCEPT                    |

**Integracja Isaac Sim - juz dzialajaca:**

```
Nasza instancja AWS EC2 "isaac-sim-1" (63.182.177.92):
├── Isaac Sim ──> ROS 2 Humble topics
├── rosbridge_server (:9090) ──> WebSocket bridge
├── go2rtc (:1984) ──> WebRTC video pipeline
├── Bun WS Server (:8080) ──> Socket.IO + MessagePack
└── Next.js Client (:3000) ──> Dashboard w przegladarce

Status: DZIALAJACE - Unitree Go2 w symulowanym srodowisku
```

**Notki dla prezentera:**

- [STARTUP PITCH] Uprosz do jednego diagramu "OSMO = before deploy, SRCC = after deploy". Podkresli: "Nie konkurujemy z NVIDIA, uzupelniamy ich"
- [ISAAC TEAM] Pokaz tabele integracji w calosci. Podkresli ze juz dzialamy z Isaac Sim na EC2. Zapytaj: "Jakie topiki bylyby najbardziej wartosciowe do integracji w nastepnej kolejnosci?"

---

## Slajd 14: Demo Scenario

**Tytul:** Live Demo: Isaac Sim → Dashboard → Sterowanie robotem

**Przebieg demo (5-7 minut):**

### Krok 1: Isaac Sim (30s)

- Pokaz Unitree Go2 w symulowanym srodowisku magazynowym
- Wskazz ROS 2 topiki publikowane w terminalu
- "Kazdy robota w Isaac Sim publikuje standardowe ROS 2 topiki. Nasz dashboard je konsumuje natywnie."

### Krok 2: Otworz Dashboard (30s)

- Przejdz do `http://localhost:3000` w Chrome
- Pokaz ladowanie dark tactical UI
- Wskazz moduly: "10+ modulow, kazdy zoptymalizowany pod konkretny typ danych sensorowych"

### Krok 3: Mapa 2D + SLAM (60s)

- Pokaz mape budujaca sie w real-time z OccupancyGrid
- Przelacz warstwy: global costmap, local costmap
- Wskazz wydajnosc Canvas: "Ta siatka 384x384 renderuje sie w 1-2ms"

### Krok 4: LiDAR 3D (60s)

- Przelacz na modul LiDAR
- Pokaz 50K+ punktow renderowanych @ 60fps
- Obracaj widok 3D
- "Te punkty sa renderowane w Three.js z pre-alokowanymi buforami - zero alokacji per frame"

### Krok 5: Click-to-Navigate (60s) - NAJWAZNIEJSZY MOMENT

- Kliknij na mapie 2D zeby ustawic cel
- Wybierz orientacje
- Obserwuj Nav2 planujace sciezke
- Robot w Isaac Sim zaczyna sie poruszac JEDNOCZESNIE z dashboardem
- "Jedno klikniecie w przegladarce → Nav2 action goal → robot jedzie"

### Krok 6: Autonomiczna Eksploracja (60s)

- Uruchom frontier-based exploration
- Obserwuj robota samodzielnie odkrywajacego nowe obszary
- Pokaz frontiers wykrywane przez Rust WASM
- Pokaz rosnacy procent eksploracji
- "Robot sam decyduje dokad jechac. Frontier detection w Rust WASM - 1.6x szybszy niz JavaScript"

### Krok 7: Kamera + AI Vision (60s)

- Otworz modul kamery - pokaz video streaming
- Otworz AI Chat
- Kliknij "Describe Scene" → Vision LLM analizuje co widzi robot
- Kliknij "Assess Threats" → analiza zagrozen bezpieczenstwa
- "Na Jetson z NVENC pipeline, to staje sie produkcyjny system monitoringu bezpieczenstwa"

### Krok 8: Machine Monitoring (30s)

- Pokaz uzycie CPU/RAM/GPU serwera
- "To nie jest tylko wizualizacja - to pelne narzedzie operacyjne"

### Krok 9: Zamkniecie (30s)

- "Wszystko co widzieliscie to jeden robot. Architektura wspiera N robotow. Kazdy ma swoje stores, swoja mape, swoja kamere. Operator widzi wszystkie z jednej zakladki przegladarki."

**Notki dla prezentera:**

- [STARTUP PITCH] Skroc do 3-4 minut. Focus na: click-to-navigate, AI vision, autonomiczna eksploracja. Te elementy sa wizualnie imponujace
- [ISAAC TEAM] Pelne 5-7 minut. Podkresli kompatybilnosc ROS 2, Nav2 actions, identyczne topiki co Isaac Sim. Po demo zapytaj o feedback techniczny

---

## Slajd 15: Matryca konkurencji

**Tytul:** Zaden konkurent nie pokrywa naszej pozycji

**Wizualizacja:** Pelna matryca porownawcza:

| Cecha             |  SRCC   | Foxglove | RViz2 |  dimos  | Rerun | Formant | InOrbit |
| ----------------- | :-----: | :------: | :---: | :-----: | :---: | :-----: | :-----: |
| Web-native        | **TAK** |   TAK    |  NIE  | Czesci. |  NIE  |   TAK   |   TAK   |
| Self-hosted       | **TAK** |   NIE    |  TAK  |   TAK   |  TAK  |   NIE   |   NIE   |
| $0 licencji       | **TAK** |   NIE    |  TAK  |   TAK   |  TAK  |   NIE   |   NIE   |
| Fleet mgmt        | **TAK** |   NIE    |  NIE  |   NIE   |  NIE  |   TAK   |   TAK   |
| Command & Control | **TAK** |   NIE    |  NIE  |   NIE   |  NIE  | Czesci. |   NIE   |
| Nav2 integracja   | **TAK** |   NIE    |  TAK  |   NIE   |  NIE  |   NIE   |   NIE   |
| Security-focused  | **TAK** |   NIE    |  NIE  |   NIE   |  NIE  |   NIE   |   NIE   |
| LiDAR 3D (web)    | **TAK** |   TAK    |  TAK  | Czesci. |  TAK  |   NIE   |   NIE   |
| WebRTC video      | **TAK** |   NIE    |  NIE  |   TAK   |  NIE  |   TAK   |   NIE   |
| WASM processing   | **TAK** |   NIE    |  NIE  |   NIE   |  NIE  |   NIE   |   NIE   |
| Production-ready  | **TAK** |   TAK    |  TAK  |   NIE   |  Dev  |   TAK   |   TAK   |
| Isaac native      | **TAK** | Czesci.  |  TAK  |   NIE   |  NIE  |   NIE   |   NIE   |

**Mapa pozycjonowania:**

```
                    Enterprise SaaS
                         |
              Formant ($45M) ---- InOrbit ($10M)
                         |
                    Foxglove ($18-90/user)
                         |
         +───────────────+───────────────+
         |                               |
    Open Source                     Self-Hosted
         |                               |
    RViz2 (desktop)              ★ SRCC ★
    Rerun (SDK)                  (web-native,
    dimos (alpha)                 security-focused,
                                  fleet-capable)
```

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli: "Foxglove to nasz najblizszy konkurent - $5K+/rok, SaaS-only, brak fleet. My: $0, self-hosted, fleet-ready"
- [ISAAC TEAM] Podkresli kolumne "Isaac native": "Tylko my i RViz2 mamy pelna integracje. Ale RViz2 to desktop - my jestesmy web-native"

---

## Slajd 16: Model partnerstwa

**Tytul:** Jak mozemy wspolpracowac

**Wizualizacja:** 3 tiery partnerstwa:

### Tier 1: Isaac Ecosystem Listing (natychmiast)

**Koszt dla NVIDIA: $0 | Wartosc: wypelnienie luki w dokumentacji**

- Dodanie SRCC jako "Isaac-Compatible Operations Dashboard" w dokumentacji Isaac
- Zastapianie/uzupelnienie referencji do Foxglove w tutorialach Isaac Sim
- Wspolny blog post: "Od Isaac Sim do produkcji - monitoring robotow z SRCC"
- Link z NVIDIA Developer Portal do naszego repo/demo

### Tier 2: Technical Co-Development (6 miesiecy)

**Wymaga: dostep techniczny | Wartosc: lepszy produkt dla obu stron**

- Jetson-optimized Docker images z NVIDIA Container Toolkit
- NVENC integracja dla go2rtc (zero-copy video na Jetson)
- cuVSLAM / cuOpt wizualizacja - dedykowane widgety
- Isaac Sim viewport streaming do naszego dashboardu (Omniverse Streaming Client)
- GR00T N1 skill monitoring panel
- Joint testing na Jetson Orin hardware

### Tier 3: Ecosystem Partnership (12 miesiecy)

**Wymaga: formalne partnerstwo | Wartosc: nowy segment rynku dla NVIDIA**

- NVIDIA Inception startup program membership
- GTC exhibitor / demo partner
- Joint reference architectures dla robotyki bezpieczenstwa
- Pre-installed na JetPack images (opcjonalnie)
- Co-marketing z Isaac ROS team
- Case study z wdrozenia produkcyjnego

**Programy NVIDIA do wykorzystania:**

- **NVIDIA Inception** - darmowy, bez equity, 660+ robotics startupow
- **Physical AI Fellowship** (MassRobotics + AWS + NVIDIA) - 8 tygodni, mentoring, dostep do stacku
- **GTC Startup Pavilion** - ekspozycja na targach
- **Inception Capital Connect** - dostep do sieci VC

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli Tier 1: "Kosztuje NVIDIA zero. Wypelnia realna luke w dokumentacji. Win-win"
- [ISAAC TEAM] Podkresli Tier 2: "Mozemy zbudowac dedykowane widgety dla cuVSLAM i cuOpt output - wasza percepcja, nasz dashboard"

---

## Slajd 17: Roadmap integracji

**Tytul:** Roadmap techniczny - Isaac-First

**Wizualizacja:** Timeline kwartalny:

### Q1 2026 (Teraz → GTC)

- [x] Isaac Sim validated integration (dziala na AWS EC2)
- [x] ROS 2 Humble + rosbridge full integration
- [x] Nav2 Action Server integration (click-to-navigate)
- [x] Binary WebSocket transport + MessagePack
- [x] Rust WASM frontier detection (39KB, 1.6x szybszy)
- [x] Canvas optimizations (putImageData + LUT)
- [ ] Docker deploy na Jetson Orin (IN PROGRESS)

### Q2 2026 (Post-GTC)

- [ ] NVENC hardware encoding via go2rtc na Jetson
- [ ] Isaac ROS perception widgets (cuVSLAM output viz)
- [ ] Multi-robot fleet management UI
- [ ] Authentication + RBAC
- [ ] Jetson-optimized Docker images
- [ ] NVIDIA Inception application

### Q3 2026

- [ ] cuOpt path planning visualization
- [ ] GR00T N1 skill monitoring dashboard
- [ ] Omniverse Streaming Client integracja (Isaac Sim viewport w przegladarce)
- [ ] WebGPU renderer dla point clouds (2-10x vs WebGL)
- [ ] Production hardening (99.9% uptime target)

### Q4 2026

- [ ] Fleet analytics i dane historyczne
- [ ] Custom widget SDK (rozszerzenia third-party)
- [ ] Isaac Perceptor integration
- [ ] Edge-cloud hybrid deployment
- [ ] Multi-tenancy dla firm zarzadzajacych flotami
- [ ] GTC 2027 demo preparation

**Notki dla prezentera:**

- [STARTUP PITCH] Podkresli co juz jest DONE (checkmarks) - "To nie roadmap marzycieli, wiekszosc Q1 jest zrealizowana"
- [ISAAC TEAM] Podkresli Q2-Q3 items - "To sa elementy, ktore najlepiej zrobilbysmy WSPOLNIE z dostepem do waszego hardware i SDK"

---

## Slajd 18: The Ask

**Tytul:** Czego szukamy

**Wizualizacja:** Czysta lista z ikonami:

### 1. Rozpoznanie w ekosystemie

Dodanie SRCC jako Isaac-compatible operations tool w dokumentacji i zasobach deweloperskich NVIDIA.

### 2. Dostep techniczny

Early access do aktualizacji Isaac ROS, podgladow Jetson SDK, i API GR00T N1 na potrzeby integracji.

### 3. NVIDIA Inception

Czlonkostwo w programie Inception - dostep do GPU credits, mentoringu technicznego, kanalow marketingowych NVIDIA.

### 4. Slot demo na GTC 2027

Mozliwosc zaprezentowania zintegrowanego pipeline'u Isaac Sim → SRCC → Jetson na kolejnym GTC.

### 5. Joint Reference Architecture

Wspolne opracowanie architektury referencyjnej "Od Isaac Sim do produkcyjnych operacji robotycznych".

---

**Zdanie zamykajace:**

> "NVIDIA zbudowala najlepszy pipeline do trenowania robotow. My zbudowalismy warstwe operacyjna, ktora pozwala je zdeployowac i zarzadzac nimi. Razem zamykamy luke sim-to-real - nie tylko w mozliwosciach robota, ale w narzedziach, ktorych uzywa operator kazdego dnia."

**Notki dla prezentera:**

- [STARTUP PITCH] Zamknij mocno: "Nie prosimy o inwestycje. Prosimy o dostep do ekosystemu. Tier 1 kosztuje was zero i wypelnia realna luke."
- [ISAAC TEAM] Zamknij pytaniem: "Jaki byloby najcenniejszy pierwszy krok integracji z waszej perspektywy?"

---

## GTC 2026 Action Plan

### Kroki do podjecia PRZED konferencja (do 15 marca)

| #   | Akcja                                      | Deadline       | Kontakt                     |
| --- | ------------------------------------------ | -------------- | --------------------------- |
| 1   | Aplikacja do NVIDIA Inception              | ASAP           | nvidia.com/en-us/startups/  |
| 2   | Rejestracja na GTC                         | ASAP           | Kod: GTC26INCP (25% znizki) |
| 3   | Przygotowanie demo (Isaac Sim + Dashboard) | 10 marca       | -                           |
| 4   | Kontakt ws. sponsoringu/stoiska            | ASAP           | GTC-Sponsors@nvidia.com     |
| 5   | Aplikacja do Physical AI Fellowship        | Sprawdz termin | MassRobotics + AWS + NVIDIA |
| 6   | Przygotowanie one-pager PDF                | 10 marca       | -                           |
| 7   | Deploy demo na przenośnym Jetson           | 12 marca       | -                           |

### Na konferencji (16-19 marca)

| Dzien | Wydarzenie                 | Godziny      | Lokalizacja       |
| ----- | -------------------------- | ------------ | ----------------- |
| TBD   | AI Day for Startups        | 13:00-17:00  | Westin            |
| TBD   | Startup Pitch Sessions     | 14:00-17:00  | Convention Center |
| Caly  | Inception Startup Pavilion | Godziny Expo | Expo Hall         |
| TBD   | AI Day for VCs             | 13:00-17:00  | Westin            |
| TBD   | VC Reverse Pitches         | 14:00-15:00  | Convention Center |

### Kogo szukac na konferencji

1. **Isaac Sim team** - integracja techniczna, listing w dokumentacji
2. **Isaac ROS team** - Jetson optimization, NVENC, cuVSLAM
3. **OSMO team** - pipeline integration, post-deployment handoff
4. **GR00T team** - foundation model monitoring, skill viz
5. **Inception team** - program membership, startup support
6. **Developer Relations** - blog posts, tutorials, community
7. **Business Development** - formalne partnerstwo ecosystem
8. **Foxglove team** (jezeli sa na GTC) - pozycjonowanie, roznice

### Sesje GTC do odwiedzenia

- Sesje z kategorii "Physical AI & Robotics"
- "NVIDIA Inception: The Catalyst Fueling Your Startup's Success" [SE71117]
- "Next Wave Innovations: Startups Shaping Tomorrow's Technology" [SE72496]
- Startup Pitch Sessions [S74529, S74528, S74527]
- Wszystkie sesje zwiazane z Isaac Sim, OSMO, GR00T

---

## Q&A Preparation

### P: "Dlaczego nie kontrybuujecie do Foxglove?"

**O:** Foxglove zrezygnowal z open-source w marcu 2024 i przeszedl na model SaaS. Nasza architektura jest fundamentalnie inna - jestesmy security-focused, self-hosted, zbudowani dla operacji (nie tylko wizualizacji). Foxglove to narzedzie deweloperskie; my budujemy narzedzie operacyjne.

### P: "Jak skalujecie ponad jednego robota?"

**O:** Kazdy robot dostaje izolowane Zustand stores (robot-store, lidar-store, camera-store itd.). Wzorzec Map<robotId, data> zapewnia O(1) lookup. WebSocket server multipleksuje N robotow przez jedno polaczenie. Architektura od poczatku projektowana pod fleet management.

### P: "A co z autentykacja i bezpieczenstwem?"

**O:** Autentykacja i RBAC sa na roadmapie Q2. Komunikaty WebSocket sa walidowane schematami Zod. Model self-hosted oznacza, ze dane nigdy nie opuszczaja waszej sieci. Dla organizacji bezpieczenstwa, ktore nie moga wyslac telemetrii robota do chmury third-party, to kluczowa zaleta.

### P: "Czym sie rozni od Formant/InOrbit?"

**O:** Formant i InOrbit to enterprise SaaS z vendor lock-in i cenami per-robot. My jestesmy self-hosted, open architecture, $0 licencji. Organizacje bezpieczenstwa ktore nie moga wyslac danych do chmury zewnetrznej potrzebuja naszego podejscia. Ponadto mamy natywna integracje z Nav2 i Isaac - czego SaaS platformy nie oferuja.

### P: "Czy Bun jest produkcyjny?"

**O:** Wybraliscmy Bun dla natywnej egzekucji TypeScript, ~300ms cold start, i wbudowanego SQLite. Dla naszego workloadu WebSocket jest stabilny. Socket.IO dziala identycznie na Bun i Node.js - mozemy przejsc na Node jezeli bedzie taka potrzeba.

### P: "Dlaczego Rust WASM a nie pure JavaScript?"

**O:** Benchmarkowalismy oba podejscia. JavaScript V8 JIT jest szybszy dla operacji I/O-bound (base64 decode, odczyty buforow) - 14x szybszy z powodu narzutu granicy JS-WASM. WASM wygrywa dla czystych algorytmow CPU jak frontier detection (1.6x szybszy). Uzywamy odpowiedniego narzedzia do kazdego zadania - data-driven, nie ideologicznie.

### P: "Jak dzialaciezna Jetson z ograniczonymi zasobami?"

**O:** Bun zuzywa ~50MB RAM (vs ~500MB Electron). Nasz serwer to 3 lekkie serwisy Docker. Rendering jest po stronie klienta (przegladarka operatora), nie na edge. Jetson serwuje dane i obsluguje WebSocket - nie renderuje UI. To architektycznie minimalne obciazenie edge'a.

### P: "Dlaczego security-focused? Czy to nie za waski rynek?"

**O:** Robotyka bezpieczenstwa to segment $4.6 mld (2025) rosnacy 12% CAGR. Patrole, monitoring, inspekcje. Ale nasz dashboard jest modularny - podmiana tematu kolorystycznego i mozna go uzywac w logistyce, hotelarstwie, opiece zdrowotnej. Security-focus to nasze GTM, nie limit architektoniczny.

### P: "Macie klientow?"

**O:** Jestesmy na etapie pre-revenue z dzialajacym produktem. Validowalismy z robotem Unitree Go2 (fizycznym i symulowanym w Isaac Sim). Szukamy first adopters - idealnie z ekosystemu NVIDIA Inception.

### P: "Jak monetyzujecie jezeli licencja to $0?"

**O:** Model open-core: core dashboard jest darmowy i self-hosted. Monetyzacja przez: (1) Enterprise support i SLA, (2) Cloud-hosted wersja managed, (3) Premium moduly (zaawansowana analityka, multi-tenancy), (4) Professional services - integracja i customizacja.

### P: "Jak wyglada wasz zespol?"

**O:** [Uzupelnij faktycznymi danymi o zespole - ile osob, jakie kompetencje, doswiadczenie w robotyce/web dev]

---

## Visual Style Guide

### Paleta kolorow pitch decku

| Element           | Kolor           | Hex       | Uzycie                            |
| ----------------- | --------------- | --------- | --------------------------------- |
| Tlo slajdow       | Niemal czarny   | `#0a0a0a` | Glowne tlo (matching produkt)     |
| Tlo sekcji        | Ciemny szary    | `#141414` | Karty, panele                     |
| Akcent glowny     | Teal/Cyan       | `#2dd4bf` | CTA, kluczowe metryki, naglowki   |
| Akcent dodatkowy  | Neonowy zielony | `#4ade80` | Statusy online, sciezki nawigacji |
| NVIDIA co-brand   | NVIDIA Green    | `#76b900` | Logo NVIDIA, elementy partnerskie |
| Niebezpieczenstwo | Czerwony        | `#ef4444` | Luki, problemy, emergency         |
| Ostrzezenie       | Pomaranczowy    | `#f59e0b` | Alerty, wartosci progowe          |
| Tekst glowny      | Bialy           | `#ffffff` | Naglowki                          |
| Tekst drugorzedny | Szary           | `#a1a1aa` | Opisy, labels                     |

### Typografia

- **Naglowki:** Sans-serif (Inter, SF Pro, lub podobny)
- **Dane techniczne:** Monospace (JetBrains Mono, Fira Code)
- **Metryki:** Bold, duzy rozmiar, kolor akcent

### Zasady wizualne

1. **Screenshoty z dzialajacego produktu** - NIGDY mockupy
2. **Diagramy w stylu ASCII-art** skonwertowane do czystych SVG
3. **Jeden kluczowy przekaz na slajd** - nie przesycac
4. **Dane > opinie** - kazdy claim poparty benchmarkiem
5. **Dark theme** na kazdym slajdzie - spojnosc z produktem
6. **Logo NVIDIA Green** na slajdach integracyjnych (co-branding)

### Format screenshotow

- Rozdzielczosc: 1920x1080 minimum
- Przygotuj screenshoty: pelny dashboard, Map2D close-up, LiDAR 3D, Camera + AI Chat, autonomiczna eksploracja w trakcie
- Opcjonalnie: krotki GIF/video autonomicznej eksploracji (10-15s)

---

## Kluczowe metryki do zapamietania

Wydrukuj i zabierz na konferencje:

```
PRODUKT:
  10+ modulow w produkcji
  18 Zustand stores (immutable state)
  55 komponentow React (.tsx)
  5 backend handlers

WYDAJNOSC:
  <100ms    latencja end-to-end
  50,000+   punktow LiDAR @ 60fps
  25-50x    szybszy render siatek (Canvas vs fillRect)
  1200x     mniej DOM nodes (Canvas vs React Flow)
  30-40%    mniejsze payloady (MessagePack vs JSON)
  ~300ms    cold start serwera (Bun)
  14x       JS szybszy niz WASM (I/O-bound)
  1.6x      WASM szybszy niz JS (CPU-bound)
  39KB      binarka WASM (LTO)
  ~50MB     RAM serwera

RYNEK:
  $0        licencji (vs Foxglove $5K+/rok)
  $4.6 mld  rynek robotyki bezpieczenstwa (2025)
  12% CAGR  wzrost rynku
  660+      startupow robotycznych w NVIDIA Inception
  2 mln+    deweloperow w ekosystemie NVIDIA
  22,000+   startupow w programie Inception

INTEGRACJA NVIDIA:
  ROS 2 Humble   = Isaac Sim ROS bridge
  Nav2 Actions    = click-to-navigate
  rosbridge v2.0  = standardowy protokol
  Docker Compose  = deploy na Jetson
  go2rtc + NVENC  = zero-copy WebRTC video
```

---

## Materialy dodatkowe do przygotowania

### One-Pager PDF (do wydruku / wyslania mailem)

- Front: Product screenshot + elevator pitch + 5 kluczowych metryk
- Back: Architektura + integracja NVIDIA + kontakt

### Demo na laptopie

- Isaac Sim uruchomiony na EC2
- Dashboard na localhost
- Przygotowane scenariusze: nawigacja, eksploracja, AI vision
- Backup: nagranie video demo (5 min) na wypadek problemow z siecią

### Demo na Jetson (jezeli dostepny)

- Przenośna demonstracja: Jetson Orin + ekran + robot symulowany
- Najbardziej imponujace na stoisku wystawienniczym

### Wizytowki / QR code

- QR do live demo / repo / strony produktu
- Kontakt email + LinkedIn

---

## Zrodla i referencje

### NVIDIA GTC 2026

- Strona glowna: nvidia.com/gtc/
- Sesje: nvidia.com/gtc/session-catalog/
- Tematy: nvidia.com/gtc/conference-topics/
- Startupy: nvidia.com/gtc/startups/
- Sponsoring: GTC-Sponsors@nvidia.com
- Rejestracja: register.nvidia.com (kod: GTC26INCP)

### NVIDIA Ekosystem

- OSMO: github.com/NVIDIA/OSMO | developer.nvidia.com/osmo
- Isaac Sim: docs.isaacsim.omniverse.nvidia.com
- GR00T: github.com/NVIDIA/Isaac-GR00T
- Isaac ROS: github.com/NVIDIA-ISAAC-ROS
- Inception: nvidia.com/en-us/startups/
- Jetson: nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/

### Konkurencja

- Foxglove: foxglove.dev (SaaS, discontinued open-source March 2024)
- Rerun: rerun.io (19K stars, MIT/Apache 2.0, SDK/logger)
- dimensionalOS: github.com/dimensionalOS/dimos (v0.0.9 alpha, 51 stars)
- Formant: formant.io ($45M funding, enterprise SaaS)
- InOrbit: inorbit.ai ($10M Series A, freemium)

### Nasze dokumenty

- docs/handover.md - pelny handover techniczny
- docs/market-research-2026.md - analiza rynkowa
- docs/raport-porownawczy.md - porownanie konkurencji
- docs/optimizations-2026.md - wzorce wydajnosci

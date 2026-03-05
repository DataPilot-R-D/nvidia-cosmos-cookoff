# Analiza strategiczna: Featury priorytetowe i analiza konkurencji

**Data:** 2026-02-02
**Wersja:** 1.0
**Na podstawie:** `docs/market-research-2026.md`, `docs/raport-porownawczy.md`, `docs/handover.md`
**Zawiera:** Priorytetyzacja featur, deep-dive 4 konkurentow, 8 ryzyk z mitygacjami, timeline zagrozen

---

## Kontekst rynkowy

- Rynek robot security: **$882M do 2030** (CAGR 34%)
- Foxglove **zamknal open source** (marzec 2024) - rynek szuka alternatyw
- Nasza unikalna nisza: jedyny **security-focused, self-hosted, web-native** dashboard z command & control
- Glowne zagrozenia: Formant ($45M) dodaje security vertical, dimensionalOS dojrzewa, Rerun (19K stars) moze dodac real-time dashboard

---

## TIER 1 - Natychmiastowe (Q1 2026) - Biggest competitive moat

### 1. RBAC + SSO/SAML

- **Dlaczego teraz:** Warunek konieczny dla sprzedazy B2B/enterprise. Formant, InOrbit i Foxglove Team maja SSO. Bez tego nie wejdziemy na rynek enterprise.
- **Przewaga:** Zaden self-hosted, open-source dashboard robotyczny nie oferuje RBAC z security-specific rolami (Operator, Supervisor, Admin).
- **Scope:** Role-based access (kto moze sterowac robotem, kto tylko obserwuje), SSO/SAML, audit logs.

### 2. Mobile PWA / Responsive Field App

- **Dlaczego teraz:** **ZADEN** z 7 konkurentow nie ma dobrego mobile UX. Foxglove 2/5, RViz2 1/5, Open-RMF 2/5, InOrbit - brak. Nasz dashboard ma juz responsive breakpoints (4/5 w UX scorecard).
- **Przewaga:** Operatorzy security pracuja w terenie z tabletami/telefonami. PWA z push notifications daje offline-ready field tool.
- **Scope:** PWA manifest, offline cache, push notifications (alert severity), optimized touch controls (joystick, emergency stop), camera-first mobile layout.

### 3. Alert + Incident Management System

- **Dlaczego teraz:** Kluczowy feature dla operacji security. Mamy juz 4-level alert system, ale brak: eskalacji, historii incydentow, raportow, timeline.
- **Przewaga:** Formant ma alerty ale nie security-focused. Zaden konkurent nie ma incident management zintegrowanego z robotem.
- **Scope:** Incident timeline, eskalacja (email/SMS/webhook), historia z filtrami, raport PDF/CSV, integracja z alertami robota.

### 4. AI Patrol Optimization

- **Dlaczego teraz:** AI/Agent trend rosnie. dimensionalOS ma agentow ale brak dashboardu. Formant ma F3 platform ale nie security-focused. Mamy juz AI Chat + Vision LLM.
- **Przewaga:** Buduje "competitive moat" - polaczenie AI z domain knowledge (security patterns, coverage optimization, anomaly detection).
- **Scope:** ML-based patrol route optimization (pokrycie terenu, czas reakcji), anomaly detection z kamer, AI-suggested patrol adjustments.

---

## TIER 2 - Krotkoterminowe (Q1-Q2 2026) - Wzmocnienie przewagi

### 5. Open Source Release + Community

- **Dlaczego:** Foxglove zamknal zrodla. Rerun ma 19K stars. Rynek jest glodny open-source robotics tools.
- **Impact:** Community, contributions, brand awareness, trust (vs SaaS lock-in Foxglove/Formant).
- **Prerequisite:** RBAC (zeby open source nie oznaczalo "kazdy ma admin access").

### 6. MCP Integration (Model Context Protocol)

- **Dlaczego:** dimensionalOS ma experimental MCP - sterowanie robotem z IDE/LLM. My mozemy byc pierwsi z production-grade MCP server.
- **Impact:** Developerzy moga kontrolowac roboty z Cursor/Claude Code. Unikalny w branzy.
- **Scope:** MCP server z narzedziami: navigate_to, get_status, start_patrol, emergency_stop, get_camera_frame.

### 7. go2rtc WebRTC Pipeline (aktywacja)

- **Dlaczego:** Infrastruktura gotowa, brakuje konfiguracji pipeline. Prawdziwe WebRTC: ~50ms vs 150-200ms (fallback binary).
- **Impact:** 3x lepsza latencja video. Krytyczne dla teleoperation w security.
- **Scope:** go2rtc.yaml config, FFmpeg pipeline ROS Image -> RTSP -> go2rtc -> WebRTC, instalacja na EC2.

### 8. MessagePack aktywacja na produkcji

- **Dlaczego:** Juz zaimplementowane, ale disabled. Natychmiastowy zysk 30-40% bandwidth reduction.
- **Impact:** Lepsza wydajnosc przy wielu robotach, nizsze koszty transferu.
- **Scope:** Wlaczenie flagi, testy E2E z MessagePack.

---

## TIER 3 - Srednioterminowe (Q2-Q3 2026) - Bariery wejscia

### 9. Replay Mode (Security Audit)

- **Dlaczego:** Rerun robi to najlepiej, ale dla dev workflow. Nikt nie ma replay dla security audit.
- **Impact:** Compliance, post-incident review, training. Enterprise must-have.
- **Scope:** Nagrywanie sesji (events + sensor data), timeline player, export do raportu.

### 10. Integracja CCTV / Access Control

- **Dlaczego:** Feature parity z enterprise security systems. Robot + kamery stacjonarne + kontrola dostepu w jednym dashboardzie.
- **Impact:** Single pane of glass dla security operations.

### 11. Multi-tenant Support

- **Dlaczego:** Fundament pod SaaS model. Formant i InOrbit to maja.
- **Impact:** B2B revenue stream, scalability.

### 12. Plugin Marketplace

- **Dlaczego:** Foxglove mial extensions. Otwiera ekosystem.
- **Impact:** Community-driven growth, long-tail use cases.

---

## Matryca priorytetow vs konkurencja

| Feature          | Nikt nie ma             | Formant ma   | Foxglove ma | Trudnosc | Przewaga         |
| ---------------- | ----------------------- | ------------ | ----------- | -------- | ---------------- |
| RBAC + SSO       | -                       | Yes          | Yes Team    | Srednia  | Enterprise entry |
| Mobile PWA       | Nikt!                   | No           | No          | Srednia  | Blue ocean       |
| Incident Mgmt    | Yes (security)          | Czesciowo    | No          | Srednia  | Domain moat      |
| AI Patrol Opt    | Yes (security)          | F3 (generic) | No          | Wysoka   | Tech moat        |
| MCP Integration  | Yes (prod-grade)        | No           | No          | Niska    | Developer love   |
| Replay/Audit     | Yes (security)          | No           | No          | Wysoka   | Compliance       |
| CCTV Integration | Yes (w robot dashboard) | No           | No          | Srednia  | Single pane      |

---

## Rekomendacja: Top 5 do natychmiastowej implementacji

1. **MessagePack activation** - zerowy effort, natychmiastowy zysk (juz gotowe)
2. **go2rtc WebRTC pipeline** - konfiguracja, nie kod (juz gotowe)
3. **Mobile PWA** - blue ocean, zaden konkurent nie ma
4. **RBAC + SSO** - gate do enterprise market
5. **MCP Integration** - niska trudnosc, wysoki wow-factor, unikalny w branzy

Te 5 featur razem daja:

- Natychmiastowy performance boost (MessagePack + WebRTC)
- Unikalny mobile experience (PWA)
- Enterprise readiness (RBAC)
- Developer/AI differentiator (MCP)

---

## DEEP DIVE: 4 glowni konkurenci (stan luty 2026)

---

### A. Formant.io - Najwieksze zagrozenie

**Profil:** $45M funding | ~35 pracownikow | Enterprise SaaS | Mill Valley, CA

**Co maja (aktualne na 2026):**

| Capability                        | Status                     | Nasz odpowiednik              |
| --------------------------------- | -------------------------- | ----------------------------- |
| Fleet Management (heterogeneous)  | Production                 | Single-fleet                  |
| Teleoperation (secure remote)     | Production                 | Joystick + Nav2               |
| Mission Control (task automation) | Production                 | Brak                          |
| **AI Voice Commands**             | F3 Platform                | AI Chat (Vision LLM)          |
| **AI Deep Research**              | Nowe! Multi-step analysis  | Brak                          |
| **Incident Management**           | Proactive detection + Jira | 4-level alerts, brak workflow |
| SSO (Google, OIDC)                | Yes                        | No                            |
| RBAC                              | Yes                        | No                            |
| Audit trails                      | Yes                        | No                            |
| Performance Analytics             | Yes                        | Machine Stats                 |
| Smart Knowledge Base              | Nowe! Document AI          | No                            |
| API/SDK extensibility             | Yes                        | No                            |
| Jira/Slack/PagerDuty              | Yes                        | No                            |

**Nowe partnerstwa (2025-2026):** Holman (automotive), SoftBank Robotics, Slalom (consulting).

**Ich kierunek:** AI-first operations ("24/7 AI-driven predictive capabilities"), swarm robotics, enterprise fleet management.

**ZAGROZENIE:** Jesli Formant doda security-specific vertical (patrol, dark theme, emergency UX), maja budzet i enterprise base zeby nas wyprzedzic. Ich F3 platform z AI Deep Research i proactive incident management zbliza sie do tego co my potrzebujemy.

**Nasze przewagi nad Formant:**

| My lepsi                           | Dlaczego                                  |
| ---------------------------------- | ----------------------------------------- |
| $0 licencji (self-hosted)          | Formant custom enterprise pricing = drogo |
| Pelna kontrola danych              | Formant = cloud SaaS lock-in              |
| Security-specialized UX            | Formant = generic fleet tool              |
| Open source potential              | Formant = zamkniety                       |
| Modern web stack (Next.js 14, Bun) | Formant = legacy tech                     |
| 3D LiDAR viz (Three.js)            | Formant = ograniczone                     |
| Binary transport (MessagePack)     | Formant = standard                        |

**Co powinnismy zaadaptowac z Formant:**

1. **Incident Management z Jira integration** - ich proactive detection + automated tickets = must-have
2. **AI Deep Research** - multi-step analysis operacyjny (post-patrol analysis)
3. **Smart Knowledge Base** - operatorzy moga przeszukiwac procedury security w natural language
4. **API/SDK extensibility** - zeby partnerzy budowali integracje

---

### B. InOrbit.AI - Agresywny challenger

**Profil:** $10M Series A (wrzesien 2025) | Freemium | Mountain View, CA

**Co maja (aktualne na 2026):**

| Capability                         | Status               | Nasz odpowiednik      |
| ---------------------------------- | -------------------- | --------------------- |
| Heterogeneous Fleet Orchestration  | Production           | Single-fleet          |
| **Agentic AI** (nowe!)             | z Globant Ventures   | AI Chat basic         |
| **RobOps Copilot** (NLP queries)   | Production           | AI Chat               |
| **Space Intelligence**             | Spatial computing    | Brak                  |
| RTLS (robots + forklifts + people) | Yes                  | No                    |
| Mission Management                 | Multi-vendor traffic | No                    |
| NVIDIA Isaac Sim simulation        | Yes                  | Isaac Sim osobno      |
| WMS/ERP integration                | Yes                  | No                    |
| Cameras + doors + IIoT             | Fixed infrastructure | No                    |
| VDA 5050 + MassRobotics standard   | Interoperability     | No                    |
| Free tier (unlimited robots!)      | Yes                  | Self-hosted = darmowy |

**Klienci referencyjni:** Colgate-Palmolive, Genentech - to enterprise validation.

**Ich kierunek:** "Software-defined orchestration of smart robots, vehicles, software and equipment" - Agentic AI + Space Intelligence + enterprise integration.

**ZAGROZENIE:** Ich free tier z unlimited robots to killer pricing. Agentic AI z Globant to powazne AI capabilities. Space Intelligence (spatial computing) to unikalna funkcja. Jesli dodadza security vertical, free tier + enterprise klienci = niebezpieczne.

**Nasze przewagi nad InOrbit:**

| My lepsi                               | Dlaczego                            |
| -------------------------------------- | ----------------------------------- |
| Self-hosted                            | InOrbit = tylko SaaS                |
| Full code access                       | InOrbit = zamkniety                 |
| Security-specialized UX                | InOrbit = warehouse/logistics focus |
| 3D LiDAR (Three.js)                    | InOrbit = ograniczone viz           |
| WebRTC video + binary fallback         | InOrbit = basic teleoperation       |
| Command & control (joystick, Nav2)     | InOrbit = mission-based             |
| Performance (Bun, MessagePack, Canvas) | InOrbit = standard web              |
| Cost transparency                      | InOrbit premium = $3K/mo            |

**Co powinnismy zaadaptowac z InOrbit:**

1. **Space Intelligence concept** - spatial awareness (robot + cameras + doors) w jednym view
2. **RTLS integration** - sledzenie ludzi obok robotow (security use case!)
3. **Interoperability standards** - VDA 5050 / MassRobotics support dla multi-vendor
4. **Simulation bridge** - Isaac Sim integration (mamy EC2, potrzebujemy bridge do dashboardu)

---

### C. dimensionalOS (dimos) - Wild card

**Profil:** YC SAFE | v0.0.5 alpha | Apache 2.0 | 1,347 followers X

**Co maja (aktualne na 2026):**

| Capability                  | Status                       | Nasz odpowiednik    |
| --------------------------- | ---------------------------- | ------------------- |
| **AI Agent System**         | OpenAI, Claude, HF agents    | Vision LLM, AI Chat |
| **Skills Architecture**     | Agents -> robot primitives   | Direct control      |
| **Multi-agent types**       | OpenAI, Claude, Planning, HF | Single LLM          |
| **MCP (experimental)**      | Experimental                 | Brak                |
| Natural language control    | Core feature                 | AI Chat             |
| ROS 2 native                | Yes                          | Yes                 |
| Reactive Streams (RxPY)     | Yes                          | Socket.IO           |
| Multi-robot support         | Unitree primary              | Go2 primary         |
| Simulation (Genesis, Isaac) | Yes                          | Isaac osobno        |
| Web Dashboard               | 3 fragmenty prototypow       | Production-grade    |
| Manipulation (arms)         | OMPL, IK, GraspNet           | Nie w scope         |

**Repo zmieniony:** Glowne repo teraz to `dimos-unitree` (agentive AI na Unitree Go2).

**Ich kierunek:** "Universal robotics framework" - AI agents -> robot skills -> hardware. Agent-first architecture z wieloma LLM backend.

**ZAGROZENIE:** Ich agent-first architecture jest przyszlosciowa. Jesli doroja (z v0.0.5 -> v1.0) i zbuduja porzadny dashboard, lacza AI agents + robot control w sposob, ktory my nie mamy. Ale: alpha quality, Python-only, fragmentaryczny web UI, mala community.

**Nasze przewagi nad dimos:**

| My lepsi                  | Dlaczego                                     |
| ------------------------- | -------------------------------------------- |
| Production-ready          | dimos = v0.0.5 alpha, breaking changes       |
| Unified web dashboard     | dimos = 3 fragmenty (Svelte + React + Flask) |
| TypeScript end-to-end     | dimos = Python-only                          |
| Performance benchmarks    | dimos = brak benchmarks                      |
| Deployment story (Docker) | dimos = local only                           |
| Security UX               | dimos = generic                              |
| Tests (Jest + Playwright) | dimos = basic unittest                       |
| Documentation             | dimos = minimal                              |

**Co powinnismy zaadaptowac z dimos:**

1. **Skills Architecture** - abstrakcja robot -> skills -> agent. Pozwala AI agentom bezpiecznie wywolywac operacje (navigate, patrol, stop)
2. **Multi-agent backends** - obsluga wielu LLM (OpenAI, Claude, local HF) z jednym interfejsem
3. **MCP server** - dimos ma experimental, my powinnismy zrobic production-grade jako pierwsi
4. **Reactive streams pattern** - ich RxPY pattern jest elegancki, ale my mamy Zustand + Socket.IO co jest prostsze

---

### D. Rerun.io - Technologiczny potentat

**Profil:** $20.2M funding (seed) | 19K+ GitHub stars | MIT/Apache 2.0 | Rust-native

**Co maja (aktualne na 2026, v0.28.2 / v0.29.0rc2):**

| Capability                               | Status                  | Nasz odpowiednik           |
| ---------------------------------------- | ----------------------- | -------------------------- |
| **Rust-native viewer** (wgpu)            | Ekstremalnie wydajny    | React + Three.js + Canvas  |
| **H.264 streaming video** (0.24+)        | Nowe! Real-time capable | WebRTC + binary            |
| **ROS 2 MCAP reflection** (0.26+)        | Nowe! Automatic         | rosbridge                  |
| **Coordinate frame hierarchies** (0.27+) | Nowe! tf2-like          | Brak                       |
| Multi-language SDK (Python, Rust, C++)   | Yes                     | TypeScript only            |
| Time-aware queries                       | Core feature            | Brak                       |
| Blueprints (programmable layouts)        | Yes                     | React Grid Layout          |
| Point clouds (miliony pts)               | Rust GPU                | 100K GPU-safe              |
| 3D scenes                                | wgpu/WebGPU             | Three.js                   |
| Data export (Pandas/Polars/DuckDB)       | Yes                     | No                         |
| Web viewer (WASM)                        | Ale tool, nie dashboard | Native web dashboard       |
| Data Platform (commercial)               | Teams, cloud storage    | No                         |
| Command & control                        | No                      | Yes                        |
| Fleet management                         | No                      | Yes                        |
| Security UX                              | No                      | Yes                        |
| Real-time dashboard                      | No (visualization tool) | Yes (operations dashboard) |

**Uzytkownicy referencyjni:** HuggingFace LeRobot, Meta Project Aria, Ultra Robotics, NVIDIA PyCuVSLAM.

**Kluczowe nowe feature (0.24-0.28):**

- **Streaming H.264 video** - real-time encoded video logging (od v0.24)
- **Reflection-based ROS 2 MCAP** - automatyczne parsowanie typow ROS (v0.26)
- **Coordinate frames** - tf2-like system z `CoordinateFrame` + `Transform3D` (v0.27)
- Te trzy zmiany zblizaja Rerun do real-time operations

**ZAGROZENIE:** Rerun systematycznie dodaje capabilities zblizajace sie do real-time: streaming video, ROS 2 reflection, coordinate frames. Jesli dodadza fleet view + command & control + web-native dashboard, ich 19K star community + Rust performance + $20M funding to powazna konkurencja. ALE: nadal skupieni na devtool/SDK, nie operations dashboard.

**Nasze przewagi nad Rerun:**

| My lepsi                           | Dlaczego                            |
| ---------------------------------- | ----------------------------------- |
| Operations dashboard (nie devtool) | Rerun = narzedzie deweloperskie     |
| Real-time <100ms latency           | Rerun = optymalizowany pod nagrania |
| Command & control                  | Rerun = brak (pure viz)             |
| Fleet view                         | Rerun = single-robot focus          |
| Web-native (pure Next.js)          | Rerun = WASM viewer (ograniczony)   |
| TypeScript end-to-end              | Rerun = brak JS/TS SDK              |
| Self-hosted deployment             | Rerun = local only                  |
| Security UX                        | Rerun = brak                        |
| Mobile/tablet                      | Rerun = desktop focus               |

**Co powinnismy zaadaptowac z Rerun:**

1. **Coordinate frame system** - tf2-like transforms (ROS -> dashboard). Ulatwia multi-sensor fusion viz
2. **Time-aware replay** - ich core competency. Kluczowe dla security audit/replay mode
3. **Data export** - Pandas/Polars/DuckDB integration dla post-patrol analytics
4. **Streaming H.264 pattern** - ich podejscie do real-time encoded video moze inspirowac nasz pipeline

---

## Podsumowanie: Mapa zagrozen i odpowiedzi

```
ZAGROZENIE              PRAWDOP.  IMPACT    NASZA ODPOWIEDZ
-------------------------------------------------------------
Formant dodaje          Srednie   KRYTYCZNY -> RBAC + Incident Mgmt
  security vertical                           (feature parity enterprise)

InOrbit free tier       Wysokie   SREDNI    -> Open source release
  wygrywa adopcje                             (community counter)

dimos dojrzewa i        Niskie    SREDNI    -> MCP production-grade
  buduje dashboard                            + Skills architecture

Rerun dodaje            Niskie    WYSOKI    -> Replay Mode + Time-aware
  real-time dashboard                          queries (nasz domain)
```

## Strategiczny action plan vs kazdy konkurent

**vs Formant:** Buduj enterprise features (RBAC, SSO, Incident Mgmt) ale podkreslaj self-hosted + $0 + security UX. Ich pricing jest ich slaboscia.

**vs InOrbit:** Wyprzedz z open source + community. Ich free tier jest grozny, ale nasz self-hosted + full code access jest silniejszy dla security (compliance wymaga kontroli danych).

**vs dimos:** Wyprzedz z production-grade MCP server i Skills-like agent architecture. Ich alpha quality daje nam czas, ale ich architektura jest inspirujaca.

**vs Rerun:** Nie konkuruj na performance rendering (Rust zawsze wygra). Zamiast tego buduj operations workflow: replay dla security audit, incident management, fleet coordination. To co Rerun nie ma i nie planuje.

---

## ANALIZA RYZYK I MITYGACJE

### Matryca ryzyk (prawdopodobienstwo x impact)

```
                    NISKI IMPACT    SREDNI IMPACT     WYSOKI IMPACT     KRYTYCZNY
                    ------------------------------------------------------------------
WYSOKIE PRAWD.  |                  | R3 InOrbit     |                 |
                |                  |   free tier    |                 |
                |                  |                |                 |
SREDNIE PRAWD.  |                  | R5 Tech debt   | R1 Formant     | R8 Brak
                |                  | R6 Single-robot|   security     |   monetyzacji
                |                  |                |                 |
NISKIE PRAWD.   | R7 Open-RMF     | R4 dimos       | R2 Rerun       |
                |   catches up    |   dojrzewa     |   real-time    |
                |                  |                |   dashboard    |
```

---

### R1: Formant dodaje security vertical

- **Prawdopodobienstwo:** Srednie (maja $45M ale focus na generic fleet)
- **Impact:** WYSOKI - moga zabrac enterprise security klientow
- **Timeline:** 6-12 miesiecy (budowa vertical wymaga czasu)
- **Sygnaly ostrzegawcze:**
  - Blog post o security robotics
  - Partnership z firma security (np. Knightscope, Cobalt Robotics)
  - Nowy "Security Module" w product changelog
  - Hiring: "Security Robotics Product Manager" na LinkedIn
- **Mitygacja:**
  1. **Wyprzedz z RBAC + Incident Management** (Q1 2026) - zbuduj enterprise-ready security stack zanim Formant sie obudzi
  2. **Pogleb domain expertise** - dark tactical UX, patrol optimization, security-specific workflows. Formant zbuduje generic, my deep
  3. **Buduj community** - open source release przed ich security vertical. Community lock-in jest silniejszy niz feature lock-in
- **Contingency (jesli Formant wejdzie):**
  - Pivot na **self-hosted + compliance** narrative ("Formant ma twoje dane, my nie")
  - Celuj w **mid-market** (10-100 robotow) gdzie Formant enterprise pricing nie ma sensu
  - **White-label/OEM** - sprzedawaj producentom robotow security, nie bezposrednio end-users

### R2: Rerun buduje real-time operations dashboard

- **Prawdopodobienstwo:** Niskie (ich DNA to devtool/SDK, nie operations)
- **Impact:** WYSOKI - 19K stars community + $20M + Rust performance
- **Timeline:** 12-18 miesiecy (wymaga fundamentalnej zmiany kierunku)
- **Sygnaly ostrzegawcze:**
  - "Dashboard" lub "Operations" w release notes
  - Nowy produkt "Rerun Dashboard" lub "Rerun Fleet"
  - TypeScript/JavaScript SDK announcement
  - Hiring: "Frontend Engineers" zamiast tylko Rust
- **Mitygacja:**
  1. **Nie konkuruj na rendering** - Rust+wgpu zawsze wygra vs Three.js. Nasz moat to operations workflow, nie viz performance
  2. **Buduj Replay Mode** inspirowany Rerun ale dla security audit (ich core competency zaadaptowana do naszego domain)
  3. **Integruj Rerun SDK** zamiast konkurowac - oferuj opcjonalny Rerun viewer jako zaawansowana 3D viz obok naszego dashboardu
- **Contingency (jesli Rerun zbuduje dashboard):**
  - Rerun dashboard bedzie generic (robotics/CV/AI). Nasz security focus + operations workflow to niekopiowalna przewaga
  - Rozwaz **partnership** - Rerun viz + nasz operations layer

### R3: InOrbit free tier wygrywa adopcje

- **Prawdopodobienstwo:** Wysokie (free tier jest bardzo atrakcyjny)
- **Impact:** SREDNI (ich focus to warehouse/logistics, nie security)
- **Timeline:** Juz trwa - Colgate-Palmolive i Genentech to validacja
- **Sygnaly ostrzegawcze:**
  - Security-focused case study na ich stronie
  - Partnership z producentem robotow security
  - "Security operations" w marketing copy
- **Mitygacja:**
  1. **Open source release** - nasz odpowiednik free tier, ale lepszy (self-hosted = pelna kontrola)
  2. **Security compliance narrative** - "InOrbit ma twoje dane w chmurze. Security operations wymagaja kontroli danych"
  3. **Community engagement** - Discord, GitHub issues, blog o security robotics
- **Contingency:**
  - InOrbit jest SaaS-only. Wiele firm security **nie moze** wysylac danych do chmury (compliance). To nasz natural moat

### R4: dimensionalOS dojrzewa

- **Prawdopodobienstwo:** Niskie (v0.0.5, Python-only, fragmentaryczny web UI)
- **Impact:** SREDNI - agent-first architecture jest inspirujaca
- **Timeline:** 12-24 miesiace (przejscie z alpha do production wymaga ogromnej pracy)
- **Sygnaly ostrzegawcze:**
  - v1.0 release
  - TypeScript SDK lub unified web dashboard
  - Powyzej 500 GitHub stars
  - Enterprise deployment announcement
- **Mitygacja:**
  1. **Zaadaptuj ich najlepsze idee** teraz (Skills Architecture, MCP, Multi-agent) zanim doroja
  2. **Production-grade MCP** - zbuduj to co oni maja experimental, ale production-ready
  3. **TypeScript end-to-end** to nasz moat - dimos jest Python-only, web jest naszym terytorium
- **Contingency:**
  - Jesli doroja, ich Python framework nie zagrozi naszemu TypeScript web dashboard
  - Rozwaz integracje: dimos backend + nasz dashboard frontend

### R5: Dlug techniczny spowalnia development

- **Prawdopodobienstwo:** Srednie
- **Impact:** SREDNI - blokuje velocity dodawania nowych featur
- **Timeline:** Trwa (use-websocket.ts 1,016 LOC, rosbridge/client.ts 1,645 LOC)
- **Znane problemy:**
  - `use-websocket.ts` (1,016 LOC) - potrzebuje podzialu
  - `rosbridge/client.ts` (1,645 LOC) - dalszy split
  - Dashboard vs Tab store duplikacja
  - Store subscription granularity (cale stores vs selektory)
- **Mitygacja:**
  1. **Refaktoryzacja co sprint** - 20% czasu na tech debt
  2. **Priorytet: use-websocket.ts** - ten plik dotyka kazdej nowej featury
  3. **E2E testy przed refaktorem** - Playwright configured, trzeba napisac testy
- **Contingency:**
  - Jesli tech debt rosnie: dedykowany sprint na refaktoryzacje przed kolejna faza featur

### R6: Single-robot / single-vendor lock-in

- **Prawdopodobienstwo:** Srednie (Go2 jako primary platform)
- **Impact:** SREDNI - ogranicza TAM (Total Addressable Market)
- **Timeline:** Staly (architektura jest Go2-centric)
- **Mitygacja:**
  1. **Abstrakcja robot interface** - wydziel Go2-specific logic za generic interface
  2. **Dodaj drugi robot** (np. Spot, Turtlebot4) jako proof of multi-vendor
  3. **ROS 2 abstraction** - komunikacja przez standardowe ROS 2 topics, nie proprietary API
- **Contingency:**
  - Jesli klient wymaga innego robota: ROS 2 Bridge jest protocol-agnostic, dodanie nowego robota wymaga glownie konfiguracji

### R7: Open-RMF catches up z nowoczesnym stackiem

- **Prawdopodobienstwo:** Niskie (legacy React, duza organizacja = wolna zmiana)
- **Impact:** NISKI (ich focus to fleet interop, nie single-vendor security)
- **Mitygacja:** Monitoruj rmf-web repo na GitHub. Jesli przepisza na Next.js, zwroc uwage.

### R8: Brak monetyzacji / sustainability

- **Prawdopodobienstwo:** Srednie
- **Impact:** KRYTYCZNY - bez revenue projekt umiera
- **Timeline:** 6-12 miesiecy (okno zanim skoncza sie zasoby)
- **Sciezki monetyzacji (od najprostszej):**
  1. **Consulting/deployment** - instalacja + konfiguracja u klienta ($$$)
  2. **SaaS hosted version** - jak Foxglove Free->Starter->Team
  3. **Enterprise license** - RBAC + SSO + audit + support
  4. **White-label/OEM** - SDK/dashboard dla producentow robotow
  5. **Training/certification** - szkolenia z security robotics
- **Mitygacja:**
  1. **MVP revenue** - zacznij od consulting/deployment (zero product changes needed)
  2. **Freemium model** - open source core + paid enterprise (RBAC, SSO, audit, support)
  3. **Pilot z 1-2 klientami** - walidacja pricing przed skalowaniem
- **Contingency:**
  - Jesli brak revenue po 6 miesiacach: pivot na white-label (B2B2C zamiast B2C)

---

### Timeline zagrozen

```
2026 Q1 (teraz)    Q2              Q3              Q4         2027
---------------------------------------------------------------------
FORMANT: Obserwuj   Moze oglosic    Security        Enterprise
         blog/hiring security plans  module beta     deployment

INORBIT: Free tier  Agentic AI      Moze security   RTLS +
         rosnie     production      case study      security?

DIMOS:   v0.0.5     v0.1? v0.2?    Nadal alpha     Moze v1.0
         alpha      bounty program  prawdopodobnie  jesli funding

RERUN:   v0.29      v0.30-31       H.264+ROS2      Dashboard?
         streaming  nowe features   mature          Malo prawdop.

NAS:     MsgPack+   RBAC + PWA     Incident Mgmt   Replay + CCTV
ROADMAP: WebRTC     MCP + OSS      AI Patrol Opt   Multi-tenant
```

---

### Scenariusze worst-case i response

**Scenariusz 1: "Formant Security Edition" launch (prawdop. 15%)**
-> Response: Natychmiast podkresl self-hosted + $0 + open source. Celuj w mid-market i compliance-heavy klientow. Formant SaaS nie moze obsluzyc klientow wymagajacych on-prem danych.

**Scenariusz 2: Rerun dodaje "Fleet Dashboard" (prawdop. 5%)**
-> Response: Nie konkuruj na viz. Buduj operations workflow (incident mgmt, patrol optimization, replay audit). Rozwaz integracje Rerun jako advanced viz option.

**Scenariusz 3: InOrbit obniza premium do $0 (prawdop. 20%)**
-> Response: Ich $0 = SaaS z danymi w chmurze. Nasz $0 = self-hosted z pelna kontrola. Dla security ops kontrola danych > darmowy SaaS.

**Scenariusz 4: Nowy gracz z $50M+ funding w security robotics (prawdop. 10%)**
-> Response: First-mover advantage + community + open source. Nowy gracz potrzebuje 12-18 miesiecy zeby dogonic. Przyspiesz adoption.

---

### Kluczowe early warning indicators (monitoruj co tydzien)

1. **Formant blog** (formant.io/blog) - nowe posty o security
2. **InOrbit changelog** - nowe features security-related
3. **dimos GitHub** (stars, releases, contributors count)
4. **Rerun releases** (github.com/rerun-io/rerun/releases) - "dashboard", "fleet", "operations" keywords
5. **LinkedIn hiring** - Formant/InOrbit szukaja "Security Robotics" people
6. **Funding announcements** - nowy gracz w security robotics space
7. **ROS Discourse** - dyskusje o security robot dashboards

---

## Zrodla

- [Formant Platform](https://formant.io/product/platform/)
- [Formant Blog - 2025 Predictions](https://formant.io/blog/4-robotics-predictions-for-2025/)
- [InOrbit $10M Series A](https://roboticsandautomationnews.com/2025/09/30/inorbit-ai-secures-10-million-series-a-funding-to-scale-robot-orchestration-platform/95063/)
- [InOrbit Overview](https://www.inorbit.ai/overview)
- [dimensionalOS/dimos-unitree](https://github.com/dimensionalOS/dimos-unitree)
- [Rerun Releases](https://github.com/rerun-io/rerun/releases)
- [Rerun 0.24 - Streaming Video](https://rerun.io/blog/release-0.24)
- [Rerun Deep Dive - Skywork AI](https://skywork.ai/skypage/en/Rerun.io-My-Deep-Dive-into-the-Go-To-Visualizer-for-Physical-AI/1975249775198138368)

---

_Dokument wygenerowany: 2026-02-02_
_Wersja: 1.0_
_Zawiera: Priorytetyzacja featur, deep-dive 4 konkurentow, 8 ryzyk z mitygacjami_

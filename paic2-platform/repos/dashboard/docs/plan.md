# Plan Implementacji: Nawigacja MAP 2D + Autoscan 3D

**Data:** 2026-01-28
**Status:** Faza Planowania (Planner)
**Bazuje na:** `docs/research-summary.md`

---

## Przegląd

Plan podzielony na dwa równoległe tory pracy:

| Tor       | Cel                                | Priorytet |
| --------- | ---------------------------------- | --------- |
| **TOR A** | Nawigacja MAP 2D - Click-to-Move   | Wysoki    |
| **TOR B** | Autoscan 3D - Estetyka Point Cloud | Średni    |

**Aktualna sytuacja:**

- ✅ Nawigacja działa (Nav2 Action Interface)
- ✅ Autoscan działa (`socket.emit('start_slam')`)
- ⚠️ UX wymaga poprawy (minimalistyczne wskaźniki)
- ⚠️ Wizualizacja 3D wymaga dopracowania (głębia, cieniowanie)

---

## TOR A: Nawigacja MAP 2D

### A1. Weryfikacja Subskrypcji Mapy ✅

**Cel:** Upewnić się, że mapa jest czytelna i prawidłowo zorientowana (rzut z góry).

**Status:** Już działa - `OccupancyGridCanvas.tsx` obsługuje:

- `/map` - główna mapa SLAM
- `/global_costmap/costmap` - globalna costmapa
- `/local_costmap/costmap` - lokalna costmapa

**Pliki do weryfikacji:**
| Plik | Ścieżka | Akcja |
|------|---------|-------|
| OccupancyGridCanvas | `apps/web-client/components/widgets/map2d/OccupancyGridCanvas.tsx` | Weryfikacja orientacji |
| costmap-store | `apps/web-client/lib/stores/costmap-store.ts` | Weryfikacja subskrypcji |

**Checklist:**

- [ ] Mapa poprawnie zorientowana (Y-up w koordinatach mapy → Y-down na ekranie)
- [ ] Rozdzielczość wyświetlana poprawnie
- [ ] Origin mapy prawidłowo offsetowany

---

### A2. Ożywienie Click-to-Move ✅

**Cel:** Użytkownik klika na mapę, robot jedzie do celu.

**Status:** Już działa - pełny przepływ:

```
Click → GoalClickHandler → path-store → websocket-store → Backend → Nav2 Action
```

**Pliki (weryfikacja):**
| Plik | Ścieżka | Odpowiedzialność |
|------|---------|------------------|
| GoalClickHandler | `apps/web-client/components/widgets/map2d/GoalClickHandler.tsx` | Przechwycenie kliknięcia |
| path-store | `apps/web-client/lib/stores/path-store.ts` | Zarządzanie celem |
| websocket-store | `apps/web-client/lib/stores/websocket-store.ts` | Wysłanie `set_goal_pose` |
| rosbridge/client | `apps/websocket-server/src/handlers/rosbridge/client.ts` | Nav2 Action Goal |

**Checklist:**

- [ ] Kliknięcie na mapę ustawia cel
- [ ] Dialog wyboru kierunku (theta) wyświetla się
- [ ] Cel wysyłany do Nav2
- [ ] Feedback nawigacji odbierany

---

### A3. UI: Minimalistyczny Wskaźnik Celu 🔧

**Cel:** Redesign wskaźnika celu - minimalistyczny, nowoczesny styl.

**Obecny stan:**

- Pulsujący pierścień (neon magenta/cyan)
- Strzałka kierunku
- Zbyt duży i "krzykliwy"

**Propozycja nowego designu:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      NOWY GOAL MARKER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stan: PENDING (kliknięcie, przed potwierdzeniem kierunku)      │
│  ┌───┐                                                          │
│  │ ✕ │  Subtelny krzyżyk (crosshair) + delikatna poświata       │
│  └───┘  Kolor: rgba(255, 255, 255, 0.8)                        │
│                                                                 │
│  Stan: NAVIGATING (robot jedzie)                                │
│  ┌───┐                                                          │
│  │ ◎ │  Koncentryczne koła (ripple effect) - subtelna animacja │
│  └───┘  Kolor: rgba(0, 255, 255, 0.6) - delikatny cyan         │
│         Pulsacja: wolniejsza, bardziej stonowana                │
│                                                                 │
│  Stan: REACHED (robot dotarł)                                   │
│  ┌───┐                                                          │
│  │ ✓ │  Check mark + fade out (1s)                             │
│  └───┘  Kolor: rgba(0, 255, 136, 0.8) - subtelny zielony       │
│                                                                 │
│  Stan: FAILED / CANCELED                                        │
│  ┌───┐                                                          │
│  │ ✗ │  X mark + fade out (1s)                                  │
│  └───┘  Kolor: rgba(255, 100, 100, 0.6) - stonowany czerwony   │
│                                                                 │
│  Kierunek (theta):                                              │
│  ┌───────┐                                                      │
│  │  ─→   │  Cienka linia (2px) wychodząca od środka            │
│  └───────┘  Długość: 20px, kolor: taki sam jak marker          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pliki do edycji:**

| Plik               | Ścieżka                                                           | Zmiany                  |
| ------------------ | ----------------------------------------------------------------- | ----------------------- |
| VisualizationLayer | `apps/web-client/components/widgets/map2d/VisualizationLayer.tsx` | Nowy `drawGoalMarker()` |

**Zadania implementacyjne:**

```typescript
// A3.1: Nowe stałe kolorów (minimalistyczne)
const COLORS = {
  goalPending: 'rgba(255, 255, 255, 0.8)', // Biały crosshair
  goalNavigating: 'rgba(0, 255, 255, 0.5)', // Subtelny cyan
  goalReached: 'rgba(0, 255, 136, 0.7)', // Stonowany zielony
  goalFailed: 'rgba(255, 100, 100, 0.5)', // Stonowany czerwony
  goalDirectionLine: 2, // Cienka linia
  goalMarkerSize: 8, // Mniejszy marker
  goalPulseSpeed: 0.002, // Wolniejsza pulsacja
}

// A3.2: Nowa funkcja drawGoalMarker() - minimalistyczny styl
function drawGoalMarker(ctx, x, y, status, theta, time) {
  const pos = mapToCanvas(x, y)
  const color = getGoalColor(status)

  ctx.save()
  ctx.shadowBlur = 4 // Subtelna poświata (nie 15!)
  ctx.shadowColor = color

  if (status === 'pending-click') {
    // Crosshair
    drawCrosshair(ctx, pos.x, pos.y, 10, color)
  } else if (status === 'navigating') {
    // Ripple effect (2 koncentryczne koła)
    const pulse = Math.sin(time * COLORS.goalPulseSpeed) * 0.3 + 0.7
    drawRipple(ctx, pos.x, pos.y, 8, 16 * pulse, color, pulse * 0.5)
  } else if (status === 'reached') {
    // Checkmark
    drawCheckmark(ctx, pos.x, pos.y, 8, color)
  } else {
    // X mark (failed/canceled)
    drawXmark(ctx, pos.x, pos.y, 8, color)
  }

  // Direction line (cienka, subtelna)
  if (theta !== undefined) {
    const lineLength = 20
    const endX = pos.x + Math.cos(theta) * lineLength
    const endY = pos.y - Math.sin(theta) * lineLength
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    ctx.lineTo(endX, endY)
    ctx.stroke()
  }

  ctx.restore()
}
```

**Checklist A3:**

- [ ] Zredukować rozmiar markera (8px zamiast 12px)
- [ ] Zmniejszyć shadowBlur (4px zamiast 15px)
- [ ] Spowolnić pulsację (0.002 zamiast 0.005)
- [ ] Stonować kolory (większa przezroczystość)
- [ ] Crosshair dla stanu "pending"
- [ ] Ripple effect dla stanu "navigating"
- [ ] Checkmark dla stanu "reached"
- [ ] Cienka linia kierunku (2px)

---

## TOR B: Autoscan 3D

### B1. Weryfikacja Triggera ✅

**Cel:** Przycisk "Auto Scan" wywołuje SLAM + Explore.

**Status:** Już działa:

```typescript
// LidarModule.tsx, linie 483-490
const handleToggleSlam = useCallback(() => {
  if (isSlamActive) {
    socket.emit('stop_mapping')
  } else {
    socket.emit('start_slam')
  }
}, [socket, isSlamActive])
```

**Pliki (weryfikacja):**
| Plik | Ścieżka | Akcja |
|------|---------|-------|
| LidarModule | `apps/web-client/components/widgets/LidarModule.tsx` | Weryfikacja buttonów |
| exploration-store | `apps/web-client/lib/stores/exploration-store.ts` | Weryfikacja stanu |

**Checklist:**

- [ ] Przycisk "Auto Scan" włącza SLAM
- [ ] Przycisk "Stop Scan" zatrzymuje SLAM
- [ ] Indicator "Mapping" pokazuje postęp
- [ ] Save/Load map działa

---

### B2. Wizualizacja 3D: Estetyka Point Cloud 🔧

**Cel:** Point cloud wygląda estetycznie - z głębią i cieniowaniem.

**Obecny stan:**

- Three.js `<pointsMaterial>` z `vertexColors`
- Kolorowanie oparte na wysokości (Z) i wieku punktu
- Brak efektów głębi poza perspektywą

**Propozycja ulepszeń:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ULEPSZENIA POINT CLOUD                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ATTENUATION (punkty dalej = mniejsze)                       │
│     ✅ Już włączone: sizeAttenuation: true                      │
│                                                                 │
│  2. DEPTH-BASED FOG (mgła odległości)                           │
│     Punkty dalej od kamery → bardziej przezroczyste            │
│     scene.fog = new THREE.Fog(0x000000, 5, 30)                  │
│                                                                 │
│  3. AMBIENT OCCLUSION (fałszywe cieniowanie)                    │
│     Punkty w zagłębieniach → ciemniejsze                        │
│     Wymaga analizy sąsiedztwa (kosztowne)                       │
│     → SKIP (zbyt kosztowne dla 100k punktów)                    │
│                                                                 │
│  4. POINT SIZE VARIATION                                        │
│     Nowsze punkty = większe, starsze = mniejsze                 │
│     Używamy już: size based on age factor                       │
│                                                                 │
│  5. GLOW EFFECT (post-processing)                               │
│     UnrealBloomPass z @react-three/postprocessing               │
│     Subtelny bloom dla neonowego efektu                         │
│                                                                 │
│  6. IMPROVED COLOR GRADIENT                                     │
│     Obecny: cyan-green (0.45-0.60 hue)                          │
│     Propozycja: viridis-like (purple → cyan → yellow)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pliki do edycji:**

| Plik        | Ścieżka                                              | Zmiany             |
| ----------- | ---------------------------------------------------- | ------------------ |
| LidarModule | `apps/web-client/components/widgets/LidarModule.tsx` | Fog, Bloom, kolory |

**Zadania implementacyjne:**

```typescript
// B2.1: Dodać fog do sceny (głębia)
// W komponencie Canvas (LidarModule.tsx)
<Canvas>
  <fog attach="fog" args={['#0a0a0a', 8, 35]} />
  {/* ... */}
</Canvas>

// B2.2: Dodać post-processing bloom (opcjonalne - może obciążać)
import { EffectComposer, Bloom } from '@react-three/postprocessing'

<EffectComposer>
  <Bloom
    luminanceThreshold={0.4}
    luminanceSmoothing={0.9}
    intensity={0.3}
  />
</EffectComposer>

// B2.3: Ulepszona paleta kolorów (viridis-like)
function getPointColor(normalizedZ: number, ageFactor: number): [number, number, number] {
  // Viridis-inspired: purple (0) → teal (0.5) → yellow (1)
  const t = normalizedZ

  // Purple to teal to yellow gradient
  const r = t < 0.5
    ? 0.2 + t * 0.3           // 0.2 → 0.35
    : 0.35 + (t - 0.5) * 1.3  // 0.35 → 1.0

  const g = t < 0.5
    ? 0.0 + t * 1.0           // 0.0 → 0.5
    : 0.5 + (t - 0.5) * 0.5   // 0.5 → 0.75

  const b = t < 0.5
    ? 0.4 + t * 0.4           // 0.4 → 0.6
    : 0.6 - (t - 0.5) * 1.0   // 0.6 → 0.1

  // Apply age factor (older = dimmer)
  const brightness = 0.4 + ageFactor * 0.6

  return [r * brightness, g * brightness, b * brightness]
}
```

**Checklist B2:**

- [ ] Dodać `<fog>` do Canvas (subtelna mgła odległości)
- [ ] Rozważyć Bloom post-processing (test wydajności)
- [ ] Ulepszyć gradient kolorów (viridis-like)
- [ ] Zwiększyć kontrast nowsze vs starsze punkty
- [ ] Przetestować na 50k+ punktów (wydajność)

---

## Podsumowanie Plików do Edycji

### Frontend (apps/web-client)

| Plik                                              | Tor | Priorytet | Zmiany                           |
| ------------------------------------------------- | --- | --------- | -------------------------------- |
| `components/widgets/map2d/VisualizationLayer.tsx` | A   | 🔴 Wysoki | Nowy minimalistyczny goal marker |
| `components/widgets/LidarModule.tsx`              | B   | 🟡 Średni | Fog, Bloom, paleta kolorów       |

### Pliki do weryfikacji (bez zmian)

| Plik                                               | Tor | Status    |
| -------------------------------------------------- | --- | --------- |
| `components/widgets/map2d/GoalClickHandler.tsx`    | A   | ✅ Działa |
| `components/widgets/map2d/OccupancyGridCanvas.tsx` | A   | ✅ Działa |
| `lib/stores/path-store.ts`                         | A   | ✅ Działa |
| `lib/stores/exploration-store.ts`                  | B   | ✅ Działa |

### Backend (bez zmian)

| Plik                                                     | Status                |
| -------------------------------------------------------- | --------------------- |
| `apps/websocket-server/src/handlers/rosbridge/client.ts` | ✅ Nav2 Action działa |

---

## Kolejność Implementacji

```
┌─────────────────────────────────────────────────────────────────┐
│                    KOLEJNOŚĆ TASKÓW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FAZA 1: Weryfikacja (30 min)                                   │
│  ├── A1: Sprawdzić orientację mapy                              │
│  ├── A2: Przetestować click-to-move                             │
│  └── B1: Przetestować Auto Scan                                 │
│                                                                 │
│  FAZA 2: TOR A - Goal Marker (1-2h)                             │
│  ├── A3.1: Refactor COLORS constants                            │
│  ├── A3.2: Nowy drawGoalMarker() - crosshair/ripple/check       │
│  ├── A3.3: Cienka linia kierunku                                │
│  └── A3.4: Testy wizualne                                       │
│                                                                 │
│  FAZA 3: TOR B - Point Cloud (1-2h)                             │
│  ├── B2.1: Dodać fog                                            │
│  ├── B2.2: Ulepszyć paletę kolorów                              │
│  ├── B2.3: (opcjonalnie) Bloom post-processing                  │
│  └── B2.4: Testy wydajności (50k+ punktów)                      │
│                                                                 │
│  FAZA 4: Code Review + Testy (30 min)                           │
│  └── Uruchomić code-reviewer agent                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ryzyka i Mitygacje

| Ryzyko              | Prawdopodobieństwo | Wpływ  | Mitygacja                                |
| ------------------- | ------------------ | ------ | ---------------------------------------- |
| Bloom obciąża GPU   | Średnie            | Niski  | Dodać toggle w UI                        |
| Fog zasłania punkty | Niskie             | Średni | Dostroić parametry (start: 8m, end: 35m) |
| Goal marker za mały | Niskie             | Niski  | Responsywny rozmiar (zależny od zoom)    |

---

## Definicja Sukcesu

### TOR A - Nawigacja

- [ ] Użytkownik klika na mapę → robot jedzie do celu
- [ ] Wskaźnik celu jest minimalistyczny i czytelny
- [ ] Feedback nawigacji widoczny (dystans, czas)
- [ ] Animacje są subtelne (nie rozpraszają)

### TOR B - Autoscan

- [ ] Przycisk "Auto Scan" uruchamia SLAM
- [ ] Point cloud ma efekt głębi (fog)
- [ ] Kolory są estetyczne (viridis-like gradient)
- [ ] Wydajność > 30 FPS przy 50k punktów

---

_Dokument wygenerowany przez Planner Agent_
_Gotowy do implementacji przez `/implement`_

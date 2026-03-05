# Autonomiczna Operacja - Jak System Działa Automatycznie

## Pytanie: Czy robot sam analizuje podczas eksploracji?

**Odpowiedź: TAK!** System działa **w pełni automatycznie** w tle.

---

## 🔄 Dwa Tryby Pracy

### 1. **AUTOMATYCZNA Analiza** (Działa Zawsze)

Memory systems (Temporal + Spatial) **automatycznie** analizują wszystko co robot widzi:

```
┌─────────────────────────────────────────────────────────┐
│  Robot jedzie i eksploruje                              │
│  ↓                                                       │
│  Kamera publikuje /camera/image_raw (automatycznie)     │
│  ↓                                                       │
│  Temporal Memory Node (subskrybuje automatycznie)       │
│  - Co 2s analizuje okno klatek                         │
│  - Wykrywa nowe obiekty                                │
│  - Śledzi relacje                                      │
│  - Zapisuje do Entity Graph DB                         │
│  ↓                                                       │
│  Spatial Memory Node (subskrybuje automatycznie)        │
│  - Sprawdza czy robot przejechał > 0.5m                │
│  - Jeśli tak, zapisuje klatkę + pozycję                │
│  - Generuje CLIP embedding                             │
│  - Dodaje do ChromaDB                                  │
│  ↓                                                       │
│  Bazy danych rosną automatycznie!                       │
└─────────────────────────────────────────────────────────┘
```

**NIE MUSISZ NIC ROBIĆ!** System sam buduje wiedzę.

### 2. **ZAPYTANIA** (Query) - Na Żądanie

Zapytania służą do **odczytania** tego co system już zapamiętał:

```bash
# Pytasz: "Co widziałeś?"
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What entities have you seen?'" --once

# System odpowiada na podstawie tego co już wie z automatycznej analizy
```

---

## 📊 Przykład: Robot Eksploruje Mieszkanie (Automatycznie)

### Scenariusz: Robot jedzie przez mieszkanie

```
t=0s: Robot w kuchni
├─ Kamera: publikuje obraz kuchni → /camera/image_raw
├─ Temporal Memory (automatycznie):
│  ├─ Odbiera obraz
│  ├─ Analizuje przez VLM
│  ├─ Wykrywa: [table_1, chair_1, cup_1, coffee_maker_1]
│  └─ Zapisuje do Entity Graph DB
├─ Spatial Memory (automatycznie):
│  ├─ Odbiera obraz + pozycję (x=0, y=0)
│  ├─ Generuje CLIP embedding
│  └─ Zapisuje do ChromaDB z metadatą "kitchen scene"
└─ Robot jedzie dalej...

t=10s: Robot w salonie (przejechał 3m)
├─ Kamera: publikuje obraz salonu
├─ Temporal Memory (automatycznie):
│  ├─ Wykrywa: [sofa_1, tv_1, person_1]
│  ├─ Wykrywa relację: "person_1 sits_on sofa_1"
│  └─ Zapisuje do Entity Graph DB
├─ Spatial Memory (automatycznie):
│  ├─ Sprawdza: dystans od ostatniego zapisu = 3m > 0.5m ✓
│  ├─ Zapisuje (x=3, y=0, "living room scene")
│  └─ Dodaje do ChromaDB
└─ Robot jedzie dalej...

t=20s: Robot widzi osobę pijącą kawę
├─ Temporal Memory (automatycznie):
│  ├─ Wykrywa relację: "person_1 holds cup_2"
│  ├─ Estymuje dystans: person_1 <--0.5m--> cup_2
│  ├─ Wykrywa semantic relation: "cup_2 goes_with coffee"
│  └─ Zapisuje wszystko do Entity Graph DB
└─ Robot jedzie dalej...

t=300s: Po 5 minutach eksploracji
├─ Entity Graph DB zawiera:
│  ├─ 15 entities (osoby, obiekty, meble)
│  ├─ 30 relations (kto co robi)
│  ├─ 20 distances (odległości)
│  └─ 10 semantic relations (co z czym pasuje)
└─ ChromaDB zawiera:
   ├─ 25 zapisanych klatek
   ├─ Z pozycjami (x, y)
   └─ Z CLIP embeddings
```

**Wszystko dzieje się AUTOMATYCZNIE!**

Robot nie musi nic robić - tylko jeździć i patrzeć.

---

## 🎯 Kiedy Używać Zapytań?

Zapytania używasz gdy **potrzebujesz informacji** z pamięci:

### Przykład 1: Znajdź Zgubiony Obiekt

```bash
# Robot eksplorował przez 10 minut (pamięć budowała się automatycznie)

# Teraz pytasz:
ros2 topic pub /memory/query std_msgs/String \
  "data: 'Where did I last see my keys?'" --once

# System odpowiada na podstawie automatycznie zebranej wiedzy:
# "You saw keys_1 on table_1 in the kitchen at position (0.5, 0.2)"
```

### Przykład 2: Nawigacja Semantyczna

```bash
# Robot eksplorował (pamięć budowała się automatycznie)

# Teraz chcesz jechać do kuchni:
ros2 topic pub /spatial_memory/query_text std_msgs/String \
  "data: 'kitchen'" --once

# System zwraca pozycję na podstawie automatycznie zapisanych klatek:
# PoseStamped: (x=0.5, y=0.2)

# Możesz użyć tej pozycji do nawigacji
```

### Przykład 3: Monitoring Aktywności

```bash
# Robot eksplorował (pamięć budowała się automatycznie)

# Pytasz co się dzieje:
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What is person_1 doing?'" --once

# System odpowiada na podstawie automatycznie śledzonych relacji:
# "person_1 is sitting on sofa_1 and watching tv_1"
```

---

## 🚀 Autonomiczna Eksploracja - Kompletny Przykład

### Setup: 3 Nody Działają Razem

```bash
# Terminal 1: Temporal Memory (automatyczna analiza)
ros2 launch dimos_vlm_bridge temporal_memory.launch.py

# Terminal 2: Spatial Memory (automatyczna analiza)
ros2 launch dimos_vlm_bridge spatial_memory.launch.py

# Terminal 3: Autonomous Explorer (tylko jeździ)
ros2 run dimos_vlm_bridge autonomous_explorer
```

### Co się dzieje:

```
Autonomous Explorer:
├─ Jedzie losowo po środowisku
├─ Publikuje /cmd_vel (sterowanie)
└─ Co 30s sprawdza co system zapamiętał (opcjonalnie)

Temporal Memory (w tle):
├─ Subskrybuje /camera/image_raw
├─ Co 2s analizuje okno klatek
├─ Wykrywa entities, relations, distances
├─ Zapisuje do Entity Graph DB
└─ Publikuje /temporal_memory/entities (roster)

Spatial Memory (w tle):
├─ Subskrybuje /camera/image_raw + /odom
├─ Sprawdza czy robot przejechał > 0.5m
├─ Jeśli tak, zapisuje klatkę + embedding
└─ Dodaje do ChromaDB
```

**Robot jedzie, system uczy się automatycznie!**

---

## 🔍 Monitoring Automatycznej Analizy

Możesz **podglądać** co system robi (ale nie musisz):

### 1. Monitoruj Entity Roster (Automatycznie Publikowany)

```bash
# Temporal Memory automatycznie publikuje roster co 5s
ros2 topic echo /temporal_memory/entities

# Output (JSON):
# {
#   "count": 8,
#   "entities": [
#     {"id": "person_1", "type": "person", "descriptor": "person in blue shirt"},
#     {"id": "table_1", "type": "furniture", "descriptor": "wooden table"},
#     ...
#   ]
# }
```

### 2. Sprawdź Statystyki Bazy Danych

```bash
# Zapytaj o statystyki
ros2 service call /temporal_memory_node/get_stats std_srvs/srv/Trigger

# Output:
# {
#   "stats": {
#     "entities": 15,
#     "relations": 30,
#     "distances": 20,
#     "semantic_relations": 10
#   }
# }
```

### 3. Sprawdź Spatial Memory

```bash
ros2 service call /spatial_memory_node/get_stats std_srvs/srv/Trigger

# Output:
# {
#   "total_frames_stored": 45,
#   "total_frames_processed": 120,
#   "visual_memory_size": 45
# }
```

---

## ⚙️ Konfiguracja Automatycznej Analizy

### Temporal Memory - Częstotliwość Analizy

```yaml
# config/temporal_memory.yaml
temporal_memory_node:
  ros__parameters:
    fps: 1.0          # Analizuj 1 klatkę/sekundę
    window_s: 2.0     # Okno 2-sekundowe
    stride_s: 2.0     # Nowe okno co 2s
    
    # Więcej klatek = więcej kosztów VLM
    # Mniej klatek = mniej szczegółów
```

**Koszt:** 1 FPS, stride 2s = 30 okien/min = ~$0.30/min z GPT-4V

### Spatial Memory - Próg Zapisu

```yaml
# config/spatial_memory.yaml
spatial_memory_node:
  ros__parameters:
    min_distance_threshold: 0.5   # Zapisz gdy robot przejechał > 0.5m
    min_time_threshold: 1.0       # I minęła > 1s
    
    # Większy threshold = mniej zapisów = mniejsza baza
    # Mniejszy threshold = więcej zapisów = większa baza
```

---

## 🎓 Podsumowanie

### ✅ AUTOMATYCZNE (Nie Musisz Nic Robić)

1. **Temporal Memory**:
   - Analizuje obrazy co 2s
   - Wykrywa entities, relations, distances
   - Zapisuje do Entity Graph DB
   - Publikuje entity roster co 5s

2. **Spatial Memory**:
   - Sprawdza pozycję robota
   - Zapisuje klatki gdy robot się rusza
   - Generuje CLIP embeddings
   - Dodaje do ChromaDB

### 🔍 ZAPYTANIA (Gdy Potrzebujesz Informacji)

1. **Temporal Queries**:
   ```bash
   "What entities are visible?"
   "What happened in the last 30 seconds?"
   "What is person_1 doing?"
   ```

2. **Spatial Queries**:
   ```bash
   "kitchen"
   "living room"
   "person in blue shirt"
   ```

3. **Combined Queries**:
   ```bash
   "Where did I last see my keys?"
   "What was I doing in the kitchen?"
   ```

---

## 🚀 Quick Start - Autonomiczna Eksploracja

```bash
# 1. Start memory systems (automatyczna analiza)
ros2 launch dimos_vlm_bridge temporal_memory.launch.py &
ros2 launch dimos_vlm_bridge spatial_memory.launch.py &

# 2. Start camera
ros2 run usb_cam usb_cam_node_exe &

# 3. Jedź (ręcznie lub autonomicznie)
ros2 run teleop_twist_keyboard teleop_twist_keyboard

# System automatycznie buduje wiedzę podczas jazdy!

# 4. Po kilku minutach, zapytaj co zapamiętał:
ros2 topic pub /temporal_memory/query std_msgs/String \
  "data: 'What have you learned?'" --once

ros2 topic echo /temporal_memory/result
```

**To wszystko!** System działa automatycznie, zapytania są opcjonalne.

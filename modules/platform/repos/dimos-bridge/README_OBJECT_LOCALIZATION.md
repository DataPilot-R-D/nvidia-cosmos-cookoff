# Object Localization Node - Quick Start

## Opis

Nowy node ROS2 `object_localization_node` łączy:
- **Vision LLM** - wykrywanie obiektów na obrazie z kamery z bounding boxami
- **LIDAR** - wyznaczanie pozycji 3D wykrytych obiektów
- **Baza danych SQLite** - przechowywanie wykrytych obiektów z timestampem, pozycją robota i pozycją obiektu

## Główne funkcje

✅ Wykrywanie obiektów przez VLM z bounding boxami  
✅ Projekcja bounding boxów na chmurę punktów LIDAR  
✅ Wyznaczanie pozycji 3D obiektów w układzie mapy  
✅ Zapisywanie do bazy: timestamp, nazwa obiektu, pozycja robota, pozycja obiektu  
✅ Konfigurowalny interwał detekcji  
✅ Wsparcie dla różnych backendów VLM (Moondream, OpenAI, Qwen, **NVIDIA Cosmos Reason 2**, itp.)  
✅ Cosmos Reason 2 przez OpenAI-compatible API z konfigurowalnym URL  

## Szybki start

### 1. Instalacja

```bash
cd /home/jacek/work/workspace/datapilot/sras_ros2_dimos_bridge
colcon build --packages-select dimos_vlm_bridge
source install/setup.bash
```

### 2. Uruchomienie

```bash
ros2 launch dimos_vlm_bridge object_localization.launch.py
```

### 3. Sprawdzenie statystyk

```bash
# Przez ROS2 service
ros2 service call /object_localization_node/get_stats std_srvs/srv/Trigger

# Przez skrypt Python
./scripts/query_object_database.py --stats
```

### 4. Przeglądanie wykrytych obiektów

```bash
# Ostatnie 20 detekcji
./scripts/query_object_database.py --recent 20

# Szukanie konkretnego obiektu
./scripts/query_object_database.py --search shelf

# Export do CSV
./scripts/query_object_database.py --export detections.csv
```

## Struktura bazy danych

Tabela `detections` zawiera:
- `timestamp` - czas wykrycia
- `object_name` - nazwa obiektu
- `object_description` - opis obiektu
- `robot_x, robot_y, robot_z` - pozycja robota
- `object_x, object_y, object_z` - pozycja obiektu (z LIDAR)
- `confidence` - pewność detekcji
- `bbox_*` - współrzędne bounding boxa

## Konfiguracja

Edytuj `config/object_localization.yaml`:

```yaml
detection_interval: 2.0  # jak często wykrywać obiekty (sekundy)
vlm_backend: "moondream_local"  # backend VLM (moondream_local, cosmos_reason2, etc.)

# Dla NVIDIA Cosmos Reason 2:
# vlm_backend: "cosmos_reason2"
# cosmos_api_url: "http://localhost:8000"  # URL do OpenAI-compatible API
# cosmos_api_key: ""  # opcjonalny API key

camera_topic: "/robot0/front_cam/rgb"
pointcloud_topic: "/robot0/point_cloud2_L1"
odom_topic: "/odom"
```

## Zapytania SQL

```bash
sqlite3 object_localization/objects.db

# Wszystkie wykryte obiekty
SELECT object_name, COUNT(*) FROM detections GROUP BY object_name;

# Pozycje konkretnego obiektu
SELECT timestamp, object_x, object_y, object_z 
FROM detections 
WHERE object_name LIKE '%shelf%' AND object_x IS NOT NULL;

# Ostatnie detekcje z pozycjami
SELECT 
    datetime(timestamp, 'unixepoch') as czas,
    object_name as obiekt,
    ROUND(object_x, 2) as x,
    ROUND(object_y, 2) as y,
    ROUND(object_z, 2) as z
FROM detections 
WHERE object_x IS NOT NULL
ORDER BY timestamp DESC 
LIMIT 20;
```

## Pliki

- **Node**: `dimos_vlm_bridge/object_localization_node.py`
- **Config**: `config/object_localization.yaml`
- **Launch**: `launch/object_localization.launch.py`
- **Dokumentacja**: `docs/object_localization_node.md`
- **Skrypt query**: `scripts/query_object_database.py`

## Jak to działa

1. Node synchronizuje obraz z kamery, camera_info i chmurę punktów LIDAR
2. Co `detection_interval` sekund:
   - VLM analizuje obraz i zwraca wykryte obiekty z bounding boxami
   - Dla każdego obiektu:
     - Punkty LIDAR są projektowane na płaszczyznę obrazu
     - Wybierane są punkty wewnątrz bounding boxa
     - Obliczana jest mediana pozycji (lub inny percentyl)
     - Pozycja jest transformowana do układu mapy
   - Detekcje są zapisywane do bazy danych

## Integracja z innymi nodami

- **Temporal Memory**: śledzi obiekty w czasie, relacje między nimi
- **Spatial Memory**: zapisuje cechy wizualne w pozycjach robota
- **Object Localization**: zapisuje semantyczne pozycje obiektów w 3D

Wszystkie trzy można uruchomić razem dla pełnego zrozumienia sceny.

## Troubleshooting

**Brak detekcji**: Sprawdź czy wszystkie topiki publikują dane, czy TF są dostępne

**object_x/y/z są NULL**: LIDAR nie widzi punktów w bounding boxie - sprawdź czy kamera i LIDAR mają wspólne pole widzenia

**Wysokie CPU**: Zwiększ `detection_interval`, zmniejsz `max_points`, użyj lżejszego VLM

## Przykładowe użycie

```bash
# Terminal 1: Uruchom node
ros2 launch dimos_vlm_bridge object_localization.launch.py

# Terminal 2: Monitoruj detekcje
ros2 topic echo /object_localization_node/detections

# Terminal 3: Po chwili sprawdź statystyki
./scripts/query_object_database.py --stats --recent 10

# Wyszukaj wszystkie półki
./scripts/query_object_database.py --search shelf
```

Pełna dokumentacja: `docs/object_localization_node.md`

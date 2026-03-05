# NVIDIA Cosmos Reason 2 Setup Guide

## Przegląd

NVIDIA Cosmos Reason 2 to zaawansowany model wizyjny zoptymalizowany pod kątem wykrywania obiektów i generowania bounding boxów. Ten przewodnik opisuje jak skonfigurować `object_localization_node` do pracy z Cosmos Reason 2.

## Wymagania

- Dostęp do API Cosmos Reason 2 przez OpenAI-compatible endpoint
- URL endpointu API
- Opcjonalnie: API key do autoryzacji
- **KRYTYCZNE**: vLLM deployment z `--max-model-len 8192` (minimum recommended by NVIDIA)
- Opcjonalnie: `--reasoning-parser qwen3` dla wsparcia reasoning mode

## vLLM Deployment: Wymagane parametry

**KRYTYCZNE:** Zawsze deployuj z `--max-model-len 8192` (minimum zalecane przez NVIDIA).

Niższe wartości (np. 4096) powodują sztuczne pętle reasoning, gdzie model kończy kontekst w środku `<think>` i nigdy nie produkuje odpowiedzi.

```bash
# ✅ POPRAWNIE - podstawowy deployment
vllm serve nvidia/Cosmos-Reason2-2B \
  --max-model-len 8192 \
  --host 0.0.0.0 \
  --port 8000

# ✅ POPRAWNIE - z reasoning parser (opcjonalnie)
vllm serve nvidia/Cosmos-Reason2-2B \
  --max-model-len 8192 \
  --reasoning-parser qwen3 \
  --host 0.0.0.0 \
  --port 8000

# ❌ BŁĄD - za mały kontekst
vllm serve nvidia/Cosmos-Reason2-2B --max-model-len 4096
```

**Reasoning parser** (`--reasoning-parser qwen3`):
- Rozdziela `<think>` do pola `reasoning_content`
- Odpowiedź w polu `content`
- Bez parsera: tagi `<think>` pojawiają się w surowej odpowiedzi (nadal działa)
- Nasza implementacja obsługuje oba przypadki

## NVIDIA Prompting Guidelines (KRYTYCZNE!)

Nasza implementacja została zaktualizowana zgodnie z oficjalnymi wytycznymi NVIDIA:

### 1. **Media PRZED tekstem** (CRITICAL!)
✅ **POPRAWNIE**: Obraz/video PRZED promptem w content array
❌ **BŁĄD**: Tekst przed obrazem (powoduje spadek dokładności!)

Nasza implementacja automatycznie umieszcza obraz przed tekstem.

### 2. **System Prompt**
Zawsze dodajemy lightweight system prompt:
```json
{"role": "system", "content": [{"type": "text", "text": "You are a helpful assistant."}]}
```

### 3. **Reasoning Mode** (`<think>`)

**Kiedy NIE używać reasoning** (domyślnie wyłączony):
- ❌ Proste wykrywanie obiektów - marnuje tokeny, może obniżyć dokładność
- ❌ Wykrywanie osób - powoduje false positives
- ❌ Zadania przestrzenne/odległości - model wpada w nieskończoną pętlę
- ❌ Proste liczenie - wolniejsze, czasem mniej dokładne

**Kiedy używać reasoning** (ustaw `cosmos_use_reasoning: true`):
- ✅ Wykrywanie zmian w sekwencjach obrazów
- ✅ Analiza sekwencji bezpieczeństwa
- ✅ Rozpoznawanie aktywności
- ✅ Rozumowanie przyczynowo-skutkowe
- ✅ Złożone sceny z wieloma obiektami

### 4. **Zoptymalizowane parametry**

| Parametr | Bez reasoning | Z reasoning |
|----------|--------------|-------------|
| temperature | 0.7 | 0.6 |
| top_p | 0.8 | 0.95 |
| top_k | 20 | 20 |
| presence_penalty | 1.5 | 0.0 |
| max_tokens | 800 | 1200 |

Nasza implementacja automatycznie dostosowuje te parametry.

## Konfiguracja

### 1. Edycja pliku konfiguracyjnego

Użyj gotowego configu dla Cosmos Reason 2:

```bash
cp config/object_localization_cosmos.yaml config/my_cosmos_config.yaml
```

Lub edytuj `config/object_localization.yaml`:

```yaml
object_localization_node:
  ros__parameters:
    vlm_backend: "cosmos_reason2"
    cosmos_api_url: "http://localhost:8000"  # Twój endpoint API
    cosmos_api_key: ""  # Opcjonalny API key
    cosmos_use_reasoning: false  # Domyślnie wyłączony (zalecane dla object detection)
    detection_interval: 2.0
```

**Uwaga**: Reasoning mode jest domyślnie **wyłączony** zgodnie z wytycznymi NVIDIA. Dla prostego wykrywania obiektów reasoning:
- Marnuje tokeny (~400-800 tokenów na myślenie)
- Może obniżyć dokładność
- Spowalnia odpowiedzi

Włącz tylko dla złożonych scen wymagających głębokiej analizy.

### 2. Ustawienie zmiennej środowiskowej (opcjonalnie)

Zamiast podawać API key w configu, możesz użyć zmiennej środowiskowej:

```bash
export COSMOS_API_KEY="your-api-key-here"
```

### 3. Uruchomienie node'a

```bash
ros2 launch dimos_vlm_bridge object_localization.launch.py config:=config/object_localization_cosmos.yaml
```

Lub bezpośrednio:

```bash
ros2 run dimos_vlm_bridge object_localization_node --ros-args --params-file config/object_localization_cosmos.yaml
```

## Testowanie połączenia

### Test standalone

Możesz przetestować połączenie z API bez uruchamiania ROS2:

```bash
cd dimos_vlm_bridge
python3 cosmos_reason2.py http://localhost:8000 /path/to/test_image.jpg
```

To wyśle testowy obraz do API i wyświetli wykryte obiekty.

### Przykładowy output

```
Testing Cosmos Reason 2 with:
  API URL: http://localhost:8000
  Image: test.jpg

[CosmosReason2] Initialized with API URL: http://localhost:8000
[CosmosReason2] Model: nvidia/cosmos-reason-2

Detecting objects...
[CosmosReason2] Sending request to http://localhost:8000/v1/chat/completions
[CosmosReason2] Response received: 342 chars

Result:
[{"name": "shelf", "bbox": [120, 45, 580, 420], "description": "metal storage shelf", "confidence": 0.92}, 
 {"name": "pallet", "bbox": [15, 380, 200, 590], "description": "wooden pallet on floor", "confidence": 0.88}]

Found 2 objects:
  - shelf: [120, 45, 580, 420]
  - pallet: [15, 380, 200, 590]
```

## Format odpowiedzi API

Cosmos Reason 2 zwraca JSON w formacie:

```json
[
  {
    "name": "object_name",
    "bbox": [x_min, y_min, x_max, y_max],
    "description": "brief description",
    "confidence": 0.9
  }
]
```

Gdzie:
- `name`: nazwa/typ obiektu
- `bbox`: współrzędne bounding boxa w pikselach [x_min, y_min, x_max, y_max]
- `description`: krótki opis obiektu
- `confidence`: pewność detekcji (0.0 - 1.0)

**Z reasoning mode** (jeśli włączony):
```json
{
  "choices": [{
    "message": {
      "reasoning_content": "<think>...reasoning...</think>",
      "content": "[{\"name\": \"shelf\", ...}]"
    }
  }]
}
```

Nasza implementacja automatycznie ekstraktuje odpowiedź po `</think>` tag.

## Integracja z LIDAR

Po wykryciu obiektów przez Cosmos Reason 2:

1. **Projekcja LIDAR**: Punkty z chmury LIDAR są projektowane na płaszczyznę obrazu
2. **Filtrowanie**: Wybierane są punkty wewnątrz każdego bounding boxa
3. **Pozycja 3D**: Obliczana jest mediana pozycji punktów (konfigurowalny percentyl)
4. **Transformacja**: Pozycja jest transformowana do układu mapy
5. **Zapis**: Detekcja z pozycją 3D jest zapisywana do bazy danych

## Przykładowy workflow

```bash
# Terminal 1: Uruchom node z Cosmos Reason 2
ros2 launch dimos_vlm_bridge object_localization.launch.py \
  config:=config/object_localization_cosmos.yaml

# Terminal 2: Monitoruj detekcje
ros2 topic echo /object_localization_node/detections

# Terminal 3: Sprawdź logi
# Node będzie logował:
# - Inicjalizację Cosmos Reason 2
# - Wysyłanie requestów do API
# - Otrzymane detekcje
# - Pozycje 3D obiektów

# Terminal 4: Po chwili sprawdź bazę danych
./scripts/query_object_database.py --stats --recent 10
```

## Troubleshooting

### Błąd: "cosmos_api_url must be set"

Upewnij się, że w configu ustawiony jest `cosmos_api_url`:

```yaml
cosmos_api_url: "http://localhost:8000"
```

### Błąd połączenia z API

Sprawdź:
- Czy endpoint API jest dostępny: `curl http://localhost:8000/v1/models`
- Czy URL jest poprawny (bez trailing slash w configu)
- Czy firewall nie blokuje połączenia

### Timeout requestów

Zwiększ timeout w `cosmos_reason2.py` (domyślnie 60s):

```python
vlm = CosmosReason2VlModel(
    api_url=cosmos_api_url,
    timeout=120  # 2 minuty
)
```

### Brak bounding boxów w odpowiedzi

Cosmos Reason 2 może zwracać różne formaty. Sprawdź logi node'a:

```bash
ros2 topic echo /rosout | grep CosmosReason2
```

Jeśli format jest inny, może być potrzebna modyfikacja parsera w `object_localization_node.py`.

### Wysokie opóźnienia

- Zwiększ `detection_interval` (np. do 5.0s)
- **Wyłącz reasoning mode** (`cosmos_use_reasoning: false`) - oszczędza 400-800 tokenów
- Zmniejsz rozdzielczość obrazu przed wysłaniem
- Użyj lokalnego API zamiast zdalnego
- Sprawdź czy vLLM ma wystarczająco GPU memory

## Optymalizacja wydajności

### Częstotliwość detekcji

```yaml
detection_interval: 5.0  # Wykrywaj co 5 sekund zamiast co 2
```

### Jakość obrazu

Możesz zmodyfikować `cosmos_reason2.py` aby zmniejszyć jakość JPEG:

```python
pil_image.save(buffered, format="JPEG", quality=85)  # Zamiast 95
```

### Batch processing

Dla większej wydajności można zmodyfikować node aby zbierał kilka obrazów i wysyłał je w jednym requeście (wymaga wsparcia API).

## Porównanie z innymi backendami

| Backend | Prędkość | Dokładność bbox | Lokalne | Koszt |
|---------|----------|-----------------|---------|-------|
| Cosmos Reason 2 | Średnia | Wysoka | Nie* | Zależy od API |
| Moondream Local | Szybka | Średnia | Tak | Darmowe |
| OpenAI GPT-4V | Wolna | Wysoka | Nie | Płatne |
| Nemotron Local | Średnia | Wysoka | Tak | Darmowe |

*Cosmos Reason 2 może być hostowany lokalnie jeśli masz dostęp do modelu

## Przykładowe zapytania do bazy

Po zebraniu danych z Cosmos Reason 2:

```sql
-- Najczęściej wykrywane obiekty
SELECT object_name, COUNT(*) as count, 
       AVG(confidence) as avg_confidence
FROM detections 
GROUP BY object_name 
ORDER BY count DESC;

-- Obiekty z wysoką pewnością i pozycją 3D
SELECT object_name, object_x, object_y, object_z, confidence
FROM detections
WHERE confidence > 0.8 AND object_x IS NOT NULL
ORDER BY timestamp DESC
LIMIT 20;

-- Średnia pozycja każdego typu obiektu
SELECT object_name,
       AVG(object_x) as avg_x,
       AVG(object_y) as avg_y,
       AVG(object_z) as avg_z,
       COUNT(*) as detections
FROM detections
WHERE object_x IS NOT NULL
GROUP BY object_name
HAVING detections > 5;
```

## Dalsze kroki

1. Dostosuj prompt w `cosmos_reason2.py` dla lepszych wyników
2. Eksperymentuj z `bbox_depth_percentile` (25, 50, 75)
3. Dodaj filtrowanie duplikatów (ten sam obiekt wykryty wielokrotnie)
4. Zintegruj z systemem nawigacji robota
5. Dodaj wizualizację wykrytych obiektów w RViz

## Wsparcie

Pełna dokumentacja: `docs/object_localization_node.md`

Kod źródłowy:
- Node: `dimos_vlm_bridge/object_localization_node.py`
- Cosmos wrapper: `dimos_vlm_bridge/cosmos_reason2.py`

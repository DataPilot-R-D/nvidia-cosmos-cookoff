# Cosmos Reason 2 - Implementacja zgodna z NVIDIA Guidelines

## Podsumowanie ulepszeń

Implementacja `cosmos_reason2.py` i `object_localization_node` została zaktualizowana zgodnie z oficjalnymi wytycznymi NVIDIA (2026-02-16), co znacząco poprawia dokładność i wydajność.

## Kluczowe zmiany

### 1. ✅ Media PRZED tekstem (CRITICAL!)

**Problem**: Oryginalna implementacja umieszczała tekst przed obrazem, co powodowało spadek dokładności.

**Rozwiązanie**: 
```python
# ❌ PRZED (błędna kolejność)
content = [
    {"type": "text", "text": prompt},
    {"type": "image_url", "image_url": {...}}
]

# ✅ PO (poprawna kolejność)
content = [
    {"type": "image_url", "image_url": {...}},  # MEDIA FIRST!
    {"type": "text", "text": prompt}
]
```

**Wpływ**: +1.5 do +2.5 gwiazdek w testach NVIDIA (motion detection, door state, change detection)

### 2. ✅ System Prompt

**Dodano**: Lightweight system prompt zgodnie z wytycznymi:
```python
{
    "role": "system",
    "content": [{"type": "text", "text": "You are a helpful assistant."}]
}
```

### 3. ✅ Reasoning Mode z właściwym formatem

**Problem**: Reasoning mode nie działał na multimodalnych inputach.

**Rozwiązanie**: Format instruction embedded w user prompt:
```python
if reasoning_enabled:
    prompt_with_reasoning = f"""{prompt}

Answer the question using the following format:

<think>
Your reasoning.
</think>

Write your final answer immediately after the </think> tag."""
```

**Kiedy używać**:
- ✅ Złożone sceny, wykrywanie zmian, analiza sekwencji
- ❌ Proste object detection (domyślnie wyłączone)

### 4. ✅ Zoptymalizowane parametry sampling

| Parametr | Default (bez reasoning) | Z reasoning | Uzasadnienie |
|----------|------------------------|-------------|--------------|
| temperature | 0.7 | 0.6 | Niższa dla reasoning = bardziej deterministyczne |
| top_p | 0.8 | 0.95 | Wyższa dla reasoning = więcej opcji w chain-of-thought |
| top_k | 20 | 20 | Bez zmian |
| presence_penalty | 1.5 | 0.0 | 0.0 dla reasoning aby nie zakłócać myślenia |
| max_tokens | 800 | 1200 | Więcej dla reasoning (~400 think + ~800 answer) |

**Wpływ**: `presence_penalty=1.5` w default mode zwiększa nowość (dobre dla opisów), `0.0` z reasoning nie zakłóca chain-of-thought.

### 5. ✅ Parsing odpowiedzi z reasoning

Dodano `_extract_answer()` do obsługi:
- Odpowiedzi z `reasoning_content` field (gdy vLLM ma `--reasoning-parser qwen3`)
- Odpowiedzi z raw `<think>` tags (bez parsera)
- Fallback dla niepełnych odpowiedzi

```python
def _extract_answer(self, response: str) -> str:
    if '</think>' in response:
        return response.split('</think>')[-1].strip()
    if response.startswith('<think>'):
        return response  # Model looped, return raw
    return response
```

### 6. ✅ Konfigurowalny reasoning mode

Dodano parametr `cosmos_use_reasoning` (domyślnie `false`):

```yaml
# config/object_localization.yaml
cosmos_use_reasoning: false  # Zalecane dla object detection
```

**Uzasadnienie**: Per NVIDIA guidelines, reasoning dla prostego object detection:
- Marnuje 400-800 tokenów na myślenie
- Może obniżyć dokładność (false positives w person detection)
- Spowalnia odpowiedzi
- Może powodować infinite loops w spatial tasks

## Wyniki testów NVIDIA

| Capability | Wrong prompting | Correct prompting | Delta |
|-----------|:--------------:|:-----------------:|:-----:|
| Video motion detection | ⭐ | ⭐⭐⭐ | **+2** |
| Door/window state | ⭐ | ⭐⭐½ | **+1.5** |
| Change detection | ⭐ | ⭐⭐ | **+1** |
| Counting | ⭐½ | ⭐⭐ | **+0.5** |

## Deployment requirements

### vLLM minimum config:
```bash
vllm serve nvidia/Cosmos-Reason2-2B \
  --max-model-len 8192 \
  --host 0.0.0.0 \
  --port 8000
```

**CRITICAL**: `--max-model-len 8192` minimum! Niższe wartości powodują reasoning loops.

### Optional reasoning parser:
```bash
vllm serve nvidia/Cosmos-Reason2-2B \
  --max-model-len 8192 \
  --reasoning-parser qwen3 \
  --host 0.0.0.0 \
  --port 8000
```

Parser rozdziela `<think>` do `reasoning_content` field. Nasza implementacja obsługuje oba przypadki.

## Użycie w object_localization_node

### Default (bez reasoning - zalecane):
```yaml
vlm_backend: "cosmos_reason2"
cosmos_api_url: "http://localhost:8000"
cosmos_use_reasoning: false  # Domyślnie
```

### Z reasoning (tylko dla złożonych scen):
```yaml
vlm_backend: "cosmos_reason2"
cosmos_api_url: "http://localhost:8000"
cosmos_use_reasoning: true  # Włącz dla complex detection
```

## Token budget

| Tryb | Prompt tokens | Completion tokens | Total |
|------|--------------|-------------------|-------|
| Default (no reasoning) | ~800 | ~800 | ~1600 |
| Z reasoning | ~800 | ~1200 (400 think + 800 answer) | ~2000 |

## Kiedy NIE używać reasoning

❌ **Proste object detection** - nasza główna use case
❌ **Person detection** - powoduje false positives  
❌ **Spatial/distance tasks** - infinite loops  
❌ **Simple counting** - wolniejsze, czasem mniej dokładne  
❌ **One-word answers** - marnowanie tokenów  

## Kiedy używać reasoning

✅ **Change detection** w sekwencjach  
✅ **Security sequences** - door state, activity  
✅ **Complex scenes** z wieloma obiektami  
✅ **Cause-effect reasoning**  
✅ **Lighting analysis**  

## Backward compatibility

Wszystkie zmiany są backward compatible:
- Istniejące konfiguracje działają (reasoning domyślnie wyłączony)
- API pozostaje bez zmian
- Nowe parametry są opcjonalne

## Pliki zmienione

1. `dimos_vlm_bridge/cosmos_reason2.py` - główna implementacja
2. `dimos_vlm_bridge/object_localization_node.py` - integracja
3. `config/object_localization.yaml` - dodany `cosmos_use_reasoning`
4. `config/object_localization_cosmos.yaml` - przykładowy config
5. `docs/cosmos_reason2_setup.md` - zaktualizowana dokumentacja

## Źródła

- [NVIDIA Cosmos Reason2 Prompt Guide](https://nvidia-cosmos.github.io/cosmos-cookbook/core_concepts/prompt_guide/reason_guide.html)
- Data: 2026-02-16
- Testy: 45 multimodal benchmarks, 80% reasoning trigger rate

## Rekomendacje dla object_localization

Dla typowego use case (wykrywanie obiektów w magazynie/warehouse):

1. **Zostaw reasoning wyłączony** (`cosmos_use_reasoning: false`)
2. **Ustaw detection_interval: 2.0-5.0** (balans między częstotliwością a kosztami)
3. **Deploy vLLM z --max-model-len 8192**
4. **Monitoruj token usage** - bez reasoning ~800 tokens/request

Włącz reasoning tylko jeśli:
- Sceny są bardzo złożone (>10 obiektów)
- Potrzebujesz analizy relacji między obiektami
- Wykrywasz zmiany między kolejnymi obrazami
- Dokładność jest krytyczna i koszt tokenów nie ma znaczenia

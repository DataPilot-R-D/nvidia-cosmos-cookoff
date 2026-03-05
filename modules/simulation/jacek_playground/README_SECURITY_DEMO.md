# Louvre Security Demo Integration

Integration Piotra's security scenario (Luvr_full.usda) z RL-controlled Go2 robot.

## Architektura Sceny

### Luvr_full.usda (wrapper)
- **Luvr_scenario.usda** (sublayer) — galeria + postacie z AnimationGraph
- **Flow smoke** — primy w root layer (Flow ignoruje sublayer/reference)
- **GlassShards** — visibility=invisible, zmieniane w runtime przez scenario_events.py

### Postacie (omni.anim.people)
- **BehaviorScript** na każdym `biped_demo_meters` child
- **Command file** (`luvr_commands.txt`) — definiuje GoTo/Idle/LookAround per character
- **AnimationGraph** z Biped_Setup — napędza animację Walk/Idle
- **navmesh_enabled=False** — bez tego GoTo failuje w wąskiej galerii

### Eventy (scenario_events.py)
- Async coroutine schedulowana po Play
- t=7s: okno pęka (glass opacity→0, GlassShards visible)
- t=8-10s: złodzieje wchodzą (command file handles movement)

## Nowy Skrypt: luvr_simulation_security_demo.py

Bazuje na `luvr_simulation_rl.py` z dodatkowymi integracjami:

### Kluczowe Zmiany

1. **Enable Extensions** (przed załadowaniem sceny):
   - `omni.anim.graph.core` — core animation graph (dependency)
   - `omni.anim.graph.ui` — animation graph UI (dependency)
   - `omni.anim.graph.schema` — animation graph schema (dependency)
   - `omni.anim.people` — system animacji postaci
   - `omni.flowusd` — smoke effects

2. **Configure Settings** (przed Play):
   ```python
   carb.settings.set("/exts/omni.anim.people/navmesh_enabled", False)
   ```

3. **Unlock Scripts** (Isaac 5.1 blokuje domyślnie):
   ```python
   ScriptManager._allow_scripts_to_execute = True
   ```

4. **Load Scene**:
   ```python
   open_stage("/path/to/Luvr_full.usda")
   ```

## Uruchomienie

### 1. Podstawowa Symulacja

```bash
cd jacek_playground
python3 luvr_simulation_security_demo.py --scene_path /home/ubuntu/go2_omniverse/scenes/Luvr_full.usda
```

### 2. ROS2 Bridge (osobny terminal)

```bash
python3 ros2_sensor_bridge.py
```

### 3. Manual Scenario Trigger (opcjonalnie)

Kiedy chcesz odpalić scenariusz (window break, smoke, thieves):

```bash
python3 ../scenes/scenario_events.py --exec
```

Lub przez Kit API (localhost:9682) jeśli Isaac Sim już działa.

## UDP Ports

- **9870**: Camera data (Isaac → ROS2)
- **9871**: Commands (ROS2 → Isaac)
- **9872**: Robot state (Isaac → ROS2)

## Pliki Kluczowe

- `luvr_simulation_security_demo.py` — główny skrypt integracyjny
- `../scenes/Luvr_full.usda` — scena z postaciami i Flow
- `../scenes/luvr_commands.txt` — komendy dla postaci
- `../scenes/scenario_events.py` — trigger window break i smoke

## Różnice vs luvr_simulation_rl.py

| Feature | luvr_simulation_rl.py | luvr_simulation_security_demo.py |
|---------|----------------------|----------------------------------|
| Scena | Luvr_sky.usda | Luvr_full.usda |
| Postacie | Nie | Tak (omni.anim.people) |
| Flow smoke | Nie | Tak (omni.flowusd) |
| Scenario events | Nie | Tak (manual trigger) |
| Extensions | Podstawowe | +omni.anim.people, +omni.flowusd |
| Script unlock | Nie | Tak |

## Troubleshooting

### Postacie nie chodzą
- Sprawdź czy `navmesh_enabled=False` przed Play
- Sprawdź czy `omni.anim.people` extension jest enabled
- Sprawdź czy `luvr_commands.txt` jest w scenes/

### Smoke nie działa
- Flow primy MUSZĄ być w root layer
- Sprawdź czy `omni.flowusd` extension jest enabled

### Scripts blocked
- Isaac 5.1 blokuje scripts domyślnie
- Skrypt automatycznie ustawia `ScriptManager._allow_scripts_to_execute = True`

### Scenario events nie triggerują
- Odpal `scenario_events.py` ręcznie przez `--exec`
- Lub zintegruj z ROS2 topic (future work)

## Future Work

### ROS2 Trigger Integration
Zamiast manual `--exec`, można dodać ROS2 topic trigger:

```python
# W ros2_sensor_bridge.py
self.scenario_trigger_sub = self.create_subscription(
    std_msgs.msg.Empty,
    '/scenario/trigger',
    self.trigger_scenario_callback,
    10
)

def trigger_scenario_callback(self, msg):
    # Execute scenario_events.py przez Kit API
    # lub bezpośrednio wywołaj funkcje z scenario_events
    pass
```

### Osobne Triggery
- `/scenario/window_break` — tylko okno
- `/scenario/smoke` — tylko dym
- `/scenario/thieves` — tylko złodzieje

## Kontakt

Jacek — integracja z RL simulation
Piotr — security demo scene
OpenClaw Infra — scene setup

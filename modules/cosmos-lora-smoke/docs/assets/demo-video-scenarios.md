# Demo Video — Scenariusze i prompty (Sora 2 / Veo 3.1)

3 wersje scenariusza demonstracyjnego dla hackathonu NVIDIA Physical AI 2026.
Każdy pokazuje ten sam core: robot patrole → dym → przełączenie na thermal → wykrycie intruza.

---

## Scenariusz A — Włamanie do serwerowni (cinematic, dramatyczny)

**Logline:** Złodziej danych rzuca granat dymny w serwerowni. Robot przełącza się na termal i lokalizuje intruza mimo zerowej widoczności.

**Storyboard:**
1. Ciemna serwerownia nocą — rzędy mrugających serwerów, niebieskie LED-y
2. Intruz wchodzi przez okno, rzuca granat dymny — pomieszczenie wypełnia się białym dymem
3. Robot patrolowy (humanoidalny, NVIDIA Jetson) wjeżdża — kamera RGB nic nie widzi, symbol `⚠ VISIBILITY LOST`
4. Przełączenie kamery: obraz zmienia się na greyscale thermal — przez dym wyraźnie widać ciepłą sylwetkę człowieka
5. Na ekranie overlay: `PERSON DETECTED | SMOKE: HEAVY | THREAT: HIGH`
6. Robot kieruje się w stronę intruza, alarm

**Prompt (Sora 2 / Veo 3.1):**

```
Cinematic short film, 15 seconds, photorealistic.

Scene: A dark server room at night. Blue LED lights blink on server racks.
An intruder dressed in black enters through a broken window and throws a
smoke grenade. Dense white cold smoke rapidly fills the room, obscuring
everything. A sleek security robot on wheels enters the frame — its RGB
camera feed shows static and a "VISIBILITY LOST" warning overlay in red.

Suddenly the camera mode switches: the image transitions to grayscale
thermal vision. Through the thick smoke, a glowing human silhouette
is clearly visible — warm body heat radiating as a bright white shape
against the cool gray background. A HUD overlay appears:
"PERSON DETECTED | SMOKE DENSITY: HEAVY | THREAT LEVEL: HIGH".
The robot pivots and moves toward the intruder. Red alarm lights
begin flashing on the ceiling.

Style: Blade Runner 2049 color grading, tight camera cuts, tense music.
Camera: Dutch angle on robot, POV thermal shot, wide establishing shot.
```

---

## Scenariusz B — Muzeum w nocy (elegancki, minimalistyczny)

**Logline:** Złodziej dzieł sztuki zasłania się dymem. Robot ochroniarski — tylko thermal vision — widzi wszystko.

**Storyboard:**
1. Muzeum po zamknięciu — marmurowe sale, eksponaty pod reflektorami
2. Intruz prześlizguje się obok czujników, rozpyla aerozol-dym
3. Robot wjeżdża — widok RGB: czysta biel dymu
4. Thermal overlay: sylwetka intruza przy obrazie, wyraźna jak w dzień
5. Split-screen: lewa strona RGB (nic nie widać) vs prawa strona thermal (sylwetka idealna)
6. Napis: `Zero-shot: 53% accuracy → LoRA v6a: 96.2%`

**Prompt (Sora 2 / Veo 3.1):**

```
Elegant cinematic commercial, 15 seconds, 4K photorealistic.

Scene: A grand museum at night, closed to public. Marble floors reflect
soft spotlights illuminating classical sculptures and paintings.
An intruder in dark clothing moves silently through the gallery,
spraying cold aerosol smoke as a concealment screen. The room fills
with a low, dense white mist at waist height.

A white security robot glides smoothly into the frame. Cut to:
split-screen effect — LEFT SIDE shows the RGB camera view:
pure white fog, nothing visible. RIGHT SIDE shows thermal camera view:
the intruder's warm human silhouette glows brightly in orange and white
against the cold blue-gray background of the smoke, perfectly visible.

Text overlay fades in: "Zero-shot model: 53.3% detection"
then transitions to: "LoRA v6a: 96.2% detection"

Style: Apple product launch aesthetic, clean white light,
minimal music with single piano notes. Slow camera push-in on split screen.
```

---

## Scenariusz C — Magazyn przemysłowy (gritty, dokumentalny)

**Logline:** Test w warunkach rzeczywistych. Dwa roboty — jeden bez fine-tuningu, jeden z LoRA — naprzeciwko tego samego zadymionego magazynu.

**Storyboard:**
1. Duży magazyn, regały, widełki wózka widłowego w tle
2. Aktor (intruz) ukrywa się za chmurą zimnego dymu z gaśnicy CO₂
3. Robot A (baseline) — skanuje, `NO PERSON DETECTED`, mija intruza
4. Robot B (LoRA v6a) — thermal lock-on, `PERSON DETECTED 96.2%`, zatrzymuje się
5. Side-by-side replay: baseline vs fine-tuned, ta sama klatka
6. Tytuł: `Trained on 800 thermal images. 20 min on RTX 3090. $0.30.`

**Prompt (Sora 2 / Veo 3.1):**

```
Gritty documentary-style video, 20 seconds, realistic handheld camera feel.

Scene: A large industrial warehouse. Metal shelving units, concrete floor,
flickering fluorescent lights overhead. A person in dark clothing hides
behind a dense cloud of cold CO2 smoke from an extinguisher —
thick white ground-level fog obscures their lower body.

LEFT FRAME — Robot A (baseline model): drives toward the smoke cloud,
its screen shows a standard RGB camera feed. Overlay: "SCANNING..."
then "NO PERSON DETECTED — CLEAR". The robot drives past the hidden person.

RIGHT FRAME — Robot B (LoRA v6a fine-tuned): same scene, same smoke.
Its screen switches to grayscale thermal view. The hidden person
immediately appears as a bright warm silhouette. Overlay:
"PERSON DETECTED | CONFIDENCE: 96.2% | SMOKE: MEDIUM"
Robot stops and triggers alert.

Final frame: freeze on split comparison. Text appears:
"Trained on 800 thermal images. 20 minutes on RTX 3090. Cost: $0.30."

Style: BBC documentary, shallow depth of field, natural warehouse lighting,
subtle tension in soundtrack. No color grading — raw industrial look.
```

---

## Rekomendacja

| Scenariusz | Styl | Najlepszy dla |
|------------|------|---------------|
| **A — Serwerownia** | Dramatyczny, cinematic | Social media, Discord, pitch deck |
| **B — Muzeum** | Elegancki, split-screen | Hackathon submission, NVIDIA judges |
| **C — Magazyn** | Dokumentalny, A/B test | Tech audience, LinkedIn, README |

**Rekomendowany do hackathonu: Scenariusz B** — split-screen RGB vs thermal jest najbardziej czytelnym visual proof dla sędziów. Zero-shot vs LoRA v6a jako liczby na ekranie = instant WOW.

---

## Uwagi techniczne

- Sora 2: `sora.com` — dostęp przez ChatGPT Pro, najlepszy w consistent robot design
- Veo 3.1 (Google DeepMind): `labs.google/veo` — lepszy w motion physics i smoke simulation
- Maksymalna długość: Sora 2 = 20s, Veo 3.1 = 8s (iteruj prompt kilka razy)
- Jeśli AI video nie wyjdzie jakościowo → plan B: screen recording benchmarku z narracją

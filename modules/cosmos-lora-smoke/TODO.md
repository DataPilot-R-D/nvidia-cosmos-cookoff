# TODO — Smoke-Resilient Intruder Detection

NVIDIA Physical AI Hackathon 2026. LoRA fine-tuning Cosmos Reason2-2B do wykrywania ludzi w zimnym dymie na kamerze termalnej.

---

## 2026-02-25

### Feature: Repo setup + Dataset QA review

1. Branch: `data-qa-review`, `docs/qa-screenshot-and-todo`
2. Status: `done`
3. Zrobione:
   1. [2026-02-25 14:19:19 +01:00] Wyczyszczone repo z template agentowego (agent-pack-template) — squash historii do jednego commitu, zero sladow boilerplate.
   2. [2026-02-25 14:19:19 +01:00] Profesjonalny README z badges, tabelami benchmarku, quick start, przykladem kodu inference.
   3. [2026-02-25 14:19:19 +01:00] Dodane: `training/train_lora.py`, `training/config.yaml`, `benchmark/benchmark.py`, `benchmark/results/v3|v6a|v6b`.
   4. [2026-02-25 14:19:19 +01:00] Dodana dokumentacja: `docs/methodology.md`, `docs/pipeline.md`, `docs/thermal_primer.md`.
   5. [2026-02-25 15:24:49 +01:00] QA review datasetu — 200/200 zdjeciach przejrzanych przez czlowieka (Jakub), wyniki w `review/results.csv`.
   6. [2026-02-25 15:24:49 +01:00] Zbudowane narzedzie review: Jupyter notebook z UI image+opis side-by-side, auto-save, resume, raport GO/NO-GO.
   7. [2026-02-25 15:24:49 +01:00] Decyzja: GO — 94.5% OK (prog 80%), pipeline potwierdzony, mozna skalowac 3x.
4. Najwazniejsze artefakty:
   1. `review/review.ipynb`
   2. `review/results.csv`
   3. `review/README.md`
   4. `training/train_lora.py`
   5. `benchmark/benchmark.py`
   6. `README.md`
5. Referencyjne commity:
   1. `ad8b0f3` — Initial commit: Smoke-Resilient Intruder Detection
   2. `cf54f5f` — feat: Dataset QA review — 94.5% OK, GO decision

### QA wyniki (2026-02-25)

| Kategoria | n | % OK |
|-----------|---|------|
| A_real_test (smoke+people) | 45 | 91.1% |
| B_real_test (people only) | 45 | 97.8% |
| C_real_test (smoke only) | 41 | 100% |
| A_train_sample | 23 | 87.0% |
| B_train_sample | 23 | 87.0% |
| C_train_sample | 23 | 100% |
| **Razem** | **200** | **94.5%** |

11 odrzuconych (<4): 4x A_real_test, 3x A_train_sample (w tym 1x ocena=1), 1x B_real_test, 3x B_train_sample.
Pattern: syntetyczne A_train najslabsze — podkrecic QC criteria przy skalowaniu.

---

### TODO next day (2026-02-26)

1. Lista zadan:
   - [ ] [2026-02-25 16:30:00 +01:00] Poinformowac Arka o decyzji GO (94.5% OK) i liscie 11 odrzuconych zdjeciach do poprawy.
   - [ ] [2026-02-25 16:30:00 +01:00] Skalowanie datasetu 3x (~800 → ~2400 imgs) — Arek dispatchuje boty na Vast.ai (budzet ~$35).
   - [ ] [2026-02-25 16:30:00 +01:00] Naprawic 11 odrzuconych (szczegoly w `review/results.csv`) — szczegolnie `synth_AH002`, `synth_AH042`.
   - [ ] [2026-02-25 16:30:00 +01:00] Podkrecic QC criteria dla synth_A przy skalowaniu (najslabsza kategoria).
   - [ ] [2026-02-25 16:30:00 +01:00] Opis pipeline'u — 1 prompt opisujacy flow: nanobanana → Gemini → LoRA → benchmark.
   - [ ] [2026-02-25 16:30:00 +01:00] Wrzucic v6a adapter do repo lub HuggingFace i podlinkowac w README.
   - [ ] [2026-02-25 16:30:00 +01:00] Film demonstracyjny — Plan A: Isaac Sim (stretch), Plan B: screen recording benchmark (zero-shot vs v6a side-by-side).
   - [ ] [2026-02-25 16:30:00 +01:00] Nowy trening LoRA na 3x datasecie po skalowaniu.

---

## 2026-02-26

### Feature: GitHub Project setup — Hackathon Sprint board

1. Branch: `main`
2. Status: `done`
3. Zrobione:
   1. [2026-02-26 ~12:00 +01:00] Stworzone 6 labelek w repo: `dataset`, `communication`, `training`, `pipeline`, `demo`, `QC`.
   2. [2026-02-26 ~12:00 +01:00] Stworzone 8 GitHub Issues (#4–#11) z TODO next day (2026-02-26) — kazdy z opisem, labelkami i zaleznoscia.
   3. [2026-02-26 ~12:00 +01:00] Stworzony GitHub Project V2: "Smoke-Resilient Intruder Detection — Hackathon Sprint" (project #11).
   4. [2026-02-26 ~12:00 +01:00] Wszystkie 8 issues dodane do projektu, status ustawiony na `Todo`.
   5. [2026-02-26 ~12:00 +01:00] Dodane pole "Due Date" w projekcie — daty rozpisane logicznie na 10-dniowy sprint (26.02–07.03).
   6. [2026-02-26 ~12:00 +01:00] Stworzony milestone "Hackathon Sprint 2026-02-26" (due: 2026-03-07) przypisany do wszystkich 8 issues.
4. Najwazniejsze artefakty:
   1. https://github.com/orgs/DataPilot-R-D/projects/11
   2. https://github.com/DataPilot-R-D/Smoke-Resilient-Intruder-Detection/milestone/1
   3. https://github.com/DataPilot-R-D/Smoke-Resilient-Intruder-Detection/issues?milestone=1

### Harmonogram sprintu (Due Dates)

| Dzien | Data | Issue | Zadanie |
|-------|------|-------|---------|
| 1 | 2026-02-26 | #4 | Poinformowac Arka o GO + 11 odrzuconych |
| 2 | 2026-02-27 | #7 | QC criteria dla synth_A — przed skalowaniem |
| 3 | 2026-02-28 | #6 | Naprawic 11 odrzuconych (synth_AH002, synth_AH042) |
| 5 | 2026-03-02 | #8 | Opis pipeline — nanobanana → Gemini → LoRA → benchmark |
| 6 | 2026-03-03 | #5 | Skalowanie datasetu 3x (~800 → ~2400 imgs) |
| 7 | 2026-03-04 | #9 | Wrzucic adapter v6a + podlinkowac w README |
| 9 | 2026-03-06 | #10 | Film demonstracyjny — zero-shot vs v6a |
| 10 | 2026-03-07 | #11 | Nowy trening LoRA na 3x datasecie |

---

## Template (kopiuj na kolejny dzien)

```md
## YYYY-MM-DD

### Feature: <nazwa>
1. Branch: `<branch-name>`
2. Status: `done|in-progress|blocked`
3. Zrobione:
   1. [YYYY-MM-DD HH:MM:SS +01:00] ...
4. Najwazniejsze artefakty:
   1. `<path/do/pliku>`
5. Referencyjne commity:
   1. `<hash>` — <opis>

### TODO next day (YYYY-MM-DD)
1. Lista zadan:
   - [ ] [YYYY-MM-DD HH:MM:SS +01:00] ...
```

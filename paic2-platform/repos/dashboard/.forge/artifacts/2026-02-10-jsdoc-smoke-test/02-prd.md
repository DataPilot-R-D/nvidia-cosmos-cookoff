# PRD — JSDoc Smoke Test (Sequential Phases + PRD Gate)

**Ticket:** `2026-02-10-jsdoc-smoke-test`  
**Owner:** Forge (Hub)  
**Date:** 2026-02-10

## 1) Goal

Wykonać minimalną zmianę: dodać JSDoc do jednej funkcji w web-client i przejść pełen cykl RESEARCH → PLAN → IMPLEMENT → REVIEW → VERIFY.

## 2) Context / Problem

Smoke test nowego workflow (Sequential Phases + PRD Gate + artifacts + progress reporting). Dodatkowo: zweryfikować działanie obu executorów (**codex** i **claude**).

## 3) Scope

**In-scope:**

- Wybrać 1 funkcję bez JSDoc w web-client.
- Dodać JSDoc (bez zmiany zachowania).
- Uruchomić codex + claude (evidence w raporcie).

**Out-of-scope:** refactor, zmiany API, zmiany behavior.

## 4) Requirements

**MUST:**

- Branch: `chore/jsdoc-smoke-test`
- Artifact folder: `.forge/artifacts/2026-02-10-jsdoc-smoke-test/`
- Checklist zawiera min. 1 item `codex` i min. 1 item `claude`

## 5) Acceptance Criteria

- PRD zapisany w artifacts.
- Commit dodaje JSDoc do dokładnie 1 funkcji.
- Evidence uruchomienia codex + claude (lub jasny blocker).
- Minimalne verify komendy uruchomione.

## 6) Proposed Solution

- Dodać JSDoc nad wybraną funkcją.

## 7) Checklist

|  ID | Task                                | Executor  | DoD                      | Evidence                     |
| --: | ----------------------------------- | --------- | ------------------------ | ---------------------------- |
|  A1 | RESEARCH: wybierz funkcję bez JSDoc | codex     | wybrany plik + symbol    | output `codex exec`          |
|  A2 | PLAN: PRD + artifacts               | consensus | PRD w artifacts          | `ls`/path                    |
|  A3 | IMPLEMENT: dodaj JSDoc              | codex     | zmiana tylko w JSDoc     | `git diff` + hash            |
|  A4 | REVIEW: review treści JSDoc         | claude    | sugestie / poprawki      | output `claude -p` lub error |
|  A5 | VERIFY: lint/test/build             | codex     | zielone lub opis limitów | output                       |

## 8) Risks / Dependencies

- Brak kredytów/konfiguracji `claude` może zablokować A4.

## 9) Test / Verification Plan

- `pnpm -C apps/web-client lint` (lub odpowiednik)
- `pnpm -C apps/web-client test` (jeśli istnieje)
- `pnpm -C apps/web-client build` (lub odpowiednik)

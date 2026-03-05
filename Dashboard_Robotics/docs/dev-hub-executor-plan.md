# Dev Hub ↔ Executor — plan integracji (Smoke Test A)

## Cel

Spójna integracja Dev Hub (UI/koordynacja) z Executor (wykonanie akcji) tak, aby:

- komendy z Dev Hub były wykonywane deterministycznie,
- stan wykonania był raportowany do UI w czasie rzeczywistym,
- bezpieczeństwo (auth, allowlist) było wymuszone na poziomie protokołu.

## Zakres (v1)

- Jedno połączenie transportowe: **Websocket-server (Socket.IO)** jako broker.
- Executor jako osobny proces/usługa (może działać na innym hoście).
- Dev Hub jako klient webowy (Next) + backend (websocket-server).

## Kontrakt zdarzeń (propozycja)

### Dev Hub → websocket-server

- `executor:run` — uruchom zadanie
  - payload: `{ requestId, kind, params, dryRun?, timeoutMs? }`
- `executor:cancel` — anuluj zadanie
  - payload: `{ requestId }`

### websocket-server → Dev Hub

- `executor:status` — status wykonania
  - payload: `{ requestId, state: 'queued'|'running'|'success'|'error'|'canceled', progress?, message?, data? }`

### websocket-server ↔ Executor

- Transport: Socket.IO namespace `/executor` albo osobny port.
- Auth: token w handshake + allowlist `kind`.

## Przepływ

1. Dev Hub wysyła `executor:run`.
2. websocket-server waliduje payload (Zod), generuje audit log, publikuje do Executor.
3. Executor wykonuje akcję i streamuje `executor:status` (progress + końcowy wynik).
4. websocket-server forwarduje `executor:status` do Dev Hub.

## Bezpieczeństwo

- Zod na wszystkich wejściach.
- Allowlist dozwolonych akcji (`kind`).
- Timeout + cancel.
- Brak sekretów w payloadach; referencje do sekretów przez ID/alias.

## Minimalne DoD (Smoke Test A)

- Dokument kontraktu + flow (ten plik).
- Repo przechodzi:
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm test:unit`
  - `pnpm build`
- PR z outputem pętli testów.

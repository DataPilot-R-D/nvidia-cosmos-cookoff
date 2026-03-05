# AGENTS.md — Dev Hub ↔ Executor Protocol

## Non-Negotiables

1. **Always TDD** — test first, then implementation. No exceptions. If test impossible: justify in PR + propose alternative (smoke/snapshot/e2e).
2. **Gitflow** — every feature/fix = new branch (`feat/...`, `fix/...`, `chore/...`). No direct commits to main.
3. **Pre-merge hygiene** — before merge: optimize, apply PR review fixes, cleanup, ALL tests green. Only then close/merge.

## Ground Rules

- **Primary coding tool:** Claude Code CLI (tmux-interactive default)
- **Fallback:** Codex CLI (only when primary fails)
- **One task = one primary tool** (don't switch mid-task)
- **No secrets** in repo / logs / diffs (only `secrets.env` / ENV)

## Non-negotiables (must-have)

1. **Always TDD**
   - Every new feature/bugfix starts with a test (or minimal regression test), then implementation.
   - If a test is not feasible, the PR MUST include: (a) why, (b) an alternative verification path (e.g. smoke test / snapshot / e2e), (c) follow-up TODO.

2. **Gitflow: branch per change**
   - Every feature/bugfix/chore happens on a new branch (naming: `feat/...`, `fix/...`, `chore/...`).
   - No direct commits to the default branch.

3. **Pre-merge hygiene (required)**
   - Apply PR review feedback.
   - Do necessary cleanup/refactor within the task scope.
   - Test loop green (lint/type-check/unit/build/format).
   - Only then close/merge.

## Stack

- **Frontend:** Next.js 14, TypeScript, Zustand, Three.js, Canvas API
- **Backend:** Bun, WebSocket (MessagePack), Rust WASM modules
- **Monorepo:** pnpm workspaces (`apps/web-client`, `apps/websocket-server`)
- **Tests:** Vitest

## Test Loop (run before every PR)

```bash
pnpm lint                    # ESLint
pnpm type-check              # TypeScript strict
pnpm test:unit               # Vitest unit tests
pnpm build                   # Production build
pnpm format:check            # Prettier
```

## Definition of Done

- [ ] All test loop commands pass (zero errors)
- [ ] No breaking changes without Dev Hub approval
- [ ] Change description: what + why + risks
- [ ] If API/behavior change: update docs/changelog

## Executor Contract (Dev Hub → Executor)

Every task MUST include:

1. **Goal + DoD** — what must be true when done
2. **Scope files** — which modules to touch / avoid
3. **Test commands** — copy-paste from above
4. **Constraints** — "no refactor", "keep API stable", etc.
5. **Mode** — `tmux-interactive` (default) or `non-interactive`

Executor ALWAYS returns:

- Changed files + what changed
- Test/verification output
- Risks / TODO
- Next steps (max 1-2)

## PR Checklist

- [ ] Problem + solution description
- [ ] Link to issue/task (if exists)
- [ ] Test results in comment
- [ ] QA Gate: GO / NO-GO

## Safety

- Never delete the disambiguation semicolon in `client.ts:2069`
- Never modify secrets/env files without explicit approval
- Rust/WASM changes require separate build verification

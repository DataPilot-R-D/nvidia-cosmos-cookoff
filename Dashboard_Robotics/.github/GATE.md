# Merge Gate Procedure

## Rules (mandatory, enforced by convention)

1. **Only maintainer merges to default branch.**
   No exceptions. Other contributors submit PRs — they never merge them.

2. **Merge requires ALL green CI checks:**
   - Lint & Type Check
   - Unit Tests
   - Build
   - Docker Build (smoke test)

   > **⚠️ Temporary Exception (Pilot Phase):**
   > `type-check` is currently set to `continue-on-error: true` in CI.
   > This allows merging while pre-existing TypeScript errors are cleaned up.
   > See TODO task: "Type-check baseline cleanup" below.
   > **This exception will be removed once all errors are fixed.**

3. **Merge requires at least one approving review** from @piotrgerke95 or designated reviewer.

4. **Merge method: squash-only.**
   Configured in repo settings. Rebase and merge commits are disabled.

5. **Branches auto-delete after merge.**

## Why convention-based?

GitHub Free for Organizations does not support branch protection or rulesets on private repos. These rules are enforced organizationally, not by GitHub UI.

## For OpenClaw agents

Agents MUST NOT:

- Push directly to the default branch
- Merge PRs without maintainer approval
- Skip CI checks

Agents MUST:

- Create feature branches for all changes
- Open PRs and wait for CI + review
- Report CI status to the orchestrator

## Escalation

If someone merges without following this procedure, the maintainer will:

1. Revert the merge
2. Re-open the PR
3. Review access permissions

---

## TODO: Type-check baseline cleanup

**Status:** 🔴 Blocked (temporary `continue-on-error` in CI)

**Pre-existing TypeScript errors to fix:**

### `apps/websocket-server`

- [ ] TS6059: rootDir conflicts with workspace imports (`@workspace/shared-types`)
- [ ] TS6133: Unused import `parser` in `index.ts`
- [ ] TS2345: Bun WebSocket type mismatches in `index.ts`
- [ ] TS2339: `getReader` type issues in `map-manager.ts`

### Root cause

The websocket-server uses Bun-specific types but tsconfig is not properly configured for monorepo workspace imports.

### Fix approach

1. Update tsconfig to use `composite: true` or fix `rootDir` settings
2. Fix or suppress unused variable errors
3. Properly type Bun server generics

**Once fixed:** Remove `continue-on-error: true` from `.github/workflows/ci-gate.yml`

---

## TODO: Dockerfiles

**Status:** 🔴 Missing (Docker build is non-blocking)

Dockerfiles don't exist yet:

- [ ] `apps/web-client/Dockerfile`
- [ ] `apps/websocket-server/Dockerfile`
- [ ] `apps/ros-bridge/Dockerfile`

**Once created:** Remove `continue-on-error: true` from Docker build step in CI

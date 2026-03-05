# PAIC2 Canonical Documentation

Last deep research pass: 2026-02-26.

This directory is the canonical technical documentation for the PAIC2 platform.

## Reading order

1. `docs/architecture/one-page-architecture-map.md`
2. `docs/architecture/c1-c5-architecture.md`
3. `docs/architecture/system-overview.md`
4. `docs/architecture/runtime-topology.md`
5. `docs/architecture/repository-boundaries.md`
6. `docs/contracts/contracts-index.md`
7. `docs/runbooks/workspace-alignment.md`
8. `docs/runbooks/deployment-and-ops.md`
9. `docs/runbooks/promotion-flow.md`
10. `docs/runbooks/risk-register.md`

## Scope

These docs cover:

- repository ownership and boundaries
- cross-repo interfaces and contracts
- runtime data/control flows
- workspace alignment and promotion
- operational procedures and known risks

These docs do not store secrets, credentials, or private operational data.

## Documentation governance

- Contract changes must update `docs/contracts/contracts-index.md`.
- New runtime components must update `docs/architecture/system-overview.md`.
- Promotion process changes must update `docs/runbooks/promotion-flow.md`.
- Any unresolved technical debt with production impact must be tracked in `docs/runbooks/risk-register.md`.

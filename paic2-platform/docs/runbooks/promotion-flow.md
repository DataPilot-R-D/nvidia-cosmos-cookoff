# Promotion Flow: Child Repo -> Platform Lock

This runbook defines how code changes become part of a platform release.

## Preconditions

- Change merged in the owning child repository.
- CI green in the child repository.
- No uncommitted changes in local working tree.

## Procedure

1. Sync workspace repositories to latest intended commits.
2. Run:
   ```bash
   ./workspace/update_lock.sh
   ```
3. Review `workspace/lock.yaml` changes and confirm only intended repos moved.
4. Update `docs/contracts/contracts-index.md` when interfaces changed.
5. Open pull request in `paic2-platform` with:
   - changed repos and old/new SHAs
   - contract impact
   - rollout notes
6. Merge only after platform governance workflow passes.

## Rollback

1. Revert the lock bump commit in `paic2-platform`.
2. Re-run bootstrap on target environment to restore prior pinned SHAs.

## Rules

- No direct production deploys from child repositories alone.
- Every deployable state must correspond to one `workspace/lock.yaml` revision.

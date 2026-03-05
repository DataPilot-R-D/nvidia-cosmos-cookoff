# Workspace Alignment Runbook

Last verified: 2026-02-26.

## Goal

Align all managed repositories to one canonical platform state defined by `workspace/lock.yaml`.

## Preconditions

- access to `paic2-platform` repository
- git credentials for all submodule remotes
- no uncommitted changes in repos you want to align

## Align workspace to lock

```bash
cd paic2-platform
./workspace/bootstrap.sh
```

Optional:

```bash
./workspace/bootstrap.sh --skip-fetch
./workspace/bootstrap.sh --allow-dirty
```

## Import external ROS dependencies

If `vcstool` is installed:

```bash
vcs import < workspace/ros2_external.repos
```

## Validate lock consistency

```bash
python3 workspace/check_lock.py
```

## Update lock after intentional upgrades

After moving selected repos to new commits:

```bash
./workspace/update_lock.sh
```

Then open a lock bump pull request in `paic2-platform`.

## Dirty workspace policy

- Do not run production deployments from dirty repositories.
- Keep experimental changes in feature branches.
- If emergency hotfix occurs on runtime host, backport to git and then promote via lock bump.

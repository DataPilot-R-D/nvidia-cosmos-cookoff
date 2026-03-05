# Isaac Sim on AWS — Master Plan Index

This index tracks all tasks and their current state. Update statuses as work progresses.

Legend: `TODO` / `IN_PROGRESS` / `DONE` / `BLOCKED`

## Tasks

| ID | Task | Status | File | Depends On |
|---|---|---|---|---|
| T00 | Local tooling preflight | DONE | `plan/tasks/T00_preflight_tooling.md` | — |
| T01 | AWS profile + region | DONE | `plan/tasks/T01_preflight_profile_region.md` | T00 |
| T02 | IAM permissions check | DONE | `plan/tasks/T02_preflight_permissions.md` | T01 |
| T03 | GPU quotas validation | DONE | `plan/tasks/T03_preflight_quotas.md` | T01 |
| T04 | Create config/env file | DONE | `plan/tasks/T04_preflight_config_file.md` | T01 |
| T05 | Verify VPN routing | TODO | `plan/tasks/T05_preflight_vpn_routes.md` | T04 |
| T10 | Author infra CFN template | DONE | `plan/tasks/T10_infra_template.md` | T00, T04 |
| T11 | Deploy infra stack | DONE | `plan/tasks/T11_infra_deploy.md` | T10 |
| T12 | Validate and capture outputs | DONE | `plan/tasks/T12_infra_validate_outputs.md` | T11 |
| T13 | Infra teardown script | TODO | `plan/tasks/T13_infra_teardown_script.md` | T10 |
| T20 | Decide Dev AMI strategy | DONE | `plan/tasks/T20_dev_ami_strategy_decision.md` | T12 |
| T21 | Create/select key pair | DONE | `plan/tasks/T21_dev_keypair.md` | T12 |
| T22 | Launch Dev builder | DONE | `plan/tasks/T22_dev_builder_launch.md` | T20, T21 |
| T23 | Bootstrap Dev builder | DONE | `plan/tasks/T23_dev_builder_bootstrap.md` | T22 |
| T24 | Bake Dev AMI | TODO | `plan/tasks/T24_dev_ami_bake.md` | T23 |
| T25 | Launch always‑on Dev | TODO | `plan/tasks/T25_dev_instance_launch.md` | T24 or Marketplace |
| T26 | Validate GUI Dev | TODO | `plan/tasks/T26_dev_validate_gui.md` | T25, T05 |
| T30 | Launch Train builder | TODO | `plan/tasks/T30_train_builder_launch.md` | T12, T21 |
| T31 | Bootstrap Train builder | TODO | `plan/tasks/T31_train_builder_bootstrap.md` | T30 |
| T32 | Bake Train AMI | TODO | `plan/tasks/T32_train_ami_bake.md` | T31 |
| T33 | Create Train LT | TODO | `plan/tasks/T33_train_launch_template.md` | T32 |
| T34 | Spot Fleet launcher | TODO | `plan/tasks/T34_train_spot_fleet_script.md` | T33 |
| T35 | Interruption hook | TODO | `plan/tasks/T35_train_interrupt_hook.md` | T34 |
| T36 | Train terminate script | TODO | `plan/tasks/T36_train_terminate_script.md` | T34 |
| T37 | Validate training tier | TODO | `plan/tasks/T37_train_validate.md` | T34–T36 |
| T40 | Write ops runbooks | TODO | `plan/tasks/T40_ops_runbooks.md` | T26, T37 |
| T41 | Cost guardrails | TODO | `plan/tasks/T41_ops_cost_guardrails.md` | T11 |
| T42 | Final readiness checklist | TODO | `plan/tasks/T42_ops_final_checklist.md` | All |
| T44 | Security hardening | TODO | `plan/tasks/T44_security_hardening.md` | T11 |
| T45 | AMI lifecycle management | TODO | `plan/tasks/T45_ami_lifecycle.md` | T24, T32 |

## Planning Rounds

- `plan/rounds/round1.md` — initial draft.
- `plan/rounds/round2.md` — review + added detail.
- `plan/rounds/round3.md` — hardening + automation.
- `plan/rounds/round4.md` — finalized atomic tasks.

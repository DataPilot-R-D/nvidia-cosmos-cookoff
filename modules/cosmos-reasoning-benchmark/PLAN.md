# Implementation Plan - Issue #28 (Agent Data-Read + Multimodal Reasoning, TDD)

**Status:** Ready for execution  
**Issue:** `#28`  
**Date:** 2026-02-18  
**Owner:** DataPilot

## 1) Objective

Implement a reproducible validation pipeline that proves what the agent can reliably read and infer from:

- Track A: `data/sensor_samples/cosmos2/message.csv`
- Track B: `data/sensor_samples/cosmos2/objects.db` (with `camera_frame_jpeg` BLOB)

The implementation must follow strict TDD (`Red -> Green -> Refactor`) and satisfy Tests 1-10 defined in Issue #28.

## 2) Scope

In scope:
- Deterministic oracle computations for expected values.
- Automated test suite for Track A and Track B.
- Agent response contract checks (strict JSON + numeric typing).
- Agent-vs-oracle comparison with numeric tolerances.
- Reproducibility controls (artifact hash pinning, repeat runs).

Out of scope:
- New ETL pipeline.
- Live stream integration.
- Production hardening beyond validation.

## 3) Fixed Inputs (must be pinned)

- `data/sensor_samples/cosmos2/message.csv`
- `data/sensor_samples/cosmos2/objects.db`
- `data/sensor_samples/cosmos2/detections_schema.sql`
- `data/sensor_samples/cosmos2/detections_schema_with_camera_blob.sql`

Pin file hashes before implementation starts and fail tests if artifacts drift.

## 4) Deliverables

Code deliverables:
- `tests/agent_validation/test_track_a_csv_oracle.py`
- `tests/agent_validation/test_track_b_db_oracle.py`
- `tests/agent_validation/test_track_b_blob_extraction.py`
- `tests/agent_validation/test_agent_response_contract.py`
- `tests/agent_validation/test_agent_vs_oracle.py`
- `tests/agent_validation/conftest.py`
- `src/benchmarks/agent_validation/oracle_track_a.py`
- `src/benchmarks/agent_validation/oracle_track_b.py`
- `src/benchmarks/agent_validation/response_contract.py`
- `src/benchmarks/agent_validation/agent_runner.py`
- `scripts/run_agent_validation.py`

Documentation deliverables:
- `docs/SENSOR_MESSAGE_SCHEMA.md` update with validation execution notes.
- `docs/AGENT_VALIDATION_REPORT.md` with measured results and pass/fail matrix.

Artifacts deliverables:
- `tests/results/agent_validation/` JSON outputs from each run.

## 5) TDD Execution Model

Each slice must follow this sequence:

1. Red:
- Add one failing test for the next behavior.
- Run only the smallest test target.
- Confirm failure is for the expected reason.

2. Green:
- Implement the minimum code to pass that test.
- Re-run the same target.

3. Refactor:
- Improve structure/naming only after green.
- Re-run related tests after each refactor step.

## 6) Implementation Slices

## Slice 0 - Test Harness Foundation

Goal:
- Establish common fixtures, tolerances, and artifact hash checks.

Red:
- Add failing tests asserting required files exist and hashes are loaded.

Green:
- Implement fixture helpers in `tests/agent_validation/conftest.py`.

Refactor:
- Consolidate duplicated path/hash helpers.

Exit criteria:
- `python3 -m pytest tests/agent_validation -k "foundation" -q` passes.

## Slice 1 - Track A Oracle (Tests 1-5)

Goal:
- Deterministic oracle for CSV computations.

Red:
- Add failing tests for:
  - row count, timestamp min/max, bbox validity.
  - group-by-timestamp expected object lists.
  - nearest/farthest distance checks.
  - co-location pair detection.
  - advanced relabel candidate evidence (`distance`, `IoU`).

Green:
- Implement `oracle_track_a.py` with pure deterministic functions.

Refactor:
- Extract reusable geometry functions (`distance_3d`, `bbox_iou`).

Exit criteria:
- `python3 -m pytest tests/agent_validation/test_track_a_csv_oracle.py -q` passes.

## Slice 2 - Track B Oracle (Tests 6,8,9,10)

Goal:
- Deterministic oracle for SQLite + BLOB metadata reasoning.

Red:
- Add failing tests for:
  - row/label/timestamp/blob-length summary.
  - timestamp-to-frame-hash consistency.
  - largest scene cluster inference.
  - temporal persistence counts.

Green:
- Implement `oracle_track_b.py` using `sqlite3` and `hashlib`.

Refactor:
- Separate DB reading from reasoning transforms.

Exit criteria:
- `python3 -m pytest tests/agent_validation/test_track_b_db_oracle.py -q` passes.

## Slice 3 - BLOB Extraction Validation (Test 7)

Goal:
- Verify `camera_frame_jpeg` export behavior and JPEG validity.

Red:
- Add failing tests that call extraction path and validate outputs.

Green:
- Reuse `scripts/query_object_database.py` from tests (subprocess) or helper import.
- Validate:
  - exported count.
  - each file decodes via Pillow.

Refactor:
- Stabilize temp-directory handling and cleanup.

Exit criteria:
- `python3 -m pytest tests/agent_validation/test_track_b_blob_extraction.py -q` passes.

## Slice 4 - Agent Response Contract

Goal:
- Enforce strict JSON contract and numeric typing.

Red:
- Add failing contract tests for malformed JSON, stringified numbers, missing keys.

Green:
- Implement `response_contract.py` schema validator utilities.

Refactor:
- Keep contract schemas centralized and versioned.

Exit criteria:
- `python3 -m pytest tests/agent_validation/test_agent_response_contract.py -q` passes.

## Slice 5 - Agent vs Oracle Comparisons

Goal:
- Compare agent outputs to deterministic oracle outputs with tolerances.

Red:
- Add failing comparison tests for each validation test family.

Green:
- Implement `agent_runner.py` and comparison helpers.
- Add repeat-run mode (minimum 3 runs) and stability summary.

Refactor:
- Isolate endpoint/model config loading from comparison logic.

Exit criteria:
- `python3 -m pytest tests/agent_validation/test_agent_vs_oracle.py -q` passes (or integration-marked when endpoint required).

## Slice 6 - CLI Runner + Reporting

Goal:
- One command to execute the full validation matrix and emit report artifacts.

Red:
- Add failing smoke test for runner CLI output structure.

Green:
- Implement `scripts/run_agent_validation.py` to:
  - run oracle checks,
  - run agent checks,
  - save `tests/results/agent_validation/*.json`.

Refactor:
- Improve report schema consistency and timestamps.

Exit criteria:
- `python3 scripts/run_agent_validation.py --help` works.
- full run writes expected files.

## 7) Test Mapping to Issue #28

- Test 1 -> `test_track_a_csv_oracle.py`
- Test 2 -> `test_track_a_csv_oracle.py`
- Test 3 -> `test_track_a_csv_oracle.py`
- Test 4 -> `test_track_a_csv_oracle.py`
- Test 5 -> `test_track_a_csv_oracle.py`
- Test 6 -> `test_track_b_db_oracle.py`
- Test 7 -> `test_track_b_blob_extraction.py`
- Test 8 -> `test_track_b_db_oracle.py`
- Test 9 -> `test_track_b_db_oracle.py`
- Test 10 -> `test_track_b_db_oracle.py`

## 8) Commands

Fast local loop:

```bash
python3 -m pytest tests/agent_validation -q
```

By slice:

```bash
python3 -m pytest tests/agent_validation/test_track_a_csv_oracle.py -q
python3 -m pytest tests/agent_validation/test_track_b_db_oracle.py -q
python3 -m pytest tests/agent_validation/test_track_b_blob_extraction.py -q
python3 -m pytest tests/agent_validation/test_agent_response_contract.py -q
python3 -m pytest tests/agent_validation/test_agent_vs_oracle.py -q
```

Runner:

```bash
python3 scripts/run_agent_validation.py
```

## 9) Reproducibility Rules

- Validate pinned file hashes for `message.csv` and `objects.db` at test startup.
- Use explicit float tolerances (`abs_tol`, `rel_tol`) in assertions.
- Run agent-dependent checks at least 3 times and report variance.
- Mark endpoint-required tests with `@pytest.mark.integration`.
- Keep deterministic oracle tests runnable offline.

## 10) Risks and Mitigations

Risk:
- Agent output format drift.
Mitigation:
- Strict response contract tests and parser hard-fail on extra prose.

Risk:
- Numeric instability in model responses.
Mitigation:
- Tolerance-based comparisons and repeat-run variance tracking.

Risk:
- Large binary artifact handling in CI.
Mitigation:
- Keep heavy BLOB extraction tests local/integration-marked if needed.

Risk:
- Coupling tests to one script entrypoint.
Mitigation:
- Keep oracle logic in `src/benchmarks/agent_validation/*`, script only as thin CLI.

## 11) Definition of Done

- All offline oracle tests pass locally.
- Agent integration tests pass for configured endpoint/model.
- Tests 1-10 from Issue #28 are represented in automated tests.
- Report artifacts are generated and stored under `tests/results/agent_validation/`.
- `docs/AGENT_VALIDATION_REPORT.md` summarizes outcomes and deviations.

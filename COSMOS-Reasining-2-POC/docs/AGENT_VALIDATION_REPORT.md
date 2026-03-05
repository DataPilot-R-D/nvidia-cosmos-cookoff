# Agent Validation Report (Issue #28)

Date: 2026-02-18  
Plan source: `PLAN.md`  
Scope: deterministic oracle + response contract + harness + CLI

## Inputs (Pinned)

- `data/sensor_samples/cosmos2/message.csv`
  - sha256: `1592fd8412fca8aa844dc65934b288c5d9bf0e322b84f01e2e01c0a840f801ac`
- `data/sensor_samples/cosmos2/objects.db`
  - sha256: `3b91c8b36499d64b36564f6edd9b47724a0b029fad8de4661027cefca0084285`

## Implemented Test Coverage

- `tests/agent_validation/test_foundation.py`
  - artifact pinning verification
- `tests/agent_validation/test_track_a_csv_oracle.py`
  - Track A Tests 1-5 deterministic oracle
- `tests/agent_validation/test_track_b_db_oracle.py`
  - Track B Tests 6, 8, 9, 10 deterministic oracle
- `tests/agent_validation/test_track_b_blob_extraction.py`
  - Track B Test 7 frame export and JPEG validity
- `tests/agent_validation/test_agent_response_contract.py`
  - strict JSON + numeric typing checks
- `tests/agent_validation/test_agent_vs_oracle.py`
  - full matrix comparisons (offline runner unit coverage + integration-marked live Cosmos checks)
- `tests/agent_validation/test_runner_cli.py`
  - CLI smoke tests
- `tests/agent_validation/test_multimodal_enrichment.py`
  - image + structured metadata enrichment validation on Track B frame BLOBs
- `tests/agent_validation/test_multimodal_evidence_matrix.py`
  - stronger multimodal evidence checks (A/B image-vs-metadata, decoys, metadata-conflict detection)

## Latest Local Results

- Command: `python3 -m pytest tests/agent_validation -q`
- Result: `35 passed, 11 skipped`
  - skipped tests are integration-marked agent-vs-oracle checks requiring live Cosmos endpoint

## Oracle Artifacts

Generated with:

```bash
python3 scripts/run_agent_validation.py --skip-agent --output-dir tests/results/agent_validation
```

Files:

- `tests/results/agent_validation/oracle_track_a.json`
- `tests/results/agent_validation/oracle_track_b.json`
- `tests/results/agent_validation/oracle_matrix.json`
- `tests/results/agent_validation/v2_v3_metrics.json`
- `tests/results/agent_validation/summary.json`

## V2 vs V3 Metrics Artifact (Phase 7, 2026-02-18)

The validation runner now emits deterministic V2-vs-V3 policy metrics:

- `summary.json["v2_vs_v3"]`
- `tests/results/agent_validation/v2_v3_metrics.json`

Latest aggregate snapshot:

- `case_count = 4`
- `early_exit_rate = 0.25`
- `v2_avg_calls_per_frame = 5.0`
- `v3_avg_calls_per_frame = 3.25`
- `estimated_call_reduction_pct = 35.0`

## Remaining Validation Step

Run endpoint-dependent comparisons (3 runs recommended):

```bash
python3 scripts/run_agent_validation.py --runs 3
```

This adds an `agent` section into `summary.json` with per-run responses and numeric mismatches vs oracle.

## Live Run Result (RunPod, 2026-02-18)

Command used:

```bash
COSMOS_API_BASE=http://127.0.0.1:18899/v1 python3 scripts/run_agent_validation.py --runs 3 --include-multimodal --multimodal-cases 2 --output-dir tests/results/agent_validation
```

Observed:

- `agent.status = "ok"`
- `runs = 3`
- Stable pass across all runs:
  - `track_a_summary`
  - `track_a_group_by_timestamp`
- Stable mismatches across all runs:
  - `track_a_spatial_extremes`
  - `track_a_colocated_pairs`
  - `track_a_relabel_candidates`
  - `track_b_summary`
  - `track_b_timestamp_hash_consistency`
  - `track_b_largest_scene_cluster`
  - `track_b_object_persistence`

Reference artifacts:

- `tests/results/agent_validation/summary.json`
- `tests/results/agent_validation/oracle_matrix.json`

## Multimodal Enrichment Check (RunPod, 2026-02-18)

Command used:

```bash
COSMOS_API_BASE=http://127.0.0.1:18899/v1 python3 -m pytest tests/agent_validation/test_multimodal_enrichment.py -m integration -q
```

Observed:

- `1 passed` (integration multimodal test)
- Uses image exported from `objects.db` + candidate metadata from same timestamp cluster.

## Strong Evidence Matrix (RunPod, 2026-02-18)

Observed multimodal metrics (2 cases):

- `avg_f1_image_enriched = 0.4`
- `avg_f1_metadata_only = 0.2`
- `f1_lift_image_minus_metadata = 0.2`
- `decoy_false_positive_rate_image = 1.0`
- `conflict_detection_rate = 0.0`
- `overall_pass = false`

Interpretation:

- Image+metadata improved F1 vs metadata-only on this sample, but
- model over-predicts decoy labels and fails metadata-conflict detection,
- so multimodal quality is not yet strong by strict thresholds.

Reference artifact:

- `tests/results/agent_validation/multimodal_evidence.json`

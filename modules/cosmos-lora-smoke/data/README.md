# Dataset

## Overview

The dataset consists of thermal camera images categorized into three classes for training a smoke-resilient person detection model.

## Categories

| Category | Description | Training | Test |
|----------|-------------|----------|------|
| **A** | Smoke + People | 225 | 45 |
| **B** | People only | 226 | 45 |
| **C** | Smoke only | 216 | 41 |
| **Total** | | **667** | **131** |

## Sources

- **FLIR ADAS Dataset** — Real thermal pedestrian images
- **KAIST Multispectral** — Paired RGB+thermal pedestrian dataset
- **Industrial thermal monitoring** — Smoke/fire scenarios
- **Curated synthetic** — Generated via nanobanana pipeline with quality control

## Format

Training data is stored in JSONL format (`train_v6a.jsonl`) with each line containing:
- A thermal image reference
- A security patrol analysis prompt
- Expected model response with person/smoke detection + threat assessment

## Quality Control

- Test set: 100% human-reviewed
- Training set: 10% random sample human-reviewed
- Automated QC pipeline for consistency checks
- Categories verified against ground truth labels

## Usage

Images are not included in this repository due to licensing.
Contact the team for dataset access for research purposes.

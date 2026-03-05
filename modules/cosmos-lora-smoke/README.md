<p align="center">
  <img src="docs/assets/banner.png" alt="Smoke-Resilient Intruder Detection" width="800"/>
</p>

<h1 align="center">🔥 Smoke-Resilient Intruder Detection</h1>

<p align="center">
  <strong>LoRA fine-tuning NVIDIA Cosmos Reason2-2B for thermal person detection through smoke screens</strong>
</p>

<p align="center">
  <a href="#results"><img src="https://img.shields.io/badge/Person_Detection-96.2%25-brightgreen?style=for-the-badge" alt="Person Detection"/></a>
  <a href="#results"><img src="https://img.shields.io/badge/Smoke_Detection-99.2%25-blue?style=for-the-badge" alt="Smoke Detection"/></a>
  <a href="#results"><img src="https://img.shields.io/badge/Improvement-+43pp-orange?style=for-the-badge" alt="Improvement"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/></a>
</p>

<p align="center">
  <a href="#problem">Problem</a> •
  <a href="#approach">Approach</a> •
  <a href="#results">Results</a> •
  <a href="#dataset">Dataset</a> •
  <a href="#training">Training</a> •
  <a href="#benchmark">Benchmark</a> •
  <a href="#quick-start">Quick Start</a>
</p>

---

## Problem

Security robots patrolling with thermal cameras face a critical challenge: **cold smoke screens** (used by intruders to evade detection) significantly degrade person detection accuracy. While thermal imaging can penetrate many types of smoke, the visual noise confuses vision-language models that weren't trained on these conditions.

**NVIDIA Cosmos Reason2-2B** — a state-of-the-art vision-language model for physical AI — achieves only **53.3% person detection** on thermal images with smoke present. This is unacceptable for security applications where missing an intruder can have serious consequences.

## Approach

We use **LoRA (Low-Rank Adaptation)** to fine-tune Cosmos Reason2-2B specifically for thermal smoke-screen scenarios, teaching the model to:

1. **Detect human thermal signatures** even when partially obscured by smoke
2. **Accurately assess smoke density** (light / medium / heavy)
3. **Provide threat assessments** for security robot patrol scenarios

### Why LoRA?

- **Parameter-efficient:** Only 278MB adapter vs 4.5GB base model
- **Fast training:** ~20 minutes on a single RTX 3090
- **Cost-effective:** ~$0.30 per training run on cloud GPU
- **No catastrophic forgetting:** Base model capabilities preserved

<a name="results"></a>
## 📊 Results

### LoRA v6a (Champion) — Real Thermal Test Set (131 images)

| Metric | Zero-Shot | LoRA v6a | Improvement |
|--------|-----------|----------|-------------|
| **Person Detection** | 53.3% | **96.2%** | **+42.9 pp** |
| **Smoke Detection** | 78.6% | **99.2%** | **+20.6 pp** |

### Breakdown by Category

| Category | Description | Images | Person (zero-shot → LoRA) | Smoke (zero-shot → LoRA) |
|----------|-------------|--------|--------------------------|--------------------------|
| **A_real** | Smoke + People | 45 | 55.6% → **91.1%** (+35.5pp) | 60.0% → **100%** |
| **B_real** | People only (no smoke) | 45 | 51.1% → **97.8%** | N/A → **97.8%** ✓ |
| **C_real** | Smoke only (no people) | 41 | N/A | 75.6% → **100%** |

> **Key insight:** The hardest category — people obscured by smoke (A_real) — saw the most dramatic improvement: **+35.5 percentage points**.

### Version Comparison

| Version | Training Data | Person % | Smoke % | Notes |
|---------|--------------|----------|---------|-------|
| Zero-shot | — | 53.3% | 78.6% | No fine-tuning |
| v3 | 35 synthetic | 93.0% | 97.0% | Synthetic thermal only |
| v5 | 164 mixed | 79.0% | 95.0% | Regression on person detection |
| **v6a** | **164 real** | **96.2%** | **99.2%** | **🏆 Champion — real thermal only** |
| v6b | 164 mixed | 94.0% | 98.0% | Real + synthetic mix |

<a name="dataset"></a>
## 📁 Dataset

### Training Set (667 images)

| Category | Count | Description |
|----------|-------|-------------|
| **A** (smoke + people) | 225 | Thermal images with people visible through smoke |
| **B** (people only) | 226 | Thermal images with people, no smoke |
| **C** (smoke only) | 216 | Thermal images with smoke, no people |

### Test Set (131 real thermal images)

| Category | Count | Source |
|----------|-------|--------|
| **A_real** | 45 | Real FLIR/thermal with smoke + people |
| **B_real** | 45 | Real FLIR/thermal with people only |
| **C_real** | 41 | Real FLIR/thermal with smoke only |

**Sources:** FLIR ADAS dataset, KAIST Multispectral Pedestrian dataset, industrial thermal monitoring footage, curated synthetic thermal (nanobanana pipeline).

### Human QA Review

All 200 images (131 test set + 69 training sample) were manually reviewed using a custom Jupyter tool — verifying that each image matches its annotation.

![QA Review Tool](docs/assets/review-notebook-tool.png)

**Result: 94.5% OK** (threshold: 80%) → pipeline quality confirmed. See [`review/`](review/) for details.

### Data Format (JSONL)

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "image", "image": "file://real/A_real/img_001.jpg"},
        {"type": "text", "text": "Analyze this thermal camera image from a security robot patrol..."}
      ]
    },
    {
      "role": "assistant",
      "content": "Yes, there is a person visible through the smoke. The thermal signature shows a warm body partially obscured by smoke. Smoke density: medium to heavy. Threat assessment: high - intruder detected in smoke screen."
    }
  ]
}
```

<a name="training"></a>
## 🏋️ Training

### Configuration

| Parameter | Value |
|-----------|-------|
| Base Model | `nvidia/Cosmos-Reason2-2B` |
| Method | LoRA (PEFT) |
| Rank (r) | 16 |
| Alpha | 32 |
| Dropout | 0.05 |
| Target Modules | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj |
| Learning Rate | 2e-4 |
| Epochs | 3 |
| Batch Size | 1 (grad accum: 8) |
| Image Size | 512px |
| Max Seq Length | 1024 |
| Precision | bf16 |
| Training Time | ~20 min (RTX 3090) |
| Adapter Size | 278 MB |

### Train

```bash
# Install dependencies
pip install torch transformers peft pillow

# Set variant
export VARIANT=v6a

# Run training
python training/train_lora.py
```

<a name="benchmark"></a>
## 🧪 Benchmark

```bash
# Run benchmark on test set
python benchmark/benchmark.py \
  --adapter-path ./adapters/v6a \
  --test-dir ./data/test \
  --output benchmark/results/
```

The benchmark evaluates:
- **Person detection accuracy** (binary: detected/not detected)
- **Smoke detection accuracy** (binary: present/absent)
- **Per-category breakdown** (A_real, B_real, C_real)
- **Response parsing** with multi-pattern matching for robustness

<a name="quick-start"></a>
## 🚀 Quick Start

### Inference

```python
import torch
from PIL import Image
from transformers import Qwen3VLForConditionalGeneration, AutoProcessor
from peft import PeftModel

# Load base model + LoRA adapter
model = Qwen3VLForConditionalGeneration.from_pretrained(
    "nvidia/Cosmos-Reason2-2B",
    torch_dtype=torch.bfloat16,
    device_map="auto"
)
model = PeftModel.from_pretrained(model, "./adapters/v6a")
model.eval()

processor = AutoProcessor.from_pretrained("nvidia/Cosmos-Reason2-2B")

# Run inference
image = Image.open("thermal_image.jpg").convert("RGB")
prompt = """Analyze this thermal camera image from a security robot patrol.
Answer these questions:
1. Are there any people visible? (yes/no) If yes, how many and where?
2. Is there smoke present? (yes/no) If yes, estimate density (light/medium/heavy).
3. Threat assessment: (none/low/medium/high/critical)
Be concise."""

messages = [{"role": "user", "content": [
    {"type": "image", "image": image},
    {"type": "text", "text": prompt}
]}]

text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = processor(text=[text], images=[image], return_tensors="pt", padding=True)
inputs = {k: v.to(model.device) if hasattr(v, 'to') else v for k, v in inputs.items()}

with torch.no_grad():
    output = model.generate(**inputs, max_new_tokens=256, do_sample=False)

response = processor.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
print(response)
```

## 📐 Architecture

```
┌─────────────────────────────────────────────────┐
│              Security Robot Patrol               │
│                                                  │
│  ┌──────────┐    ┌──────────────────────────┐   │
│  │  Thermal  │───▶│  Cosmos Reason2-2B       │   │
│  │  Camera   │    │  + LoRA v6a Adapter      │   │
│  │  (FLIR)   │    │                          │   │
│  └──────────┘    │  "Person detected through │   │
│                   │   heavy smoke at 10m.     │   │
│                   │   Threat: HIGH"           │   │
│                   └──────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 📂 Repository Structure

```
Smoke-Resilient-Intruder-Detection/
├── README.md                  ← You are here
├── LICENSE                    ← MIT License
├── training/
│   ├── train_lora.py          ← LoRA training script
│   └── config.yaml            ← Hyperparameters
├── benchmark/
│   ├── benchmark.py           ← Evaluation script
│   └── results/
│       ├── v3_results.md      ← Synthetic-only baseline
│       ├── v6a_results.md     ← Champion (real thermal)
│       └── v6b_results.md     ← Mixed data variant
├── data/
│   ├── README.md              ← Dataset documentation
│   └── dataset_manifest.csv   ← File listing + metadata
├── adapters/
│   └── v6a/                   ← LoRA adapter weights (278MB)
├── docs/
│   ├── pipeline.md            ← Full training pipeline
│   ├── methodology.md         ← Research methodology
│   └── thermal_primer.md      ← Intro to thermal imaging + smoke
└── .github/
    └── CONTRIBUTING.md
```

## 🔬 Key Findings

1. **Real thermal data >> synthetic:** v6a (real-only) outperformed v6b (mixed) — synthetic images can introduce noise
2. **LoRA is sufficient:** No need for full fine-tuning; 278MB adapter achieves near-perfect detection
3. **512px + seq_len=1024 is optimal:** Higher resolution (1024px) caused regressions
4. **Smoke doesn't fool thermal LoRA:** Even heavy smoke (A_real category) → 91.1% person detection
5. **Zero false positives on C_real:** Model correctly identifies smoke-only scenes (no hallucinated people)

## 🏗️ Built With

- **[NVIDIA Cosmos Reason2-2B](https://huggingface.co/nvidia/Cosmos-Reason2-2B)** — Base vision-language model
- **[PEFT / LoRA](https://github.com/huggingface/peft)** — Parameter-efficient fine-tuning
- **[Hugging Face Transformers](https://github.com/huggingface/transformers)** — Model inference & training
- **PyTorch** — Deep learning framework
- **[vLLM](https://github.com/vllm-project/vllm)** — High-throughput inference (benchmark)

## 👥 Team

**DataPilot R&D** — Physical AI & Robotics Division

- **Arek** — Project lead, dataset architecture, LoRA training pipeline
- **Jakub** — Repository setup & maintenance, human dataset validation, dataset review tooling, documentation, product delivery
- **Jensen** *(AI Agent)* — AI pipeline, training & benchmark automation
- **Forge** *(AI Agent)* — Implementation, CI/CD

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built for the NVIDIA Physical AI Hackathon 2026</strong><br/>
  <em>Detecting intruders when smoke tries to hide them.</em>
</p>

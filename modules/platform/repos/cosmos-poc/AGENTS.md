# Repository Guidelines

## Project Structure & Module Organization
This is a Python repository centered on surveillance benchmarking and Cosmos integration.

- `src/` core code:
  - `src/connectors/`: API client wrappers (e.g., `cosmos_client.py`)
  - `src/agents/`: agent loop and decision logic (e.g., `v3/runtime.py`)
  - `src/benchmarks/`: benchmark runners
  - `src/prompts/`: prompt templates and helpers
- `scripts/`: entry points for manual runs and experiments
- `tests/`: pytest suite with fixtures and reproducible inputs
  - `tests/inputs/`: sample images/videos/prompts used by benchmarks
  - `tests/results/`: stored raw benchmark outputs
- `docs/`: methodology, prompt guidance, and results reporting
- `requirements.txt` for Python dependencies
- `.github/workflows/` for CI and review automation

## Build, Test, and Development Commands
- `python3 -m venv .venv && source .venv/bin/activate`
- `pip install -r requirements.txt`
- `python3 -m pytest tests/ -m "not integration"` — run fast local tests
- `python3 -m pytest tests/ -m integration` — run integration tests (requires Cosmos endpoint)
- `python3 scripts/run_benchmarks_v3.py` — run the main benchmark set
- `python3 scripts/run_b13_grounding.py` — run grounding benchmark set
- `python3 scripts/cosmos_webrtc_bridge.py --ws-url <URL> --interval 2.0` — run live bridge integration

## Coding Style & Naming Conventions
- Python 3.11, 4-space indentation, explicit imports, type hints when practical.
- Prefer snake_case for functions/variables, PascalCase for classes, `snake_case.py` for files.
- Keep modules focused: one domain concern per file when possible.
- CI currently compiles key modules; run locally with:
  - `python3 -m py_compile src/connectors/cosmos_client.py src/agents/v3/runtime.py`
- Add comments/docstrings only when logic is non-obvious; keep names descriptive.

## Testing Guidelines
- Framework: `pytest` (including `pytest-asyncio` where applicable).
- Test files: `tests/test_*.py`; test names should describe scenario and expected behavior.
- Use marker-based selection consistently:
  - `not integration` for default offline CI-like runs
  - `integration` for model-endpoint-dependent checks
- Keep fixture reuse in `tests/conftest.py`; place new test data in `tests/inputs/`.

## Commit & Pull Request Guidelines
- Use concise, conventional-style commit prefixes observed in repo history:
  - `feat:`, `fix:`, `docs:`, `tests:`, `refactor:`, `ci:`, `chore:`
- PRs should target `main` via focused branches (`feature/*`, `issue/*`, etc.).
- Include:
  - What changed and why
  - Commands run (`pytest`, scripts, benchmarks)
  - Any risks, dependencies, and blocked items
  - Links to docs/issue/ticket when applicable

## Security & Configuration Notes
- Store secrets in `.env` only (copy from `.env.example`).
- Core variable example: `COSMOS_API_BASE`, `COSMOS_MODEL`, `COSMOS_API_KEY`.
- Do not commit credentials, generated logs containing external frame content, or environment overrides from local runs.

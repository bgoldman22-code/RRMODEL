# NBA Shadow Evaluation Harness

**Purpose:** Measure model prediction error pre-vs-post NBA trade deadline WITHOUT touching live production.

## Safety Guarantees
- ❌ Does NOT modify any Netlify functions, production endpoints, or daily pick generation
- ❌ Does NOT write to production Blob keys (uses `shadow/` prefix only)
- ❌ Does NOT import from production entrypoints with side effects
- ✅ Only imports pure library modules (models-inline, rci-adjustments, loaders)
- ✅ Requires `SHADOW_EVAL=1` environment variable to run
- ✅ All outputs go to `./shadow_eval/out/` only

## Quick Start

```bash
# 1. Snapshot current model artifacts (run once)
SHADOW_EVAL=1 node scripts/nba_shadow_eval/snapshot_artifacts.mjs --version v_current

# 2. Run shadow eval for a date range spanning the trade deadline
SHADOW_EVAL=1 node scripts/nba_shadow_eval/run_shadow_eval.mjs \
  --model_version v_current \
  --date_start 2026-01-15 \
  --date_end 2026-02-09 \
  --deadline 2026-02-06 \
  --mode both \
  --out ./shadow_eval/out/shadow_eval.csv

# 3. Check outputs
cat ./shadow_eval/out/shadow_eval_summary.json
cat ./shadow_eval/out/shadow_eval_report.md
```

## CLI Options

| Flag | Required | Description |
|------|----------|-------------|
| `--model_version` | Yes | Artifact snapshot name (e.g., `v_current`, `v_pre_deadline`) |
| `--date_start` | Yes | Start date `YYYY-MM-DD` |
| `--date_end` | Yes | End date `YYYY-MM-DD` |
| `--deadline` | Yes | Trade deadline date `YYYY-MM-DD`. PRE = `date < deadline`, POST = `date >= deadline` |
| `--mode` | No | `margin`, `prob`, or `both` (default: `both`) |
| `--out` | No | Output CSV path (default: `./shadow_eval/out/shadow_eval.csv`) |

## Outputs

| File | Description |
|------|-------------|
| `shadow_eval.csv` | Per-game prediction rows |
| `shadow_eval_summary.json` | PRE/POST metrics (MAE, RMSE, Brier, LogLoss, calibration) |
| `shadow_eval_report.md` | Human-readable markdown report with tables |
| `run_metadata.json` | Run metadata (commit hash, versions, freeze level, timestamp) |

## Artifact Snapshots

Before running, snapshot the current model:

```bash
SHADOW_EVAL=1 node scripts/nba_shadow_eval/snapshot_artifacts.mjs --version v_current
```

This copies:
- `models-inline.mjs` → `./shadow_eval/artifacts/v_current/models-inline.mjs`
- `rci-adjustments.mjs` → `./shadow_eval/artifacts/v_current/rci-adjustments.mjs`
- `rci-core.mjs` → `./shadow_eval/artifacts/v_current/rci-core.mjs`
- `team-priors-2024-25.mjs` → `./shadow_eval/artifacts/v_current/team-priors-2024-25.mjs`

## Tests

```bash
SHADOW_EVAL=1 node scripts/nba_shadow_eval/test_shadow_eval.mjs
```

Runs a 3-day window validation to confirm outputs exist and metrics are numeric.

## GitHub Actions

Trigger manually via Actions → "NBA Shadow Eval" → Run workflow.

Inputs: `date_start`, `date_end`, `deadline`.
Artifacts uploaded from `./shadow_eval/out/`.

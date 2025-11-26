# Phase 3.5 Line-Aware Model Progress (Pre-Backtest Snapshot)

**Date**: November 26, 2025  
**Owner**: Phase 3.5 Hybrid Logistic + LightGBM stack  
**Scope**: Summarize the feature work, sensitivity validation, and wiring changes completed before running the full v2 backtest.

---

## 1. What Changed vs Phase 3.5 (v1)

| Area | v1 State | v2 Update (Nov 26) |
| --- | --- | --- |
| Features | 60-feature schema, raw `line` rarely used | 72-feature schema with explicit `line - rolling stat` deltas + z-scores for points & rebounds |
| Training Script | No augmentation, artifact names `_v1_YYYYMMDD` | Added `augment_line_features`, emits `_v2_YYYYMMDD` artifacts |
| Models retrained | LightGBM v1 (points/rebounds/assists) | All six LightGBM models retrained; assists kept for parity but logistic remains production |
| Registry | Points/Rebounds pointing at v1 files, 60-feature list | Registry now references v2 artifacts + updated feature list and training file |
| Inference | Generator passed raw 60 features; no line deltas at runtime | Generator now augments live features using shared JS helper to mirror training logic |
| Debug tooling | Line sensitivity script only wrote raw `line` | Script now recomputes deltas/z-scores per test line, so sensitivity reflects new feature set |

---

## 2. Feature Schema (LightGBM v2)

**Total Columns**: 72  
**Additions**:
- `line_minus_L{5,10,20,40,999}_ppg` & `line_z_L10_ppg` for points markets
- `line_minus_L{5,10,20,40,999}_rpg` & `line_z_L10_rpg` for rebounds markets
- Runtime helper (`scripts/nba/_lib/line-feature-utils.mjs`) keeps inference schema in lock-step with training

**Standard Deviations used for z-scores** (computed from training set):
- Points line delta σ ≈ **2.18**
- Rebounds line delta σ ≈ **0.89**

These values are embedded in the helper so both Python and Node paths share the same scaling.

---

## 3. Fresh Line Sensitivity Checks (LeBron sample row)

Command: `node scripts/nba/debug_phase3_line_sensitivity.mjs`

| Market | Engine | Line Range Tested | Probability Shift | Takeaway |
| --- | --- | --- | --- | --- |
| player_points | LightGBM v2 | 18.5 → 28.5 | 48.70% → 49.28% (+0.59pp) | Line now registers, but effect is still mild — worth monitoring in backtest |
| player_assists | Logistic PRA | 1.5 → 11.5 | 53.04% → 51.72% (-1.32pp) | Same expected behavior as before; assists logistic untouched |
| player_rebounds | LightGBM v2 | 2.5 → 12.5 | 71.75% → 51.47% (-20.28pp) | Dramatically more line-aware after delta features |

Notes:
- First inference pass prints `[FeatureShape] ... 72 features`, confirming live pipeline is supplying the expanded schema.
- Rebounds now shows a strong monotonic drop as the line climbs — absent in v1.
- Points still only nudges ~0.6 percentage points across a 10-point swing, so thresholds and calibration should be double-checked during backtest.

---

## 4. Model Quality Snapshot (Test Set)

| Model | Test AUC | Test Accuracy | Notable Top Features |
| --- | --- | --- | --- |
| points_over_v2 | 0.543 | 0.512 | `L10_ppg`, `line_minus_L999_ppg`, `opp_def_L5_pra_allowed`, `L5_pra`, `line_minus_L5_ppg` |
| rebounds_over_v2 | 0.541 | 0.549 | `line_minus_L999_rpg`, `L999_apg`, `L999_rpg`, `games_played`, `line_minus_L10_rpg` |
| assists_over_v2 (lightgbm) | Trained but still inactive — logistic PRA remains better |

Both LightGBM models now rank at least two line-derived features inside their top-ten importance list, which did not happen in v1.

---

## 5. Wiring / Infra Updates

- `scripts/nba/generate-predictions-phase3.5.mjs`
  - Imports the shared helper and augments every odds row with line deltas before inference.
- `scripts/nba/debug_phase3_line_sensitivity.mjs`
  - Recomputes line deltas for each synthetic line so the test reflects production behavior.
- `scripts/nba/backtest-lgbm-thresholds.mjs`
  - Now loads `phase3_training_v1_20251124.jsonl`, auto-augments records, and supports `_v2_` artifact names.
- `data/nba/models/phase3_model_registry.json`
  - Updated training file pointer, `n_features`, feature list, and LightGBM artifact paths.

---

## 6. Outstanding Items Before Backtest

1. **Threshold Sweep**: Re-run `scripts/nba/backtest-lgbm-thresholds.mjs` to quantify whether the new features change win-rate/ROI curves (especially for points where the sensitivity gain is marginal).
2. **Generator Smoke Test**: Execute `node scripts/nba/generate-predictions-phase3.5.mjs` on historical odds to ensure no feature mismatches and verify runtime latency with Python subprocess calls.
3. **Documentation Refresh**: After the backtest, merge these findings into the canonical `PHASE3.5_FEATURES_AND_LINE_SENSITIVITY.md` (this file is a working scratchpad for the interim).

---

## 7. Quick Reference Commands

```bash
# Run line sensitivity diagnostic (sets up inference + deltas)
node scripts/nba/debug_phase3_line_sensitivity.mjs

# Preview updated LightGBM metadata
jq '.top_10_features' data/nba/models/phase3_lgbm/points_over_v2_20251126.json
jq '.top_10_features' data/nba/models/phase3_lgbm/rebounds_over_v2_20251126.json
```

---

**Next Action**: proceed with the full threshold backtest (points & rebounds) while keeping assists logistic untouched.

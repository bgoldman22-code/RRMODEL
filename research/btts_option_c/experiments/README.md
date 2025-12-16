# BTTS Model Experiments

This folder is for experimental model improvements.

## BASELINE (FROZEN)
- **Tag:** `BTTS_OPTION_A_BASELINE_v1`
- **Policy:** Option A — odds NOT model features
- **Features:** 148 leak-free features
- **Training AUC:** 0.6736
- **Training Date Range:** 2023-08-11 to 2025-12-08

## 🚫 DO NOT MODIFY BASELINE FILES
The following files are frozen and should NOT be edited:
- `models/logistic_leakfree_tuned_OPTION_A.pkl`
- `models/logistic_leakfree_tuned_OPTION_A_metadata.json`
- `results/walkforward_OPTION_A_metrics.csv`
- `results/walkforward_OPTION_A_bets.csv`

## Experiment Ideas
1. **Team profile decay** — season-weighted profiles
2. **Promotion/relegation handling** — new team cold-start
3. **Season-reset weighting** — half-life on prior season data
4. **Profile half-life tuning** — optimal decay rate

## How to Experiment
1. Create a new subfolder (e.g., `experiments/team_decay/`)
2. Copy relevant scripts as needed
3. Make changes ONLY in the experiment folder
4. Compare results against baseline artifacts

Created: December 16, 2025

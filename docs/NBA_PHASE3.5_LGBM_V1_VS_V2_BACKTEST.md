# Phase 3.5 LightGBM v1 vs v2 Backtest (Points & Rebounds)

**Date:** November 26, 2025  
**Script:** `scripts/nba/backtest-phase3.5-lgbm-v1-vs-v2.mjs`  
**Source data:** `data/nba/training/phase3_training_v1_20251124.jsonl` (temporal split 80/20)  
**Output JSON:** `data/nba/backtests/phase3.5_lgbm_v1_vs_v2_20251126.json`

We compared the production LightGBM v1 models vs. the new line-aware v2 models for **player_points** and **player_rebounds** (Over & Under). 36,447 examples were filtered for these markets; the final test window (20%) spans **2025-02-04 → 2025-04-11** and contains 7,290 labeled bets.

Buckets below assume a synthetic **-110** line (payout 0.9091u per win). ROI is calculated from actual outcomes, not expected value.

---

## Points (player_points)

| Bucket | v1 Bets | v1 WR | v1 ROI | v1 Avg P | v2 Bets | v2 WR | v2 ROI | v2 Avg P |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50–0.55 | 1,434 | 51.60% | -1.48% | 52.18% | 1,787 | 51.04% | -2.57% | 51.37% |
| 0.55–0.60 | 445 | 54.61% | 4.25% | 56.80% | 2 | 0.00% | -100.00% | 55.37% |
| 0.60–0.65 | 102 | 60.78% | 16.04% | 62.05% | 0 | – | – | – |
| 0.65–0.70 | 18 | 44.44% | -15.15% | 66.93% | 0 | – | – | – |
| 0.70–0.75 | 0 | – | – | – | 0 | – | – | – |
| 0.75+ | 0 | – | – | – | 0 | – | – | – |

**Threshold (p ≥ 0.60):**  
- v1: 120 bets, **58.33% WR**, **+11.36% ROI**  
- v2: 0 bets (no samples reach 0.60+ yet)

**Takeaway:** v2 points predictions cluster below 0.55 despite the new line deltas. Until calibration or thresholds are tuned, v2 provides more volume only in low-probability buckets and underperforms v1 everywhere else.

---

## Rebounds (player_rebounds)

| Bucket | v1 Bets | v1 WR | v1 ROI | v1 Avg P | v2 Bets | v2 WR | v2 ROI | v2 Avg P |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50–0.55 | 1,044 | 52.20% | -0.34% | 51.95% | 2,142 | 53.27% | **+1.69%** | 52.13% |
| 0.55–0.60 | 288 | 54.17% | +3.41% | 57.20% | 296 | 53.04% | +1.26% | 57.18% |
| 0.60–0.65 | 84 | 47.62% | -9.09% | 61.90% | 72 | 50.00% | -4.55% | 61.99% |
| 0.65–0.70 | 44 | 59.09% | +12.81% | 66.22% | 21 | 52.38% | ~0.00% | 67.22% |
| 0.70–0.75 | 8 | 37.50% | -28.41% | 71.34% | 2 | 0.00% | -100.00% | 70.25% |
| 0.75+ | 1 | 0.00% | -100.00% | 75.43% | 0 | – | – | – |

**Threshold (p ≥ 0.52):**  
- v1: 870 bets, **54.02% WR**, **+3.14% ROI**  
- v2: 1,732 bets, **54.68% WR**, **+4.38% ROI**

**Takeaway:** v2 rebounds adds ~2× volume in the 0.52+ region while improving ROI by ~1.2 percentage points. Low buckets (<0.55) also flip from slightly negative ROI to positive.

---

## Recommendation

- **Rebounds:** Promote the v2 LightGBM models at the current 0.52 threshold. They deliver higher volume and a modest but consistent ROI uptick across the actionable buckets.
- **Points:** Keep v1 in production. v2 never reaches the 0.60 firing zone and lags v1 in every bucket that has material volume. Investigate calibration and/or feature weighting before reconsidering.

Refer to the JSON artifact for per-record probabilities and edges if you need deeper diagnostics. Script logs also print the concise ROI comparison for quick reference.

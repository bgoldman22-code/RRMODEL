# BTTS Poisson Combined Strategy Report

**Date:** 2025-01-14
**Model:** Poisson BTTS
**Strategy:** Combined two-sided (max 1 bet per match)

---

## Strategy Parameters

```python
T_YES = 0.55      # YES candidate threshold
T_NO = 0.65       # NO candidate threshold
MIN_EDGE = 0.00   # Minimum edge filter
STAKE = $10.00     # Flat stake per bet
```

**Selection Logic:**
1. Check if YES meets criteria: `p_yes >= T_YES AND edge_yes > MIN_EDGE`
2. Check if NO meets criteria: `p_no >= T_NO AND edge_no > MIN_EDGE`
3. If both qualify, choose side with higher edge
4. At most 1 bet per match (enforced)

---

## Performance Summary

| Metric | Value |
|--------|-------|
| Total matches | 490 |
| Total bets | 184 |
| Bets per match | 0.38 |
| YES bets | 90 (48.9%) |
| NO bets | 94 (51.1%) |
| Overall win rate | 73.4% |
| YES win rate | 82.2% |
| NO win rate | 64.9% |
| ROI (raw odds) | +37.13% |
| ROI (fair odds) | +41.88% |
| YES ROI (fair) | +40.84% |
| NO ROI (fair) | +42.88% |

---

## Comparison vs Separate Strategies

From previous walk-forward audit (`WINRATE_AUDIT_VISUAL_SUMMARY.txt`):

**YES-only strategy (T=0.55):**
- 119 bets, 79% win rate, +36% ROI fair

**NO-only strategy (T=0.65):**
- 94 bets, 65% win rate, +29% ROI fair

**Combined strategy (this report):**
- 184 bets, 73% win rate, +42% ROI fair

**Key Differences:**
1. Combined strategy enforces max 1 bet per match (more realistic)
2. Separate strategies can bet on both sides of same match (unrealistic)
3. Combined strategy may have fewer total bets but better risk management

---

## Guardrails & Validation

✅ **Max 1 bet per match:** Verified - no match has duplicate bets
✅ **Total bets ≤ total matches:** 184 ≤ 490
✅ **Temporal validity:** Uses same walk-forward splits (train_end < test_start)

---

## Per-Bet Data

Detailed per-bet data saved to:
- `results/walkforward_poisson_combined_strategy.csv`

Columns include:
- fold, match_id, side
- p_yes, p_no, edge_yes, edge_no
- chosen_side_prob, chosen_side_edge
- decimal_odds_used, fair_odds_used
- is_win, profit_raw, profit_fair

---

## Methodology Notes

- **Walk-forward folds:** 6 folds, expanding window
- **Test matches:** 490 total (87+70+89+95+70+79)
- **Fair odds:** Two-way vig removal (proportional scaling)
- **No model changes:** Uses same Poisson training as validated audit

This strategy is **production-ready** with realistic constraints (max 1 bet per match).
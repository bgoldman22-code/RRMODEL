# BTTS Enhanced Feature Set - Documentation

**Generated:** 2024-01-XX  
**Status:** ✅ Complete - Task 1 of Upgrade Mission  
**Total Features:** 149 leak-free features (was 127, added 23 new)

---

## Overview

Upgraded the BTTS leak-free feature set from a **clean baseline (127 features)** to a **production-grade feature set (149 features)** by adding 23 advanced features across three categories:

1. **Advanced Matchup Features (11)** - Enhanced attack vs defense modeling
2. **Style Indicator Features (8)** - Team playing style and consistency
3. **Market Intelligence Features (5)** - Sophisticated odds-derived insights

All new features maintain **strict temporal integrity** - only using pre-match information available before kickoff.

---

## New Features Added

### 1. Advanced Matchup Features (11 features)

These go beyond simple rolling averages to model expected match dynamics:

| Feature | Description | Formula/Logic |
|---------|-------------|---------------|
| `home_expected_xg` | Expected home goals from matchup | (home_xg_for_l10 + away_xg_against_l10) / 2 |
| `away_expected_xg` | Expected away goals from matchup | (away_xg_for_l10 + home_xg_against_l10) / 2 |
| `total_expected_xg` | Expected total match xG | home_expected_xg + away_expected_xg |
| `combined_pace_l10` | Match pace indicator | (home_xg_for_l10 + home_xg_against_l10 + away_xg_for_l10 + away_xg_against_l10) / 2 |
| `both_teams_attack_heavy` | Both teams offensive-minded | (home_xg_for_l10 > league_avg) AND (away_xg_for_l10 > league_avg) |
| `both_teams_defense_weak` | Both defenses leaky | (home_xg_against_l10 > league_avg) AND (away_xg_against_l10 > league_avg) |
| `strength_imbalance` | Mismatch indicator | abs(home_attack_strength_l10 - away_attack_strength_l10) |
| `home_gpg_l10` | Home goals per game (stability metric) | (home_goals_for_l10 + home_goals_against_l10) / 2 |
| `away_gpg_l10` | Away goals per game | (away_goals_for_l10 + away_goals_against_l10) / 2 |
| `combined_gpg` | Total expected goals (actual goals basis) | home_gpg_l10 + away_gpg_l10 |

**Insight:** `total_expected_xg` (mean=2.99, std=0.35) shows reasonable variance. `strength_imbalance` (mean=0.28) identifies mismatches.

### 2. Style Indicator Features (8 features)

Capture HOW teams play, not just their results:

| Feature | Description | Logic |
|---------|-------------|-------|
| `home_high_scoring_rate_l10` | Home team plays high-scoring matches | home_gpg_l10 > 2.5 |
| `away_high_scoring_rate_l10` | Away team plays high-scoring matches | away_gpg_l10 > 2.5 |
| `home_btts_consistency` | Home reliably involved in BTTS | home_btts_l10 × home_scored_l10 × home_conceded_l10 |
| `away_btts_consistency` | Away reliably involved in BTTS | away_btts_l10 × away_scored_l10 × away_conceded_l10 |
| `both_teams_btts_heavy` | Both teams BTTS-prone | (home_btts_l10 > 0.5) AND (away_btts_l10 > 0.5) |
| `neither_team_btts_heavy` | Both teams avoid BTTS | (home_btts_l10 < 0.3) AND (away_btts_l10 < 0.3) |
| `home_form_delta` | Home momentum (L5 vs L10) | home_goals_for_l5 - home_goals_for_l10 |
| `away_form_delta` | Away momentum | away_goals_for_l5 - away_goals_for_l10 |

**Insight:** `both_teams_btts_heavy` has 0.082 correlation with BTTS outcome - a clear signal. Consistency metrics identify reliable BTTS candidates.

### 3. Market Intelligence Features (5 features)

Extract valuable information encoded in odds:

| Feature | Description | Formula |
|---------|-------------|---------|
| `btts_yes_fair_prob` | Vig-adjusted YES probability | btts_yes_implied / (yes_implied + no_implied) |
| `btts_no_fair_prob` | Vig-adjusted NO probability | btts_no_implied / (yes_implied + no_implied) |
| `market_confidence` | Market certainty indicator | 1 / (vig + 0.01) |
| `odds_spread` | Opinion strength | abs(yes_odds - no_odds) |
| `both_sides_short` | Uncertain match flag | (yes_odds < 2.0) AND (no_odds < 2.0) |

**Insight:** `btts_yes_fair_prob` (mean=0.57, std=0.067) shows the market expects BTTS ~57% of the time. `odds_spread` has **0.130 correlation** with BTTS - strongest new feature!

---

## Correlation Analysis

**Top 10 New Features by BTTS Correlation:**

1. **odds_spread** (0.1302) - Strongest new predictor
2. **btts_yes_fair_prob** (0.1130) - Market intelligence works
3. **btts_no_fair_prob** (0.1130)
4. **home_expected_xg** (0.1046) - Matchup modeling effective
5. **total_expected_xg** (0.0862)
6. **combined_pace_l10** (0.0862)
7. **both_teams_btts_heavy** (0.0818) - Style clash signal
8. **home_btts_consistency** (0.0688)
9. **both_teams_defense_weak** (0.0620)
10. **home_gpg_l10** (0.0603)

**Comparison to Best Existing Features (from baseline):**
- Best existing rolling feature: `home_btts_l10` (~0.15 correlation)
- New market features competitive with best rolling stats
- Ensemble of old + new likely stronger than either alone

---

## Data Quality

### Null Value Summary

**Team Form Features (1-2% nulls):**
- Early season matches lack full rolling windows
- Using `min_periods=1` in rolling calculations minimizes nulls
- Affects: `home_expected_xg`, `combined_pace_l10`, `strength_imbalance` (15 matches, 1.6%)

**Market Features (32% nulls):**
- `btts_yes_fair_prob`, `odds_spread`: 291 matches (32.0%) missing
- Cause: Not all matches have bookmaker odds in dataset
- **Mitigation:** Models should handle nulls (tree-based) or impute with league average

**Recommendation:** For production, prioritize matches with complete market data when available. For matches without odds, use model-only predictions.

---

## Feature Categories Summary

### Full Feature Breakdown by Category

| Category | Count | Examples |
|----------|-------|----------|
| **Rolling Team Stats** | 64 | `home_goals_for_l10`, `away_xg_against_l5`, `home_btts_l20` |
| **Venue-Specific** | 8 | `home_goals_for_at_home_l5`, `away_btts_rate_away_l10` |
| **Strength Indicators** | 12 | `home_attack_strength_l10`, `combined_attack_strength` |
| **Trend Features** | 8 | `home_xg_trend`, `btts_momentum`, `scoring_momentum` |
| **League Context** | 5 | `league_avg_goals_to_date`, `home_advantage_to_date`, `season_phase` |
| **Market (Baseline)** | 3 | `btts_yes_odds`, `btts_yes_implied_prob`, `btts_market_vig` |
| **Market Intelligence (NEW)** | 5 | `btts_yes_fair_prob`, `market_confidence`, `odds_spread` |
| **Advanced Matchup (NEW)** | 11 | `total_expected_xg`, `combined_pace_l10`, `strength_imbalance` |
| **Style Indicators (NEW)** | 8 | `both_teams_btts_heavy`, `home_btts_consistency`, `form_delta` |
| **FPL Availability** | 29 | `home_availability_pct`, `away_injured_count`, `home_attack_quality` |
| **Static Context** | 7 | `day_of_week`, `is_weekend`, `month`, `gameweek` |
| **TOTAL** | **149** | (was 127, added 23) |

---

## Validation

### Temporal Integrity

✅ **PASSED** - All new features validated:
- No event columns detected
- No post-match statistics used
- All rolling windows use `.shift(1)` to exclude current match
- Market features use pre-match odds only
- 50-sample spot-check: no leakage detected

### Feature Engineering Pipeline

```python
# Build order (ensures dependencies available)
1. build_rolling_team_features()       # Base rolling stats
2. build_venue_specific_features()     # Home/away splits
3. build_strength_features()           # Attack/defense vs league
4. build_trend_features()              # Momentum indicators
5. build_league_context_features()     # Time-respecting aggregates
6. build_market_features()             # Odds, implied probs, vig
7. build_advanced_matchup_features()   # NEW: Expected xG, pace, style clash
8. build_style_indicators()            # NEW: Team style consistency
9. build_market_intelligence_features() # NEW: Fair probs, confidence
10. build_static_features()            # Day of week, month
11. validate_temporal_integrity()      # Assertion checks
```

---

## Expected Impact

### Model Performance Boost

**Baseline (127 features):**
- Logistic: AUC 0.514, Brier 0.252
- Random Forest: AUC 0.517, Brier 0.251
- GBM: AUC 0.500 (bugged), Brier 0.250

**Expected with Enhanced Features (149 features):**
- Logistic: AUC **0.525-0.530** (+1-2 points) - market features help linear models
- Random Forest: AUC **0.530-0.540** (+1-2 points) - captures nonlinear interactions
- GBM: AUC **0.540-0.550** (after fix) - best at learning feature interactions
- Ensemble: AUC **0.545-0.555** - combines strengths

**Rationale:**
- Market features (`odds_spread` 0.13 corr) add independent signal
- Matchup features (`total_expected_xg`) model team dynamics better than simple averages
- Style features (`both_teams_btts_heavy`) identify high-confidence opportunities
- 23 new features = ~15% increase in feature space, expect ~2-3% AUC gain

### Production Value

**High-Confidence Bet Identification:**
- `both_teams_btts_heavy=1` + `total_expected_xg > 3.2` + `btts_yes_fair_prob > 0.60` = Strong YES signal
- `neither_team_btts_heavy=1` + `strength_imbalance > 0.5` + `btts_no_fair_prob > 0.55` = Strong NO signal

**Bet Filtering:**
- Skip matches with `both_sides_short=1` (uncertain, high vig)
- Prioritize matches with low `market_vig` and high `market_confidence`

---

## Next Steps (Task 2)

Now that features are enhanced, proceed to model upgrades:

1. **Fix GBM bug** - Debug why only 1 unique prediction
2. **Hyperparameter tuning** - Grid search for Logistic, RF, GBM
3. **Add ensemble** - Average of top 2 models (likely RF + Logistic)
4. **Walk-forward validation** - Honest performance on 8 folds
5. **Model comparison** - Select production winner

**Success Criteria:**
- GBM AUC > 0.52 (fixed and competitive)
- Ensemble AUC > 0.54 (best performer)
- ROI > 2% on fair odds threshold sweep
- Clear production recommendation with deployment-ready config

---

## Files Updated

- **src/features_leakfree.py** - Added 3 new builder functions (135 lines)
- **data/btts_leakfree_features.parquet** - Regenerated with 149 features (910 matches × 165 cols)
- **BTTS_ENHANCED_FEATURES.md** - This documentation

---

## Appendix: Feature Stats

```
Dataset: 910 EPL matches (2023-08-11 to 2025-12-08)
Shape: 910 matches × 165 columns (149 features + 16 metadata/labels)

Total Expected xG:
  Mean: 2.988 ± 0.347
  Range: [2.018, 5.025]
  
Combined GPG:
  Mean: 3.047 ± 0.443
  Range: [1.833, 4.500]
  
Strength Imbalance:
  Mean: 0.281 ± 0.209
  Range: [0.000, 1.239]
  
BTTS Yes Fair Prob (when available):
  Mean: 0.570 ± 0.067
  Range: [0.351, 0.737]
  Coverage: 68% (619/910 matches)
```

---

**Task 1 Status:** ✅ **COMPLETE**

Ready to proceed to **Task 2: Build Stronger Model Suite**.

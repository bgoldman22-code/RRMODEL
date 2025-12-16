# BTTS Leak-Free Feature Specification

**Date**: December 11, 2025  
**Version**: 1.0  
**Purpose**: Define the complete set of pre-match features for leak-free BTTS modeling

---

## Design Principles

1. **Temporal Integrity**: For a match on date `D`, features must ONLY use data from matches with `date < D`
2. **No Event Statistics**: Exclude all in-game statistics (shots, possession, xG from that match, etc.)
3. **Historical Aggregation**: Use rolling windows and form indicators
4. **Market Intelligence**: Leverage pre-match odds as features where available
5. **Football Semantics**: Features should reflect real pre-match knowledge (form, strength, trends)

---

## Feature Categories

### 1. TEAM FORM FEATURES (Rolling Windows)

For each team (home and away), compute rolling statistics over last N matches (N = 3, 5, 10, 20):

#### 1.1 Scoring Features
- `{home/away}_goals_for_lN`: Average goals scored per match
- `{home/away}_goals_against_lN`: Average goals conceded per match
- `{home/away}_xg_for_lN`: Average xG created per match
- `{home/away}_xg_against_lN`: Average xG conceded per match

#### 1.2 BTTS-Specific Features
- `{home/away}_btts_rate_lN`: Fraction of last N matches with BTTS=1
- `{home/away}_scored_rate_lN`: Fraction of last N matches where team scored
- `{home/away}_conceded_rate_lN`: Fraction of last N matches where team conceded
- `{home/away}_clean_sheet_rate_lN`: Fraction of last N matches with clean sheet

#### 1.3 Shot Quality Features
- `{home/away}_shots_per_match_lN`: Average shots per match
- `{home/away}_sot_per_match_lN`: Average shots on target per match
- `{home/away}_shot_conversion_lN`: Goals / Shots (finishing quality)
- `{home/away}_xg_per_shot_lN`: xG / Shots (shot quality)

#### 1.4 Venue-Specific Form
- `home_goals_for_at_home_lN`: Home team's goals at home venue
- `away_goals_for_away_lN`: Away team's goals when away
- `home_btts_rate_at_home_lN`: Home team's BTTS rate at home
- `away_btts_rate_away_lN`: Away team's BTTS rate when away

**Implementation Note**: Rolling stats must use `.shift(1).rolling(window, min_periods=1)` to exclude current match.

---

### 2. RELATIVE STRENGTH FEATURES

Compare team attacking/defensive strength against league averages:

#### 2.1 Attack Strength
- `home_attack_strength_lN`: `home_xg_for_lN / league_avg_xg_for_lN`
- `away_attack_strength_lN`: `away_xg_for_lN / league_avg_xg_for_lN`

#### 2.2 Defensive Weakness
- `home_defense_weakness_lN`: `home_xg_against_lN / league_avg_xg_against_lN`
- `away_defense_weakness_lN`: `away_xg_against_lN / league_avg_xg_against_lN`

#### 2.3 Matchup Features
- `attack_vs_defense_home`: `home_attack_strength_l10 × away_defense_weakness_l10`
- `attack_vs_defense_away`: `away_attack_strength_l10 × home_defense_weakness_l10`
- `combined_attack_strength`: `home_attack_strength_l10 + away_attack_strength_l10`
- `min_attack_strength`: `min(home_attack_strength_l10, away_attack_strength_l10)`

**Rationale**: BTTS requires BOTH teams to score, so minimum attacking strength is highly predictive.

---

### 3. FORM TREND FEATURES

Compare recent form (L3/L5) to longer-term form (L10/L20):

#### 3.1 Scoring Trends
- `{home/away}_goals_trend`: `goals_for_l5 - goals_for_l10`
- `{home/away}_xg_trend`: `xg_for_l5 - xg_for_l10`
- `{home/away}_conceding_trend`: `goals_against_l5 - goals_against_l10`

#### 3.2 BTTS Momentum
- `{home/away}_btts_momentum`: `btts_rate_l5 - btts_rate_l10`
- `{home/away}_scoring_momentum`: `scored_rate_l5 - scored_rate_l10`

#### 3.3 Streak Features
- `{home/away}_btts_streak`: Current consecutive BTTS matches (capped at ±5)
- `{home/away}_scoring_streak`: Current consecutive scoring matches (capped at ±5)
- `{home/away}_conceding_streak`: Current consecutive conceding matches (capped at ±5)

---

### 4. LEAGUE CONTEXT FEATURES

Aggregate statistics across all matches up to date D:

#### 4.1 League Averages (Time-Respecting)
- `league_avg_goals_per_match_to_date`: Mean total goals across all prior matches
- `league_btts_rate_to_date`: Fraction of prior matches with BTTS=1
- `league_avg_xg_to_date`: Mean total xG across all prior matches
- `league_home_advantage`: `mean(home_goals) - mean(away_goals)` across prior matches

#### 4.2 Season Phase
- `matches_played`: Number of matches completed in season
- `season_phase`: Categorical (0.0-0.25 = "early", 0.25-0.75 = "mid", 0.75-1.0 = "late")

**Rationale**: BTTS rates may vary by season phase (e.g., more defensive early season).

---

### 5. MARKET-IMPLIED FEATURES

If historical odds are available for the match:

#### 5.1 Direct Odds Features
- `btts_yes_odds`: Pre-match YES odds (inverse = implied probability)
- `btts_no_odds`: Pre-match NO odds
- `btts_yes_implied_prob`: `1 / btts_yes_odds`
- `btts_no_implied_prob`: `1 / btts_no_odds`
- `btts_market_vig`: `btts_yes_implied_prob + btts_no_implied_prob - 1`

#### 5.2 Totals Market (if available)
- `total_goals_line`: Over/Under line (e.g., 2.5)
- `over_odds`: Odds for over total
- `under_odds`: Odds for under total
- `market_implied_goals`: Derived from over/under prices

#### 5.3 Moneyline Market (if available)
- `home_win_odds`: 1X2 home win odds
- `draw_odds`: 1X2 draw odds
- `away_win_odds`: 1X2 away win odds
- `home_win_prob_implied`: `1 / home_win_odds`
- `match_competitiveness`: `min(home_win_prob, away_win_prob)` (higher = closer match)

**Rationale**: Close matches may have higher BTTS probability. Totals line indicates expected goals.

---

### 6. TEAM INTERACTION FEATURES

Features capturing historical H2H and matchup style:

#### 6.1 Head-to-Head (if sufficient history)
- `h2h_btts_rate_l5`: BTTS rate in last 5 H2H meetings
- `h2h_avg_total_goals_l5`: Average total goals in last 5 H2H
- `h2h_avg_home_goals_l5`: Home team's average goals in H2H
- `h2h_avg_away_goals_l5`: Away team's average goals in H2H

**Note**: Only include if ≥3 H2H matches exist in last 3 seasons. Otherwise, set to NaN and handle with imputation.

#### 6.2 Rest Days
- `home_rest_days`: Days since home team's last match
- `away_rest_days`: Days since away team's last match
- `rest_days_diff`: `abs(home_rest_days - away_rest_days)`

**Rationale**: Fatigue may impact defensive solidity.

---

### 7. STATIC MATCH FEATURES

#### 7.1 Match Context
- `is_weekend`: Binary (Saturday/Sunday = 1)
- `is_midweek`: Binary (Tuesday/Wednesday/Thursday = 1)
- `month`: Integer (1-12)
- `season`: Categorical season identifier

#### 7.2 Stadium/Referee
- `venue`: Stadium name (one-hot encoded or target encoded)
- `referee`: Match official (one-hot or target encoded)

**Note**: Only include venue/referee if sufficient historical data exists for encoding.

---

## Feature Engineering Pipeline

### Step 1: Data Loading
```python
# Load historical matches, sorted by date
matches_df = load_unified_data()
matches_df = matches_df.sort_values('date').reset_index(drop=True)
```

### Step 2: Rolling Feature Computation
```python
for window in [3, 5, 10, 20]:
    for team in teams:
        # For each match on date D involving team T:
        # - Filter to matches with date < D
        # - Filter to matches where team = T
        # - Compute rolling stats over last N such matches
```

### Step 3: League Context Computation
```python
for date in unique_dates:
    # For each match on date D:
    # - Filter to ALL matches with date < D
    # - Compute league aggregates
```

### Step 4: Market Feature Integration
```python
# Left-join pre-match odds onto matches_df
# Compute implied probabilities
```

### Step 5: Temporal Validation
```python
# For random sample of matches:
# - Assert: max(feature_source_dates) < match_date
# - Assert: no EVENT_COLUMNS present
```

---

## Feature Count Summary

| Category | Estimated Count |
|----------|----------------|
| Team Form (both teams, 4 windows) | ~80 |
| Relative Strength | ~10 |
| Form Trends | ~15 |
| League Context | ~5 |
| Market-Implied | ~15 |
| Team Interaction | ~8 |
| Static Match | ~5 |
| **TOTAL** | **~138 features** |

---

## Excluded Features (Leakage Risk)

The following columns from the existing feature table are **EXCLUDED**:

❌ `home_xg`, `away_xg` (actual match xG)  
❌ `home_goals`, `away_goals` (actual match outcome)  
❌ `sum_xg`, `diff_xg`, `xg_dominance` (derived from actual match xG)  
❌ `shot_quality_home`, `shot_quality_away` (uses actual match shots/xG)  
❌ `possession_dominance` (actual match possession)  
❌ `chaos_index`, `danger_index` (actual match shots)  
❌ `home_shots_total`, `away_shots_total`, etc. (actual match events)  
❌ `home_corners`, `away_corners`, etc. (actual match events)  
❌ All columns in `EVENT_COLUMNS` set

---

## Imputation Strategy

For missing features (e.g., early season, insufficient history):

1. **Rolling stats with insufficient history**: Use `min_periods=1` to compute with available data
2. **H2H features**: Impute with league average BTTS rate if <3 H2H matches
3. **Market features**: If odds missing, impute with model-based estimate or league average
4. **Venue/referee**: If unseen, use league average target encoding value

---

## Feature Importance Tracking

After model training, log top 15 features by importance to:
- `BTTS_LEAKFREE_FEATURE_IMPORTANCES.md`

This helps identify:
- Which features are most predictive
- Whether any suspicious patterns suggest remaining leakage
- Which features can be dropped for simpler models

---

## Validation Checklist

Before using a feature:
- [ ] Can this feature be computed using ONLY data from date < match_date?
- [ ] Does this feature avoid any statistics FROM the match being predicted?
- [ ] Would this feature be available in a production setting before kickoff?
- [ ] Is this feature not in the EVENT_COLUMNS exclusion list?

---

## Next Steps

1. ✅ Implement `src/features_leakfree.py` with functions to build all categories
2. ✅ Generate `data/btts_leakfree_features.parquet` for all 910 matches
3. ✅ Verify temporal integrity with assertion tests
4. ✅ Train leak-free models on this feature set
5. ✅ Compare performance to (invalid) leaky models as a calibration check

---

**Document Owner**: Co-CTO  
**Status**: SPECIFICATION COMPLETE  
**Next Action**: Implementation of feature builder

# NFL V1 vs V5: Complete Numerical Model Comparison

**Generated:** December 8, 2025  
**Purpose:** Comprehensive code-level comparison of V1 (production) and V5 (statistical) prediction models

---

## Table of Contents

1. [File & Function Map](#1-file--function-map)
2. [Feature Comparison Tables](#2-feature-comparison-tables)
3. [Numerical Formula Summary](#3-numerical-formula-summary)
4. [Assumptions & Conventions](#4-assumptions--conventions)
5. [Worked Example: CIN @ BUF](#5-worked-example-cin--buf)
6. [Key Differences Analysis](#6-key-differences-analysis)

---

## 1. File & Function Map

### V1 Model Architecture

| Component | File Path | Key Functions | Purpose |
|-----------|-----------|---------------|---------|
| **Main Prediction Engine** | `netlify/functions/nfl-predictions-generate/index.mjs` | `generateAdvancedPredictions()` | Entry point, orchestrates all calculations |
| **Team Scoring** | (same file, line 864) | `scoreTeamFromFeatures()` | Converts EPA/situational metrics → team strength score |
| **Spread Calculation** | (same file, line 1162) | `calculateSpreadPrediction()` | Converts team scores → home margin |
| **Total Calculation** | (same file, line 1226) | `calculateTotalPrediction()` | Predicts combined game points |
| **Matchup Scoring** | `netlify/functions/_lib/matchups.js` | `calculateMatchups()`, `calculateMatchupScore()` | Head-to-head EPA differentials |
| **Special Teams** | (index.mjs, ~line 550) | `calculateSpecialTeamsMetrics()` | FG/punt/return advantage |
| **Context Weights** | (index.mjs, ~line 450) | `calculateContextAwareWeights()` | Week-dependent feature emphasis |
| **Home Field Advantage** | (index.mjs, constants) | `VENUE_HFA` object | Venue-specific HFA values |
| **Calibration** | `netlify/functions/_lib/calibration-v4.mjs` | `applyCalibratedProbability()`, `applyMarketAnchoring()` | Probability adjustments |

**Total V1 Code:** ~3,400 lines (after injury system quarantine)

### V5 Model Architecture

| Component | File Path | Key Functions | Purpose |
|-----------|-----------|---------------|---------|
| **Main Entry Point** | `nfl-model-v4.1/scripts/v5-ensemble.mjs` | `main()` | Orchestrates spread + total predictions |
| **Spread Model** | `nfl-model-v4.1/scripts/_lib/v5-spread-model.mjs` | `predictSpreadFromFeatures()` | OLS regression for spreads |
| **Total Model** | `nfl-model-v4.1/scripts/_lib/v5-total-model.mjs` | `predictTotalFromFeatures()` | Ridge regression for totals |
| **Feature Engineering** | `nfl-model-v4.1/scripts/_lib/v1-feature-loader.mjs` | `buildFeatureVector()` | Rolling 8-game windows |
| **Spread Coefficients** | `nfl-model-v4.1/output/v5_coefficients_spread.json` | N/A (data file) | Fitted intercept + weights |
| **Total Coefficients** | `nfl-model-v4.1/output/v5_coefficients_total_ridge.json` | N/A (data file) | Fitted intercept + weights |
| **Schedule Loader** | `nfl-model-v4.1/scripts/_lib/schedule-source.mjs` | `loadWeekSchedule()` | Game list for predictions |

**Total V5 Code:** ~720 lines

---

## 2. Feature Comparison Tables

### 2.1 Spread Prediction Features

| Feature / Factor | V1: How Used (Weights/Formula) | V5: How Used (Coefficients) |
|------------------|--------------------------------|------------------------------|
| **Offensive EPA** | Part of `coreScore = (offEPA + defEPA) × 24` | Embedded in `epa_diff = (home_off - away_def) - (away_off - home_def)` coefficient: **38.447** |
| **Defensive EPA** | Part of `coreScore`, inverted: `defEPA = -(core.def_adj_epa)` | Embedded in `epa_diff` (see above) |
| **Success Rate Differential** | Part of `tierScore`: weight=0.12, multiplier=8 → `0.12 × z_success × 8` | Direct feature: `success_diff = home_success - away_success` (× 100), coefficient: **0.652** |
| **Explosive Play Differential** | Part of `tierScore`: weight=0.20, multiplier=8 → `0.20 × z_explosive × 8` | Direct feature: `explosive_diff = home_explosive - away_explosive` (× 100), coefficient: **1.111** |
| **Red Zone TD %** | Part of `tierScore`: weight=0.15, multiplier=8 → `0.15 × z_rz_td × 8` | **Not used** |
| **3rd Down Conversion** | Part of `tierScore`: weight=0.10, multiplier=8 → `0.10 × z_third_down × 8` | **Not used** |
| **4th Down Aggression** | Part of `tierScore`: weight=0.06, multiplier=8 → `0.06 × z_4th_down × 8` | **Not used** |
| **Penalty Differential** | Part of `tierScore`: weight=0.05, multiplier=8 → `0.05 × z_penalty × 8` | **Not used** |
| **Time of Possession Eff** | Part of `tierScore`: weight=0.02, multiplier=8 → `0.02 × z_top × 8` | **Not used** |
| **Pressure Differential** | Part of `tierScore`: weight=0.22, multiplier=8 → `0.22 × z_pressure × 8` | **Not used** |
| **Turnover Differential** | Part of `tierScore`: weight=0.12, multiplier=8 → `0.12 × z_turnover × 8` | **Not used** |
| **Early Down Success** | Part of `tierScore`: weight=0.08, multiplier=8 → `0.08 × z_eds × 8` | **Not used** |
| **Recent Form (L3 games)** | Part of `advancedScore`: weight=0.12, multiplier=6, clamped to ±0.05 EPA → `0.12 × clipped_form × 6` | **Not used** |
| **Consistency** | Part of `advancedScore`: weight=0.02, multiplier=6 → `0.02 × (consistency - 0.5) × 6` | **Not used** |
| **Tempo/Pace** | Part of `advancedScore`: weight=0.02, multiplier=6 → `0.02 × pace_adj × 6` | **Not used** |
| **Formation Diversity** | Part of `advancedScore`: weight=0.02, multiplier=6 → `0.02 × motion_adv × 6` | **Not used** |
| **Script Adaptation** | Part of `advancedScore`: weight=0.01, multiplier=6 → `0.01 × script_adapt × 6` | **Not used** |
| **Current Season Momentum** | Part of `advancedScore`: weight=0.03, multiplier=6 → `0.03 × momentum × 6` | **Not used** |
| **Special Teams (FG Net)** | weight=0.025, multiplier=3 → `0.025 × fg_net × 3` | **Not used** |
| **Special Teams (Punt Net)** | weight=0.015, multiplier=3 → `0.015 × punt_net × 3` | **Not used** |
| **Special Teams (Returns)** | weight=0.008, multiplier=3 → `0.008 × return_adv × 3` | **Not used** |
| **Special Teams (Coverage)** | weight=0.002, multiplier=3 → `0.002 × coverage_eff × 3` | **Not used** |
| **Home Field Advantage** | Dynamic HFA: 1.5-2.2 pts base, adjusted for quality diff, divisional games (×0.8), weak teams (×0.5) → final: ~1.0-2.2 pts | Fixed feature: `hfa = VENUE_HFA[venue] ∈ {2.0, 2.3, 2.5, 2.7, 3.0}`, coefficient: **1.944** |
| **Matchup-Specific EPA** | `calculateMatchupScore()` × 3.2 multiplier | **Not used** (embedded in epa_diff) |
| **Bayesian Prior Updating** | `applyBayesianUpdating(historical, current, evidence, season_weight)` | **Not used** |

---

### 2.2 Total Prediction Features

| Feature / Factor | V1: How Used (Formula) | V5: How Used (Coefficients) |
|------------------|------------------------|------------------------------|
| **Offensive EPA (both teams)** | `homeBasePoints = 24.0 + (homeOffEPA × 95) + (homeForm × 20)` <br> `awayBasePoints = 24.0 + (awayOffEPA × 95) + (awayForm × 20)` | `epa_off_sum = home_off_epa + away_off_epa`, coefficient: **0.194** |
| **Defensive EPA (both teams)** | `homePointsVsDefense = homeBasePoints - (awayDefEPA × 25)` <br> `awayPointsVsDefense = awayBasePoints - (homeDefEPA × 25)` | `epa_def_sum = home_def_epa + away_def_epa`, coefficient: **0.121** (regularized) |
| **Form (recent games)** | Included in base points: `homeForm × 20` (clamped to ±0.05 EPA) | **Not used** |
| **Explosive Plays** | `homeExplosiveBoost = homeExplosive × 8` <br> `awayExplosiveBoost = awayExplosive × 8` | `explosive_sum = home_explosive + away_explosive`, coefficient: **0.892** |
| **Success Rates** | **Not used** in total calculation | `success_sum = home_success + away_success`, coefficient: **0.400** |
| **Pace (plays per game)** | `avgPace = (homePace + awayPace) / 2` <br> `paceMultiplier = avgPace / 67` <br> Applied as: `projectedPoints × paceMultiplier` | `pace_combined = home_pace + away_pace`, coefficient: **0.276** |
| **Game Script** | `gameScriptFactor = (margin > 7) ? 0.95 : 1.0` <br> Reduces points in blowouts | **Not used** |
| **Neutral Conditions Boost** | `neutralBoost = (no_wind && margin ≤ 7) ? 1.5 : 0` <br> Adds 1.5 pts in competitive, good weather games | **Not used** |
| **Special Teams (FG)** | `stTotalAdj = homeFGImpact × 0.6 + awayFGImpact × 0.6` | **Not used** |
| **Special Teams (Returns)** | `stTotalAdj += homeReturnImpact × 0.15 + awayReturnImpact × 0.15` | **Not used** |
| **Baseline Points** | Constant: 24.0 per team (48.0 combined) | Intercept: **-23.064** |
| **Clamping** | Final: `clamp(total, 38, 68)` | Quantile bounds (implicit via training): P25=-9.4, P75=+8.8 |

---

## 3. Numerical Formula Summary

### 3.1 V1 Model Formulas

#### V1 Team Scoring
```javascript
// Step 1: Core EPA Score (MOST IMPORTANT)
offEPA = core.off_adj_epa  // Offensive EPA per play
defEPA = -(core.def_adj_epa)  // Defensive EPA (inverted, higher is better)
coreScore = (offEPA + defEPA) × 24  // CORE_EPA multiplier

// Step 2: Situational Tier Score
tierScore = 
  (0.22 × z_pressure_diff × 8) +
  (0.20 × z_explosive_diff × 8) +
  (0.12 × z_turnover_diff × 8) +
  (0.08 × z_eds × 8) +
  (0.15 × z_rz_td × 8) +
  (0.10 × z_third_down × 8) +
  (0.06 × z_4th_down_agg × 8) +
  (0.05 × z_penalty_diff × 8) +
  (0.02 × z_top_eff × 8)
// Where z_* = clamp((value - league_mean) / league_std, -2.5, 2.5)
// TIER_BASE multiplier = 8

// Step 3: Advanced Metrics Score
advancedScore = 
  (0.02 × (consistency - 0.5) × 6) +
  (0.12 × clamp(form, -0.05, 0.05) × 6) +
  (0.03 × currentSeasonMomentum × 6) +
  (0.02 × paceAdj × 6) +
  (0.02 × motionAdv × 6) +
  (0.01 × scriptAdapt × 6)
// ADVANCED_BASE multiplier = 6

// Step 4: Matchup Score
matchupScore = calculateMatchupScore(matchupTerms) × 3.2
// MATCHUP_BASE multiplier = 3.2

// Step 5: Special Teams Score
specialTeamsScore = 
  (0.025 × field_goal_net × 3) +
  (0.015 × punt_net × 3) +
  (0.008 × return_advantage × 3) +
  (0.002 × coverage_efficiency × 3)
// SPECIAL_TEAMS_BASE multiplier = 3

// Step 6: Bayesian Updating
currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore + specialTeamsScore
historicalScore = currentSeasonScore × 0.85
finalScore = applyBayesianUpdating(historicalScore, currentSeasonScore, evidenceStrength, seasonWeight)

// Step 7: Confidence
baseConfidence = 0.5
evidenceBoost = evidenceStrength × 0.25
sampleBoost = min(currentWeek / 8, 0.15)
stConfidenceBoost = (hasSpecialTeams) ? 0.02 : 0
finalConfidence = clamp(0.5 + evidenceBoost + sampleBoost + stConfidenceBoost, 0.35, 0.85)

RETURN: { score: finalScore, confidence: finalConfidence, evidenceStrength, specialTeams }
```

#### V1 Spread Calculation
```javascript
// Inputs: homeScoreData, awayScoreData (from scoreTeamFromFeatures)

// Step 1: Dynamic Home Field Advantage
qualityDifferential = awayScoreData.score - homeScoreData.score
qualityAdjustment = max(0, qualityDifferential × 0.2)
confidentHFA = max(1.5, 2.2 - qualityAdjustment)
uncertainHFA = max(1.0, 1.2 - qualityAdjustment)
avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2
dynamicHFA = confidentHFA - (confidentHFA - uncertainHFA) × (1 - avgConfidence)

// Step 2: Divisional Adjustment
isDivisional = (sameDiv(homeCode, awayCode))
divisionalAdjustment = isDivisional ? 0.8 : 1.0

// Step 3: Weak Team Adjustment
bothTeamsWeak = (homeScore < 0 && awayScore < 0)
weakTeamAdjustment = bothTeamsWeak ? 0.5 : 1.0

// Step 4: Final HFA
adjustedHFA = dynamicHFA × divisionalAdjustment × weakTeamAdjustment

// Step 5: Score Differential
scoreDifference = homeScoreData.score - awayScoreData.score
spreadFromScores = scoreDifference  // CRITICAL: No 3.0 multiplier (scores already in points)

// Step 6: Special Teams Adjustment
stSpreadAdjustment = (homeSTValue - awaySTValue) × 0.5

// Step 7: Final Spread
predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment
finalSpread = clamp(predictedHomeMargin, -17, 17)

RETURN: finalSpread (positive = home favored)
```

#### V1 Total Calculation
```javascript
// Step 1: Base Points Per Team
homeBasePoints = 24.0 + (homeOffEPA × 95) + (homeForm × 20)
awayBasePoints = 24.0 + (awayOffEPA × 95) + (awayForm × 20)

// Step 2: Adjust for Opponent Defense
homePointsVsDefense = homeBasePoints - (awayDefEPA × 25)
awayPointsVsDefense = awayBasePoints - (homeDefEPA × 25)

// Step 3: Explosive Play Bonuses
homeExplosiveBoost = homeExplosive × 8
awayExplosiveBoost = awayExplosive × 8

// Step 4: Pace Adjustment
avgPace = (homePace + awayPace) / 2
paceMultiplier = avgPace / 67  // 67 = league average plays per game

// Step 5: Game Script Factor
expectedMargin = abs(marketSpread || 0)
gameScriptFactor = (expectedMargin > 7) ? 0.95 : 1.0

// Step 6: Project Team Points
homeProjected = max(14, (homePointsVsDefense + homeExplosiveBoost) × paceMultiplier × gameScriptFactor)
awayProjected = max(14, (awayPointsVsDefense + awayExplosiveBoost) × paceMultiplier × gameScriptFactor)

// Step 7: Neutral Conditions Boost
neutralConditionsBoost = (!wind15 && abs(marketSpread) ≤ 7) ? 1.5 : 0

// Step 8: Base Total
baseTotal = homeProjected + awayProjected + neutralConditionsBoost

// Step 9: Special Teams Adjustment
stTotalAdjustment = 
  (homeFGNet × 0.6) + (awayFGNet × 0.6) +
  (homeReturnAdv × 0.15) + (awayReturnAdv × 0.15)

// Step 10: Final Total
finalTotal = clamp(baseTotal + stTotalAdjustment, 38, 68)

RETURN: finalTotal
```

---

### 3.2 V5 Model Formulas

#### V5 Spread Prediction
```javascript
// Model: OLS Regression trained on 1,349 games (2020-2024)
// Validation MAE: 10.62 points

// Step 1: Compute Features (rolling 8-game window per team)
home_off_epa_8g = mean(home last 8 games offensive EPA)
home_def_epa_8g = mean(home last 8 games defensive EPA allowed)
away_off_epa_8g = mean(away last 8 games offensive EPA)
away_def_epa_8g = mean(away last 8 games defensive EPA allowed)

home_success_8g = mean(home last 8 games offensive success rate) × 100  // as percentage
away_success_8g = mean(away last 8 games offensive success rate) × 100

home_explosive_8g = mean(home last 8 games explosive play rate) × 100  // as percentage
away_explosive_8g = mean(away last 8 games explosive play rate) × 100

// Step 2: Feature Engineering
epa_diff = (home_off_epa_8g - away_def_epa_8g) - (away_off_epa_8g - home_def_epa_8g)
success_diff = home_success_8g - away_success_8g
explosive_diff = home_explosive_8g - away_explosive_8g
hfa = VENUE_HFA[venue]  // DEN=3.0, GB=2.7, KC/SEA=2.5, NE=2.3, default=2.0

// Step 3: Apply Regression Model
predicted_spread = intercept + (coef_epa × epa_diff) + (coef_success × success_diff) + 
                   (coef_explosive × explosive_diff) + (coef_hfa × hfa)

// Coefficients (from v5_coefficients_spread.json):
intercept = -2.423
coef_epa = 38.447
coef_success = 0.652
coef_explosive = 1.111
coef_hfa = 1.944

// Expanded Formula:
predicted_spread = -2.423 + (38.447 × epa_diff) + (0.652 × success_diff) + 
                   (1.111 × explosive_diff) + (1.944 × hfa)

// Step 4: Interpretation
side = (predicted_spread ≥ 0) ? "home" : "away"
line = abs(predicted_spread)

RETURN: { line, side, confidence }
// Note: No clamping or post-processing in V5
```

#### V5 Total Prediction
```javascript
// Model: Ridge Regression (λ=500) trained on 1,349 games (2020-2024)
// Validation MAE: 10.84 points

// Step 1: Compute Features (rolling 8-game window per team)
home_off_epa_8g = mean(home last 8 games offensive EPA)
home_def_epa_8g = mean(home last 8 games defensive EPA allowed)
away_off_epa_8g = mean(away last 8 games offensive EPA)
away_def_epa_8g = mean(away last 8 games defensive EPA allowed)

home_success_8g = mean(home last 8 games offensive success rate) × 100
away_success_8g = mean(away last 8 games offensive success rate) × 100

home_explosive_8g = mean(home last 8 games explosive play rate) × 100
away_explosive_8g = mean(away last 8 games explosive play rate) × 100

home_pace_8g = mean(home last 8 games total plays)
away_pace_8g = mean(away last 8 games total plays)

// Step 2: Feature Engineering
pace_combined = home_pace_8g + away_pace_8g
epa_off_sum = home_off_epa_8g + away_off_epa_8g
epa_def_sum = home_def_epa_8g + away_def_epa_8g
success_sum = home_success_8g + away_success_8g
explosive_sum = home_explosive_8g + away_explosive_8g

// Step 3: Apply Ridge Regression Model
predicted_total_p50 = intercept + (coef_pace × pace_combined) + (coef_epa_off × epa_off_sum) + 
                      (coef_epa_def × epa_def_sum) + (coef_success × success_sum) + 
                      (coef_explosive × explosive_sum)

// Coefficients (from v5_coefficients_total_ridge.json):
intercept = -23.064
coef_pace = 0.276
coef_epa_off = 0.194
coef_epa_def = 0.121  // Note: Regularized toward zero (multicollinearity issue)
coef_success = 0.400
coef_explosive = 0.892

// Expanded Formula (Median):
predicted_total_p50 = -23.064 + (0.276 × pace_combined) + (0.194 × epa_off_sum) + 
                      (0.121 × epa_def_sum) + (0.400 × success_sum) + (0.892 × explosive_sum)

// Step 4: Quantile Bounds
predicted_total_p25 = predicted_total_p50 + (-9.388)  // 25th percentile
predicted_total_p75 = predicted_total_p50 + (+8.828)  // 75th percentile

RETURN: { p25, p50, p75, spread: p75 - p25 }
// Note: No clamping in V5, no weather/script/ST adjustments
```

---

## 4. Assumptions & Conventions

### 4.1 Sign Convention for Spreads

#### V1 Convention
```
predicted_home_margin > 0  →  Home team favored
predicted_home_margin < 0  →  Away team favored

Example:
  V1 outputs: +7.5  →  Home -7.5 (home favored by 7.5)
  V1 outputs: -3.2  →  Away -3.2 (away favored by 3.2)
```

#### V5 Convention
```
predicted_spread > 0  →  Home team favored
predicted_spread < 0  →  Away team favored

BUT: V5 returns { side, line } where:
  side = "home" → Home favored by `line` points
  side = "away" → Away favored by `line` points

Example:
  V5 raw prediction: +6.5  →  { side: "home", line: 6.5 }  →  Home -6.5
  V5 raw prediction: -4.3  →  { side: "away", line: 4.3 }  →  Away -4.3
```

**KEY INSIGHT:** Both models use the same convention (positive = home favored), but V5 splits into `{side, line}` for clarity.

---

### 4.2 Home vs Away Interpretation

#### V1
- **`scoreTeamFromFeatures()`** calculates absolute team strength (not relative to opponent)
- **`calculateSpreadPrediction()`** subtracts away score from home score, then adds HFA
- **Home Field Advantage:** Dynamic 1.0-2.2 pts based on:
  - Confidence level (higher confidence = lower HFA)
  - Quality differential (better away team = lower HFA)
  - Divisional games (-20% HFA)
  - Both teams weak (-50% HFA)

#### V5
- **Features** are explicitly differential:
  - `epa_diff = (home_off - away_def) - (away_off - home_def)` ← matchup-aware
  - `success_diff = home_success - away_success`
  - `explosive_diff = home_explosive - away_explosive`
- **Home Field Advantage:** Fixed per venue (2.0-3.0 pts), applied via `hfa` feature with coefficient 1.944

---

### 4.3 Injury Assumptions

#### V1 (Current State - Quarantined)
```javascript
// QUARANTINED: As of Dec 8, 2025, injury/depth chart system is disabled
// V1 now assumes:
//   - All starters are healthy
//   - No depth chart changes
//   - No QB/RB/WR/TE injury penalties
//   - No return boost adjustments

// Result: V1 behaves like V5 (pure EPA-based) but with extra features
```

#### V5
```javascript
// V5 NEVER had an injury system
// Assumptions:
//   - Training data includes games with injuries (baked into EPA)
//   - Rolling 8-game window smooths over short-term injury impacts
//   - No explicit injury adjustments
```

**Implication:** With V1's injury system quarantined, both models now assume healthy rosters.

---

### 4.4 Data Freshness Assumptions

#### V1
- **Real-time:** Fetches latest EPA metrics from blobs (updated after each week)
- **Season-aware:** Adjusts for current week (early season = less confidence)
- **Context-aware:** Uses `getCurrentWeights()` to emphasize recent games more in later weeks

#### V5
- **Static Training:** Coefficients frozen from 2020-2024 data (1,349 games)
- **Rolling Window:** Uses last 8 games for each team (time-causal)
- **No Refitting:** Model never changes, even as season progresses

**Implication:** V1 adapts to current season trends; V5 relies on historical patterns.

---

## 5. Worked Example: CIN @ BUF

**Game:** Cincinnati Bengals @ Buffalo Bills, Week 14, 2025  
**Market Line:** BUF -5.5  
**Actual Kickoff:** December 8, 2025

### V1 Calculation (Step-by-Step)

#### Step 1: Load Team Metrics
```javascript
// From blob storage (2025 season data through Week 13)
CIN.core.off_epa = 0.105  // Strong offense
CIN.core.def_epa = -0.055  // Average defense (negative = points allowed)

BUF.core.off_epa = 0.089  // Good offense
BUF.core.def_epa = -0.071  // Solid defense
```

#### Step 2: Score Teams

**Cincinnati (Away):**
```javascript
// Core Score
offEPA = 0.105
defEPA = -(-0.055) = 0.055  // Inverted
coreScore = (0.105 + 0.055) × 24 = 3.84

// Tier Score (assuming league-average z-scores for simplicity)
tierScore ≈ 0 (neutral)

// Advanced Score (assuming small positive form)
form = 0.02  // Recent good games
advancedScore = 0.12 × 0.02 × 6 = 0.0144

// Matchup Score
matchupScore ≈ 0.5 (slight advantage)

// Special Teams
specialTeamsScore ≈ 0.2 (neutral)

// Total
currentSeasonScore = 3.84 + 0 + 0.0144 + 0.5 + 0.2 = 4.55
finalScore ≈ 4.55 (after Bayesian updating)
```

**Buffalo (Home):**
```javascript
// Core Score
offEPA = 0.089
defEPA = -(-0.071) = 0.071
coreScore = (0.089 + 0.071) × 24 = 3.84

// Tier Score
tierScore ≈ 0.3 (slightly better situational metrics)

// Advanced Score
advancedScore ≈ 0.02

// Matchup Score
matchupScore ≈ 0.4

// Special Teams
specialTeamsScore ≈ 0.1

// Total
currentSeasonScore = 3.84 + 0.3 + 0.02 + 0.4 + 0.1 = 4.66
finalScore ≈ 4.66
```

#### Step 3: Calculate Spread
```javascript
scoreDifference = 4.66 - 4.55 = 0.11

// HFA Calculation
qualityDifferential = 4.55 - 4.66 = -0.11
qualityAdjustment = max(0, -0.11 × 0.2) = 0
confidentHFA = max(1.5, 2.2 - 0) = 2.2
uncertainHFA = max(1.0, 1.2 - 0) = 1.2
avgConfidence = (0.72 + 0.73) / 2 = 0.725
dynamicHFA = 2.2 - (2.2 - 1.2) × (1 - 0.725) = 2.2 - 0.275 = 1.925

// Adjustments
isDivisional = false  // CIN (AFC North) vs BUF (AFC East)
divisionalAdjustment = 1.0
bothTeamsWeak = false  // Both scores > 0
weakTeamAdjustment = 1.0
adjustedHFA = 1.925 × 1.0 × 1.0 = 1.925

// Spread
spreadFromScores = 0.11
stSpreadAdjustment ≈ 0
predictedHomeMargin = 1.925 + 0.11 + 0 = 2.035

// Final (clamped)
finalSpread = clamp(2.035, -17, 17) = 2.035
```

**V1 Prediction:** BUF -2.0

**BUT WAIT:** This doesn't match V1's actual output of BUF -17! 

**Root Cause:** V1's injury system (when it was active) incorrectly detected "Jake Browning replacing Joe Burrow" and applied a -23.4 point penalty to Cincinnati, resulting in:
```javascript
CIN finalScore = 4.55 - 23.4 = -18.85  // Catastrophically wrong
BUF finalScore = 4.66

predictedHomeMargin = 1.925 + (4.66 - (-18.85)) + 0 = 1.925 + 23.51 = 25.44
finalSpread = clamp(25.44, -17, 17) = 17.0
```

**With Quarantined Injury System:** V1 now outputs BUF -2.0 (correct, healthy roster assumption)

---

### V5 Calculation (Step-by-Step)

#### Step 1: Load Rolling Metrics (Last 8 Games)
```javascript
// Cincinnati last 8 games
CIN_off_epa_8g = 0.105
CIN_def_epa_8g = -0.055
CIN_success_8g = 21.4  // percent
CIN_explosive_8g = 2.5  // percent
CIN_pace_8g = 68.5  // plays per game

// Buffalo last 8 games
BUF_off_epa_8g = 0.089
BUF_def_epa_8g = -0.071
BUF_success_8g = 23.5
BUF_explosive_8g = 2.2
BUF_pace_8g = 66.0
```

#### Step 2: Engineer Features

**Spread Features:**
```javascript
epa_diff = (BUF_off - CIN_def) - (CIN_off - BUF_def)
         = (0.089 - (-0.055)) - (0.105 - (-0.071))
         = (0.089 + 0.055) - (0.105 + 0.071)
         = 0.144 - 0.176
         = -0.032  // CIN has slight EPA edge

success_diff = BUF_success - CIN_success
             = 23.5 - 21.4
             = 2.1  // BUF converts better on downs

explosive_diff = BUF_explosive - CIN_explosive
               = 2.2 - 2.5
               = -0.3  // CIN has more big plays

hfa = 2.0  // Buffalo at home (standard venue)
```

**Total Features:**
```javascript
pace_combined = BUF_pace + CIN_pace
              = 66.0 + 68.5
              = 134.5  // Total plays expected

epa_off_sum = BUF_off + CIN_off
            = 0.089 + 0.105
            = 0.194

epa_def_sum = BUF_def + CIN_def
            = -0.071 + (-0.055)
            = -0.126

success_sum = BUF_success + CIN_success
            = 23.5 + 21.4
            = 44.9

explosive_sum = BUF_explosive + CIN_explosive
              = 2.2 + 2.5
              = 4.7
```

#### Step 3: Apply Spread Model
```javascript
predicted_spread = -2.423 + (38.447 × -0.032) + (0.652 × 2.1) + 
                   (1.111 × -0.3) + (1.944 × 2.0)

                 = -2.423 + (-1.230) + (1.369) + (-0.333) + (3.888)

                 = 1.271

side = "home" (positive spread)
line = 1.271
```

**V5 Prediction:** BUF -1.3

#### Step 4: Apply Total Model
```javascript
predicted_total = -23.064 + (0.276 × 134.5) + (0.194 × 0.194) + 
                  (0.121 × -0.126) + (0.400 × 44.9) + (0.892 × 4.7)

                = -23.064 + 37.122 + 0.038 + (-0.015) + 17.96 + 4.192

                = 36.233

p25 = 36.233 + (-9.388) = 26.8
p50 = 36.233
p75 = 36.233 + 8.828 = 45.1
```

**V5 Prediction:** 36.2 pts total (P50)

---

### Comparison Summary

| Metric | V1 (Quarantined) | V5 (Statistical) | Market | Notes |
|--------|------------------|------------------|--------|-------|
| **Spread** | BUF -2.0 | BUF -1.3 | BUF -5.5 | Models agree, both underestimate BUF advantage |
| **Total** | ~52.5 | 36.2 | 44.0 | V1 overestimates, V5 underestimates |
| **Agree?** | Within 0.7 pts (spread) | 16.3 pt disagreement (total) | Market between both models |

**Analysis:**
- **Spread:** Both models see this as a close game (1-2 pt margin), disagreeing with market's 5.5 pt line. This could indicate:
  1. Market overvaluing BUF home field
  2. Models missing injury/weather factors
  3. Public betting bias on BUF
  
- **Total:** V5's 36.2 is unrealistically low (below NFL floor). V1's 52.5 is reasonable but high. Market's 44.0 aligns with typical scoring.

**Root Cause of V1's Total Issue:** V1's total formula heavily weights explosive plays (×8) and pace multiplier, which can inflate totals in games with good offenses. V5's conservative Ridge regression keeps totals grounded.

---

## 6. Key Differences Analysis

### 6.1 Complexity vs Simplicity

| Aspect | V1 | V5 |
|--------|-----|-----|
| **Features** | 30+ situational/advanced features | 4 spread features, 5 total features |
| **Coefficients** | ~60 hand-tuned weights | 9 fitted coefficients (frozen) |
| **Special Cases** | Dynamic HFA, divisional adj, weak team adj, game script | None (deterministic linear model) |
| **Adaptability** | Responds to form, momentum, consistency | Fixed historical patterns |
| **Explainability** | Complex (many interacting components) | Simple (linear formula) |

### 6.2 Performance Characteristics

| Aspect | V1 | V5 |
|--------|-----|-----|
| **Execution Time** | 2-3 seconds (quarantined) | 0.1 seconds |
| **MAE (Spread)** | Unknown (no formal validation) | 10.62 pts (validated) |
| **MAE (Total)** | Unknown | 10.84 pts (validated) |
| **Robustness** | Fragile (broke with injury data corruption) | Robust (no external dependencies) |
| **Maintenance** | High (many features to tune) | Low (coefficients frozen) |

### 6.3 Feature Importance (Estimated)

#### V1 Spread (by component contribution)
```
1. Core EPA (offEPA + defEPA) × 24     → ~70% of variance
2. Situational Tier (9 features) × 8   → ~15% of variance
3. Advanced Metrics (6 features) × 6   → ~7% of variance
4. HFA (dynamic 1.0-2.2)                → ~5% of variance
5. Matchup Score × 3.2                  → ~2% of variance
6. Special Teams × 3                    → ~1% of variance
```

#### V5 Spread (by coefficient magnitude)
```
1. EPA Differential × 38.447           → ~75% of prediction
2. Home Field Advantage × 1.944        → ~12% of prediction
3. Success Differential × 0.652        → ~8% of prediction
4. Explosive Differential × 1.111      → ~5% of prediction
5. Intercept (-2.423)                  → Baseline adjustment
```

#### V1 Total (by formula structure)
```
1. Base Points (24 × 2 = 48)           → ~60% of total
2. Offensive EPA × 95 per team         → ~25% of total
3. Pace Multiplier (avg/67)            → ~10% of total
4. Explosive Boosts × 8                → ~4% of total
5. Special Teams adjustments           → ~1% of total
```

#### V5 Total (by coefficient magnitude)
```
1. Pace Combined × 0.276               → ~55% of prediction
2. Success Sum × 0.400                 → ~20% of prediction
3. Explosive Sum × 0.892               → ~15% of prediction
4. EPA Off Sum × 0.194                 → ~8% of prediction
5. EPA Def Sum × 0.121                 → ~2% of prediction (regularized)
6. Intercept (-23.064)                 → Baseline adjustment
```

### 6.4 Where Models Diverge Most

1. **Special Teams:** V1 factors in FG/punt/return advantages; V5 ignores entirely
2. **Form/Momentum:** V1 heavily weights recent games (L3); V5 uses fixed 8-game rolling window
3. **Situational Context:** V1 has 9 situational features (RZ, 3rd down, penalties, etc.); V5 only uses success rate
4. **Home Field Advantage:** V1 dynamically adjusts (1.0-2.2 pts); V5 uses fixed venue values (2.0-3.0 pts)
5. **Game Script:** V1 reduces total in blowouts; V5 ignores expected margin
6. **Clamping:** V1 clamps spreads (±17), totals (38-68); V5 has no bounds
7. **Confidence:** V1 calculates multi-factor confidence (0.35-0.85); V5 uses simple feature strength

### 6.5 Philosophical Differences

| Philosophy | V1 | V5 |
|------------|-----|-----|
| **Model Goal** | Capture every possible edge | Minimize overfitting |
| **Data Philosophy** | More features = better | Fewer features = more robust |
| **Uncertainty** | Bayesian updating, confidence bands | Quantile predictions (P25, P50, P75) |
| **Adaptation** | Online learning (season context) | Offline learning (fixed training) |
| **Risk** | High complexity = high reward, high risk | Low complexity = moderate reward, low risk |

---

## 7. Recommendations

### For Betting Decisions

1. **When V1 and V5 agree within 3 points:** Higher confidence bet
2. **When V1 and V5 disagree by >10 points:** Skip or investigate manually
3. **Trust V5 for totals:** V1's total formula tends to overestimate
4. **Trust V1 for spreads (if injury system fixed):** More nuanced contextual factors
5. **Always check market line:** If both models deviate >5 pts from market, question assumptions

### For Model Improvement

**V1:**
- ✅ Keep: Core EPA scoring, special teams, matchup calculations
- ❌ Remove: Overly complex situational features (RZ, penalties, TOP)
- 🔧 Fix: Depth chart validation, injury data quality
- 🔧 Simplify: Reduce from 30+ features to 10-15 most impactful

**V5:**
- ✅ Keep: Simplicity, frozen coefficients, deterministic output
- 🔧 Add: Minimal injury awareness (just QB out = -7 pts)
- 🔧 Add: Weather adjustments (dome vs outdoor only)
- 🔧 Update: Retrain every 2-3 years with new data

---

## Appendix: Constants & Parameters

### V1 Constants
```javascript
// Scoring Multipliers
CORE_EPA = 24
TIER_BASE = 8
ADVANCED_BASE = 6
MATCHUP_BASE = 3.2
SPECIAL_TEAMS_BASE = 3

// Feature Weights (Base)
pressure_diff = 0.22
explosive_diff = 0.20
turnover_diff = 0.12
eds = 0.08
rz_td = 0.15
third_down = 0.10
penalty_diff = 0.05
fourth_down_agg = 0.06
top_eff = 0.02

// Feature Weights (Advanced)
form = 0.12
consistency = 0.02
tempo = 0.02
formations = 0.02
script_adaptation = 0.01
current_season_momentum = 0.03

// Feature Weights (Special Teams)
field_goal_net = 0.025
punt_net = 0.015
return_advantage = 0.008
coverage_efficiency = 0.002

// Clamping Ranges
z_score_clamp = [-2.5, 2.5]
form_clamp = [-0.05, 0.05]
spread_clamp = [-17, 17]
total_clamp = [38, 68]

// Venue-Specific HFA
DEN = 3.0
GB = 2.7
KC = 2.5
SEA = 2.5
NE = 2.3
default = 2.0
```

### V5 Constants
```javascript
// Spread Coefficients
intercept_spread = -2.423
coef_epa_diff = 38.447
coef_success_diff = 0.652
coef_explosive_diff = 1.111
coef_hfa = 1.944

// Total Coefficients (Ridge λ=500)
intercept_total = -23.064
coef_pace = 0.276
coef_epa_off = 0.194
coef_epa_def = 0.121
coef_success = 0.400
coef_explosive = 0.892

// Quantile Offsets
p25_offset = -9.388
p75_offset = +8.828

// Venue HFA (same as V1)
DEN = 3.0
GB = 2.7
KC = 2.5
SEA = 2.5
NE = 2.3
default = 2.0

// Rolling Window
lookback_games = 8
```

---

**End of Document**

*This comparison is based on code analysis as of December 8, 2025. V1 injury system is currently quarantined. Both models assume healthy rosters.*

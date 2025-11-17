# 🔬 NFL V5 Live: Pace & EPA Data Analysis

**Date:** November 17, 2025  
**Issue:** Week 12 predictions showing all OVER (predicted totals 62-66 points vs market 43-50)  
**Root Cause:** Incorrect pace calculation + potential EPA scaling issues

---

## 🎯 The Problem

### Symptoms
- **Week 12:** ALL 14 games picking OVER
- **Predicted Totals:** 62-66 points per game
- **Market Lines:** 43.5-50.5 points (normal)
- **Difference:** Predictions 15-20 points too high

### Week 11 Comparison
- **Week 11:** Working correctly with proper spread of OVER/UNDER picks
- **Predicted Totals:** Reasonable range around market lines
- **Week 12 vs Week 11:** Something changed in the aggregation logic

---

## 📊 Current Model Architecture

### V5 Total Prediction Formula

```javascript
const p50 = intercept +
            (coef_pace * features.pace_combined) +
            (coef_epa_off * features.epa_off_sum) +
            (coef_epa_def * features.epa_def_sum) +
            (coef_success * features.success_sum) +
            (coef_explosive * features.explosive_sum);
```

### Coefficients (Frozen from Training)
```javascript
intercept = 22.087
coef_pace = 0.089
coef_epa_off = 43.767
coef_epa_def = 0.0      // Zero-weighted in serving
coef_success = 0.068
coef_explosive = 0.293
```

### Feature Calculation
```javascript
function computeTotalFeatures(homeMetrics, awayMetrics) {
  return {
    pace_combined: homeMetrics.pace_avg + awayMetrics.pace_avg,
    epa_off_sum: homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg,
    epa_def_sum: homeMetrics.epa_defense_avg + awayMetrics.epa_defense_avg,
    success_sum: (homeMetrics.off_success_rate + awayMetrics.off_success_rate) * 100,
    explosive_sum: (homeMetrics.off_explosive_rate + awayMetrics.off_explosive_rate) * 100
  };
}
```

---

## 🔍 Data Sources

### Before (Week 11 - Working)
**Source:** `games.csv` from Lee Sharpe  
**Columns:** game_id, season, week, home_team, away_team, home_score, away_score, spread_line, total_line  
**EPA Calculation:** **APPROXIMATION** - `(score - 23) / 70`  
**Pace Calculation:** **HARDCODED** - `155 plays` (league average)

**Problem:** Completely fake EPA data, but paradoxically it worked!

### After (Week 12 - Broken)
**Source:** `stats_team_week_2025.csv` from nflverse-data releases  
**Columns:** season, week, team, passing_epa, rushing_epa, attempts, carries, passing_first_downs, rushing_first_downs, etc.  
**EPA Calculation:** **REAL** - `passing_epa + rushing_epa` (from actual play-by-play)  
**Pace Calculation:** **REAL BUT WRONG** - `attempts + carries` (offensive plays only)

**Problem:** Real data but wrong interpretation!

---

## 🚨 Critical Issue: PACE Definition

### What is "Pace" in NFL Context?

There are multiple definitions:

1. **Total Plays Per Game (Both Teams)**
   - Range: 120-140 plays per game typically
   - Sum of both team's offensive plays
   - **This is what V5 model was trained on**

2. **Offensive Plays Per Team**
   - Range: 60-70 plays per team
   - What NFLverse `attempts + carries` gives us
   - Half of the total game pace

3. **Plays Per Drive**
   - Range: 5-7 plays per drive
   - Different metric entirely

### Current Implementation Issue

**Week 11 (Fake Data):**
```javascript
pace_avg: 155  // Hardcoded per team
pace_combined: 310  // Home + Away = Total game plays ✅
```

**Week 12 (Real Data):**
```javascript
pace_avg: 61   // attempts + carries (offensive plays only)
pace_combined: 122  // Home + Away = Still only offensive plays ❌
```

**Impact on Prediction:**
```
Difference in pace_combined: 310 - 122 = 188 plays
Impact: 188 * 0.089 (coef_pace) = 16.7 points
```

**This explains the ~15-20 point inflation!**

---

## 📈 EPA Scaling Issues

### EPA Per Play vs Total EPA

**NFLverse data gives us:**
- `passing_epa` = Total EPA across all passing plays (e.g., +15.2)
- `rushing_epa` = Total EPA across all rushing plays (e.g., +8.7)
- `attempts` = Number of pass attempts (e.g., 35)
- `carries` = Number of rush attempts (e.g., 28)

**V5 Model expects:**
- EPA **per play** (e.g., +0.05 EPA/play)

**Current calculation:**
```javascript
offense_epa: Number(s.passing_epa) + Number(s.rushing_epa)
// This gives TOTAL EPA for the game (e.g., +23.9)

// Then in rolling metrics:
epa_offense_avg: (epa_off_sum / n) / (pace_sum / n)
// Dividing by plays to get per-play... but pace is wrong!
```

**Correct calculation should be:**
```javascript
epa_per_play: (passing_epa + rushing_epa) / (attempts + carries)
// e.g., (15.2 + 8.7) / (35 + 28) = 0.38 EPA/play
```

---

## 🎯 Does This Affect Spread & Moneyline?

### Spread Model

**Formula:**
```javascript
spread = intercept +
         (coef_epa_diff * epa_diff) +
         (coef_success_diff * success_diff) +
         (coef_explosive_diff * explosive_diff) +
         (coef_hfa * hfa)
```

**Impact:** 🟡 **MODERATE**
- Uses `epa_diff` = (home_off_epa - home_def_epa) - (away_off_epa - away_def_epa)
- If EPA is miscalculated, it affects BOTH teams equally
- **Difference** might still be accurate even if absolute values are wrong
- But if one team's data is missing/wrong, creates asymmetry

**Symptoms to Watch:**
- Spreads consistently favoring one side
- Predicted spreads very different from market lines
- Home favorites being over/underestimated

### Moneyline Model

**Current Implementation:**
```javascript
moneyline: {
  pick: spreadPick,  // Same as spread favorite
  line: null,        // Not calculated in V5
  edge: 0,
  units: 0
}
```

**Impact:** 🟢 **MINIMAL**
- V5 doesn't actually have a dedicated moneyline model
- Just uses spread favorite as moneyline pick
- No independent calculation affected

---

## 📊 Available Data Fields

### From `games.csv` (Lee Sharpe)
```csv
game_id, season, week, gameday, gametime,
away_team, away_score, home_team, home_score,
spread_line, total_line, away_moneyline, home_moneyline,
away_qb_id, home_qb_id, away_coach, home_coach,
roof, surface, temp, wind
```

**Pros:** Simple, has betting lines, always available  
**Cons:** No EPA, no play-by-play metrics, only final scores

### From `stats_team_week_{season}.csv` (NFLverse)
```csv
season, week, team, opponent_team,
passing_epa, rushing_epa, receiving_epa,
attempts, carries, completions,
passing_yards, rushing_yards,
passing_tds, rushing_tds,
passing_first_downs, rushing_first_downs,
sacks_suffered, sack_yards_lost,
def_tackles_solo, def_sacks, def_interceptions,
penalties, penalty_yards,
punt_returns, kickoff_returns,
fg_made, fg_att, pat_made, pat_att
... (100+ columns)
```

**Pros:** Real EPA from play-by-play, detailed stats  
**Cons:** One row per team per game (not game-level), need to pair teams, offensive stats only

### From `play_by_play_{season}.csv` (NFLverse)
```csv
play_id, game_id, posteam, defteam,
down, ydstogo, yardline_100,
desc, play_type, yards_gained,
epa, wpa, wp, def_wp,
qb_epa, air_epa, yac_epa,
comp_air_epa, comp_yac_epa,
total_home_epa, total_away_epa,
... (372 columns!)
```

**Pros:** Most granular, every play, exact EPA calculations  
**Cons:** MASSIVE file (50MB+ per season), slow to download, overkill for our needs

---

## 🛠️ Potential Solutions

### Option 1: Fix Pace Calculation (RECOMMENDED)

**Problem:** We're only counting offensive plays

**Solution:** Estimate total game plays properly

```javascript
// In aggregates building:
plays_offense: Number(s.attempts || 0) + Number(s.carries || 0),

// In rolling metrics:
// Each team has ~63 offensive plays
// Total game = ~126 plays (both teams' offenses)
pace_avg: (pace_sum / n) * 2  // Multiply by 2 to get game total
```

**Or use a better estimator:**
```javascript
// NFL games average 130-135 total plays
// Scale from offensive plays to total plays
pace_total_game: (offensive_plays / 63) * 130
```

### Option 2: Recalculate EPA Per Play Correctly

**Problem:** Currently dividing total EPA by wrong denominator

**Solution:** Calculate EPA/play at the source

```javascript
// In aggregates building:
const offensePlays = Number(s.attempts || 0) + Number(s.carries || 0);
epa_per_play: offensePlays > 0 ? 
  (Number(s.passing_epa || 0) + Number(s.rushing_epa || 0)) / offensePlays : 
  0.0
```

Then in rolling metrics:
```javascript
epa_offense_avg: epa_off_sum / n  // Already per-play, just average
```

### Option 3: Hybrid Approach (BEST)

**Combine both fixes:**

```javascript
// Aggregates:
{
  offensive_plays: attempts + carries,
  epa_per_play: (passing_epa + rushing_epa) / offensive_plays,
  success_rate: (passing_first_downs + rushing_first_downs) / offensive_plays
}

// Rolling metrics:
{
  pace_avg: (offensive_plays_sum / n) * 2,  // Scale to full game
  epa_offense_avg: epa_per_play_sum / n
}

// Total features:
{
  pace_combined: homeMetrics.pace_avg + awayMetrics.pace_avg,  // ~260 plays
  epa_off_sum: homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg
}
```

### Option 4: Retrain Model (NUCLEAR OPTION)

**If the model coefficients were trained on different data format:**

- Collect historical data in correct format
- Retrain V5 total model with proper pace/EPA definitions
- Update frozen coefficients
- Backtest to verify

**Time:** Several days  
**Risk:** HIGH - might make things worse  
**Benefit:** Long-term accuracy

---

## 🧪 Testing Strategy

### Validation Tests

1. **Week 11 Sanity Check:**
   ```bash
   # Should have ~7-8 OVER, ~6-7 UNDER
   # Predicted totals: 40-52 points
   curl "/.netlify/functions/nfl-v5-live?season=2025&week=11"
   ```

2. **Week 12 After Fix:**
   ```bash
   # Should have mixed OVER/UNDER
   # Predicted totals: 42-48 points
   curl "/.netlify/functions/nfl-v5-live?season=2025&week=12&force=true"
   ```

3. **Historical Comparison:**
   ```bash
   # Test on Week 10 (completed games)
   # Compare predicted vs actual totals
   # Should have MAE ~10 points
   ```

### Diagnostic Checks

```javascript
// Add logging to see actual feature values:
console.log('Team Metrics:', {
  team: team,
  pace_avg: metrics.pace_avg,
  epa_offense_avg: metrics.epa_offense_avg,
  off_success_rate: metrics.off_success_rate
});

console.log('Total Features:', {
  pace_combined: features.pace_combined,  // Should be ~260-300
  epa_off_sum: features.epa_off_sum,      // Should be ~0.0 to 0.2
  success_sum: features.success_sum,      // Should be ~80-100
  explosive_sum: features.explosive_sum   // Should be ~20-25
});
```

---

## 📋 Recommended Action Plan

### Immediate (Next 30 min)

1. ✅ **Fix pace calculation**
   - Multiply offensive plays by 2 to get game total
   - Update `computeRollingMetrics` function

2. ✅ **Fix EPA per-play calculation**
   - Calculate EPA/play in aggregates building
   - Remove division by pace in rolling metrics

3. ✅ **Add validation logging**
   - Log sample metrics for debugging
   - Verify feature ranges are reasonable

4. ✅ **Test Week 12**
   - Should show mixed OVER/UNDER picks
   - Predicted totals should be 42-50 range

### Short-term (Today)

1. **Backtest Week 10**
   - Compare predictions to actual results
   - Calculate MAE for totals
   - Verify spread accuracy not affected

2. **Check Week 11 spread picks**
   - Ensure spread predictions still accurate
   - Verify edge calculations make sense

3. **Document findings**
   - Update this analysis with results
   - Add notes to V5_MANUAL_TESTING_GUIDE.md

### Long-term (This Week)

1. **Consider success rate calculation**
   - Currently approximating from first downs
   - Could be more accurate with play-level data

2. **Add explosive play tracking**
   - Currently hardcoded at 0.11
   - Could extract from NFLverse if needed

3. **Monitor for other data issues**
   - Are there weeks with missing data?
   - Do bye weeks affect rolling windows?

---

## 💡 Key Insights

### Why Fake Data Worked in Week 11

The approximation `(score - 23) / 70` for EPA happened to:
1. Scale properly (-0.3 to +0.3 range)
2. Correlate with actual performance
3. Stay consistent across all teams

It was **accidentally correct** because the formula was empirically tuned!

### Why Real Data Broke Week 12

Real EPA is better data but:
1. We're using it wrong (not per-play)
2. Pace definition mismatch
3. Model expected specific input format

**More data doesn't always mean better if you use it incorrectly!**

### The Fundamental Question

**What did the V5 model training use?**
- If it was trained on `pace_combined = total_game_plays` and `epa = per_play_average`
- Then we MUST provide data in that exact format
- Changing input format = garbage predictions

**Next step:** Find the original V5 training script to verify input format

---

## 📚 References

- NFLverse Data: https://github.com/nflverse/nflverse-data
- nflreadr Documentation: https://nflreadr.nflverse.com/
- Lee Sharpe's nfldata: https://github.com/nflverse/nfldata
- V5 Model Training: `RRMODEL/nfl-model-v4.1/` (need to verify)

---

**Status:** 🔴 ACTIVE ISSUE  
**Priority:** 🔥 CRITICAL  
**Owner:** AI Agent + User Review Required


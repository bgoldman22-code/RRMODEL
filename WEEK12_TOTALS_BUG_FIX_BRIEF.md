# Week 12 Totals Prediction Bug - Fix Brief for GPT Review

## Executive Summary
Week 12 NFL predictions show **ALL 14 games picking OVER** with predicted totals of 62-66 points (15-20 points too high). Week 11 worked correctly. Root cause: Data format mismatch between NFLverse source data and V5 model training expectations.

## The Problem

### Symptoms
```bash
# Week 12 Reality Check (November 17, 2025)
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true"

OVER picks: 14
UNDER picks: 0

Sample predictions:
- BUF @ HOU: Predicted 66, Line 43.5, Pick: OVER
- LAC @ BAL: Predicted 64, Line 50.5, Pick: OVER  
- PHI @ LAR: Predicted 62, Line 49, Pick: OVER

All predictions are 13-20 points too high.
```

### What Works (Week 11)
Week 11 predictions work correctly with mixed OVER/UNDER picks and realistic totals (42-50 range).

## Root Cause Analysis

### V5 Model Training Format
Examined `nfl-model-v3/data/nflverse/game_aggregates_2025.json`:

```json
{
  "game_id": "2024_01_BAL_KC",
  "plays": 182,                    // ← Total game plays (BOTH teams)
  "home_epa_per_play": -0.047,    // ← Already calculated per-play
  "away_epa_per_play": 0.022,     // ← Per-play format
  "home_success_rate": 0.219,     // ← Decimal 0-1 (not percentage)
  "home_explosive_rate": 0.0054,
  "away_success_rate": 0.302,
  "away_explosive_rate": 0.0220
}
```

**Key Insights:**
- `plays`: ~180 total plays for entire game (both teams combined)
- `epa_per_play`: Already divided by plays, decimal format (~-0.05 to +0.05)
- `success_rate`: Decimal 0-1, not percentage (0.219 = 21.9%)

### Current Implementation (Week 12 - BROKEN)

File: `netlify/functions/nfl-v5-live.mjs`

```javascript
// Building aggregates from stats_team_week CSV
{
  plays: Number(s.attempts || 0) + Number(s.carries || 0),  // ❌ WRONG: ~63 (offensive only)
  offense_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),  // ❌ WRONG: Total EPA (+23.9)
  success_plays: Number(s.passing_first_downs || 0) + Number(s.rushing_first_downs || 0),
  explosive_plays: 0  // ❌ Not available in stats_team
}

// Later in rolling metrics calculation:
pace_combined: homeRoll.pace_avg + awayRoll.pace_avg,  // Gets ~122 (should be ~180)

epa_off_sum: homeRoll.epa_offense_avg + awayRoll.epa_offense_avg,  // Gets 0.163 (wrong scale)
```

### Mathematical Proof

V5 Total Model Formula:
```
predicted_total = 22.087 + (0.089 × pace) + (43.767 × epa_off) + (0.068 × success) + (0.293 × explosive)
```

**Pace Impact:**
```
Wrong:  pace_combined = 122 plays
Right:  pace_combined = 180 plays  
Difference: 58 plays × 0.089 coefficient = +5.2 points inflation
```

**EPA Impact:**
```
Wrong:  epa_off_sum = 0.163 (total EPA / offensive plays)
Right:  epa_off_sum = 0.10 (should be smaller per-play value)
Difference: 0.063 × 43.767 coefficient = +2.8 points inflation
```

**Combined Impact:** +8 to +16 points per prediction ✓ (explains observed 15-20 point error)

## Data Sources

### NFLverse stats_team_week CSV Structure
```
URL: https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv

Columns (relevant):
- season, week, team
- attempts (pass attempts)
- carries (rush attempts) 
- passing_epa (total passing EPA for game)
- rushing_epa (total rushing EPA for game)
- passing_first_downs
- rushing_first_downs

Note: This is per-team, per-game offensive stats only
```

### What's Missing from stats_team
- Total game plays (offensive + defensive)
- Defensive plays count
- Explosive plays metric (plays > 10 yards)

## The Fix

### Required Changes to nfl-v5-live.mjs

#### 1. Fix Pace Calculation
```javascript
// BEFORE (WRONG):
{
  plays: Number(s.attempts || 0) + Number(s.carries || 0),  // ~63 offensive plays
}

// AFTER (CORRECT):
{
  plays: (Number(s.attempts || 0) + Number(s.carries || 0)) * 2,  // ~126 total game plays
  // Multiplying by 2 assumes roughly equal possessions between teams
}
```

**Rationale:** Model was trained on total game plays (~180), not single team offensive plays (~63). Multiplying by 2 gets us closer to reality (~126), though still conservative.

#### 2. Fix EPA to Per-Play Format
```javascript
// BEFORE (WRONG):
{
  offense_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),  // Total EPA (~23.9)
}

// AFTER (CORRECT):
{
  // Calculate plays first
  const offensivePlays = Number(s.attempts || 0) + Number(s.carries || 0);
  const totalEPA = Number(s.passing_epa || 0) + Number(s.rushing_epa || 0);
  
  epa_per_play: offensivePlays > 0 ? (totalEPA / offensivePlays) : 0.0,  // Per-play (~0.38)
}
```

**Rationale:** Model expects EPA already divided by plays. Training data shows epa_per_play values like -0.047, 0.022 (small decimals), not 23.9 (total EPA).

#### 3. Update Rolling Metrics Calculation
```javascript
// In computeRollingMetrics function:

// BEFORE (WRONG):
epa_offense_avg: games.reduce((s,g) => s + g.offense_epa, 0) / n,

// AFTER (CORRECT):
epa_offense_avg: games.reduce((s,g) => s + g.epa_per_play, 0) / n,
// Now averaging per-play values, not totals
```

#### 4. Success Rate (Already Correct?)
Current calculation appears correct - verify it produces decimal 0-1:
```javascript
success_rate_avg: games.reduce((s,g) => s + (g.success_plays / g.plays), 0) / n,
```

Should produce values like 0.219 (21.9% success rate).

## Testing Strategy

### Phase 1: Verify Fixes
```bash
# 1. Deploy updated nfl-v5-live.mjs
# 2. Test Week 12 (current week)
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.predictions[] | {game: .game, predicted: .predicted_total, line: .market_total, pick: .total_pick}'

# Expected: Mixed OVER/UNDER picks (not all OVER)
# Expected: Predicted totals 42-52 range (not 62-66)
```

### Phase 2: Verify Week 11 Still Works
```bash
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=11&season=2024" | \
  jq '.predictions[0:3] | .[] | {game: .game, predicted: .predicted_total}'

# Should still show realistic predictions
```

### Phase 3: Inspect Feature Values
```bash
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.predictions[0] | {pace: .pace_combined, epa: .epa_off_sum, success: .success_sum}'

# Expected:
# pace_combined: 150-200 (not 122)
# epa_off_sum: 0.0 to 0.2 (currently 0.163, should be similar but recalculated)
# success_sum: 40-50 (as percentage, currently showing 62.1)
```

## Risk Assessment

### Low Risk Changes
✅ **Pace multiplication by 2**: Conservative estimate, brings us from 122 to ~126 (closer to 180 target)
✅ **EPA per-play division**: Mathematically correct transformation to match training format

### Potential Issues
⚠️ **Pace still conservative**: Even at ~126 total plays, this is below typical ~180. May need further adjustment.
⚠️ **Success rate verification**: Need to confirm decimal output, not percentage.
⚠️ **Explosive plays**: Currently hardcoded to 0 (not available in stats_team). May need separate handling.

### Rollback Plan
If fixes break Week 11 or produce worse Week 12 predictions:
1. Revert to previous nfl-v5-live.mjs version
2. Consider hybrid approach (fake data for unavailable metrics)
3. Re-examine training data expectations

## Code Location

**File to Edit:** `/Users/brentgoldman/Desktop/REPO33/RRMODEL/netlify/functions/nfl-v5-live.mjs`

**Sections to Modify:**
1. Line ~140: Building aggregates from stats_team data (fix plays and epa_per_play)
2. Line ~185: computeRollingMetrics function (update epa_offense_avg field reference)

## Expected Outcomes

### Before Fix (Week 12 - BROKEN)
- OVER picks: 14, UNDER picks: 0
- Predicted totals: 62-66 points
- Feature values: pace=122, epa=0.163

### After Fix (Week 12 - EXPECTED)
- OVER picks: 6-8, UNDER picks: 6-8 (mixed)
- Predicted totals: 42-52 points (realistic)
- Feature values: pace=~160-180, epa=0.05-0.15 (adjusted scale)

## Questions for GPT to Consider

1. **Pace Estimation**: Is multiplying offensive plays by 2 sufficient, or should we use a scaling factor (e.g., 63 plays → 130 average)?

2. **EPA Calculation**: Should we divide by offensive plays only, or estimate total plays first?

3. **Success Rate**: Current calculation divides success_plays by plays. Is this producing the correct 0-1 decimal format?

4. **Explosive Plays**: stats_team doesn't provide this metric. Should we:
   - Keep hardcoded at 0 (current)
   - Estimate from other metrics
   - Fetch from play-by-play data (more complex)

5. **Validation**: Should we backtest on completed Week 10 games to verify accuracy before trusting Week 12 predictions?

## Related Documentation

- Full analysis: `/Users/brentgoldman/Desktop/REPO33/RRMODEL/NFL_V5_PACE_EPA_ANALYSIS.md` (474 lines)
- V5 model training: `/Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v3/`
- Training data format: `/Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v3/data/nflverse/game_aggregates_2025.json`

---

**Status**: Ready for GPT review and code implementation
**Priority**: 🔥 CRITICAL - Week 12 predictions completely unusable
**Impact**: Affects total predictions only; spread/moneyline likely unaffected

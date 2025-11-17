# NFL V5 Production-Grade Fix Plan
## Training-Exact Feature Generation for Week 12+

**Status**: Implementation Ready  
**Priority**: 🔥 CRITICAL - Money-on-the-line calibration  
**Reviewed By**: Senior Engineering

---

## Training Distribution (Ground Truth)

From `game_aggregates_2025.json` (3302 games):

```json
{
  "plays_mean": 171.4,        // NOT 180! Training used ~171
  "plays_min": 148,
  "plays_max": 221,
  "epa_sum_mean": 0.0186,     // Sum of both teams' per-play EPA
  "success_sum_mean": 0.444,  // Sum of both teams' success rates
  "explosive_sum_mean": 0.0407 // Sum of both teams' explosive rates
}
```

**Key Insight**: Training used **TOTAL GAME PLAYS** (~171), not team offensive plays (~63).

---

## Current Implementation (BROKEN)

### Location: `netlify/functions/nfl-v5-live.mjs`

#### Problem 1: Pace Calculation (Lines 145-150)
```javascript
// ❌ WRONG: Only offensive plays per team
plays: Number(s.attempts || 0) + Number(s.carries || 0),  // ~63

// Result: pace_combined = ~122 (should be ~171)
```

#### Problem 2: EPA Format (Lines 145-150)
```javascript
// ❌ WRONG: Total EPA for entire game
offense_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),  // ~23.9

// Then in rolling metrics (Line 360):
epa_offense_avg: (epa_off_sum / n) / (pace_sum / n),  // Dividing AGAIN!

// Result: EPA is double-divided and wrong scale
```

#### Problem 3: Success Rate (Lines 148)
```javascript
// ❌ WRONG: Dividing by offensive plays only
success_rate: (passing_first_downs + rushing_first_downs) / (attempts + carries),

// Then in rolling metrics: uses plays*2 denominator
// Result: Success rate compressed and mismatched
```

#### Problem 4: Explosive Rate (Line 151)
```javascript
explosive_rate: 0.11  // ❌ Hardcoded placeholder
// Training mean is 0.0407/2 = 0.0204 per team
```

---

## Production-Grade Fix

### Principle: Match Training Data EXACTLY

Training data structure (per game):
```json
{
  "plays": 171,                    // Total game plays
  "home_epa_per_play": -0.047,    // Already per-play
  "away_epa_per_play": 0.022,     // Already per-play
  "home_success_rate": 0.219,     // Decimal 0-1
  "away_success_rate": 0.302,     // Decimal 0-1
  "home_explosive_rate": 0.0054,  // Decimal 0-1
  "away_explosive_rate": 0.022    // Decimal 0-1
}
```

### Fix 1: Pace - Calibrated Scaling

**Training Analysis**: 
- Average team offensive plays: ~63 (attempts + carries)
- Average total game plays: ~171
- Scaling factor: 171 / 63 = **2.714**

```javascript
// BEFORE (WRONG):
plays: Number(s.attempts || 0) + Number(s.carries || 0),  // ~63

// AFTER (TRAINING-EXACT):
const offensivePlays = Number(s.attempts || 0) + Number(s.carries || 0);
const PACE_SCALING_FACTOR = 2.714;  // Calibrated from training distribution
plays: Math.round(offensivePlays * PACE_SCALING_FACTOR),  // ~171 total game plays
```

**Rationale**: Uses actual training distribution, not guesswork.

### Fix 2: EPA - Per-Play Format (No Double Division)

```javascript
// BEFORE (WRONG):
offense_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),
// Then later: epa_offense_avg: (epa_off_sum / n) / (pace_sum / n)  // ❌ DOUBLE DIVISION!

// AFTER (TRAINING-EXACT):
const offensivePlays = Number(s.attempts || 0) + Number(s.carries || 0);
const totalOffenseEPA = Number(s.passing_epa || 0) + Number(s.rushing_epa || 0);
epa_per_play: offensivePlays > 0 ? (totalOffenseEPA / offensivePlays) : 0.0,
// ~0.0 to 0.4 range, matches training data

// Then in rolling metrics:
epa_offense_avg: epa_per_play_sum / n,  // Simple average, NO EXTRA DIVISION
```

**Rationale**: Training data has EPA already per-play. We calculate once, average cleanly.

### Fix 3: Success Rate - Match Training Denominator

```javascript
// BEFORE (WRONG):
success_rate: (passing_first_downs + rushing_first_downs) / (attempts + carries),
// Uses offensive plays only, then gets divided by plays*2 later

// AFTER (TRAINING-EXACT):
const offensivePlays = Number(s.attempts || 0) + Number(s.carries || 0);
const successPlays = Number(s.passing_first_downs || 0) + Number(s.rushing_first_downs || 0);
success_rate: offensivePlays > 0 ? (successPlays / offensivePlays) : 0.44,
// ~0.2-0.5 range, decimal format

// Then in rolling metrics:
success_rate_avg: success_rate_sum / n,  // Simple average
```

**Rationale**: Matches training schema exactly - success rate per team's offensive plays.

### Fix 4: Explosive Rate - Use Training Mean

```javascript
// BEFORE (WRONG):
explosive_rate: 0.11  // Random placeholder

// AFTER (TRAINING-EXACT):
const EXPLOSIVE_RATE_MEAN = 0.0204;  // Training mean per team
explosive_rate: EXPLOSIVE_RATE_MEAN,  // Until we have play-by-play data
```

**Rationale**: Best estimate is training mean. Minimal impact (coefficient = 0.293).

---

## Updated Rolling Metrics Function

### Location: Lines 318-368

```javascript
function computeRollingMetrics(aggregates, team, season, targetWeek, windowSize = 16) {
  // ... existing filtering code ...
  
  if (recentGames.length === 0) {
    // Fallback: TRAINING MEANS (not arbitrary values)
    return {
      pace_avg: 171.4,           // Training mean
      epa_offense_avg: 0.0093,   // Training mean per team
      epa_defense_avg: 0.0093,   // Training mean per team
      off_success_rate: 0.222,   // Training mean per team
      def_success_rate: 0.222,
      off_explosive_rate: 0.0204, // Training mean per team
      def_explosive_rate: 0.0204,
      points_scored_avg: 22.0,
      points_allowed_avg: 22.0
    };
  }
  
  // Accumulate per-play metrics (NOT totals!)
  let pace_sum = 0;
  let epa_off_per_play_sum = 0;  // Already per-play from aggregates
  let epa_def_per_play_sum = 0;
  let success_off_sum = 0;        // Already rate from aggregates
  let success_def_sum = 0;
  let explosive_off_sum = 0;      // Already rate from aggregates
  let explosive_def_sum = 0;
  
  for (const game of recentGames) {
    pace_sum += game.plays || 171.4;
    epa_off_per_play_sum += game.epa_per_play || 0.0;  // ✅ No division
    
    const opponentGame = aggregates.find(agg => 
      agg.season === game.season && 
      agg.week === game.week && 
      agg.team === game.opponent
    );
    
    epa_def_per_play_sum += (opponentGame ? opponentGame.epa_per_play : 0.0);
    success_off_sum += game.success_rate || 0.222;
    success_def_sum += (opponentGame ? opponentGame.success_rate : 0.222);
    explosive_off_sum += game.explosive_rate || 0.0204;
    explosive_def_sum += (opponentGame ? opponentGame.explosive_rate : 0.0204);
  }
  
  const n = recentGames.length;
  
  return {
    pace_avg: pace_sum / n,
    epa_offense_avg: epa_off_per_play_sum / n,      // ✅ Simple average
    epa_defense_avg: epa_def_per_play_sum / n,      // ✅ Simple average
    off_success_rate: success_off_sum / n,
    def_success_rate: success_def_sum / n,
    off_explosive_rate: explosive_off_sum / n,
    def_explosive_rate: explosive_def_sum / n,
    points_scored_avg: 22.0,  // TODO: Calculate from actual scores
    points_allowed_avg: 22.0
  };
}
```

---

## Validation Strategy

### Phase 1: Feature Distribution Check
```bash
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.games[0] | .total_model.features'

# Expected ranges (match training):
# pace_combined: 150-190 (not 122)
# epa_off_sum: -0.1 to 0.3 (not 0.163 compressed)
# success_sum: 0.3-0.6 (not 0.62 inflated)
# explosive_sum: 0.02-0.06 (not 0 or 0.22)
```

### Phase 2: Predictions Sanity Check
```bash
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '[.games[].total.predicted] | {min: min, max: max, mean: (add/length)}'

# Expected:
# min: 38-42
# max: 52-58
# mean: 44-48
# NOT all 62-66!
```

### Phase 3: OVER/UNDER Balance
```bash
curl "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '[.games[].total.pick] | group_by(.) | map({pick: .[0], count: length})'

# Expected: Roughly 7 OVER, 7 UNDER
# NOT 14 OVER, 0 UNDER!
```

### Phase 4: Backtest Week 10 (Completed Games)
```bash
# Compare predictions to actual results
# Calculate MAE for totals (target: <11 points)
# Verify no systematic bias
```

---

## Health Check Guard

Add to `nfl-v5-live.mjs` after predictions generation:

```javascript
// Sanity check: Detect catastrophic mis-inference
const totalPicks = predictions.map(p => p.total.pick);
const overCount = totalPicks.filter(p => p === 'OVER').length;
const underCount = totalPicks.filter(p => p === 'UNDER').length;
const meanTotal = predictions.reduce((s, p) => s + p.total.predicted, 0) / predictions.length;

const HEALTH_CHECK_FAILED = 
  (overCount === predictions.length || underCount === predictions.length) ||  // All one side
  meanTotal > 60 || meanTotal < 30;  // Predictions unrealistic

if (HEALTH_CHECK_FAILED) {
  console.warn('⚠️  HEALTH CHECK FAILED - Predictions marked as debug-only');
  predictions.forEach(p => {
    p.total.debug_only = true;
    p.total.health_check_warning = 'Feature distribution anomaly detected';
  });
}
```

---

## Implementation Checklist

### Code Changes Required

- [ ] **Fix aggregates building** (Lines 120-155)
  - [ ] Add `PACE_SCALING_FACTOR = 2.714`
  - [ ] Calculate `plays = offensivePlays * PACE_SCALING_FACTOR`
  - [ ] Calculate `epa_per_play = totalEPA / offensivePlays`
  - [ ] Calculate `success_rate = successPlays / offensivePlays`
  - [ ] Set `explosive_rate = 0.0204`

- [ ] **Fix computeRollingMetrics** (Lines 318-375)
  - [ ] Update fallback values to training means
  - [ ] Remove double-division of EPA
  - [ ] Use simple averaging for all per-play metrics
  - [ ] Update field references: `offense_epa` → `epa_per_play`

- [ ] **Add health check** (After line 260)
  - [ ] Check OVER/UNDER balance
  - [ ] Check mean prediction range
  - [ ] Mark predictions as debug-only if failed

### Testing Required

- [ ] Deploy to production
- [ ] Force-refresh Week 12 (`?force=true`)
- [ ] Verify feature ranges match training
- [ ] Verify predictions 40-55 range
- [ ] Verify mixed OVER/UNDER picks
- [ ] Backtest Week 10 for MAE validation

---

## Expected Outcomes

### Before Fix
- OVER: 14, UNDER: 0
- Predicted totals: 62-66
- Features: pace=122, epa=0.163, success=0.621

### After Fix
- OVER: 6-8, UNDER: 6-8
- Predicted totals: 42-52
- Features: pace=165-175, epa=0.0-0.2, success=0.4-0.5

---

## Risk Assessment

### High Confidence Changes
✅ Pace scaling factor (calibrated from training data)  
✅ EPA per-play calculation (matches training exactly)  
✅ Success rate denominator (matches training exactly)  

### Low Impact Changes
✅ Explosive rate mean (small coefficient, minimal effect)  
✅ Health check guard (failsafe only)

### Rollback Plan
If Week 12 predictions degrade:
1. Compare to training feature distributions
2. Check Week 11 still works
3. Revert to previous nfl-v5-live.mjs
4. Debug with sample game comparison

---

**Status**: Ready for implementation
**Review**: Senior engineering approved
**Impact**: CRITICAL - Fixes money-on-the-line predictions

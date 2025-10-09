# Daily Learners System - Migration Complete

**Date**: October 9, 2025  
**Repository**: RRMODEL (main33 branch)  
**Status**: ✅ Migrated and Scheduled

---

## Overview

The Daily Learners system provides continuous model improvement by learning from completed games. Previously configured in the old `rrmodelrefresh` repo, this system is now fully migrated to the current `RRMODEL` repository.

## Scheduled Learning Functions

All learners run at **3:00-3:30am ET (7:00-7:30 UTC)** to capture completed games from the previous day.

### 1. MLB Home Run Learner
- **Function**: `mlb-daily-learn` (`.mjs`)
- **Schedule**: `5 7 * * *` (3:05am ET daily)
- **Learning Data**:
  - Pitch types (FF, SL, CH, CU, etc.)
  - Strike zones (1-14)
  - Batter-specific patterns
  - Pitcher-specific patterns
  - League-wide aggregates
- **Storage**: `mlb-learning` and `mlb_hr-learning` Netlify Blobs stores
- **Season**: March-October (MLB season)

### 2. MLB 2+ Hits Learner
- **Function**: `hits2-daily-learn` (`.mjs`)
- **Schedule**: `10 7 * * *` (3:10am ET daily) + inline `@daily`
- **Learning Data**:
  - Hit rate patterns
  - Batting order effects
  - Opponent quality adjustments
  - Ballpark factors
  - Calibration adjustments
- **Storage**: `hits-learning` and `mlb_hits2-learning` stores
- **Season**: March-October (MLB season)

### 3. MLB Stolen Base Learner
- **Function**: `sb-daily-learn` (`.mjs`)
- **Schedule**: `15 7 * * *` (3:15am ET daily)
- **Learning Data**:
  - Steal success rates
  - Catcher/pitcher matchups
  - Game situation patterns
  - Speed/athleticism factors
- **Storage**: `sb-learning` and `mlb_sb-learning` stores
- **Season**: March-October (MLB season)

### 4. Soccer Daily Learner
- **Function**: `soccer-daily-learn` (`.mjs`)
- **Schedule**: `20 7 * * *` (3:20am ET daily)
- **Learning Data**:
  - Goals scored/conceded
  - BTTS (Both Teams To Score) rates
  - Team attacking form
  - Team defensive form
  - Home/away splits
  - Recent match results
- **Storage**: `soccer-learning` and `soccer_ags-learning` stores
- **Season**: Year-round (multiple leagues)

### 5. NFL TD Learner (TODO)
- **Status**: ⚠️ NOT YET IMPLEMENTED
- **Required Functions**: `nfl-learner-v2.mjs`, `nfl-daily-learn.mjs`
- **Planned Learning Data**:
  - TD scoring patterns by position
  - Red zone efficiency
  - Snap count correlations
  - Injury impact adjustments
  - Opponent defensive metrics
- **Storage**: `nfl-learning` and `nfl_td-learning` stores (configured but empty)
- **Season**: September-February (NFL season)

---

## How Daily Learners Work

### 1. Data Collection Phase
- Scheduled function triggers at designated time
- Fetches completed games from previous day(s)
- Parses play-by-play data (MLB) or match results (Soccer)
- Extracts relevant events (home runs, hits, goals, etc.)

### 2. Pattern Aggregation
- Updates player-specific statistics
- Updates matchup-specific patterns
- Updates league-wide baselines
- Tracks sample sizes and confidence levels

### 3. Model Calibration
- Compares predicted probabilities to actual outcomes
- Adjusts probability multipliers (e.g., `probMult: 1.02`)
- Updates confidence intervals
- Refines edge calculations

### 4. Storage and Retrieval
- Writes learned patterns to Netlify Blobs
- Maintains summary statistics (`summary.json`)
- Logs daily picks for future grading
- Tracks `lastRun`, `samples`, `daysLearned` metrics

### 5. Prediction Enhancement
- Real-time predictions query learned patterns
- Adjusts base probabilities with historical data
- Increases confidence when patterns align
- Reduces variance as sample sizes grow

---

## Diagnostics and Monitoring

### Learning Status Endpoint
- **URL**: `/.netlify/functions/learn-diag`
- **Returns**: Status for all 5 learning models
- **Metrics**:
  - `picksToday`: Whether picks were logged today
  - `samples`: Total learned samples (at-bats, matches, etc.)
  - `daysLearned`: Number of unique dates with data
  - `lastRun`: Timestamp of last successful run
  - `func.reachable`: Whether scheduled function is accessible

### Model-Specific Diagnostics
- **MLB HR Extras**:
  - `batters`: Number of batters with learned patterns
  - `pitchers`: Number of pitchers with learned patterns
  - `leaguePitchSamples`: League-wide pitch type samples
  - `leagueZoneSamples`: League-wide zone samples

### UI Display
- Footer diagnostics show green/yellow/red status lights
- Learning diagnostics component in:
  - `/src/components/LearningDiagnostics.jsx`
  - `/src/components/FooterDiagnostics.jsx`
- Pages with diagnostics:
  - MLB HR page (`/mlb-hr`)
  - MLB Hits page (`/mlb-hits2`)
  - HRR page (`/hrr`)
  - Home page footer

---

## Storage Architecture

### Netlify Blobs Stores
Each model uses dedicated stores for isolation and performance:

```javascript
const STORES = {
  mlb_hr: ['mlb-learning', 'mlb_hr-learning'],
  mlb_hits2: ['hits-learning', 'mlb_hits2-learning'],
  mlb_sb: ['sb-learning', 'mlb_sb-learning'],
  nfl_td: ['nfl-learning', 'nfl_td-learning'],
  soccer_ags: ['soccer-learning', 'soccer_ags-learning']
};
```

### Data Structure
```
{store}/
├── summary.json              # Overall statistics
├── learn/
│   ├── daily/
│   │   ├── 2025-10-01.json  # Daily learning results
│   │   ├── 2025-10-02.json
│   │   └── ...
│   └── manifest.json         # List of all learning dates
├── league/
│   ├── pitchTypes.json       # MLB: League pitch averages
│   └── zoneBuckets.json      # MLB: League zone averages
├── batters/
│   └── {playerId}.json       # MLB: Per-batter patterns
├── pitchers/
│   └── {playerId}.json       # MLB: Per-pitcher patterns
└── picks/
    └── {date}.json           # Logged predictions for grading
```

---

## Migration Status

### ✅ Completed
- [x] Added MLB daily learners to `netlify.toml`
- [x] Added Hits2 daily learner to `netlify.toml`
- [x] Added SB daily learner to `netlify.toml`
- [x] Added Soccer daily learner to `netlify.toml`
- [x] Verified all learning functions exist in repo
- [x] Confirmed diagnostics endpoints functional
- [x] Documented system architecture

### ⚠️ Pending
- [ ] Create NFL TD learner functions
- [ ] Verify MLB learners run successfully (requires MLB games)
- [ ] Verify Soccer learner runs successfully
- [ ] Monitor first week of automated runs
- [ ] Confirm Netlify Blobs stores populated correctly

### 🔍 Testing Recommendations
1. **Trigger manual runs**: Call each function with `?dry=1` parameter
2. **Check diagnostics**: Visit `/.netlify/functions/learn-diag`
3. **Inspect Blobs**: Use `/.netlify/functions/blobs-introspect`
4. **Monitor logs**: Check Netlify function logs for scheduled runs
5. **Validate learning**: Compare predictions before/after learning cycles

---

## Expected Benefits

### 1. Improved Accuracy
- Models learn from real outcomes vs predictions
- Edge calculations become more precise over time
- Confidence intervals narrow with more data

### 2. Adaptive Calibration
- Automatically adjusts for bias (over/under-predicting)
- Responds to meta-game changes (rule changes, strategy shifts)
- Adapts to seasonal trends (early season vs playoffs)

### 3. Reduced Variance
- Player-specific patterns reduce uncertainty
- Matchup-specific data improves projections
- League baselines provide fallback when data is sparse

### 4. Transparent Diagnostics
- Real-time status monitoring
- Sample size tracking for confidence
- Last run timestamps for troubleshooting

---

## Next Steps

1. **Deploy to Netlify**: Commit and push `netlify.toml` changes
2. **Verify Schedules**: Check Netlify dashboard → Functions → Scheduled
3. **Manual Trigger**: Run each learner once manually to populate stores
4. **Monitor First Run**: Check logs tomorrow morning (3:00-3:30am ET)
5. **Build NFL Learner**: Create NFL TD learning functions based on MLB pattern

---

## Related Files

- `netlify.toml` - Scheduled function configuration
- `netlify/functions/mlb-daily-learn.mjs` - MLB HR learner
- `netlify/functions/hits2-daily-learn.mjs` - MLB Hits learner
- `netlify/functions/sb-daily-learn.mjs` - MLB SB learner
- `netlify/functions/soccer-daily-learn.mjs` - Soccer learner
- `netlify/functions/learn-diag.mjs` - Diagnostics endpoint
- `netlify/functions/mlb-learner-v2.mjs` - MLB learning compute function
- `src/components/LearningDiagnostics.jsx` - UI component

---

**Migration Completed**: October 9, 2025, 11:45 PM ET  
**Next Scheduled Run**: October 10, 2025, 3:05 AM ET (MLB learner)

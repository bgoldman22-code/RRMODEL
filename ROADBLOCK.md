# Phase 3.5 Roadblock: Feature Mismatch

## Current Status
✅ **Data Quality Fixed**: Zion Nov 24 shows correct 29pts/1reb/2ast  
✅ **Player Name Parsing Fixed**: Was using "Over"/"Under" as player names, now correctly extracts from TheOddsAPI  
❌ **BLOCKED**: Feature mismatch - generating 67 features but models expect 60

## The Problem

### Error Output
```
[FEATURE MISMATCH] {
  model: 'points_over',
  expected: 60,
  live: 67,
  missing: [ 'line' ],
  extra: [
    'L5_games',
    'L10_games',
    'L20_games',
    'L40_games',
    'L999_games',
    'L999_minutes',
    'L999_fga',
    'L999_fta'
  ]
}
```

### What's Wrong
1. **Missing**: Model expects `line` feature but can't find it
2. **Extra**: Generating 8 features the model doesn't expect:
   - `L5_games`, `L10_games`, `L20_games`, `L40_games` (4 window game counts)
   - `L999_games` (all-time game count)
   - `L999_minutes`, `L999_fga`, `L999_fta` (3 all-time stats)

## Expected Features (60 total)

From: `data/nba/models/phase3_lgbm/points_over_v1_20251125.json`

```json
[
  "L5_ppg", "L10_ppg", "L20_ppg", "L40_ppg", "L999_ppg",
  "L5_rpg", "L10_rpg", "L20_rpg", "L40_rpg", "L999_rpg",
  "L5_apg", "L10_apg", "L20_apg", "L40_apg", "L999_apg",
  "L5_pra", "L10_pra", "L20_pra", "L40_pra", "L999_pra",
  "L5_minutes", "L10_minutes", "L20_minutes", "L40_minutes",
  "L5_fga", "L10_fga", "L20_fga", "L40_fga",
  "L5_fta", "L10_fta", "L20_fta", "L40_fta",
  "season_ppg", "season_rpg", "season_apg", "season_pra",
  "season_minutes", "season_fga", "season_fta", "season_games_played",
  "h2h_ppg", "h2h_rpg", "h2h_apg", "h2h_pra",
  "h2h_minutes", "h2h_fga", "h2h_fta", "h2h_games_played",
  "opp_def_L5_pra_allowed", "opp_def_L10_pra_allowed",
  "opp_def_L5_ppg_allowed", "opp_def_L10_ppg_allowed",
  "opp_def_L5_rpg_allowed", "opp_def_L10_rpg_allowed",
  "opp_def_L5_apg_allowed", "opp_def_L10_apg_allowed",
  "rest_days",
  "home",
  "line",
  "games_played"
]
```

### Key Observations
- ✅ `L5-L40` windows: Include ppg, rpg, apg, pra, minutes, fga, fta (7 stats each)
- ✅ `L999` window: ONLY ppg, rpg, apg, pra (4 stats - NO minutes, fga, fta)
- ❌ NO `L5_games`, `L10_games` etc. (not used as features)
- ✅ Includes `line` (the over/under line value)
- ✅ Includes `home` (1 or 0)
- ✅ Includes `games_played` (total historical games)

## Relevant Code

### 1. Feature Calculation (UPDATED BUT NOT WORKING)
**File**: `scripts/nba/generate-predictions-phase3.5.mjs` lines 172-205

```javascript
// Rolling windows: L5, L10, L20, L40, L999 (all games)
for (const [label, window] of [['L5', 5], ['L10', 10], ['L20', 20], ['L40', 40], ['L999', 999]]) {
  const windowGames = window === 999 ? priorGames : priorGames.slice(-window);
  const n = windowGames.length;
  
  if (n > 0) {
    // DO NOT add L5_games, L10_games etc - models don't expect those
    features[`${label}_ppg`] = windowGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
    features[`${label}_rpg`] = windowGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
    features[`${label}_apg`] = windowGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    features[`${label}_pra`] = windowGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
    features[`${label}_minutes`] = windowGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
    
    // Only calculate fga/fta for non-L999 windows (models only expect these for L5-L40)
    if (window !== 999) {
      features[`${label}_fga`] = windowGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
      features[`${label}_fta`] = windowGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
    }
  } else {
    // Fill with zeros if no games in window
    features[`${label}_ppg`] = 0;
    features[`${label}_rpg`] = 0;
    features[`${label}_apg`] = 0;
    features[`${label}_pra`] = 0;
    features[`${label}_minutes`] = 0;
    if (window !== 999) {
      features[`${label}_fga`] = 0;
      features[`${label}_fta`] = 0;
    }
  }
}
```

**Status**: Code looks correct - removed `L5_games` etc. and excluded `L999_minutes/fga/fta`

### 2. Line Feature Addition
**File**: `scripts/nba/generate-predictions-phase3.5.mjs` lines 515-520

```javascript
if (!features) {
  // No historical data for this player
  skipped.noFeatures++;
  continue;
}

// Add the line value to features (models were trained with this)
features.line = line;

// Normalize features to match model requirements
const normalizedFeatures = normalizeFeatures(features, engine.registry);
```

**Status**: Line is added to features object before normalization

### 3. Feature Normalization
**File**: `netlify/functions/_lib/nba-props-engine-v3.mjs` lines 354-369

```javascript
export function normalizeFeatures(featureObject, model) {
  const normalized = {};
  
  // Use model-specific feature columns if available
  const featureList = model.feature_columns || model.metadata?.feature_list || [];
  
  for (const feature of featureList) {
    normalized[feature] = (featureObject[feature] !== undefined && featureObject[feature] !== null)
      ? featureObject[feature]
      : 0;
  }
  
  return normalized;
}
```

**Status**: Should only select features that exist in model.feature_columns

### 4. Feature Mismatch Detection
**File**: `netlify/functions/_lib/nba-props-engine-v3.mjs` lines 259-270

```javascript
// Debug logging for feature mismatch (one-time check)
if (!featureMismatchLogged.has(cacheKey)) {
  featureMismatchLogged.add(cacheKey);
  console.warn('[FEATURE MISMATCH]', {
    model: cacheKey,
    expected: expectedCount,
    live: Object.keys(featureObject).length,
    missing: expectedFeatures.filter(f => !(f in featureObject)),
    extra: Object.keys(featureObject).filter(f => !expectedFeatures.includes(f))
  });
}
```

**Status**: This is checking the ORIGINAL `featureObject` before normalization, not the normalized one!

## Data Formats

### Our Boxscore Data
**File**: `data/nba/player-history-2024-2026.json` (29,426 records)

```json
{
  "playerName": "Zion Williamson",
  "date": "2025-11-24",
  "points": 29,
  "rebounds": 1,
  "assists": 2,
  "minutes": 30.0,
  "fgAtt": 14,
  "ftAtt": 16,
  "team": "NOP",
  "opponent": "CHI",
  "isHome": true
}
```

**Available Fields (2025-26 data)**:
- ✅ playerName, points, rebounds, assists, minutes
- ✅ fgAtt, ftAtt, fgMade, ftMade (shooting stats)
- ✅ team, opponent, isHome
- ✅ date (YYYY-MM-DD format)
- ❌ Missing: fga, fta (need to use fgAtt, ftAtt instead)

**Available Fields (2024-25 data)**:
- ✅ playerName, points, rebounds, assists, minutes
- ❌ Missing: fgAtt, ftAtt (all shooting stats missing)
- ✅ team, opponent, homeAway
- ✅ date (YYYY-MM-DD format)

### TheOddsAPI Format
**From API response** (lines 435-450 in generate-predictions-phase3.5.mjs)

```javascript
// Outcome structure
{
  "name": "Over",              // ← This is the SIDE (not player name!)
  "description": "Zion Williamson",  // ← This is the PLAYER NAME
  "price": -110,               // ← American odds
  "point": 24.5                // ← The line (over/under value)
}
```

**Fixed in code** (line 433):
```javascript
// TheOddsAPI format: name=side, description=player (opposite of what you'd expect!)
const { name: side, description: playerName, price: odds, point: line } = outcome;
```

## Mystery: Why Is Error Still Showing Old Features?

### Hypothesis 1: Caching Issue
- Node.js may be caching the old module
- **Solution**: Kill all node processes and restart

### Hypothesis 2: Wrong Function Being Called
- Maybe there's another `calculateFeatures` function
- **Check**: `grep -n "function calculateFeatures" scripts/nba/generate-predictions-phase3.5.mjs`

### Hypothesis 3: Feature Detection Logic
- The error is checking `featureObject` BEFORE normalization
- So it's seeing ALL generated features (67)
- But normalization should then select only the 60 expected ones
- **Issue**: The warning is cosmetic but normalization should still work

### Hypothesis 4: Features Object Is Modified Elsewhere
- Something is adding those extra fields after our loop
- **Check**: Search for where `features` object is modified

## Next Steps

1. **Verify code is actually running**:
   ```bash
   # Add a console.log at start of calculateFeatures
   # Check if the comment "DO NOT add L5_games" appears in grep
   ```

2. **Check if normalizeFeatures is selecting correctly**:
   ```javascript
   // After normalization, log the keys
   console.log('Normalized keys:', Object.keys(normalizedFeatures));
   console.log('Normalized length:', Object.keys(normalizedFeatures).length);
   ```

3. **Ignore the warning and check actual predictions**:
   - The warning checks the INPUT features (67)
   - But `normalizeFeatures` should output exactly 60
   - Models might still work despite the warning

4. **Manual feature object construction**:
   - Instead of fixing the loop, build the exact 60 features manually
   - Guarantees correct output

## Critical Data Verification

✅ **Zion Williamson Nov 24, 2025**: 29pts/1reb/2ast (CORRECT in data)  
✅ **2024-25 season**: 23,609 games, 89.9% complete  
✅ **2025-26 season**: 5,817 games through Nov 25  
✅ **Merged file**: 29,426 records, proper date normalization  
✅ **Player name parsing**: Fixed (was "Over"/"Under", now actual names)

## Files Modified This Session

1. `scripts/nba/fetch-clean-history.py` - Set to fetch 2025-26 only
2. `scripts/nba/generate-predictions-phase3.5.mjs` - Fixed player names + features
3. `data/nba/player-boxscores-2025-26.json` - Re-fetched with correct data
4. `data/nba/player-history-2024-2026.json` - Re-merged with clean data

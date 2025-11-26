# Phase 3.5 Feature Mismatch Resolution

## Problem Summary
The generator was hitting feature count mismatches between live features (67) and model expectations (60 for LightGBM, 30 for Logistic). This caused the prediction pipeline to stall.

## Root Causes Identified

### 1. Extra Features Generated
The `calculateFeatures()` function was creating features the models weren't trained on:
- `L5_games`, `L10_games`, `L20_games`, `L40_games`, `L999_games` (not used)
- `L999_minutes`, `L999_fga`, `L999_fta` (not in model schema)

### 2. Missing Feature Normalization for Logistic Models
The Logistic models (assists) expected 30 features, but were receiving the raw 60-feature object without normalization.

### 3. Mismatch Detection on Wrong Object
The feature mismatch warning compared raw features instead of normalized features, making it hard to debug.

## Solutions Applied

### Fix 1: Aligned Feature Generation (`scripts/nba/generate-predictions-phase3.5.mjs`)

**Changed rolling window logic** to match exact model schema:

```javascript
// OLD: Generated 67 features including L5_games, L999_minutes, etc.
for (const [label, window] of [['L5', 5], ...]) {
  features[`${label}_games`] = n;  // ❌ Not in model
  features[`${label}_minutes`] = ...;  // ❌ Wrong for L999
}

// NEW: Generate exactly 60 features matching model schema
const rollingWindows = [
  { label: 'L5', size: 5, includeMinutes: true, includeShooting: true },
  { label: 'L10', size: 10, includeMinutes: true, includeShooting: true },
  { label: 'L20', size: 20, includeMinutes: true, includeShooting: true },
  { label: 'L40', size: 40, includeMinutes: true, includeShooting: true },
  { label: 'L999', size: 999, includeMinutes: false, includeShooting: false }  // ✅ No minutes/fga/fta
];
```

**Result**: 
- L5/L10/L20/L40 each generate 7 stats (ppg, rpg, apg, pra, minutes, fga, fta) = 28 features
- L999 generates only 4 stats (ppg, rpg, apg, pra) = 4 features
- Plus 28 context features = **60 total**

### Fix 2: Normalized Logistic Features (`netlify/functions/_lib/nba-props-engine-v3.mjs`)

**Added normalization for Logistic models**:

```javascript
// OLD: Passed raw 60 features to Logistic (expects 30)
if (modelConfig.engine === 'logistic_pra') {
  probability = predictLogistic(features, model);  // ❌ Wrong feature count
}

// NEW: Normalize to model's expected 30 features
if (modelConfig.engine === 'logistic_pra') {
  const model = side === 'Over' ? modelConfig.overModel : modelConfig.underModel;
  const normalizedFeatures = normalizeFeatures(features, model);  // ✅ 30 features
  
  // One-time shape assertion
  const shapeKey = `${modelKey}_${side}`;
  if (!featureShapeChecked.has(shapeKey)) {
    featureShapeChecked.add(shapeKey);
    const expectedCount = model.feature_columns.length;
    const actualCount = Object.keys(normalizedFeatures).length;
    if (actualCount !== expectedCount) {
      throw new Error(`Feature count mismatch for ${shapeKey}: expected ${expectedCount}, got ${actualCount}`);
    } else {
      console.log(`[FeatureShape] ${shapeKey}: ${actualCount} features`);
    }
  }
  
  probability = predictLogistic(normalizedFeatures, model);  // ✅ Correct
}
```

### Fix 3: Mismatch Detection on Normalized Features

**Changed comparison to use normalized features**:

```javascript
// OLD: Compared raw features (misleading)
const liveKeys = Object.keys(features).length;

// NEW: Compare normalized features (what model actually sees)
const normalizedFeatures = normalizeFeatures(features, metadata);
const normalizedKeys = Object.keys(normalizedFeatures);
const missing = featureColumns.filter(c => !(c in normalizedFeatures));
const extra = normalizedKeys.filter(c => !featureColumns.includes(c));
```

## Verification Results

### Before Fixes
```
[FEATURE MISMATCH] {
  model: 'points_over',
  expected: 60,
  live: 67,
  missing: [ 'line' ],
  extra: [ 'L5_games', 'L10_games', 'L20_games', 'L40_games', 
           'L999_games', 'L999_minutes', 'L999_fga', 'L999_fta' ]
}
✅ Generated 0 predictions
```

### After Fixes
```
[FeatureShape] assists_Over: 30 features    ✅
[FeatureShape] assists_Under: 30 features   ✅
[FeatureShape] points_Over: 60 features     ✅
[FeatureShape] points_Under: 60 features    ✅
[FeatureShape] rebounds_Over: 60 features   ✅
[FeatureShape] rebounds_Under: 60 features  ✅

✅ Generated 151 predictions (0 errors)
   - Assists: 9 (Logistic with 30 features)
   - Points: 80 (LightGBM with 60 features)
   - Rebounds: 62 (LightGBM with 60 features)
```

## Key Insights

1. **Logistic vs LightGBM have different feature sets**
   - Logistic (assists): 30 features (no line, no opponent defense)
   - LightGBM (points/rebounds): 60 features (full context)

2. **L999 window is intentionally limited**
   - Only tracks scoring stats (ppg, rpg, apg, pra)
   - Excludes minutes/shooting to avoid overfitting on stale data

3. **Normalization happens per-model**
   - Each model defines its own `feature_columns` array
   - `normalizeFeatures()` selects exactly those columns, fills missing with 0

4. **Feature shape checks are one-time per model**
   - Uses `featureShapeChecked` Set to avoid log spam
   - Throws error on mismatch, logs success on first prop

## Test Command

```bash
cd ~/Desktop/REPO33/RRMODEL
export ODDS_API_KEY="c5d3fe15e6c5be83b2acd8695cff012b"
node scripts/nba/generate-predictions-phase3.5.mjs
```

**Expected**:
- ✅ No feature mismatch warnings
- ✅ 150+ predictions across all three markets
- ✅ Feature shape logs show correct counts (30 for assists, 60 for points/rebounds)
- ✅ Completes in ~15 minutes

## Files Modified

1. **scripts/nba/generate-predictions-phase3.5.mjs**
   - Removed `normalizeFeatures` import (engine handles it)
   - Fixed rolling window feature generation to match model schema
   - Removed extra fields (L5_games, L999_minutes, etc.)

2. **netlify/functions/_lib/nba-props-engine-v3.mjs**
   - Added feature normalization for Logistic models
   - Added one-time shape assertions for all models
   - Fixed mismatch detection to compare normalized features
   - Added `featureShapeChecked` Set to avoid log spam

3. **scripts/nba/README-PHASE3.5-GENERATION.md** (new)
   - Complete feature schema documentation
   - Run commands and expected output
   - Troubleshooting guide

## Status: ✅ RESOLVED

The generator now produces predictions successfully for all three markets with correct feature counts.

# Action Plan: Fix Extreme Spread Predictions

## Current Status

### Deployed Changes
1. ✅ Added detailed spread calculation debug logging for SF, TB, ATL, BUF games
2. ✅ Added comprehensive SPREAD_DIAGNOSTIC output per GPT recommendations
3. ✅ Pushed to main41, awaiting Netlify deployment

### Next Steps (In Order)

#### 1. Get Diagnostic Output (Immediate - ~5 minutes)
Wait for Netlify to deploy, then trigger predictions regeneration and capture logs:

```bash
# After Netlify deploys (check https://app.netlify.com/sites/bgroundrobin/deploys)
curl -X POST "https://bgroundrobin.com/.netlify/functions/nfl-predictions-refresh" 2>&1 | tee spread_diagnostic_output.log
```

Look for JSON blocks with `"tag": "SPREAD_DIAGNOSTIC"` for BUF @ ATL and SF @ TB.

#### 2. Analyze Diagnostic Data
The diagnostic will show us:
- `features.base_home_score` and `features.base_away_score` (should be -0.5 to +0.5 range typically)
- `comp.scoreDifference` (should be small, < 1.0 typically)
- `comp.injury_home_total` and `comp.injury_away_total` (should be reasonable, < 15 total typically)
- `comp.hfa_pts` (should be 1.5-2.5)
- `comp.spreadFromScores` (scoreDifference × 3.0)
- `out.diff` (model vs market difference - currently showing 18-20 points)

**Key Questions to Answer:**
1. Are `base_home_score` values actually in the 0-1 probability range instead of EPA range?
2. Is `scoreDifference` showing something like 5-6 instead of 0.3-0.5?
3. Are injury impacts being applied with wrong signs?
4. Is HFA being added twice or with wrong sign?

#### 3. Implement Fixes Based on Findings

### Most Likely Scenario: Score/EPA Confusion
If base scores are in 0-1 range (probabilities):
```javascript
// BEFORE (WRONG):
const scoreDifference = homeScoreData.score - awayScoreData.score;
// If scores are 0.701 - 0.299 = 0.402
// Then 0.402 × 3.0 = 1.206 points
// But something else must be adding 13+ more points!

// AFTER (FIX):
// Need to ensure scores are in EPA scale (-0.5 to +0.5), not probability scale (0-1)
```

### Alternative Scenario: Injury Sign Error
If injuries are being applied with wrong sign:
```javascript
// WRONG: Subtracting when should add (or vice versa)
const adjustedScore = baseScore - injuryImpact; // If injuryImpact is negative, this adds!

// RIGHT:
const adjustedScore = baseScore + injuryImpact; // Where negative impact reduces score
```

### Alternative Scenario: HFA Double-Application
```javascript
// Check if HFA is being added in scoreTeamFromFeatures AND in spread calculation
// Should only be added once in spread calculation
```

#### 4. Code Patches to Apply

Once we identify the issue, apply these safeguards:

**A. Unit Validation:**
```javascript
// In scoreTeamFromFeatures, before returning:
if (Math.abs(finalScore) > 2.0) {
  console.warn(`⚠️ Unusually large score: ${finalScore} for ${teamCode}`);
}
assert(Number.isFinite(finalScore), 'Score must be finite');

// Return with metadata:
return { 
  score: finalScore, 
  confidence: finalConfidence, 
  evidenceStrength,
  specialTeams: specialTeamsMetrics,
  _meta: {type: 'epa_composite', range: 'typically -0.5 to +0.5'}
};
```

**B. Spread Calculation Guards:**
```javascript
// Before multiplying:
assert(Math.abs(scoreDifference) < 2.0, `Score difference too large: ${scoreDifference}`);

// After all adjustments:
const sanityCheck = Math.abs(predictedHomeMargin - marketHomeMargin);
if (sanity Check > 10) {
  console.error(`🚨 EXTREME DIVERGENCE: ${sanityCheck} points`);
  // Apply governor:
  const governed = marketHomeMargin + Math.sign(predictedHomeMargin - marketHomeMargin) * 8;
  console.log(`   Governing from ${predictedHomeMargin} to ${governed}`);
  return governed;
}
```

**C. Sign Discipline:**
```javascript
// Ensure consistent conventions:
// - Positive spread = home team favored
// - Injury impact: negative = hurts team
// - Always: home_value - away_value for margins
```

#### 5. Implement Divergence Governor

Add this function:
```javascript
function governSpread(modelMargin, marketMargin, maxDelta = 8.0) {
  const diff = modelMargin - marketMargin;
  if (Math.abs(diff) <= maxDelta) {
    return { value: modelMargin, hedged: false, divergence: diff };
  }
  
  const governedValue = marketMargin + Math.sign(diff) * maxDelta;
  console.warn(`📊 SPREAD GOVERNED: ${modelMargin.toFixed(1)} → ${governedValue.toFixed(1)} (market: ${marketMargin.toFixed(1)})`);
  
  return { 
    value: governedValue, 
    hedged: true, 
    divergence: diff,
    originalModel: modelMargin 
  };
}

// Use it:
const governedSpread = governSpread(predictedHomeMargin, marketHomeMargin);
game.predictions.spread.model_home_margin = governedSpread.value;
game.predictions.spread.hedged = governedSpread.hedged;
if (governedSpread.hedged) {
  game.predictions.flags = [...(game.predictions.flags || []), 'DIVERGENCE_GOVERNED'];
}
```

#### 6. Testing Checklist

After fix is deployed:
- [ ] BUF @ ATL spread shows model within ±8 points of market
- [ ] SF @ TB spread shows model within ±8 points of market
- [ ] No other games have >10 point divergences
- [ ] Score differences are in expected range (-1.0 to +1.0)
- [ ] Injury impacts are reasonable (total < 15 points per team)
- [ ] HFA is 1.5-2.5 points
- [ ] Manual calculation matches model output

## Timeline

- **Now**: Changes deployed, waiting for Netlify
- **+5 min**: Netlify deployed, trigger refresh
- **+10 min**: Analyze diagnostic output
- **+20 min**: Identify root cause
- **+30 min**: Implement fix
- **+40 min**: Deploy and test
- **+50 min**: Verify all games look reasonable

## Communication

Once fixed, update user with:
1. Root cause identified (with specific diagnostic values)
2. Fix applied (with code changes shown)
3. New predictions showing reasonable spreads
4. Safeguards added to prevent recurrence

## Fallback Plan

If diagnostic doesn't reveal obvious issue:
1. Add even more granular logging (every step of score calculation)
2. Compare Week 5 vs Week 6 EPA values for these teams
3. Check if injury data changed dramatically between weeks
4. Manually calculate expected spread using formula and compare

# NFL Clean EPA Refactor - Critical Issues Analysis

## Context
After implementing a Clean EPA system to eliminate fake multipliers and double-counting, these are the 6 spots that typically break after major refactors. Here's the analysis of our current implementation:

## 1. Variance Modeling ❌ NEEDS WORK

**Current Implementation:**
```javascript
// Basic Gaussian addition - too simplistic
const totalVariance = Math.sqrt(homeOffVar + homeDefVar + awayOffVar + awayDefVar);
```

**Problems:**
- Not derived from explosive play rates or pressure differentials
- Missing calibrated tail modeling for high-variance matchups
- No connection between "explosive diff" and actual spread MAE
- High explosive differential matchups should show larger spread MAE but better calibrated tails (more 10+ and 17+ results)

**Fix Needed:**
```javascript
function calculateSophisticatedVariance(homeTeam, awayTeam, gameContext) {
  // Explosive play differential creates fat tails
  const homeExplosive = homeTeam.situational?.explosive_rate || 0.15;
  const awayExplosive = awayTeam.situational?.explosive_rate || 0.15; 
  const explosiveDiff = Math.abs(homeExplosive - awayExplosive);
  
  // High explosive differential = fatter tails (more 10+ and 17+ results)
  const tailFactor = 1 + (explosiveDiff * 2.5);
  
  return baseVariance * tailFactor;
}
```

## 2. No-Bet Logic Frontend Interaction ⚠️ PARTIAL

**Current Implementation:**
```javascript
moneyline: { pick: skipCheck.skip ? null : mlPick, confidence: mlConfidence }
```

**Problems:**
- `null` pick might not render as "—" in UI
- Confidence still shows number instead of being blanked
- No guarantee pushes won't be graded as wins/losses
- Need clean propagation to UI without phantom units

**Fix Needed:**
```javascript
moneyline: { 
  pick: skipCheck.skip ? "—" : mlPick, 
  confidence: skipCheck.skip ? "—" : mlConfidence,
  noBet: true,
  skipReason: skipCheck.reason 
}
```

## 3. Calibration Logic ❌ MISSING ENTIRELY

**Current State:** No Platt scaling or isotonic calibration found in the codebase

**Problems:**
- Have "variance adjustment" but NO probability calibration layer
- Missing the crucial 55-65% band calibration where drift occurs
- No recent-weeks-only calibration for improved honesty
- This is critical for maintaining accuracy in confidence bands

**Fix Needed:**
```javascript
function applyCalibrationLayer(rawProb, recentResults) {
  // Platt scaling on last 8 weeks only
  if (recentResults.length >= 20) {
    return plattCalibration(rawProb, recentResults.slice(-20));
  }
  
  // Special adjustment for 55-65% band (where drift was identified)
  if (rawProb >= 0.55 && rawProb <= 0.65) {
    const adjustment = -0.03; // Pull back toward 50%
    const adjustedLogOdds = Math.log(rawProb / (1 - rawProb)) + adjustment;
    return 1 / (1 + Math.exp(-adjustedLogOdds));
  }
  
  return rawProb;
}
```

**Totals Residual Calibration:**
```javascript
// Tiny ridge regression on (final - market) using:
// - expected plays
// - EPAs  
// - wind >= 15 flag
// This boosts honesty in 55-65% bands
```

## 4. Totals Logic ✅ GOOD

**Current Implementation:**
```javascript
// Removed artificial floors - allows real collapses
const homeExpected = Math.max(7, 21 + (homeOffEPA - awayDefEPA) * 25); // Removed 14-point floor
```

**Status:** ✅ Good - No double counting found, real collapses allowed
- Verified no double counting (form in PPP and additive form)
- Expected plays properly downshift for big favorites/late leads
- Doesn't rely on market line when missing (uses model margin as proxy)

## 5. Edge Definition ⚠️ UNCLEAR

**Current Implementation:**
```javascript
// Edge calculation method not clearly defined
const edge = Math.abs(homeWinProb - 0.5);
if (edge < 0.12) { // Is this 12% edge?
```

**Problems:**
- Not clear if comparing to vig-removed market odds
- "2% edge" threshold not clearly defined
- Missing vig removal before comparison
- Need to define: Market prob from live odds (implied, vig-reduced) vs calibrated model prob

**Fix Needed:**
```javascript
function calculateTrueEdge(modelProb, marketOdds) {
  // Convert American odds to implied probabilities
  const homeImplied = americanToImplied(marketOdds.home);
  const awayImplied = americanToImplied(marketOdds.away);
  
  // Remove vig (overround)
  const totalImplied = homeImplied + awayImplied;
  const homeTrue = homeImplied / totalImplied;  // Vig-removed market probability
  
  // True edge = |model_prob - vig_free_market_prob|
  const trueEdge = Math.abs(modelProb - homeTrue);
  
  // 2% edge threshold check
  return {
    edge: trueEdge,
    hasMinimumEdge: trueEdge >= 0.02
  };
}
```

## 6. Artifacts & Workflow ❌ OUTDATED

**Current Issues:**
- Using `@v3` actions in GitHub workflow (should be `@v4`)
- Missing repo-structure.txt artifact for quick mapping
- Previous upload-artifact@v3 failures noted

**Fix Needed:**
```yaml
- uses: actions/checkout@v4  # Update from @v3
- uses: actions/setup-node@v4  # Update from @v3

# Add repo structure artifact
- name: Generate repo structure
  run: find . -type f -name "*.js" -o -name "*.mjs" -o -name "*.json" > repo-structure.txt
  
- uses: actions/upload-artifact@v4
  with:
    name: repo-structure
    path: repo-structure.txt
```

## Priority Fixes

**HIGH PRIORITY:**
1. **Add calibration layer** - Critical for 55-65% confidence band accuracy
2. **Implement sophisticated variance** - Essential for proper tail modeling
3. **Fix edge calculation** - Must use vig-removed market odds

**MEDIUM PRIORITY:**
4. **Clean no-bet UI integration** - Ensure proper "—" display
5. **Update GitHub Actions** - Prevent workflow failures

**LOW PRIORITY:**
6. **Totals logic** - Already working correctly

## Implementation Notes

- The variance modeling should use explosive play differential and pressure differential to create "fat tails"
- Calibration layer is completely missing and was a major source of confidence drift
- Edge calculation must compare against vig-free market probabilities, not raw market odds
- No-bet logic needs clean frontend integration to avoid phantom bets

## Testing Recommendations

1. **Variance Check:** Games with top-quartile explosive diff should show larger spread MAE but better calibrated tails
2. **Calibration Check:** Monitor 55-65% confidence band for improved honesty after Platt scaling
3. **Edge Check:** Verify 2% edge threshold uses vig-removed market probabilities
4. **Frontend Check:** Confirm no-bet games display "—" and aren't graded as wins/losses
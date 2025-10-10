# GPT Analysis vs Actual Code Reality

## GPT's Claims vs Our Code

### ❌ CLAIM 1: "Home/Away EPA sign flip - `away_score - home_score`"
**Reality**: Our code is CORRECT
```javascript
// Line 1336 in index.mjs
const scoreDifference = homeScoreData.score - awayScoreData.score; // ✅ CORRECT: home - away
```
GPT was looking at `index-fixed.mjs` which is NOT our production file.

### ❌ CLAIM 2: "Injury penalties applied twice - both elite and legacy"
**Reality**: We only call applyInjuryAdjustments ONCE per team
```javascript
// Lines 2344-2345
homeScoreData = await applyInjuryAdjustments(homeScoreData, homeCode, injuries, currentWeek);
awayScoreData = await applyInjuryAdjustments(awayScoreData, awayCode, injuries, currentWeek);
```
Single call, using canonical availability v5 system.

### ❓ CLAIM 3: "HFA added twice - in schedule-source AND in model"
**Needs Investigation**: Let me check if HFA is in scoreTeamFromFeatures

### ❓ CLAIM 4: "Sanity guard runs before final adjustments"
**Partially True**: We do have a sanity check but need to verify order

### ✅ CLAIM 5: "Need historical regression for EPA → points scaling"
**Good Advice**: Using fixed 3.0 multiplier may not be calibrated to actual NFL outcomes

## What We Actually Need to Check

Based on the diagnostic we added, we need to see:

1. **Are the base scores in the right range?**
   - Expected: -0.5 to +0.5 (EPA composite)
   - If we see 0.3-0.7 range, that's probabilities being used as scores!

2. **Is the injury impact reasonable?**
   - Expected: -15 to +5 points total per team
   - If we see 30+ point swings, something's wrong

3. **Is HFA being added correctly?**
   - Expected: ~1.5-2.5 points added to home team once
   - If we see 4-5 points, it's being doubled

4. **What is the actual scoreDifference value?**
   - Expected for close teams: -0.3 to +0.3
   - If we see 5-6, that's where the ×3.0 creates 15-18 points

## Most Likely Root Cause (My Hypothesis)

Based on seeing homeWinProb values of 0.701/0.299 and 0.696/0.304, I suspect:

**The `score` field is actually a normalized win probability (0-1 range), not an EPA composite (-0.5 to +0.5 range)**

If that's true:
- ATL "score" = 0.701, BUF "score" = 0.299
- scoreDifference = 0.701 - 0.299 = 0.402
- spreadFromScores = 0.402 × 3.0 = 1.206 points

But then something else (injury or ST) must be adding another ~13 points to get to 14.4!

OR, the scores are being calculated correctly but then RENORMALIZED to 0-1 range somewhere, and we're using the normalized version instead of the raw version.

## Action: Wait for Diagnostic Output

Our SPREAD_DIAGNOSTIC will show us:
```json
{
  "features": {
    "base_home_score": 0.701,  // If this is 0-1 range = PROBLEM
    "base_away_score": 0.299   // Should be -0.5 to +0.5 range
  },
  "comp": {
    "scoreDifference": 0.402,   // If this is 0.4 = PROBLEM (should be ~0.05)
    "spreadFromScores": 1.206,  // If this is 1.2 but output is 14.4...
    "injury_home_total": ???,   // This must be adding ~13 points!
    "hfa_pts": 1.8
  }
}
```

## What to Do When Diagnostic Arrives

1. **If base_home_score is 0.5-0.8 range**: 
   - Scores are probabilities, not EPA
   - Need to find where normalization happens and use pre-normalized values

2. **If scoreDifference is > 1.0**:
   - Something upstream is wrong in scoreTeamFromFeatures
   - Check the SCORING_MULTIPLIERS constants

3. **If injury_home_total or injury_away_total is > 15**:
   - Injury system is over-penalizing
   - Check the canonical availability caps

4. **If hfa_pts is > 3.0**:
   - HFA is being added twice
   - Find and remove duplicate HFA application

## GPT's Good Advice (That We Should Consider)

1. **Historical regression for EPA → points**:
   ```python
   # Fit on 2022-2024 data:
   # Actual_Margin ~ EPA_off_diff + EPA_def_diff + QB_value + Form
   # Get coefficients for proper scaling
   ```

2. **Divergence governor**:
   ```javascript
   if (Math.abs(modelMargin - marketMargin) > 8) {
     // Flag but don't necessarily clamp - investigate first
     console.error('EXTREME_DIVERGENCE');
   }
   ```

3. **One-pass injury system**:
   - We're already doing this ✅

4. **Remove 0-1 normalization**:
   - Need to check if this is happening in scoreTeamFromFeatures

## Next Steps

1. Wait for Netlify deployment (~2-3 minutes)
2. Trigger predictions refresh
3. Capture SPREAD_DIAGNOSTIC output for BUF @ ATL and SF @ TB
4. Analyze the actual values
5. Identify exact root cause
6. Apply surgical fix (not GPT's speculative fixes)

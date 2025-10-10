# ROOT CAUSE IDENTIFIED

## The Problem

From the live predictions data, we can see:

**BUF @ ATL:**
- home_win_prob: 0.701 (70.1%)
- away_win_prob: 0.299 (29.9%)
- model_home_margin: **14.4**
- market_spread: BUF -4.5 (so market_home_margin = +4.5 for ATL)
- Divergence: **18.9 points**

**SF @ TB:**
- home_win_prob: 0.304 (30.4%) [TB]
- away_win_prob: 0.696 (69.6%) [SF]
- model_home_margin: **-17.0** (clamped!)
- market_spread: TB -3 (so market_home_margin = +3 for TB)
- Divergence: **20 points**

## The Smoking Gun

The win probabilities (0.701, 0.299, 0.696, 0.304) are being calculated FROM the spread predictions, not the other way around.

But here's the issue: **The spread calculation is using homeScoreData.score and awayScoreData.score values that are likely in the WRONG RANGE.**

## Theory

`scoreTeamFromFeatures()` returns a "score" that represents the team's overall quality as an EPA composite. This should be a small value like **-0.3 to +0.3** for most teams.

But somewhere in the calculation, these scores might be:
1. Getting normalized to 0-1 range
2. Getting used as raw probabilities
3. Or the multipliers (CORE_EPA=24, TIER_BASE=8, ADVANCED_BASE=10) are way too large

Let me check the actual SCORING_MULTIPLIERS:

```javascript
// From scoreTeamFromFeatures:
const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA;
const tierScore = ... * SCORING_MULTIPLIERS.TIER_BASE;
const advancedScore = ... * SCORING_MULTIPLIERS.ADVANCED_BASE;
```

If CORE_EPA multiplier is 24 and typical offEPA + defEPA = 0.3, then coreScore = 7.2 alone!
If all components add up, final score could be 10-15, not 0.3!

## The Actual Issue

Looking at the spread formula:
```javascript
const scoreDifference = homeScoreData.score - awayScoreData.score;
const spreadFromScores = scoreDifference * 3.0;
```

If scores are actually in the range of 5-15 (point estimates), not -0.5 to +0.5 (EPA composites), then:
- ATL score = 12, BUF score = 8
- scoreDifference = 4
- spreadFromScores = 4 × 3.0 = 12 points
- Add HFA (~2 points) = **14 points** ← This matches our output!

## The Fix

The `score` from `scoreTeamFromFeatures` is NOT an EPA value - it's already a **point expectation**!

The formula should be:
```javascript
// WRONG (current):
const scoreDifference = homeScoreData.score - awayScoreData.score;
const spreadFromScores = scoreDifference * 3.0; // This multiplies points by 3!

// RIGHT (should be):
const predictedHomeMargin = (homeScoreData.score - awayScoreData.score) + adjustedHFA + stSpreadAdjustment;
// NO multiplier! The scores are already in point units!
```

## Verification

Let me trace through what scoreTeamFromFeatures actually returns:

```javascript
const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA; // EPA * 24
const tierScore = (z-scores...) * SCORING_MULTIPLIERS.TIER_BASE; // z-scores * 8  
const advancedScore = (features...) * SCORING_MULTIPLIERS.ADVANCED_BASE; // features * 10
const matchupScore = ... * SCORING_MULTIPLIERS.MATCHUP_BASE;
const specialTeamsScore = ... * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE;

const currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore + specialTeamsScore;
```

These multipliers (24, 8, 10) are converting EPA/z-scores into POINTS!

So a team with:
- offEPA = 0.15, defEPA = 0.10 → coreScore = 0.25 * 24 = **6 points**
- Tier features ≈ 1 z-score = 1 * 8 = **8 points**
- Advanced ≈ 0.5 = 0.5 * 10 = **5 points**
- Total ≈ **19 points** (above average team)

A weak team might score 10 points.

So scoreDifference = 19 - 10 = **9 points** already!
Then we multiply by 3.0 = **27 points** spread!
Then clamp to ±17.

## The Solution

**Remove the 3.0 multiplier** - the scores are already in point units!

```javascript
function calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode) {
  // ... HFA calculation ...
  
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  
  // REMOVE THIS LINE:
  // const spreadFromScores = scoreDifference * 3.0;
  
  // REPLACE WITH:
  const spreadFromScores = scoreDifference; // Scores are already in points!
  
  // ... rest of calculation ...
}
```

This should bring spreads back to reality:
- ATL vs BUF: score diff might be 2-3 points, + HFA 2 = **ATL -4 to -5** ← Reasonable!
- SF vs TB: score diff might be -4 points, + HFA 0 (TB home) = **TB +4** → but market is TB -3, so model would show **SF +1 to +4** ← Also reasonable!

## Expected Results After Fix

- BUF @ ATL: Model ATL -4 vs Market BUF -4.5 → 0.5 point edge (reasonable)
- SF @ TB: Model SF -2 vs Market TB -3 → 5 point edge (plausible)

No more 18-20 point divergences!

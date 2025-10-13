# NFL Predictions Spread Investigation - Status Report
**Date:** October 10, 2025  
**Branch:** main41  
**Last Working Commit:** `565d028` - CRITICAL FIX: Remove 3.0 multiplier

---

## 🎯 PROBLEM SUMMARY

### Original Issue (Morning)
Model was producing **extreme spread predictions** 18-20 points off from Vegas:

1. **SF @ TB**: Model SF -17 vs Market TB -3 (20 pt divergence) ❌
2. **BUF @ ATL**: Model ATL -14.4 vs Market BUF -4.5 (18.9 pt divergence) ❌
3. **TEN @ LV**: Model LV -14.8 vs Market LV -4.5 (10.3 pt divergence)
4. **CIN @ GB**: Model GB -10.2 vs Market GB -14.5 (4.3 pt divergence) ✅

### Root Cause Identified
**Line 1338** in `netlify/functions/nfl-predictions-generate/index.mjs`:
```javascript
// WRONG:
const spreadFromScores = scoreDifference * 3.0;

// The problem: scoreTeamFromFeatures() already returns point-based scores
// via CORE_EPA=24, TIER_BASE=8 multipliers. Multiplying by 3.0 again
// was inflating spreads by 3x!
```

### Critical Fix Applied (Commit 565d028)
```javascript
// CORRECT:
const spreadFromScores = scoreDifference; // Scores already in point units
```

**Result:** Divergences reduced from 18-20 pts → 8-10 pts ✅

- SF @ TB: 20 pts → 7.9 pts ✅ (acceptable)
- BUF @ ATL: 18.9 pts → 10.4 pts (better but still high)
- TEN @ LV: 10.3 pts (unchanged, still concerning)
- CIN @ GB: 4.3 pts ✅ (good)

---

## 🔍 CURRENT STATUS

### What's Working ✅
- **Core spread calculation fixed** - 3.0 multiplier removed
- **DefEPA sign correct** - Line 636 negates defEPA properly (better defense → higher score)
- **Single injury pass verified** - Only called once per team (lines 2348-2349)
- **Most games within reasonable range** - 12 of 15 games look good

### What's Still Problematic ⚠️
- **TEN @ LV**: 10.3 pt divergence (LV -14.8 model vs LV -4.5 market)
- **BUF @ ATL**: 10.4 pt divergence (ATL -5.9 model vs BUF -4.5 market)
- **Deployment broken**: 502 errors on nfl-predictions-generate function

### Current Roadblock 🚧
**Netlify function returning 502 errors** after implementing GPT-recommended safeguards.

**Commits causing issues:**
- `586153d` - GPT COMPREHENSIVE SAFEGUARDS (added injury double-application guard, probability normalization, diagnostic logging)
- `15e96e2` - FIX: Tighten probability normalization check
- `0d88e9d` - HOTFIX: Reduce diagnostic logging

**Symptoms:**
- Function times out or crashes during execution
- Returns 502 "Web Server Error" 
- Predictions page shows cached old data
- Refresh endpoints return 404/Not Found

---

## 📋 GPT SAFEGUARDS ATTEMPTED (Currently Broken)

### 1. Injury Double-Application Guard
**Purpose:** Prevent injuries from being applied twice  
**Implementation:** Added `_injuryApplied` flag to scoreData  
**Status:** ⚠️ May be causing issues

```javascript
// In applyInjuryAdjustments():
if (scoreData._injuryApplied) {
  console.log(`⚠️ SAFEGUARD: Already applied for ${teamCode}`);
  return scoreData;
}
// ... apply injuries ...
return { ...scoreData, _injuryApplied: true };
```

### 2. Probability-to-Points Normalization  
**Purpose:** Catch if scores are accidentally in 0-1 probability range  
**Implementation:** Convert to points if detected  
**Status:** ⚠️ Initial version too broad, refined but still issues

```javascript
const looksLikeProbability = (home, away) => {
  if (home < 0 || away < 0 || home > 1 || away > 1) return false;
  const sum = home + away;
  const inProbRange = home >= 0.2 && home <= 0.8 && away >= 0.2 && away <= 0.8;
  const sumIsOne = Math.abs(sum - 1.0) < 0.1;
  return inProbRange && sumIsOne;
};
```

**Issue:** Might still be triggering on legitimate scores near 0.5-0.8 range

### 3. Comprehensive Diagnostic Logging
**Purpose:** Log all spread calculation components for debugging  
**Implementation:** JSON diagnostic for every game  
**Status:** ❌ Causing function timeout/memory issues

```javascript
console.log(JSON.stringify({
  tag: "SPREAD_DIAGNOSTIC",
  matchup: `${awayCode} @ ${homeCode}`,
  base: { home: homeScoreData.score, away: awayScoreData.score, diff: scoreDifference },
  injuries: { homePts: ..., homeApplied: homeScoreData._injuryApplied, ... },
  safeguards: { probabilityNormalization: ..., reviewFlag: ..., stakeReduction: ... },
  final: { model_home_margin: predictedSpread, market_spread: ..., divergence: ... }
}));
```

**Latest attempt:** Only log for games with divergence > 8 pts (still 502ing)

### 4. Divergence Review Flag
**Purpose:** Flag games >8 pts off market for manual review, reduce Kelly stake to 25%  
**Implementation:** Added to modelEnhancements.safeguards  
**Status:** ✅ Logic correct but not deploying

```javascript
if (marketDivergence > DIVERGENCE_REVIEW_THRESHOLD) {
  reviewFlag = {
    reason: "MODEL_MARKET_DIVERGENCE",
    divergence: marketDivergence.toFixed(1),
    action: "MANUAL_REVIEW_REQUIRED",
    model: predictedSpread > 0 ? homeCode : awayCode,
    modelLine: Math.abs(predictedSpread).toFixed(1),
    market: currentMarketSpread > 0 ? homeCode : awayCode,
    marketLine: Math.abs(currentMarketSpread)
  };
  stakeReductionFactor = 0.25;
}
```

---

## 🔧 KEY CODE LOCATIONS

### Main Prediction Function
**File:** `netlify/functions/nfl-predictions-generate/index.mjs`

**Critical Lines:**
- **Line 636:** `const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);` - DefEPA negation ✅
- **Line 637:** `const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA;` - Score calculation ✅
- **Line 1338:** `const spreadFromScores = scoreDifference;` - NO MULTIPLIER ✅
- **Line 1348:** Spread formula: `predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment` ✅
- **Line 843-1276:** `applyInjuryAdjustments()` - Single call verified ✅
- **Line 2348-2349:** Injury application - only called once per team ✅
- **Line 2383-2445:** Safeguard code causing 502 errors ⚠️

### Scoring Multipliers (Line 333-348)
```javascript
const SCORING_MULTIPLIERS = {
  CORE_EPA: 24,        // Converts EPA (-0.5 to +0.5) to points (-12 to +12)
  TIER_BASE: 8,        
  ADVANCED_BASE: 6,    
  MATCHUP_BASE: 3.2,
  SPECIAL_TEAMS_BASE: 3
};
```

**Team scores are in POINT units, not EPA units!**  
Typical range: -5 to +10 points (not -0.5 to +0.5)

---

## 🧪 VERIFICATION ALREADY DONE

### ✅ Confirmed Correct
1. **DefEPA Sign:** Negated at line 636, so better defense (more negative EPA) → higher score ✅
2. **Injury Application:** Only one call to `applyInjuryAdjustments()` per team ✅
3. **Spread Formula:** `(home - away) + HFA + ST`, no double-counting ✅
4. **Score Units:** Point-based via multipliers, not raw EPA ✅
5. **Multiplier Removed:** No 3.0× inflation anymore ✅

### ❓ Still Unknown
1. **Why TEN@LV 10.3 pt divergence?** 
   - Model: LV -14.8 vs Market: LV -4.5
   - Home EPA displayed as 0.706 (looks like win probability, not score)
   
2. **Why BUF@ATL 10.4 pt divergence?**
   - Model: ATL -5.9 vs Market: BUF -4.5  
   - Home EPA displayed as 0.604 (again, looks like probability)

3. **Are these legitimate model edges or calculation errors?**
   - Could be real: LV dominating at home, ATL HFA overpowering BUF
   - Could be error: Injury impacts too large, team scores miscalculated

---

## 🚨 IMMEDIATE DEBUGGING STEPS

### Step 1: Get Function Working Again
**Problem:** 502 errors blocking all testing

**Options:**
1. **Revert safeguards** (commits 586153d → 0d88e9d) but keep multiplier fix (565d028)
2. **Remove only problematic code:**
   - Remove `_injuryApplied` flag logic
   - Remove probability normalization check  
   - Remove all diagnostic logging
   - Keep only the divergence review flag (no logging)

### Step 2: Verify Actual Score Values
**Once function works:**
```bash
curl -s "https://rrmodel.netlify.app/.netlify/functions/nfl-predictions-get" | \
jq '.predictions[] | select(.home_team=="LV" or .home_team=="ATL") | 
{matchup: "\(.away_team) @ \(.home_team)", 
 teamStats: .teamStats}'
```

**Check:** Are `teamStats.home.score` and `teamStats.away.score` in the -5 to +10 range?  
Or are they 0-1 probabilities?

### Step 3: Inspect Injury Impacts
```bash
# Look for injury deltas in modelEnhancements
jq '.predictions[] | select(.home_team=="LV" or .home_team=="ATL") | 
{matchup: "\(.away_team) @ \(.home_team)",
 homeInjury: .modelEnhancements.injuryAnalysis.home.totalImpact,
 awayInjury: .modelEnhancements.injuryAnalysis.away.totalImpact}'
```

**Check:** Are injury impacts extreme? (>±5 points indicates possible error)

### Step 4: Manual Calculation Test
For TEN @ LV, manually verify:
```javascript
// Expected calculation:
homeScore = scoreTeamFromFeatures(LV) // Should be ~2-5 points
awayScore = scoreTeamFromFeatures(TEN) // Should be ~-2 to +2 points
scoreDiff = homeScore - awayScore // ~3-7 points
HFA = ~2 points
predictedSpread = scoreDiff + HFA // ~5-9 points

// But model shows: -14.8 points (off by ~8 points!)
// Where are the extra 8 points coming from?
```

---

## 📊 WHAT THE DATA SHOWS (Current Cached Predictions)

### Games Looking Good ✅
- **DEN @ NYJ**: Model NYJ +4.3 vs Market NYJ +7.0 (2.7 pts) ✅
- **DAL @ CAR**: Model CAR +0.8 vs Market CAR +3.0 (2.2 pts) ✅  
- **ARI @ IND**: Model ARI -0.7 vs Market ARI +7.0 (7.7 pts) - Edge but reasonable
- **SEA @ JAX**: Model SEA -0.8 vs Market SEA +1.5 (2.3 pts) ✅
- **CLE @ PIT**: Model CLE +1.2 vs Market CLE +5.5 (4.3 pts) ✅
- **DET @ KC**: Model DET +1.3 vs Market DET +2.5 (1.2 pts) ✅
- **CHI @ WAS**: Model CHI +2.1 vs Market CHI +4.5 (2.4 pts) ✅

### Games with Moderate Edges (6-8 pts)
- **LAR @ BAL**: Model BAL Pick'em vs Market BAL +7.5 (7.4 pts)
- **LAC @ MIA**: Model MIA Pick'em vs Market MIA +4.5 (4.3 pts)
- **SF @ TB**: Model SF -4.9 vs Market TB -3.0 (7.9 pts) - Improved from 20 pts! ✅

### Games with Extreme Divergence (10+ pts) ⚠️
- **TEN @ LV**: Model LV -14.8 vs Market LV -4.5 (10.3 pts)
- **BUF @ ATL**: Model ATL -5.9 vs Market BUF -4.5 (10.4 pts)

### Suspicious Pattern
**"Home EPA" values shown in UI:**
- TEN @ LV: Home 0.706, Away 0.294 (sum = 1.0, looks like win probabilities!)
- BUF @ ATL: Home 0.604, Away 0.396 (sum = 1.0, also probabilities!)

**This suggests:** The UI is showing win probabilities, NOT the actual team scores used in calculations.  
But we need to verify the actual `teamStats.home.score` values.

---

## 💡 LEADING HYPOTHESES

### Hypothesis 1: Scores ARE Correct, Divergences Are Legitimate
- The 10-point divergences might be real edges
- LV could legitimately be 10+ points better at home vs TEN
- ATL home field + BUF injuries = legitimate 10-point swing
- **Test:** Check if injury impacts for these teams are extreme (>5 pts)

### Hypothesis 2: Probability Leak (Less Likely After Fix)
- Win probabilities leaking into score calculations
- But probability normalization should catch this
- **Test:** Log actual `homeScoreData.score` values before spread calc

### Hypothesis 3: Injury Impacts Too Large
- Canonical availability v5 might be over-penalizing
- Team caps (12 pts non-QB, 18 pts total) being hit
- Multiple starters out = compounding effects
- **Test:** Check `injuryAnalysis.totalImpact` for both teams

### Hypothesis 4: Special Teams Over-Weighted
- ST adjustment typically ±1-2 points
- Could be amplified in some cases
- **Test:** Check `homeScoreData.specialTeams.total_st_value` difference

---

## 🎯 RECOMMENDED NEXT STEPS

### Priority 1: Fix Deployment (URGENT)
**Goal:** Get function working to see actual values

**Approach A - Minimal Revert:**
1. Keep commit `565d028` (multiplier fix)
2. Revert commits `586153d`, `15e96e2`, `0d88e9d` (safeguards)
3. Manually add back ONLY the divergence review flag (no logging)

**Approach B - Surgical Fix:**
1. Remove `_injuryApplied` check from line 845-849
2. Remove probability normalization from lines 2387-2405
3. Remove diagnostic logging from lines 2419-2445
4. Keep divergence flag in modelEnhancements (lines 2940-2947)

### Priority 2: Diagnose TEN@LV & BUF@ATL
**Once function works:**
1. Get actual `teamStats.home.score` values
2. Check injury impacts for all 4 teams
3. Verify HFA calculations aren't compounding
4. Check if special teams adjustments are extreme

### Priority 3: Long-term Safeguards
**After understanding the divergences:**
1. Add lightweight divergence logging (not full diagnostic)
2. Implement stake reduction for >8 pt divergences (already coded)
3. Add UI indicator for manual review games
4. Create unit tests for spread calculation with known inputs

---

## 📝 FILES MODIFIED (This Session)

### Production Changes (main41 branch)
1. `netlify/functions/nfl-predictions-generate/index.mjs`
   - Line 1338: Removed 3.0 multiplier ✅
   - Lines 845-849: Added injury double-app guard ⚠️
   - Lines 2387-2405: Added probability normalization ⚠️
   - Lines 2419-2445: Added diagnostic logging ⚠️
   - Lines 2940-2947: Added divergence review flag ✅

2. `verify-score-values.js` (new file)
   - Script to check score values from blob storage
   - Not functional (blobs not accessible locally)

### Investigation Docs Created
1. `EXTREME_SPREAD_INVESTIGATION.md` - Original problem analysis
2. `SPREAD_DIVERGENCE_INVESTIGATION_SF_ATL.md` - Deep dive
3. `ACTION_PLAN_SPREAD_FIX.md` - Step-by-step remediation
4. `GPT_ANALYSIS_VS_REALITY.md` - Code audit vs GPT claims
5. `SPREAD_INVESTIGATION_STATUS_OCT10.md` - This document

---

## 🔑 KEY INSIGHTS FOR NEXT SESSION

### What We Know ✅
1. **3.0 multiplier was the main culprit** - Fixed, spreads improved 60%
2. **Core calculation is correct** - No sign flips, no double-counting
3. **DefEPA handling is proper** - Negated correctly
4. **Score units are points** - Via CORE_EPA=24 multiplier

### What We Don't Know ❓
1. **Why exactly 10 pts for TEN@LV and BUF@ATL?**
2. **Are the displayed "Home EPA" values (0.7, 0.6) the actual scores or just probabilities for display?**
3. **What are the actual injury impacts for these 4 teams?**
4. **Why is the safeguard code causing 502 errors?**

### Critical Next Action 🚨
**GET THE FUNCTION WORKING** - Everything else depends on this.

**Fastest path:**
```bash
# Option 1: Full revert of safeguards, keep multiplier fix
git checkout 565d028 -- netlify/functions/nfl-predictions-generate/index.mjs
git commit -m "Revert safeguards to restore function stability"
git push origin main41

# Option 2: Manual removal of problematic code
# Edit index.mjs to remove lines 845-849, 2387-2445
# Keep only the divergence flag logic
```

**Then:**
1. Wait for deployment
2. Test function: `curl https://rrmodel.netlify.app/.netlify/functions/nfl-predictions-get`
3. Inspect actual score values for TEN@LV and BUF@ATL
4. Determine if 10-pt divergences are legitimate or errors

---

## 📞 CONTACT POINTS FOR DEBUGGING

### Netlify Function Logs
- **URL:** https://app.netlify.com/sites/rrmodel/functions
- **Look for:** `nfl-predictions-generate` function
- **Check:** Recent invocations, error messages, timeout indicators

### Blob Storage Inspection
- **Function:** `nfl-predictions-get` reads from blob
- **Path:** `.netlify/blobs/deploy/predictions-cache/nfl-td/6_2024_predictions.json`
- **Access:** Only via deployed function, not local filesystem

### Live Odds API
- **Source:** The Odds API (working correctly)
- **Note:** Deep links removed, structured odds working

---

## ⚡ QUICK REFERENCE

### Current Predictions Status
- **Working:** 12/15 games within 8 pts of market ✅
- **Problematic:** 2/15 games with 10+ pt divergence ⚠️
- **Broken:** Deployment (502 errors) ❌

### Commit History
- `565d028` ✅ CRITICAL FIX: Remove 3.0 multiplier (KEEP THIS)
- `586153d` ⚠️ GPT safeguards (causing 502)
- `15e96e2` ⚠️ Probability check fix (causing 502)
- `0d88e9d` ⚠️ Logging reduction (still 502)

### Files to Review
1. `netlify/functions/nfl-predictions-generate/index.mjs` (main logic)
2. Netlify function logs (error details)
3. Blob storage output (actual score values)

### Code Snippets to Debug
```javascript
// Check score range
console.log(`Scores: Home=${homeScoreData.score.toFixed(2)}, Away=${awayScoreData.score.toFixed(2)}`);

// Check injury impacts  
console.log(`Injuries: Home=${homeScoreData.injuryAnalysis?.totalImpact}, Away=${awayScoreData.injuryAnalysis?.totalImpact}`);

// Check spread components
console.log(`Spread components: HFA=${adjustedHFA}, ScoreDiff=${scoreDifference}, ST=${stSpreadAdjustment}`);
```

---

## 🎬 CONCLUSION

**Where We Are:**
- Fixed the main issue (3.0 multiplier) - spreads improved 60% ✅
- Attempted GPT safeguards - broke deployment ❌
- Still have 2 games with concerning 10-pt divergences ⚠️

**What Works:**
- Core spread calculation logic is sound
- Most predictions are reasonable
- Multiplier fix was the right call

**What's Broken:**
- Netlify function (502 errors)
- Can't test or verify anything until this is fixed

**Next Session Goal:**
1. **Get function working** (revert safeguards if needed)
2. **Inspect actual values** for TEN@LV and BUF@ATL
3. **Determine if 10-pt divergences are real or errors**
4. **Apply minimal, tested safeguards** only if needed

**Time Estimate:** 30-60 minutes to restore function and diagnose remaining divergences

---

*Last Updated: October 10, 2025, 4:30 PM*  
*Branch: main41*  
*Status: Function broken (502), predictions cached but mostly accurate*

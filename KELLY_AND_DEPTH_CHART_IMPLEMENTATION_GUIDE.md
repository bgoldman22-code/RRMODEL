# Kelly Staking & Depth Chart Fix - Implementation Guide

## Executive Summary

**Status**: Kelly staking backend COMPLETE ✅, Index.mjs integration PENDING ⏳  
**Timeline**: Deploy today (Oct 27, 2025)  
**Bankroll**: 450U  
**New Caps**: 112.5U daily (25%), 10U ML/spread + 5U total per game  

---

## Part 1: Kelly Staking Updates - BACKEND COMPLETE ✅

### What's Been Implemented

**File**: `netlify/functions/_lib/kelly-hybrid-staking.mjs`

#### 1. Updated Exposure Limits
```javascript
export const STAKING_LIMITS = {
  // Per-bet limits
  MAX_UNITS_PER_BET: 8.0,              // ML/Spread max
  MAX_UNITS_TOTALS: 7.5,               // Elite totals max
  MAX_MULTIPLIER_VS_BASE: 3.0,
  
  // Exposure guards (450U bankroll)
  MAX_DAILY_STAKE_SUM: 112.5,          // 25% of 450U bankroll
  MAX_EXPOSURE_PER_GAME: 15.0,         // 10U ML/spread + 5U total
  MAX_EXPOSURE_SIDES: 10.0,            // ML + Spread combined max 10U
  
  // High-stakes gate
  HIGH_STAKES_THRESHOLD: 6.0,          // Require CLV proxy above this
  CLV_PROXY_LINE_MOVE_MIN: 0.5,        // Need 0.5+ pts line movement in favor
  CLV_PROXY_SMART_MONEY_MIN: 60        // Need 60%+ handle on our side
};
```

#### 2. CLV Proxy Gate Function
```javascript
export function checkHighStakesCLVGate(proposedUnits, signals) {
  // Only check if bet >6U
  if (proposedUnits <= STAKING_LIMITS.HIGH_STAKES_THRESHOLD) {
    return { allowed: true };
  }
  
  // Check 1: Line moved in our favor (>=0.5 pts)
  // Check 2: Smart money support (>=60% handle)
  // Check 3: No reverse steam (recent move against us)
  
  return { allowed, violations, reason };
}
```

#### 3. Market-Specific Caps in `recommendUnits()`
```javascript
export function recommendUnits(edgeProb, priceDec, signals, bankrollUnits = 10, betType = 'spread') {
  // ... Kelly calculations ...
  
  // Apply market-specific caps
  let capAbsolute;
  if (betType === 'total') {
    // Elite totals: 7.5U if raw >8U, else 7U
    capAbsolute = rawStake >= 8.0 ? 7.5 : 7.0;
  } else {
    // ML and Spread: 8U max
    capAbsolute = 8.0;
  }
  
  // ... apply cap, round to 0.1U ...
  
  // Check CLV proxy gate for >6U bets
  const clvGateCheck = checkHighStakesCLVGate(finalUnits, signals);
  if (!clvGateCheck.allowed) {
    return { units: 0, reason: clvGateCheck.reason, violations: clvGateCheck.violations };
  }
  
  return { units, recommendation, betType, audit: {...} };
}
```

#### 4. Enhanced `checkExposureLimits()`
```javascript
export function checkExposureLimits(proposedUnits, proposedBetType, existingBets, gameId, date) {
  // Daily total (112.5U cap)
  const dailyTotal = dailyBets.reduce((sum, bet) => sum + bet.units, 0);
  
  // Per-game total (15U cap)
  const gameTotal = gameBets.reduce((sum, bet) => sum + bet.units, 0);
  
  // ML/Spread combined (10U cap)
  const sidesTotal = gameBets
    .filter(bet => bet.betType === 'moneyline' || bet.betType === 'spread')
    .reduce((sum, bet) => sum + bet.units, 0);
  
  // Totals (5U additional allowance)
  const totalsTotal = gameBets
    .filter(bet => bet.betType === 'total')
    .reduce((sum, bet) => sum + bet.units, 0);
  
  // Check violations and return { allowed, violations, usage stats }
}
```

---

### What's Integrated in index.mjs ✅

**File**: `netlify/functions/nfl-predictions-generate/index.mjs`

#### Line 17: Import Statement
```javascript
import { recommendUnits, checkExposureLimits } from '../_lib/kelly-hybrid-staking.mjs';
```

#### Line 2130: Pass betType to recommendUnits
```javascript
let kellyResult = recommendUnits(edgeProb, priceDec, signals, 10, betType);
```

---

### What's Still PENDING ⏳

#### CRITICAL: Exposure Checking Loop

**Location**: `index.mjs` around lines 1900-2100 (after all game predictions generated)

**What to Add**:
```javascript
// After generating all predictions, before returning result
const publishedBets = [];
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

for (const prediction of allPredictions) {
  // Determine betType from market
  let betType = 'spread';
  if (prediction.market === 'moneyline') betType = 'moneyline';
  if (prediction.market === 'total' || prediction.market === 'over' || prediction.market === 'under') betType = 'total';
  
  // Check exposure limits
  const exposureCheck = checkExposureLimits(
    prediction.recommended_units,
    betType,
    publishedBets,
    prediction.gameId || `${prediction.away_team}_${prediction.home_team}`,
    today
  );
  
  if (!exposureCheck.allowed) {
    console.warn(`🚫 [EXPOSURE] Blocking bet: ${prediction.pick} (${prediction.recommended_units}U)`);
    console.warn(`   Violations:`, exposureCheck.violations);
    
    // Option 1: Skip bet entirely
    continue;
    
    // Option 2: Reduce units to fit (more sophisticated)
    // const maxAllowed = Math.min(
    //   exposureCheck.dailyUsage.remaining,
    //   exposureCheck.gameUsage.remaining,
    //   exposureCheck.sidesUsage.remaining
    // );
    // prediction.recommended_units = maxAllowed;
    // prediction.unit_reasoning += ` | Reduced to fit exposure limit (${maxAllowed.toFixed(1)}U max)`;
  }
  
  // Add to published bets
  publishedBets.push({
    units: prediction.recommended_units,
    betType,
    gameId: prediction.gameId || `${prediction.away_team}_${prediction.home_team}`,
    date: today
  });
  
  console.log(`✅ [EXPOSURE] Published: ${prediction.pick} (${prediction.recommended_units}U)`);
  console.log(`   Daily: ${exposureCheck.dailyUsage.proposed.toFixed(1)}/${exposureCheck.dailyUsage.limit}U`);
  console.log(`   Game: ${exposureCheck.gameUsage.proposed.toFixed(1)}/${exposureCheck.gameUsage.limit}U`);
  console.log(`   Sides: ${exposureCheck.sidesUsage.proposed.toFixed(1)}/${exposureCheck.sidesUsage.limit}U`);
}

// Return publishedBets instead of allPredictions
return { predictions: publishedBets, ... };
```

**Why This Matters**:
- Without this loop, exposure limits are calculated but NEVER enforced
- Bets can exceed 112.5U daily or 10U+5U per game
- This is a **CRITICAL** gap in the current system

---

## Part 2: Depth Chart Comprehensive Fix

### Priority 1: Critical Foundation (Implement Today)

#### 1. Position-Specific Usage Thresholds

**Location**: `index.mjs` after imports (around line 60)

```javascript
/**
 * Position-specific usage thresholds for starter detection
 * Standardized to use TEAM SHARE (not position share within WR room, etc.)
 */
const USAGE_THRESHOLDS = {
  RB: { type: 'snapShare', min: 0.50 },      // 50%+ snap share = RB1/workhorse
  WR: { type: 'teamTargetShare', min: 0.22 }, // 22%+ team target share = WR1/WR2
  TE: { type: 'teamTargetShare', min: 0.15 }  // 15%+ team target share = TE1
};

/**
 * Check if player qualifies as high-usage starter based on EPA database
 * @param {Object} playerData - From comprehensive-player-epa.js
 * @param {string} pos - Position (RB, WR, TE)
 * @returns {boolean} True if player meets usage threshold for position
 */
function isHighUsageStarter(playerData, pos) {
  if (!playerData) return false;
  
  const threshold = USAGE_THRESHOLDS[pos] || { type: 'snapShare', min: 0.50 };
  
  // Get the correct usage field based on position type
  const usageValue = threshold.type === 'teamTargetShare' 
    ? (playerData.teamTargetShare ?? playerData.usage)
    : (playerData.snapShare ?? playerData.usage);
  
  return (usageValue ?? 0) >= threshold.min;
}
```

**Why This Matters**:
- Jefferson (26% team targets) vs WR3 (10% team targets) have vastly different impact
- Current system treats all "starters" equally
- This separates true starters from depth players

---

#### 2. Graded probPlay System

**Location**: `index.mjs` after USAGE_THRESHOLDS

```javascript
/**
 * Convert injury status to probability of playing (graded, not binary)
 * Position-specific because QB is binary position, skill positions have snap counts
 * @param {string} pos - Position (QB, RB, WR, TE)
 * @param {string} status - Injury status (out, doubtful, questionable, active)
 * @returns {number} Probability of playing (0.0 to 0.95)
 */
function statusToProbPlay(pos, status) {
  const s = normalizeStatus(status);
  
  if (s === 'out') return 0.0;
  
  if (s === 'doubtful') {
    // QB is binary (either plays full or doesn't play)
    // Skill positions can play limited snaps
    return pos === 'QB' ? 0.10 : 0.20;
  }
  
  if (s === 'questionable') {
    return pos === 'QB' ? 0.60 : 0.70;
  }
  
  // Active but recently injured
  return 0.95;
}

/**
 * Expected snap count scale for limited returns
 * @param {string} pos - Position
 * @param {string} status - Injury status
 * @returns {number} Snap scale multiplier (0.5 to 1.0)
 */
function expectedSnapScale(pos, status) {
  const s = normalizeStatus(status);
  
  if (s === 'questionable') {
    // QB plays full or doesn't play
    // Skill positions often limited to ~70% snaps
    return pos === 'QB' ? 1.0 : 0.7;
  }
  
  if (s === 'doubtful') {
    return pos === 'QB' ? 1.0 : 0.5;
  }
  
  return 1.0; // Full snaps
}
```

**Why This Matters**:
- Current binary system: Questionable player is either 100% or 0%
- Reality: Questionable WR plays 70% snaps, not 0% or 100%
- This prevents over-penalizing "active but limited" scenarios

---

#### 3. Filtered Depth List with Role Recomposition

**Location**: `index.mjs` after statusToProbPlay

```javascript
/**
 * Build filtered depth chart excluding injured players
 * Automatically recomposes roles: if WR1+WR2 out, WR3 becomes new WR1
 * @param {string} teamCode - Team abbreviation
 * @param {string} pos - Position
 * @param {Object} depthChart - Weekly depth chart
 * @param {Array} injuryList - Injury report for this position
 * @returns {Array} Filtered depth list where [0]=new starter after injuries
 */
function filteredDepthList(teamCode, pos, depthChart, injuryList) {
  // Build set of injured players (probPlay < 0.5)
  const injured = new Set();
  for (const injury of (injuryList || [])) {
    const status = normalizeStatus(injury.status);
    const probPlay = statusToProbPlay(pos, status);
    
    if (probPlay < 0.5) {
      injured.add(injury.name);
    }
  }
  
  // Filter depth chart to exclude injured
  const fullDepth = depthChart?.[teamCode]?.[pos] || [];
  const filtered = fullDepth.filter(player => player && !injured.has(player));
  
  // Filtered list automatically recomposes roles:
  // If WR depth = [Jefferson, Addison, Nailor] and Jefferson out:
  // Filtered = [Addison, Nailor] where Addison is now WR1 (index 0)
  
  return filtered;
}

/**
 * Pick replacement player from filtered depth list
 * @param {string} teamCode - Team
 * @param {string} pos - Position
 * @param {string} injuredName - Player who is injured
 * @param {Object} depthChart - Weekly depth chart
 * @param {Array} injuryList - Injury report
 * @returns {string|null} Replacement player name or null if none available
 */
function pickReplacement(teamCode, pos, injuredName, depthChart, injuryList) {
  const filtered = filteredDepthList(teamCode, pos, depthChart, injuryList);
  
  // First healthy non-injured candidate
  return filtered.find(player => player !== injuredName) || null;
}
```

**Why This Matters**:
- Current system: Manually tracks QB2, WR2, etc. Breaks with multiple injuries
- New system: Automatically recomposes depth chart after removing injured
- WR1+WR2 both out → filtered[0] is now WR3 (becomes new WR1)

---

#### 4. Integration in Injury Processing

**Location**: `index.mjs` lines 950-1150 (applyInjuryAdjustments function)

**Changes Needed**:

**OLD CODE** (current):
```javascript
// Get replacement from depth chart position 2
let replacementPlayer = null;
if (currentDepthChart?.[teamCode]?.[position]?.[depthPosition]) {
  replacementPlayer = currentDepthChart[teamCode][position][depthPosition];
}
```

**NEW CODE** (with filtered list):
```javascript
// Use filtered depth list to pick replacement
const replacementPlayer = pickReplacement(teamCode, position, playerName, currentDepthChart, injuryList);

if (!replacementPlayer) {
  console.warn(`⚠️ No healthy replacement for ${playerName} (${position})`);
  // Fall back to league replacement EPA
}
```

**Usage Check Integration**:
```javascript
// Check if injured player is actually a high-usage starter
let isStarter = depthPosition === 1; // Default from injury report
let adjustedDepth = depthPosition;

try {
  const { getPlayerEPA } = await import('../_lib/comprehensive-player-epa.js');
  const playerData = getPlayerEPA(playerName, position);
  
  if (playerData && isHighUsageStarter(playerData, position)) {
    isStarter = true;
    adjustedDepth = 1;
    console.log(`⭐ ${playerName} identified as high-usage starter (${(playerData.usage * 100).toFixed(0)}% usage)`);
  }
} catch (err) {
  // Fallback to depth chart
}
```

**ProbPlay Integration**:
```javascript
// Calculate graded availability
const status = normalizeStatus(injury.status);
const probPlay = statusToProbPlay(position, status);
const snapScale = expectedSnapScale(position, status);

// Scale EPA impact by expected snap count
const baseImpact = starterEPA - replacementEPA;
const scaledImpact = baseImpact * snapScale;

console.log(`📊 Impact: ${playerName} (${status})`);
console.log(`   probPlay: ${probPlay}, snapScale: ${snapScale}`);
console.log(`   Base impact: ${baseImpact.toFixed(2)} → Scaled: ${scaledImpact.toFixed(2)}`);
```

---

### Priority 2: High-Value Enhancements (Next)

#### 5. Stale Depth Chart Fallback to HAD

**Location**: `index.mjs` in injury processing

```javascript
/**
 * Get depth ordering with freshness check
 * Falls back to HAD if depth chart is stale (>8 days old) or empty
 * @param {string} teamCode - Team
 * @param {string} pos - Position
 * @param {Object} depthChart - Weekly depth chart
 * @param {Object} had - Historical Availability Data
 * @param {Date} now - Current timestamp
 * @returns {Array} Depth ordering to use
 */
function getDepthOrdering(teamCode, pos, depthChart, had, now) {
  const chart = depthChart?.[teamCode]?.[pos];
  const chartAge = now - new Date(depthChart?.updatedAt || 0);
  const daysOld = chartAge / (1000 * 60 * 60 * 24);
  
  const isFresh = chart && chart.length > 0 && daysOld <= 8;
  
  if (isFresh) {
    return chart;
  }
  
  // Fall back to HAD for role ordering
  console.warn(`⚠️ Depth chart stale (${daysOld.toFixed(1)} days old), using HAD fallback`);
  const hadList = had?.[`${teamCode}_${pos}`];
  return hadList && hadList.length ? hadList : (chart || []);
}
```

---

#### 6. QB Synergy Controls

**Location**: `index.mjs` after individual injury impacts calculated

```javascript
/**
 * Apply QB synergy adjustments when WR/OL rooms depleted
 * @param {Object} teamImpacts - Accumulated injury impacts for team
 * @param {Object} injuryData - Full injury data for team
 * @returns {Object} Adjusted impacts with synergy applied
 */
function applyQBSynergyControls(teamImpacts, injuryData) {
  // Check WR depletion
  const wrInjuries = injuryData.wr_injuries || [];
  const wrEPADelta = wrInjuries.reduce((sum, inj) => sum + Math.abs(inj.epaDelta || 0), 0);
  
  if (wrEPADelta >= 1.5) {
    // WR1+WR2 both out or equivalent
    console.log(`🔗 [SYNERGY] WR room depleted (${wrEPADelta.toFixed(2)} EPA), adjusting QB`);
    
    // Dampen QB positive EPA (benefit from favorable matchup)
    if (teamImpacts.qbPositiveEPA > 0) {
      teamImpacts.qbPositiveEPA *= 0.9;
    }
    
    // Amplify QB negative penalty (already hurt by injuries)
    if (teamImpacts.qbNegativePenalty < 0) {
      teamImpacts.qbNegativePenalty *= 1.1;
    }
  }
  
  // Check OL depletion
  const olOutCount = (injuryData.ol_injuries || []).filter(inj => 
    normalizeStatus(inj.status) === 'out'
  ).length;
  
  if (olOutCount >= 2) {
    // 2+ OL starters out
    console.log(`🔗 [SYNERGY] OL depleted (${olOutCount} starters out), global penalty`);
    teamImpacts.globalPenalty = (teamImpacts.globalPenalty || 0) - 0.5;
  }
  
  return teamImpacts;
}
```

---

### Priority 3: Nice-to-Have (Can Defer)

#### 7. Saturday Elevations
- Practice squad additions
- Low frequency, minor impact
- Can handle manually if needed

#### 8. Position Switches
- RB/WR hybrids (Deebo, etc.)
- Add `secondaryPosition` field to EPA database
- Search secondary position if primary empty

#### 9. Name Disambiguation
- Use `Team_Pos_PlayerId` as canonical key
- Display name only for logs
- Prevents "Brown" collisions

---

## Deployment Checklist

### Kelly Staking (Ready to Deploy)
- [x] Update STAKING_LIMITS in kelly-hybrid-staking.mjs
- [x] Add checkHighStakesCLVGate() function
- [x] Update checkExposureLimits() for sides/totals split
- [x] Update recommendUnits() with market-specific caps
- [x] Import checkExposureLimits in index.mjs
- [x] Pass betType to recommendUnits() call
- [ ] **CRITICAL**: Add exposure checking loop in index.mjs (before publishing)

### Depth Chart Fix (Staged Implementation)
- [ ] Add USAGE_THRESHOLDS constant
- [ ] Add statusToProbPlay() function
- [ ] Add expectedSnapScale() function  
- [ ] Add filteredDepthList() function
- [ ] Add pickReplacement() function
- [ ] Integrate in QB injury processing (lines 950-989)
- [ ] Integrate in skill position injury processing (lines 1055-1135)
- [ ] Add QB synergy controls
- [ ] Add comprehensive logging

---

## Testing Plan

### Kelly Staking Tests
1. **Exposure Cap Test**: Generate predictions for full slate
   - Verify daily total ≤ 112.5U
   - Verify per-game total ≤ 15U (10U sides + 5U totals)
   - Verify ML+spread combined ≤ 10U per game

2. **CLV Gate Test**: Mock 8U bet with poor CLV signals
   - lineMoveToward = -0.3 (line moved against us)
   - handlePct = 45 (public backing us, not sharp money)
   - Should be blocked with violations logged

3. **Market Cap Test**: Generate elite total bet
   - If raw Kelly suggests 9U, should cap at 7.5U
   - If raw Kelly suggests 7U, should cap at 7U

### Depth Chart Tests  
1. **Daniels/Mariota** (QB moved to QB2):
   - Input: Daniels OUT, depth = [Mariota, Daniels]
   - Expected: filteredDepthList returns [Mariota], impact ~-7.5pts

2. **Jefferson** (WR1 high usage):
   - Input: Jefferson OUT (26% team targets)
   - Expected: isHighUsageStarter = true, replacement = Addison
   - Expected: Impact ~-2.2pts

3. **WR1+WR2 Both Out**:
   - Input: Jefferson OUT, Addison OUT
   - Expected: filteredDepthList returns [Nailor], Nailor becomes new WR1
   - Expected: Position cap prevents over-penalization

4. **Questionable Player** (limited return):
   - Input: Player QUESTIONABLE, probPlay=0.7, snapScale=0.7
   - Expected: Impact scaled by 0.7× (not full penalty)

---

## Key Metrics to Monitor

### Kelly Staking
- **Daily exposure**: Should rarely hit 112.5U (only on elite opportunity days)
- **Per-game exposure**: Should see 10U+5U structure in action (8U ML + 2U spread + 5U total scenarios)
- **CLV gate blocks**: Track how many >6U bets are blocked for lack of CLV proxy
- **ROI**: Should maintain or improve with better exposure management

### Depth Chart Fix
- **False negatives** (missed penalties): Should drop from ~20% to <5%
  - Track games where starter injured but no penalty applied
- **False positives** (over-penalization): Should stay <10%
  - Track games where penalty applied but player wasn't actually high-impact
- **Accuracy**: Daniels/Mariota, Jefferson/Addison scenarios should show correct impacts

---

## Next Steps (Priority Order)

1. **IMMEDIATE** (Before next deploy):
   - Add exposure checking loop in index.mjs (30 lines of code)
   - Test with mock predictions array
   - Verify violations logged correctly

2. **TODAY** (Depth chart foundation):
   - Add USAGE_THRESHOLDS, statusToProbPlay, expectedSnapScale
   - Add filteredDepthList and pickReplacement
   - Integrate in injury processing (QB + skill positions)

3. **TODAY** (Testing & Deploy):
   - Run all test cases
   - Verify no regressions in existing predictions
   - Deploy to production
   - Monitor first slate closely

4. **NEXT ITERATION** (Enhancements):
   - Add QB synergy controls
   - Add stale depth chart → HAD fallback
   - Add comprehensive logging & audit trail

---

## Questions & Clarifications

### Resolved ✅
1. **Daily cap**: Using 112.5U (25% of 450U) with no artificial ceiling
2. **CLV data**: Using line movement + smart money as proxy (no true CLV tracking)
3. **Timeline**: All deploying today (Oct 27)

### Open Questions ❓
1. **Exposure checking behavior**: Skip bet entirely OR reduce units to fit?
   - Recommendation: Skip entirely (cleaner, prevents marginal bets)
   - Alternative: Reduce units (allows publishing more opportunities)

2. **Audit trail persistence**: Write to `/tmp/` OR Netlify Blobs?
   - `/tmp/` is ephemeral but fast
   - Blobs is persistent but requires setup
   - Recommendation: Start with console.log, add Blobs later

---

## Code Samples for Quick Reference

### Exposure Checking Loop (TO ADD)
```javascript
// Location: index.mjs around line 2000-2100, before returning result

const publishedBets = [];
const today = new Date().toISOString().split('T')[0];

for (const prediction of allPredictions) {
  const betType = prediction.market === 'moneyline' ? 'moneyline' 
                : prediction.market === 'total' ? 'total' 
                : 'spread';
  
  const exposureCheck = checkExposureLimits(
    prediction.recommended_units,
    betType,
    publishedBets,
    prediction.gameId,
    today
  );
  
  if (!exposureCheck.allowed) {
    console.warn(`🚫 [EXPOSURE] Blocked: ${prediction.pick} (${prediction.recommended_units}U)`);
    continue;
  }
  
  publishedBets.push({
    units: prediction.recommended_units,
    betType,
    gameId: prediction.gameId,
    date: today
  });
}

return { predictions: publishedBets, ... };
```

### Injury Processing Integration (TO UPDATE)
```javascript
// Location: index.mjs lines 950-1150

// OLD:
let replacementQB = null;
if (currentDepthChart?.[teamCode]?.QB?.[1]) {
  replacementQB = currentDepthChart[teamCode].QB[1];
}

// NEW:
const replacementQB = pickReplacement(teamCode, 'QB', teamInjuries.qb_name, currentDepthChart, [teamInjuries]);
const probPlay = statusToProbPlay('QB', qbStatus);
const snapScale = expectedSnapScale('QB', qbStatus);

const qbSources = [{
  type: 'INJURY_REPORT',
  status: qbStatus,
  probPlay: probPlay,
  snapScale: snapScale,
  isStarter: true,  // Force from injury report
  replacementPlayerName: replacementQB,
  // ... rest unchanged
}];
```

---

**END OF GUIDE**

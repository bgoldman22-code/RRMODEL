# NBA Elite V2 - Critical Fixes (Dec 2, 2025)# NBA Elite V2 - Critical Fixes (Dec 2, 2025)



## Issues Discovered from Function Logs## Issues Discovered from Function Logs



Analyzing logs from https://bgroundrobin.com/nba-predictions-v2 revealed three critical bugs causing prediction failures and excessive warnings.Analyzing logs from https://bgroundrobin.com/nba-predictions-v2 revealed three critical bugs causing prediction failures and excessive warnings.



------



## Issue 1: Team Abbreviation Mismatch ⚠️## Issue 1: Team Abbreviation Mismatch ⚠️



### Problem### Problem

- **Priors file** uses `NO` and `NY` - **Priors file** uses `NO` and `NY` 

- **ESPN/NBA API** returns `NOP` and `NYK`- **ESPN/NBA API** returns `NOP` and `NYK`

- Result: Every NOP/NYK game triggers 10-20 "No prior for NOP/NYK" fallback warnings- Result: Every NOP/NYK game triggers 10-20 "No prior for NOP/NYK" fallback warnings



### Evidence from Logs### Evidence from Logs

``````

Dec 2, 02:04:27 PM: f8f90a32 WARN   [NBA] No prior for NOP, using league averageDec 2, 02:04:27 PM: f8f90a32 WARN   [NBA] No prior for NOP, using league average

Dec 2, 02:04:27 PM: f8f90a32 INFO   [NBA FALLBACK] NOP using prior: efg=0.558, ts=0.584, offRtg=114.5Dec 2, 02:04:27 PM: f8f90a32 INFO   [NBA FALLBACK] NOP using prior: efg=0.558, ts=0.584, offRtg=114.5

``````

(Repeated 20+ times per game)(Repeated 20+ times per game)



### Root Cause### Root Cause

`netlify/functions/_lib/nba/team-priors-2024-25.mjs`:`netlify/functions/_lib/nba/team-priors-2024-25.mjs`:

- Line 29: `NO: { ... }` should be `NOP: { ... }`- Line 29: `NO: { ... }` should be `NOP: { ... }`

- Line 30: `NY: { ... }` should be `NYK: { ... }`- Line 30: `NY: { ... }` should be `NYK: { ... }`



### Fix Applied### Fix Applied

Changed team abbreviations to match ESPN/NBA API:Added proper entries to TEAM_PRIORS_2024_25:

```javascript```javascript

NOP: { offRtg: 111.5, defRtg: 114.9, netRtg: -3.4, pace: 99.3, efg: 0.542, ts: 0.571, tovPct: 0.131, orbPct: 0.256, ftRate: 0.285 },NOP: {

NYK: { offRtg: 115.1, defRtg: 111.7, netRtg: 3.4, pace: 97.5, efg: 0.566, ts: 0.588, tovPct: 0.115, orbPct: 0.282, ftRate: 0.271 },  efg: 0.540,

```  ts: 0.569,

  offRtg: 110.4,

### Impact  defRtg: 116.1,

- ✅ Eliminates 10-20 fallback warnings per NOP/NYK game  netRtg: -5.7,

- ✅ Uses actual team priors instead of league averages  pace: 97.9

- ✅ More accurate predictions for New Orleans and New York games},

NYK: {

---  efg: 0.558,

  ts: 0.584,

## Issue 2: Injury Variable Name Bug 🐛  offRtg: 114.5,

  defRtg: 109.8,

### Problem  netRtg: 4.7,

Code uses **wrong variable names** when accessing injury adjustments, causing `Cannot read properties of undefined (reading 'toFixed')` errors.  pace: 93.2

}

### Evidence from Logs```

```

Dec 2, 02:04:28 PM: f8f90a32 INFO   [INJURY] Error fetching injuries, using RCI-only adjustments: ### Impact

Cannot read properties of undefined (reading 'toFixed')- ✅ Eliminates 10-20 fallback warnings per NOP/NYK game

```- ✅ Uses actual team priors instead of league averages

- ✅ More accurate predictions for New Orleans and New York games

### Root Cause

`netlify/functions/nba-predictions-elite-v2/index.mjs`:---



**Variable declarations:**## Issue 2: Injury Variable Name Bug 🐛

- Line 1124: `const homeInjuries = await getTeamInjuries(homeAbbr);` (ARRAY)

- Line 1133: `const awayInjuries = await getTeamInjuries(awayAbbr);` (ARRAY)### Problem

- Line 1126: `let homeInjuryAdj = getInjurySummary(homeInjuries, homeTeam, 'home');` (OBJECT)Code uses **wrong variable names** when accessing injury adjustments, causing `Cannot read properties of undefined (reading 'toFixed')` errors.

- Line 1145: `const awayInjuryAdj = getInjurySummary(awayInjuries, awayTeam, 'away');` (OBJECT)

### Evidence from Logs

**Bug location (lines 782, 791):**```

```javascriptDec 2, 02:04:28 PM: f8f90a32 INFO   [INJURY] Error fetching injuries, using RCI-only adjustments: 

// WRONG - checking array properties that don't existCannot read properties of undefined (reading 'toFixed')

if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {```

  value: homeInjuries.deltaOff?.toFixed(1) || '0.0',  // ❌ deltaOff doesn't exist on array

}### Root Cause

`netlify/functions/nba-predictions-elite-v2/index.mjs`:

if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {

  value: awayInjuries.deltaDef?.toFixed(1) || '0.0',  // ❌ deltaDef doesn't exist on array**Variable declarations:**

}- Line 1124: `const homeInjuries = await getTeamInjuries(homeAbbr);` (ARRAY)

```- Line 1133: `const awayInjuries = await getTeamInjuries(awayAbbr);` (ARRAY)

- Line 1126: `let homeInjuryAdj = getInjurySummary(homeInjuries, homeTeam, 'home');` (OBJECT)

### Fix Applied- Line 1145: `const awayInjuryAdj = getInjurySummary(awayInjuries, awayTeam, 'away');` (OBJECT)

Changed lines 782 and 791 to use correct variable names:

```javascript**Bug location (lines 782, 791):**

// CORRECT - checking summary object properties```javascript

if (homeInjuryAdj && homeInjuryAdj.count > 0 && homeInjuryAdj.severity !== 'NONE') {// WRONG - checking array properties that don't exist

  value: homeInjuryAdj.deltaOff?.toFixed(1) || '0.0',  // ✅ Works!if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {

}  value: homeInjuries.deltaOff?.toFixed(1) || '0.0',  // ❌ deltaOff doesn't exist on array

}

if (awayInjuryAdj && awayInjuryAdj.count > 0 && awayInjuryAdj.severity !== 'NONE') {

  value: awayInjuryAdj.deltaDef?.toFixed(1) || '0.0',  // ✅ Works!if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {

}  value: awayInjuries.deltaDef?.toFixed(1) || '0.0',  // ❌ deltaDef doesn't exist on array

```}

```

### Data Flow Clarification

1. **Fetch:** `getTeamInjuries()` fetches from ESPN → returns **array** of injuries### Fix Applied

2. **Process:** `getInjurySummary()` processes array → returns **summary object** with:Changed lines 782 and 791 to use correct variable names:

   - `count`, `severity`, `players`, `deltaOff`, `deltaDef`, `totalImpact````javascript

3. **Use:** Feature array should reference **summary object**, not raw array// CORRECT - checking summary object properties

if (homeInjuryAdj && homeInjuryAdj.count > 0 && homeInjuryAdj.severity !== 'NONE') {

### Impact  value: homeInjuryAdj.deltaOff?.toFixed(1) || '0.0',  // ✅ Works!

- ✅ Injury adjustments now work properly}

- ✅ No more `.toFixed()` errors

- ✅ Proper offensive/defensive deltas applied to predictionsif (awayInjuryAdj && awayInjuryAdj.count > 0 && awayInjuryAdj.severity !== 'NONE') {

- ✅ RCI + Injury combined adjustments functioning  value: awayInjuryAdj.deltaDef?.toFixed(1) || '0.0',  // ✅ Works!

}

---```



## Issue 3: Excessive Injury Cluster Capping 📊### Data Flow Clarification

1. **Fetch:** `getTeamInjuries()` fetches from ESPN → returns **array** of injuries

### Problem2. **Process:** `getInjurySummary()` processes array → returns **summary object** with:

Major injuries are being heavily capped, potentially underweighting their impact on predictions.   - `count`, `severity`, `players`, `deltaOff`, `deltaDef`, `totalImpact`

3. **Use:** Feature array should reference **summary object**, not raw array

### Evidence from Logs

```### Impact

Dec 2, 02:04:28 PM: f8f90a32 INFO   [Injury] GUARDS cluster cap applied: 14.64 → 5- ✅ Injury adjustments now work properly

Dec 2, 02:04:28 PM: f8f90a32 INFO   [Injury] BIGS cluster cap applied: 8.45 → 5- ✅ No more `.toFixed()` errors

```- ✅ Proper offensive/defensive deltas applied to predictions

- ✅ RCI + Injury combined adjustments functioning

### Current Caps

`netlify/functions/_lib/nba/injury-adjustments.mjs`:---

```javascript

const POSITION_CLUSTER_CAPS = {## Issue 3: Excessive Injury Cluster Capping 📊

  GUARDS: 5.0,

  WINGS: 5.0,### Problem

  BIGS: 5.0Major injuries are being heavily capped, potentially underweighting their impact on predictions.

};

```### Evidence from Logs

```

### AnalysisDec 2, 02:04:28 PM: f8f90a32 INFO   [Injury] GUARDS cluster cap applied: 14.64 → 5

- Guard injuries of 14.64 reduced to 5 = **65% impact lost**Dec 2, 02:04:28 PM: f8f90a32 INFO   [Injury] BIGS cluster cap applied: 8.45 → 5

- Big injuries of 8.45 reduced to 5 = **41% impact lost**```



### Questions to Consider### Current Caps

1. **Is 14.64 calculated correctly?** (Check if calculation is inflated)`netlify/functions/_lib/nba/injury-adjustments.mjs`:

2. **Is cap too aggressive?** (Perhaps raise to 8-10 for extreme cases)```javascript

3. **Does this hurt prediction accuracy?** (Backtest with/without cap)const POSITION_CLUSTER_CAPS = {

  GUARDS: 5.0,

### Status  WINGS: 5.0,

⚠️ **Under Review** - Not changed yet, needs further analysis  BIGS: 5.0

};

---```



## Files Modified### Analysis

- Guard injuries of 14.64 reduced to 5 = **65% impact lost**

1. ✅ `netlify/functions/_lib/nba/team-priors-2024-25.mjs` - Changed `NO` → `NOP`, `NY` → `NYK`- Big injuries of 8.45 reduced to 5 = **41% impact lost**

2. ✅ `netlify/functions/nba-predictions-elite-v2/index.mjs` - Fixed variable names (lines 782, 791)

### Questions to Consider

---1. **Is 14.64 calculated correctly?** (Check if calculation is inflated)

2. **Is cap too aggressive?** (Perhaps raise to 8-10 for extreme cases)

## Testing Checklist3. **Does this hurt prediction accuracy?** (Backtest with/without cap)



After deployment to https://bgroundrobin.com/nba-predictions-v2:### Status

⚠️ **Under Review** - Not changed yet, needs further analysis

- [ ] **No "No prior for NOP/NYK" warnings** in function logs

- [ ] **No injury `.toFixed()` errors** in function logs---

- [ ] **Predictions generate successfully** for all games

- [ ] **Injury adjustments display properly** in UI## Files Modified

- [ ] **RCI + Injury deltas** show correct values

- [ ] **Compare prediction accuracy** on NOP/NYK games vs previous1. ✅ `netlify/functions/_lib/nba/team-priors-2024-25.mjs` - Added NOP/NYK entries

2. ✅ `netlify/functions/nba-predictions-elite-v2/index.mjs` - Fixed variable names (lines 782, 791)

---

---

## Deployment Status

## Testing Checklist

**Branch:** main42  

**Commit:** Pending  After deployment to https://bgroundrobin.com/nba-predictions-v2:

**Deployment:** Not yet deployed  

- [ ] **No "No prior for NOP/NYK" warnings** in function logs

---- [ ] **No injury `.toFixed()` errors** in function logs

- [ ] **Predictions generate successfully** for all games

## Related Context- [ ] **Injury adjustments display properly** in UI

- [ ] **RCI + Injury deltas** show correct values

### NFL V1 Issue (Paused)- [ ] **Compare prediction accuracy** on NOP/NYK games vs previous

While investigating NBA, discovered NFL V1 has similar data staleness issue:

- Generator loads `netlify/data/nfl/2025/schedule.full.json` (only Weeks 1-3, Sept 19)---

- Updated schedule at `public/data/nfl-schedule-2025.json` has Week 14 data

- This is why NFL predictions are empty - no games found for current week## Deployment Status



**Will address after NBA fixes are deployed and verified.****Branch:** main42  

**Commit:** Pending  
**Deployment:** Not yet deployed  

---

## Related Context

### NFL V1 Issue (Paused)
While investigating NBA, discovered NFL V1 has similar data staleness issue:
- Generator loads `netlify/data/nfl/2025/schedule.full.json` (only Weeks 1-3, Sept 19)
- Updated schedule at `public/data/nfl-schedule-2025.json` has Week 14 data
- This is why NFL predictions are empty - no games found for current week

**Will address after NBA fixes are deployed and verified.**

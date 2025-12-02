# NBA Elite V2 - Critical Fixes (Dec 2, 2025)# NBA Elite V2 - Critical Fixes (Dec 2, 2025)# NBA Elite V2 - Critical Fixes (Dec 2, 2025)



## Issues Discovered from Function Logs



Analyzing logs from https://bgroundrobin.com/nba-predictions-v2 revealed critical bugs causing prediction failures and excessive warnings.## Issues Discovered from Function Logs## Issues Discovered from Function Logs



---



## Issue 1: Team Abbreviation Mismatch ⚠️Analyzing logs from https://bgroundrobin.com/nba-predictions-v2 revealed three critical bugs causing prediction failures and excessive warnings.Analyzing logs from https://bgroundrobin.com/nba-predictions-v2 revealed three critical bugs causing prediction failures and excessive warnings.



### Problem

- **Priors file** uses `NO`, `NY`, and `SA`

- **ESPN/NBA API** returns `NOP`, `NYK`, and `SAS`------

- Result: Every NOP/NYK/SAS game triggers 10-20 "No prior" fallback warnings



### Evidence from Logs

```## Issue 1: Team Abbreviation Mismatch ⚠️## Issue 1: Team Abbreviation Mismatch ⚠️

Dec 2, 02:04:27 PM: WARN   [NBA] No prior for NOP, using league average

Dec 2, 02:41:24 PM: WARN   [NBA] No prior for SAS, using league average

```

(Repeated 20+ times per game)### Problem### Problem



### Root Cause- **Priors file** uses `NO` and `NY` - **Priors file** uses `NO` and `NY` 

`netlify/functions/_lib/nba/team-priors-2024-25.mjs`:

- Line 29: `NO: { ... }` should be `NOP: { ... }`- **ESPN/NBA API** returns `NOP` and `NYK`- **ESPN/NBA API** returns `NOP` and `NYK`

- Line 30: `NY: { ... }` should be `NYK: { ... }`

- Line 36: `SA: { ... }` should be `SAS: { ... }`- Result: Every NOP/NYK game triggers 10-20 "No prior for NOP/NYK" fallback warnings- Result: Every NOP/NYK game triggers 10-20 "No prior for NOP/NYK" fallback warnings



### Fix Applied

Changed team abbreviations to match ESPN/NBA API:

```javascript### Evidence from Logs### Evidence from Logs

NOP: { offRtg: 111.5, defRtg: 114.9, netRtg: -3.4, pace: 99.3, efg: 0.542, ts: 0.571, tovPct: 0.131, orbPct: 0.256, ftRate: 0.285 },

NYK: { offRtg: 115.1, defRtg: 111.7, netRtg: 3.4, pace: 97.5, efg: 0.566, ts: 0.588, tovPct: 0.115, orbPct: 0.282, ftRate: 0.271 },``````

SAS: { offRtg: 109.5, defRtg: 116.3, netRtg: -6.8, pace: 99.9, efg: 0.545, ts: 0.572, tovPct: 0.123, orbPct: 0.265, ftRate: 0.278 },

```Dec 2, 02:04:27 PM: f8f90a32 WARN   [NBA] No prior for NOP, using league averageDec 2, 02:04:27 PM: f8f90a32 WARN   [NBA] No prior for NOP, using league average



### ImpactDec 2, 02:04:27 PM: f8f90a32 INFO   [NBA FALLBACK] NOP using prior: efg=0.558, ts=0.584, offRtg=114.5Dec 2, 02:04:27 PM: f8f90a32 INFO   [NBA FALLBACK] NOP using prior: efg=0.558, ts=0.584, offRtg=114.5

- ✅ Eliminates 10-20 fallback warnings per NOP/NYK/SAS game

- ✅ Uses actual team priors instead of league averages``````

- ✅ More accurate predictions for New Orleans, New York, and San Antonio games

(Repeated 20+ times per game)(Repeated 20+ times per game)

---



## Issue 2: Injury Variable Name Bug 🐛

### Root Cause### Root Cause

### Problem

Code uses **wrong variable names** when accessing injury adjustments, causing `Cannot read properties of undefined (reading 'toFixed')` errors.`netlify/functions/_lib/nba/team-priors-2024-25.mjs`:`netlify/functions/_lib/nba/team-priors-2024-25.mjs`:



### Evidence from Logs- Line 29: `NO: { ... }` should be `NOP: { ... }`- Line 29: `NO: { ... }` should be `NOP: { ... }`

```

Dec 2, 02:04:28 PM: INFO   [INJURY] Error fetching injuries, using RCI-only adjustments: - Line 30: `NY: { ... }` should be `NYK: { ... }`- Line 30: `NY: { ... }` should be `NYK: { ... }`

Cannot read properties of undefined (reading 'toFixed')

```



### Root Cause### Fix Applied### Fix Applied

`netlify/functions/nba-predictions-elite-v2/index.mjs`:

Changed team abbreviations to match ESPN/NBA API:Added proper entries to TEAM_PRIORS_2024_25:

**Variable declarations:**

- Line 1124: `const homeInjuries = await getTeamInjuries(homeAbbr);` (ARRAY)```javascript```javascript

- Line 1133: `const awayInjuries = await getTeamInjuries(awayAbbr);` (ARRAY)

- Line 1126: `let homeInjuryAdj = getInjurySummary(homeInjuries, homeTeam, 'home');` (OBJECT)NOP: { offRtg: 111.5, defRtg: 114.9, netRtg: -3.4, pace: 99.3, efg: 0.542, ts: 0.571, tovPct: 0.131, orbPct: 0.256, ftRate: 0.285 },NOP: {

- Line 1145: `const awayInjuryAdj = getInjurySummary(awayInjuries, awayTeam, 'away');` (OBJECT)

NYK: { offRtg: 115.1, defRtg: 111.7, netRtg: 3.4, pace: 97.5, efg: 0.566, ts: 0.588, tovPct: 0.115, orbPct: 0.282, ftRate: 0.271 },  efg: 0.540,

**Bug location (lines 782, 791):**

```javascript```  ts: 0.569,

// WRONG - checking array properties that don't exist

if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {  offRtg: 110.4,

  value: homeInjuries.deltaOff?.toFixed(1) || '0.0',  // ❌ deltaOff doesn't exist on array

}### Impact  defRtg: 116.1,



if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {- ✅ Eliminates 10-20 fallback warnings per NOP/NYK game  netRtg: -5.7,

  value: awayInjuries.deltaDef?.toFixed(1) || '0.0',  // ❌ deltaDef doesn't exist on array

}- ✅ Uses actual team priors instead of league averages  pace: 97.9

```

- ✅ More accurate predictions for New Orleans and New York games},

### Fix Applied

Changed lines 782 and 791 to use correct variable names:NYK: {

```javascript

// CORRECT - checking summary object properties---  efg: 0.558,

if (homeInjuryAdj && homeInjuryAdj.count > 0 && homeInjuryAdj.severity !== 'NONE') {

  value: homeInjuryAdj.deltaOff?.toFixed(1) || '0.0',  // ✅ Works!  ts: 0.584,

}

## Issue 2: Injury Variable Name Bug 🐛  offRtg: 114.5,

if (awayInjuryAdj && awayInjuryAdj.count > 0 && awayInjuryAdj.severity !== 'NONE') {

  value: awayInjuryAdj.deltaDef?.toFixed(1) || '0.0',  // ✅ Works!  defRtg: 109.8,

}

```### Problem  netRtg: 4.7,



### Data Flow ClarificationCode uses **wrong variable names** when accessing injury adjustments, causing `Cannot read properties of undefined (reading 'toFixed')` errors.  pace: 93.2

1. **Fetch:** `getTeamInjuries()` fetches from ESPN → returns **array** of injuries

2. **Process:** `getInjurySummary()` processes array → returns **summary object** with:}

   - `count`, `severity`, `players`, `deltaOff`, `deltaDef`, `totalImpact`

3. **Use:** Feature array should reference **summary object**, not raw array### Evidence from Logs```



### Impact```

- ✅ Injury adjustments now work properly

- ✅ No more `.toFixed()` errorsDec 2, 02:04:28 PM: f8f90a32 INFO   [INJURY] Error fetching injuries, using RCI-only adjustments: ### Impact

- ✅ Proper offensive/defensive deltas applied to predictions

- ✅ RCI + Injury combined adjustments functioningCannot read properties of undefined (reading 'toFixed')- ✅ Eliminates 10-20 fallback warnings per NOP/NYK game



---```- ✅ Uses actual team priors instead of league averages



## Issue 3: Undefined Variable in Error Handler 🐛- ✅ More accurate predictions for New Orleans and New York games



### Problem### Root Cause

Catch block references `away` and `home` variables that are only defined inside the try block, causing "ReferenceError: away is not defined" when errors occur early in processing.

`netlify/functions/nba-predictions-elite-v2/index.mjs`:---

### Evidence from Logs

```

Dec 2, 02:41:19 PM: ERROR  [NBA Elite] Error: ReferenceError: away is not defined

    at index_default (file:///var/task/netlify/functions/nba-predictions-elite-v2/index.mjs:2610:58)**Variable declarations:**## Issue 2: Injury Variable Name Bug 🐛

```

- Line 1124: `const homeInjuries = await getTeamInjuries(homeAbbr);` (ARRAY)

### Root Cause

`netlify/functions/nba-predictions-elite-v2/index.mjs` line 1854:- Line 1133: `const awayInjuries = await getTeamInjuries(awayAbbr);` (ARRAY)### Problem

```javascript

} catch (gameError) {- Line 1126: `let homeInjuryAdj = getInjurySummary(homeInjuries, homeTeam, 'home');` (OBJECT)Code uses **wrong variable names** when accessing injury adjustments, causing `Cannot read properties of undefined (reading 'toFixed')` errors.

  console.error(`[NBA Elite V2] Error processing ${away?.team?.abbreviation || '?'} @ ${home?.team?.abbreviation || '?'}:`, gameError.message);

  // ❌ away and home are undefined if error occurs before line 1040- Line 1145: `const awayInjuryAdj = getInjurySummary(awayInjuries, awayTeam, 'away');` (OBJECT)

}

```### Evidence from Logs



### Fix Applied**Bug location (lines 782, 791):**```

Added fallback to extract team names from event object:

```javascript```javascriptDec 2, 02:04:28 PM: f8f90a32 INFO   [INJURY] Error fetching injuries, using RCI-only adjustments: 

} catch (gameError) {

  const homeTeam = home?.team?.abbreviation || event?.competitions?.[0]?.competitors?.find?.(c => c.homeAway === 'home')?.team?.abbreviation || '?';// WRONG - checking array properties that don't existCannot read properties of undefined (reading 'toFixed')

  const awayTeam = away?.team?.abbreviation || event?.competitions?.[0]?.competitors?.find?.(c => c.homeAway === 'away')?.team?.abbreviation || '?';

  console.error(`[NBA Elite V2] Error processing ${awayTeam} @ ${homeTeam}:`, gameError.message);if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {```

  console.error(`[NBA Elite V2] Stack:`, gameError.stack);

}  value: homeInjuries.deltaOff?.toFixed(1) || '0.0',  // ❌ deltaOff doesn't exist on array

```

}### Root Cause

### Impact

- ✅ Error handler no longer crashes when processing errors`netlify/functions/nba-predictions-elite-v2/index.mjs`:

- ✅ Proper error logging with team names when available

- ✅ Graceful degradation to '?' when team info unavailableif (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {



---  value: awayInjuries.deltaDef?.toFixed(1) || '0.0',  // ❌ deltaDef doesn't exist on array**Variable declarations:**



## Files Modified}- Line 1124: `const homeInjuries = await getTeamInjuries(homeAbbr);` (ARRAY)



1. ✅ `netlify/functions/_lib/nba/team-priors-2024-25.mjs` - Changed `NO` → `NOP`, `NY` → `NYK`, `SA` → `SAS````- Line 1133: `const awayInjuries = await getTeamInjuries(awayAbbr);` (ARRAY)

2. ✅ `netlify/functions/nba-predictions-elite-v2/index.mjs` - Fixed injury variable names (lines 782, 791) and error handler (line 1854)

- Line 1126: `let homeInjuryAdj = getInjurySummary(homeInjuries, homeTeam, 'home');` (OBJECT)

---

### Fix Applied- Line 1145: `const awayInjuryAdj = getInjurySummary(awayInjuries, awayTeam, 'away');` (OBJECT)

## Testing Checklist

Changed lines 782 and 791 to use correct variable names:

After deployment to https://bgroundrobin.com/nba-predictions-v2:

```javascript**Bug location (lines 782, 791):**

- [ ] **No "No prior for NOP/NYK/SAS" warnings** in function logs

- [ ] **No injury `.toFixed()` errors** in function logs// CORRECT - checking summary object properties```javascript

- [ ] **No "ReferenceError: away is not defined" errors** in function logs

- [ ] **Predictions generate successfully** for all gamesif (homeInjuryAdj && homeInjuryAdj.count > 0 && homeInjuryAdj.severity !== 'NONE') {// WRONG - checking array properties that don't exist

- [ ] **Injury adjustments display properly** in UI

- [ ] **RCI + Injury deltas** show correct values  value: homeInjuryAdj.deltaOff?.toFixed(1) || '0.0',  // ✅ Works!if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {

- [ ] **Compare prediction accuracy** on NOP/NYK/SAS games vs previous

}  value: homeInjuries.deltaOff?.toFixed(1) || '0.0',  // ❌ deltaOff doesn't exist on array

---

}

## Deployment Status

if (awayInjuryAdj && awayInjuryAdj.count > 0 && awayInjuryAdj.severity !== 'NONE') {

**Branch:** main42  

**Commit:** Pending    value: awayInjuryAdj.deltaDef?.toFixed(1) || '0.0',  // ✅ Works!if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {

**Deployment:** Not yet deployed  

}  value: awayInjuries.deltaDef?.toFixed(1) || '0.0',  // ❌ deltaDef doesn't exist on array

---

```}

## Related Context

```

### NFL V1 Issue (Paused)

While investigating NBA, discovered NFL V1 has similar data staleness issue:### Data Flow Clarification

- Generator loads `netlify/data/nfl/2025/schedule.full.json` (only Weeks 1-3, Sept 19)

- Updated schedule at `public/data/nfl-schedule-2025.json` has Week 14 data1. **Fetch:** `getTeamInjuries()` fetches from ESPN → returns **array** of injuries### Fix Applied

- This is why NFL predictions are empty - no games found for current week

2. **Process:** `getInjurySummary()` processes array → returns **summary object** with:Changed lines 782 and 791 to use correct variable names:

**Will address after NBA fixes are deployed and verified.**

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

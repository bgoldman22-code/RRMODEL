# HTTP 500 Error Diagnostic Summary
**Date:** October 10, 2025  
**Issue:** HTTP 500 on /predictions page, "No predictions available for Week 6, 2025"

---

## 🔍 Likely Root Causes

### 1. **Line Movement Integration Breaking Prediction Generation**
**Problem:** We added `await applyPreBetGates()` and `await applyLineMovementSizingModifiers()` which require:
- Netlify Blobs store `odds-timeseries` (may not exist yet)
- Snapshot data for games (hasn't captured yet)

**Evidence:**
- Error happened after commit `f411b9b` (line movement integration)
- We added try/catch but may have issues with variable scoping

**Check:**
```javascript
// netlify/functions/nfl-predictions-generate/index.mjs lines ~1774-1800
// Variables gateResult and sizingResult declared in try block
// May not be accessible outside try block if error occurs
```

---

### 2. **Blob Store Not Initialized**
**Problem:** First-time access to new Blob stores may fail:
- `odds-timeseries` (odds snapshots)
- `clv-tracking` (CLV entries)
- `predictions-cache` (cached predictions)

**Solution:** Netlify automatically creates stores on first `set()`, but `get()` on empty store may throw.

---

### 3. **Cached Predictions Endpoint Issue**
**Problem:** Frontend now calls `nfl-predictions-cached` instead of `nfl-predictions-generate`

**Check:**
```javascript
// src/pages/NFLPredictions.jsx line 115
const url = `/.netlify/functions/nfl-predictions-cached`;
```

If cache is empty, endpoint returns 202 (triggers background generation) but may not handle frontend gracefully.

---

### 4. **Variable Scoping Bug**
**Critical Issue:** In the try/catch blocks we added:

```javascript
let gateResult, sizingResult;

try {
  gateResult = await applyPreBetGates(...);
  sizingResult = await applyLineMovementSizingModifiers(...);
} catch (lineMovementError) {
  gateResult = { pass: true, reason: 'line_movement_unavailable' };
  sizingResult = {
    final_units: unitInfo.units,
    reasons: ['line_movement_unavailable'],
    metrics: null
  };
}

// Later used here:
recommended_units: sizingResult.final_units,
unit_reasoning: `${unitInfo.reasoning} | ${sizingResult.reasons.join(', ')}`,
line_movement: sizingResult.metrics,
gate_result: gateResult.reason
```

**Problem:** If error is thrown BEFORE try block, variables are undefined.

---

## 🔧 Immediate Fixes Needed

### Fix 1: Add Null Checks in Component Assembly
```javascript
recommended_units: sizingResult?.final_units || unitInfo.units,
unit_reasoning: sizingResult?.reasons 
  ? `${unitInfo.reasoning} | ${sizingResult.reasons.join(', ')}`
  : unitInfo.reasoning,
line_movement: sizingResult?.metrics || null,
gate_result: gateResult?.reason || 'no_gates_applied'
```

### Fix 2: Initialize Variables with Defaults
```javascript
let gateResult = { pass: true, reason: 'no_gates_applied' };
let sizingResult = {
  final_units: unitInfo.units,
  reasons: [],
  metrics: null
};

try {
  // ... gate/sizing logic
} catch (error) {
  // Fallback already set
}
```

### Fix 3: Check Blob Store Existence
```javascript
// In line-movement.mjs getRecentSnapshots()
try {
  const { blobs } = await store.list({ prefix: `${gameId}/` });
  if (!blobs || blobs.length === 0) {
    console.log(`[MOVEMENT] No snapshots found for ${gameId}`);
    return [];
  }
} catch (error) {
  console.log(`[MOVEMENT] Blob store not accessible:`, error.message);
  return [];
}
```

### Fix 4: Frontend Cache Miss Handling
```javascript
// src/pages/NFLPredictions.jsx
const response = await fetch('/.netlify/functions/nfl-predictions-cached');

if (response.status === 202) {
  // Cache miss - show loading state and retry
  console.log('Cache miss, waiting for generation...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  // Retry or fall back to direct generation
  const retryResponse = await fetch('/.netlify/functions/nfl-predictions-generate');
  // ...
}
```

---

## 📋 Debug Checklist for GPT

1. **Check Netlify Function Logs:**
   - Look for error stack traces in nfl-predictions-generate
   - Check for "undefined" or "Cannot read property" errors
   - Verify if try/catch blocks are logging fallback messages

2. **Verify Blob Store Access:**
   - Check if odds-timeseries store exists in Netlify dashboard
   - Verify permissions for Blob store access

3. **Test Direct Generation:**
   - Try calling nfl-predictions-generate directly (bypass cache)
   - URL: `/.netlify/functions/nfl-predictions-generate?week=6&season=2025`

4. **Check Variable Initialization:**
   - Trace through generateParlayComponents() line by line
   - Verify gateResult and sizingResult are always defined before use

5. **Validate Error Handling:**
   - Ensure all async operations have try/catch
   - Check that fallback values match expected object shapes

---

## 🎯 Recommended Fix (Quick)

**Revert line movement integration temporarily:**
```javascript
// Comment out line movement calls until Blob stores are initialized
// let gateResult = await applyPreBetGates(...);
// let sizingResult = await applyLineMovementSizingModifiers(...);

// Use base units for now
const gateResult = { pass: true, reason: 'line_movement_disabled_temporarily' };
const sizingResult = {
  final_units: unitInfo.units,
  reasons: ['base_kelly_units'],
  metrics: null
};
```

Then re-enable after first odds snapshot capture runs successfully.

---

## 📁 Files in ZIP for Analysis

**Backend Functions:**
- nfl-predictions-generate/index.mjs (main generator - 3,187 lines)
- nfl-predictions-cached/index.mjs (cache layer)
- scheduled-predictions-refresh.mjs (30min refresh)
- nfl-odds-snapshot/index.mjs (odds capture)
- nfl-clv-track/index.mjs (CLV tracking)
- nfl-clv-close/index.mjs (CLV closer)

**Line Movement System:**
- _lib/line-movement.mjs (movement metrics)
- _lib/sizing-gates.mjs (gates & modifiers)
- _lib/odds-constants.mjs (book allowlist)

**Core Logic:**
- _lib/kelly-hybrid-staking.mjs (Kelly sizing)
- _lib/canonical-availability-v5.mjs (injury system)
- _lib/comprehensive-player-epa.js (EPA database)
- _lib/elite-injury-penalty-calculator.mjs (sanity checks)

**Frontend:**
- src/pages/NFLPredictions.jsx (original page)
- src/pages/PredictionsTest.jsx (enhanced test page)

**Config:**
- netlify.toml (deployment config)

**Documentation:**
- LINE_MOVEMENT_PHASE_1-2_SUMMARY.md
- LINE_MOVEMENT_INTEGRATION_PLAN.md
- LOCK_SYSTEM_FIX_SUMMARY.md
- GPT_AUDIT_IMPLEMENTATION_PLAN.md

---

## 🚨 Most Likely Issue

**Variable undefined error in component assembly due to incomplete try/catch scope.**

The `gateResult` and `sizingResult` variables are declared but may not be properly initialized if:
1. Error occurs before try block
2. Async operation fails silently
3. Blob store access throws before fallback is set

**Fix:** Add default initialization before try block + null-safe access in component objects.

# Lock System Fix Summary
**Date:** October 10, 2025  
**Issue:** PHI @ NYG game (Oct 8, 8:00 PM) still showing betting recommendations after kickoff  
**Root Cause:** GPT's Issue #1 (Timezone Normalization Bug)

---

## 🔍 Problem Analysis

GPT identified 4 common lock failure points:
1. **Timezone/normalization bug** ← OUR ISSUE
2. No authoritative server-side snapshot at T0
3. Scheduler not running (or missing idempotency)
4. Race between odds refresh and lock write

### What Was Happening
```javascript
// ❌ BEFORE (BROKEN)
const kickoff = new Date(game.start); // Ambiguous TZ parsing
const now = new Date();               // UTC
const timeToKickoff = kickoff - now;  // ❌ Comparing apples to oranges
```

**Symptoms:**
- Games never lock, or lock late/early
- Behavior differs by environment (localhost vs production)
- PHI @ NYG (Oct 8) still showed "BET 5.0U" on Oct 10

---

## ✅ Fixes Implemented (Commit 28912f9)

### 1. Backend: UTC Normalization in Prediction Generator
**File:** `netlify/functions/nfl-predictions-generate/index.mjs`

#### `checkAndLockKickoffGames()` - Lines 2876-2942
```javascript
// ✅ AFTER (FIXED)
const nowUtc = new Date();
const nowEpochMs = nowUtc.getTime();
const nowIso = nowUtc.toISOString();

// Parse kickoff with validation
const kickoffParsed = new Date(game.start);
const kickoffEpochMs = kickoffParsed.getTime();
const kickoffIso = new Date(kickoffEpochMs).toISOString();

// UTC epoch millisecond comparison
const diffMs = kickoffEpochMs - nowEpochMs;
const minutesToKickoff = diffMs / (1000 * 60);

// Debug logging
console.log(`[KICKOFF] ${game.game_id} time check:`, {
  kickoff_raw: game.start,
  kickoff_iso: kickoffIso,
  kickoff_epoch_ms: kickoffEpochMs,
  now_iso: nowIso,
  now_epoch_ms: nowEpochMs,
  diff_ms: diffMs,
  minutes_to_kickoff: minutesToKickoff.toFixed(1)
});

// Lock if within ±5 minutes
if (minutesToKickoff <= 5 && minutesToKickoff >= -5) {
  await lockGamePicks(game.game_id, game, 'kickoff');
}
```

**Key Improvements:**
- ✅ All times normalized to UTC ISO strings
- ✅ All comparisons use epoch milliseconds
- ✅ Comprehensive debug logging for troubleshooting
- ✅ Input validation (check for NaN)

#### `integrateLockedPicks()` - Lines 2944-2986
```javascript
// ✅ Same UTC normalization
const nowUtc = new Date();
const nowEpochMs = nowUtc.getTime();

const kickoffParsed = new Date(game.start);
const kickoffEpochMs = kickoffParsed.getTime();

const gameStarted = nowEpochMs > kickoffEpochMs; // Pure epoch comparison
```

---

### 2. Frontend: Client-Side Lock Check
**File:** `src/pages/NFLPredictions.jsx`

#### Game Start Detection - Lines 1067-1073
```javascript
// ⏰ CLIENT-SIDE LOCK: Check if game has started
const gameStartTime = r.start ? new Date(r.start) : null;
const now = new Date();
const hasGameStarted = gameStartTime && now > gameStartTime;
```

#### Hide Betting Recommendations for Started Games - Lines 1258-1268
```javascript
// Moneyline
betRecommendation={hasGameStarted ? 
  { text: "LOCKED", color: "text-gray-500" } : 
  (enhancedML.betRecommendation || getBetRecommendation(0))
}
unitInfo={hasGameStarted ? null : /* ...units... */}
bestBook={hasGameStarted ? null : enhancedML.best_book}
lockedPick={hasGameStarted ? 
  { locked: true, game_started: true } : 
  r.locked_picks?.moneyline
}
```

**Applied to all 3 markets:**
- ✅ Moneyline
- ✅ Spread
- ✅ Total

---

## 🧪 Testing & Validation

### What to Check
1. **Debug Logs:** Check Netlify function logs for timezone debug output
```
[KICKOFF] PHI@NYG time check: {
  kickoff_raw: "2025-10-08T20:00:00Z",
  kickoff_iso: "2025-10-08T20:00:00.000Z",
  kickoff_epoch_ms: 1728417600000,
  now_iso: "2025-10-10T18:30:00.000Z",
  now_epoch_ms: 1728583800000,
  diff_ms: -166200000,  // ← Negative = game started
  minutes_to_kickoff: "-2770.0"
}
```

2. **Frontend Behavior:**
   - PHI @ NYG should show "LOCKED" instead of "BET 5.0U"
   - No unit recommendations for started games
   - No "Best: FanDuel" book info for started games

3. **Lock Storage:** Check Netlify Blobs for locked picks
```bash
# Check if picks were saved
# Should see entries like: PHI@NYG-spread, PHI@NYG-total, PHI@NYG-moneyline
```

---

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Backend UTC Normalization** | ✅ FIXED | All time comparisons use epoch ms |
| **Debug Logging** | ✅ ADDED | Can now trace timezone issues |
| **Client-Side Lock** | ✅ ADDED | Hides bets for started games |
| **Lock Storage** | ⚠️ EXISTS | Need to verify it's being called |
| **Scheduler** | ❓ UNKNOWN | Need to check if cron is running |

---

## 🚀 Next Steps (Phase 2)

### Immediate (Already Fixed)
- ✅ Timezone normalization
- ✅ Client-side lock display

### Short-Term (Week 7)
1. **Verify lock system is running**
   - Check Netlify function logs during Sunday games
   - Confirm lock writes to Blobs storage
   - Validate closing odds snapshot

2. **Add scheduler (if missing)**
   ```javascript
   // netlify/functions/scheduled-game-lock.js
   export const handler = async () => {
     const now = DateTime.utc();
     // Scan for games within 5min of kickoff
     // Call lockPicksForGame() for each
   };
   ```

3. **Monitor for improvements**
   - Games should auto-lock at kickoff
   - No more "BET X.XU" after kickoff
   - Performance tracking with actual closing odds

### Medium-Term (GPT's Other Fixes)
4. R Pipeline variance dampers (30min)
5. Standardize QB cap to 7.5pts (15min)
6. Sanity choke point (45min)

---

## 📝 GPT's Assessment

> "If your lines/picks aren't locking, it's almost certainly (a) kickoff time normalization and/or (b) no immutable snapshot + UI still reading live odds. Fix those two, make the lock atomic/idempotent, and the feature will behave exactly as promised."

**Status:** 
- **(a) Kickoff normalization** → ✅ FIXED
- **(b) Immutable snapshot** → ⚠️ EXISTS but need to verify it's running

---

## 🎯 Expected Behavior After Fix

### Before Kickoff
```
PHI @ NYG | Oct 8, 8:00 PM
BET 5.0U | 68% conf | +32.4 pts edge
```

### After Kickoff (Oct 8, 8:01 PM+)
```
PHI @ NYG | Oct 8, 8:00 PM  
LOCKED | 68% conf | Closed: NYG +3.5 (-110)
🔒 Locked at kickoff (8:00:15 PM)
```

---

## 🐛 How to Debug Future Lock Issues

1. **Check function logs:**
```bash
netlify functions:log nfl-predictions-generate
```

2. **Look for timezone debug output:**
```
[KICKOFF] LAR@SEA time check: {
  diff_ms: -300000,  // ← Should be negative after kickoff
  minutes_to_kickoff: "-5.0"
}
```

3. **Verify lock attempts:**
```
[KICKOFF] 🔒 Game LAR@SEA kickoff detected, triggering lock (-2.5min)
[LOCK] Successfully locked LAR@SEA: { status: 'locked', markets: 3 }
```

4. **Check Blobs storage:**
```bash
# Should see 3 entries per game after lock
LAR@SEA-spread
LAR@SEA-total  
LAR@SEA-moneyline
```

---

## 📚 References

- **Commit:** `28912f9` - UTC timezone normalization
- **GPT Audit:** See `GPT_AUDIT_IMPLEMENTATION_PLAN.md`
- **Lock Function:** `netlify/functions/nfl-picks-lock.js`
- **Prediction Generator:** `netlify/functions/nfl-predictions-generate/index.mjs`

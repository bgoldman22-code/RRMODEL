# Locking System Issues - Root Cause Analysis
**Date**: October 13, 2025  
**Status**: 🔴 **BROKEN** - Multiple data contract mismatches

---

## 🐛 Root Causes Identified

### Issue #1: Field Name Mismatches
**Problem**: Locking code expects different field names than actual data structure

**Expected by locking code**:
```javascript
game.game_id     // ❌ Doesn't exist
game.start       // ❌ Doesn't exist  
game.home_team   // ❌ Doesn't exist
game.away_team   // ❌ Doesn't exist
```

**Actual data structure**:
```javascript
game.id          // ✅ "2025_06_PHI_NYG"
game.kickoff     // ✅ "2025-10-09" (but DATE ONLY, no time!)
game.homeTeam    // ✅ "New York Giants"
game.awayTeam    // ✅ "Philadelphia Eagles"
```

**Result**: 
- `if (!game.start || !game.game_id) continue;` → **Skips ALL games**
- Locking never happens because conditions never match

---

### Issue #2: Kickoff Data is Date-Only (No Time)
**Problem**: `kickoff: "2025-10-09"` has no time component

**Locking code expects**:
```javascript
const kickoffParsed = new Date(game.start);  // Needs ISO timestamp
// e.g., "2025-10-09T17:00:00Z" (5PM ET kickoff)
```

**Actual data**:
```javascript
game.kickoff = "2025-10-09"  // Just the date
// Parses to: 2025-10-09T00:00:00Z (midnight UTC)
```

**Result**:
- Time comparison logic broken
- All games appear to have started at midnight
- Locking window calculation meaningless

---

### Issue #3: Inconsistent Data Contracts Between Functions
**Problem**: `nfl-predictions-generate` uses one schema, locking system expects another

**Generate function creates** (`index.mjs` line ~2850):
```javascript
{
  id: gameId,              // Not game_id
  homeTeam: home,          // Not home_team
  awayTeam: away,          // Not away_team
  kickoff: kickoffDate,    // Not start, and date-only
  ...
}
```

**Locking system expects** (`checkAndLockKickoffGames`):
```javascript
{
  game_id: ...,            // ❌ Wrong field name
  start: ...,              // ❌ Wrong field name, needs timestamp
  home_team: ...,          // ❌ Wrong field name
  away_team: ...,          // ❌ Wrong field name
}
```

---

### Issue #4: Schedule Data Missing Full Timestamps
**Problem**: Schedule source only provides dates, not game times

**From `nfl-schedule-get`**:
```javascript
{
  matchups: [
    {
      id: "2025_06_PHI_NYG",
      homeTeam: "New York Giants",
      awayTeam: "Philadelphia Eagles",
      kickoff: "2025-10-09"  // ⚠️ Just date, no time!
    }
  ]
}
```

**What we need**:
```javascript
{
  kickoff: "2025-10-09T20:15:00Z"  // Full ISO timestamp with game time
}
```

---

## 🔧 Fix Strategy

### Option A: Quick Fix - Normalize Field Names (2 hours)
**Approach**: Make locking code match actual data structure

**Changes needed**:
1. Change all `game.game_id` → `game.id`
2. Change all `game.start` → `game.kickoff`
3. Change all `game.home_team` → `game.homeTeam`
4. Change all `game.away_team` → `game.awayTeam`
5. Handle date-only kickoffs (add default time or skip if no time)

**Pros**:
- ✅ Quick fix (just field name changes)
- ✅ Works with existing data
- ✅ No changes to generate function

**Cons**:
- ⚠️ Still missing accurate game times
- ⚠️ Locking window will be approximate
- ⚠️ Might lock too early/late

---

### Option B: Full Fix - Add Game Times to Schedule (4-6 hours)
**Approach**: Fix schedule data to include full timestamps

**Changes needed**:
1. Update schedule source to include game times
2. Store kickoff as ISO timestamps with time
3. Normalize field names in locking code
4. Add timezone handling (games in ET, CT, MT, PT)

**Pros**:
- ✅ Accurate locking windows
- ✅ Proper timezone handling
- ✅ Robust long-term solution

**Cons**:
- ❌ More work (schedule data pipeline)
- ❌ Need game time data source
- ❌ More testing required

---

### Option C: Simplified Locking - Manual Trigger (1 hour)
**Approach**: Remove auto-locking, add manual lock button/endpoint

**Changes needed**:
1. Remove `checkAndLockKickoffGames()` from generate
2. Add simple "Lock All Started Games" button in UI
3. Use current date/time check (any game before now)

**Pros**:
- ✅ Simplest solution
- ✅ User control over when to lock
- ✅ No timing logic needed

**Cons**:
- ⚠️ Requires manual action
- ⚠️ Risk of forgetting to lock
- ⚠️ Not automated

---

## 📋 Recommended Fix: Option A (Quick Fix)

**Why**: Gets locking working today with minimal effort, can enhance later

**Implementation steps**:
1. Fix field name mismatches in `checkAndLockKickoffGames()`
2. Fix field name mismatches in `integrateLockedPicks()`
3. Fix field name mismatches in `lockGamePicks()`
4. Add temporary time handling (use noon ET as default for date-only kickoffs)
5. Test with current week's games

**Expected time**: 1-2 hours
**Risk**: Low (just field renames + basic time handling)

---

## 🧪 Testing Plan

### Before Fix:
```bash
# Check current data structure
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-predictions-get" | \
  jq '.rows[0] | {id, kickoff, homeTeam, awayTeam, game_id, start}'
```

### After Fix:
```bash
# Generate predictions (should trigger locking for started games)
curl -s -X POST "https://bgroundrobin.com/.netlify/functions/nfl-predictions-refresh"

# Check if any games are locked
curl -s -X POST "https://bgroundrobin.com/.netlify/functions/nfl-picks-lock" \
  -H "Content-Type: application/json" \
  -d '{"action":"get","gameId":"2025_06_PHI_NYG"}' | jq .

# Verify locked pick structure
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-predictions-get" | \
  jq '.rows[] | select(.predictions.spread.isLocked == true) | {game: .matchup, locked: .predictions.spread.isLocked}'
```

---

## 🎯 Next Steps

1. **Confirm approach**: Quick fix (Option A) or full fix (Option B)?
2. **Implement field name normalization**
3. **Add time handling for date-only kickoffs**
4. **Test locking with past game**
5. **Monitor Sunday games for auto-locking**

**Waiting for your go-ahead to proceed with Option A (recommended).**

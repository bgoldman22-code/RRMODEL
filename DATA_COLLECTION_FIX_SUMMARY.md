# Data Collection Fix Summary
**Date**: November 4, 2025, 10:11 PM  
**Issue**: MLB game data and historical odds collection failures  
**Status**: ✅ MLB FIXED | ⚠️ ODDS NEEDS INVESTIGATION

## Problem Identified

### MLB Game Data - 404 Errors
**Root Cause**: API version mismatch
- Schedule endpoint: Uses `/api/v1/schedule` (working)
- Game feed endpoint: Needs `/api/v1.1/game/{gamePk}/feed/live` (was using v1)

**Symptom**:
```
❌ Error processing Game 634618: HTTP 404
❌ Error processing Game 634642: HTTP 404
```

All 2021-2025 game detail requests failing despite valid gamePk IDs.

## Solution Implemented

**File**: `scripts/mlb_data_collector.mjs`

**Changes**:
1. Line 32: Updated API base URL
   ```javascript
   // OLD:
   const MLB_STATS_API_BASE = 'https://statsapi.mlb.com/api/v1';
   
   // NEW:
   const MLB_STATS_API_BASE = 'https://statsapi.mlb.com/api/v1.1';
   ```

2. Line 95: Keep schedule endpoint on v1 (it doesn't have v1.1)
   ```javascript
   // Explicitly use v1 for schedule (works)
   const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}&gameType=R`;
   ```

3. Line 127: Game feed automatically uses v1.1 from base URL
   ```javascript
   const gameUrl = `${MLB_STATS_API_BASE}/game/${game.gamePk}/feed/live`;
   // Resolves to: https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live
   ```

## Verification

**Test Command**:
```bash
curl -s "https://statsapi.mlb.com/api/v1.1/game/634618/feed/live"
```

**Test Results**:
- ✅ 2021 game 634618 (April 1, 2021): SUCCESS - returned 6 HRs
- ✅ 2025 game 746511 (World Series): SUCCESS - returned full game data
- ✅ Current collector: Processing at ~206 games/minute

**Home Run Data Extraction Working**:
```json
{
  "gamePk": 634618,
  "date": "2021-04-01",
  "homeRuns": [
    {"player": "Wil Myers", "hrs": 1},
    {"player": "Eric Hosmer", "hrs": 1},
    {"player": "Ketel Marte", "hrs": 1},
    {"player": "Asdrúbal Cabrera", "hrs": 1},
    {"player": "Tim Locastro", "hrs": 1},
    {"player": "Stephen Vogt", "hrs": 1}
  ]
}
```

## Performance

**Current Collection Stats** (as of 10:11 PM):
- Status: Running (PID varies, check with `ps aux | grep mlb_data`)
- Rate: ~206 games/minute
- Progress: 181/2430 games (7.4%) for 2021
- ETA: ~12 minutes per year, ~60 minutes for all 5 years

**Log Location**: `logs/mlb_fixed.log`

## Still Outstanding: Historical Odds

**Issue**: TheOddsAPI returning 422 errors for all dates
```
❌ Error: 422 Unprocessable Entity for 2025-04-01
```

**Attempted**: 219 dates (2025-04-01 through 2025-10-31)  
**Credits Used**: 10,810 / 50,000  
**Success**: 0 dates

**Next Steps**:
1. Research TheOddsAPI historical endpoint documentation
2. Check if historical data requires different endpoint (not just `date=` parameter)
3. Verify if historical access included in current plan tier
4. Alternative: Consider web.archive.org scraping for FanDuel historical lines

## Timeline

- **8:41 PM**: Original collection started, discovered 404 errors
- **9:50 PM**: User reported failures, Claude investigated
- **10:00 PM**: Root cause identified (API version)
- **10:08 PM**: Fix implemented and tested
- **10:11 PM**: Collection restarted successfully

## User Directive

> "2025 is PAST dates. The 2025 season is over. Fix things THE RIGHT WAY, not the easy way."

**Response**: Debugged actual API structure, tested with real game IDs, verified correct endpoint rather than implementing workarounds.

## What's Next

1. ⏳ **Wait for MLB collection** (~60 min remaining)
2. 🔍 **Debug historical odds** (proper endpoint research)
3. ✅ **Generate profiles** (once MLB data complete)
4. 🚀 **Run backtest** (4-phase comprehensive validation)

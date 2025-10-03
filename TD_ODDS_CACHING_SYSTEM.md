# TD Player Props Odds Caching System

## Overview
The TD predictions system uses a smart caching strategy to ensure fast, reliable predictions even when TheOddsAPI is slow or unavailable.

## Architecture

### 1. Cache-First Strategy
- **Primary source**: `public/data/nfl-td-odds-cache.json` (24-hour TTL)
- **Fallback**: Live TheOddsAPI fetch (8-second timeout)
- **Default**: Model-only predictions (no odds comparison)

### 2. Cache Refresh Mechanisms

#### Automatic Scheduled Refresh
- **Schedule**: Daily at 8am ET (12pm UTC)
- **Function**: `netlify/functions/refresh-td-odds-cache/index.mjs`
- **Configured in**: `netlify.toml` scheduled functions

#### Background Refresh
- When serving cached data, triggers background refresh (fire-and-forget)
- Updates cache without blocking user request
- Ensures cache stays fresh throughout the day

#### Manual Refresh
- **Endpoint**: `/.netlify/functions/refresh-td-odds-cache`
- **Method**: GET or POST
- **Use case**: Testing, emergency updates, pre-game refreshes

### 3. Data Flow

```
User Request
    ↓
Load Cache (if < 24h old)
    ↓
    ├─ Cache Hit → Use cached odds
    │                ↓
    │            Trigger background refresh (async)
    │
    └─ Cache Miss → Fetch live odds (8s timeout)
                      ↓
                      ├─ Success → Use fresh odds + save to cache
                      └─ Timeout → Continue with model-only predictions
```

### 4. Cache File Structure

```json
{
  "timestamp": "2025-10-03T12:00:00.000Z",
  "player_count": 450,
  "refresh_type": "scheduled|manual|background",
  "odds": {
    "Player Name": {
      "player_anytime_td": {
        "books": {
          "fanduel": 120,
          "draftkings": 115,
          "betmgm": 125
        }
      },
      "player_1st_td": { ... },
      "player_tds_over": { ... }
    }
  }
}
```

## Benefits

1. **Speed**: Cache reads are instant (no API calls during predictions)
2. **Reliability**: Works even when TheOddsAPI is down/slow
3. **Cost**: Reduces TheOddsAPI usage from 100+ calls/day to 1-2 calls/day
4. **User Experience**: No timeouts, consistent sub-second response times

## Monitoring

- Check cache age in function logs: "Using cached odds (X minutes old)"
- Verify scheduled refresh in Netlify Functions dashboard
- Manual refresh response includes player_count and timestamp

## Emergency Procedures

### If odds are stale:
```bash
curl https://bgroundrobin.com/.netlify/functions/refresh-td-odds-cache
```

### If cache is corrupted:
1. Delete `public/data/nfl-td-odds-cache.json`
2. Redeploy (or wait for next scheduled refresh)
3. System will auto-create fresh cache on next prediction request

## Integration with TD Predictions

The `nfl-td-comprehensive-predictions` function automatically:
- Loads cached odds if available (< 24h old)
- Falls back to live fetch if cache is stale/missing
- Continues with model-only predictions if both fail
- Never blocks on odds fetching (max 8s timeout)

No changes needed to frontend or API contracts.

# Player Props Fix - November 6, 2025

## Problem

Player props were returning **422 - INVALID_MARKET** errors despite having TheOddsAPI premium subscription.

## Root Cause

We were using the **WRONG ENDPOINT** for player props!

### ❌ What we were doing (WRONG):
```javascript
// This endpoint does NOT support player props
GET /sports/americanfootball_nfl/odds?markets=player_pass_yds
```

### ✅ What we should do (CORRECT):
```javascript
// Player props MUST use per-event endpoint
GET /events/{eventId}/odds?markets=player_pass_yds,player_rush_yds,...
```

## The Fix

According to TheOddsAPI documentation:

> "Due to the growing size of the API response, **additional markets need to be accessed one event at a time** using the new `/events/{eventId}/odds` endpoint."

Player props are considered "additional markets" and MUST use the per-event endpoint.

### Changes Made

**Before** (Wrong - single call to sports/odds):
```javascript
// Tried to fetch all props in one call
const url = `${BASE_URL}/sports/${SPORT}/odds?markets=${market}`;
// ❌ Returns 422 - INVALID_MARKET
```

**After** (Correct - per-event calls):
```javascript
// Step 1: Get event IDs
const events = await fetch(`${BASE_URL}/sports/${SPORT}/events`);

// Step 2: For each event, fetch props
for (const event of events) {
  const url = `${BASE_URL}/sports/${SPORT}/events/${event.id}/odds`;
  url.searchParams.set('markets', 'player_pass_yds,player_rush_yds,...');
  // ✅ Returns player props for that game
}
```

### Key Changes in Code

1. **Added event fetching**:
   ```javascript
   const eventsResponse = await fetch(`${ODDS_API_BASE}/sports/${SPORT}/events?apiKey=${apiKey}`);
   const events = await eventsResponse.json();
   ```

2. **Changed to per-event prop fetching**:
   ```javascript
   for (const event of events) {
     const url = new URL(`${ODDS_API_BASE}/sports/${SPORT}/events/${event.id}/odds`);
     // ... fetch props for this specific event
   }
   ```

3. **Updated market names** (per docs):
   - ✅ `player_reception_yds` (not `player_rec_yds` or `player_receiving_yards`)
   - ✅ `player_1st_td` (not `player_first_td`)
   - ✅ `player_last_td`
   - ✅ `player_tackles_assists`

4. **Improved processing logic**:
   ```javascript
   // Process bookmakers → markets → outcomes for each event
   for (const bookmaker of eventOdds.bookmakers) {
     for (const market of bookmaker.markets) {
       for (const outcome of market.outcomes) {
         const playerName = outcome.description;
         const line = outcome.point;
         // Store prop...
       }
     }
   }
   ```

## Expected Results

After this deploy, you should see in the logs:

```
Found 29 upcoming NFL games
  Event abc123 (KC @ BUF): 127 props
  Event def456 (SF @ TB): 134 props
  Event ghi789 (DAL @ PHI): 119 props
  ...

Props Summary for Week 10:
  - API calls: 29/29 successful events
  - Total props found: 3,500+
  - Total players with props: 200+
  - Cached props for future requests
```

Instead of:

```
Failed to fetch player_pass_yds: 422 - "Markets not supported by this endpoint"
Props Summary: 0/19 successful, 0 players
```

## API Call Efficiency

**Before**: 
- 19 API calls (one per market)
- All failed with 422

**After**:
- ~29 API calls (one per upcoming game)
- Can fetch multiple markets in one call per game
- Much more efficient!

## Market Coverage

Using correct market names from [TheOddsAPI docs](https://the-odds-api.com/liveapi/guides/v4/#player-props-api-markets):

✅ **Passing**:
- `player_pass_yds` - Pass Yards
- `player_pass_tds` - Pass Touchdowns
- `player_pass_completions` - Completions
- `player_pass_attempts` - Attempts
- `player_pass_interceptions` - Interceptions

✅ **Rushing**:
- `player_rush_yds` - Rush Yards
- `player_rush_tds` - Rush Touchdowns
- `player_rush_attempts` - Rush Attempts

✅ **Receiving**:
- `player_reception_yds` - Reception Yards (note: NOT player_rec_yds)
- `player_receptions` - Receptions
- `player_reception_tds` - Reception Touchdowns

✅ **Touchdown Scorers**:
- `player_anytime_td` - Anytime TD (Yes/No)
- `player_1st_td` - First TD (Yes/No)
- `player_last_td` - Last TD (Yes/No)

✅ **Defense/ST**:
- `player_tackles_assists` - Tackles + Assists
- `player_sacks` - Sacks
- `player_kicking_points` - Kicker Points

## Testing

Once deployed, test by:

1. Go to: https://bgroundrobin.com/fantasy-sitstart
2. Click "Analyze My Lineup"
3. Check function logs in Netlify
4. Should see props being fetched successfully
5. Player projections should use actual prop lines instead of baselines

## Cost Estimate

With premium subscription:
- ~29 events per week
- 1 API call per event
- **29 API calls** per week for props (vs 19 failed calls before)
- Plus ~1 call for game lines
- **Total: ~30 API calls per request**

If you run sit/start analyzer once per day:
- 30 calls/day × 7 days = 210 calls/week
- Well within premium limits (usually 1,000+/day)

## Files Changed

- `netlify/functions/_lib/ff-odds.mjs`:
  - Changed `getPlayerProps()` to use `/events/{eventId}/odds` endpoint
  - Added event fetching step
  - Updated market names to match API docs
  - Improved prop processing logic
  - Better logging per event

## References

- [TheOddsAPI v4 Guide](https://the-odds-api.com/liveapi/guides/v4/)
- [Player Props API Markets](https://the-odds-api.com/liveapi/guides/v4/#player-props-api-markets)
- [NFL Player Props List](https://the-odds-api.com/liveapi/guides/v4/#nfl-ncaaf-cfl-player-props-api)

---

## Summary

✅ **Fixed**: Using correct `/events/{eventId}/odds` endpoint  
✅ **Fixed**: Correct market names per API documentation  
✅ **Fixed**: Per-event API calls instead of per-market  
🎯 **Result**: Player props should now work with premium subscription!

Wait for Netlify deploy to complete, then test the sit/start analyzer!

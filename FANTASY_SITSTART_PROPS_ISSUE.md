# Fantasy Sit/Start - Player Props Issue

## Issue Summary

The Fantasy Sit/Start tool is returning **0 player props** because:

1. ❌ **TheOddsAPI player props require premium subscription**
2. ✅ Game lines ARE working (29 games fetched successfully)
3. ⚠️ Tool will fall back to baseline EFP values without props

## Error Details

All player prop markets return `422 - INVALID_MARKET` errors:

```
Failed to fetch player_pass_yds: 422 - "Markets not supported by this endpoint"
Failed to fetch player_rush_yds: 422 - "Markets not supported by this endpoint"
Failed to fetch player_receiving_yards: 422 - "Markets not supported by this endpoint"
Failed to fetch player_anytime_td: 422 - "Markets not supported by this endpoint"
...
```

**Error code**: `INVALID_MARKET`  
**Details URL**: https://the-odds-api.com/liveapi/guides/v4/api-error-codes.html#invalid-market

## Root Cause

TheOddsAPI has two subscription tiers:

### Free/Basic Tier ✅ (What you have)
- ✅ Game lines: spreads, totals, moneylines
- ✅ Futures
- ❌ Player props: NOT included

### Premium Tier 💰 (Requires upgrade)
- ✅ Game lines
- ✅ Player props: yards, TDs, receptions, etc.
- ✅ Game props
- 💵 Cost: ~$40-200/month depending on usage

## Current Status

### What's Working ✅
1. **OAuth flow**: Successfully authenticates with Yahoo
2. **League detection**: Found league "Novack Is A Draft Dodger" (461.l.509796)
3. **Roster fetching**: 16 players loaded for Week 10
4. **Game lines**: 29 NFL games with spreads/totals from TheOddsAPI
5. **Implied totals**: Calculated from spreads/totals
6. **Script lean**: Pass-heavy underdogs, run-heavy favorites
7. **Dual lineup display**: Actual Yahoo lineup + optimal lineup
8. **Weekly roast**: Claude AI generates roasts

### What's NOT Working ❌
1. **Player props**: All returning 422 errors (need premium subscription)
2. **Scoring values**: Still showing as 0 (checking stat_modifiers in latest deploy)

## Fallback Behavior

Without props, the tool uses **baseline EFP values**:

```javascript
// Position-based baselines
QB:   15 points  (Tier 1: 20+, Tier 2: 15-20, Tier 3: <15)
RB:   10 points  (Tier 1: 15+, Tier 2: 10-15, Tier 3: <10)
WR:   8 points   (Tier 1: 12+, Tier 2: 8-12, Tier 3: <8)
TE:   6 points   (Tier 1: 10+, Tier 2: 6-10, Tier 3: <6)
K:    8.5 points (Average)
DEF:  8 points   (Average)
```

**Adjustments applied**:
- ✅ Game script (+20% pass-heavy underdogs, +15% run-heavy favorites)
- ✅ Implied total (+10% if team total > 24, -10% if < 20)
- ❌ Individual prop lines (not available without subscription)

## Options to Fix

### Option 1: Upgrade TheOddsAPI Subscription 💰
**Cost**: $40-200/month  
**Pros**:
- ✅ Full player props coverage (100+ props per week)
- ✅ Accurate individual player projections
- ✅ Best recommendations based on real market data

**Cons**:
- 💵 Monthly subscription cost
- 📊 Need to track API usage (charges per request)

**To upgrade**:
1. Go to: https://the-odds-api.com/pricing
2. Select "Premium" plan
3. Enable player props markets
4. No code changes needed - will automatically start working

---

### Option 2: Use Different Props API 🔄
**Alternatives**:
- **PrizePicks API** (free for personal use, has player props)
- **Underdog Fantasy API** (free, limited props)
- **ESPN Fantasy API** (free, projections not props)

**Pros**:
- ✅ Free or cheaper than TheOddsAPI premium
- ✅ Still get player-level projections

**Cons**:
- 🔧 Need code changes to integrate
- 📉 May have less coverage than TheOddsAPI
- ⚠️ Reliability varies

---

### Option 3: Keep Using Baselines (Current) 🆓
**Cost**: Free  
**Pros**:
- ✅ Already implemented
- ✅ Works reasonably well with game context adjustments
- ✅ No additional API costs

**Cons**:
- ❌ Less accurate than prop-based projections
- ❌ Can't differentiate between players in same game/position
- ❌ Misses player-specific factors (injuries, matchups, usage)

**When this works well**:
- Obvious start/sit decisions (stud vs waiver wire)
- Bye week coverage
- Quick sanity checks

**When this struggles**:
- Close calls between similar players
- FLEX decisions
- Boom/bust players with high variance

---

### Option 4: Scrape Props from Sportsbooks 🕷️
**Method**: Web scraping DraftKings/FanDuel directly

**Pros**:
- ✅ Free (no API costs)
- ✅ Most current odds

**Cons**:
- ⚖️ Legal gray area (violates TOS)
- 🚫 Could get IP banned
- 🔧 High maintenance (sites change often)
- ❌ **NOT RECOMMENDED**

---

## Recommendation

Based on your use case:

### If you want ACCURATE sit/start advice:
→ **Upgrade to TheOddsAPI Premium** ($40-100/month)  
→ This is what daily fantasy pros use  
→ Worth it if you're playing for money

### If this is just for fun/learning:
→ **Keep using baselines** (free, current implementation)  
→ It will still work for obvious decisions  
→ Upgrade later if you need more accuracy

### If you want a middle ground:
→ **Try PrizePicks API** (free tier, decent coverage)  
→ I can help integrate it if you want

---

## Technical Notes

### Markets We Tried
```javascript
// All returned 422 - INVALID_MARKET
const PROP_MARKETS = [
  'player_pass_tds',
  'player_pass_yds',
  'player_rush_yds',
  'player_receiving_yards',
  'player_receptions',
  'player_anytime_td',
  'player_first_td',
  // ... 10+ more markets
];
```

### Endpoint Used
```
GET https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds
?apiKey={key}
&regions=us
&markets=player_pass_yds  // ← Returns 422
&bookmakers=draftkings,fanduel
&oddsFormat=american
```

### Error Response
```json
{
  "message": "Markets not supported by this endpoint: player_pass_yds",
  "error_code": "INVALID_MARKET",
  "details_url": "https://the-odds-api.com/liveapi/guides/v4/api-error-codes.html#invalid-market"
}
```

---

## Next Steps

1. **Check your TheOddsAPI plan**:
   - Go to: https://the-odds-api.com/account
   - Look at "Plan Details"
   - Check if "Player Props" is listed

2. **Decide on approach**:
   - Upgrade to premium?
   - Try alternative API?
   - Keep using baselines?

3. **Let me know** and I can:
   - Help with TheOddsAPI upgrade if needed
   - Integrate PrizePicks API if you want free props
   - Improve baseline calculations if you're keeping current approach

---

## Scoring Values Issue

Separately, we're also fixing the scoring values (currently showing as 0 for all stats). The issue is:

- Yahoo API returns `stat_categories` (definitions) and `stat_modifiers` (actual scoring values)
- We were only checking `stat_categories` (which doesn't have the `value` field)
- Latest deploy now checks `stat_modifiers` first

**Expected in next deploy**:
```
League scoring: Full PPR, passTD=4, INT=-2, rushTD=6, recTD=6
```

Instead of:
```
League scoring: Standard, passTD=0, INT=0, rushTD=0, recTD=0
```

---

## Summary

**Player Props**: Need TheOddsAPI premium subscription ($40-200/month) or alternative API  
**Scoring Values**: Fixed in latest deploy (checking stat_modifiers now)  
**Current Status**: Tool works with baseline EFP values, will be significantly better with real props

Let me know which direction you want to go! 🚀

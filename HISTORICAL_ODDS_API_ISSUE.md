# CRITICAL: Historical Odds API Not Implemented

## Discovery

The `fetch-historical-odds.mjs` script is **NOT actually calling TheOddsAPI**. It creates placeholder data with `oddsAvailable: false` and empty `marketLines: []` arrays.

### Lines 323-329 (the smoking gun):
```javascript
// For now, save the game data with placeholder for odds
gamesOnDate.forEach(game => {
  results.push({
    date: game.gameDate,
    playerId: game.playerId,
    playerName: game.playerName,
    actualShots: game.shots,
    oddsAvailable: false, // ⚠️ Will be true when API integrated  
    marketLines: []       // ⚠️ Will contain bookmaker odds when fetched
  });
});
```

## What Needs to Happen

### According to TheOddsAPI Documentation

**Correct Endpoint:**
```
GET /v4/historical/sports/icehockey_nhl/odds
```

**Required Parameters:**
- `apiKey`: Your API key
- `date`: ISO8601 timestamp (e.g., `2021-11-13T12:00:00Z`)
- `regions`: `us` (or others)
- `markets`: Need to verify if `player_shots_on_goal` is valid
- `oddsFormat`: `american` or `decimal`

**Response Structure:**
```json
{
  "timestamp": "2021-11-13T12:00:00Z",
  "previous_timestamp": "2021-11-13T11:50:00Z",
  "next_timestamp": "2021-11-13T12:10:00Z",
  "data": [
    {
      "id": "event_id",
      "sport_key": "icehockey_nhl",
      "commence_time": "2021-11-13T23:00:00Z",
      "home_team": "Team A",
      "away_team": "Team B",
      "bookmakers": [
        {
          "key": "fanduel",
          "title": "FanDuel",
          "markets": [
            {
              "key": "player_shots_on_goal",
              "outcomes": [
                {
                  "name": "Over",
                  "description": "Connor McDavid",
                  "price": -110,
                  "point": 3.5
                },
                {
                  "name": "Under",
                  "description": "Connor McDavid", 
                  "price": -110,
                  "point": 3.5
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Cost:**
- 10 credits per region per market per date
- For Phase 1 (16 dates): 16 dates × 1 region × 1 market × 10 = **160 credits**
- For full dataset (728 dates): 728 × 10 = **7,280 credits** (not 36k-72k as estimated)

## CRITICAL ISSUE: Player Props May Not Be Available

**From TheOddsAPI docs:**
> Historical data for additional markets (player props, alternate lines, period markets) are available after **2023-05-03T05:30:00Z**.

**Your data range:** 2021-10-12 to 2025-04-17

**Impact:**
- Only ~2 years of data (May 2023 - April 2025) have player props
- Dates before May 3, 2023 will return EMPTY or only h2h/spreads/totals
- This is ~27% of your dataset (2 of 4 seasons)

## Options Forward

### Option 1: Implement API for Recent Data Only (RECOMMENDED)
**What:**
- Filter to dates >= 2023-05-03
- Implement actual TheOddsAPI historical endpoint
- Test with 5-10 dates first to verify player props exist

**Cost:**
- Recent data only: ~200 dates × 10 = 2,000 credits
- Phase 1 sample (recent dates): ~8 dates × 10 = 80 credits

**Timeline:**
- 1-2 hours to implement correct endpoint
- 30 minutes to test and validate
- 10-20 minutes to fetch Phase 1 sample

**Pros:**
- Real validation with actual bookmaker odds
- Affordable (2% of credit budget)
- Recent data most relevant for current deployment

**Cons:**
- Only validates on 2 seasons of data
- Loses historical depth

### Option 2: Check for Team Market Instead
**What:**
- Instead of player props, fetch team totals (always available)
- Calculate implied player shots from team totals
- Less precise but validates model profitability concept

**Cost:**
- Full dataset: 728 dates × 10 = 7,280 credits (8%)
- Phase 1: 16 dates × 10 = 160 credits (0.2%)

**Pros:**
- Works for all historical dates
- Still validates profitability concept
- Cheaper than expected

**Cons:**
- Team totals ≠ player props (different market)
- Can't validate exact player prop odds

### Option 3: Purchase Historical Data Package
**What:**
- Contact TheOddsAPI: support@the-odds-api.com
- Request bulk historical player props data
- Usually sold as season packages (CSV/JSON)

**Cost:**
- Unknown (likely $50-500 per season)
- No API credits consumed

**Pros:**
- Complete historical coverage
- All dates, all markets
- One-time purchase

**Cons:**
- Upfront cost
- Delivery time (1-7 days)
- May not have player props for pre-2023 dates anyway

### Option 4: Live Testing Instead
**What:**
- Deploy with minimal stakes ($10-50)
- Collect real performance data over 1-2 weeks
- Use actual live odds + outcomes

**Cost:**
- $10-50 risk capital
- No API credits needed

**Pros:**
- Real-world validation
- No historical data purchase needed
- Instant feedback on current market

**Cons:**
- Slower (need 1-2 weeks of data)
- Risk of losses during testing
- Market conditions may differ

## Immediate Next Steps

1. **Verify market availability** (5 minutes):
   ```bash
   # Check if player_shots_on_goal exists for NHL
   curl "https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?\
   apiKey=YOUR_KEY&regions=us&markets=player_shots_on_goal"
   ```

2. **Test historical endpoint** (5 minutes):
   ```bash
   # Try a recent date (after May 2023)
   curl "https://api.the-odds-api.com/v4/historical/sports/icehockey_nhl/odds?\
   apiKey=YOUR_KEY&date=2024-01-15T12:00:00Z&regions=us&markets=player_shots_on_goal"
   ```

3. **Try an old date** (5 minutes):
   ```bash
   # Try pre-2023 date to confirm player props don't exist
   curl "https://api.the-odds-api.com/v4/historical/sports/icehockey_nhl/odds?\
   apiKey=YOUR_KEY&date=2021-11-13T12:00:00Z&regions=us&markets=player_shots_on_goal"
   ```

## Recommendation

**Go with Option 1: Implement for Recent Data Only**

**Rationale:**
1. Model is currently weak (MAE 1.17) - don't need 4 years of validation
2. Recent 2 seasons (2023-2025) = 200 dates = 2,000 credits (2% budget)
3. Can implement and test in ~2 hours
4. Recent market conditions most relevant for deployment
5. If profitable on recent data, can consider purchasing full historical package

**Action Plan:**
1. Test API with curl commands (verify player props exist)
2. Update fetch script to use correct endpoint
3. Filter to dates >= 2023-05-03
4. Generate Phase 1 sample (8-10 recent dates)
5. Execute fetch (80-100 credits)
6. Run market-backtest.mjs with real odds
7. Make deploy/no-deploy decision based on ROI

**Estimated Total Time:** 2-3 hours
**Estimated Total Cost:** 80-100 credits (0.1% of budget)

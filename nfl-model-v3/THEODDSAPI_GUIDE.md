# TheOddsAPI Historical Endpoint - Usage Guide

## Correct Endpoint for Backtesting

### ✅ Historical Odds Endpoint (What We Use)
```
GET https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds
```

**Parameters:**
- `apiKey` - Your API key
- `regions=us` - US bookmakers
- `markets=spreads,totals,h2h` - All betting markets
- `oddsFormat=american` - American odds format (-110, +150, etc.)
- `date=2021-10-18T12:00:00Z` - **ISO 8601 timestamp** (required!)

**Cost**: 10 credits per region per market = 30 credits per request

### ❌ Regular Odds Endpoint (NOT for Backtesting)
```
GET https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds
```
This gives **current/live** odds only - useless for historical backtesting!

## Example Request

```bash
curl "https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds?regions=us&markets=spreads,totals,h2h&oddsFormat=american&apiKey=YOUR_KEY&date=2024-09-10T23:00:00Z"
```

## Response Structure

```json
{
  "timestamp": "2024-09-10T22:55:00Z",
  "previous_timestamp": "2024-09-10T22:45:00Z",
  "next_timestamp": "2024-09-10T23:05:00Z",
  "data": [
    {
      "id": "abc123",
      "sport_key": "americanfootball_nfl",
      "sport_title": "NFL",
      "commence_time": "2024-09-11T00:15:00Z",
      "home_team": "Kansas City Chiefs",
      "away_team": "Baltimore Ravens",
      "bookmakers": [
        {
          "key": "draftkings",
          "title": "DraftKings",
          "last_update": "2024-09-10T22:48:09Z",
          "markets": [
            {
              "key": "h2h",
              "outcomes": [
                {
                  "name": "Kansas City Chiefs",
                  "price": -175
                },
                {
                  "name": "Baltimore Ravens",
                  "price": +145
                }
              ]
            },
            {
              "key": "spreads",
              "outcomes": [
                {
                  "name": "Kansas City Chiefs",
                  "price": -110,
                  "point": -3.5
                },
                {
                  "name": "Baltimore Ravens",
                  "price": -110,
                  "point": 3.5
                }
              ]
            },
            {
              "key": "totals",
              "outcomes": [
                {
                  "name": "Over",
                  "price": -110,
                  "point": 46.5
                },
                {
                  "name": "Under",
                  "price": -110,
                  "point": 46.5
                }
              ]
            }
          ]
        },
        {
          "key": "fanduel",
          "title": "FanDuel",
          "markets": [ /* ... */ ]
        }
      ]
    }
  ]
}
```

## Key Differences from Live Endpoint

| Feature | Live Endpoint | Historical Endpoint |
|---------|--------------|---------------------|
| **URL Path** | `/v4/sports/.../odds` | `/v4/historical/sports/.../odds` |
| **Date Parameter** | Optional | **Required** |
| **Response** | Array of games | **Wrapped in snapshot** |
| **Timestamp** | Current time | Requested snapshot time |
| **Cost** | 1 credit | 10 credits per region/market |
| **Use Case** | Live betting | Backtesting |

## Important Notes

### 1. Date Parameter Format
Must be ISO 8601 with timezone:
- ✅ `2024-09-10T23:00:00Z`
- ❌ `2024-09-10` (missing time)
- ❌ `09/10/2024` (wrong format)

### 2. Snapshot Timing
API returns **closest snapshot ≤ requested date**:
- Request: `2024-09-10T23:00:00Z`
- Returns: `2024-09-10T22:55:00Z` (closest before)

### 3. Closing Lines Strategy
For best closing lines, request Tuesday morning after week:
```javascript
// Week ends Monday night
// Request Tuesday 11am ET = 3pm UTC
const closingDate = '2024-09-17T15:00:00Z';
```

### 4. Navigation
Use `previous_timestamp` and `next_timestamp` to move through snapshots:
```javascript
// Get earlier snapshot
const prevDate = snapshot.previous_timestamp;
await fetchHistoricalOdds(prevDate);

// Get later snapshot  
const nextDate = snapshot.next_timestamp;
await fetchHistoricalOdds(nextDate);
```

### 5. Preseason Filtering
Historical data includes preseason - filter it out:
```javascript
if (event.sport_title?.includes('Preseason')) {
  continue; // Skip
}
```

### 6. Data Availability
- **Start date**: 2020-06-06T10:05:00Z
- **End date**: Present day
- **Coverage**: All NFL games (including preseason, we filter)

## Testing Your API Key

```bash
# Test with a known good date
curl "https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds?apiKey=YOUR_KEY&regions=us&markets=h2h&date=2024-09-10T23:00:00Z"
```

**Expected**: JSON response with games  
**Cost**: 10 credits (1 region × 1 market)

## Credit Monitoring

Every response includes headers:
```
x-requests-remaining: 4700
x-requests-used: 300
```

Script automatically logs these:
```
📡 Fetching historical snapshot for 2024-09-10T23:00:00Z...
   API Credits: 300 used, 4700 remaining
   Snapshot timestamp: 2024-09-10T22:55:00Z
   Games in snapshot: 14
   💰 Cost: 30 credits (historical snapshot)
```

## Error Handling

### 401 Unauthorized
```json
{"message": "Invalid API key"}
```
**Fix**: Check `ODDS_API_KEY` in `.env`

### 422 Unprocessable Entity
```json
{"message": "Invalid date format"}
```
**Fix**: Use ISO 8601 format with timezone

### 429 Too Many Requests
```json
{"message": "Rate limit exceeded"}
```
**Fix**: Add delays between requests (we do 2 seconds)

### 500 Server Error
```json
{"message": "Internal server error"}
```
**Fix**: Retry after a few minutes

## Rate Limiting

- **Limit**: Varies by plan
- **Our strategy**: 2 second delay between requests
- **Total time**: 90 weeks × 2 sec = ~3 minutes API time

## Implementation in Our Script

```javascript
// From 01-fetch-historical-odds.mjs

async function fetchHistoricalOdds(date) {
  const url = `${BASE_URL}/historical/sports/americanfootball_nfl/odds`;
  const timestamp = `${date}T23:00:00Z`; // Tuesday 11pm UTC
  
  const params = new URLSearchParams({
    apiKey: API_KEY,
    regions: 'us',
    markets: 'spreads,totals,h2h',
    oddsFormat: 'american',
    date: timestamp  // ← Required for historical!
  });

  const response = await fetch(`${url}?${params}`);
  const snapshot = await response.json();
  
  return snapshot; // Contains timestamp, data, prev/next
}
```

## Resources

- **API Docs**: https://the-odds-api.com/liveapi/guides/v4/
- **Historical Docs**: https://the-odds-api.com/historical-odds-data
- **Pricing**: https://the-odds-api.com/pricing
- **Dashboard**: https://the-odds-api.com/account
- **Support**: contact@the-odds-api.com

---

**Bottom Line**: Historical endpoint is different from live endpoint. We're using it correctly now! ✅

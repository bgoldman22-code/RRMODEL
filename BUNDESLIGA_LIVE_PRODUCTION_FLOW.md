# Bundesliga BTTS Live Production Flow

## Overview
The live model fetches real-time odds from **The Odds API**, runs predictions through the trained ensemble model, and returns betting recommendations via Netlify serverless function.

## Architecture Flow

```
┌─────────────────┐
│  User Request   │
│  (Frontend/API) │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Netlify Function                     │
│  bundesliga-btts-predict.mjs         │
│  /.netlify/functions/                │
└────────┬─────────────────────────────┘
         │
         ├─► Fetch Live Odds
         │   ┌────────────────────────┐
         │   │  The Odds API          │
         │   │  ODDS_API_KEY (env)    │
         │   │  /soccer_germany_      │
         │   │   bundesliga/odds      │
         │   └────────────────────────┘
         │
         ├─► Run Prediction Model
         │   ┌────────────────────────┐
         │   │  Python Script         │
         │   │  predict_live_         │
         │   │   bundesliga.py        │
         │   │                        │
         │   │  Loads:                │
         │   │  - ensemble_model.json │
         │   │  - dixon_coles_model   │
         │   │  - xgboost_model       │
         │   │  - historical features │
         │   └────────────────────────┘
         │
         └─► Apply Betting Gates
             ┌────────────────────────┐
             │  Edge Analysis         │
             │  - Min 5% edge         │
             │  - Max 20% EV          │
             │  - Min 1.40 odds       │
             │  - Kelly staking       │
             └────────────────────────┘
                     │
                     ▼
             ┌────────────────────────┐
             │  Return JSON Response  │
             │  - Predictions         │
             │  - Recommended bets    │
             │  - Stakes              │
             │  - Confidence levels   │
             └────────────────────────┘
```

## Environment Variables Required

### Netlify Production Environment

Set these in Netlify Dashboard → Site Settings → Environment Variables:

```bash
# Required: The Odds API key for fetching live BTTS odds
ODDS_API_KEY=your_odds_api_key_here

# Optional: Python path if using custom Python installation
PYTHON_PATH=/opt/buildhome/.pyenv/shims/python3

# Optional: For alternative data sources
API_FOOTBALL_KEY=your_api_football_key_here
```

### Local Development

Create `.env` file in project root:

```bash
# .env
ODDS_API_KEY=your_test_api_key
API_FOOTBALL_KEY=your_api_football_key
```

Then use `netlify dev` to test locally:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Run local dev server (loads .env automatically)
netlify dev

# Test the function
curl -X POST http://localhost:8888/.netlify/functions/bundesliga-btts-predict \
  -H "Content-Type: application/json" \
  -d '{"auto_fetch": true}'
```

## API Endpoints

### Option 1: Auto-Fetch Mode (Recommended for Production)

The function fetches live fixtures and odds automatically:

**Endpoint**: `POST /.netlify/functions/bundesliga-btts-predict`

**Request**:
```json
{
  "auto_fetch": true
}
```

**Response**:
```json
{
  "model": "Bundesliga BTTS Ensemble v1.0",
  "generated_at": "2025-12-01T15:30:00.000Z",
  "validation_roi": 0.212,
  "hit_rate": 0.806,
  "total_predictions": 5,
  "recommended_bets": 2,
  "predictions": [
    {
      "home_team": "Bayern München",
      "away_team": "Borussia Dortmund",
      "model_probability": 0.72,
      "dixon_coles_prob": 0.68,
      "xgboost_prob": 0.74,
      "expected_home_goals": 2.1,
      "expected_away_goals": 1.8,
      "market_odds": {
        "btts_yes": 1.65,
        "btts_no": 2.20
      },
      "market_probability": 0.571,
      "edge": 0.149,
      "bet_decision": {
        "should_bet": true,
        "recommended_stake_pct": 2.5,
        "confidence": "HIGH"
      }
    }
  ],
  "bets": [
    // Filtered list of recommended bets only
  ]
}
```

### Option 2: Manual Fixtures Mode

You provide specific fixtures:

**Request**:
```json
{
  "fixtures": [
    {
      "home_team": "Bayern München",
      "away_team": "Borussia Dortmund",
      "odds": {
        "btts_yes": 1.65,
        "btts_no": 2.20
      }
    }
  ]
}
```

## The Odds API Integration

### API Details

- **Base URL**: `https://api.the-odds-api.com/v4`
- **Endpoint**: `/sports/soccer_germany_bundesliga/odds/`
- **Cost**: ~$0.01 per request (check current pricing)
- **Rate Limit**: Varies by plan

### Request Parameters

```javascript
const url = `https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/?` +
  `apiKey=${ODDS_API_KEY}&` +
  `regions=eu&` +              // European bookmakers
  `markets=btts&` +            // Both Teams To Score market
  `oddsFormat=decimal&` +      // 1.65 format
  `dateFormat=iso`;            // ISO timestamps
```

### Response Format

```json
[
  {
    "id": "abc123",
    "sport_key": "soccer_germany_bundesliga",
    "commence_time": "2025-12-05T19:30:00Z",
    "home_team": "Bayern Munich",
    "away_team": "Borussia Dortmund",
    "bookmakers": [
      {
        "key": "bet365",
        "title": "Bet365",
        "markets": [
          {
            "key": "btts",
            "outcomes": [
              {
                "name": "Yes",
                "price": 1.65
              },
              {
                "name": "No",
                "price": 2.20
              }
            ]
          }
        ]
      }
    ]
  }
]
```

## Deployment Steps

### 1. Set Environment Variables

**In Netlify Dashboard:**
```
Site Settings → Environment Variables → Add Variable

Name: ODDS_API_KEY
Value: your_actual_api_key
Scope: All deploy contexts (or Production only)
```

### 2. Deploy to Netlify

```bash
# Option A: Push to GitHub (auto-deploy)
git add netlify/functions/bundesliga-btts-predict.mjs
git add scripts/soccer/predict_live_bundesliga.py
git add data/bundesliga/*.json
git commit -m "Add Bundesliga BTTS live prediction system"
git push origin main

# Option B: Manual deploy
netlify deploy --prod
```

### 3. Verify Deployment

```bash
# Test the live function
curl -X POST https://your-site.netlify.app/.netlify/functions/bundesliga-btts-predict \
  -H "Content-Type: application/json" \
  -d '{"auto_fetch": true}'
```

### 4. Monitor API Usage

The Odds API tracks usage. Monitor your quota:

```bash
curl "https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=btts" \
  -I | grep "x-requests-remaining"
```

## Production Considerations

### 1. Caching Strategy

To reduce API costs, cache predictions:

```javascript
// In Netlify function
const CACHE_DURATION = 3600; // 1 hour

export const handler = async (event, context) => {
  // Add cache headers
  const headers = {
    'Cache-Control': `public, max-age=${CACHE_DURATION}, s-maxage=${CACHE_DURATION}`,
    // ... other headers
  };
  
  // Implementation...
};
```

### 2. Request Limits

Implement rate limiting:

```javascript
// Check if too many requests in short time
const MAX_REQUESTS_PER_MINUTE = 10;

// Use Netlify environment or external Redis
// to track request counts per IP
```

### 3. Error Handling

Fallback if API fails:

```javascript
try {
  fixtures = await fetchFromOddsAPI();
} catch (error) {
  console.error('Odds API failed:', error);
  // Option 1: Return cached predictions
  // Option 2: Use fallback API (API-Football)
  // Option 3: Return error with retry-after header
}
```

### 4. Cost Optimization

**Current API Costs** (as of Dec 2025):
- The Odds API: ~$0.01 per request
- API-Football: ~$0.005 per request

**Optimization strategies:**
1. **Batch predictions**: Fetch all fixtures once, predict for all
2. **Cache aggressively**: Predictions valid for 1-6 hours before match
3. **Schedule updates**: Use cron job to pre-fetch at specific times
4. **Filter fixtures**: Only fetch matches starting within 48 hours

Example cron setup:

```bash
# Netlify scheduled function
# netlify.toml
[[functions]]
  schedule = "0 */6 * * *"  # Every 6 hours
  name = "bundesliga-btts-update"
```

## Testing Checklist

- [ ] Environment variable set in Netlify
- [ ] Function deploys successfully
- [ ] Python dependencies installed (requirements.txt)
- [ ] Model files present in data/bundesliga/
- [ ] Test with `auto_fetch: true` returns predictions
- [ ] Test with manual fixtures works
- [ ] Betting gates filter correctly (5% edge minimum)
- [ ] Stakes calculated properly (Kelly criterion)
- [ ] Response time < 5 seconds
- [ ] Handles API failures gracefully
- [ ] Monitor API quota not exceeded

## Alternative: Scheduled Updates

Instead of on-demand API calls, pre-fetch predictions:

```javascript
// netlify/functions/scheduled-bundesliga-update.mjs
export const handler = async () => {
  // Fetch fixtures
  const fixtures = await fetchFromOddsAPI();
  
  // Generate predictions
  const predictions = await runPredictionModel(fixtures);
  
  // Save to database or file
  await savePredictions(predictions);
  
  return { statusCode: 200 };
};
```

Then serve cached predictions:

```javascript
// netlify/functions/get-bundesliga-predictions.mjs
export const handler = async () => {
  // Read from cache/database
  const predictions = await loadCachedPredictions();
  
  return {
    statusCode: 200,
    body: JSON.stringify(predictions)
  };
};
```

## Summary

**Yes, the live model uses `ODDS_API_KEY` to:**

1. ✅ Fetch real-time Bundesliga fixtures
2. ✅ Get current BTTS odds from multiple bookmakers
3. ✅ Calculate market probability
4. ✅ Determine edge and betting opportunities
5. ✅ Apply filtering gates (5% edge, max EV, min odds)
6. ✅ Return actionable betting recommendations

**Without the API key**: The system falls back to manual fixture input or sample data (development mode only).

**Best practice**: Set `ODDS_API_KEY` in Netlify environment variables for production, use `.env` file for local testing.

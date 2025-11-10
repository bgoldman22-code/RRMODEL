# NBA Tracking System Documentation

## Overview
Complete automated tracking system for NBA game predictions and player props. Predictions are saved daily, verified automatically at 6 AM ET, and aggregated into historical performance metrics.

## Architecture

### Storage Structure (Netlify Blobs)
```
Store: nba-tracking

Predictions (saved when generated):
- games-predictions:YYYY-MM-DD     → Array of game predictions
- props-predictions:YYYY-MM-DD     → Array of prop predictions

Results (saved after verification):
- games-results:YYYY-MM-DD         → Predictions with actual results
- props-results:YYYY-MM-DD         → Props with hit/miss outcomes

Aggregated Stats:
- games-stats-summary              → Overall + by-date game performance
- props-stats-summary              → Overall + by-date props performance
```

### Components

#### 1. Prediction Saving
**File**: `netlify/functions/nba-tracking-save-predictions.mjs`

**Functions**:
- `saveGamePredictions(predictions, date)` - Save game predictions
- `savePropPredictions(predictions, date)` - Save prop predictions

**Auto-called by**:
- `nba-predictions-elite-v2` - When game predictions generated
- `generate-daily-predictions.mjs` - When player props generated

**Data Structure - Games**:
```javascript
{
  savedAt: "2025-11-10T12:00:00.000Z",
  gameDate: "2025-11-10",
  gameId: "401810053",
  gameTime: "7:00 PM ET",
  homeTeam: "Lakers",
  awayTeam: "Warriors",
  predictedWinner: "Lakers",
  predictedMargin: 5.2,
  confidence: 0.67,
  homeOdds: -180,
  awayOdds: +155,
  spread: -4.5,
  total: 225.5,
  model: "Elite Ensemble V2",
  recommendationTier: "STRONG",
  result: null,          // Filled by verifier
  verified: false
}
```

**Data Structure - Props**:
```javascript
{
  savedAt: "2025-11-10T12:00:00.000Z",
  gameDate: "2025-11-10",
  player: "LeBron James",
  team: "Lakers",
  opponent: "Warriors",
  propType: "rebounds",
  prediction: 8.5,
  vegasLine: 7.5,
  betSide: "OVER",
  vegasOdds: -110,
  edge: 12.3,
  confidence: 85,
  kellyFraction: 15.2,
  bookmaker: "fanduel",
  gameTime: "7:00 PM ET",
  model: "Baseline v2",
  actualStat: null,      // Filled by verifier
  result: null,          // 'HIT' or 'MISS'
  verified: false,
  dnp: false
}
```

#### 2. Results Verification

**Files**:
- `netlify/functions/nba-tracking-verify-games.mjs`
- `netlify/functions/nba-tracking-verify-props.mjs`

**Schedule**: Daily at 6 AM ET (11:00 UTC) via `netlify.toml`

**Process - Games**:
1. Fetch yesterday's date
2. Load predictions from `games-predictions:YYYY-MM-DD`
3. Fetch game results from ESPN API
4. Match predictions to games (by team names)
5. Grade each prediction:
   - Was predicted winner correct?
   - How accurate was margin prediction?
6. Save results to `games-results:YYYY-MM-DD`
7. Update `games-stats-summary` with daily stats

**Process - Props**:
1. Fetch yesterday's date
2. Load predictions from `props-predictions:YYYY-MM-DD`
3. Fetch all game IDs from ESPN scoreboard
4. Fetch box scores for each game
5. Find player stats (rebounds index 4, assists index 3)
6. Grade each prop:
   - OVER: actual > line = HIT
   - UNDER: actual < line = HIT
7. Save results to `props-results:YYYY-MM-DD`
8. Update `props-stats-summary` with daily stats

**Handles**:
- DNP (Did Not Play) cases
- Name mismatches
- Missing box scores
- Multiple games on same date

#### 3. Stats Aggregation

**File**: `netlify/functions/nba-tracking-stats.mjs`

**Endpoints**:
```
GET /.netlify/functions/nba-tracking-stats?action=summary
→ Both games and props overall stats

GET /.netlify/functions/nba-tracking-stats?action=games
→ Game predictions stats only

GET /.netlify/functions/nba-tracking-stats?action=props
→ Player props stats only

GET /.netlify/functions/nba-tracking-stats?action=date&date=2025-11-09
→ Specific date results (games and/or props)

GET /.netlify/functions/nba-tracking-stats?action=dates
→ List all tracked dates
```

**Response Example**:
```javascript
{
  "games": {
    "overall": {
      "total": 127,
      "correct": 74,
      "incorrect": 53,
      "winRate": "58.3",
      "lastUpdated": "2025-11-10T11:00:00.000Z"
    },
    "last7Days": {
      "total": 42,
      "correct": 26,
      "winRate": "61.9"
    },
    "datesTracked": 15
  },
  "props": {
    "overall": {
      "total": 312,
      "hits": 189,
      "misses": 123,
      "dnp": 15,
      "winRate": "60.6",
      "rebounds": {
        "total": 180,
        "hits": 105,
        "winRate": "58.3"
      },
      "assists": {
        "total": 132,
        "hits": 84,
        "winRate": "63.6"
      }
    },
    "last7Days": {
      "total": 98,
      "hits": 63,
      "winRate": "64.3",
      "rebounds": { ... },
      "assists": { ... }
    },
    "datesTracked": 14
  }
}
```

## Usage

### Access Historical Stats (Query Anytime)

```bash
# Get overall summary
curl https://bgroundrobin.com/.netlify/functions/nba-tracking-stats?action=summary

# Get specific date results
curl https://bgroundrobin.com/.netlify/functions/nba-tracking-stats?action=date&date=2025-11-09

# List all tracked dates
curl https://bgroundrobin.com/.netlify/functions/nba-tracking-stats?action=dates
```

### Manual Verification (If Needed)

```javascript
// In Node.js script
import { verifyGamePredictions } from './netlify/functions/nba-tracking-verify-games.mjs';
import { verifyPropPredictions } from './netlify/functions/nba-tracking-verify-props.mjs';

// Verify specific date
await verifyGamePredictions('2025-11-09');
await verifyPropPredictions('2025-11-09');
```

### Manual Prediction Save (If Needed)

```javascript
import { saveGamePredictions, savePropPredictions } from './netlify/functions/nba-tracking-save-predictions.mjs';

const predictions = [...]; // Your predictions array

// Save for today
await saveGamePredictions(predictions);

// Save for specific date
await saveGamePredictions(predictions, '2025-11-09');
```

## Data Freshness

- **Predictions saved**: When generated (typically morning/afternoon)
- **Results verified**: Daily at 6 AM ET (after all games complete)
- **Stats cache**: 5 minutes (to avoid excessive Blobs reads)

## Key Features

✅ **Automatic tracking** - No manual intervention needed
✅ **Handles DNP** - Tracks players who don't play
✅ **Breakdown by type** - Separate rebounds/assists metrics
✅ **Rolling windows** - Last 7 days + overall stats
✅ **Confidence tiers** - Track high/low confidence separately
✅ **Margin accuracy** - For game predictions
✅ **ROI ready** - All data needed to calculate returns

## Performance Metrics Tracked

### Game Predictions
- Win rate (% correct)
- Margin error (average, by confidence)
- By confidence tier
- By recommendation tier (STRONG, TRACK, etc.)

### Player Props
- Hit rate overall
- Hit rate by prop type (rebounds vs assists)
- Hit rate by bet side (OVER vs UNDER)
- DNP rate (for model improvement)
- Edge accuracy (did high edge picks perform better?)

## Future Enhancements

1. **ROI Calculation** - Add actual bet sizing and returns
2. **Confidence Calibration** - Plot predicted vs actual win rates
3. **Trend Analysis** - Detect model drift over time
4. **Alert System** - Email if performance drops below threshold
5. **Frontend Dashboard** - Visualize stats in React app
6. **Export Functions** - CSV/Excel download of results

## Troubleshooting

### Predictions not saving?
- Check Netlify function logs
- Verify `@netlify/blobs` is installed
- Ensure tracking functions are deployed

### Verification not running?
- Check netlify.toml has scheduled functions
- Verify cron syntax: `0 11 * * *` (11 AM UTC = 6 AM ET)
- Check Netlify dashboard > Functions > Scheduled

### Stats look wrong?
- Query specific date: `?action=date&date=2025-11-09`
- Check if verification ran (look for `games-results:` key in Blobs)
- Manually run verification if needed

### DNP rate too high?
- Check player name matching logic in `nba-tracking-verify-props.mjs`
- ESPN box scores may use different names
- Add name normalization if needed

## Implementation Checklist

✅ Created tracking save functions
✅ Created verification functions  
✅ Created stats aggregation API
✅ Added tracking calls to prediction functions
✅ Configured scheduled jobs in netlify.toml
✅ Documented complete system

## Next Steps

1. Deploy to Netlify
2. Monitor first verification run (tomorrow 6 AM ET)
3. Query stats endpoint to verify data
4. Build frontend dashboard (optional)
5. Set up alerts for performance drops (optional)

## Code Locations

| Component | File |
|-----------|------|
| Save predictions | `netlify/functions/nba-tracking-save-predictions.mjs` |
| Verify games | `netlify/functions/nba-tracking-verify-games.mjs` |
| Verify props | `netlify/functions/nba-tracking-verify-props.mjs` |
| Stats API | `netlify/functions/nba-tracking-stats.mjs` |
| Game predictions | `netlify/functions/nba-predictions-elite-v2/index.mjs` |
| Player props | `netlify/functions/generate-daily-predictions.mjs` |
| Scheduler config | `netlify.toml` (lines 45-56) |

---

**Built**: November 10, 2025  
**Status**: Ready for deployment  
**Storage**: Netlify Blobs (`nba-tracking` store)  
**Schedule**: Daily 6 AM ET verification

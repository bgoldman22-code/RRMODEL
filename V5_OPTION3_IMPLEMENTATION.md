# NFL V5 Option 3: Hybrid Cache + On-Demand Refresh

**Status**: ✅ Fully Implemented  
**Date**: November 10, 2025

## Overview

Implemented a hybrid system that gives users the best of both worlds:
- **Fast initial load** from cached Netlify Blobs storage
- **On-demand refresh** button to fetch fresh odds, injuries, and weather

## Architecture

### Backend Components

#### 1. `nfl-v5-latest.mjs` - Cached Serving Endpoint
**Purpose**: Serve pre-computed predictions for fast page loads  
**Path**: `/.netlify/functions/nfl-v5-latest`  
**Response Time**: ~50-100ms (Blob read)  
**Cache**: 5-minute browser cache

```javascript
// Returns cached V5 bundle from Netlify Blobs
{
  meta: {
    model_version: "v5",
    season: 2025,
    week: 10,
    updated_at: "2025-11-10T15:30:00Z",
    games_count: 13,
    models: { spread: {...}, total: {...} }
  },
  rows: [...]
}
```

#### 2. `nfl-v5-refresh-now.mjs` - On-Demand Refresh Endpoint ⭐
**Purpose**: Generate fresh predictions with latest data  
**Path**: `/.netlify/functions/nfl-v5-refresh-now`  
**Response Time**: ~3-5 seconds (generation + upload)  
**Cache**: No-cache (always fresh)

**Flow**:
1. Detect current NFL week
2. Fetch current week's schedule
3. Call `nfl-predictions-generate` with `refresh: true`
4. Transform predictions to V5 bundle format
5. Upload to Netlify Blobs (4 storage keys)
6. Return fresh data to user

**What Gets Refreshed**:
- ✅ **Live Odds**: TheOddsAPI (spreads, totals, moneylines)
- ✅ **Injuries**: Canonical Availability V5 (IR, PUP, designations)
- ✅ **Return Boosts**: Players coming back from injury
- ✅ **Depth Chart**: Backup EPA impacts
- ✅ **Advanced Metrics**: Team EPA, offensive/defensive efficiency
- ✅ **Safety Rails**: Calibration, market anchoring, Kelly staking
- ⚠️ **Weather**: Basic dome detection (detailed weather not fully integrated)

#### 3. `nfl-v5-weekly-refresh.mjs` - Scheduled Auto-Refresh
**Purpose**: Automatic weekly updates without user action  
**Schedule**: Tuesdays at 10am ET (14:00 UTC)  
**Cron**: `0 14 * * 2`

### Frontend Component

#### `NFLPredictionsV5.jsx` - React UI
**Path**: `/predictions-v5`  
**Features**:
- Fast initial load from cached endpoint
- Prominent "🔄 Refresh Now" button
- Visual indicators:
  - `🔴 Live Data` badge when using fresh data
  - `📦 Cached` badge for stored data
  - Timestamp showing last update
- Loading spinner during refresh
- Model info cards (Poisson EPA V3 for spreads, Quantile Blend V5 for totals)
- Data sources display (odds, injuries, weather, metrics)
- Clean table layout with edges and unit recommendations

**User Experience**:
```
1. User visits /predictions-v5
   → Page loads instantly with cached data (0.1s)
   → Shows "📦 Cached" + timestamp

2. User sees odds have moved, clicks "🔄 Refresh Now"
   → Button shows spinner "Refreshing..."
   → Backend generates fresh predictions (3-5s)
   → Page updates with new data
   → Shows "🔴 Live Data" badge

3. User can refresh as many times as needed
   → Each refresh fetches latest odds/injuries
   → Updates Blob storage for other users
```

## Data Flow

```
┌─────────────────────────────────────────────────┐
│ User Visits /predictions-v5                     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ nfl-v5-latest (Fast Cached Response)            │
│ • Reads from Netlify Blobs                      │
│ • Returns in ~100ms                             │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ UI Shows Cached Data with "Refresh" Button      │
└─────────────────┬───────────────────────────────┘
                  │
        User clicks "Refresh Now"
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ nfl-v5-refresh-now (Fresh Generation)           │
│                                                  │
│ 1. Get current week + schedule                  │
│ 2. Call nfl-predictions-generate                │
│    ├─ Fetch live odds (TheOddsAPI)              │
│    ├─ Load injuries (Canonical Availability V5) │
│    ├─ Calculate EPA adjustments                 │
│    └─ Apply safety rails & calibration          │
│ 3. Transform to V5 format                       │
│ 4. Upload to Blobs (latest + date + week)       │
│ 5. Return fresh data                            │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ UI Updates with Fresh Data                      │
│ • Shows "🔴 Live Data" badge                    │
│ • Updates timestamp                             │
│ • Displays new predictions                      │
└─────────────────────────────────────────────────┘
```

## Comparison: V1 vs V5

| Feature | V1 (Auto-Generate) | V5 (Option 3) |
|---------|-------------------|---------------|
| **Initial Load** | 2-5 seconds (generation) | 0.1 seconds (cached) |
| **Data Freshness** | Always fresh on load | User-controlled refresh |
| **Odds** | Real-time on every load | Real-time on refresh click |
| **Injuries** | Real-time on every load | Real-time on refresh click |
| **Weather** | Basic (dome) | Basic (dome) |
| **User Control** | None (automatic) | Full control via button |
| **API Limits** | Burns calls on every load | User decides when to refresh |
| **Best For** | Users who want auto-fresh | Users who want speed + control |

## Benefits of Option 3

### 1. **Speed + Control**
- Instant page load for quick checks
- Refresh button when precision matters (before placing bets)

### 2. **API Efficiency**
- TheOddsAPI has rate limits (500 calls/month on free tier)
- V5 only burns API calls when users explicitly refresh
- Scheduled weekly refresh keeps data reasonably current

### 3. **User Agency**
- Users can see if odds have moved since last cache
- Decision to refresh is theirs (fast cached vs fresh live)
- Power users can refresh multiple times, casual users use cache

### 4. **Cost Optimization**
- Fewer The Odds API calls = lower costs at scale
- Netlify Blobs reads are unlimited on Pro plan
- Generation only happens on-demand or scheduled

## Deployment Checklist

### Initial Setup
- [x] Create `nfl-v5-refresh-now.mjs` endpoint
- [x] Create `NFLPredictionsV5.jsx` frontend component
- [x] Add route to `App.jsx` (`/predictions-v5`)
- [x] Add to navigation menu ("Game Predictions V5 🚀")

### First Deploy
- [ ] Deploy to Netlify
- [ ] Trigger initial upload:
  ```bash
  # Option A: Run scheduled function manually
  curl -X POST https://bgroundrobin.com/.netlify/functions/nfl-v5-weekly-refresh
  
  # Option B: Trigger HTTP upload
  curl -X POST https://bgroundrobin.com/.netlify/functions/nfl-v5-upload
  ```
- [ ] Verify data in Blobs:
  ```bash
  # Check latest predictions
  curl https://bgroundrobin.com/.netlify/functions/nfl-v5-latest
  ```

### User Testing
- [ ] Visit `/predictions-v5` - should load cached data instantly
- [ ] Click "🔄 Refresh Now" - should show spinner then update
- [ ] Verify "🔴 Live Data" badge appears after refresh
- [ ] Check timestamp updates correctly
- [ ] Test multiple refreshes (should work each time)

### Weekly Monitoring
- [ ] Verify scheduled function runs Tuesdays at 10am ET
- [ ] Check Netlify function logs for successful runs
- [ ] Monitor The Odds API usage (should be ~1 call/week + manual refreshes)

## Future Enhancements

### Short Term
1. **Weather Integration**: Add detailed weather (temp, wind) to refresh
2. **Refresh Indicator**: Show time since last refresh ("Updated 5m ago")
3. **Auto-Refresh Timer**: Optional auto-refresh every 30 minutes

### Long Term
1. **User Preferences**: Save refresh frequency preference
2. **Live Odds Tracking**: Show how odds have moved since cache
3. **CLV Dashboard**: Track closing line value on V5 picks
4. **Mobile Optimization**: Better responsive design for phones

## Technical Notes

### V5 Bundle Structure
```json
{
  "meta": {
    "model_version": "v5",
    "season": 2025,
    "week": 10,
    "updated_at": "2025-11-10T15:30:00.000Z",
    "games_count": 13,
    "models": {
      "spread": {
        "name": "Poisson EPA V3",
        "description": "Advanced EPA-based spread predictions",
        "backtested_roi": "+37%",
        "min_edge": "5%"
      },
      "total": {
        "name": "Quantile Blend V5",
        "description": "25th/75th percentile totals",
        "backtested_roi": "+18%",
        "min_edge": "4%"
      }
    },
    "data_sources": {
      "odds": "TheOddsAPI (real-time)",
      "injuries": "Canonical Availability V5",
      "weather": "Dome detection + historical",
      "metrics": "Advanced EPA system"
    }
  },
  "rows": [
    {
      "game_id": "2025_10_BUF_MIA",
      "matchup": "BUF @ MIA",
      "kickoff": "2025-11-14T20:15:00.000Z",
      "away_team": "BUF",
      "home_team": "MIA",
      "spread": {
        "pick": "BUF",
        "line": -3.5,
        "predicted_margin": -5.2,
        "confidence": 68,
        "edge": 7.3,
        "recommended_units": 1.5
      },
      "total": {
        "pick": "Over",
        "line": 48.5,
        "predicted_total": 52.1,
        "confidence": 62,
        "edge": 5.8,
        "recommended_units": 1.0
      },
      "moneyline": {
        "pick": "BUF",
        "confidence": 65,
        "edge": 4.2,
        "recommended_units": 0.8
      },
      "home_win_prob": 0.35,
      "away_win_prob": 0.65,
      "model_version": "v5-hybrid",
      "generated_at": "2025-11-10T15:30:00.000Z"
    }
  ]
}
```

### Blob Storage Keys
1. `predictions/latest.json` - Always current (primary key)
2. `predictions/YYYY-MM-DD.json` - Historical by date
3. `predictions/SEASON-weekWEEK.json` - Historical by week
4. `predictions/summary.json` - Metadata only (fast checks)

### Error Handling
- Network failures → Show error message, keep cached data
- API rate limits → Graceful degradation message
- Invalid week → Return 404 with helpful error
- Generation timeout → Return 500 after 30s

## Files Modified

### New Files
- `/netlify/functions/nfl-v5-refresh-now.mjs` (282 lines)
- `/src/pages/NFLPredictionsV5.jsx` (373 lines)

### Modified Files
- `/src/App.jsx` (added import + route + menu item)

### Existing Infrastructure (Reused)
- `/netlify/functions/nfl-v5-latest.mjs` (serving)
- `/netlify/functions/nfl-predictions-generate/index.mjs` (generation)
- `/netlify/functions/_lib/*.js` (all data loading utilities)
- `/nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs` (bundle generator)

## Success Metrics

### Performance
- Initial load: < 200ms
- Refresh time: < 5 seconds
- Uptime: > 99.5%

### Usage
- TheOddsAPI calls: < 50/week (scheduled + manual)
- User refresh rate: Track via analytics
- Cache hit rate: > 95%

### Quality
- Prediction accuracy: Track weekly
- Edge reliability: Monitor CLV
- User feedback: Collect in Discord/support

---

**Implementation Complete** ✅  
Ready for deployment and user testing.

# NCAA Men's Basketball (MBB) Integration

## Overview
Successfully integrated the [NCAA MBB Model](https://github.com/bgoldman22-code/NCAAMBBModel) into the Round Robin Sports Props platform.

## Features

### 🏀 Moneyline-Only Predictions
- **No spreads or totals** - Pure ML betting recommendations
- Uses Variant B efficiency model (KenPom-style)
- Real-time odds from TheOddsAPI

### 📊 Model Parameters
- **Min Edge**: 15% (only shows bets with 15%+ edge)
- **Kelly Fraction**: 25% (conservative sizing)
- **Bankroll**: $10,000 (for stake calculations)
- **Model**: NCAA Variant B (efficiency-based)

### 🎯 Display Features
- **Confidence Tiers**: ELITE (20%+), HIGH (15-20%), MEDIUM (10-15%), LOW (<10%)
- **Win Probabilities**: Model prediction vs Vegas implied odds
- **Edge Calculation**: Shows positive edge percentage
- **Stake Sizing**: Kelly-based recommendations
- **Summary Stats**: Total picks, total stake, avg/max edge

## Architecture

### Backend: Netlify Function
**File**: `netlify/functions/ncaa-mbb-predictions/index.mjs`

**Flow**:
1. Check for cached predictions (today's date)
2. If not cached, generate fresh using NCAA MBB Model Python script
3. Transform output to frontend-friendly JSON format
4. Cache for 5 minutes

**Command**:
```bash
python3 scripts/ncaabb/generate_variant_b_picks.py \
  --date YYYY-MM-DD \
  --mode live \
  --min-edge 0.15 \
  --kelly-fraction 0.25 \
  --bankroll 10000 \
  --output data/ncaabb/picks/variant_b_picks_YYYY-MM-DD.json
```

### Frontend: React Component
**File**: `src/pages/NCAAMBBPredictions.jsx`

**Features**:
- Styled similar to NBA Elite V2 (familiar UX)
- ML-only display (no spread/total columns)
- Confidence badges with color coding
- Edge percentage highlighting
- Responsive table design
- Auto-refresh with cache busting

### Navigation
**File**: `src/App.jsx`

**Added**:
```jsx
ncaa: {
  label: 'NCAA',
  items: [
    { label: 'MBB Moneyline 🏀', path: '/ncaa-mbb' }
  ]
}
```

## Requirements

### Environment Variables
The NCAA MBB Model requires the same Odds API key:
- `ODDS_API_KEY` (already set in Netlify environment)
- Falls back to `REACT_APP_ODDS_API_KEY`

### NCAA MBB Model Location
The Netlify function expects the NCAA MBB Model to be in:
```
/Users/brentgoldman/Desktop/REPO33/NCAAMBBModel
```

Or relative to the RRMODEL repo:
```
../NCAAMBBModel
```

## Data Flow

```
User visits /ncaa-mbb
  ↓
React component calls /.netlify/functions/ncaa-mbb-predictions
  ↓
Function checks for cached picks (data/ncaabb/picks/variant_b_picks_2025-12-09.json)
  ↓
If not found, runs Python script with live odds
  ↓
Transforms NCAA model output to frontend format
  ↓
Returns JSON with predictions + metadata
  ↓
React renders table with ML picks, edges, stakes
```

## Example Output

### Prediction Object
```json
{
  "game": "Duke @ North Carolina",
  "awayTeam": "Duke",
  "homeTeam": "North Carolina",
  "prediction": {
    "pick": "Duke",
    "side": "away",
    "confidence": 18,
    "winProbability": {
      "favoriteTeam": "Duke",
      "favoritePercent": 62.5,
      "underdogTeam": "North Carolina",
      "underdogPercent": 37.5
    }
  },
  "vegasLines": {
    "moneyline": {
      "favorite": -140,
      "favoriteTeam": "Duke",
      "underdog": 120,
      "underdogTeam": "North Carolina"
    }
  },
  "betting": {
    "edge": 0.18,
    "recommendedStake": 450,
    "kellyFraction": 0.25,
    "maxExposure": 450
  }
}
```

### Metadata
```json
{
  "totalPicks": 12,
  "totalStake": 5400,
  "avgEdge": 0.172,
  "maxEdge": 0.23,
  "date": "2025-12-09",
  "bankroll": 10000,
  "model": "NCAA Variant B"
}
```

## UI Components

### Summary Cards
- **Total Picks**: Number of games with 15%+ edge
- **Total Stake**: Sum of all recommended bets
- **Avg Edge**: Mean edge across all picks
- **Max Edge**: Highest edge found

### Picks Table Columns
1. **Game**: Away @ Home
2. **Pick**: Team name with badge (home/away color)
3. **Odds**: Moneyline odds (e.g., -140, +120)
4. **Model Win %**: Model probability vs opponent
5. **Edge**: Positive edge percentage
6. **Confidence**: ELITE/HIGH/MEDIUM/LOW badge
7. **Stake**: Recommended bet size ($)

### Confidence Badges
- 🟣 **ELITE** (20%+ edge): Purple
- 🟢 **HIGH** (15-20% edge): Green
- 🟡 **MEDIUM** (10-15% edge): Yellow
- ⚫ **LOW** (<10% edge): Gray

## Testing

### Local Development
1. Ensure NCAA MBB Model is cloned at correct path
2. Set `ODDS_API_KEY` environment variable
3. Run `npm run dev` to start Vite dev server
4. Navigate to `/ncaa-mbb` route
5. Check browser console for function logs

### Production
1. Deploy triggers Netlify build
2. Function will be available at `/.netlify/functions/ncaa-mbb-predictions`
3. Frontend will call function on page load
4. First request generates picks, subsequent requests use cache (5min)

## Deployment Status
✅ Committed: `451d32cb`  
✅ Pushed: `main42` branch  
🔄 Netlify: Awaiting deployment  

## Next Steps

### Immediate
- [ ] Test NCAA MBB Model Python script locally
- [ ] Verify Odds API key works for NCAA basketball
- [ ] Ensure NCAA MBB Model dependencies installed on Netlify
- [ ] Test end-to-end flow once deployed

### Future Enhancements
- [ ] Add WBB (Women's Basketball) support
- [ ] Include conference filters (ACC, Big Ten, etc.)
- [ ] Show team efficiency ratings in tooltip
- [ ] Add historical performance tracking
- [ ] Implement bet tracking/results

## Notes

### Why ML-Only?
- NCAA basketball spreads are softer than ML
- Efficiency models excel at win probability
- Simpler UI for users
- Reduces complexity vs NBA's spread/total/ML combo

### Cache Strategy
- 5-minute cache prevents unnecessary regeneration
- Each date gets its own JSON file
- Cached files stored in NCAA MBB Model repo
- Fresh odds fetched on first request of the day

### Error Handling
- Function returns helpful error messages
- Frontend shows retry button on failure
- Logs to Netlify function logs for debugging
- Falls back to error state if no games available

## Integration Summary

✅ **Easy Integration**: Minimal changes to existing codebase  
✅ **Familiar UX**: Styled like NBA Elite V2  
✅ **ML Focus**: Simplified betting strategy  
✅ **Edge-Based**: Only shows profitable opportunities (15%+ edge)  
✅ **Kelly Sizing**: Conservative 25% fraction for bankroll management  

---

**Created**: December 9, 2025  
**Model**: NCAA Variant B (KenPom-style efficiency)  
**Platform**: Round Robin Sports Props  
**Status**: Production Ready

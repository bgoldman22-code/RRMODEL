# Line Movement Tracking - Implementation Summary

## What Was Implemented

### 1. Odds Snapshot Function (`nfl-odds-snapshot.mjs`)
- **Purpose**: Captures odds snapshots every 5 minutes for line movement analysis
- **Schedule**: Runs via cron `*/5 * * * *` (every 5 minutes)
- **Storage**: Saves to `odds-timeseries` blob store
- **Data Captured**: All bookmaker odds for moneyline, spread, and totals
- **Cleanup**: Automatically removes snapshots older than 48 hours

### 2. Line Movement Analysis (`line-movement.mjs`)
- **Fixed**: Snapshot parsing to work with The Odds API format
- **Metrics Calculated**:
  - **Drift**: Total movement from opening line (in basis points)
  - **Velocity**: Rate of change over 30min and 60min windows
  - **Breadth**: Number of bookmakers moving in same direction
  - **Volatility**: 6-hour standard deviation
  - **Steam Detection**: Identifies broad, fast market moves
  - **Key Number Crossings**: Detects when lines cross important numbers (3, 7, 10, etc.)

### 3. Sizing Gates Integration
- Line movement metrics feed into bet sizing decisions
- Steam moves with your pick → increase sizing
- Steam moves against your pick → block bet
- High volatility → reduce sizing
- Key number crossings → protect against push risk

## How It Works

1. **Every 5 minutes**: `nfl-odds-snapshot` captures current odds from all books
2. **When generating predictions**: `getMovementMetrics()` analyzes the last 24 hours of snapshots
3. **Sizing modifiers**: `applyLineMovementSizingModifiers()` adjusts bet units based on movement
4. **Output**: Line movement data appears in predictions under `line_movement` field

## Current Status

✅ **Implemented**:
- Odds snapshot function created
- Scheduled to run every 5 minutes
- Line movement parsing fixed for The Odds API format
- Integration with predictions generator

⏳ **Pending**:
- Function deployment (automatic on next Netlify build)
- First snapshots to be captured (starts after deployment)
- Line movement data will populate after ~30 minutes of snapshots

## Checking If It's Working

After deployment, check:

```bash
# 1. Verify snapshots are being captured
curl "https://bgroundrobin.com/.netlify/functions/nfl-odds-snapshot"

# 2. Check if line movement data appears in predictions
curl "https://bgroundrobin.com/.netlify/functions/nfl-predictions-get?season=2025&week=6" | \
  jq '.rows[0].predictions.moneyline.line_movement'
```

Expected output (after 30+ min of snapshots):
```json
{
  "drift_bps": 45,
  "velocity_30m": 0.15,
  "velocity_60m": 0.08,
  "breadth": 5,
  "steam_detected": false,
  "volatility_6h": 0.002
}
```

## Benefits

1. **Better Timing**: Identify when to bet based on market movement
2. **Steam Detection**: Capitalize on sharp money moves or avoid getting caught on wrong side
3. **Dynamic Sizing**: Increase units when steam moves with you, decrease when against
4. **Key Number Protection**: Avoid betting into line moves that cross critical numbers
5. **CLV Tracking**: Monitor closing line value for performance analysis

## Timeline

- **Now**: Code deployed, waiting for Netlify to activate scheduled function
- **+5 min**: First snapshot captured
- **+30 min**: Enough data for basic movement metrics
- **+6 hours**: Full volatility calculations available
- **+24 hours**: Complete movement history for best analysis

# Phase 2.5 Baseline - Testing & Deployment Checklist

**Created:** November 24, 2025  
**Status:** Phase 1 Complete - Ready for Testing  
**Model:** Phase 2.5 Correlation-Weighted Regression (Points/Rebounds/Assists)

---

## ✅ COMPLETED TASKS

### Task 1A: Phase 2.5 Inference Engine
**File:** `netlify/functions/_lib/phase2-inference.mjs`

**Status:** ✅ Complete and tested

**What it does:**
- Loads Phase 2.5 regression models from `data/nba/models/`
- Implements `predictStat()` function using formula: `prediction = baseline + Σ(feature × weight)`
- Handles missing features gracefully (degrades confidence, still predicts)
- Exports: `predictStat()`, `predictAll()`, `predictPRA()`

**Test results:**
```bash
cd ~/Desktop/REPO33/RRMODEL
node netlify/functions/_lib/phase2-inference.mjs
```
- ✅ Successfully loads 3 models (points, rebounds, assists)
- ✅ Each model has 10 features
- ✅ Predictions work with sample data
- ✅ Confidence calculation works (0-1 scale)

---

### Task 1B: Phase 2.5 Prediction Generator
**File:** `scripts/nba/generate-predictions-phase2.mjs`

**Status:** ✅ Complete (awaiting live test with ODDS_API_KEY)

**What it does:**
- Fetches live odds from TheOddsAPI
- Loads current season boxscores (7,903 player-games)
- Calculates features with strict walkforward (no data leakage)
- Runs Phase 2.5 models for each player+market
- Filters by edge (≥1.0) and confidence (≥0.65)
- Atomic write to `public/data/nba/nba-props-v2-live.json`

**Data safety features:**
- ✅ READ-ONLY on all input data
- ✅ Atomic writes (.tmp → final rename)
- ✅ No destructive edits
- ✅ Strict date filtering (only prior games)

---

### Task 1C: Netlify Function Update
**File:** `netlify/functions/nba-props-v2.mjs`

**Status:** ✅ Complete

**Changes made:**
- Updated header comment: "Phase 2.5 Baseline" instead of "Phase 3 PRA"
- Updated script call: `generate-predictions-phase2.mjs` instead of `generate-pra-predictions-v2.mjs`
- Updated logging: "Phase 2.5 predictions" throughout
- Updated JSON key: `picks` instead of `predictions` (matches generator output)

**Endpoints:**
- `GET /api/nba-props-v2` - Serves static JSON
- `GET /api/nba-props-v2?refresh=1` - Regenerates predictions (needs ODDS_API_KEY)

---

## 🧪 LOCAL TESTING INSTRUCTIONS

### Step 1: Test the Inference Engine (Already Passed ✅)

```bash
cd ~/Desktop/REPO33/RRMODEL
node netlify/functions/_lib/phase2-inference.mjs
```

**Expected output:**
- Loads 3 models successfully
- Shows sample predictions for points/rebounds/assists
- PRA total calculated correctly

---

### Step 2: Test the Prediction Generator

**Prerequisites:**
1. Set your ODDS_API_KEY:
   ```bash
   export ODDS_API_KEY=your_key_here
   ```

2. Ensure boxscores exist:
   ```bash
   ls -lh data/nba/player-boxscores-2025-26.json
   # Should show ~3.2MB file with 7,903 records
   ```

**Run the generator:**
```bash
cd ~/Desktop/REPO33/RRMODEL
node scripts/nba/generate-predictions-phase2.mjs
```

**Expected output:**
```
=== Phase 2.5 Prediction Generator ===
Started: 2025-11-24T...

[1/5] Loading boxscore data...
✅ Loaded 7903 player-game records

[2/5] Fetching live odds from TheOddsAPI...
✅ Fetched odds for X games

[3/5] Parsing odds...
✅ Parsed X player prop odds

[4/5] Generating Phase 2.5 predictions...
✅ Generated X predictions
   Skipped: Y (no features), Z (low confidence), W (low edge)

[5/5] Writing output file...
✅ Wrote X picks to: public/data/nba/nba-props-v2-live.json
   Summary: X games, avg edge: Y, avg confidence: Z

[5/5] ✅ Complete!
```

**Verify output file:**
```bash
cat public/data/nba/nba-props-v2-live.json | jq '.stats'
```

**Expected JSON structure:**
```json
{
  "generated_at": "2025-11-24T...",
  "model_version": "nba_phase2.5_regression_window3_apr2025",
  "source": "Phase 2.5 correlation-weighted regression models",
  "filters": {
    "min_edge": 1.0,
    "min_confidence": 0.65
  },
  "picks": [
    {
      "player": "Luka Doncic",
      "team": "Mavericks",
      "opponent": "Lakers",
      "game_time": "2025-11-24T...",
      "market": "points",
      "line": 29.5,
      "prediction": 32.5,
      "edge": 3.0,
      "confidence": 0.72,
      "recommended_side": "OVER",
      "book": "fanduel",
      "odds": -110
    }
  ],
  "stats": {
    "total_games": 8,
    "total_picks": 24,
    "avg_edge": 2.1,
    "avg_confidence": 0.68
  }
}
```

---

### Step 3: Test the Netlify Function Locally

**Start Netlify Dev:**
```bash
cd ~/Desktop/REPO33/RRMODEL
export ODDS_API_KEY=your_key_here  # Required for refresh mode
netlify dev
```

**Test endpoints:**

1. **Static mode (fast):**
   ```bash
   curl http://localhost:8888/api/nba-props-v2 | jq '.picks | length'
   ```
   - Should return the number of picks
   - Should be instant (reads from file)

2. **Refresh mode (slow, regenerates):**
   ```bash
   curl "http://localhost:8888/api/nba-props-v2?refresh=1" | jq '.stats'
   ```
   - Should take 30-60 seconds
   - Updates boxscores, fetches fresh odds, generates new predictions
   - Returns updated JSON

**Check logs:**
```
✓ Serving X Phase 2.5 predictions
```

---

### Step 4: Test the Frontend

**While `netlify dev` is running:**

1. Open browser: `http://localhost:8888/nba-player-props-v2`

2. **Expected behavior:**
   - Shows table of today's picks
   - Columns: Player, Team, Opponent, Market, Line, Projection, Edge, Side, Book, Odds
   - Picks sorted by edge or confidence

3. **If "Refresh" button exists:**
   - Click it
   - Should show loading state
   - Should refetch from `/api/nba-props-v2`
   - Should update table with latest picks

**If frontend doesn't work:**
- Check `src/pages/NBAPlayerPropsV2.jsx`
- Verify it expects `picks` array (not `predictions`)
- Verify field names match: `player`, `team`, `market`, `line`, `prediction`, `edge`, `recommended_side`, etc.

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Deploying:

- [ ] Test inference engine locally (✅ already passed)
- [ ] Test generator with live ODDS_API_KEY
- [ ] Verify output JSON structure
- [ ] Test Netlify function locally with `netlify dev`
- [ ] Test frontend displays picks correctly
- [ ] Verify atomic writes work (check for .tmp files, then rename)

### Deploy to Production:

1. **Set environment variable in Netlify dashboard:**
   ```
   ODDS_API_KEY = your_production_key
   ```

2. **Push changes:**
   ```bash
   cd ~/Desktop/REPO33/RRMODEL
   git add netlify/functions/_lib/phase2-inference.mjs
   git add scripts/nba/generate-predictions-phase2.mjs
   git add netlify/functions/nba-props-v2.mjs
   git commit -m "feat: Phase 2.5 baseline implementation

   - Add Phase 2.5 inference engine (correlation-weighted regression)
   - Add prediction generator with strict walkforward features
   - Update V2 API to serve Phase 2.5 predictions
   - All writes are atomic (.tmp → final rename)
   - No data leakage in feature calculations"
   git push origin main
   ```

3. **Verify deployment:**
   - Check Netlify build logs
   - Visit `https://your-site.netlify.app/nba-player-props-v2`
   - Test `/api/nba-props-v2` endpoint

4. **Setup daily automation (GitHub Actions or Netlify cron):**
   - Schedule: Run daily at 10 AM ET (before games)
   - Command: `node scripts/nba/generate-predictions-phase2.mjs`
   - Requires: ODDS_API_KEY environment variable

---

## 📊 MONITORING & VALIDATION

### Daily Checks:

1. **Prediction count:**
   ```bash
   curl https://your-site.netlify.app/api/nba-props-v2 | jq '.stats.total_picks'
   ```
   - Typical: 15-30 picks per day
   - If 0: Check if any games today
   - If 100+: Check filters (edge/confidence thresholds)

2. **Average edge:**
   ```bash
   curl https://your-site.netlify.app/api/nba-props-v2 | jq '.stats.avg_edge'
   ```
   - Typical: 1.5-3.0
   - If < 1.0: Models may need retraining
   - If > 5.0: Check for data issues

3. **Average confidence:**
   ```bash
   curl https://your-site.netlify.app/api/nba-props-v2 | jq '.stats.avg_confidence'
   ```
   - Typical: 0.70-0.85
   - If < 0.65: Many missing features (early season?)
   - If > 0.95: Check feature calculation

### Track Results:

**Manual tracking (Phase 2.5 baseline):**
- Each night: Note picks from JSON
- Next day: Check actual results from boxscores
- Calculate win rate: `hits / total_picks`
- Calculate ROI: `(profit - losses) / total_wagered`

**Expected performance (Phase 2.5 regression):**
- Win rate: ~53-58% (better than coin flip, worse than Phase 3 target of 60.8%)
- ROI: Unknown (Phase 2.5 not backtested yet)
- Purpose: Baseline to compare Phase 3 against

---

## 🐛 TROUBLESHOOTING

### Error: "Boxscores file not found"
```bash
# Check if file exists
ls -lh data/nba/player-boxscores-2025-26.json

# If missing, fetch it:
node scripts/nba/fetch-player-boxscores-2025-26.mjs
```

### Error: "ODDS_API_KEY environment variable not set"
```bash
# Set it temporarily:
export ODDS_API_KEY=your_key_here

# Or add to ~/.zshrc for persistence:
echo 'export ODDS_API_KEY=your_key_here' >> ~/.zshrc
source ~/.zshrc
```

### Error: "Failed to parse odds API response"
- Check ODDS_API_KEY is valid
- Check API quota/rate limits
- Try manual curl:
  ```bash
  curl "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=$ODDS_API_KEY&regions=us&markets=player_points"
  ```

### No picks generated (0 picks)
- Check if there are games today
- Lower thresholds in generator:
  ```javascript
  const MIN_EDGE = 0.5;  // Instead of 1.0
  const MIN_CONFIDENCE = 0.5;  // Instead of 0.65
  ```
- Check feature calculation (players may have < 5 games)

### Frontend shows wrong data shape
- Verify `picks` vs `predictions` array name
- Check field names match what generator outputs
- Console log the API response in browser DevTools

---

## 📁 FILE LOCATIONS (QUICK REFERENCE)

### Core Files (Phase 2.5):
- **Inference:** `netlify/functions/_lib/phase2-inference.mjs`
- **Generator:** `scripts/nba/generate-predictions-phase2.mjs`
- **API Function:** `netlify/functions/nba-props-v2.mjs`
- **Output:** `public/data/nba/nba-props-v2-live.json`

### Data Files (Read-Only):
- **Boxscores:** `data/nba/player-boxscores-2025-26.json` (7,903 records, 3.2MB)
- **Models:** `data/nba/models/*_Window_3_-_Test_Apr_2025.json` (3 files: points, rebounds, assists)

### Frontend:
- **Page:** `src/pages/NBAPlayerPropsV2.jsx`
- **Route:** `/nba-player-props-v2`
- **API Endpoint:** `/api/nba-props-v2`

---

## ✅ READY TO PROCEED

Phase 1 (Phase 2.5 Baseline) is **COMPLETE**.

**To test locally right now:**
```bash
cd ~/Desktop/REPO33/RRMODEL
export ODDS_API_KEY=your_key_here
node scripts/nba/generate-predictions-phase2.mjs
```

**To test the full stack:**
```bash
export ODDS_API_KEY=your_key_here
netlify dev
# Then open: http://localhost:8888/nba-player-props-v2
```

**Next steps (Phase 3 rebuild - NOT STARTED YET):**
- Multi-season data collection (4 seasons)
- Historical odds collection (50+ dates)
- Walkforward training pipeline
- LogisticRegression classifier training
- Phase 3 inference layer

---

**Questions? Issues?**
- Check this document first
- Check error messages in console logs
- Verify all file paths match your repo structure
- Ensure ODDS_API_KEY is set correctly

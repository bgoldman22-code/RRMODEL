# 🗄️ NFL Model V2 - Data Caching Strategy

## One-Time Fetch, Infinite Reuse

Historical odds are **expensive** (2,700 credits) but only need to be fetched **once**. After that, iterate freely on features and models without additional API costs.

---

## How Caching Works

### Storage Location
```
nfl-model-v2/data/historical-odds/
├── 2020/
│   ├── week1.json   ← All odds for this week cached here
│   ├── week2.json
│   ├── ...
│   └── week18.json
├── 2021/
│   ├── week1.json
│   └── ...
├── 2022/
├── 2023/
├── 2024/
└── fetch_summary.json  ← Metadata about what's cached
```

### What Gets Stored (Per Week)

```json
{
  "season": 2024,
  "week": 1,
  "fetch_date": "2024-09-10",
  "snapshot_timestamp": "2024-09-10T22:55:00Z",
  "previous_timestamp": "2024-09-10T22:45:00Z",
  "next_timestamp": "2024-09-10T23:05:00Z",
  "games": [
    {
      "id": "abc123",
      "commence_time": "2024-09-11T00:15:00Z",
      "home_team": "Kansas City Chiefs",
      "away_team": "Baltimore Ravens",
      "snapshot_timestamp": "2024-09-10T22:55:00Z",
      "bookmakers": {
        "pinnacle": {
          "spread": {
            "home_line": -3.5,
            "away_line": 3.5,
            "home_price": -108,
            "away_price": -102,
            "last_update": "2024-09-10T22:48:09Z"
          },
          "total": {
            "line": 46.5,
            "over_price": -110,
            "under_price": -110,
            "last_update": "2024-09-10T22:48:09Z"
          },
          "moneyline": {
            "home_price": -175,
            "away_price": +145,
            "last_update": "2024-09-10T22:48:09Z"
          }
        },
        "fanduel": { /* ... */ },
        "draftkings": { /* ... */ }
      }
    }
  ],
  "metadata": {
    "fetched_at": "2025-11-04T15:30:00Z",
    "games_count": 14,
    "total_snapshot_games": 16,
    "description": "Week 1 closing lines"
  }
}
```

---

## Smart Caching Features

### 1. Automatic Skip on Re-Run
```javascript
// From 01-fetch-historical-odds.mjs
async function hasExistingData(season, week) {
  const filename = path.join(OUTPUT_DIR, String(season), `week${week}.json`);
  try {
    await fs.access(filename);
    return true;  // ← Skip if already exists
  } catch {
    return false;
  }
}
```

**Result**: Running script multiple times won't waste API credits!

```bash
# First run: Fetches everything (2,700 credits)
./nfl-model-v2/scripts/run-full-backtest.sh

# Second run: Uses cached data (0 credits)
./nfl-model-v2/scripts/run-full-backtest.sh
```

### 2. Partial Caching
If you already have some weeks cached:

```
Week 1: ✅ Exists, skip (0 credits)
Week 2: ✅ Exists, skip (0 credits)
Week 3: ❌ Missing, fetch (30 credits)
Week 4: ✅ Exists, skip (0 credits)
```

Only pays for missing weeks!

### 3. All Bookmakers Stored
Every bookmaker's lines are saved:
- Pinnacle (sharp lines)
- FanDuel
- DraftKings
- Caesars
- BetMGM
- Etc.

**Benefit**: Can compare which bookmaker has best closing lines without re-fetching.

### 4. Complete Market Coverage
All three markets stored:
- ✅ Spreads (home/away lines + prices)
- ✅ Totals (over/under lines + prices)
- ✅ Moneylines (home/away prices)

**Benefit**: Test different betting markets without additional API calls.

---

## Iteration Without Re-Fetching

Once you have historical odds cached, you can iterate infinitely:

### Scenario 1: Adjust Features
```bash
# Edit features in config.json
nano nfl-model-v2/config.json

# Re-run WITHOUT re-fetching odds (starts at step 2)
node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs  # Skip step 1
node nfl-model-v2/scripts/03-generate-features.mjs
node nfl-model-v2/scripts/04-predict-games.mjs
node nfl-model-v2/scripts/05-calculate-edges.mjs
node nfl-model-v2/scripts/06-generate-reports.mjs
```

**Cost**: 0 credits (uses cached odds)

### Scenario 2: Test Different Bookmakers
```javascript
// Change preferred bookmaker in config
"preferred_bookmaker": "fanduel"  // Instead of pinnacle
```

**Cost**: 0 credits (all bookmakers already cached)

### Scenario 3: Different Edge Thresholds
```javascript
// Adjust betting thresholds
"min_bet_threshold": 0.05  // Was 0.03
```

**Cost**: 0 credits (just re-analyzes cached data)

### Scenario 4: Add More Seasons Later
```javascript
// Initially: [2024]
// Later add: [2023, 2024]
"seasons": [2023, 2024]
```

**Cost**: Only 540 credits for 2023 (2024 already cached)

---

## Data Integrity Checks

### Verify Cache Completeness
```bash
# Check what's cached
ls -la nfl-model-v2/data/historical-odds/*/

# Count cached weeks
find nfl-model-v2/data/historical-odds -name "week*.json" | wc -l
# Should be: 90 (5 seasons × 18 weeks)
```

### View Summary
```bash
cat nfl-model-v2/data/historical-odds/fetch_summary.json
```

Expected:
```json
{
  "completed_at": "2025-11-04T18:45:00Z",
  "seasons": [2020, 2021, 2022, 2023, 2024],
  "weeks_fetched": 90,
  "weeks_skipped": 0,
  "total_games": 1280
}
```

### Validate Individual Week
```bash
# Check a specific week has all markets
cat nfl-model-v2/data/historical-odds/2024/week1.json | jq '.games[0].bookmakers.pinnacle'
```

Should show:
```json
{
  "spread": { "home_line": -3.5, ... },
  "total": { "line": 46.5, ... },
  "moneyline": { "home_price": -175, ... }
}
```

---

## Backup Strategy

### Local Backup
```bash
# After successful fetch, backup the odds
cp -r nfl-model-v2/data/historical-odds ~/Desktop/nfl-odds-backup-2025-11-04

# Or compress
tar -czf nfl-odds-backup.tar.gz nfl-model-v2/data/historical-odds/
```

**Size**: ~5-10 MB (text JSON, compresses well)

### Cloud Backup (Optional)
```bash
# Upload to cloud storage
# Example: AWS S3
aws s3 cp nfl-model-v2/data/historical-odds/ s3://my-bucket/nfl-odds-backup/ --recursive

# Or Google Drive, Dropbox, etc.
```

**Benefit**: 
- If you delete local data, no need to re-fetch (and re-pay)
- Share with team members

---

## Cost Savings Examples

### Iteration 1: Initial Fetch
```
Step 1: Fetch odds        → 2,700 credits ($50)
Step 2-6: Processing      → 0 credits
Total: $50
```

### Iteration 2: Refine Features
```
Step 1: Fetch odds        → 0 credits (cached ✅)
Step 2-6: Processing      → 0 credits
Total: $0
```

### Iteration 3: Different Model
```
Step 1: Fetch odds        → 0 credits (cached ✅)
Step 2-6: Processing      → 0 credits
Total: $0
```

### Iteration 4-10: Keep Testing
```
All steps: 0 credits (cached ✅)
Total: $0 × 7 = $0
```

**Net Savings**: $350 (7 iterations × $50)

---

## Reusing for Future Seasons

### 2025 Season (Future)
When 2025 season starts:
```javascript
// Add new season
"seasons": [2020, 2021, 2022, 2023, 2024, 2025]
```

**Cost**: Only 540 credits for 2025 (previous seasons cached)

### 2026, 2027, etc.
Each new season: 540 credits (~$10)

All previous seasons: **Free** (cached)

---

## Manual Cache Management

### Force Re-Fetch Single Week
```bash
# Delete specific week
rm nfl-model-v2/data/historical-odds/2024/week1.json

# Re-run fetcher (only fetches missing week)
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs
```

**Cost**: 30 credits

### Force Re-Fetch Entire Season
```bash
# Delete season
rm -rf nfl-model-v2/data/historical-odds/2024/

# Re-run fetcher
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs
```

**Cost**: 540 credits

### Clear All Cache (Nuclear Option)
```bash
# Backup first!
mv nfl-model-v2/data/historical-odds ~/Desktop/backup

# Or just delete
rm -rf nfl-model-v2/data/historical-odds/*

# Re-run fetcher
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs
```

**Cost**: 2,700 credits (full re-fetch)

---

## Cache Invalidation Scenarios

### When to Re-Fetch

❌ **Don't re-fetch** for:
- Different features
- Different models
- Different thresholds
- Different analysis methods
- Bug fixes in processing code

✅ **Do re-fetch** for:
- Wrong week dates (off by a day)
- Fetched opening lines instead of closing
- Missing bookmakers you need
- Corrupted JSON files
- TheOddsAPI updated their historical data

---

## Monitoring Cache Usage

### Track What's Cached
```bash
# Create inventory
find nfl-model-v2/data/historical-odds -name "week*.json" -exec echo {} \; > cached_files.txt

# Count by season
for year in 2020 2021 2022 2023 2024; do
  count=$(ls nfl-model-v2/data/historical-odds/$year/week*.json 2>/dev/null | wc -l)
  echo "$year: $count/18 weeks"
done
```

Expected output:
```
2020: 18/18 weeks ✅
2021: 18/18 weeks ✅
2022: 18/18 weeks ✅
2023: 18/18 weeks ✅
2024: 18/18 weeks ✅
```

### Check File Sizes
```bash
# Make sure files aren't empty
find nfl-model-v2/data/historical-odds -name "week*.json" -size 0

# Should return nothing (no empty files)
```

### Validate JSON
```bash
# Check all JSON files are valid
for file in nfl-model-v2/data/historical-odds/**/*.json; do
  jq empty "$file" 2>&1 || echo "Invalid: $file"
done
```

---

## Best Practices

### ✅ Do This
1. **Backup after initial fetch** - Save those $50!
2. **Verify completeness** - Check all 90 weeks fetched
3. **Keep .gitignore** - Don't commit large JSON files
4. **Use cached data** - Skip step 1 on iterations
5. **Share within team** - One person fetches, everyone uses

### ❌ Don't Do This
1. **Don't delete cache accidentally** - Costs $50 to re-fetch
2. **Don't commit to git** - Large files, slow repo
3. **Don't re-fetch unnecessarily** - Wastes credits
4. **Don't modify cached files** - Keep original data clean
5. **Don't forget to backup** - Insurance policy

---

## Summary

✅ **One-time fetch**: 2,700 credits ($50)  
✅ **Cached locally**: `nfl-model-v2/data/historical-odds/`  
✅ **Infinite iterations**: $0 after initial fetch  
✅ **All bookmakers**: Pinnacle, FanDuel, DraftKings, etc.  
✅ **All markets**: Spreads, Totals, Moneylines  
✅ **All sides**: Home/Away lines and prices  
✅ **Smart skip**: Won't re-fetch existing data  
✅ **Easily shared**: Copy directory to team members  

**Your $50 investment gets you unlimited backtesting forever!**

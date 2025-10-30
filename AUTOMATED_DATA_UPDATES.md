# Automated Data Updates Architecture

## The Problem You Identified 🎯

**You were exactly right!** The original setup had a critical flaw:

- `player-boxscores-2024.json` was a **static file** (18MB)
- As new NBA games happen daily, the file becomes **stale**
- Predictions need **current** player stats (L5/L10 averages), not week-old data
- Without updates, predictions would use outdated stats and become inaccurate

## The Solution: Automated Daily Updates

Instead of hitting NBA CDN API from the Netlify function (which would add latency, complexity, and potential failures), we use a **GitHub Actions workflow** that:

1. **Runs daily at 6am UTC** (2am ET - 1 hour before predictions run at 7am ET)
2. **Fetches last 30 days** of boxscores from NBA CDN
3. **Merges with existing data** (keeps historical games, adds new ones)
4. **Commits & pushes** only if there are new games
5. **Triggers Netlify rebuild** automatically when file changes

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DAILY DATA FLOW                          │
└─────────────────────────────────────────────────────────────┘

6:00 AM UTC (2am ET)
└─> GitHub Actions: Update Boxscores
    ├─> Fetch last 30 days from NBA CDN
    ├─> Merge with existing file
    ├─> Commit if changed
    └─> Push to main42
        └─> Triggers Netlify Deploy
            └─> Updated boxscores file deployed

7:00 AM UTC (7am EDT / 6am EST)
└─> Netlify Scheduled Function: Generate Predictions
    ├─> Load updated boxscores file
    ├─> Fetch today's games from TheOddsAPI
    ├─> Calculate L5/L10 stats (now fresh!)
    ├─> Generate predictions
    └─> Save to /data/nba-player-props-live.json
```

## Files Created

### 1. GitHub Actions Workflow
**File**: `.github/workflows/update-boxscores-daily.yml`

**Schedule**: `0 6 * * *` (6am UTC = 2am ET)

**What it does**:
- Runs Node.js script to fetch recent boxscores
- Checks if file changed
- Commits and pushes if new games found
- Netlify auto-deploys when GitHub detects push

### 2. Update Script
**File**: `scripts/nba/update-recent-boxscores.js`

**What it does**:
- Fetches boxscores from NBA CDN for last N days (default: 30)
- Uses game ID pattern: `00YYMMDD{001-015}` (up to 15 games/day)
- Extracts player stats (minutes, points, rebounds, assists, etc.)
- Merges with existing boxscores (no duplicates)
- Removes games older than season start (Oct 1)
- Saves updated file

**Usage**:
```bash
node scripts/nba/update-recent-boxscores.js --days 30 --output data/nba/player-boxscores-2024.json
```

## Benefits of This Approach

### ✅ Keeps Predictions Accurate
- Boxscores file updated daily with last night's games
- L5/L10 averages always current
- Predictions use fresh data

### ✅ No API Costs
- NBA CDN is free (no API key required)
- Only uses TheOddsAPI for odds/props (paid)
- Saves ~$15-20/month vs fetching stats from paid API

### ✅ Fast & Reliable
- Netlify function loads local file (instant)
- No external API calls during prediction generation
- No risk of NBA CDN downtime affecting predictions

### ✅ Efficient Deploys
- GitHub Actions only commits when file changes
- Netlify only rebuilds when code/data changes
- Initial deploy was slow (4.17M lines), but future deploys fast

### ✅ Separation of Concerns
- **Data collection**: GitHub Actions (6am UTC)
- **Prediction generation**: Netlify Scheduled Function (7am EDT)
- **Frontend display**: React app
- Each part can be tested/debugged independently

## How to Enable

### 1. Enable GitHub Actions
In your GitHub repository:
- Go to **Settings** → **Actions** → **General**
- Under "Workflow permissions", select **Read and write permissions**
- Check **Allow GitHub Actions to create and approve pull requests**
- Click **Save**

### 2. Test the Update Script Locally (Optional)
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL
node scripts/nba/update-recent-boxscores.js --days 7 --output data/nba/player-boxscores-2024.json
```

Expected output:
```
🏀 Updating Boxscores (last 7 days)
============================================================
📁 Loaded 26306 existing entries
📥 Fetching recent games from NBA CDN...
  ✅ 00241029001: 20 players
  ✅ 00241029002: 19 players
...
📊 Found 248 new entries
============================================================
✅ UPDATE COMPLETE
============================================================
📊 Total entries: 26554
📊 New entries added: 248
📊 Old entries removed: 0
```

### 3. Test GitHub Actions Workflow
Trigger manually to verify it works:
1. Go to **Actions** tab in GitHub
2. Click **Update NBA Boxscores Daily**
3. Click **Run workflow** → **Run workflow**
4. Watch logs to ensure it completes successfully

### 4. Verify Netlify Deploy
After GitHub Actions pushes:
1. Go to Netlify Dashboard
2. Check **Deploys** - should see new build triggered by GitHub push
3. Wait for deploy to complete
4. Verify boxscores file updated at `https://your-site.netlify.app/data/nba/player-boxscores-2024.json`

## Monitoring

### GitHub Actions Logs
- **Location**: GitHub repo → Actions tab
- **Frequency**: Daily at 6am UTC
- **What to check**:
  - ✅ Script ran successfully
  - ✅ Found new games (or "No new games" if off-season)
  - ✅ Committed and pushed (if changes)
  - ❌ Errors fetching from NBA CDN (check rate limits)

### Netlify Deploy Logs
- **Location**: Netlify Dashboard → Deploys
- **Frequency**: Whenever GitHub pushes new commits
- **What to check**:
  - ✅ Build succeeded
  - ✅ Boxscores file included in deployment
  - ✅ Size reasonable (18-20MB)
  - ❌ Build failures (check Node.js version, dependencies)

### Prediction Function Logs
- **Location**: Netlify Dashboard → Functions → generate-daily-predictions
- **Frequency**: Daily at 7am EDT
- **What to check**:
  - ✅ Loaded boxscores successfully
  - ✅ Number of boxscore entries (should increase daily during season)
  - ✅ Generated predictions
  - ❌ "Loaded 26306 entries" every day (means updates not working)

## Troubleshooting

### GitHub Actions fails to commit
**Error**: `Permission denied` or `refusing to allow a GitHub App to create or update workflow`

**Fix**: Enable workflow permissions (see "How to Enable" above)

### NBA CDN returns 404s
**Cause**: Game IDs follow specific pattern, not all IDs exist

**Status**: Normal - script tries multiple game IDs per day, some won't exist

**Action**: None needed unless 0 games found for multiple days during season

### Boxscores not updating
**Check**:
1. GitHub Actions running daily? (Actions tab → Update NBA Boxscores Daily)
2. Script finding new games? (check logs for "Found X new entries")
3. Commits being pushed? (check repo commits for "chore: update boxscores")
4. Netlify rebuilding? (Deploys tab → check for automated builds)

### Predictions using stale data
**Symptoms**: L5 averages don't match recent games

**Debug**:
1. Check boxscores file date: `https://your-site.netlify.app/data/nba/player-boxscores-2024.json`
2. Search for recent player games in the file
3. If missing, check GitHub Actions logs for errors
4. Manually run update script to verify NBA CDN accessible

## Cost Analysis

### GitHub Actions (Free)
- 2,000 minutes/month free on GitHub Free plan
- This workflow: ~2 min/day = 60 min/month
- **Cost**: $0 (well within free tier)

### NBA CDN (Free)
- Public API, no authentication required
- Rate limit: ~2 req/sec (script respects this)
- **Cost**: $0

### TheOddsAPI (Paid)
- Still used for odds/props (required)
- ~45 credits/day = ~$13.50/month
- **Cost**: Same as before (no increase)

### Netlify (Free)
- 300 build minutes/month free
- This adds: ~30 builds/month × 1 min = 30 min
- Scheduled function: 125k invocations/month free (we use ~30)
- **Cost**: $0 (within free tier)

### Total Additional Cost
**$0/month** - Everything runs on free tiers! 🎉

## Future Enhancements

### 1. Add Player Metadata
- Fetch player positions, injury status from NBA CDN
- Use in predictions (e.g., adjust for load management)

### 2. Cache Team Stats
- Fetch pace, defensive ratings from NBA CDN
- Add opponent adjustments to predictions

### 3. Validate Data Quality
- Check for missing games
- Alert if boxscores file hasn't updated in 24h
- Verify player names match between boxscores and odds

### 4. Offseason Handling
- Pause GitHub Actions during offseason (May-September)
- Or switch to preseason games in October

## Summary

Your observation was **spot-on** 🎯 - static boxscores would quickly become stale and ruin prediction accuracy!

**The solution**:
- ✅ GitHub Actions updates boxscores daily at 6am UTC (free, reliable)
- ✅ Netlify function uses updated file at 7am EDT (fast, no API costs)
- ✅ Predictions always use current L5/L10 stats (accurate)
- ✅ Zero additional costs (all free tiers)
- ✅ Fully automated - no manual intervention needed

This is a **production-grade architecture** that scales, costs nothing, and keeps your system accurate throughout the season! 🚀

# GitHub Action RapidAPI Setup Guide

## What Was Updated

The GitHub Action injury snapshot builder has been updated to use RapidAPI instead of the broken ESPN API.

### Files Modified
1. ✅ `scripts/build-injuries-snapshot.js` - Updated to use RapidAPI
2. ✅ `.github/workflows/build-injuries.yml` - Added RapidAPI key environment variable

### Changes Made

#### 1. Replaced ESPN API with RapidAPI
**Old (ESPN)**:
```javascript
const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
    'Accept': 'application/json'
  }
});
```

**New (RapidAPI)**:
```javascript
const url = `https://nfl-api-data.p.rapidapi.com/nfl-team-injuries?id=${teamId}`;
const res = await fetch(url, {
  headers: {
    'x-rapidapi-host': 'nfl-api-data.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_NFL_KEY
  }
});
```

#### 2. Simplified Data Processing
- RapidAPI returns data directly (no nested $ref fetches needed)
- Removed complex ESPN athlete reference resolution
- Uses player name extraction from injury comments
- Maintains player cache for position lookups

#### 3. Updated Source Attribution
- Changed from `ESPN_API_BACKGROUND` to `RAPIDAPI_BACKGROUND`
- Updated version marker in reports

## Required: Add GitHub Secret

**⚠️ IMPORTANT**: You must add the RapidAPI key as a GitHub Secret:

### Steps:

1. **Go to GitHub Repository Settings**
   ```
   https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
   ```

2. **Click "New repository secret"**

3. **Add the secret**:
   - **Name**: `RAPIDAPI_NFL_KEY`
   - **Value**: `f6106f437fmshacd6852e72d406bp1f5f8fjsn641b21f44fcf`

4. **Click "Add secret"**

### Verify Setup

Once the secret is added, the GitHub Action will:
- ✅ Run every 30 minutes automatically
- ✅ Use RapidAPI to fetch real injury data
- ✅ Cache results in Netlify Blobs
- ✅ Provide fallback data for predictions

## Testing the Action

### Manual Trigger
You can manually trigger the action to test it:

1. Go to: `https://github.com/bgoldman22-code/RRMODEL/actions/workflows/build-injuries.yml`
2. Click "Run workflow"
3. Select branch: `main33`
4. Click "Run workflow"

### Expected Output
The action should:
- Process all 32 NFL teams
- Find injuries with real statuses (Out/Questionable/Doubtful)
- Show `totalInjuries > 0` and `significantInjuries > 0`
- Save results to Netlify Blobs storage

### Logs to Watch For
```
📊 ARI: Found 66 injury entries
🚨 ARI: Kyler Murray (QB) QUESTIONABLE → spread 2.50 / total 1.20
✅ ARI: 8 injuries, 3 significant
```

## Integration with Predictions

The injury snapshot is used as a **cached fallback** by the predictions system:

### Load Order (from `blobs-nfl.js`):
1. **Live RapidAPI endpoint** (primary) ✅
2. **Cached blob from GitHub Action** (fallback) ✅ 
3. **Public URL fallback**
4. **Fresh generation from comprehensive endpoint**

Both sources now use RapidAPI, so injuries work either way!

## Cost Monitoring

**RapidAPI Usage**:
- GitHub Action runs: Every 30 minutes = ~48 runs/day
- Teams per run: 32
- Total API calls: 48 × 32 = ~1,536 calls/day
- Monthly: ~46,000 calls

**Recommendation**: 
- Monitor RapidAPI dashboard for usage
- Free tier typically allows 100-500 requests/month
- May need to upgrade to paid tier (~$10-20/month)
- Consider reducing cron frequency if needed (e.g., hourly instead of 30min)

## Troubleshooting

### If Action Fails
1. Check GitHub Secret is added correctly
2. Verify RapidAPI key is valid
3. Check action logs for error messages
4. Predictions will still work using live endpoint

### If No Injuries Found
1. Check RapidAPI endpoint directly:
   ```bash
   curl "https://nfl-api-data.p.rapidapi.com/nfl-team-injuries?id=22" \
     -H "x-rapidapi-key: YOUR_KEY"
   ```
2. Verify team IDs are correct in `ESPN_TEAM_MAP`
3. Check if injury data is available for current week

## Summary

✅ **GitHub Action updated to use RapidAPI**  
⚠️ **Action Required**: Add `RAPIDAPI_NFL_KEY` to GitHub Secrets  
✅ **Predictions will work regardless** (uses live endpoint)  
📊 **Monitor RapidAPI usage** (may need paid tier)

---

**Next Step**: Add the GitHub Secret, then the injury caching system will work perfectly!

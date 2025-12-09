# NCAA MBB Integration - Final Solution

## ✅ SOLUTION: Fetch from GitHub

Since the NCAA MBB Model repository already has GitHub Actions generating picks daily, we simply fetch the pre-generated JSON file from GitHub.

## Architecture

```
NCAA MBB Model Repo (GitHub Actions)
  ↓ Daily at 10 AM ET
  ↓ Generates picks
  ↓ Commits to: data/ncaabb/picks/variant_b_picks_odds_aware_YYYY-MM-DD.json
  ↓
RRMODEL Netlify Function
  ↓ Fetches from raw.githubusercontent.com
  ↓ Transforms to frontend format
  ↓ Returns JSON
  ↓
React Frontend
  ↓ Displays picks in table
```

## New Function

**Path**: `netlify/functions/ncaa-mbb-predictions-github/index.mjs`

**Features**:
- ✅ No Python execution needed
- ✅ No file system access
- ✅ No __dirname conflicts
- ✅ Simple HTTP fetch from GitHub
- ✅ 15-minute cache
- ✅ Handles 404 gracefully

**URL**: `https://bgroundrobin.com/.netlify/functions/ncaa-mbb-predictions-github`

## How It Works

1. **GitHub Actions** (in NCAA MBB Model repo):
   - Runs daily at 10 AM ET
   - Executes `scripts/ncaabb/run_daily_variant_b_live.py`
   - Generates `variant_b_picks_odds_aware_2025-12-09.json`
   - Commits to repo

2. **Netlify Function** (this repo):
   - Fetches: `https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_${today}.json`
   - Transforms data to match NBA Elite V2 format
   - Returns JSON with predictions

3. **React Frontend**:
   - Calls `/.netlify/functions/ncaa-mbb-predictions-github`
   - Displays picks in table
   - Shows edge %, confidence, stakes

## Next Steps

1. ✅ **DONE**: Created GitHub-based function
2. **TODO**: Update frontend to use new function path
3. **TODO**: Test on production
4. **TODO**: Remove old function (ncaa-mbb-predictions)

## Update Frontend

Change this line in `src/pages/NCAAMBBPredictions.jsx`:

```javascript
// OLD:
const response = await fetch(`/.netlify/functions/ncaa-mbb-predictions?_t=${timestamp}`);

// NEW:
const response = await fetch(`/.netlify/functions/ncaa-mbb-predictions-github?_t=${timestamp}`);
```

## Benefits

| Aspect | Old Approach | New Approach |
|--------|-------------|--------------|
| **Execution** | Run Python in Netlify | Fetch JSON from GitHub |
| **Dependencies** | Python + packages | None |
| **Timeout Risk** | 10-second limit | No timeout (just HTTP fetch) |
| **Build Complexity** | High (Python install) | Low (just Node) |
| **Debugging** | Check Netlify logs | Check GitHub Actions logs |
| **Speed** | Slow (runs model) | Fast (cached JSON) |
| **Reliability** | Medium | High |

## Example Response

```json
{
  "ok": true,
  "predictions": [
    {
      "game": "Clemson Tigers @ Brigham Young Cougars",
      "awayTeam": "Clemson Tigers",
      "homeTeam": "Brigham Young Cougars",
      "prediction": {
        "pick": "Brigham Young Cougars",
        "side": "home",
        "confidence": 21,
        "winProbability": {
          "favoriteTeam": "Brigham Young Cougars",
          "favoritePercent": 95.63,
          "underdogTeam": "Clemson Tigers",
          "underdogPercent": 4.37
        }
      },
      "vegasLines": {
        "moneyline": {
          "favorite": -295,
          "favoriteTeam": "Brigham Young Cougars",
          "underdog": 269,
          "underdogTeam": "Clemson Tigers"
        }
      },
      "betting": {
        "edge": 0.2095,
        "recommendedStake": 1000,
        "kellyFraction": 0.25,
        "maxExposure": 1000
      }
    }
  ],
  "metadata": {
    "totalPicks": 2,
    "totalStake": 1595,
    "avgEdge": 0.2057,
    "maxEdge": 0.2095,
    "date": "2025-12-09",
    "bankroll": 10000,
    "model": "NCAA Variant B",
    "minEdge": 0.1,
    "kellyFraction": 0.25
  },
  "generated": "2025-12-09T18:00:00.000Z",
  "source": "github"
}
```

## GitHub Actions Workflow

The NCAA MBB Model repo has this workflow:
- **File**: `.github/workflows/daily-picks-generation.yml`
- **Schedule**: Daily at 10 AM ET (15:00 UTC)
- **Runs**: `scripts/ncaabb/run_daily_variant_b_live.py`
- **Output**: `data/ncaabb/picks/variant_b_picks_odds_aware_YYYY-MM-DD.json`
- **Example run**: https://github.com/bgoldman22-code/NCAAMBBModel/actions/runs/20071381745

## Testing

Once deployed, test with:
```bash
curl "https://bgroundrobin.com/.netlify/functions/ncaa-mbb-predictions-github" | jq .
```

Expected:
- If picks exist for today: Returns JSON with predictions
- If no picks: Returns `{"ok": false, "message": "No games available for 2025-12-09..."}`

## Deployment Status

- ✅ Function committed: `9c986508`
- ✅ Pushed to main42
- 🔄 Awaiting Netlify deployment
- ⏳ Frontend update pending

---

**Created**: December 9, 2025  
**Status**: Ready to deploy  
**Integration**: GitHub Actions + Netlify Function + React Frontend

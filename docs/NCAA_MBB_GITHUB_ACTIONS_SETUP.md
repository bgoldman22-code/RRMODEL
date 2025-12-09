# NCAA MBB Integration - GitHub Actions Approach

## Setup Instructions

### 1. Add ODDS_API_KEY to GitHub Secrets

1. Go to: https://github.com/bgoldman22-code/RRMODEL/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ODDS_API_KEY`
4. Value: `YOUR_ODDS_API_KEY_HERE`
5. Click "Add secret"

### 2. Create Data Directory

```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL
mkdir -p data/ncaa-mbb
touch data/ncaa-mbb/.gitkeep
```

### 3. Update Netlify Function

Replace the current Netlify function with this simpler version that just reads the static file:

```javascript
// See: netlify/functions/ncaa-mbb-predictions/index-static.mjs
```

### 4. Test the Workflow

**Manual Trigger:**
1. Go to: https://github.com/bgoldman22-code/RRMODEL/actions
2. Select "Generate NCAA MBB Picks"
3. Click "Run workflow" → "Run workflow"
4. Wait 2-3 minutes
5. Check if `data/ncaa-mbb/latest.json` was committed

**Automatic Schedule:**
- Runs daily at 3 PM UTC (10 AM ET)
- Perfect timing for NCAA basketball (games start in evening)

### 5. Deploy to Netlify

```bash
git add .github/workflows/ncaa-mbb-picks.yml
git add data/ncaa-mbb/
git add netlify/functions/ncaa-mbb-predictions/index.mjs
git commit -m "feat: NCAA MBB integration via GitHub Actions"
git push origin main42
```

## How It Works

```
┌─────────────────────┐
│   GitHub Actions    │
│   (Daily 10 AM ET)  │
└──────────┬──────────┘
           │
           ├─ Checkout RRMODEL
           ├─ Checkout NCAAMBBModel
           ├─ Run Python: generate picks
           ├─ Copy picks to data/ncaa-mbb/latest.json
           └─ Git commit + push
                      │
                      ▼
           ┌─────────────────────┐
           │   Netlify Deploy    │
           │  (Auto-triggered)   │
           └──────────┬──────────┘
                      │
                      ▼
           ┌─────────────────────┐
           │  Netlify Function   │
           │  (Reads JSON file)  │
           └──────────┬──────────┘
                      │
                      ▼
           ┌─────────────────────┐
           │   React Frontend    │
           │  (Shows picks)      │
           └─────────────────────┘
```

## Advantages

✅ **No Python on Netlify** - Just reads JSON  
✅ **Fast response** - Static file read (< 100ms)  
✅ **No timeouts** - GitHub Actions has 6 hour limit  
✅ **Easy debugging** - Check workflow logs  
✅ **Automatic** - Runs daily, no manual work  
✅ **Cacheable** - Can CDN cache the JSON  

## Fallback Behavior

If today's picks aren't available yet:
- Function returns: "No picks available for today"
- Shows last available date
- User can check back later

## Testing

### Test GitHub Actions Workflow:
```bash
# Go to GitHub Actions and manually trigger
https://github.com/bgoldman22-code/RRMODEL/actions
```

### Test Netlify Function Locally:
```bash
# Start Netlify dev server
npx netlify dev

# In another terminal:
curl http://localhost:8888/.netlify/functions/ncaa-mbb-predictions | jq .
```

### Test Production:
```bash
curl https://bgroundrobin.com/.netlify/functions/ncaa-mbb-predictions | jq .
```

## Troubleshooting

**Problem:** Workflow fails with "pip: command not found"  
**Solution:** GitHub Actions uses Python 3.11, pip should be available

**Problem:** No picks generated  
**Solution:** Check if there are games today. NCAA season runs Nov-Apr.

**Problem:** ODDS_API_KEY not working  
**Solution:** Verify secret is named exactly `ODDS_API_KEY` in GitHub Secrets

**Problem:** Git push fails from workflow  
**Solution:** Check that GitHub token has write permissions

## Next Steps

1. Add `ODDS_API_KEY` to GitHub Secrets ✓
2. Create `data/ncaa-mbb/` directory ✓
3. Update Netlify function to read static file
4. Test workflow manually
5. Deploy to production
6. Monitor first automatic run tomorrow at 10 AM ET

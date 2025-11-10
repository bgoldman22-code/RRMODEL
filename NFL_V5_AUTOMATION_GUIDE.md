# NFL V5 Automation - Complete Setup Guide

## ✅ What's Been Built

The NFL V5 prediction system is now fully automated, matching how V1 works on `/predictions`.

### Components Created:

1. **`nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs`**
   - Generates the V5 bundle by calling the prediction endpoint
   - Fetches Vegas odds automatically
   - Formats predictions into the V5 bundle structure
   - Writes to `output/bundle_v5.json`

2. **`upload_v5_now.mjs`**
   - Uploads bundle to Netlify Blobs
   - Stores at multiple keys (latest, by-date, by-week)
   - Can be run locally or in CI/CD

3. **`netlify/functions/nfl-v5-upload.mjs`**
   - HTTP endpoint to trigger upload
   - Can be called via webhook or GitHub Action

4. **`netlify/functions/nfl-v5-weekly-refresh.mjs`**
   - **Scheduled function** (runs automatically)
   - Triggers every Tuesday 10:00 AM ET (14:00 UTC)
   - Generates predictions + uploads to Blobs
   - No manual intervention needed

5. **Serving Endpoints** (already created):
   - `/.netlify/functions/nfl-v5-latest` - Latest predictions
   - `/.netlify/functions/nfl-v5-by-date` - Historical predictions
   - `/.netlify/functions/nfl-v5-refresh` - Status check

---

## 🚀 How to Enable This

### Option A: Automatic Weekly Updates (Recommended)

The scheduled function is already configured in `netlify.toml`:

```toml
[[scheduled.functions]]
  name = "nfl-v5-weekly-refresh"
  cron = "0 14 * * 2"  # Tuesday 10am ET
```

**This will automatically:**
1. Generate predictions every Tuesday morning
2. Upload to Netlify Blobs
3. Make them available on the website

**No manual steps needed!** Just deploy and it works.

### Option B: Manual Trigger (For Testing)

If you want to manually refresh:

```bash
# Method 1: Via HTTP endpoint
curl -X POST https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-upload

# Method 2: Run locally
cd /path/to/RRMODEL
node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
node upload_v5_now.mjs
```

### Option C: GitHub Action (Alternative to Netlify Scheduled)

If you prefer GitHub Actions instead of Netlify's scheduler:

Create `.github/workflows/nfl-v5-refresh.yml`:

```yaml
name: NFL V5 Weekly Refresh

on:
  schedule:
    - cron: '0 14 * * 2'  # Tuesday 10am ET
  workflow_dispatch:  # Manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Generate V5 Bundle
        run: node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
        env:
          NETLIFY_FUNCTION_URL: https://roundrobinrecs.netlify.app/.netlify/functions
      
      - name: Upload to Netlify
        run: |
          curl -X POST \
            https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-upload \
            -H "Authorization: Bearer ${{ secrets.UPLOAD_SECRET }}"
```

---

## 📋 Deployment Checklist

### Initial Setup (One Time):

1. **Deploy the functions:**
   ```bash
   cd /path/to/RRMODEL
   git add netlify/functions/nfl-v5-*.mjs
   git add nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
   git add upload_v5_now.mjs
   git add netlify.toml
   git commit -m "Add NFL V5 automation pipeline"
   git push
   ```

2. **Verify deployment:**
   - Check Netlify dashboard → Functions
   - Confirm `nfl-v5-weekly-refresh` is listed under Scheduled Functions
   - Confirm `nfl-v5-upload`, `nfl-v5-latest`, `nfl-v5-by-date` are deployed

3. **Initial data upload:**
   ```bash
   # Generate first bundle
   node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
   
   # Upload it (requires Netlify CLI auth)
   netlify functions:invoke nfl-v5-upload
   ```

4. **Test the endpoints:**
   ```bash
   # Should return predictions
   curl https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-latest
   
   # Should show metadata
   curl https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-refresh
   ```

### Weekly Verification (Automated):

Every Tuesday at 10 AM ET, the system will:
- ✅ Auto-generate predictions for current week
- ✅ Auto-upload to Netlify Blobs
- ✅ Auto-update the website

**Check Netlify logs** to confirm it ran successfully:
- Netlify Dashboard → Functions → nfl-v5-weekly-refresh → Logs

---

## 🔧 Environment Variables

### Required (Already Set in Netlify):
- `NETLIFY_SITE_ID` - Auto-provided by Netlify
- `NETLIFY_AUTH_TOKEN` - Auto-provided by Netlify (for Blobs)

### Optional (For Local Development):
```bash
# In .env file
NETLIFY_FUNCTION_URL=https://roundrobinrecs.netlify.app/.netlify/functions
NFL_SEASON=2025  # Override season (defaults to current year)
NFL_WEEK=10      # Override week (defaults to auto-detected)
```

---

## 📊 How It Works (Technical Flow)

```
1. Tuesday 10am ET: Netlify triggers nfl-v5-weekly-refresh
                    ↓
2. Function calls nfl-schedule-get to get current week's games
                    ↓
3. Function calls nfl-predictions-generate with games
   (This is where V5 model logic runs - no changes to math)
                    ↓
4. 12-make-public-bundle-v5.mjs formats predictions into bundle
                    ↓
5. upload_v5_now.mjs pushes bundle to Netlify Blobs
                    ↓
6. Frontend calls nfl-v5-latest to display picks
```

---

## 🧪 Testing

### Test Bundle Generation:
```bash
cd /path/to/RRMODEL
NFL_WEEK=10 NFL_SEASON=2025 node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
```

Expected output:
```
🏈 NFL V5 Bundle Generator
==================================================
📅 Season: 2025, Week: 10
📋 Step 1: Fetching schedule...
✅ Found 14 games
🎯 Step 2: Generating V5 predictions...
✅ Generated 14 predictions
📦 Step 3: Creating bundle...
✅ Bundle created with 14 games
💾 Step 4: Writing bundle...
✅ Written to: /path/to/output/bundle_v5.json
```

### Test Upload (Local):
```bash
# Requires Netlify CLI authenticated
netlify functions:invoke nfl-v5-upload
```

### Test Upload (Production):
```bash
curl -X POST https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-upload
```

### Test Scheduled Function (Manual Trigger):
```bash
netlify functions:invoke nfl-v5-weekly-refresh
```

---

## 🐛 Troubleshooting

### "No predictions available" Error
**Problem:** Blobs storage is empty  
**Solution:**
```bash
node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
netlify functions:invoke nfl-v5-upload
```

### "Failed to generate predictions" Error
**Problem:** nfl-predictions-generate endpoint is down  
**Solution:** Check Netlify function logs for the main prediction generator

### Scheduled Function Not Running
**Problem:** Cron schedule not configured  
**Solution:** Verify in `netlify.toml` and check Netlify Dashboard → Functions → Scheduled

### Wrong Week Showing
**Problem:** Bundle has old week data  
**Solution:**
```bash
# Force regenerate current week
node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs
netlify functions:invoke nfl-v5-upload
```

---

## 📝 Summary

### What Changed:
- ❌ **NO changes to V5 model logic** (spread/total calculations unchanged)
- ✅ **Added automation layer** (bundle generation + upload)
- ✅ **Added weekly scheduler** (automatic updates)
- ✅ **Added serving endpoints** (API to fetch predictions)

### What You Need to Do:
1. **Deploy once** (git push)
2. **Upload initial data** (one-time command)
3. **That's it!** System runs automatically every week

### Maintenance:
- **Zero ongoing maintenance** - fully automated
- **Optional:** Check logs on Tuesdays to verify successful runs
- **Optional:** Add notification webhooks to nfl-v5-weekly-refresh

---

## 🎯 Next Steps

1. Deploy these files to production
2. Run initial upload manually
3. Verify V5 page shows current week's picks
4. Let it run automatically from then on

Questions? Check the function logs in Netlify Dashboard.

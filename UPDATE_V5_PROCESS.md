# NFL V5 Model - Current Status & Fix Plan

## Current Issue
The NFL V5 model is showing picks from weeks 2-6 instead of the current week (Week 10).

## Root Cause
1. The V5 bundle generation scripts are **empty files** (not implemented)
2. The bundle_v5.json exists but was manually created 
3. The data has NOT been uploaded to Netlify Blobs 
4. The frontend endpoints were empty, so they couldn't serve the data

## What Was Fixed Today (Nov 10)
✅ Created `/netlify/functions/nfl-v5-latest.mjs` - serves latest V5 predictions from Netlify Blobs
✅ Created `/netlify/functions/nfl-v5-by-date.mjs` - serves V5 predictions by date
✅ Created `/netlify/functions/nfl-v5-refresh.mjs` - refresh endpoint

## What Still Needs to Be Done

### IMMEDIATE (To fix current week display):
1. **Upload current week data to Netlify Blobs**
   - The bundle_v5.json file exists locally with Week 10 data
   - Need to run: `netlify functions:invoke nfl-v5-upload` (once that function is deployed)
   - OR manually upload via Netlify dashboard

2. **Deploy the functions**
   - The functions are created but deployment is failing due to unrelated ff-weekly-roast errors
   - Need to either fix ff-weekly-roast OR deploy only specific functions

### FOR ONGOING WEEKLY UPDATES:
3. **Implement the bundle generation script**
   - File: `nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs` (currently empty)
   - This script needs to:
     - Detect current NFL week automatically
     - Read predictions from the model output files
     - Format them into the V5 bundle structure
     - Save to `nfl-model-v4.1/output/bundle_v5.json`

4. **Automate the upload process**
   - Option A: Scheduled Netlify function that runs weekly
   - Option B: GitHub Action that runs after model predictions
   - Option C: Manual script that you run each week

5. **Set up the weekly prediction pipeline**
   - Ensure the R/Python models run weekly for the current week
   - Ensure they output in the format expected by the bundle script
   - Trigger the bundle creation and upload

## Quick Fix for This Week
Run this command once the deployment succeeds:
```bash
# This will upload the local bundle_v5.json to Netlify Blobs
node upload_v5_now.mjs
```

## Long-term Architecture Recommendation
Set up a GitHub Action that:
1. Runs Tuesday/Wednesday (after week starts)
2. Runs the model predictions for current week
3. Generates the bundle_v5.json
4. Uploads to Netlify Blobs via API
5. Sends notification on completion

This ensures fresh predictions every week automatically.

# 🚀 DEPLOYMENT CHECKLIST - Fantasy Sit/Start Tool

## ✅ COMPLETED (Development)

- [x] Created 7 Netlify Functions files (~1,800 lines)
- [x] Created React frontend component (FantasySitStart.jsx)
- [x] Added to App.jsx NFL dropdown menu
- [x] All code committed and ready to push

---

## ⚠️ CRITICAL - BEFORE PUSHING TO PRODUCTION

### 1. Set Environment Variables in Netlify (REQUIRED)

**Go to:** Netlify Dashboard → Site Settings → Environment Variables

Add these **BEFORE** deploying:

```bash
# Yahoo OAuth (REQUIRED)
YAHOO_CLIENT_ID=your_yahoo_client_id_here
YAHOO_CLIENT_SECRET=your_yahoo_client_secret_here
YAHOO_REDIRECT_URI=https://bgroundrobin.com/.netlify/functions/ff-auth-callback

# TheOddsAPI (REQUIRED)
ODDS_API_KEY=your_theoddsapi_key_here

# Endpoint Protection (OPTIONAL - recommended for production)
FF_API_KEY=your_secret_api_key_here

# Cache Settings (OPTIONAL - defaults work fine)
CACHE_TTL_SECONDS=3600
```

**⚠️ CRITICAL:** You need to get these credentials first:

#### A. Yahoo OAuth Credentials
1. Go to: https://developer.yahoo.com/apps/
2. Create new app or use existing app
3. Set **Redirect URI** to: `https://bgroundrobin.com/.netlify/functions/ff-auth-callback`
4. Copy **Client ID** and **Client Secret**

#### B. TheOddsAPI Key
- You already have this: Check `.env` file or previous configs
- Should look like: `REDACTED_32_CHAR_HEX_STRING`
- ⚠️ Never commit actual API keys - always use environment variables
- Get new key from: https://the-odds-api.com/

---

### 2. Push Code to Production

**Once env vars are set in Netlify:**

```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL

# Stage all new files
git add netlify/functions/
git add src/pages/FantasySitStart.jsx
git add src/App.jsx
git add NETLIFY_FUNCTIONS_FANTASY_SITSTART.md
git add DEPLOYMENT_CHECKLIST_FANTASY_SITSTART.md

# Commit
git commit -m "Add Fantasy Sit/Start tool with Netlify Functions + React UI

- Created 7 Netlify Functions (OAuth + ff-run endpoint)
- Added React frontend with tier display and FLEX swaps
- Integrated with Yahoo Fantasy API + TheOddsAPI
- Added to NFL dropdown menu in App.jsx"

# Push to main
git push origin main
```

**Netlify will auto-deploy** once pushed.

---

### 3. Test OAuth Flow (CRITICAL)

**After deployment completes:**

1. Navigate to: https://bgroundrobin.com/fantasy-sitstart
2. Click **"Authenticate with Yahoo"**
3. You should be redirected to Yahoo login
4. Approve the app
5. You should be redirected back to callback with **"Authentication Successful!"** message
6. Check Netlify function logs for: `"OAuth tokens saved successfully to Blobs"`

**If OAuth fails:**
- Check Netlify function logs for errors
- Verify `YAHOO_REDIRECT_URI` matches exactly (case-sensitive)
- Ensure Yahoo app has correct redirect URI registered
- Check that env vars are set correctly (no typos)

---

### 4. Test Full Pipeline

**After successful OAuth:**

1. Go back to: https://bgroundrobin.com/fantasy-sitstart
2. (Optional) Enter NFL week number
3. Click **"Get Sit/Start Recommendations"**
4. Should see:
   - League info banner (league name, week, scoring)
   - Starting lineup with tiers (S/A/B/C/D) color-coded
   - Bench players
   - FLEX swap suggestions (if any)
   - Reasons for each player (2-4 bullets)

**Expected Response Time:**
- First request: 5-10 seconds (fetching from APIs)
- Cached requests: 1-2 seconds (cache TTL: 1h)

**Common Issues:**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Authentication required" | Tokens not saved or expired | Re-run OAuth flow |
| "No props available" | TheOddsAPI data not yet available | Wait until Tuesday after games (props released) |
| "Missing ODDS_API_KEY" | Env var not set | Add to Netlify dashboard |
| 401 Unauthorized | FF_API_KEY protection enabled | Add `x-api-key` header or remove FF_API_KEY env var |
| Slow response | API rate limits | Normal for first request, should cache after |

---

## 🎯 PRODUCTION READINESS CHECKLIST

### Before Going Live:

- [ ] **Yahoo OAuth App Created**
  - [ ] Redirect URI set to: `https://bgroundrobin.com/.netlify/functions/ff-auth-callback`
  - [ ] Client ID copied
  - [ ] Client Secret copied (keep secret!)

- [ ] **Netlify Environment Variables Set**
  - [ ] YAHOO_CLIENT_ID
  - [ ] YAHOO_CLIENT_SECRET
  - [ ] YAHOO_REDIRECT_URI (exact match!)
  - [ ] ODDS_API_KEY
  - [ ] FF_API_KEY (optional but recommended)

- [ ] **Code Pushed to Git**
  - [ ] All 7 Netlify Functions committed
  - [ ] React frontend committed
  - [ ] App.jsx updated with new route
  - [ ] Pushed to `main` branch

- [ ] **Deployment Complete**
  - [ ] Netlify build succeeded (no errors)
  - [ ] Functions deployed successfully
  - [ ] React app rebuilt with new component

### After Going Live:

- [ ] **OAuth Test Passed**
  - [ ] Can click "Authenticate with Yahoo"
  - [ ] Redirected to Yahoo successfully
  - [ ] Redirected back with success message
  - [ ] Tokens saved to Netlify Blobs (check logs)

- [ ] **Full Pipeline Test Passed**
  - [ ] Can fetch recommendations without errors
  - [ ] Starters displayed with correct tiers
  - [ ] Bench displayed
  - [ ] FLEX swaps shown (if applicable)
  - [ ] Reasons displayed for each player
  - [ ] League info matches user's league

- [ ] **Performance Check**
  - [ ] First request completes in <10s
  - [ ] Second request faster (cache hit)
  - [ ] No timeout errors

---

## 📊 SUCCESS METRICS

Once live, monitor these:

1. **OAuth Completion Rate**: % of users who successfully link Yahoo account
2. **API Response Times**: Should be <5s after caching kicks in
3. **Error Rate**: Should be <5% (mostly "no props available" before Tuesday)
4. **User Engagement**: Repeat visits (users coming back each week)

---

## 🔧 TROUBLESHOOTING GUIDE

### Issue: Netlify Build Fails

**Cause:** Missing dependencies or syntax errors

**Fix:**
```bash
# Check if @netlify/blobs is available (should be by default)
# If not, functions won't work - contact Netlify support
```

### Issue: "Missing YAHOO_CLIENT_ID environment variable"

**Cause:** Env vars not set in Netlify

**Fix:**
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add all required vars
3. **Redeploy** (env var changes require redeploy)

### Issue: OAuth Redirect Loops

**Cause:** Redirect URI mismatch

**Fix:**
1. Check Yahoo app settings: Must be `https://bgroundrobin.com/.netlify/functions/ff-auth-callback`
2. Check Netlify env var: Must match exactly (no trailing slash)
3. Check for typos, case sensitivity

### Issue: "No leagues found"

**Cause:** User doesn't have fantasy leagues for current season

**Fix:**
- User needs to join a Yahoo Fantasy Football league
- Or wait until next season starts

### Issue: Blank recommendations (empty starters)

**Cause:** User's team has no players, or API returned empty roster

**Fix:**
- Check that user has drafted a team
- Try specifying `league` and `team` query params manually
- Check Netlify function logs for API errors

---

## 🎉 YOU'RE READY TO GO LIVE!

**Summary:**
1. ✅ Code is complete (9 files created)
2. ⚠️ Set env vars in Netlify (CRITICAL - do this first)
3. 🚀 Push to Git and deploy
4. 🧪 Test OAuth flow
5. ✅ Test full pipeline

**Once all checkboxes are green, your Fantasy Sit/Start tool will be live at:**
https://bgroundrobin.com/fantasy-sitstart

---

**Need Help?**
- Check Netlify function logs: Dashboard → Functions → Select function → Logs
- Check browser console for frontend errors: F12 → Console tab
- Review: `NETLIFY_FUNCTIONS_FANTASY_SITSTART.md` for detailed API docs

Good luck! 🍀

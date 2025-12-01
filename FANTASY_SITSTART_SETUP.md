# Fantasy Sit/Start Setup Guide

## ✅ Completed

1. **Fantasy Functions Integration**
   - All Fantasy Football serverless functions copied to `netlify/functions/`
   - Functions: ff-run.mjs, ff-auth-start.mjs, ff-auth-callback.mjs, ff-get-leagues.mjs, ff-debug-leagues.mjs, ff-weekly-roast.mjs
   - Utilities in `_lib/`: ff-scoring.mjs (457 lines), ff-yahoo.mjs (494 lines), ff-odds.mjs (428 lines), ff-blobs.mjs (310 lines), ff-cookies.mjs (188 lines)

2. **RRMODEL Integration**
   - Created `src/pages/FantasySitStart.jsx` component
   - Added "Fantasy Sit/Start 🏈" to NFL dropdown menu
   - Routing configured at `/fantasy-sitstart`
   - Uses local Netlify functions hosted on bgroundrobin.com (no separate deployment needed)

## 🚀 Setup Steps

### Step 1: Configure Yahoo API Credentials

You need Yahoo API credentials for OAuth authentication.

#### Get Yahoo Credentials:
1. Go to https://developer.yahoo.com/apps/
2. Create a new app or use existing one
3. Set **Redirect URI** to: `https://bgroundrobin.com/.netlify/functions/ff-auth-callback`
4. Copy your **Client ID** and **Client Secret**

#### Add to Netlify:
1. In Netlify dashboard → RRMODEL site → Site settings → Environment variables
2. Add these variables:
   ```
   YAHOO_CLIENT_ID=your_client_id_here
   YAHOO_CLIENT_SECRET=your_client_secret_here
   YAHOO_REDIRECT_URI=https://bgroundrobin.com/.netlify/functions/ff-auth-callback
   ```

### Step 2: Optional - Add Odds API Key

For enhanced player props and game context:

1. In Netlify (RRMODEL) → Site settings → Environment variables
2. Add your The Odds API key (get one at https://the-odds-api.com):
   ```
   ODDS_API_KEY=your_odds_api_key_here
   ```
   **⚠️ Security Note:** Never commit actual API keys to the repository. Store them only in Netlify's environment variables.

### Step 3: Deploy and Test

1. The functions are already in the repo, so they'll deploy automatically with your next commit
2. Visit https://bgroundrobin.com/fantasy-sitstart
3. Click "Connect Yahoo Account"
4. Authorize with Yahoo
5. Select your league and week
6. Click "Get Sit/Start Recommendations"

## 🏗️ Architecture

```
User Browser
    ↓
RRMODEL Frontend (bgroundrobin.com)
    ↓ Calls /.netlify/functions/ff-*
RRMODEL Netlify Functions
    ↓
Yahoo Fantasy API + Odds API
```

**All-in-One Deployment:**
- Frontend and backend both hosted on bgroundrobin.com
- No separate FantasyAI deployment needed
- Single Netlify site with integrated functions

**Key Components:**

### Netlify Functions (Backend)
- `ff-auth-start.mjs` - Initiates Yahoo OAuth flow
- `ff-auth-callback.mjs` - Handles OAuth callback, stores tokens in Netlify Blobs
- `ff-get-leagues.mjs` - Fetches user's fantasy leagues
- `ff-run.mjs` - Main analysis endpoint:
  - Fetches roster data from Yahoo
  - Gets betting lines and props from Odds API
  - Calculates Expected Fantasy Points (EFP)
  - Generates sit/start recommendations
  - Suggests FLEX optimizations
- `ff-debug-leagues.mjs` - Debug endpoint for troubleshooting
- `ff-weekly-roast.mjs` - AI-powered weekly league roasts (bonus feature)

### Frontend (React Component)
- `src/pages/FantasySitStart.jsx`:
  - Handles authentication flow
  - League/week selection
  - Displays recommendations with color-coded cards (green=START, red=SIT)
  - Shows FLEX swap suggestions
  - Integrated into NFL dropdown menu

## 📊 Features

### Sit/Start Analysis
- **Player projections** based on matchup, props, and scoring settings
- **Tier system** (1-5) for ranking players within positions
- **Detailed reasons** explaining each recommendation
- **FLEX optimization** suggesting better lineup configurations

### Data Sources
- Yahoo Fantasy roster and scoring settings
- The Odds API for game lines, spreads, totals
- Player props (passing yards, rushing yards, receiving yards, TDs)

### Scoring Methods
- Expected Fantasy Points (EFP) calculation
- Multi-TD bonus support
- League-specific scoring rules (PPR, standard, etc.)
- Matchup context (home/away, spread, total)

## 🔐 Security Notes

1. **OAuth tokens** stored in Netlify Blobs (key-value store)
2. **Auto-refresh** handles expired Yahoo tokens
3. **Optional API key protection** (set `FF_API_KEY` env var to require x-api-key header)
4. **CORS** configured for cross-origin requests
5. **Secret scanning** - Never commit API keys or secrets to the repository

## 🐛 Troubleshooting

### Build fails with "Secrets scanning detected secrets"
- **Cause:** An actual API key was committed to the repository
- **Fix:** Remove the key from all files, replace with placeholder like `your_api_key_here`
- **Prevention:** Always use environment variables, never hardcode secrets

### "Not authenticated" error
- Check Yahoo credentials in Netlify env vars (YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET)
- Verify redirect URI matches exactly: `https://bgroundrobin.com/.netlify/functions/ff-auth-callback`
- Clear browser cookies and retry authentication

### "Failed to fetch recommendations"
- Check Netlify function logs for errors
- Verify Yahoo OAuth tokens are valid
- Check browser console for CORS or network errors

### "No leagues found"
- Make sure you've authorized the correct Yahoo account
- Verify you have active fantasy football leagues for current season
- Check Netlify function logs (`ff-get-leagues`) for API errors

## 🔗 Related Files

**RRMODEL:**
- `src/pages/FantasySitStart.jsx` - Frontend component
- `src/App.jsx` - Menu and routing

**Netlify Functions:**
- `netlify/functions/ff-run.mjs` - Main analysis endpoint (11,315 bytes)
- `netlify/functions/ff-auth-start.mjs` - OAuth start (1,577 bytes)
- `netlify/functions/ff-auth-callback.mjs` - OAuth callback (7,445 bytes)
- `netlify/functions/ff-get-leagues.mjs` - Fetch user leagues (2,493 bytes)
- `netlify/functions/ff-debug-leagues.mjs` - Debug endpoint (3,912 bytes)
- `netlify/functions/ff-weekly-roast.mjs` - Bonus roast feature (25,030 bytes)

**Utilities (_lib/):**
- `netlify/functions/_lib/ff-scoring.mjs` - EFP calculations (14,390 bytes)
- `netlify/functions/_lib/ff-yahoo.mjs` - Yahoo API integration (17,094 bytes)
- `netlify/functions/_lib/ff-odds.mjs` - Odds API integration (16,405 bytes)
- `netlify/functions/_lib/ff-blobs.mjs` - Netlify Blobs storage for tokens (9,185 bytes)
- `netlify/functions/_lib/ff-cookies.mjs` - Cookie utilities (6,099 bytes)

**Total:** 2,382 lines of core logic + UI components

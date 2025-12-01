# Fantasy Sit/Start Setup Guide

## ✅ Completed

1. **FantasyAI Repository Setup**
   - Created standalone repo: https://github.com/bgoldman22-code/FantasyAI
   - Added `netlify.toml` configuration
   - All serverless functions ready (ff-run.mjs, ff-auth-start.mjs, ff-auth-callback.mjs, etc.)

2. **RRMODEL Integration**
   - Created `src/pages/FantasySitStart.jsx` component
   - Added "Fantasy Sit/Start 🏈" to NFL dropdown menu
   - Routing configured at `/fantasy-sitstart`

## 🚀 Deployment Steps

### Step 1: Deploy FantasyAI to Netlify

1. Go to https://app.netlify.com/
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub and select `bgoldman22-code/FantasyAI`
4. Build settings (should auto-detect from netlify.toml):
   - **Build command:** `echo 'No build needed - serverless functions only'`
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`
5. Click "Deploy site"
6. Note your site URL (e.g., `https://fantasyai-xyz.netlify.app`)

### Step 2: Configure Yahoo API Credentials

You need Yahoo API credentials for OAuth authentication.

#### Get Yahoo Credentials:
1. Go to https://developer.yahoo.com/apps/
2. Create a new app or use existing one
3. Set **Redirect URI** to: `https://YOUR-FANTASYAI-SITE.netlify.app/.netlify/functions/ff-auth-callback`
4. Copy your **Client ID** and **Client Secret**

#### Add to Netlify:
1. In Netlify dashboard → Site settings → Environment variables
2. Add these variables:
   ```
   YAHOO_CLIENT_ID=your_client_id_here
   YAHOO_CLIENT_SECRET=your_client_secret_here
   YAHOO_REDIRECT_URI=https://YOUR-FANTASYAI-SITE.netlify.app/.netlify/functions/ff-auth-callback
   ```

### Step 3: Optional - Add Odds API Key

For enhanced player props and game context:

1. In Netlify (FantasyAI) → Environment variables
2. Add:
   ```
   ODDS_API_KEY=c5d3fe15e6c5be83b2acd8695cff012b
   ```

### Step 4: Update RRMODEL Configuration

1. Open `src/pages/FantasySitStart.jsx`
2. Update line 5:
   ```javascript
   const FANTASY_API_BASE = 'https://YOUR-FANTASYAI-SITE.netlify.app/.netlify/functions';
   ```
3. Commit and push:
   ```bash
   git add src/pages/FantasySitStart.jsx
   git commit -m "Update Fantasy API base URL"
   git push origin main42
   ```

## 🧪 Testing

### Test FantasyAI Functions Directly:

1. **Check authentication endpoint:**
   ```bash
   curl https://YOUR-FANTASYAI-SITE.netlify.app/.netlify/functions/ff-auth-start
   ```
   Should redirect to Yahoo OAuth

2. **Test with authenticated session:**
   After logging in via the frontend, check:
   ```bash
   curl https://YOUR-FANTASYAI-SITE.netlify.app/.netlify/functions/ff-get-leagues
   ```

### Test RRMODEL Frontend:

1. Visit https://bgroundrobin.com/fantasy-sitstart
2. Click "Connect Yahoo Account"
3. Authorize with Yahoo
4. Select your league and week
5. Click "Get Sit/Start Recommendations"

## 🏗️ Architecture

```
User Browser
    ↓
RRMODEL Frontend (bgroundrobin.com)
    ↓ API calls
FantasyAI Netlify Functions
    ↓
Yahoo Fantasy API + Odds API
```

**Key Components:**

### FantasyAI (Backend)
- `ff-auth-start.mjs` - Initiates Yahoo OAuth flow
- `ff-auth-callback.mjs` - Handles OAuth callback, stores tokens in KV
- `ff-get-leagues.mjs` - Fetches user's fantasy leagues
- `ff-run.mjs` - Main analysis endpoint:
  - Fetches roster data
  - Gets betting lines and props
  - Calculates Expected Fantasy Points (EFP)
  - Generates sit/start recommendations
  - Suggests FLEX optimizations

### RRMODEL (Frontend)
- `FantasySitStart.jsx` - React component:
  - Handles authentication flow
  - League/week selection
  - Displays recommendations with color-coded cards
  - Shows FLEX swap suggestions

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
- League-specific scoring rules
- Matchup context (home/away, spread, total)

## 🔐 Security Notes

1. **OAuth tokens** stored in Netlify KV (key-value store)
2. **Auto-refresh** handles expired tokens
3. **Optional API key protection** (set `FF_API_KEY` env var to require x-api-key header)
4. **CORS** configured for cross-origin requests

## 🐛 Troubleshooting

### "Not authenticated" error
- Check Yahoo credentials in Netlify env vars
- Verify redirect URI matches exactly
- Clear browser cookies and retry authentication

### "Failed to fetch recommendations"
- Check FantasyAI site is deployed and functions are live
- Verify FANTASY_API_BASE URL is correct in RRMODEL
- Check browser console for CORS errors

### "No leagues found"
- Make sure you've authorized the correct Yahoo account
- Verify you have active fantasy football leagues
- Check Netlify function logs for errors

## 📝 Future Enhancements

Potential additions:
- [ ] Waiver wire recommendations
- [ ] Trade analyzer
- [ ] Season-long projections
- [ ] Head-to-head matchup predictions
- [ ] Player consistency scoring
- [ ] Injury impact analysis
- [ ] Weekly roast feature integration

## 🔗 Related Files

**RRMODEL:**
- `src/pages/FantasySitStart.jsx` - Frontend component
- `src/App.jsx` - Menu and routing

**FantasyAI:**
- `netlify/functions/ff-run.mjs` - Main analysis endpoint
- `netlify/functions/_lib/ff-scoring.mjs` - EFP calculations (457 lines)
- `netlify/functions/_lib/ff-yahoo.mjs` - Yahoo API integration (494 lines)
- `netlify/functions/_lib/ff-odds.mjs` - Odds API integration (428 lines)
- `netlify/functions/_lib/ff-blobs.mjs` - KV storage for tokens (310 lines)

Total: **2,382 lines** of core logic + UI components

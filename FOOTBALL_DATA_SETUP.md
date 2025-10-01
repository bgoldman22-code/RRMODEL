# Football-Data.org API Setup

## Overview
The soccer BTTS prediction system now uses Football-Data.org for real-time fixture data instead of relying on hardcoded fallbacks.

## Setup Instructions

### 1. Get API Key
1. Visit: https://www.football-data.org/client/register
2. Register for a free account
3. Note your API key from the dashboard

### 2. Set Environment Variable in Netlify
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add new variable:
   - **Key**: `FOOTBALL_DATA_API_KEY`
   - **Value**: Your API key from step 1

### 3. API Limits
- **Free Tier**: 10 requests/minute, 100 requests/day
- **Paid Tier**: Higher limits, more competitions

### 4. Supported Competitions
- `PL` - Premier League
- `CL` - UEFA Champions League  
- `BL1` - Bundesliga
- `PD` - Primera Division (La Liga)
- `SA` - Serie A
- `FL1` - Ligue 1
- And many more...

## How It Works
1. System tries Football-Data.org API first
2. If API fails/quota exceeded, falls back to TheSportsDB
3. If both fail, uses hardcoded fixtures as last resort

## Benefits
- ✅ Real-time fixture data
- ✅ Accurate kickoff times
- ✅ Current season fixtures
- ✅ No manual updates needed
- ✅ Professional data source

## Monitoring
Check Netlify function logs for:
- `✅ Successfully fetched X fixtures from Football-Data.org`
- `⚠️ Football-Data.org rate limit exceeded`
- `⚠️ Football-Data.org API key invalid or missing`
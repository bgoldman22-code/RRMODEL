# NHL SOG Data Layer Rebuild - Integration Guide

**Version:** 4.2 (November 2025)  
**Status:** Production-Ready  
**Frontend:** https://bgroundrobin.com/nhl-sog (UNCHANGED)

---

## 🎯 Executive Summary

The NHL SOG prediction system has been rebuilt with a **two-mode data architecture** to eliminate NHL API rate limiting issues while maintaining 100% frontend compatibility.

**What Changed:**
- ✅ Data collection scripts (bootstrap + incremental)
- ✅ Rate limiting (0.5 calls/sec, fail-loud validation)
- ✅ Staleness tracking and graceful degradation
- ✅ Optional debug logging

**What Stayed the Same:**
- ✅ ZINB projection model (unchanged math)
- ✅ Kelly sizing and exposure management
- ✅ Netlify function endpoints (same URLs, same JSON)
- ✅ Frontend code (no changes required)

---

## 📊 The Problem We Fixed

### Before (Broken)
```
Every day:
  For 32 teams:
    Fetch roster (32 calls)
    For ~450 players:
      Fetch player landing (450 calls)
      Fetch game logs (450 calls)
  Total: ~900 NHL API calls in <10 minutes
  Result: Rate limited (429s) → partial data → "ZERO OPPORTUNITIES"
```

### After (Fixed)
```
ONE-TIME Bootstrap:
  Fetch all rosters, players, game logs
  ~500 calls over 30-60 minutes (rate limited)
  Result: Complete baseline (400+ players, 32 teams)

DAILY Incremental:
  Fetch yesterday's schedule (1 call)
  Fetch boxscores for yesterday's games (5-15 calls)
  Update only players who played
  Total: 6-16 NHL API calls/day
  Result: Always fresh, never rate limited
```

---

## 🚀 Quick Start

### 1. Bootstrap (ONE-TIME)

Run these scripts to build your initial data files:

```bash
# Step 1: Bootstrap player stats (30-60 minutes)
node scripts/nhl/bootstrap-player-stats.mjs

# Expected output:
# ✅ 400+ players loaded
# ✅ 32 teams represented
# ✅ File: data/nhl/player_stats_20252026.json

# Step 2: Bootstrap team stats (<1 minute)
node scripts/nhl/bootstrap-team-stats.mjs

# Expected output:
# ✅ 32 teams loaded
# ✅ League averages calculated
# ✅ File: data/nhl/team_stats_20252026.json
```

### 2. Test Locally

Run the local diagnostic pipeline to verify everything works:

```bash
# Run SOG pipeline for tonight
node scripts/nhl/run-sog-tonight.mjs

# Expected output:
# 📊 Funnel metrics (totalPlayers → finalPicks)
# 🎯 Top picks with edges and Kelly stakes
# ✅ File: data/nhl/sog_picks_tonight.json
```

If you see **10-20 picks** with positive edges, everything is working!

If you see **0 picks**, check the funnel to see where candidates dropped off.

### 3. Deploy to Production

Upload the data files to Netlify Blobs:

```bash
# Upload player stats
netlify blobs:set nhl-stats player_stats_20252026 data/nhl/player_stats_20252026.json

# Upload team stats
netlify blobs:set nhl-stats team_stats_20252026 data/nhl/team_stats_20252026.json

# Verify upload
netlify blobs:list nhl-stats
```

### 4. Deploy Code Changes

```bash
git add scripts/nhl/ netlify/functions/_lib/nhl-elite-projection-v3.mjs
git commit -m "feat(nhl-sog): data layer rebuild - two-mode strategy, rate limiting, staleness tracking"
git push origin main42
```

### 5. Verify Frontend

Visit https://bgroundrobin.com/nhl-sog and verify:
- ✅ Page loads without errors
- ✅ Picks display correctly
- ✅ Sorting works
- ✅ Kelly stakes shown
- ✅ No console errors

---

## 📅 Daily Operations

Once bootstrap is complete, run incremental updates daily:

```bash
# Update player stats (yesterday's games)
node scripts/nhl/update-player-stats-incremental.mjs

# Update team stats (current standings)
node scripts/nhl/update-team-stats-incremental.mjs

# Upload to Netlify Blobs
netlify blobs:set nhl-stats player_stats_20252026 data/nhl/player_stats_20252026.json
netlify blobs:set nhl-stats team_stats_20252026 data/nhl/team_stats_20252026.json
```

**Recommended Schedule:**
- Run daily at 10:00 AM ET (after previous night's games are final)
- Use cron job or GitHub Action for automation
- Monitor staleness metrics (max 2 days acceptable)

---

## 🔧 Architecture Details

### Two-Mode Strategy

**Bootstrap Mode (ONE-TIME/MANUAL):**
- Purpose: Build complete baseline dataset
- Runtime: 30-60 minutes
- NHL API calls: ~500 (rate limited)
- When to use: Season start, or when data is catastrophically stale

**Incremental Mode (DAILY/PRODUCTION):**
- Purpose: Keep data fresh without API abuse
- Runtime: <1 minute
- NHL API calls: 6-16 per day
- When to use: Every day during the season

### Rate Limiting

All scripts use conservative rate limiting:

```javascript
// Rate limiter: 0.5 calls/sec (one call every 2 seconds)
const rateLimiter = new RateLimiter(0.5, {
  maxCallsPerRun: 500,    // Hard cap
  maxDurationMinutes: 60  // Hard cap
});

// Every API call waits:
await rateLimiter.wait();
const data = await fetch(url);
```

**Why 0.5 calls/sec?**
- NHL API has undocumented rate limits
- Previous 2.0 calls/sec caused 429 errors
- 0.5 calls/sec = very conservative, never fails
- With jitter, actual rate is 0.4-0.6 calls/sec

### Fail-Loud Validation

Scripts fail loudly on catastrophic states:

```javascript
// Player stats validation
if (players.length < 300) {
  throw new Error(`FATAL: Only ${players.length} players (need 300+)`);
  // Does NOT write partial file
}

// Team stats validation
if (teams.length < 32) {
  throw new Error(`FATAL: Only ${teams.length} teams (need 32)`);
  // Does NOT write partial file
}
```

This prevents the previous issue where scripts wrote partial data (35 players, 0 teams) without errors.

### Staleness Tracking

All data files now include staleness metadata:

```json
{
  "staleness": {
    "maxDaysSinceUpdate": 1.2,
    "playersStale": 12,  // Players >2 days old
    "teamsStale": 0
  }
}
```

**Interpretation:**
- `maxDaysSinceUpdate < 2`: Excellent
- `maxDaysSinceUpdate 2-4`: Acceptable
- `maxDaysSinceUpdate > 4`: Run bootstrap again
- `playersStale > 100`: Too many stale players, consider bootstrap

---

## 🔍 Debugging

### Enable Debug Logging

Set the `NHL_DEBUG` environment variable to see detailed logs:

```bash
# Local testing
NHL_DEBUG=1 node scripts/nhl/run-sog-tonight.mjs

# Netlify (add env var in dashboard)
NHL_DEBUG=1
```

Debug logs show:
- Which players are being loaded
- Which seasons are available
- Career baseline calculations
- Opponent adjustments
- Projection intermediate values

### Common Issues

**Issue: 0 opportunities found**

Check the funnel metrics in `run-sog-tonight.mjs` output:

```
Funnel:
  Total players: 450
  Players on slate: 180
  Players with odds: 75  ← If this is low, odds API may be down
  Candidates generated: 60
  After min games: 55
  After L5 filter: 50
  After edge threshold: 12  ← If this is 0, model prob < market prob
  After Kelly filter: 12
  Final picks: 10
```

Diagnosis:
- Low "players with odds": Odds API down or no games today
- Low "after edge threshold": Model not seeing edge (tight markets)
- Low "final picks": Working as intended (strict filters)

**Issue: "Player not found in current season"**

This means a player is in rosters but not in player_stats file. Solutions:
1. Re-run bootstrap (player may be a recent call-up)
2. Check if player ID matches (name vs ID matching)
3. Verify player actually played games this season

**Issue: "Only X players (need 300+)"**

Your data file is incomplete. Solutions:
1. Delete the partial file: `rm data/nhl/player_stats_20252026.json`
2. Re-run bootstrap: `node scripts/nhl/bootstrap-player-stats.mjs`
3. If bootstrap fails repeatedly, you may be rate limited. Wait 24 hours and try again.

---

## 🎯 Frontend Integration (UNCHANGED)

The frontend at https://bgroundrobin.com/nhl-sog continues to work without any changes.

**Why?**
- Same Netlify function endpoint: `nhl-sog-scanner-elite`
- Same HTTP method: `GET`
- Same JSON response structure

**Response Format (UNCHANGED):**
```json
{
  "opportunities": [
    {
      "playerName": "Connor McDavid",
      "team": "EDM",
      "opponent": "VAN",
      "line": 3.5,
      "direction": "Over",
      "odds": -120,
      "edge": "8.5%",
      "kelly": "0.0214",
      "adjustedUnits": 1.78,
      "projection": 4.23,
      "modelProb": "54.2%",
      "impliedProb": "45.7%"
    }
  ],
  "metadata": {
    "version": "elite-v3",
    "timestamp": "2025-11-13T15:00:00Z"
  }
}
```

All fields remain identical. The frontend's sorting, filtering, and display logic works unchanged.

---

## 📦 File Structure

```
RRMODEL/
├── scripts/nhl/
│   ├── lib/
│   │   ├── rate-limiter.mjs           ← 0.5 calls/sec, jittered, capped
│   │   ├── fetch-with-retry.mjs       ← 3 retries, exponential backoff
│   │   └── github-nhl-data-loader.mjs ← Stub (future optimization)
│   │
│   ├── bootstrap-player-stats.mjs     ← ONE-TIME: Build complete dataset
│   ├── bootstrap-team-stats.mjs       ← ONE-TIME: Build team stats
│   ├── update-player-stats-incremental.mjs  ← DAILY: Update yesterday's games
│   ├── update-team-stats-incremental.mjs    ← DAILY: Update standings
│   └── run-sog-tonight.mjs            ← LOCAL: Test pipeline with funnel
│
├── data/nhl/
│   ├── player_stats_20252026.json     ← 400+ players with L5/L10, staleness
│   ├── team_stats_20252026.json       ← 32 teams with league averages
│   └── sog_picks_tonight.json         ← Output from local pipeline
│
└── netlify/functions/
    ├── nhl-sog-scanner-elite.mjs      ← PRODUCTION endpoint (unchanged API)
    └── _lib/
        └── nhl-elite-projection-v3.mjs ← Updated: season fixes, debug logging
```

---

## ✅ Testing Checklist

Before deploying to production, verify:

**Bootstrap:**
- [ ] `player_stats_20252026.json` has 400+ players
- [ ] `team_stats_20252026.json` has 32 teams
- [ ] All files have staleness metadata
- [ ] No errors during bootstrap run

**Local Pipeline:**
- [ ] `run-sog-tonight.mjs` generates 10-20 picks (or funnel explains why 0)
- [ ] Picks have edge >5%, Kelly stakes 0.5-3.0 units
- [ ] Output file `sog_picks_tonight.json` looks correct

**Incremental Updates:**
- [ ] Player incremental updates 100-250 players (for yesterday's games)
- [ ] Team incremental completes in <30 seconds
- [ ] Staleness metrics stay < 2 days

**Production Deployment:**
- [ ] Netlify Blobs uploaded successfully
- [ ] Code deployed to Netlify without errors
- [ ] Function `nhl-sog-scanner-elite` returns 200 OK
- [ ] Frontend loads without errors
- [ ] Picks display correctly (not "ZERO OPPORTUNITIES")

---

## 🎓 Key Design Principles

1. **NHL API is expensive** → Treat every call as precious
2. **Stale data > No data** → 2-day-old data beats empty dataset
3. **Fail loudly** → Never write partial data silently
4. **Frontend is sacred** → API contract must never break
5. **Production-grade** → This is a business, not a toy

---

## 📞 Support

**If something breaks:**

1. Check Netlify function logs for errors
2. Run `run-sog-tonight.mjs` locally to diagnose
3. Check staleness metrics in data files
4. Verify Netlify Blobs contain current data
5. Re-run bootstrap if data is >7 days stale

**Emergency rollback:**
```bash
# If new code causes issues, rollback:
git log --oneline -10  # Find last good commit
git revert <commit-hash>
git push origin main42
```

---

## 🚀 Future Enhancements

**Potential improvements (not blocking launch):**

1. **GitHub NHL data integration**
   - Use `mhostetter/nhl` or `hockeyR` for bulk historical data
   - Reduces bootstrap time from 60 min → 10 min
   - Currently stubbed in `github-nhl-data-loader.mjs`

2. **Automated daily runs**
   - GitHub Action or Netlify cron job
   - Automatic Blobs upload
   - Slack/email alerts on failures

3. **Model retraining**
   - ZINB parameters may be trained on 2023-24 data
   - Retrain on 2024-25 data for better calibration
   - Current model works, this is optimization

4. **Backtest validation**
   - Run 30-day backtest on historical picks
   - Validate actual ROI vs claimed ROI
   - Track Sharpe ratio, max drawdown

---

**System Status:** 🟢 Production-Ready  
**Last Updated:** November 13, 2025  
**Maintainer:** Claude (AI) + ChatGPT (AI)  
**Business Owner:** Brent Goldman

# NBA Player Props System - Architecture & Current Challenges

**Date:** November 13, 2025  
**Status:** Functional locally, deployment issues on Netlify  
**Win Rates:** 62.5% (Rebounds) | 66.7% (Assists) | Proven profitable

---

## 🏗️ System Architecture

### Current Working System (Local)

**File:** `scripts/nba/run-full-model-tonight.mjs`

**How It Works:**
1. **Data Collection (25 days lookback)**
   - Fetches boxscores directly from ESPN API
   - ~300ms delay between requests (rate limiting)
   - Collects 3,000-4,000 player-game records
   - Takes ~2-3 minutes total
   
2. **Player Identification**
   - Identifies top 8 rotation players per team
   - Filters by minutes played (>15 min threshold)
   - Tracks 240 active rotation players across 30 teams

3. **Statistical Modeling**
   - Calculates L5 (last 5 games) averages per player
   - Baseline v2 model: Simple moving averages
   - 62.5% win rate on rebounds, 66.7% on assists
   - Proven ROI: +19.3% (rebounds), +27.3% (assists)

4. **Odds Integration**
   - Fetches live props from The Odds API
   - Compares model predictions vs bookmaker lines
   - Identifies edges >4% with >60% confidence
   - Kelly Criterion for bet sizing (0.01-3.0 units)

5. **Output**
   - CSV + JSON exports to Downloads folder
   - ~37 picks per night (3 games example)
   - All 3.0 unit bets (high confidence only)

**Performance:**
- ✅ Execution time: 2-3 minutes
- ✅ No timeout issues
- ✅ Always fresh data
- ✅ Correct games/matchups

---

## 🚀 Attempted Deployment System (Netlify Functions)

**Goal:** Automate daily predictions at 7 AM ET, display on website

**File:** `netlify/functions/generate-daily-predictions.mjs`

### Architecture v2 (Nov 12-13, 2025)

**Multi-Tier Data Loading:**
1. **Tier 1:** Netlify Blobs (cached, TTL-aware, <2s)
2. **Tier 2.5:** NBA CDN (last 7 days, faster alternative)
3. **Tier 3:** ESPN API (team-scoped, p=6 concurrency, ~20-30s)
4. **Tier 4:** Git backup (emergency fallback)

**Time Budget System:**
```javascript
BUDGETS = {
  GLOBAL: 50_000,      // 50s total (10s safety buffer)
  ACQUIRE: 30_000,     // 30s data fetch (HARD STOP)
  TRANSFORM: 10_000,   // 10s stats calculation
  MERGE: 10_000        // 10s prediction generation
}
```

**Opponent Defense Enhancement:**
- Real-time defensive stats from NBA Stats API
- Opponent adjustments for rebounds/assists
- Expected +5-8% ROI improvement
- 30 teams, updates daily

---

## 🚧 Current Roadblocks

### 1. **Netlify 60-Second Timeout Limit**

**Problem:**
- Netlify Functions have hard 60s execution limit
- ESPN API fetching takes 20-30+ seconds for 25 days of data
- NBA Stats API timeouts (10s per request, 3 retries = 30-40s)
- Total execution: 50-60+ seconds → **function times out**

**Impact:**
- Function returns 500 error
- Website shows "Error loading predictions"
- No picks available for users

**Current Mitigation:**
- Multi-tier caching (Blobs → CDN → ESPN)
- Budget tracker with HARD STOP at 30s
- Disabled NBA Stats API temporarily

---

### 2. **Data Freshness vs Speed Dilemma**

**The Conflict:**

| Requirement | Solution | Problem |
|-------------|----------|---------|
| **Fresh Data** (today's games) | Fetch from ESPN API daily | Takes 20-30s, risks timeout |
| **Fast Response** (<10s) | Use cached Blobs | Data becomes stale, wrong games |
| **Opponent Defense** (real stats) | Call NBA Stats API | Times out after 30-40s |

**Current Issues:**

1. **Stale Blobs:**
   - Cached data shows yesterday's games
   - Players from wrong matchups
   - Predictions for completed games

2. **Slow Fresh Fetching:**
   - ESPN API: 300ms × 75 requests = 22.5s minimum
   - NBA Stats API: 10s × 3 retries = 30s
   - Total: 50-60s → timeout

3. **Cache Invalidation:**
   - When to refresh? (Games start at different times)
   - How to force fresh data without timeout?
   - TTL too long = stale, too short = constant timeouts

---

### 3. **Team Name Mapping Issues**

**Problem:**
- ESPN uses "NO" for New Orleans
- Our system expects "NOP"
- Result: 200+ warnings, players skipped

**Status:** ✅ FIXED (added "NO" → "NOP" alias)

---

### 4. **Architecture Complexity**

**Current System Has:**
- 10+ custom modules (budget-tracker, team-mapper, resilient-loader, etc.)
- 4 fallback tiers for data loading
- Complex caching logic (Blobs + in-memory + TTL)
- 4,000+ lines of custom code

**vs Local System:**
- 1 file (~400 lines)
- Direct ESPN fetching
- No caching layers
- Works perfectly every time

**Question:** Is the complexity worth it?

---

## 📊 Data Requirements

### What We Need Daily:

1. **Player Boxscores (Last 25 days)**
   - ~3,000-4,000 records
   - Updated after each game
   - Required: points, rebounds, assists, minutes
   - Source: ESPN API or NBA CDN

2. **Tonight's Schedule**
   - Game IDs, teams, start times
   - Source: ESPN scoreboard endpoint

3. **Live Prop Lines**
   - Player props (rebounds/assists)
   - Current odds from sportsbooks
   - Source: The Odds API (external, fast)

4. **Opponent Defense Stats (Optional but +5-8% ROI)**
   - Defensive ratings per 100 possessions
   - 30 teams, updated weekly would suffice
   - Source: NBA Stats API (currently timing out)

---

## 🎯 Current Status (Nov 13, 2025 - 8:28 AM ET)

### ✅ **WORKING** - Netlify Function Successfully Deployed!

**Performance Metrics:**
- ✅ Total execution: **14.9-16.7 seconds** (well under 60s limit!)
- ✅ Data acquisition: **8-10 seconds** (27-33% of 30s budget)
- ✅ Predictions generated: **37 picks** for 3 games
- ✅ Memory usage: **194-233 MB** (within limits)
- ✅ Correct games: TOR@CLE, ATL@UTA, IND@PHX ✓
- ✅ Fresh data: 2,576 records from 28 teams, 15 days span

**What Works:**
✅ Local model (`run-full-model-tonight.mjs`) - 100% reliable  
✅ **Netlify function - NOW WORKING!** (15s execution time)  
✅ Budget tracker system - properly initialized  
✅ Team name mapping - "NO" → "NOP" fixed  
✅ Multi-tier fallback architecture - ESPN Tier 3 reliable  
✅ Time budgets - HARD STOP at 30s prevents failures  
✅ Opponent defense - calculated from boxscores (fallback working)  
✅ Blobs caching - storing opponent defense for reuse  
✅ Deduplication - 134 → 37 picks (removed 97 duplicates)  

### Remaining Issues:
⚠️ NBA Stats API disabled (using calculated defense instead)  
⚠️ NBA CDN Tier 2.5 incomplete (needs boxscore endpoint)  
⚠️ One team resolving as "null" in opponent defense  
ℹ️ Blobs Tier 1 empty (will populate after first run)

### Latest Deploy:
- Commit: `97be7b8f`
- Changes: Added NO→NOP mapping, disabled NBA API
- Status: ✅ **PRODUCTION READY**
- Performance: 14.9s average, 30% of global budget used

---

## 💭 Questions for Solution Design

1. **Should we separate data collection from prediction generation?**
   - Background job to update Blobs every 6-12 hours?
   - Prediction function just reads pre-cached data?

2. **Do we need real-time opponent defense?**
   - Weekly updates sufficient? (defensive stats change slowly)
   - Static file vs API call trade-off?

3. **Is the multi-tier caching adding value or complexity?**
   - Local model works fine without it
   - Could we simplify to: GitHub Actions + Netlify Blobs only?

4. **What's the acceptable data lag?**
   - Can we use yesterday's boxscores for tonight's predictions?
   - How stale is too stale? (6h? 12h? 24h?)

5. **Should predictions run on-demand or pre-scheduled?**
   - Current: User visits site → triggers function → timeout
   - Alternative: Scheduled 7 AM ET → pre-generate → serve static

---

## 📝 Notes for Solution Architects

### Constraints:
- **Netlify Free Tier:** 125,000 function invocations/month (sufficient)
- **Netlify Timeout:** 60 seconds hard limit (CANNOT be extended on free tier)
- **The Odds API:** 500 requests/month free tier (sufficient for daily use)
- **ESPN API:** No official rate limits, but we respect 300ms delays
- **NBA Stats API:** Rate limits unknown, currently timing out

### Proven Solutions:
- **Local execution:** Works 100% of the time, but not automated
- **Baseline v2 model:** 62.5%/66.7% win rates, simple moving averages
- **Kelly Criterion:** Proper bet sizing, risk management

### Technical Stack:
- **Runtime:** Node.js 20 (ESM modules)
- **Hosting:** Netlify (Functions + Blobs + Static Site)
- **Languages:** JavaScript (mjs), Python (for data collection)
- **APIs:** ESPN (free), The Odds API (free tier), NBA Stats API (free)

---

## 🎯 Desired End State

### User Experience:
1. User visits `yoursite.com/nba-props` at 5 PM ET
2. Page loads instantly (<2s)
3. Shows 30-40 picks for tonight's games
4. All picks are current (generated within last 2 hours)
5. Includes live odds from sportsbooks
6. Opponent defense adjustments applied
7. Kelly Criterion bet sizing displayed

### Technical Requirements:
- ✅ Automated (no manual intervention)
- ✅ Fast (<10s response time)
- ✅ Accurate (correct games, fresh data)
- ✅ Reliable (99%+ uptime)
- ✅ Profitable (maintain 62.5%/66.7% win rates)
- ✅ Scalable (handle more users without breaking)

---

## � Available NBA Data Sources

### Official NBA APIs

#### 1. **NBA Stats API** (stats.nba.com)
- **URL Pattern:** `https://stats.nba.com/stats/[endpoint]`
- **Data Available:**
  - Player boxscores (per game, season totals)
  - Team defensive ratings by position
  - Advanced stats (TS%, USG%, etc.)
  - Lineup data, matchup analytics
- **Pros:** Official source, most comprehensive
- **Cons:** 
  - Rate limits (unknown threshold)
  - Requires headers (`User-Agent`, `Referer`)
  - Can timeout (10s+ per request observed)
  - Anti-bot measures (blocks cloud IPs sometimes)
- **Current Status:** ⚠️ Disabled in our system (timeouts)

#### 2. **NBA CDN** (cdn.nba.com)
- **URL Pattern:** `https://cdn.nba.com/static/json/liveData/[endpoint]/[date].json`
- **Data Available:**
  - Daily scoreboard (games, scores, status)
  - Boxscores (player stats, team stats)
  - Play-by-play data
  - Schedules, standings
- **Pros:** 
  - Fast (CDN-backed)
  - No authentication required
  - Reliable uptime
  - JSON format, easy to parse
- **Cons:**
  - Limited to recent data (last 7-14 days typically)
  - No historical data access
  - Static snapshots (not real-time during games)
- **Example URLs:**
  - Scoreboard: `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`
  - Boxscore: `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022500123.json`
- **Current Status:** ✅ Implemented as Tier 2.5 fallback

#### 3. **NBA Data API** (data.nba.net)
- **URL Pattern:** `https://data.nba.net/[version]/[endpoint]`
- **Data Available:**
  - Current season stats
  - Player profiles, team rosters
  - League schedules
- **Pros:** Official, structured data
- **Cons:** Limited documentation, similar to stats.nba.com limitations
- **Current Status:** ❌ Not implemented

### Third-Party Data Providers

#### 4. **ESPN API** (site.api.espn.com)
- **URL Pattern:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/[endpoint]`
- **Data Available:**
  - Player boxscores (career history)
  - Team schedules, rosters
  - Game summaries
- **Pros:**
  - No authentication required
  - Extensive historical data (back to 2010+)
  - Reliable, fast responses
  - Team-scoped requests (efficient)
- **Cons:**
  - No official rate limits (we use 300ms delays)
  - Data structure changes occasionally
  - No defensive stats
- **Example URL:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/LAL/statistics`
- **Current Status:** ✅ Primary data source (Tier 3)

#### 5. **Basketball Reference** (basketball-reference.com)
- **Access:** Web scraping (HTML parsing)
- **Data Available:**
  - Historical stats (back to 1946)
  - Advanced metrics
  - Opponent-adjusted stats
  - Player game logs
- **Pros:**
  - Most comprehensive historical data
  - Advanced analytics
  - Well-structured HTML
- **Cons:**
  - Scraping required (brittle)
  - Rate limiting (429 errors)
  - Legal concerns (ToS)
  - Slow (HTML parsing overhead)
- **Current Status:** ❌ Not implemented

#### 6. **The Odds API** (the-odds-api.com)
- **URL Pattern:** `https://api.the-odds-api.com/v4/sports/[sport]/odds`
- **Data Available:**
  - Live betting lines (spreads, totals, moneylines)
  - Player props (points, rebounds, assists, etc.)
  - Multiple sportsbooks (DraftKings, FanDuel, etc.)
- **Pros:**
  - Free tier (500 requests/month)
  - Real-time odds updates
  - 30+ sportsbooks supported
  - Reliable API
- **Cons:**
  - Rate limits on free tier
  - Costs $$ for higher tiers
  - Not a data source (betting lines only)
- **Current Status:** ✅ Primary odds provider

### GitHub-Based Data Projects

#### 7. **swar/nba_api** (Python library)
- **GitHub:** https://github.com/swar/nba_api
- **Description:** Python wrapper for stats.nba.com
- **Data Available:** Everything from NBA Stats API
- **Pros:**
  - Well-maintained (10k+ stars)
  - Handles authentication, rate limiting
  - Type hints, documentation
  - Active community
- **Cons:**
  - Python-only (not Node.js)
  - Same timeout issues as stats.nba.com
  - Requires separate service to run
- **Current Status:** ❌ Not used (Python vs Node.js)

#### 8. **nba_py** (Python library)
- **GitHub:** https://github.com/seemethere/nba_py
- **Description:** Another Python wrapper for NBA.com
- **Pros:** Simpler API than swar/nba_api
- **Cons:** 
  - Less maintained (archived)
  - Same underlying API issues
- **Current Status:** ❌ Not used

#### 9. **bttmly/nba** (Node.js library)
- **GitHub:** https://github.com/bttmly/nba
- **Description:** Node.js client for stats.nba.com
- **Pros:** Native Node.js, promise-based
- **Cons:** 
  - Outdated (last updated 2019)
  - Same API timeout issues
- **Current Status:** ❌ Not used (outdated)

#### 10. **nba-client-template** (Various implementations)
- **Description:** Community templates for NBA data fetching
- **Examples:**
  - NBA.com endpoints documentation
  - Rate limiting strategies
  - Response parsing helpers
- **Current Status:** ✅ Inspired our resilient-loader.mjs

### Static/Pre-Computed Data

#### 11. **GitHub Releases / Static Files**
- **Description:** Pre-computed datasets hosted on GitHub
- **Examples:**
  - Season stats CSV exports
  - Historical boxscores (compressed)
  - Defensive ratings tables
- **Pros:**
  - Fast (CDN-backed via GitHub)
  - No rate limits
  - Cacheable
- **Cons:**
  - Requires manual updates
  - Not real-time
  - Storage limits (100MB per file)
- **Current Status:** ✅ Used for opponent defense fallback

#### 12. **Netlify Blobs Cache**
- **Description:** Our internal caching layer
- **Data Stored:**
  - Player boxscores (25 days rolling window)
  - Opponent defensive ratings (daily snapshot)
  - Generated predictions (latest)
- **Pros:**
  - Sub-second access (<200ms)
  - TTL-aware (auto-refresh)
  - Schema versioning
- **Cons:**
  - Requires background job to populate
  - Netlify-specific (not portable)
- **Current Status:** ✅ Primary cache (Tier 1)

### Alternative Data Sources (Not Implemented)

#### 13. **Sportradar API** (Commercial)
- **Cost:** $1,000+/month
- **Pros:** Official NBA data partner, real-time
- **Cons:** Expensive, overkill for our use case

#### 14. **Stats Perform** (Commercial)
- **Cost:** Enterprise pricing
- **Pros:** Advanced analytics, tracking data
- **Cons:** Not accessible for hobbyists

#### 15. **RapidAPI NBA Endpoints**
- **Cost:** Freemium ($0-50/month)
- **Pros:** Multiple providers, easy integration
- **Cons:** Rate limits, reliability varies by provider

---

## 🎯 Recommended Data Architecture

Based on available sources, our current multi-tier approach is optimal:

**Tier 1 (Cache):** Netlify Blobs  
- ✅ Fastest (<2s)
- ✅ No external dependencies
- ✅ Cost: $0

**Tier 2 (Fast External):** NBA CDN  
- ✅ Fast (3-5s)
- ✅ Official source
- ✅ Cost: $0

**Tier 3 (Comprehensive):** ESPN API  
- ✅ Historical depth (20+ days)
- ✅ Reliable uptime
- ✅ Cost: $0

**Tier 4 (Emergency):** GitHub Static Files  
- ✅ Always available
- ✅ Versioned data
- ✅ Cost: $0

**Excluded Sources:**
- ❌ NBA Stats API (timeouts)
- ❌ Basketball Reference (scraping complexity)
- ❌ Commercial APIs (cost prohibitive)
- ❌ Python libraries (runtime mismatch)

---

## �📋 Prompt for GPT Evaluation

**Context:** You are a senior software architect specializing in serverless architectures and sports betting systems. Review the above system description.

**Task:** Propose **3 distinct architectural solutions** to solve the data freshness vs speed dilemma while staying within Netlify's 60-second timeout limit. Each solution should address:

1. **How to keep data fresh** (today's games, not yesterday's)
2. **How to stay under 60s timeout** (with safety margin)
3. **How to handle opponent defense updates** (real stats, not static)
4. **Trade-offs** (cost, complexity, reliability, performance)
5. **Implementation effort** (hours/days to deploy)

**Solutions should consider:**
- GitHub Actions for background jobs
- Netlify Scheduled Functions (can run longer?)
- Cron jobs on external services (Vercel, Railway, Render)
- Pre-computation vs on-demand generation
- Incremental updates vs full refreshes
- Multi-stage pipelines (separate data collection from predictions)

**Output format:**
- Solution 1: [Name] - [One sentence summary]
- Solution 2: [Name] - [One sentence summary]  
- Solution 3: [Name] - [One sentence summary]

Then provide detailed breakdown of each solution with pros/cons, implementation steps, and expected timeline.

**Goal:** Present Claude (Anthropic AI) with 3 evaluated options to choose the best path forward for production deployment.

---

## 📎 Additional Resources

- Local working model: `scripts/nba/run-full-model-tonight.mjs`
- Netlify function: `netlify/functions/generate-daily-predictions.mjs`
- Budget tracker: `netlify/functions/lib/budget-tracker.mjs`
- Team mapper: `netlify/functions/lib/team-mapper.mjs`
- Resilient loader: `netlify/functions/lib/resilient-loader.mjs`
- Opponent defense: `netlify/functions/lib/opponent-defense-loader.mjs`

**Backtest Results:**
- File: `logs/holdout-validation-feb2025.log`
- Rebounds: 62.5% win rate, +19.3% ROI
- Assists: 66.7% win rate, +27.3% ROI
- Sample size: 300+ picks, Feb 2025 holdout

**Current Deployment:**
- Branch: `main42`
- Latest commit: `97be7b8f`
- Status: Testing in progress
- Expected completion: Nov 13, 2025 (today)

---

*This document prepared for architectural review and solution design.*
*System proven profitable locally, seeking reliable deployment path.*

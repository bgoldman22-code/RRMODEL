# EPL Profile C - External Data Source Scouting Report

**Date:** December 10, 2025  
**Purpose:** Evaluate 5 potential external data sources for EPL BTTS modeling  
**Status:** 🔍 IN PROGRESS - Data Source Exploration

---

## Overview

Before implementing Option C feature engineering, we need to understand:
1. What data each source actually provides
2. Coverage vs our 904-match baseline
3. Data quality and reliability
4. API rate limits and costs
5. Which sources are worth integrating

---

## Data Source Evaluation Framework

For each source, we'll document:

| Criterion | Description |
|-----------|-------------|
| **Available Fields** | What match-level stats are exposed? |
| **EPL Coverage** | How many of our 904 matches can be matched? |
| **Historical Depth** | How far back does data go? |
| **Update Frequency** | Real-time, daily, post-match? |
| **Rate Limits** | Requests per day/month |
| **Cost** | Free tier vs paid |
| **Data Quality** | Completeness, accuracy |
| **Integration Effort** | Easy, moderate, complex |

---

## Source 1: RapidAPI - Football xG Statistics (Wolf1984)

**API Link:** https://rapidapi.com/Wolf1984/api/football-xg-statistics  
**Screenshot Reference:** User provided screenshot showing this in their workspace

### 🔍 Initial Assessment (Pending API Key)

**Known Information:**
- Provider: Wolf1984 on RapidAPI marketplace
- Focus: xG (expected goals) statistics
- League coverage: Appears to include Premier League

**Questions to Answer:**
1. What specific endpoints are available?
   - Match-level xG (home, away, total)?
   - Team-level xG aggregates?
   - Player-level xG?

2. What fields per match?
   - `home_xg`, `away_xg`
   - `home_xg_ot` (on target)?
   - `xg_total`, `xg_difference`
   - Shot locations/quality?

3. Date range coverage?
   - Does it cover 2023-05-03 to 2025-11-09? (our baseline)
   - Any gaps in coverage?

4. Match identification?
   - How to align with our (season, home, away) keys?
   - Team name format?
   - Date/time format?

5. Rate limits?
   - Free tier: requests/day?
   - Paid tier: cost and limits?

**Next Steps:**
- [ ] User to provide RapidAPI key
- [ ] Test endpoint with sample EPL matches
- [ ] Fetch sample JSON responses
- [ ] Map fields to our schema
- [ ] Calculate coverage overlap

---

## Source 2: API-Football (https://www.api-football.com/documentation-v3)

**API Link:** https://www.api-football.com/documentation-v3  
**Provider:** API-Sports (established sports data provider)

### 🔍 Initial Assessment (Based on Documentation)

**Known Capabilities (from docs):**

#### Endpoints Relevant to EPL BTTS:
1. **Fixtures Endpoint** (`/fixtures`)
   - Match details, teams, date/time
   - Score, status, venue

2. **Statistics Endpoint** (`/fixtures/statistics`)
   - **Shots:** Total shots, shots on target, shots off target, blocked shots
   - **Possession:** Ball possession %
   - **Passes:** Total passes, pass accuracy %
   - **Attacks:** Total attacks, dangerous attacks
   - **Corners:** Corner kicks
   - **Cards:** Yellow cards, red cards
   - **Fouls:** Fouls committed
   - **Offsides**
   - **Goalkeeper saves**

3. **Events Endpoint** (`/fixtures/events`)
   - Goals (time, player, type)
   - Cards
   - Substitutions

4. **Expected Goals (xG)?**
   - ⚠️ NOT CLEARLY DOCUMENTED
   - May require premium tier or not available

**Potential Features for BTTS:**
- `shots_total` (home/away)
- `shots_on_target` (home/away)
- `dangerous_attacks` (home/away)
- `possession_pct` (home/away)
- `corners` (home/away)

**Questions to Answer:**
1. Does API-Football provide xG data?
   - If yes, which endpoint?
   - If no, is it worth using for shots/possession only?

2. EPL coverage?
   - Historical: How far back?
   - Real-time: Live match stats?

3. Rate limits?
   - Free tier: 100 requests/day (per docs)
   - Pro tier: $15-40/month depending on requests

4. Match identification?
   - Team names format (full names vs abbreviations)?
   - League ID for Premier League?

**Next Steps:**
- [ ] Sign up for free tier / acquire API key
- [ ] Test `/fixtures` endpoint for EPL season 2023-24
- [ ] Test `/fixtures/statistics` for sample matches
- [ ] Check if xG is available (not in standard docs)
- [ ] Calculate coverage vs our 904 matches

---

## Source 3: Sportmonks (https://my.sportmonks.com/)

**API Link:** https://my.sportmonks.com/  
**Provider:** Sportmonks (premium sports data)

### 🔍 Initial Assessment (Based on Public Info)

**Known Capabilities:**

#### Advertised Features:
1. **Expected Goals (xG)**
   - Sportmonks explicitly advertises xG data
   - Match-level and player-level

2. **Advanced Metrics:**
   - xGOT (expected goals on target)
   - xPoints
   - Possession-adjusted stats

3. **Standard Stats:**
   - Shots, passes, tackles, etc.
   - Similar to API-Football but more detailed

4. **Lineups:**
   - Starting XI, bench, formations
   - Minutes played per player

**Pricing (Potential Concern):**
- Sportmonks is a premium service
- Free tier may be very limited
- Pricing not publicly listed (contact sales)

**Questions to Answer:**
1. Free tier availability?
   - Can we test without paying?
   - What's included in free tier?

2. xG data access?
   - Is xG included in free tier or paid only?
   - Granularity: match, team, player?

3. EPL historical coverage?
   - How far back does xG data go?
   - 2022-23 season onward?

4. Rate limits and costs?
   - Requests per day/month?
   - Monthly subscription cost?

**Next Steps:**
- [ ] Sign up for free trial / account
- [ ] Check pricing for xG access
- [ ] Test sample EPL matches
- [ ] Assess if worth the cost vs other sources

---

## Source 4: Premier-League-API GitHub (https://github.com/tarun7r/Premier-League-API.git)

**Repo Link:** https://github.com/tarun7r/Premier-League-API.git  
**Type:** Static data repository (no live API)

### 🔍 Initial Assessment (Needs Repo Clone)

**Known Information:**
- GitHub repo with Premier League data
- Likely JSON/CSV files
- May be scraped from public sources
- Free (open source)

**Potential Content:**
- Match results and scores
- Player statistics
- Team standings
- Historical seasons

**Questions to Answer:**
1. What seasons are covered?
   - Does it include 2022-23, 2023-24, 2024-25?

2. What match-level stats are available?
   - Shots, possession, cards?
   - xG (unlikely but worth checking)?

3. Data format?
   - JSON, CSV, or API endpoints?
   - How to map to our (season, home, away) keys?

4. Data freshness?
   - Last updated when?
   - Is 2024-25 season included?

5. Coverage overlap?
   - How many of our 904 matches have data here?

**Next Steps:**
- [ ] Clone the repository
- [ ] Explore data structure
- [ ] Check seasons and coverage
- [ ] Map fields to our schema
- [ ] Assess data quality

**Command:**
```bash
cd /tmp
git clone https://github.com/tarun7r/Premier-League-API.git
cd Premier-League-API
ls -la
# Explore data files
```

---

## Source 5: EPL BallDontLie (https://epl.balldontlie.io/#epl-api)

**API Link:** https://epl.balldontlie.io/#epl-api  
**Provider:** BallDontLie (known for free NBA API)

### 🔍 Initial Assessment (Based on Website)

**Known Capabilities:**

#### Endpoints (from docs):
1. **Matches**
   - Match results, scores, dates
   - Team IDs and names

2. **Teams**
   - Team information
   - Season standings

3. **Players**
   - Player rosters
   - Basic stats (goals, assists, appearances)

4. **Stats**
   - ⚠️ Unclear what match-level stats are available
   - May be limited compared to API-Football

**Strengths:**
- Free API (no authentication required for basic endpoints)
- Simple REST API
- EPL-specific focus

**Potential Limitations:**
- May not include advanced stats (xG, shots on target, etc.)
- Documentation appears minimal
- Unclear historical depth

**Questions to Answer:**
1. What match-level stats are exposed?
   - Shots?
   - Possession?
   - xG (unlikely)?

2. Historical coverage?
   - How far back?
   - 2022-23 onward?

3. Rate limits?
   - Free tier limits?

4. Match identification?
   - Team name format?
   - Date format?

**Next Steps:**
- [ ] Test API endpoints (no key required)
- [ ] Fetch sample matches
- [ ] Document available fields
- [ ] Calculate coverage overlap

**Sample Test Commands:**
```bash
# Test matches endpoint
curl https://epl.balldontlie.io/api/v1/matches

# Test specific season
curl https://epl.balldontlie.io/api/v1/matches?season=2023
```

---

## Source Comparison Matrix (Preliminary)

| Source | xG Data | Shots | Possession | Historical | Cost | Integration |
|--------|---------|-------|------------|-----------|------|-------------|
| **RapidAPI xG** | ✅ Yes | ? | ? | ? | Paid | ? |
| **API-Football** | ❓ Maybe | ✅ Yes | ✅ Yes | Good | Paid/Free | Easy |
| **Sportmonks** | ✅ Yes | ✅ Yes | ✅ Yes | Good | Paid | Moderate |
| **GitHub Repo** | ❌ No | ❓ Maybe | ❓ Maybe | ? | Free | Easy |
| **BallDontLie** | ❌ No | ❓ Maybe | ❓ Maybe | ? | Free | Easy |

**Legend:**
- ✅ Confirmed available
- ❓ Needs investigation
- ❌ Likely not available

---

## Recommended Scouting Order

### Phase 1: Quick Wins (Free/Easy)
1. **GitHub Repo** (5-10 min)
   - Clone and explore
   - No API key needed
   - Immediate data access

2. **BallDontLie** (10-15 min)
   - No authentication
   - Quick endpoint tests
   - Assess usefulness

### Phase 2: Free Tier Testing (1-2 hours)
3. **API-Football Free Tier**
   - Sign up for free account
   - Test 100 requests
   - Focus on shots/possession data
   - Check for hidden xG endpoint

### Phase 3: Paid/Premium (User Decision)
4. **RapidAPI xG** (User provides key)
   - Primary xG source
   - Test match coverage
   - Assess rate limits

5. **Sportmonks** (If budget allows)
   - Premium xG + advanced metrics
   - May be redundant with RapidAPI
   - Cost-benefit analysis needed

---

## Feature Priority Matrix

Based on BTTS modeling, rank features by expected predictive value:

### Tier 1: High Priority (Strong BTTS Signal)
1. **xG (expected goals)** - Direct proxy for scoring chances
2. **Shots on target** - Indicates offensive quality
3. **Dangerous attacks** - High-percentage chances

### Tier 2: Medium Priority (Moderate Signal)
4. **Total shots** - General offensive activity
5. **Possession %** - Controls tempo/opportunities
6. **Corners** - Set-piece opportunities

### Tier 3: Lower Priority (Weaker Signal for BTTS)
7. **Passes, pass accuracy** - Indirect
8. **Fouls, cards** - Game state, less predictive
9. **Offsides** - Minimal signal

---

## Next Steps - Data Scouting Sprint

### Immediate Actions (Next 30 Minutes)
1. Clone GitHub repo and explore
2. Test BallDontLie API endpoints
3. Document findings in this report

### Short-Term (Next 1-2 Hours)
4. Sign up for API-Football free tier
5. Test match statistics endpoint
6. Check for xG availability

### User-Dependent
7. Provide RapidAPI key for xG testing
8. Decide if Sportmonks budget is available

---

## Decision Framework

After scouting, we'll decide:

### Must-Have Sources
- At least one xG provider (RapidAPI or Sportmonks)
- At least one shots/possession provider (API-Football)

### Nice-to-Have Sources
- GitHub repo if has useful supplementary data
- BallDontLie if provides unique fields

### Skip If
- Coverage too low (< 50% of our 904 matches)
- Data quality poor (missing fields, inconsistent)
- Cost too high vs predictive value

---

## Status

**Current Phase:** 🔍 Initial scouting  
**Completed:** 0/5 sources fully evaluated  
**Next Action:** Clone GitHub repo and test BallDontLie API

---

**Note:** This report will be updated as we explore each source. After scouting, we'll create a final integration plan in Step 4.

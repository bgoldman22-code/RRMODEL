# MLB Data Sources Deep Dive - Comprehensive Research for 2026 Season

**Date:** January 8, 2026  
**Purpose:** Evaluate all data sources for MLB HR Round Robin V2 + new markets research  
**Scope:** 4-5 seasons of historical data (2021-2025) for prediction-first research

---

## Executive Summary

This document provides a comprehensive analysis of all available MLB data sources for building prediction models across multiple markets. Following the research-first philosophy:

> *"For each market, treat this as a prediction-first research exercise, not a betting problem. Ignore odds initially. Determine: 1) Theoretical predictability ceiling, 2) Which features carry stable signal vs noise, 3) Which model families are appropriate, 4) How much historical data is actually useful before marginal returns decay."*

---

## Table of Contents

1. [Current Data Infrastructure](#current-data-infrastructure)
2. [GitHub Repositories Analysis](#github-repositories-analysis)
3. [Primary Data Sources](#primary-data-sources)
4. [Secondary Data Sources](#secondary-data-sources)
5. [Feature Categories by Market](#feature-categories-by-market)
6. [Data Collection Recommendations](#data-collection-recommendations)
7. [Gap Analysis](#gap-analysis)

---

## Current Data Infrastructure

### What We Already Have

| Component | Status | Location | Description |
|-----------|--------|----------|-------------|
| MLB Game Collector | ✅ Built | `scripts/mlb_data_collector.mjs` | MLB Stats API schedule, play-by-play, HR events |
| Statcast Collector | ✅ Built | `scripts/collect_statcast_comprehensive.py` | Batted balls, pitch-by-pitch, player profiles |
| Historical Odds | ⏳ Planned | 50K TheOddsAPI credits approved | `batter_home_runs` market, 2021-2025 |
| Data Directory | ✅ Created | `data/mlb_historical/` | games/, statcast/, players/, odds/, processed/ |

### Data Coverage Planned

```
Years: 2021, 2022, 2023, 2024, 2025
Games: ~12,000 regular season games (2,430 × 5)
Batted Balls: ~750,000 events
Pitches: ~3,500,000 pitch records
Home Runs: ~30,000 HR events
```

---

## GitHub Repositories Analysis

### ⭐ TIER 1: ESSENTIAL (Use These)

#### 1. MLB Stats API Official (via GUMBO)
**Source:** `https://github.com/MajorLeagueBaseball/google-cloud-mlb-hackathon`  
**Status:** ✅ ACTIVE (Google Cloud x MLB Hackathon 2025)  
**Last Updated:** Active repo for 2025 hackathon

**Unique Value:**
- **GUMBO (Grand Unified Master Baseball Object)** - Complete game state in single JSON
- Real-time updates every 1-2 seconds (websocket) or 12 seconds (REST)
- Official MLB data source - no scraping needed
- **FREE, no authentication required**

**Historical Data Granularity:**
| Period | Level |
|--------|-------|
| 1901-1968 | Boxscore only |
| 1969-1988 | Play-by-play |
| 1989-2007 | Pitch-by-pitch |
| 2008-2014 | Pitch F/x (speed, break) |
| **2015-Present** | **Full Statcast (EV, LA, HR distance)** |

**Key Endpoints:**
```javascript
// Schedule
https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=2024&gameType=R

// Live game feed (GUMBO)
https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live

// Player info
https://statsapi.mlb.com/api/v1/people/{player_id}

// Team roster
https://statsapi.mlb.com/api/v1/teams/{team_id}/roster?season=2024
```

**Recommendation:** ✅ **PRIMARY DATA SOURCE** - Already using, continue

---

#### 2. toddrob99/MLB-StatsAPI (Python Wrapper)
**Source:** `https://github.com/toddrob99/MLB-StatsAPI`  
**Stars:** 738 ⭐ | **Forks:** 127 | **Used by:** 383 projects  
**Status:** ✅ ACTIVE (v1.9.0 released April 2025)

**Unique Value:**
- Most popular Python wrapper for MLB Stats API
- Well-documented, actively maintained
- Simplifies complex API queries

```python
import statsapi

# Get today's games
games = statsapi.schedule(start_date='2026-04-01', end_date='2026-04-01')

# Get player stats
stats = statsapi.player_stat_data(592450, group='hitting', type='career')

# Get game boxscore
boxscore = statsapi.boxscore(gamePk=662584)
```

**Recommendation:** ✅ **USE FOR PYTHON SCRIPTS** - Already referenced in your comprehensive plan

---

#### 3. spilchen/baseball_scraper (Statcast + FanGraphs)
**Source:** `https://github.com/spilchen/baseball_scraper`  
**Status:** ⚠️ FORK of pybaseball (31 stars, lower activity)  
**Last Commit:** Varies

**Unique Value:**
- Fork of pybaseball with additional features
- Statcast data from Baseball Savant
- FanGraphs projections (Steamer, ZiPS, PECOTA)
- Pitching/batting stats aggregates
- **Probable starters scraping from ESPN**

**Key Functions:**
```python
from baseball_scraper import statcast, statcast_batter, statcast_pitcher
from baseball_scraper import pitching_stats, batting_stats
from baseball_scraper import espn  # Probable starters

# Get Statcast data
data = statcast(start_dt='2025-06-01', end_dt='2025-06-30')

# Get batter statcast
kershaw_stats = statcast_pitcher('2025-06-01', '2025-07-01', player_id=477132)

# Get probable starters for date range
es = espn.ProbableStartersScraper(datetime(2025,8,5), datetime(2025,8,11))
starters = es.scrape()
```

**Data Available (79 columns per pitch):**
- `launch_speed` (exit velocity)
- `launch_angle`
- `estimated_ba_using_speedangle`
- `estimated_woba_using_speedangle`
- `barrel` classification
- Pitch type, velocity, spin rate
- Zone location

**Recommendation:** ✅ **USE pybaseball INSTEAD** - pybaseball is more active (we already use it)

---

#### 4. guillochon/mlb-api-mcp (MCP Server)
**Source:** `https://github.com/guillochon/mlb-api-mcp`  
**Status:** ✅ ACTIVE (64 commits, well-maintained)  
**Stars:** 35 ⭐ | Updated: Recent

**Unique Value:**
- **Model Context Protocol (MCP) server** for AI integration
- Wraps MLB Stats API with structured tools
- Sabermetric stats (WAR, wOBA, wRC+)
- Game lineups, pace statistics
- Ready for Smithery/Claude integration

**Key MCP Tools:**
```
get_mlb_standings - Standings with filters
get_mlb_schedule - Schedules for dates/teams
get_mlb_boxscore - Complete boxscores
get_mlb_game_lineup - Detailed lineups (CRITICAL FOR LINEUPS)
get_mlb_sabermetrics - WAR, wOBA, wRC+
get_multiple_mlb_player_stats - Batch player stats
```

**Recommendation:** ✅ **EXCELLENT FOR LINEUP DATA** - The `get_mlb_game_lineup` tool is exactly what we need

---

#### 5. mattgorb.github.io/dailymlblineups 🌟 CRITICAL
**Source:** `https://mattgorb.github.io/dailymlblineups`  
**Status:** ⚠️ INACTIVE (old data, ~2016 sample)

**Unique Value:**
- **Daily lineup API with batting order and handedness**
- Parses RotoWire lineups (most reliable source)
- Returns JSON with:
  - Game time, weather
  - Lineup with batting order, position, bats (L/R/S)
  - Pitcher hand, record, ERA
  - Team records

**Sample JSON Response:**
```json
{
  "games": [{
    "time": "3:10 PM ET",
    "weather": "Wind 4 MPH In",
    "away": {
      "name": "St. Louis Cardinals",
      "record": "80-71",
      "pitcher": {
        "name": "Luke Weaver",
        "pitcherHand": "R",
        "pitcherRecord": "1-3",
        "pitcherEra": "3.21"
      },
      "lineup": [
        {"player": "Matt Carpenter", "ID": "572761", "position": "1B", "bats": "L", "batting": 1},
        ...
      ]
    }
  }]
}
```

**Recommendation:** ⚠️ **CREATE OUR OWN VERSION** - Concept is gold, but repo is abandoned

**Action Item:** Build a modern lineup collector that:
1. Scrapes RotoWire daily (like this did)
2. Returns JSON with batting order + handedness
3. Stores historical lineup data for PA projection modeling

---

### ⭐ TIER 2: USEFUL SUPPLEMENTARY

#### 6. mlb-rs/mlbt (Rust TUI)
**Source:** `https://github.com/mlb-rs/mlbt`  
**Stars:** 117 ⭐ | **Status:** ✅ ACTIVE (v0.0.19, July 2025)

**Unique Value:**
- Terminal UI showing Statcast API capabilities
- Shows what's available in MLB API
- Heat maps, pitch zones, exit velocity displays

**Recommendation:** ⚠️ **REFERENCE ONLY** - Not for data collection, but shows API capabilities

---

#### 7. panzarino/mlbgame
**Source:** `https://github.com/panzarino/mlbgame`  
**Stars:** 541 ⭐ | **Status:** ⚠️ STALE (Last release: April 2018)

**Unique Value:**
- Python API for MLB GameDay data
- Works with real-time data
- Same data source as MLB GameDay

**Recommendation:** ❌ **DEPRECATED** - Use MLB-StatsAPI instead (more current)

---

#### 8. laplaces42/mlb_game_predictor
**Source:** `https://github.com/laplaces42/mlb_game_predictor`  
**Stars:** 19 ⭐ | **Status:** ✅ ACTIVE (2024)

**Unique Value:**
- **Complete prediction pipeline** (2000-2024 data)
- Ridge Classifier for outcomes, Linear Regression for scores
- Uses FanGraphs for team statistics
- Exponential moving averages for future stat prediction

**Key Features:**
- Historical team stats from FanGraphs
- EMA-based stat projection
- Blend of season + recent performance

**Recommendation:** ✅ **REFERENCE FOR METHODOLOGY** - Study their feature engineering

---

### ⭐ TIER 3: HISTORICAL/RESEARCH

#### 9. Retrosheet.org 🏛️
**Source:** `https://www.retrosheet.org/`  
**Status:** ✅ ACTIVE (Last update: November 2025)

**Unique Value:**
- **Complete play-by-play back to 1910**
- Box-score data back to 1871
- Negro League data (1935-1949)
- Fully parsed CSV downloads (710MB)

**Coverage:**
```
1910-2025: Complete play-by-play for AL/NL
1871-1909: Box-score level
Downloads available: https://retrosheet.org/downloads/alldata.zip
```

**Recommendation:** ✅ **USE FOR DEEP HISTORICAL ANALYSIS** - Free, comprehensive, well-structured

---

#### 10. PECOTA (Baseball Prospectus)
**Status:** 💰 PAID SERVICE

**Unique Value:**
- Player projection system
- Comparable players analysis
- Aging curves
- Probability distributions for stats

**Recommendation:** ⚠️ **EVALUATE ROI** - Consider if projections add edge beyond Statcast

---

### ⭐ TIER 4: LIMITED VALUE

| Repo | Stars | Status | Why Limited |
|------|-------|--------|-------------|
| BaseballSharp | 9 | Active | .NET SDK - we use JS/Python |
| mlb-boxscore-analysis | 1 | Active | Simple inning analysis only |
| mlb-insights | 1 | Broken | Deprecated API (lookup-service-prod.mlb.com) |
| mlb-data-analysis | 0 | Active | R-based, Lahman DB only |
| MLB-Player-Performance-Tracker | 0 | Active | Real-time display only, no historical |

---

## Primary Data Sources

### 1. Baseball Savant (Statcast) ⭐⭐⭐⭐⭐

**URL:** `https://baseballsavant.mlb.com/`  
**Access:** Free, via pybaseball or direct API  
**Coverage:** 2015-Present (full Statcast), 2008-2014 (Pitch F/x)

**Critical Data for HR Prediction:**

| Feature | Description | HR Relevance |
|---------|-------------|--------------|
| `launch_speed` | Exit velocity (mph) | 95+ mph = HR candidate |
| `launch_angle` | Vertical angle (degrees) | 25-35° = HR sweet spot |
| `barrel` | Optimal EV + LA combo | 98+ mph, 26-30° = barrel |
| `hit_distance_sc` | Estimated distance | Context for park factors |
| `hc_x`, `hc_y` | Hit coordinates | Spray chart patterns |
| `pitch_type` | FB, SL, CH, CU, SI, etc. | Matchup strength |
| `release_speed` | Pitch velocity | Hitter timing |
| `pfx_x`, `pfx_z` | Pitch movement | Breaking ball vulnerability |
| `plate_x`, `plate_z` | Pitch location | Zone preference |

**Unique Value Not Available Elsewhere:**
- **Barrel rate** (most predictive of HR power)
- **Launch angle consistency** (repeatable swings)
- **Pitch-type performance** (who crushes fastballs vs sliders)
- **Spray charts** (pull% for park factors)

---

### 2. FanGraphs ⭐⭐⭐⭐

**URL:** `https://www.fangraphs.com/`  
**Access:** Free (basic), Premium for leaderboards  
**Coverage:** 2002-Present (advanced), 1900s (basic)

**Critical Data:**

| Feature | Description | Use Case |
|---------|-------------|----------|
| wOBA | Weighted on-base average | Offensive quality |
| wRC+ | Weighted runs created plus | Context-neutral offense |
| ISO | Isolated power | Power potential |
| HR/FB | HR per fly ball rate | HR conversion skill |
| K% | Strikeout rate | Pitcher K projection |
| SwStr% | Swinging strike rate | Pitcher dominance |
| Barrel% | Barrel rate (same as Savant) | HR predictor |
| Hard-Hit% | 95+ mph contact rate | Power proxy |
| WAR | Wins above replacement | Overall player quality |

**Projections Available:**
- **Steamer** (RoS and update)
- **ZiPS** (update)
- **THE BAT** (RoS)
- **Depth Charts** (blended)

---

### 3. MLB Stats API ⭐⭐⭐⭐⭐

**Access:** Free, no authentication  
**Real-time:** Yes (1-12 second updates)

**Unique Data:**
- Official rosters and lineups
- Injury reports (IL transactions)
- Game status and timing
- Play-by-play with pitch sequences
- Venue information

---

## Secondary Data Sources

### 4. Weather Data 🌡️

**Sources:**
| Provider | Free Tier | Historical | Real-time |
|----------|-----------|------------|-----------|
| OpenWeatherMap | 1,000 calls/day | ✅ 40+ years | ✅ |
| WeatherAPI | 1M calls/month | ✅ | ✅ |
| Visual Crossing | 1,000 records/day | ✅ 50+ years | ✅ |

**Critical Features:**
```javascript
const weatherImpact = {
  temperature: // Ball flight distance (+1 ft per 10°F)
  wind_speed: // mph (>10 mph significant)
  wind_direction: // Relative to HR trajectory
  humidity: // Higher = ball carries more
  air_pressure: // Lower = ball flies farther
};
```

**Action Item:** Integrate Weather API with game schedules

---

### 5. Ballpark Factors 🏟️

**Sources:**
- ESPN Park Factors (free)
- FanGraphs Park Factors (free)
- Statcast Park Factors (2-3 year rolling)

**Sample Park Factors (2024):**
| Park | Overall | LHH | RHH |
|------|---------|-----|-----|
| Coors Field | 1.32 | 1.28 | 1.35 |
| Great American | 1.15 | 1.12 | 1.18 |
| Yankee Stadium | 1.08 | 0.96 | 1.14 |
| Oracle Park | 0.78 | 0.82 | 0.74 |
| Petco Park | 0.82 | 0.85 | 0.79 |

**Already Mentioned in V2 Production Plan:**
```javascript
const PARK_FACTORS = {
  'Yankee Stadium': { overall: 1.08, RHH: 1.14, LHH: 0.96 },
  'Coors Field': { overall: 1.32, RHH: 1.35, LHH: 1.28 },
  // ... all 30 parks
};
```

---

### 6. Starting Lineups 📋

**Most Reliable Sources:**
1. **RotoWire** - Published 1-3 hours before game
2. **MLB.com Probable Pitchers** - Official but later
3. **FantasyLabs** - Good aggregation

**What We Need:**
- Batting order (1-9)
- Player handedness (L/R/S)
- Confirmed vs projected status
- Historical lineup frequency (who bats 3rd most often?)

---

## Feature Categories by Market

### A. Home Runs (Current Focus) ⚾

**Stable Signal Features (High Predictability):**
| Feature | Stability | Source |
|---------|-----------|--------|
| Barrel Rate (L30) | ⭐⭐⭐⭐⭐ | Statcast |
| Exit Velocity (95th pct) | ⭐⭐⭐⭐⭐ | Statcast |
| HR/FB Rate (L60) | ⭐⭐⭐⭐ | FanGraphs |
| ISO | ⭐⭐⭐⭐ | FanGraphs |
| Park Factor | ⭐⭐⭐⭐ | Multiple |
| Pitcher HR/9 | ⭐⭐⭐ | FanGraphs |
| Pitcher Barrel% Allowed | ⭐⭐⭐⭐ | Statcast |

**Noisy Features (Use with Caution):**
| Feature | Why Noisy | Mitigation |
|---------|-----------|------------|
| Hot/Cold Streak | Small sample | 14-day window, cap at ±6% |
| BvP (Batter vs Pitcher) | Usually <20 AB | Require 10+ AB minimum |
| Single Game Weather | Wind changes | In-game conditions only |

---

### B. Pitcher Strikeouts 🎯

**Stable Signal Features:**
| Feature | Stability | Source |
|---------|-----------|--------|
| K% (Season) | ⭐⭐⭐⭐⭐ | FanGraphs |
| SwStr% | ⭐⭐⭐⭐⭐ | Statcast |
| K-BB% | ⭐⭐⭐⭐⭐ | FanGraphs |
| Opponent K% (Team L30) | ⭐⭐⭐⭐ | FanGraphs |
| Chase Rate (O-Swing%) | ⭐⭐⭐⭐ | Statcast |
| Pitch Mix (Breaking%) | ⭐⭐⭐⭐ | Statcast |

**Lineup-Dependent Features:**
| Feature | Importance | Source |
|---------|------------|--------|
| Lineup K% (sum) | CRITICAL | Calculate from lineup |
| LHB/RHB ratio | Important | Lineup data |
| Contact quality | Important | Statcast |

**Model Recommendation:** **Poisson Regression** or **Negative Binomial**

---

### C. Pitcher Outs Recorded (Innings) 📊

**Stable Signal Features:**
| Feature | Stability | Source |
|---------|-----------|--------|
| Pitch Efficiency (P/IP) | ⭐⭐⭐⭐⭐ | Statcast/FanGraphs |
| Historical IP/Start | ⭐⭐⭐⭐ | FanGraphs |
| Manager Tendencies | ⭐⭐⭐⭐ | Calculate |
| Bullpen State | ⭐⭐⭐⭐ | Recent usage |
| Team Favorite/Underdog | ⭐⭐⭐ | Game context |
| Opponent Patience (BB%) | ⭐⭐⭐ | FanGraphs |

**Key Insight:** Books price lazily using implied innings. Edge when:
- Bullpen is taxed
- Ace undervalued vs weak matchup
- Team is favorite but total is high

**Model Recommendation:** **Truncated Regression** or **Custom Quantile**

---

### D. Stolen Bases 🏃

**Stable Signal Features:**
| Feature | Stability | Source |
|---------|-----------|--------|
| Sprint Speed (ft/sec) | ⭐⭐⭐⭐⭐ | Statcast |
| SB Attempt Rate | ⭐⭐⭐⭐ | FanGraphs |
| Catcher Pop Time | ⭐⭐⭐⭐ | Statcast |
| Catcher CS% | ⭐⭐⭐⭐ | FanGraphs |
| Pitcher Hold Quality | ⭐⭐⭐ | Calculate |
| Manager Tendencies | ⭐⭐⭐ | Historical |

**Critical Insight:** Model **attempt probability**, not success rate

**Volatile Features:**
- Game script (score differential)
- Inning context
- Pitcher attention to runners

**Model Recommendation:** **Two-stage model** (Attempt Prob × Success Prob)

---

### E. Hits + Runs + RBIs (Composite) 📈

**Why It's Tricky:**
- Smooths variance (good)
- Books inflate juice (bad)
- Strong lineup dependency
- Correlated with team totals → double counting risk

**Required Features:**
| Feature | Why Critical | Source |
|---------|--------------|--------|
| Expected PA | Without this, can't model | Lineup + Pace |
| Batting Order | 1-3 get more PA | Lineup data |
| Team Total Line | Correlates with RBI opportunity | Odds |
| Opponent Pitcher Quality | Affects hit probability | Statcast/FG |

**Model Recommendation:** **Hierarchical Bayesian** with PA as offset

---

### F. First 5 Innings (F5) 🔔

**Why It's Promising:**
- Removes bullpen chaos
- SP matchup dominates
- Often mispriced when bullpen strength diverges

**Key Features:**
| Feature | Importance | Source |
|---------|------------|--------|
| SP Quality Differential | CRITICAL | FanGraphs |
| SP xFIP | High | FanGraphs |
| SP vs Lineup (handedness) | High | Lineup + Statcast |
| Historical F5 Results | Medium | Calculate |

**Model Recommendation:** **Ordinal Regression** (for run differential) or **ML/Spread specific**

---

### G. Team Totals 🎯

**Why It's Conditional:**
- Correlated with player props (can use)
- Books shade public teams
- Weather/park effects matter

**Avoid:**
- Coors traps
- Public favorites
- Weather overreaction (books already adjust)

**Model Recommendation:** **Ensemble** (Linear + Tree-based)

---

## Data Collection Recommendations

### Phase 1: Core Data (Weeks 1-2)

```bash
# 1. Run existing Statcast collector
python scripts/collect_statcast_comprehensive.py

# 2. Run existing MLB game collector
node scripts/mlb_data_collector.mjs

# 3. Download Retrosheet historical
curl -O https://retrosheet.org/downloads/alldata.zip
unzip alldata.zip -d data/mlb_historical/retrosheet/
```

### Phase 2: New Scripts Needed (Weeks 2-4)

**1. Daily Lineup Collector (NEW)**
```javascript
// scripts/collect_daily_lineups.mjs
// Scrapes RotoWire for confirmed lineups
// Stores: date, game_id, team, batting_order[], pitcher
// Runs: 2 hours before first pitch
```

**2. Historical Lineup Reconstructor (NEW)**
```python
# scripts/reconstruct_historical_lineups.py
# Uses box scores to determine batting order
# For 2021-2025 games
# Output: lineup_history.json
```

**3. Weather Collector (NEW)**
```javascript
// scripts/collect_game_weather.mjs
// Fetches weather at game time
// For backtesting: uses historical weather API
// Stores: temp, wind_speed, wind_direction, humidity
```

**4. Ballpark Factors (NEW)**
```python
# scripts/build_park_factors.py
# Aggregates FanGraphs + Statcast park factors
# Calculates handedness splits
# Output: park_factors.json (all 30 parks × 5 years)
```

**5. Catcher/Runner Profile (NEW for SB)**
```python
# scripts/build_sb_profiles.py
# Statcast: sprint speed, catcher pop time
# Historical: SB attempt rate, CS rate
# Output: sb_profiles.json
```

### Phase 3: Historical Odds (When Ready)

```javascript
// scripts/fetch_historical_hr_odds.mjs (exists)
// Execute with 50K TheOddsAPI credits
// Focus on 2023-2025 (most reliable markets)
```

---

## Gap Analysis

### ❌ Currently Missing (Action Required)

| Gap | Impact | Solution | Priority |
|-----|--------|----------|----------|
| **Daily Lineups** | CRITICAL for PA projection | Build RotoWire scraper | 🔴 HIGH |
| **Weather Data** | +/- 5-10% HR variance | Integrate weather API | 🟡 MEDIUM |
| **Catcher Pop Times** | Needed for SB model | Statcast query | 🟡 MEDIUM |
| **Manager Tendencies** | Pitcher usage patterns | Historical analysis | 🟡 MEDIUM |
| **Historical Lineups** | Backtest accuracy | Reconstruct from box | 🔴 HIGH |
| **Bullpen Usage State** | Outs recorded model | Track 3-day usage | 🟡 MEDIUM |

### ✅ Already Covered

| Feature | Source | Script |
|---------|--------|--------|
| Exit velocity | Statcast | collect_statcast_comprehensive.py |
| Barrel rate | Statcast | collect_statcast_comprehensive.py |
| Launch angle | Statcast | collect_statcast_comprehensive.py |
| Spray charts | Statcast | collect_statcast_comprehensive.py |
| Pitch-by-pitch | Statcast | collect_statcast_comprehensive.py |
| Game schedule | MLB API | mlb_data_collector.mjs |
| Play-by-play | MLB API | mlb_data_collector.mjs |
| HR events | MLB API | mlb_data_collector.mjs |
| Player stats | pybaseball | collect_statcast_comprehensive.py |

---

## Next Steps

### Immediate (This Week)

1. **Run existing collectors** to populate 2021-2025 data
2. **Build lineup collector** - most critical missing piece
3. **Add weather integration** - simple API call per game

### Short-term (This Month)

4. **Create park factors database** with handedness splits
5. **Reconstruct historical lineups** from box scores
6. **Build catcher profiles** for SB market research

### Before Season (March 2026)

7. **Complete historical odds collection** (50K credits)
8. **Run predictability ceiling analysis** for each market
9. **Build model prototypes** with zero odds consideration
10. **Document feature stability** across seasons

---

## Conclusion

### Repositories Worth Using

| Repo | Use For | Action |
|------|---------|--------|
| MLB Stats API (GUMBO) | All game data | Continue using |
| toddrob99/MLB-StatsAPI | Python helper | Keep |
| pybaseball | Statcast + FanGraphs | Keep (primary) |
| guillochon/mlb-api-mcp | Lineup queries | Evaluate for lineups |
| Retrosheet | Deep historical | Download for research |

### Repositories to Fork/Create

| Concept | Source | Our Version |
|---------|--------|-------------|
| Daily Lineups | dailymlblineups | `collect_daily_lineups.mjs` |
| Weather Integration | N/A | `collect_game_weather.mjs` |
| Park Factors | Various | `build_park_factors.py` |

### Data Sources Summary

| Source | Primary Use | Status |
|--------|-------------|--------|
| **Statcast** | Batted ball quality, pitch data | ✅ Collector exists |
| **FanGraphs** | Advanced stats, projections | ✅ Via pybaseball |
| **MLB Stats API** | Official schedules, rosters | ✅ Collector exists |
| **RotoWire** | Daily lineups | 🔴 Need to build |
| **Weather API** | Game conditions | 🔴 Need to integrate |
| **TheOddsAPI** | Historical odds | ⏳ Credits approved |

---

*Document generated: January 8, 2026*  
*For: MLB HR Round Robin V2 + Multi-Market Research*

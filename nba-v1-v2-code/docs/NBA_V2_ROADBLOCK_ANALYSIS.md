# 🏀 NBA Predictions V2 Roadblock Analysis

**Date:** October 28, 2025  
**Status:** V2 Deployment Failing - Returns "No games available"  
**Current Issue:** V2 function returns 0 predictions despite ESPN having 5 games today

---

## 📋 Executive Summary

We built NBA Elite V2 to fix a critical data quality issue in V1, but V2 is now returning **"No games available"** when it should show 5 predictions. This document details:

1. **What's broken in V1** (and why we need V2)
2. **What V2 was supposed to fix**
3. **Why V2 is currently failing**
4. **Technical implementation details**
5. **Next steps to resolve**

---

## 🚨 The V1 Problem: Using Stale 2024-25 Championship Data

### The Issue
**V1 predicted Boston Celtics (0-3) to beat New Orleans by 19.7 points.**

This is absurd because:
- Boston is 0-3 this season (worst start in years)
- They're using their 2024-25 **championship season** stats
- Predictions are completely divorced from current reality

### Root Cause Analysis

**Data Pipeline V1:**
```
Python Collector → GitHub JSON → Netlify Function → Elite Model → Predictions
```

**What's Broken:**
1. `collect-nba-ultimate.py` collects games from ESPN
2. **ALL box scores have `null` values** in `/data/nba/games/games_2025_26.json`
3. V1 function filters: `.filter(g => g.homeScore != null && g.awayScore != null)`
4. **Result:** 0 games from 2025-26 pass the filter
5. **Fallback:** V1 uses entire 2024-25 season (1,351 games) instead

**Evidence:**
```bash
# Current season games with scores
jq '[.[] | select(.homeScore != null)] | length' games_2025_26.json
# Output: 0

# Last season games with scores  
jq '[.[] | select(.homeScore != null)] | length' games_2024_25.json
# Output: 1351
```

**Code Proof (V1 Line 834):**
```javascript
// ELITE: Combine current + last season for early season predictions
const historicalGames = [...currentSeasonGames, ...lastSeasonGames];

// Line 415: Filter kills all 2025-26 games
.filter(g => g.homeScore != null && g.awayScore != null)
```

**Why Boston Shows -19.7:**
- V1 uses L10/L20 stats from 2024-25 championship run
- Boston had elite OffRtg ~120, DefRtg ~108 during title run
- Current 0-3 record is completely ignored
- Model thinks it's still facing championship Celtics

---

## 💡 The V2 Solution: Live API Data

### Design Goals

**V2 Architecture:**
```
ESPN Scoreboard API → NBA CDN Boxscore API → Calculate Stats → Elite Model → Predictions
```

**Key Improvements:**
1. ✅ **No GitHub dependencies** - eliminates null data issues
2. ✅ **Always current season** - uses live 2025-26 data
3. ✅ **NBA CDN API** - free, no auth, pre-calculated advanced stats
4. ✅ **Same elite model** - keeps proven 11.6 MAE spread accuracy
5. ✅ **Same 85 features** - OffRtg, DefRtg, Pace, Four Factors, L5/L10/L20

### Data Sources

**ESPN Scoreboard API:**
- **Purpose:** Get today's games + find historical game IDs
- **Endpoint:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- **Works:** ✅ Returns 5 games today
- **Tested:** `curl -s 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' | jq '.events | length'` → `5`

**NBA CDN Boxscore API:**
- **Purpose:** Get detailed box scores with advanced stats
- **Endpoint:** `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json`
- **Works:** ✅ Returns full statistics
- **Example:** `curl -s 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022500007.json'`
- **Stats Available:**
  - `fieldGoalsMade`, `fieldGoalsAttempted`
  - `threePointFieldGoalsMade`, `threePointFieldGoalsAttempted`
  - `freeThrowsMade`, `freeThrowsAttempted`
  - `reboundsOffensive`, `reboundsDefensive`
  - `assists`, `turnovers`, `blocks`, `steals`
  - Even has `fieldGoalsEffectiveAdjusted` (eFG%) pre-calculated!

---

## 🔴 Current V2 Failure: "No games available"

### Symptoms

**Test Page Output:**
```
🏀 NBA Elite V2 - API Test
Powered by NBA Stats API • Live L5/L10/L20 Data • No GitHub Dependencies
No games available
```

**API Response:**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2" | jq
# Output: []
```

**V1 for Comparison:**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" | jq '.predictions | length'
# Output: 5  (but using wrong 2024-25 data!)
```

### Diagnosis

**V2 is returning 0 predictions despite:**
1. ✅ ESPN has 5 games today
2. ✅ V2 function is deployed and running
3. ✅ No error returned (just empty array)
4. ✅ loaders.mjs code looks correct

**Possible Issues:**

1. **Deployment/Bundling Issue:**
   - Netlify might have cached old loaders.mjs
   - Function bundle might not include updated dependencies
   - Need to verify Netlify actually rebuilt with new code

2. **Historical Data Fetching Fails:**
   - `fetchTeamLastGames()` scans last 45 days of scoreboards
   - NBA CDN boxscore API might be timing out or blocking
   - Falls back to `getDefaultStats()` which has `games: 0`
   - Model skips predictions when no historical data available

3. **Team ID Mismatch:**
   - ESPN uses string IDs: `"1610612738"`
   - NBA CDN might use integer IDs: `1610612738`
   - Conversion happening at line: `parseInt(teamId)`
   - Might be breaking team matching logic

4. **Early Season Edge Case:**
   - Only 3-6 games played per team so far
   - Loop might not find enough completed games in 45-day window
   - Teams might have different number of games (scheduling quirks)

---

## 📁 File Structure

### V1 Files (Current Production - Broken Data)
```
/netlify/functions/nba-predictions-elite/index.mjs
├── Imports: models-inline.mjs, rci-adjustments.mjs, injuries.mjs, injury-adjustments.mjs
├── Data Source: GitHub raw JSON (games_2025_26.json + games_2024_25.json)
├── Issue: Null box scores → uses 2024-25 fallback
└── Result: Boston -19.7 using championship data

/data/nba/games/games_2025_26.json
├── Total games: 64
├── Games with scores: 0 ❌
└── All homeScore/awayScore values: null

/data/nba/games/games_2024_25.json  
├── Total games: 1,351
├── Games with scores: 1,351 ✅
└── Used as fallback in V1
```

### V2 Files (New - Not Working Yet)
```
/netlify/functions/nba-predictions-elite-v2/index.mjs
├── Imports: models-inline.mjs, rci-adjustments.mjs, injuries.mjs, injury-adjustments.mjs
├── Imports: fetchTeamRollingStats, loadTeamInfo from loaders.mjs ⭐
├── Data Source: NBA CDN API (live)
├── Current Status: Returns 0 predictions ❌
└── Expected: 5 predictions using current 2025-26 data

/netlify/functions/_lib/nba/loaders.mjs
├── fetchTeamLastGames() - NEW IMPLEMENTATION
│   ├── Step 1: Scan ESPN scoreboards (last 45 days)
│   ├── Step 2: Fetch NBA CDN boxscores for each game
│   └── Step 3: Calculate advanced stats (OffRtg, DefRtg, etc.)
├── fetchTeamRollingStats() - Calls fetchTeamLastGames() for L5/L10/L20
└── loadTeamInfo() - Team ID lookups

/public/nba-v2-test.html
├── Test interface for V2 API
├── URL: https://bgroundrobin.com/nba-v2-test.html
└── Currently shows: "No games available"
```

---

## 🔍 Code Deep Dive

### V1 Data Loading (Broken)

**File:** `/netlify/functions/nba-predictions-elite/index.mjs` (Lines 814-834)

```javascript
// Load historical games from GitHub
const currentSeasonUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nba/games/games_2025_26.json';
const lastSeasonUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nba/games/games_2024_25.json';

const [currentResponse, lastResponse] = await Promise.all([
  fetch(currentSeasonUrl),
  fetch(lastSeasonUrl)
]);

const currentSeasonGames = await currentResponse.json(); // 64 games, all null scores
let lastSeasonGames = [];

if (lastResponse.ok) {
  lastSeasonGames = await lastResponse.json(); // 1,351 games with scores
}

// Combine seasons
const historicalGames = [...currentSeasonGames, ...lastSeasonGames];
```

**File:** `/netlify/functions/nba-predictions-elite/index.mjs` (Lines 406-420)

```javascript
function calculateAdvancedStats(games, teamId, window = 10) {
  const numericTeamId = parseInt(teamId);
  
  const teamGames = games
    .filter(g => 
      g.homeTeamId === numericTeamId || g.awayTeamId === numericTeamId ||
      g.homeTeam === teamId || g.awayTeam === teamId
    )
    .filter(g => g.homeScore != null && g.awayScore != null) // ❌ KILLS ALL 2025-26 GAMES
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-window);
  
  // If no current season games, uses 2024-25 data
  if (teamGames.length === 0) {
    return getDefaultStats(); // But historical array HAS 2024-25 games!
  }
}
```

### V2 Data Loading (Current Implementation)

**File:** `/netlify/functions/_lib/nba/loaders.mjs` (Lines 207-398)

```javascript
/**
 * Fetch team's last N games using ESPN scoreboards + NBA CDN boxscores
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    console.log(`[NBA] 📊 Fetching last ${lastN} games for team ${teamId} via ESPN + NBA CDN...`);
    
    // STEP 1: Find game IDs by scanning recent ESPN scoreboards
    const gameIds = [];
    const maxDaysBack = 45;
    
    for (let daysBack = 1; daysBack <= maxDaysBack && gameIds.length < lastN; daysBack++) {
      const date = new Date();
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      
      try {
        const scoreboardUrl = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
        const response = await fetch(scoreboardUrl);
        if (!response.ok) continue;
        
        const data = await response.json();
        for (const event of data.events || []) {
          if (!event.status?.type?.completed) continue;
          
          const comp = event.competitions?.[0];
          if (!comp) continue;
          
          const home = comp.competitors?.find(c => c.homeAway === 'home');
          const away = comp.competitors?.find(c => c.homeAway === 'away');
          
          // ⚠️ POTENTIAL ISSUE: String vs integer comparison
          if (home?.id === String(teamId) || away?.id === String(teamId)) {
            gameIds.push(event.id);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.log(`[NBA] Scoreboard error for ${dateStr}: ${err.message}`);
      }
    }
    
    if (gameIds.length === 0) {
      console.log(`[NBA] ⚠️ No completed games found for team ${teamId}`);
      return null; // ❌ Returns null, V2 handler uses getDefaultStats()
    }
    
    const recentGames = gameIds.slice(0, lastN);
    console.log(`[NBA] Found ${recentGames.length} games, fetching NBA CDN boxscores...`);
    
    // STEP 2: Fetch NBA CDN boxscores
    let totalStats = {
      games: 0, wins: 0, points: 0, pointsAllowed: 0, possessions: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      offReb: 0, defReb: 0, assists: 0, turnovers: 0
    };
    
    for (const gameId of recentGames) {
      try {
        const boxUrl = `${NBA_CDN_BASE}/boxscore/boxscore_${gameId}.json`;
        const boxResponse = await fetch(boxUrl, { headers: NBA_HEADERS });
        
        if (!boxResponse.ok) {
          console.log(`[NBA] CDN boxscore unavailable for ${gameId}`);
          continue; // ⚠️ Silently skips failed fetches
        }
        
        const boxData = await boxResponse.json();
        const game = boxData.game;
        if (!game) continue;
        
        // ⚠️ POTENTIAL ISSUE: Type conversion
        const isHome = game.homeTeam?.teamId === parseInt(teamId);
        const team = isHome ? game.homeTeam : game.awayTeam;
        const opp = isHome ? game.awayTeam : game.homeTeam;
        
        if (!team?.statistics || !opp?.statistics) continue;
        
        totalStats.games++;
        if ((team.score || 0) > (opp.score || 0)) totalStats.wins++;
        
        totalStats.points += team.score || 0;
        totalStats.pointsAllowed += opp.score || 0;
        
        const ts = team.statistics;
        totalStats.fgm += ts.fieldGoalsMade || 0;
        totalStats.fga += ts.fieldGoalsAttempted || 0;
        totalStats.fg3m += ts.threePointFieldGoalsMade || 0;
        totalStats.fg3a += ts.threePointFieldGoalsAttempted || 0;
        totalStats.ftm += ts.freeThrowsMade || 0;
        totalStats.fta += ts.freeThrowsAttempted || 0;
        totalStats.offReb += ts.reboundsOffensive || 0;
        totalStats.defReb += ts.reboundsDefensive || 0;
        totalStats.assists += ts.assists || 0;
        totalStats.turnovers += ts.turnovers || 0;
        
        const poss = ts.fieldGoalsAttempted + 0.44 * ts.freeThrowsAttempted - ts.reboundsOffensive + ts.turnovers;
        totalStats.possessions += poss;
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (err) {
        console.error(`[NBA] CDN error for ${gameId}: ${err.message}`);
      }
    }
    
    const g = totalStats.games;
    if (g === 0) {
      console.log(`[NBA] ⚠️ No valid CDN boxscores for team ${teamId}`);
      return null; // ❌ Returns null again
    }
    
    // Calculate advanced metrics...
    return { games: g, wins, pace, offRtg, defRtg, ... };
    
  } catch (error) {
    console.error(`[NBA] Error for team ${teamId}:`, error.message);
    return null;
  }
}
```

**File:** `/netlify/functions/nba-predictions-elite-v2/index.mjs` (Lines 860-882)

```javascript
// V2: Fetch L5/L10/L20 stats from loaders.mjs
const [homeStats, awayStats] = await Promise.all([
  fetchTeamRollingStats(homeTeamData.id, '2025-26'),
  fetchTeamRollingStats(awayTeamData.id, '2025-26')
]);

// Use L10 as baseline, with L5 and L20 for specific features
const homeL3Raw = homeStats.l5 || getDefaultStats();  // ⚠️ If null, uses defaults
const homeL10Raw = homeStats.l10 || getDefaultStats();
const homeL20Raw = homeStats.l20 || getDefaultStats();

const awayL3Raw = awayStats.l5 || getDefaultStats();
const awayL10Raw = awayStats.l10 || getDefaultStats();
const awayL20Raw = awayStats.l20 || getDefaultStats();

console.log(`[NBA Elite V2] ${home.team.abbreviation} games: L5=${homeL3Raw.games}, L10=${homeL10Raw.games}, L20=${homeL20Raw.games}`);
console.log(`[NBA Elite V2] ${away.team.abbreviation} games: L5=${awayL3Raw.games}, L10=${awayL10Raw.games}, L20=${awayL20Raw.games}`);

// If getDefaultStats() was used, games = 0
// Model might skip or produce invalid predictions
```

**File:** `/netlify/functions/nba-predictions-elite-v2/index.mjs` (Lines 29-38)

```javascript
/**
 * Default stats when API data unavailable (fallback)
 */
function getDefaultStats() {
  return {
    pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
    efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
    ftFga: 0.22, winPct: 0.50, games: 0, wins: 0, losses: 0, // ❌ games: 0
    fgPct: 0.47, fg3Pct: 0.36, ftPct: 0.78,
    rebounds: 0, assists: 0, turnovers: 0
  };
}
```

---

## 🧪 Testing & Evidence

### Manual API Tests (All Working)

**ESPN Scoreboard (Today's Games):**
```bash
curl -s 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' \
  | jq '.events | length'
# Output: 5 ✅
```

**ESPN Scoreboard (Recent Date):**
```bash
curl -s 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20251027' \
  | jq '.events | length'
# Output: 5 ✅
```

**NBA CDN Boxscore:**
```bash
curl -s 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022500007.json' \
  | jq '.game.homeTeam.statistics | keys | length'
# Output: 47 stats available ✅
```

**NBA CDN Boxscore Stats Sample:**
```json
{
  "assists": 20,
  "fieldGoalsMade": 33,
  "fieldGoalsAttempted": 87,
  "fieldGoalsPercentage": 0.379,
  "fieldGoalsEffectiveAdjusted": 0.442,
  "threePointFieldGoalsMade": 11,
  "threePointFieldGoalsAttempted": 41,
  "freeThrowsMade": 18,
  "freeThrowsAttempted": 27,
  "reboundsOffensive": 16,
  "reboundsDefensive": 32,
  "turnovers": 26,
  "blocks": 4,
  "steals": 5
  // ... 34 more stats
}
```

### V1 vs V2 Live Tests

**V1 (Working but Wrong Data):**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" \
  | jq '.predictions | length'
# Output: 5

curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" \
  | jq '.predictions[] | select(.awayTeam == "BOS") | .spread'
# Output: -19.7 ❌ (Using 2024-25 championship data!)
```

**V2 (Failing Completely):**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2" \
  | jq '.'
# Output: [] ❌

# Test page shows:
# "No games available"
```

---

## 🎯 Debugging Steps Needed

### 1. Check Netlify Deploy Status
- Verify function actually rebuilt with new loaders.mjs
- Check Netlify function logs for errors
- Confirm no build caching issues

### 2. Add Detailed Logging
```javascript
// In loaders.mjs fetchTeamLastGames()
console.log(`[DEBUG] Team ${teamId} - Found ${gameIds.length} game IDs`);
console.log(`[DEBUG] Game IDs:`, gameIds);
console.log(`[DEBUG] CDN responses:`, totalStats.games, 'successful fetches');

// In V2 handler
console.log(`[DEBUG] Home stats:`, homeStats);
console.log(`[DEBUG] Away stats:`, awayStats);
console.log(`[DEBUG] Using defaults?`, homeL10Raw.games === 0);
```

### 3. Test Individual Components
```javascript
// Test 1: Can we find games for a specific team?
const celtics = '1610612738';
const games = await fetchTeamLastGames(celtics, '2025-26', 10);
console.log('Celtics L10:', games);

// Test 2: Can we fetch a known game ID from CDN?
const testGameId = '0022500007';
const boxUrl = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${testGameId}.json`;
const response = await fetch(boxUrl);
const data = await response.json();
console.log('CDN boxscore:', data.game.homeTeam.teamId);

// Test 3: Do team IDs match?
console.log('ESPN team ID:', home.id, typeof home.id);
console.log('NBA CDN team ID:', data.game.homeTeam.teamId, typeof data.game.homeTeam.teamId);
```

### 4. Check Team ID Matching
```javascript
// Potential issue: ESPN uses strings, CDN uses integers
// Current code does:
if (home?.id === String(teamId)) // Converts teamId to string
// And:
const isHome = game.homeTeam?.teamId === parseInt(teamId); // Converts teamId to int

// Verify both conversions work correctly
```

### 5. Check Date Range
```javascript
// Are there any completed games in last 45 days?
// Test with expanded range:
const maxDaysBack = 90; // Try 90 days

// Or test specific dates we know have games:
const knownGameDate = '20251027'; // Yesterday
```

---

## 📊 Expected vs Actual Behavior

### Expected V2 Flow
```
1. ESPN Scoreboard → 5 games today ✅
2. V2 Handler starts processing game 1
3. fetchTeamRollingStats(homeTeam, '2025-26')
   ├── fetchTeamLastGames(homeTeam, '2025-26', 5)
   │   ├── Scan ESPN scoreboards (last 45 days)
   │   ├── Find 3-6 completed games for this team
   │   ├── Fetch NBA CDN boxscores (0022500001, 0022500002, etc.)
   │   ├── Calculate stats from totals
   │   └── Return { games: 5, offRtg: 112.3, defRtg: 115.8, ... }
   ├── fetchTeamLastGames(homeTeam, '2025-26', 10)
   └── fetchTeamLastGames(homeTeam, '2025-26', 20)
4. Same for awayTeam
5. Build feature vector (85 features)
6. Make prediction
7. Return to user
```

### Actual V2 Behavior
```
1. ESPN Scoreboard → 5 games today ✅
2. V2 Handler starts processing game 1
3. fetchTeamRollingStats(homeTeam, '2025-26')
   ├── fetchTeamLastGames(homeTeam, '2025-26', 5)
   │   ├── Scan ESPN scoreboards (last 45 days)
   │   ├── ⚠️ Find 0 game IDs (or team ID mismatch?)
   │   └── return null
   ├── fetchTeamLastGames returns null for all windows
   └── Returns { l5: null, l10: null, l20: null }
4. V2 Handler uses getDefaultStats() → games: 0
5. ❓ Model skips prediction or produces invalid result
6. predictions array stays empty []
7. Returns "No games available"
```

---

## 🔧 Proposed Solutions

### Option 1: Debug Current V2 Implementation
**Steps:**
1. Add extensive logging to loaders.mjs
2. Check Netlify function logs
3. Verify team ID matching logic
4. Test NBA CDN API directly with known game IDs
5. Ensure proper async/await handling
6. Check for timeout issues (150ms delays × 45 days × 2 teams = potential timeout)

**Pros:**
- Keeps clean architecture (ESPN + NBA CDN)
- Best long-term solution
- Uses official NBA data

**Cons:**
- Debugging is time-consuming
- Multiple potential failure points

### Option 2: Use ESPN Scoreboard Data Directly
**Modification:** Instead of fetching NBA CDN boxscores, use stats already in ESPN scoreboard response

```javascript
// ESPN scoreboard includes competitor statistics:
const team = comp.competitors.find(c => c.homeAway === 'home');
const teamStats = team.statistics || [];

// Has: fieldGoalsMade, threePointFieldGoalsMade, assists, turnovers, etc.
// Can calculate advanced metrics from these
```

**Pros:**
- Single API call (faster)
- Already proven to work
- Simpler debugging

**Cons:**
- ESPN stats might be less detailed than NBA CDN
- Limits future enhancements

### Option 3: Hybrid Approach
**Use V1's GitHub data for now, fix collector later**

```javascript
// Quick fix: Make Python collector work
// Then V1 automatically uses current data
// No V2 needed (yet)
```

**Pros:**
- Minimal code changes
- Proven V1 architecture
- Can debug collector separately

**Cons:**
- Still depends on GitHub
- Doesn't solve architectural issues
- Collector has been broken for weeks

### Option 4: Use Alternative NBA API
**Try `balldontlie.io` or `sportsdata.io`**

**Pros:**
- Free tiers available
- Well-documented
- Proven reliable

**Cons:**
- Requires API keys
- Rate limits
- External dependency

---

## 📝 Next Steps

### Immediate Actions (Next 1 Hour)
1. ✅ Create this documentation
2. ✅ ZIP V1 and V2 code
3. ⏳ Get GPT evaluation
4. ⏳ Review GPT recommendations
5. ⏳ Implement chosen solution

### Short-term (Next 24 Hours)
1. Get V2 working OR revert to fixed V1
2. Verify predictions use current 2025-26 data
3. Test Boston game shows realistic spread
4. Deploy to production

### Long-term (Next Week)
1. Add comprehensive error logging
2. Add data quality monitoring
3. Set up alerts for null data
4. Create automated tests
5. Document all API dependencies

---

## 📦 Files Included in ZIP

```
nba-v1-v2-code/
├── V1/
│   ├── index.mjs                    # Main V1 function (uses GitHub data)
│   ├── models-inline.mjs            # Elite model weights
│   ├── rci-adjustments.mjs          # Roster continuity adjustments
│   ├── injury-adjustments.mjs       # Injury impact calculations
│   ├── injuries.mjs                 # Injury data loader
│   └── calculateAdvancedStats.js    # Stats calculation (LINE 415 FILTER!)
├── V2/
│   ├── index.mjs                    # Main V2 function (uses APIs)
│   ├── loaders.mjs                  # ESPN + NBA CDN fetchers
│   ├── models-inline.mjs            # Same elite model
│   ├── rci-adjustments.mjs          # Same RCI logic
│   ├── injury-adjustments.mjs       # Same injury logic
│   └── injuries.mjs                 # Same injury data
├── data/
│   ├── games_2025_26.json          # Current season (ALL NULL SCORES!)
│   └── games_2024_25.json          # Last season (used in V1 fallback)
├── test/
│   └── nba-v2-test.html            # Test page (shows "No games available")
└── docs/
    └── NBA_V2_ROADBLOCK_ANALYSIS.md # This document
```

---

## 🤔 Questions for GPT Review

1. **Why is V2 returning 0 predictions?**
   - Is it the team ID matching logic?
   - Is NBA CDN API timing out?
   - Is there a deployment/bundling issue?
   - Are we scanning the wrong date range?

2. **What's the fastest path to working predictions?**
   - Fix V2 (debug current implementation)
   - Use ESPN data only (simpler)
   - Fix V1 collector (proven architecture)
   - Use different API entirely

3. **Best practices for handling early season?**
   - How to handle teams with 3-6 games?
   - Should we use preseason data as fallback?
   - How to blend limited current + robust historical?

4. **Architecture recommendations?**
   - Is ESPN + NBA CDN the right approach?
   - Should we cache API responses?
   - How to handle API failures gracefully?
   - What's the ideal retry/timeout strategy?

5. **Testing strategy?**
   - How to validate stats calculation accuracy?
   - How to ensure predictions make sense?
   - What monitoring should we add?

---

## 📧 Contact

**Developer:** Assistant  
**Project:** NBA Elite Predictions V2  
**Status:** Debugging in progress  
**Priority:** HIGH - Production V1 using wrong data  
**Timeline:** Need working solution within 24 hours

**Key Stakeholder Note:**
V1 is technically "working" (returns 5 predictions), but is fundamentally broken (uses 2024-25 data). We need V2 fixed ASAP or will have to accept inaccurate predictions until then.

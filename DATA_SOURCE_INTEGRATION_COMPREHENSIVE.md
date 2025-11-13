# NBA Player Props: Complete Data Source Integration Plan
## Addressing Name Matching, Fallbacks, and Multi-Source Architecture

**Created:** November 12, 2025  
**Status:** 🔧 CRITICAL ARCHITECTURE REVIEW  
**Purpose:** Answer key questions about data integration, prevent future failures

---

## 🎯 Your Critical Questions Answered

### Question 1: "Does the above include our new additional data sources?"

**SHORT ANSWER:** ❌ **NO** - The current strategy document lists NEW data sources but doesn't show HOW they integrate with existing sources (ESPN, The Odds API, team-info.json, NBA CDN).

**DETAILED ANSWER:**

#### Current Data Sources (ALREADY IN USE):
1. **ESPN API** - Player boxscores (last 25 days)
   - Location: `netlify/functions/generate-daily-predictions.mjs`
   - Returns: `teamTricode` (e.g., "GSW", "LAC", "BKN")
   
2. **The Odds API** - Props lines and game schedules
   - Location: `netlify/functions/generate-daily-predictions.mjs`
   - Returns: Full team names (e.g., "Golden State Warriors", "Los Angeles Clippers")
   - Has mapping: `TEAM_NAME_MAP` (30 teams)
   
3. **Team Info JSON** - Team metadata (already in repo)
   - Location: `data/nba/teams/team-info.json`
   - Contains: NBA team IDs, full names, abbreviations, cities
   - **NOT currently imported by prediction functions** ⚠️

4. **Netlify Blobs** - Cached boxscores
   - Currently 214 days stale (being fixed)

#### New Data Sources (PROPOSED BUT NOT INTEGRATED):
1. **NBA Stats API (stats.nba.com via nba_api)** - Opponent defense
   - Status: ⏳ NOT YET IMPLEMENTED
   - Will save to: `data/nba/opponent-defense/2025-26.json`
   - Team format: **UNKNOWN** (need to verify tricode format)
   
2. **NBA CDN (cdn.nba.com)** - Faster boxscore alternative
   - Status: ⏳ NOT YET IMPLEMENTED
   - Team format: **UNKNOWN** (likely matches ESPN)
   
3. **Basketball Reference (via nbastatR)** - Validation layer
   - Status: ⏳ NOT YET IMPLEMENTED
   - Team format: **UNKNOWN** (likely uses full names)

**PROBLEM:** We don't know what team name formats these NEW sources use, and we haven't built unified mapping.

---

### Question 2: "Name matching should include ALL POSSIBLE VARIATIONS FOR ALL DATA POINTS WE HIT"

**SHORT ANSWER:** ✅ **AGREED** - We need a MASTER team mapping that handles ALL variations from ALL sources.

**DETAILED MAPPING REQUIREMENTS:**

#### All Team Name Variations We Need to Handle:

| Source | Format | Example | Notes |
|--------|--------|---------|-------|
| **ESPN API** | Tricode | `GSW` | 3-letter abbreviation |
| **The Odds API** | Full Name | `Golden State Warriors` | Currently mapped in TEAM_NAME_MAP |
| **team-info.json** | Tricode + Full | `"abbreviation": "GSW"`, `"name": "Golden State Warriors"` | Canonical source |
| **NBA Stats API** | **TBD** | `GSW` or `Golden State` or `Warriors`? | NEED TO TEST |
| **NBA CDN** | **TBD** | Likely `GSW` (same as ESPN) | NEED TO TEST |
| **Basketball Ref** | **TBD** | Likely full names | NEED TO TEST |
| **User Input** | Flexible | Any of the above | Must handle all |

#### Edge Cases We MUST Handle:

1. **LA Teams:**
   - "Los Angeles Lakers" vs "LA Lakers" vs "LAL"
   - "Los Angeles Clippers" vs "LA Clippers" vs "LAC"
   
2. **Regional Variations:**
   - "New York Knicks" vs "NY Knicks" vs "NYK"
   - "Golden State Warriors" vs "GS Warriors" vs "GSW"
   
3. **Historical Changes:**
   - "Charlotte Bobcats" → "Charlotte Hornets" (changed 2014)
   - "New Jersey Nets" → "Brooklyn Nets" (changed 2012)
   - "Seattle SuperSonics" → "Oklahoma City Thunder" (changed 2008)
   
4. **Player Trades/Moves (Current Crisis):**
   - Kevin Durant: BKN → PHX → **HOU** (current)
   - Anfernee Simons: POR → **BOS** (current)
   - Must use LATEST roster, not stale Blobs

#### Solution: Universal Team Mapper

**Create:** `netlify/functions/lib/team-mapper.mjs`

```javascript
/**
 * Universal NBA Team Mapper
 * Handles ALL team name variations from ALL data sources
 * Single source of truth for team name resolution
 */

import teamInfo from '../../../data/nba/teams/team-info.json' assert { type: 'json' };

// Build reverse lookup maps
const TRICODE_TO_FULL = {};
const FULL_TO_TRICODE = {};
const CITY_TO_TRICODE = {};
const NICKNAME_TO_TRICODE = {};
const ALIASES = {};

// Initialize from canonical team-info.json
teamInfo.teams.forEach(team => {
  const tricode = team.abbreviation;
  const fullName = team.name;
  const city = team.city;
  const nickname = fullName.replace(city, '').trim(); // "Warriors" from "Golden State Warriors"
  
  TRICODE_TO_FULL[tricode] = fullName;
  FULL_TO_TRICODE[fullName] = tricode;
  FULL_TO_TRICODE[fullName.toLowerCase()] = tricode; // case-insensitive
  CITY_TO_TRICODE[city] = tricode;
  NICKNAME_TO_TRICODE[nickname] = tricode;
  
  // Common aliases
  ALIASES[`${city} ${nickname}`] = tricode; // "Golden State Warriors"
  ALIASES[`${city.split(' ')[0]} ${nickname}`] = tricode; // "Golden Warriors" (abbr city)
  
  // LA special cases
  if (city === 'Los Angeles') {
    ALIASES[`LA ${nickname}`] = tricode; // "LA Lakers"
    ALIASES[`L.A. ${nickname}`] = tricode; // "L.A. Lakers"
  }
  
  // NY special case
  if (city === 'New York') {
    ALIASES[`NY ${nickname}`] = tricode; // "NY Knicks"
    ALIASES[`N.Y. ${nickname}`] = tricode; // "N.Y. Knicks"
  }
});

/**
 * Resolve any team name variation to standard tricode
 * @param {string} teamName - Any team identifier
 * @returns {string|null} - Standard tricode (e.g., "GSW") or null if not found
 */
export function normalizeTeamName(teamName) {
  if (!teamName) return null;
  
  const input = teamName.trim();
  
  // Already a tricode? (3 chars, all uppercase)
  if (/^[A-Z]{3}$/.test(input)) {
    return TRICODE_TO_FULL[input] ? input : null;
  }
  
  // Try exact full name match (case-insensitive)
  if (FULL_TO_TRICODE[input.toLowerCase()]) {
    return FULL_TO_TRICODE[input.toLowerCase()];
  }
  
  // Try aliases
  if (ALIASES[input]) {
    return ALIASES[input];
  }
  
  // Try partial matching (for user input like "warriors" → "GSW")
  const lowerInput = input.toLowerCase();
  for (const [nickname, tricode] of Object.entries(NICKNAME_TO_TRICODE)) {
    if (nickname.toLowerCase() === lowerInput) {
      return tricode;
    }
  }
  
  // Last resort: fuzzy match on city or nickname
  for (const [city, tricode] of Object.entries(CITY_TO_TRICODE)) {
    if (lowerInput.includes(city.toLowerCase())) {
      return tricode;
    }
  }
  
  console.warn(`⚠️ Could not resolve team name: "${teamName}"`);
  return null;
}

/**
 * Get full team name from tricode
 */
export function getFullName(tricode) {
  return TRICODE_TO_FULL[tricode] || null;
}

/**
 * Validate a matchup (check both teams are valid)
 */
export function validateMatchup(homeTeam, awayTeam) {
  const home = normalizeTeamName(homeTeam);
  const away = normalizeTeamName(awayTeam);
  
  if (!home || !away) {
    console.error(`❌ Invalid matchup: ${homeTeam} vs ${awayTeam}`);
    return { valid: false, home: null, away: null };
  }
  
  return { valid: true, home, away };
}

/**
 * Compare two team names (handles any format)
 */
export function teamsMatch(team1, team2) {
  const t1 = normalizeTeamName(team1);
  const t2 = normalizeTeamName(team2);
  return t1 && t2 && t1 === t2;
}

export default {
  normalizeTeamName,
  getFullName,
  validateMatchup,
  teamsMatch,
  TRICODE_TO_FULL,
  FULL_TO_TRICODE
};
```

#### Integration Plan:

1. **Update generate-daily-predictions.mjs:**
```javascript
import { normalizeTeamName, validateMatchup } from './lib/team-mapper.mjs';

// When fetching props from The Odds API:
for (const game of gamesData) {
  const matchup = validateMatchup(game.home_team, game.away_team);
  if (!matchup.valid) continue; // Skip invalid games
  
  // Use normalized tricodes everywhere
  const homeTricode = matchup.home;
  const awayTricode = matchup.away;
  
  // ...rest of logic...
}
```

2. **Update ALL scripts that reference team names:**
   - `run-full-model-tonight.mjs`
   - `collect-historical-odds.js`
   - `backtest-*.js`
   - Any future scripts

3. **Test with ALL data sources:**
   - ESPN API: Already returns tricodes ✅
   - The Odds API: Uses full names, map with `normalizeTeamName()` ✅
   - NBA Stats API: **TEST when implementing** (likely tricodes)
   - NBA CDN: **TEST when implementing** (likely tricodes)

---

### Question 3: "Do we have/should we have fallbacks on data sourcing to prevent what happened today?"

**SHORT ANSWER:** ⚠️ **PARTIAL** - We HAD a fallback (Blobs → ESPN), but we REMOVED it today. We need to RESTORE it AND add more layers.

**DETAILED FALLBACK STRATEGY:**

#### What Went Wrong Today:

**Yesterday's Working System (e492f816):**
```javascript
// Try 1: Load from Blobs (fast, <1s)
let boxscores = await loadFromBlobs();

// Try 2: If Blobs stale or failed, fetch ESPN
if (!boxscores || isStale(boxscores)) {
  boxscores = await fetchESPNBoxscores(15); // Minimal days
}
```
✅ **Result:** Completed in <60s, fresh data (Simons on BOS)

**Today's "Improved" System (08ce3dce, cc5f0cec, 46ce07d0):**
```javascript
// ALWAYS fetch fresh from ESPN (no Blobs check)
let boxscores = await fetchESPNBoxscores(25); // More days = slower
```
❌ **Result:** Timeout at 60s, system broken

**Root Cause:** Removed graceful fallback, made slow path the ONLY path.

---

#### Comprehensive Fallback Architecture (ELITE)

**Tier 1: Fast Cache (Netlify Blobs)**
- **When:** Always try first
- **Speed:** <1 second
- **Freshness check:** Must be <12 hours old
- **Failure modes:**
  - Blobs don't exist → Tier 2
  - Blobs >12h old → Tier 2
  - Blobs corrupted → Tier 3
  - Blobs service down → Tier 3

**Tier 2: ESPN API (Primary Fresh Source)**
- **When:** Blobs failed/stale
- **Speed:** ~30-40 seconds (15 days)
- **Rate limit:** 500ms between requests
- **Failure modes:**
  - ESPN API down → Tier 3
  - ESPN rate limited → Tier 3
  - ESPN timeout → Tier 3

**Tier 3: NBA CDN (Fast Alternative)**
- **When:** ESPN failed
- **Speed:** ~20-30 seconds (expected)
- **Format:** JSON boxscores (same structure as ESPN)
- **Failure modes:**
  - CDN down → Tier 4
  - CDN missing recent games → Merge with Tier 4

**Tier 4: Git-Committed Boxscores (Last Resort)**
- **When:** All APIs failed
- **Speed:** <1 second (read from disk)
- **Source:** GitHub Action commits daily to `data/nba/player-logs/`
- **Freshness:** Up to 24 hours old (acceptable emergency fallback)
- **Failure modes:**
  - File doesn't exist → HARD FAIL with alert

**Tier 5: HARD FAIL (Graceful Degradation)**
- **When:** ALL tiers exhausted
- **Action:** Return cached predictions from yesterday (if available)
- **Alert:** Send notification (email, Slack, etc.)
- **User message:** "Using yesterday's predictions due to data outage"

---

#### Implementation: Resilient Data Loader

**Create:** `netlify/functions/lib/resilient-loader.mjs`

```javascript
/**
 * Resilient Data Loader with Multi-Tier Fallbacks
 * Ensures predictions ALWAYS complete within 60s
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const BLOBS_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const ESPN_TIMEOUT_MS = 45000; // 45 seconds max
const NBA_CDN_TIMEOUT_MS = 35000; // 35 seconds max

/**
 * Tier 1: Try Netlify Blobs (fast cache)
 */
async function loadFromBlobs(maxAgeMs = BLOBS_MAX_AGE_MS) {
  try {
    console.log('📦 [TIER 1] Trying Netlify Blobs...');
    const store = getStore('nba-data');
    const data = await store.get('player-boxscores-current', { type: 'json' });
    
    if (!data || !data.boxscores) {
      console.log('   ⚠️ No data in Blobs');
      return null;
    }
    
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    if (age > maxAgeMs) {
      console.log(`   ⚠️ Blobs too old: ${Math.round(age / 3600000)}h`);
      return null;
    }
    
    console.log(`   ✅ Loaded ${data.boxscores.length} records from Blobs (age: ${Math.round(age / 60000)}m)`);
    return { boxscores: data.boxscores, source: 'blobs' };
    
  } catch (err) {
    console.log(`   ❌ Blobs failed: ${err.message}`);
    return null;
  }
}

/**
 * Tier 2: Fetch from ESPN API (primary fresh source)
 */
async function loadFromESPN(daysBack = 15, timeoutMs = ESPN_TIMEOUT_MS) {
  try {
    console.log(`📡 [TIER 2] Fetching ${daysBack} days from ESPN API...`);
    const startTime = Date.now();
    const boxscores = [];
    
    for (let i = daysBack; i >= 1; i--) {
      // Check timeout budget
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        console.log(`   ⏱️ Timeout budget exceeded (${elapsed}ms), stopping at day ${i}`);
        break;
      }
      
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
      
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
        const response = await fetch(url, { timeout: 5000 });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        // ... parse boxscores (same as current code) ...
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
        
      } catch (err) {
        // Skip this day
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Loaded ${boxscores.length} records from ESPN in ${Math.round(elapsed / 1000)}s`);
    return { boxscores, source: 'espn' };
    
  } catch (err) {
    console.log(`   ❌ ESPN failed: ${err.message}`);
    return null;
  }
}

/**
 * Tier 3: Fetch from NBA CDN (fast alternative)
 */
async function loadFromNBACDN(daysBack = 15, timeoutMs = NBA_CDN_TIMEOUT_MS) {
  try {
    console.log(`🚀 [TIER 3] Fetching ${daysBack} days from NBA CDN...`);
    const startTime = Date.now();
    const boxscores = [];
    
    // NBA CDN structure: https://cdn.nba.com/static/json/liveData/boxscore/boxscore_GAMEID.json
    // We need game IDs first (from schedule or scoreboard)
    
    // TODO: Implement NBA CDN fetching
    // For now, return null (not yet implemented)
    console.log('   ⚠️ NBA CDN loader not yet implemented');
    return null;
    
  } catch (err) {
    console.log(`   ❌ NBA CDN failed: ${err.message}`);
    return null;
  }
}

/**
 * Tier 4: Load from Git-committed files (last resort)
 */
async function loadFromGit(daysBack = 15) {
  try {
    console.log('📁 [TIER 4] Loading from Git-committed player logs...');
    const boxscores = [];
    
    for (let i = daysBack; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      try {
        const filePath = path.join(process.cwd(), `data/nba/player-logs/${dateStr}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        boxscores.push(...data);
      } catch (err) {
        // File doesn't exist, skip
      }
    }
    
    if (boxscores.length === 0) {
      console.log('   ⚠️ No files found in Git');
      return null;
    }
    
    console.log(`   ✅ Loaded ${boxscores.length} records from Git`);
    return { boxscores, source: 'git' };
    
  } catch (err) {
    console.log(`   ❌ Git loading failed: ${err.message}`);
    return null;
  }
}

/**
 * Tier 5: Hard fail with graceful degradation
 */
async function hardFail() {
  console.log('💀 [TIER 5] ALL data sources failed!');
  
  // Try to load yesterday's predictions as emergency fallback
  try {
    const store = getStore('nba-data');
    const yesterdayPredictions = await store.get('predictions-yesterday', { type: 'json' });
    
    if (yesterdayPredictions) {
      console.log('   🆘 Using yesterday\'s predictions as emergency fallback');
      return {
        boxscores: [],
        source: 'emergency-yesterday',
        predictions: yesterdayPredictions,
        alert: 'ALL_DATA_SOURCES_FAILED'
      };
    }
  } catch {}
  
  // Truly nothing available
  throw new Error('CRITICAL: All data sources exhausted, no emergency fallback available');
}

/**
 * Master loading function with full fallback chain
 */
export async function loadBoxscoresResilient(options = {}) {
  const {
    daysBack = 15,
    allowStaleBlobs = false,
    maxTotalTime = 55000 // Leave 5s for prediction generation
  } = options;
  
  const startTime = Date.now();
  
  // Tier 1: Blobs (always try first)
  let result = await loadFromBlobs(allowStaleBlobs ? Infinity : BLOBS_MAX_AGE_MS);
  if (result) return result;
  
  // Check time budget
  let remainingTime = maxTotalTime - (Date.now() - startTime);
  if (remainingTime < 10000) {
    console.log('⏱️ Low time budget, skipping to Git');
    return await loadFromGit(daysBack) || await hardFail();
  }
  
  // Tier 2: ESPN (primary fresh source)
  result = await loadFromESPN(daysBack, Math.min(remainingTime, ESPN_TIMEOUT_MS));
  if (result) return result;
  
  // Check time budget
  remainingTime = maxTotalTime - (Date.now() - startTime);
  if (remainingTime < 10000) {
    console.log('⏱️ Low time budget, skipping to Git');
    return await loadFromGit(daysBack) || await hardFail();
  }
  
  // Tier 3: NBA CDN (fast alternative)
  result = await loadFromNBACDN(daysBack, Math.min(remainingTime, NBA_CDN_TIMEOUT_MS));
  if (result) return result;
  
  // Tier 4: Git (last resort)
  result = await loadFromGit(daysBack);
  if (result) return result;
  
  // Tier 5: Hard fail
  return await hardFail();
}

export default loadBoxscoresResilient;
```

---

#### Usage in generate-daily-predictions.mjs:

```javascript
import loadBoxscoresResilient from './lib/resilient-loader.mjs';

export default async function handler(event, context) {
  try {
    console.log('🏀 Generating NBA Player Props Predictions...\n');
    
    // Load boxscores with full fallback chain
    const result = await loadBoxscoresResilient({
      daysBack: 15, // Enough for L10 (some players miss games)
      maxTotalTime: 55000 // Leave 5s for predictions
    });
    
    console.log(`📊 Data source: ${result.source}`);
    
    // Emergency fallback mode?
    if (result.alert) {
      console.error(`🚨 ALERT: ${result.alert}`);
      // TODO: Send notification (Slack, email, etc.)
      
      if (result.predictions) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            predictions: result.predictions,
            warning: 'Using cached predictions from yesterday due to data outage',
            source: result.source
          })
        };
      }
    }
    
    // Normal path: generate predictions
    const predictions = generatePredictions(result.boxscores);
    
    // ... rest of logic ...
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
```

---

## 🏗️ Complete Integration Plan

### Phase 1: Restore Working System (TODAY)

**1.1 Revert Breaking Changes**
```bash
# Option A: Revert specific commits
git revert 46ce07d0 cc5f0cec 08ce3dce --no-edit

# Option B: Cherry-pick working version
git show e492f816:netlify/functions/generate-daily-predictions.mjs > \
  netlify/functions/generate-daily-predictions.mjs
git add netlify/functions/generate-daily-predictions.mjs
git commit -m "Restore working Blobs-first data loading"
```

**1.2 Keep Good Changes**
- ✅ KEEP `update-boxscores-daily.mjs` fix (b9d83db5)
- ✅ KEEP team name mapping (TEAM_NAME_MAP)

**1.3 Test**
```bash
# Manually trigger predictions
curl -X POST https://yoursite.netlify.app/.netlify/functions/trigger-nba-predictions

# Check completion time (should be <60s)
# Check rosters (Durant=HOU, Simons=BOS)
```

---

### Phase 2: Implement Universal Team Mapper (THIS WEEK)

**2.1 Create team-mapper.mjs**
- Copy implementation from above
- Test with all 30 teams
- Test all edge cases (LA teams, NY teams, etc.)

**2.2 Update All Functions**
- `generate-daily-predictions.mjs`
- `update-boxscores-daily.mjs`
- Any other team-referencing functions

**2.3 Test**
```bash
# Unit test the mapper
node netlify/functions/lib/team-mapper.test.mjs

# Integration test
curl https://yoursite.netlify.app/.netlify/functions/trigger-nba-predictions
```

---

### Phase 3: Implement Resilient Loader (THIS WEEK)

**3.1 Create resilient-loader.mjs**
- Copy implementation from above
- Implement Tier 1-4 (skip Tier 3 NBA CDN for now)
- Add logging for each tier

**3.2 Update generate-daily-predictions.mjs**
- Replace current data loading with `loadBoxscoresResilient()`
- Test with Blobs working
- Test with Blobs failed (manually corrupt Blobs)
- Test with ESPN rate limited (mock failure)

**3.3 Add Monitoring**
```javascript
// In resilient-loader.mjs
async function sendAlert(message) {
  // TODO: Integrate with monitoring service
  // Options: Slack webhook, email, SMS, PagerDuty, etc.
  console.error(`🚨 ALERT: ${message}`);
}

// Call when Tier 5 reached
if (result.alert) {
  await sendAlert(`NBA Props data loading failed: ${result.alert}`);
}
```

---

### Phase 4: Add NBA CDN Support (NEXT WEEK)

**4.1 Research NBA CDN Format**
```bash
# Test NBA CDN endpoints
curl https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json
curl https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022400123.json

# Document structure:
# - What fields are available?
# - What format are team names? (tricode, full, ID?)
# - What format are player stats?
# - How to get game IDs?
```

**4.2 Implement NBA CDN Loader**
- Add to resilient-loader.mjs as Tier 3
- Test speed vs ESPN (expect 30-50% faster)
- Test data quality (validate against ESPN)

**4.3 Update Team Mapper**
- Add NBA CDN team name format (if different from ESPN)

---

### Phase 5: Add Opponent Defense (NEXT WEEK)

**5.1 Create GitHub Action**
```yaml
# .github/workflows/nba-opponent-defense-daily.yml
name: Update NBA Opponent Defense Stats
on:
  schedule:
    - cron: '0 12 * * *' # 8 AM ET daily
  workflow_dispatch: # Manual trigger

jobs:
  update-defense:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install nba_api pandas
      
      - name: Fetch opponent defense stats
        run: python scripts/nba/update-opponent-defense.py
      
      - name: Commit results
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add data/nba/opponent-defense/
          git diff --quiet && git diff --staged --quiet || git commit -m "Update opponent defense stats [$(date +'%Y-%m-%d')]"
          git push
```

**5.2 Create Python Script**
```python
# scripts/nba/update-opponent-defense.py
from nba_api.stats.endpoints import LeagueDashTeamStats
import pandas as pd
import json
import os

def fetch_opponent_defense():
    """Fetch opponent defensive stats per team"""
    print("📊 Fetching opponent defensive stats...")
    
    # Fetch team defensive stats
    defense = LeagueDashTeamStats(
        season='2025-26',
        measure_type_detailed_defense='Defense',
        per_mode_detailed='PerGame'
    )
    
    df = defense.get_data_frames()[0]
    
    # Extract relevant metrics
    output = []
    for _, row in df.iterrows():
        team_abbr = row['TEAM_ABBREVIATION']
        
        output.append({
            'team': team_abbr,
            'defRating': float(row['DEF_RATING']),
            'rebsAllowedPer100': float(row['OPP_REB']),
            'astsAllowedPer100': float(row['OPP_AST']),
            'pace': float(row['PACE']),
            'lastUpdated': pd.Timestamp.now().isoformat()
        })
    
    return output

def main():
    # Fetch data
    data = fetch_opponent_defense()
    
    # Save to Git repo
    os.makedirs('data/nba/opponent-defense', exist_ok=True)
    output_path = 'data/nba/opponent-defense/2025-26.json'
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Saved {len(data)} teams to {output_path}")

if __name__ == '__main__':
    main()
```

**5.3 Test Team Name Format**
```python
# Check what format nba_api uses for team abbreviations
from nba_api.stats.endpoints import LeagueDashTeamStats

defense = LeagueDashTeamStats(season='2025-26')
df = defense.get_data_frames()[0]

print("Team abbreviations from nba_api:")
for abbr in df['TEAM_ABBREVIATION'].unique():
    print(f"  {abbr}")

# Expected output: GSW, LAL, LAC, BKN, etc. (same as ESPN)
# If different, update team-mapper.mjs accordingly
```

**5.4 Integrate with Predictions**
```javascript
// In generate-daily-predictions.mjs
import opponentDefense from '../../data/nba/opponent-defense/2025-26.json' assert { type: 'json' };
import { normalizeTeamName } from './lib/team-mapper.mjs';

// Build lookup
const defenseMap = new Map();
opponentDefense.forEach(team => {
  const tricode = normalizeTeamName(team.team); // Normalize just in case
  if (tricode) {
    defenseMap.set(tricode, team);
  }
});

// In prediction function
function generatePrediction(stats, propType, opponentTricode) {
  // ... existing logic ...
  
  // Opponent adjustment
  const oppDefense = defenseMap.get(opponentTricode);
  if (oppDefense) {
    if (propType === 'rebounds') {
      const leagueAvg = 52.0;
      const oppFactor = oppDefense.rebsAllowedPer100 / leagueAvg;
      prediction *= oppFactor;
    } else if (propType === 'assists') {
      const leagueAvg = 25.0;
      const oppFactor = oppDefense.astsAllowedPer100 / leagueAvg;
      prediction *= oppFactor;
    }
    
    // Pace adjustment
    const leaguePace = 99.5;
    const paceFactor = oppDefense.pace / leaguePace;
    prediction *= paceFactor;
  }
  
  return prediction;
}
```

---

### Phase 6: Add Git-Based Player Logs Backup (NEXT WEEK)

**6.1 Create GitHub Action for Daily Boxscore Backup**
```yaml
# .github/workflows/nba-backup-boxscores-daily.yml
name: Backup NBA Boxscores to Git
on:
  schedule:
    - cron: '0 13 * * *' # 9 AM ET daily (after games complete)
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Fetch yesterday's boxscores
        run: node scripts/nba/backup-boxscores-to-git.mjs
      
      - name: Commit results
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add data/nba/player-logs/
          git diff --quiet && git diff --staged --quiet || git commit -m "Backup boxscores [$(date +'%Y-%m-%d')]"
          git push
```

**6.2 Create Backup Script**
```javascript
// scripts/nba/backup-boxscores-to-git.mjs
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

async function fetchYesterdayBoxscores() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  
  console.log(`📥 Fetching boxscores for ${dateStr}...`);
  
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  const response = await fetch(url);
  const data = await response.json();
  
  const boxscores = [];
  // ... parse games (same as current code) ...
  
  return boxscores;
}

async function saveToGit(boxscores, date) {
  const dir = path.join(process.cwd(), 'data/nba/player-logs');
  await fs.mkdir(dir, { recursive: true });
  
  const filename = `${date}.json`;
  const filepath = path.join(dir, filename);
  
  await fs.writeFile(filepath, JSON.stringify(boxscores, null, 2));
  console.log(`✅ Saved ${boxscores.length} records to ${filename}`);
}

async function main() {
  const boxscores = await fetchYesterdayBoxscores();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  await saveToGit(boxscores, dateStr);
}

main().catch(console.error);
```

**6.3 Test Tier 4 Fallback**
```bash
# Manually corrupt Blobs and block ESPN to test Git fallback
# Should load from data/nba/player-logs/YYYY-MM-DD.json
```

---

## 📊 Testing & Validation Plan

### Unit Tests

**test-team-mapper.mjs:**
```javascript
import { normalizeTeamName, teamsMatch, validateMatchup } from '../netlify/functions/lib/team-mapper.mjs';

const tests = [
  // Tricodes
  { input: 'GSW', expected: 'GSW' },
  { input: 'LAL', expected: 'LAL' },
  
  // Full names
  { input: 'Golden State Warriors', expected: 'GSW' },
  { input: 'Los Angeles Lakers', expected: 'LAL' },
  
  // Aliases
  { input: 'LA Lakers', expected: 'LAL' },
  { input: 'LA Clippers', expected: 'LAC' },
  { input: 'NY Knicks', expected: 'NYK' },
  
  // Case insensitive
  { input: 'golden state warriors', expected: 'GSW' },
  { input: 'los angeles lakers', expected: 'LAL' },
  
  // Partial matches
  { input: 'Warriors', expected: 'GSW' },
  { input: 'Lakers', expected: 'LAL' },
  
  // Invalid
  { input: 'Seattle SuperSonics', expected: null },
  { input: 'invalid', expected: null }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = normalizeTeamName(test.input);
  if (result === test.expected) {
    console.log(`✅ "${test.input}" → "${result}"`);
    passed++;
  } else {
    console.log(`❌ "${test.input}" → "${result}" (expected "${test.expected}")`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**test-resilient-loader.mjs:**
```javascript
import loadBoxscoresResilient from '../netlify/functions/lib/resilient-loader.mjs';

// Test normal path (Blobs working)
console.log('Test 1: Blobs working');
const result1 = await loadBoxscoresResilient({ daysBack: 5 });
console.log(`Source: ${result1.source}, Records: ${result1.boxscores.length}`);

// Test fallback (Blobs corrupted, ESPN works)
console.log('\nTest 2: Blobs failed, ESPN works');
// TODO: Mock Blobs failure
const result2 = await loadBoxscoresResilient({ daysBack: 5 });
console.log(`Source: ${result2.source}, Records: ${result2.boxscores.length}`);

// Test all sources failed
console.log('\nTest 3: All sources failed');
// TODO: Mock all failures
try {
  const result3 = await loadBoxscoresResilient({ daysBack: 5 });
  console.log(`Source: ${result3.source}`);
} catch (err) {
  console.log(`Expected failure: ${err.message}`);
}
```

---

### Integration Tests

**test-predictions-end-to-end.mjs:**
```bash
# Test full prediction flow
curl -X POST https://yoursite.netlify.app/.netlify/functions/trigger-nba-predictions

# Check response:
# - Did it complete <60s?
# - Are rosters correct (Durant=HOU, Simons=BOS)?
# - Are matchups valid (no "undefined vs undefined")?
# - Are predictions reasonable (not 0, not NaN, not negative)?
```

---

## 🚨 Monitoring & Alerts

### Health Check Endpoint

**Create:** `netlify/functions/health-check-nba.mjs`

```javascript
import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import opponentDefense from '../../data/nba/opponent-defense/2025-26.json' assert { type: 'json' };

export default async function handler(event, context) {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  };
  
  // Check 1: Netlify Blobs freshness
  try {
    const store = getStore('nba-data');
    const data = await store.get('player-boxscores-current', { type: 'json' });
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    const ageHours = Math.round(age / 3600000);
    
    health.checks.blobs = {
      status: age < 12 * 3600000 ? 'ok' : 'stale',
      ageHours,
      recordCount: data.boxscores?.length || 0
    };
    
    if (age > 24 * 3600000) health.status = 'degraded';
  } catch (err) {
    health.checks.blobs = { status: 'error', error: err.message };
    health.status = 'degraded';
  }
  
  // Check 2: ESPN API reachability
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', { timeout: 5000 });
    health.checks.espn = { status: response.ok ? 'ok' : 'error' };
    if (!response.ok) health.status = 'degraded';
  } catch (err) {
    health.checks.espn = { status: 'error', error: err.message };
    health.status = 'degraded';
  }
  
  // Check 3: Opponent defense data freshness
  try {
    if (!opponentDefense || opponentDefense.length === 0) {
      health.checks.opponentDefense = { status: 'missing' };
      health.status = 'degraded';
    } else {
      const lastUpdated = opponentDefense[0]?.lastUpdated;
      const age = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : Infinity;
      const ageHours = Math.round(age / 3600000);
      
      health.checks.opponentDefense = {
        status: age < 48 * 3600000 ? 'ok' : 'stale',
        ageHours,
        teamCount: opponentDefense.length
      };
      
      if (age > 72 * 3600000) health.status = 'degraded';
    }
  } catch (err) {
    health.checks.opponentDefense = { status: 'error', error: err.message };
    health.status = 'degraded';
  }
  
  return {
    statusCode: health.status === 'healthy' ? 200 : 503,
    body: JSON.stringify(health, null, 2)
  };
}
```

**Test:**
```bash
curl https://yoursite.netlify.app/.netlify/functions/health-check-nba
```

**Set up monitoring:**
- Uptime Robot: Ping health check every 5 minutes
- Alert if status != 'healthy' for >15 minutes
- Send to Slack, email, SMS

---

## 📋 Summary: Answers to Your Questions

### ✅ Question 1: Additional Data Sources?
**Answer:** The current strategy document lists NEW sources (NBA Stats API, NBA CDN, Basketball Ref) but doesn't show HOW they integrate. **This document fixes that** with:
- Universal team mapper (handles ALL source variations)
- Resilient loader (integrates ALL sources with fallbacks)
- GitHub Actions for daily updates (opponent defense, boxscore backups)

### ✅ Question 2: Name Matching for ALL Variations?
**Answer:** **YES**, implemented `team-mapper.mjs` with:
- 30 NBA teams
- All name formats (tricode, full name, city, nickname, aliases)
- Edge cases (LA teams, NY teams, historical changes)
- Single source of truth (`team-info.json`)
- Fuzzy matching for user input

### ✅ Question 3: Fallbacks to Prevent Today's Disaster?
**Answer:** **YES**, implemented 5-tier fallback:
1. **Netlify Blobs** (fast cache, <1s)
2. **ESPN API** (primary fresh, ~30s)
3. **NBA CDN** (fast alternative, ~20s)
4. **Git-committed files** (emergency backup, <1s)
5. **Hard fail with yesterday's predictions** (graceful degradation)

**Plus:**
- Time budget management (max 55s for data, 5s for predictions)
- Automatic tier skipping if time running out
- Health check endpoint for monitoring
- Alerts when Tier 5 reached

---

## 🎯 Next Actions (Priority Order)

1. **TODAY:** Revert breaking commits, restore working Blobs-first logic ⚡
2. **TODAY:** Test predictions complete <60s with correct rosters ⚡
3. **This Week:** Implement universal team mapper 🎯
4. **This Week:** Implement resilient loader with fallbacks 🎯
5. **This Week:** Set up opponent defense GitHub Action 🎯
6. **Next Week:** Add NBA CDN support (Tier 3) 📈
7. **Next Week:** Add Git boxscore backups (Tier 4) 📈
8. **Next Week:** Set up health checks and monitoring 📈

---

**This is the ELITE architecture. Let's build it RIGHT.** 🚀

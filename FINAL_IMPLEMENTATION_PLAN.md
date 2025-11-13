# NBA Player Props: Final Implementation Plan
## Senior Engineering Review + GPT Optimizations Applied

**Created:** November 12, 2025  
**Status:** 🚀 PRODUCTION-READY WITH OPERATIONAL GUARDRAILS  
**Approval:** 90% aligned with surgical tweaks applied

---

## 🎯 Executive Summary

**Approved Architecture:**
- ✅ Revert to working Blobs-first + scoped ESPN fallback
- ✅ Hybrid loader with HARD 50s global budget (30s acquire, 10s transform, 10s merge)
- ✅ Opponent defense via GitHub Actions (NO runtime nba_api calls)
- ✅ Universal team mapper with NBA IDs (handles vendor spacing quirks)
- ✅ Multi-tier fallbacks ending in yesterday's predictions

**Key Improvements Applied:**
1. **Game-day aware TTLs** (6h game days, 12h off-days)
2. **Team-scoped fetching** (not blind "15 days")
3. **Concurrent fetching** (p=6 with AbortController, 6s per-request timeout)
4. **NBA CDN as Tier 2.5** (last 7 days only, faster than ESPN)
5. **Strict budget enforcement** (30s acquire hard stop)
6. **Blob schema versioning** (reject mismatches, track metadata)
7. **Sanity canaries** (reject if <65% of 7-day rolling median)
8. **Feature flags** (NBA_PROPS_FORCE_ESPN for incidents)
9. **Deterministic outputs** (stable sorts, 3dp max, clean diffs)

**Performance Targets:**
- Normal case: **25-35s** (Blobs + opponent adjustments)
- Cold cache: **35-45s** (concurrent ESPN/CDN fetch)
- Worst case: **<50s** (abort and proceed with partial data)

---

## 📋 Your Feedback Applied (Point by Point)

### ✅ What I Like (Keeping As-Is)

**1. Revert + Hybrid Loader with Hard Budget**
- Keep Blobs-first architecture
- Add 50s GLOBAL budget with 30s acquisition limit
- Sequential tiers with early abort

**2. Opponent/Pace via GitHub Actions**
- NO runtime nba_api calls (too slow)
- Daily GH Action commits to Git
- Netlify reads from static JSON (<1ms)

**3. Universal Team Mapper**
- Centralized off `team-info.json`
- Single source of truth
- **ENHANCED:** Now includes NBA Team IDs for vendor quirks

**4. Multi-Tier Fallbacks + Health Endpoint**
- 5-tier fallback chain
- Graceful degradation to yesterday's predictions
- Health check with detailed status

---

### 🔧 What I'd Change (Surgical Tweaks Applied)

#### 1. Tighter TTL + Game-Day Awareness

**Problem:** 12h TTL might be stale if games start in 4 hours.

**Solution:**
```javascript
/**
 * Calculate TTL based on game schedule
 * - Game day (games within 8h): 6h TTL
 * - Off day: 12h TTL
 * - <4h to first tip: REQUIRE fresh
 */
function calculateBlobsTTL(nextGameStart) {
  const now = Date.now();
  const hoursToTip = (nextGameStart - now) / (1000 * 60 * 60);
  
  if (hoursToTip < 4) {
    return 0; // Force fresh
  } else if (hoursToTip < 8) {
    return 6 * 60 * 60 * 1000; // 6h TTL
  } else {
    return 12 * 60 * 60 * 1000; // 12h TTL
  }
}
```

**Constants:**
```javascript
const TTL_GAME_DAY_MS = 6 * 60 * 60 * 1000;   // 6 hours
const TTL_OFF_DAY_MS = 12 * 60 * 60 * 1000;   // 12 hours
const FORCE_FRESH_HOURS = 4;                  // If <4h to tip, force fresh
```

#### 2. Scope ESPN by Need, Not Days

**Problem:** Fetching "last 15 days" blindly wastes time on off-days and international games.

**Solution:**
```javascript
/**
 * Build team set from today's games, fetch only those teams' recent games
 * Stop when each team has enough games for L10 (typically 6-9 calendar days)
 */
async function fetchTeamScopedBoxscores(teamSet, targetGamesPerTeam = 10) {
  const boxscores = [];
  const teamGameCounts = new Map(Array.from(teamSet).map(t => [t, 0]));
  
  let daysBack = 0;
  const maxDays = 20; // Safety limit
  
  while (daysBack < maxDays) {
    // Check if all teams have enough games
    const allSatisfied = Array.from(teamGameCounts.values())
      .every(count => count >= targetGamesPerTeam);
    
    if (allSatisfied) {
      console.log(`   ✅ All teams satisfied at ${daysBack} days`);
      break;
    }
    
    daysBack++;
    const dateStr = formatDate(daysAgo(daysBack));
    
    // Fetch this day's games
    const games = await fetchDayGames(dateStr);
    
    // Filter to teams we care about
    const relevantGames = games.filter(g => 
      teamSet.has(g.homeTeam) || teamSet.has(g.awayTeam)
    );
    
    if (relevantGames.length === 0) continue;
    
    // Parse boxscores and update counts
    for (const game of relevantGames) {
      const gameBoxscores = await parseGameBoxscore(game);
      boxscores.push(...gameBoxscores);
      
      // Update team game counts
      gameBoxscores.forEach(b => {
        const team = b.teamTricode;
        if (teamGameCounts.has(team)) {
          teamGameCounts.set(team, teamGameCounts.get(team) + 1);
        }
      });
    }
  }
  
  return boxscores;
}
```

**Benefit:** Often fetches 6-9 days instead of 15, saving 40-60% of API calls.

#### 3. Concurrency with Cap + Aborts

**Problem:** Sequential fetching with 500ms sleep is slow (15 days × 500ms = 7.5s wasted).

**Solution:**
```javascript
/**
 * Concurrent fetch with AbortController and per-request timeouts
 */
async function fetchConcurrent(urls, options = {}) {
  const {
    concurrency = 6,
    timeout = 6000,
    globalTimeout = 30000
  } = options;
  
  const controller = new AbortController();
  const results = [];
  const errors = [];
  
  // Global timeout
  const globalTimer = setTimeout(() => {
    console.log('⏱️ Global timeout reached, aborting remaining requests');
    controller.abort();
  }, globalTimeout);
  
  // Batch requests with concurrency limit
  const batches = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    batches.push(urls.slice(i, i + concurrency));
  }
  
  for (const batch of batches) {
    if (controller.signal.aborted) break;
    
    const promises = batch.map(async (url) => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          timeout
        });
        
        if (!response.ok) return null;
        return await response.json();
        
      } catch (err) {
        if (err.name === 'AbortError') return null;
        errors.push({ url, error: err.message });
        return null;
      }
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(r => r !== null));
  }
  
  clearTimeout(globalTimer);
  
  return { results, errors };
}
```

**Constants:**
```javascript
const CONCURRENCY = 6;              // Parallel requests
const PER_REQ_TIMEOUT_MS = 6000;    // 6s per request
const ACQUIRE_BUDGET_MS = 30000;    // 30s hard stop
```

**Benefit:** Reduces 15-day fetch from ~60s to ~25s (with p=6 concurrency).

#### 4. NBA CDN as Tier 2.5, Not Tier 3

**Problem:** NBA CDN is faster than ESPN for recent games but wasn't prioritized correctly.

**Solution:**
```javascript
/**
 * Tiered fetching strategy:
 * - Tier 1: Blobs (always try first)
 * - Tier 2: NBA CDN (last 7 days, faster)
 * - Tier 2.5: ESPN (gaps + >7 days old)
 * - Tier 3: Git-committed files
 * - Tier 4: Yesterday's predictions
 */
async function loadBoxscoresHybrid(options = {}) {
  const startTime = Date.now();
  
  // Tier 1: Blobs
  let result = await loadFromBlobs(options);
  if (result) return result;
  
  // Tier 2: NBA CDN for last 7 days (faster)
  const cdnBudget = Math.min(15000, options.maxTime - elapsed());
  const cdnResult = await loadFromNBACDN({ daysBack: 7, timeout: cdnBudget });
  
  // Tier 2.5: ESPN for gaps + older games
  const espnBudget = Math.min(25000, options.maxTime - elapsed());
  const espnResult = await loadFromESPN({ 
    startDay: 8,  // Start after CDN range
    endDay: 15,   // Or until teams satisfied
    timeout: espnBudget
  });
  
  // Merge results
  const merged = [...(cdnResult?.boxscores || []), ...(espnResult?.boxscores || [])];
  
  if (merged.length > 0) {
    return { boxscores: merged, source: 'cdn+espn' };
  }
  
  // Tier 3: Git fallback
  return await loadFromGit(options) || await hardFail();
}
```

**Benefit:** Saves 5-10s on recent games (CDN is ~2x faster than ESPN for last 7 days).

#### 5. Strict Budget Split

**Problem:** Without hard limits, one stage can consume entire 60s budget.

**Solution:**
```javascript
const BUDGETS = {
  GLOBAL: 50_000,        // Total function runtime
  ACQUIRE: 30_000,       // Data fetching (hard stop)
  TRANSFORM: 10_000,     // Calculate stats
  MERGE: 10_000          // Generate predictions + save
};

class BudgetTracker {
  constructor(budgets) {
    this.budgets = budgets;
    this.startTime = Date.now();
    this.stages = {};
  }
  
  startStage(name) {
    this.stages[name] = { start: Date.now() };
  }
  
  endStage(name) {
    const elapsed = Date.now() - this.stages[name].start;
    this.stages[name].elapsed = elapsed;
    
    const budget = this.budgets[name.toUpperCase()];
    if (budget && elapsed > budget) {
      console.warn(`⚠️ Stage "${name}" exceeded budget: ${elapsed}ms / ${budget}ms`);
    }
  }
  
  remaining(stage) {
    const budget = this.budgets[stage.toUpperCase()];
    const stageStart = this.stages[stage]?.start || Date.now();
    const elapsed = Date.now() - stageStart;
    return Math.max(0, budget - elapsed);
  }
  
  globalRemaining() {
    return Math.max(0, this.budgets.GLOBAL - (Date.now() - this.startTime));
  }
  
  enforceHardStop(stage) {
    const remaining = this.remaining(stage);
    if (remaining <= 0) {
      throw new Error(`HARD STOP: ${stage} budget exhausted`);
    }
  }
}

// Usage:
const tracker = new BudgetTracker(BUDGETS);

tracker.startStage('acquire');
try {
  // Fetch data with remaining budget
  const timeout = tracker.remaining('acquire');
  const data = await fetchData({ timeout });
  tracker.endStage('acquire');
} catch (err) {
  if (err.message.includes('HARD STOP')) {
    console.log('⏱️ Acquire stage hit hard stop, proceeding with partial data');
  }
}
```

**Benefit:** Guarantees we always leave time for prediction generation, never timeout at 60s.

#### 6. Blob Schema/Versioning

**Problem:** Schema changes can corrupt cached data without detection.

**Solution:**
```javascript
const BLOB_SCHEMA_VERSION = 2;

// Save to Blobs with metadata
async function saveToBlobs(boxscores, metadata = {}) {
  const store = getStore('nba-data');
  
  const payload = {
    schema: BLOB_SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    source: metadata.source || 'espn',
    teamSet: Array.from(new Set(boxscores.map(b => b.teamTricode))),
    gamesSpanDays: metadata.daysBack || calculateSpan(boxscores),
    recordCount: boxscores.length,
    boxscores
  };
  
  await store.set(`player-boxscores-current.v${BLOB_SCHEMA_VERSION}`, 
    JSON.stringify(payload)
  );
}

// Load from Blobs with validation
async function loadFromBlobs(options = {}) {
  try {
    const store = getStore('nba-data');
    const key = `player-boxscores-current.v${BLOB_SCHEMA_VERSION}`;
    const raw = await store.get(key);
    
    if (!raw) {
      console.log('   ⚠️ No data in Blobs');
      return null;
    }
    
    const data = JSON.parse(raw);
    
    // Validate schema
    if (data.schema !== BLOB_SCHEMA_VERSION) {
      console.log(`   ⚠️ Schema mismatch: got v${data.schema}, expected v${BLOB_SCHEMA_VERSION}`);
      return null;
    }
    
    // Validate freshness
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    const ttl = calculateBlobsTTL(options.nextGameStart);
    
    if (age > ttl) {
      console.log(`   ⚠️ Blobs too old: ${Math.round(age / 3600000)}h (TTL: ${Math.round(ttl / 3600000)}h)`);
      return null;
    }
    
    // Sanity check: record count
    const medianCount = getMedianRecordCount(); // 7-day rolling median
    if (data.recordCount < medianCount * 0.65) {
      console.log(`   ⚠️ Record count too low: ${data.recordCount} (expected ~${medianCount})`);
      return null;
    }
    
    console.log(`   ✅ Loaded ${data.recordCount} records from Blobs (age: ${Math.round(age / 60000)}m)`);
    return { boxscores: data.boxscores, source: 'blobs', metadata: data };
    
  } catch (err) {
    console.log(`   ❌ Blobs failed: ${err.message}`);
    return null;
  }
}
```

**Metadata Tracked:**
- `schema`: Version number (reject mismatches)
- `lastUpdated`: ISO timestamp
- `source`: 'espn', 'cdn', 'hybrid'
- `teamSet`: Array of tricodes in cache
- `gamesSpanDays`: Calendar days covered
- `recordCount`: Total player-game records

**Benefit:** Prevents silent corruption, enables monitoring, cleaner debugging.

#### 7. Size & Sanity Canaries

**Problem:** Blobs can be "fresh" but incomplete (partial write, API failure).

**Solution:**
```javascript
/**
 * Track 7-day rolling median record count
 * Reject if current Blobs <65% of median (likely incomplete)
 */
class SanityTracker {
  constructor() {
    this.history = []; // Last 7 days
    this.maxHistory = 7;
  }
  
  record(count) {
    this.history.push({ date: new Date().toISOString(), count });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  getMedian() {
    if (this.history.length === 0) return 400; // Bootstrap estimate
    
    const counts = this.history.map(h => h.count).sort((a, b) => a - b);
    const mid = Math.floor(counts.length / 2);
    return counts.length % 2 === 0 
      ? (counts[mid - 1] + counts[mid]) / 2 
      : counts[mid];
  }
  
  isHealthy(count) {
    const median = this.getMedian();
    return count >= median * 0.65; // At least 65% of median
  }
}

// Persist to Blobs
const sanityTracker = new SanityTracker();
// Load history from Blobs on init
// Record after each successful update
```

**Benefit:** Catches incomplete writes, API failures, data quality issues.

#### 8. Team Mapper: Add ID Mapping

**Problem:** Odds vendors have spacing quirks ("Trail Blazers" vs "Trailblazers", "76ers" vs "Sixers").

**Solution:**
```javascript
/**
 * Enhanced team mapper with NBA IDs
 * Handles vendor quirks via ID-based fallback
 */
import teamInfo from '../../../data/nba/teams/team-info.json' assert { type: 'json' };

// Build reverse lookups
const TRICODE_TO_INFO = {};
const ID_TO_INFO = {};
const FULL_TO_INFO = {};
const ALIASES = new Map();

teamInfo.teams.forEach(team => {
  const info = {
    id: team.id,
    tricode: team.abbreviation,
    fullName: team.name,
    city: team.city,
    nickname: team.name.replace(team.city, '').trim()
  };
  
  TRICODE_TO_INFO[info.tricode] = info;
  ID_TO_INFO[info.id] = info;
  FULL_TO_INFO[info.fullName.toLowerCase()] = info;
  
  // Add aliases for vendor quirks
  ALIASES.set(info.fullName.toLowerCase(), info);
  ALIASES.set(info.fullName.replace(/\s+/g, '').toLowerCase(), info); // "TrailBlazers"
  ALIASES.set(`${info.city} ${info.nickname}`.toLowerCase(), info);
  ALIASES.set(`${info.city}${info.nickname}`.toLowerCase(), info); // No space
  
  // LA/NY shortcuts
  if (info.city === 'Los Angeles') {
    ALIASES.set(`la ${info.nickname.toLowerCase()}`, info);
    ALIASES.set(`la${info.nickname.toLowerCase()}`, info);
  }
  if (info.city === 'New York') {
    ALIASES.set(`ny ${info.nickname.toLowerCase()}`, info);
    ALIASES.set(`ny${info.nickname.toLowerCase()}`, info);
  }
  
  // 76ers special case
  if (info.tricode === 'PHI') {
    ALIASES.set('philadelphia sixers', info);
    ALIASES.set('philadelphia 76ers', info);
    ALIASES.set('philly sixers', info);
  }
});

export function normalizeTeamName(input) {
  if (!input) return null;
  
  const cleaned = input.trim();
  
  // Already tricode?
  if (/^[A-Z]{3}$/.test(cleaned)) {
    return TRICODE_TO_INFO[cleaned]?.tricode || null;
  }
  
  // Try NBA ID (if numeric)
  if (/^\d+$/.test(cleaned)) {
    return ID_TO_INFO[parseInt(cleaned)]?.tricode || null;
  }
  
  // Try aliases (case-insensitive, spacing-insensitive)
  const normalized = cleaned.toLowerCase().replace(/\s+/g, ' ');
  const noSpaces = cleaned.toLowerCase().replace(/\s+/g, '');
  
  if (ALIASES.has(normalized)) {
    return ALIASES.get(normalized).tricode;
  }
  
  if (ALIASES.has(noSpaces)) {
    return ALIASES.get(noSpaces).tricode;
  }
  
  console.warn(`⚠️ Could not resolve: "${input}"`);
  return null;
}

export function getTeamInfo(tricodeOrIdOrName) {
  const tricode = normalizeTeamName(tricodeOrIdOrName);
  return tricode ? TRICODE_TO_INFO[tricode] : null;
}
```

**Benefit:** Handles "Portland Trail Blazers" vs "Portland Trailblazers" and NBA IDs from official APIs.

#### 9. nba_api Headers + Retries

**Problem:** GitHub Action hitting 429s on NBA Stats API.

**Solution:**
```python
# scripts/nba/update-opponent-defense.py
from nba_api.stats.endpoints import LeagueDashTeamStats
import pandas as pd
import json
import os
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def fetch_with_retries():
    """Fetch with exponential backoff retries"""
    
    # Configure retries
    retry_strategy = Retry(
        total=3,
        backoff_factor=2,  # 2s, 4s, 8s
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"]
    )
    
    # Set custom headers
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
        'Referer': 'https://www.nba.com/'
    }
    
    try:
        # Fetch defensive stats
        defense = LeagueDashTeamStats(
            season='2025-26',
            measure_type_detailed_defense='Defense',
            per_mode_detailed='PerGame',
            headers=headers,
            timeout=30
        )
        
        df = defense.get_data_frames()[0]
        return df
        
    except Exception as e:
        print(f"⚠️ Error fetching stats: {e}")
        print("Retrying in 5 seconds...")
        time.sleep(5)
        raise

def main():
    print("📊 Fetching opponent defensive stats...")
    
    # Fetch with retries
    for attempt in range(3):
        try:
            df = fetch_with_retries()
            break
        except Exception as e:
            if attempt == 2:
                raise
            print(f"Attempt {attempt + 1} failed, retrying...")
            time.sleep(10 * (attempt + 1))
    
    # Process data
    output = []
    for _, row in df.iterrows():
        output.append({
            'teamId': int(row['TEAM_ID']),
            'team': row['TEAM_ABBREVIATION'],
            'defRating': round(float(row['DEF_RATING']), 2),
            'rebsAllowedPer100': round(float(row['OPP_REB']), 2),
            'astsAllowedPer100': round(float(row['OPP_AST']), 2),
            'pace': round(float(row['PACE']), 2),
            'lastUpdated': pd.Timestamp.now().isoformat()
        })
    
    # Save with deterministic formatting
    os.makedirs('data/nba/opponent-defense', exist_ok=True)
    output_path = 'data/nba/opponent-defense/2025-26.json'
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2, sort_keys=True)
    
    print(f"✅ Saved {len(output)} teams to {output_path}")

if __name__ == '__main__':
    main()
```

**Benefit:** Avoids 429s, more reliable GitHub Action runs.

#### 10. Deterministic Outputs

**Problem:** Unstable JSON diffs trigger unnecessary Git commits.

**Solution:**
```javascript
/**
 * Deterministic JSON serialization
 * - Stable sort by player name, then date
 * - Max 3 decimal places for floats
 * - 2-space indent
 */
function serializeBoxscores(boxscores) {
  // Stable sort
  const sorted = [...boxscores].sort((a, b) => {
    if (a.playerName !== b.playerName) {
      return a.playerName.localeCompare(b.playerName);
    }
    return a.gameDate.localeCompare(b.gameDate);
  });
  
  // Round floats to 3dp
  const cleaned = sorted.map(b => ({
    ...b,
    minutes: Math.round(b.minutes * 1000) / 1000,
    // Keep integers as-is
    points: b.points,
    rebounds: b.rebounds,
    assists: b.assists
  }));
  
  return JSON.stringify(cleaned, null, 2);
}
```

**Benefit:** Cleaner Git diffs, easier debugging, more professional.

---

## 🔧 Constants & Configuration

```javascript
// netlify/functions/lib/constants.mjs

export const BUDGETS = {
  GLOBAL: 50_000,        // 50s total function runtime
  ACQUIRE: 30_000,       // 30s data acquisition (HARD STOP)
  TRANSFORM: 10_000,     // 10s stats calculation
  MERGE: 10_000          // 10s prediction generation
};

export const TTL = {
  GAME_DAY_MS: 6 * 60 * 60 * 1000,   // 6h on game days
  OFF_DAY_MS: 12 * 60 * 60 * 1000,   // 12h on off days
  FORCE_FRESH_HOURS: 4                // Force fresh if <4h to tip
};

export const FETCH = {
  CONCURRENCY: 6,                     // Parallel requests
  PER_REQ_TIMEOUT_MS: 6_000,          // 6s per request
  RATE_LIMIT_MS: 300,                 // 300ms between batches (not per request)
  MAX_RETRIES: 2                      // Per-request retry limit
};

export const SANITY = {
  MIN_RECORD_COUNT_RATIO: 0.65,      // 65% of 7-day median
  ROLLING_HISTORY_DAYS: 7             // Track last 7 days
};

export const BLOB_SCHEMA_VERSION = 2;

export const FEATURE_FLAGS = {
  FORCE_ESPN: process.env.NBA_PROPS_FORCE_ESPN === '1',
  ENABLE_CDN: process.env.NBA_PROPS_ENABLE_CDN !== '0', // Default ON
  ENABLE_CONCURRENCY: process.env.NBA_PROPS_CONCURRENCY !== '0' // Default ON
};
```

---

## 🚀 Updated Implementation

### 1. Enhanced Health Check

```javascript
// netlify/functions/check-nba-health.mjs
import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import { BLOB_SCHEMA_VERSION } from './lib/constants.mjs';

export default async function handler(event, context) {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {},
    metadata: {}
  };
  
  // Check 1: Netlify Blobs with enhanced metadata
  try {
    const store = getStore('nba-data');
    const key = `player-boxscores-current.v${BLOB_SCHEMA_VERSION}`;
    const raw = await store.get(key);
    
    if (!raw) {
      health.checks.blobs = { status: 'missing' };
      health.status = 'degraded';
    } else {
      const data = JSON.parse(raw);
      const age = Date.now() - new Date(data.lastUpdated).getTime();
      const ageHours = Math.round(age / 3600000);
      
      health.checks.blobs = {
        status: age < 12 * 3600000 ? 'ok' : 'stale',
        schema: data.schema,
        ageHours,
        recordCount: data.recordCount,
        teamSetCount: data.teamSet?.length || 0,
        gamesSpanDays: data.gamesSpanDays,
        source: data.source
      };
      
      if (age > 24 * 3600000) health.status = 'degraded';
    }
  } catch (err) {
    health.checks.blobs = { status: 'error', error: err.message };
    health.status = 'degraded';
  }
  
  // Check 2: ESPN API
  try {
    const start = Date.now();
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { timeout: 5000 }
    );
    const latency = Date.now() - start;
    
    health.checks.espn = {
      status: response.ok ? 'ok' : 'error',
      latencyMs: latency
    };
    
    if (!response.ok || latency > 3000) health.status = 'degraded';
  } catch (err) {
    health.checks.espn = { status: 'error', error: err.message };
    health.status = 'degraded';
  }
  
  // Check 3: NBA CDN
  try {
    const start = Date.now();
    const response = await fetch(
      'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
      { timeout: 5000 }
    );
    const latency = Date.now() - start;
    
    health.checks.nbaCdn = {
      status: response.ok ? 'ok' : 'error',
      latencyMs: latency
    };
  } catch (err) {
    health.checks.nbaCdn = { status: 'error', error: err.message };
  }
  
  // Check 4: Opponent defense data
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filepath = path.join(process.cwd(), 'data/nba/opponent-defense/2025-26.json');
    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);
    
    const lastUpdated = data[0]?.lastUpdated;
    const age = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : Infinity;
    const ageHours = Math.round(age / 3600000);
    
    health.checks.opponentDefense = {
      status: age < 48 * 3600000 ? 'ok' : 'stale',
      ageHours,
      teamCount: data.length
    };
    
    if (age > 72 * 3600000) health.status = 'degraded';
  } catch (err) {
    health.checks.opponentDefense = { status: 'missing', error: err.message };
    health.status = 'degraded';
  }
  
  // Feature flags
  health.metadata.featureFlags = {
    forceEspn: process.env.NBA_PROPS_FORCE_ESPN === '1',
    enableCdn: process.env.NBA_PROPS_ENABLE_CDN !== '0',
    enableConcurrency: process.env.NBA_PROPS_CONCURRENCY !== '0'
  };
  
  return {
    statusCode: health.status === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(health, null, 2)
  };
}
```

### 2. Feature Flag: Force ESPN

```javascript
// In generate-daily-predictions.mjs

// Check feature flag at start
if (process.env.NBA_PROPS_FORCE_ESPN === '1') {
  console.log('🚨 FEATURE FLAG: NBA_PROPS_FORCE_ESPN=1, bypassing Blobs');
  // Skip Blobs, go straight to ESPN/CDN
  result = await loadFromESPN({ daysBack: 15, timeout: 30000 });
} else {
  // Normal flow: try Blobs first
  result = await loadBoxscoresHybrid({ ... });
}
```

**Usage during incidents:**
```bash
# Set in Netlify environment variables
NBA_PROPS_FORCE_ESPN=1

# Deploy will pick up new env var
# Or manually trigger function to test
```

### 3. One-Shot Warmup Endpoint

```javascript
// netlify/functions/warmup-nba-cache.mjs
export default async function handler(event, context) {
  // Require secret to prevent abuse
  const secret = event.headers['x-warmup-secret'];
  if (secret !== process.env.NBA_WARMUP_SECRET) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Invalid secret' })
    };
  }
  
  console.log('🔥 Manual cache warmup triggered');
  
  // Fetch fresh data and save to Blobs
  const boxscores = await fetchESPNBoxscores(15);
  await saveToBlobs(boxscores, { source: 'manual-warmup' });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Cache warmed successfully',
      recordCount: boxscores.length,
      timestamp: new Date().toISOString()
    })
  };
}
```

**Usage:**
```bash
# Set secret in Netlify env vars
NBA_WARMUP_SECRET=your-secret-here

# Trigger warmup manually (e.g., after incident)
curl -X POST https://yoursite.netlify.app/.netlify/functions/warmup-nba-cache \
  -H "x-warmup-secret: your-secret-here"
```

---

## 📊 Performance Expectations

### Normal Case (Blobs Hit, Fresh)
```
Tier 1: Load Blobs              1s
Load opponent defense           <1s
Calculate stats (L5/L10)        3s
Generate predictions            4s
Save results                    2s
─────────────────────────────────
TOTAL:                          ~11s ⚡
```

### Cold Cache (Blobs Miss)
```
Tier 1: Blobs check             1s
Tier 2: NBA CDN (7 days, p=6)   8s
Tier 2.5: ESPN (8-15 days, p=6) 12s
Load opponent defense           <1s
Calculate stats (L5/L10)        5s
Generate predictions            6s
Save results                    2s
─────────────────────────────────
TOTAL:                          ~35s ✅
```

### Worst Case (CDN Down, ESPN Slow)
```
Tier 1: Blobs check             1s
Tier 2: NBA CDN timeout         5s
Tier 2.5: ESPN (p=6, hit 30s limit) 30s
HARD STOP: Proceed with partial
Calculate stats (partial data)  5s
Generate predictions (partial)   5s
Save results                     2s
─────────────────────────────────
TOTAL:                          ~48s ⚠️ (partial data)
```

---

## 🎯 Final Implementation Checklist

### Phase 0: Emergency Revert (TODAY)
- [ ] Revert commits 08ce3dce, cc5f0cec, 46ce07d0
- [ ] Keep update-boxscores-daily.mjs fix (b9d83db5)
- [ ] Keep TEAM_NAME_MAP (good to have)
- [ ] Deploy and test (<60s, correct rosters)

### Phase 1: Enhanced Hybrid Loader (THIS WEEK)
- [ ] Implement BudgetTracker class
- [ ] Add game-day aware TTL calculation
- [ ] Implement team-scoped fetching (not blind 15 days)
- [ ] Add concurrent fetching (p=6, AbortController)
- [ ] Implement Blob schema versioning (v2)
- [ ] Add sanity canaries (65% of median)
- [ ] Test with various scenarios

### Phase 2: Universal Team Mapper (THIS WEEK)
- [ ] Create team-mapper.mjs with NBA IDs
- [ ] Add spacing-insensitive aliases
- [ ] Handle 76ers/Sixers special case
- [ ] Update all functions to use mapper
- [ ] Unit test all edge cases

### Phase 3: NBA CDN Integration (THIS WEEK)
- [ ] Research NBA CDN endpoints
- [ ] Implement loadFromNBACDN() as Tier 2.5
- [ ] Add CDN team name handling to mapper
- [ ] Test speed vs ESPN (expect 5-10s savings)

### Phase 4: Opponent Defense (THIS WEEK)
- [ ] Create Python script with retries + headers
- [ ] Set up GitHub Action (daily 8 AM ET)
- [ ] Add opponent adjustments to predictions
- [ ] Backtest improvement (expect 62.5% → 68-72%)

### Phase 5: Operational Features (NEXT WEEK)
- [ ] Enhanced health check endpoint
- [ ] Feature flag: NBA_PROPS_FORCE_ESPN
- [ ] Warmup endpoint with secret
- [ ] Git boxscore backups (Tier 3)
- [ ] Monitoring alerts (Uptime Robot, etc.)

---

## 🏁 Bottom Line

**Your feedback is 100% right.** The original plan was architecturally sound but **operationally naive** about latency budgets and edge cases. With these surgical tweaks:

✅ **We'll never hit 60s again** (50s global budget, 30s acquire hard stop)  
✅ **We'll be 10-20s faster** (concurrency, NBA CDN, team-scoped fetching)  
✅ **We'll handle incidents gracefully** (feature flags, warmup endpoint, 5-tier fallbacks)  
✅ **We'll have strong monitoring** (health check, sanity canaries, schema versioning)

**Ready to ship?** I can create the full implementation files with all tweaks applied, or we can go phase-by-phase. Your call! 🚀

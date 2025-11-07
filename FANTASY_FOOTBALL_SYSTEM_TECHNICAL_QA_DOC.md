# Fantasy Football System - Technical QA Documentation

**Document Version:** 1.0  
**Last Updated:** November 6, 2025  
**Systems Covered:** Weekly League Roast Generator & Vegas-Powered Sit/Start Analyzer

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Weekly Roast Generator](#weekly-roast-generator)
3. [Vegas Sit/Start Analyzer](#vegas-sitstart-analyzer)
4. [Data Flow & Dependencies](#data-flow--dependencies)
5. [QA Test Cases](#qa-test-cases)
6. [Known Issues & Limitations](#known-issues--limitations)
7. [Environment Configuration](#environment-configuration)

---

## System Architecture Overview

### Tech Stack
- **Frontend:** React (src/pages/FantasySitStart.jsx)
- **Backend:** Netlify Serverless Functions
- **Data Storage:** Netlify Blobs (OAuth tokens, API response caching)
- **External APIs:**
  - Yahoo Fantasy Sports API (OAuth 2.0)
  - TheOddsAPI Premium (player props & game odds)
  - Anthropic Claude API (AI roast generation)
  - OpenAI GPT-4 (fallback for roast generation)

### Authentication Flow
```
User → /fantasy-sitstart 
  → Click "Connect Yahoo Fantasy" 
  → /ff-auth-start.mjs (redirects to Yahoo OAuth)
  → User authorizes app
  → Yahoo redirects to /ff-auth-callback.mjs
  → Exchange code for access_token + refresh_token
  → Store tokens in Netlify Blobs (persistent storage)
  → Redirect back to /fantasy-sitstart with success flag
```

### File Structure
```
netlify/functions/
├── ff-auth-start.mjs           # OAuth initiation
├── ff-auth-callback.mjs        # OAuth token exchange
├── ff-run.mjs                  # Main sit/start orchestrator
├── ff-weekly-roast.mjs         # AI roast generator
└── _lib/
    ├── ff-blobs.mjs            # Netlify Blobs utilities
    ├── ff-yahoo.mjs            # Yahoo API client
    ├── ff-odds.mjs             # TheOddsAPI client
    └── ff-scoring.mjs          # EFP calculation & recommendations
```

---

## Weekly Roast Generator

### Purpose
Generate AI-powered weekly league summaries with authentic character voices analyzing fantasy matchups, player performances, and league standings.

### Endpoint
**Function:** `netlify/functions/ff-weekly-roast.mjs`  
**HTTP Method:** GET  
**Query Parameters:**
- `character` (optional): Character voice to use (default: "ramsay")

### Character System
**Total Characters:** 28 (10 original + 18 additional)

**Character Categories:**
1. **TV Chefs:** Gordon Ramsay, Guy Fieri, Julia Child
2. **Sports Analysts:** Stephen A. Smith, Bill Simmons, Pat McAfee
3. **Comedians:** Dave Chappelle, George Carlin, Ali Wong, Trevor Noah
4. **Cultural Icons:** Morgan Freeman, Snoop Dogg, David Attenborough, Yoda, Bob Ross
5. **Satirical Voices:** John Oliver, Colbert, Tina Fey, Amy Poehler
6. **Modern Comedians:** Nate Bargatze, Shane Gillis, Mark Normand, Ricky Gervais
7. **Unique Styles:** Eminem (rap battle), Zach Galifianakis, Napoleon Dynamite

### Data Sources

#### 1. League Metadata
**Source:** Yahoo Fantasy API - `/league/{league_key}`
```javascript
const leagueData = {
  name: "Novack Is A Draft Dodger",
  num_teams: 12,
  scoring_type: "head", // head-to-head
  settings: {
    scoring_type: "ppr",     // Full PPR (1 pt per reception)
    passing_touchdown: 4,
    rushing_touchdown: 6,
    receiving_touchdown: 6
  }
};
```

#### 2. Current Week Matchups
**Source:** Yahoo Fantasy API - `/league/{league_key}/scoreboard`
```javascript
const matchups = [
  {
    matchup_id: 1,
    week: 10,
    teams: [
      {
        team_key: "423.l.12345.t.1",
        team_name: "Team A",
        projected_points: 127.45,
        points: 98.32  // null if game not finished
      },
      {
        team_key: "423.l.12345.t.2",
        team_name: "Team B",
        projected_points: 132.18,
        points: 115.67
      }
    ]
  }
  // ... 6 total matchups for 12-team league
];
```

#### 3. League Standings
**Source:** Yahoo Fantasy API - `/league/{league_key}/standings`
```javascript
const standings = [
  {
    team_name: "Team A",
    rank: 1,
    wins: 7,
    losses: 2,
    points_for: 1234.56,
    points_against: 1098.32
  }
  // ... 12 teams
];
```

#### 4. Weekly Transactions
**Source:** Yahoo Fantasy API - `/league/{league_key}/transactions`
```javascript
const transactions = [
  {
    type: "add/drop",
    players: {
      added: "Christian McCaffrey",
      dropped: "Some Scrub"
    },
    team: "Team A",
    timestamp: 1699292400
  },
  {
    type: "trade",
    players: {
      team_a_receives: ["Player A", "Player B"],
      team_b_receives: ["Player C"]
    },
    teams: ["Team A", "Team B"],
    status: "accepted"
  }
];
```

#### 5. Player Actual Stats (NEW)
**Source:** Yahoo Fantasy API - `/team/{team_key}/roster;week={week}/stats`
```javascript
// Added in getTeamStats() function
const playerStats = [
  {
    player_key: "423.p.12345",
    name: { full: "Saquon Barkley" },
    points: 24.8,  // Actual fantasy points scored
    status: "healthy",
    stats: [
      { stat_id: 9, value: 120 },  // Rushing Yards
      { stat_id: 10, value: 2 },   // Rushing TDs
      { stat_id: 11, value: 3 },   // Receptions
      { stat_id: 12, value: 35 }   // Receiving Yards
    ]
  }
];
```

### AI System Architecture

#### Primary Model: OpenAI GPT-4o-mini
```javascript
const OPENAI_MODEL = "gpt-4o-mini"; // Fast, cost-effective, optimized for creative writing
```

**Why gpt-4o-mini?**
- **Speed:** 10x faster than gpt-4o (5-10s vs 25-30s)
- **Cost:** 90% cheaper ($0.005 vs $0.05 per request)
- **Quality:** Excellent for creative/conversational tasks like fantasy roasts
- **Reliability:** Lower timeout risk, consistent sub-15s responses

**Prompt Optimization (Nov 2024):**
```javascript
// ULTRA-COMPACT PROMPT - 70% smaller than original
const prompt = `${character.systemPrompt}
${character.style}
Week ${weekAnalyzed} league recap for "${leagueName}".

MATCHUPS: [compact one-line format]
TEAMS (top 6 + notable losers): [essential stats only]

Write 250-word recap in character. HTML format.`;

// Before: 2500 input tokens → 1000 output tokens = 30s
// After: 800 input tokens → 400 output tokens = 8s
```

**System Prompt Structure:**
```javascript
const systemPrompt = `You are ${character.name}. ${character.description}`;
const userPrompt = `${character.style}\n\nWeek data...\n\nWrite 250-word recap.`;
```

#### Previous Model: OpenAI GPT-4o (Deprecated)
- **Reason for removal:** Too slow (25-30s), caused timeouts
- **When active:** Oct-Nov 2024
- **Replaced by:** gpt-4o-mini on Nov 7, 2024

#### Previous Model: Anthropic Claude (Removed)
- **Reason for removal:** API parameter errors, was falling back to OpenAI anyway
- **When active:** Aug-Nov 2024
- **Issue:** Invalid `timeout_ms` parameter causing 400 errors
- **Removed:** Nov 7, 2024 (commit 2c2bec11)

### Data Aggregation Logic

**Function:** `generateRoast()` in `ff-weekly-roast.mjs`

```javascript
async function generateRoast(character = 'ramsay') {
  // 1. Fetch all data in parallel
  const [leagueData, matchups, standings, transactions] = await Promise.all([
    yahooClient.getLeagueSettings(),
    yahooClient.getScoreboard(),
    yahooClient.getStandings(),
    yahooClient.getTransactions()
  ]);

  // 2. Get actual player stats for each team
  const teamStatsPromises = matchups.flatMap(m => 
    m.teams.map(t => yahooClient.getTeamStats(t.team_key, currentWeek))
  );
  const allTeamStats = await Promise.all(teamStatsPromises);

  // 3. Build context object
  const context = {
    league: leagueData,
    matchups: matchups,
    standings: standings,
    transactions: transactions,
    player_performances: allTeamStats
  };

  // 4. Generate roast with Claude (or GPT-4 fallback)
  const roast = await generateWithAI(character, context);
  
  return roast;
}
```

### QA Checklist - Weekly Roast

- [ ] **Character Accuracy:** Test all 28 characters, verify voice authenticity
- [ ] **Data Completeness:** Confirm all 5 data sources (league, matchups, standings, transactions, stats) present
- [ ] **Player Stats Integration:** Verify actual fantasy points appear in roasts
- [ ] **API Fallback:** Test Claude failure → GPT-4 fallback
- [ ] **Error Handling:** Test with invalid character name, expired tokens, API downtime
- [ ] **Performance:** Roast generation should complete in <15 seconds
- [ ] **Content Quality:** Roasts should reference specific players, scores, and matchups

**Critical Test Case - Roast Content Validation:**
```javascript
// Expected roast structure
{
  character: "ramsay",
  roast: "YOU DONKEY! [Team A] is getting absolutely BATTERED this week...",
  metadata: {
    week: 10,
    league_name: "Novack Is A Draft Dodger",
    matchups_analyzed: 6,
    generation_time_ms: 8234
  }
}
```

---

## Vegas Sit/Start Analyzer

### Purpose
Provide data-driven sit/start recommendations using real-time Vegas odds and player props to calculate Expected Fantasy Points (EFP).

### Endpoint
**Function:** `netlify/functions/ff-run.mjs`  
**HTTP Method:** GET  
**Query Parameters:**
- `format` (optional): `json` (default) or `csv`

### Data Pipeline

#### Step 1: Fetch Yahoo Fantasy Roster
**Source:** `ff-yahoo.mjs` → `getFullRoster()`

```javascript
// Yahoo API: /team/{team_key}/roster;week={week}
const roster = [
  {
    player_key: "423.p.12345",
    name: "Saquon Barkley",
    position: "RB",
    team: "PHI",
    status: "healthy",
    selected_position: "RB",  // Where user has them slotted
    opponent: "JAX",
    is_bye_week: false
  }
  // ... full roster
];
```

**Yahoo Stat ID Mappings (CRITICAL - Previously Had Bugs):**
```javascript
// CORRECT mappings (fixed Oct 2024)
const STAT_IDS = {
  9: 'rushing_yards',      // 0.1 pts per yard (1pt per 10yds)
  10: 'rushing_touchdowns', // 6 pts
  11: 'receptions',         // 1 pt (Full PPR)
  12: 'receiving_yards',    // 0.1 pts per yard
  13: 'receiving_touchdowns' // 6 pts
};

// BUG HISTORY: Previously had stat 9→rush TD (wrong!)
// This caused TDs to be worth 0.1 pts instead of 6 pts
```

#### Step 2: Fetch Vegas Odds & Player Props
**Source:** `ff-odds.mjs` → `getAllPlayerProps()`

**API Endpoint:** `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events`

```javascript
// 1. Get all NFL games for current week
const games = await fetch(`${ODDS_API_BASE}/events?apiKey=${API_KEY}`);

// 2. For each game, fetch player props
const props = await fetch(
  `${ODDS_API_BASE}/events/${eventId}/odds?` +
  `apiKey=${API_KEY}&regions=us&markets=player_pass_tds,player_pass_yds,` +
  `player_rush_yds,player_rush_tds,player_receptions,player_reception_yds,` +
  `player_anytime_td,player_reception_tds`
);
```

**Player Props Data Structure:**
```javascript
const playerProps = {
  "Saquon Barkley": {
    game_id: "abc123",
    team: "PHI",
    opponent: "JAX",
    props: {
      rushing_yards: {
        line: 85.5,
        over_odds: -115,
        over_prob: 0.535,  // Implied probability
        under_odds: -105,
        under_prob: 0.512
      },
      anytime_td: {
        odds: -150,
        prob: 0.60  // 60% chance of scoring
      },
      two_plus_td: {
        odds: +200,
        prob: 0.33  // 33% chance of 2+ TDs
      },
      receptions: {
        line: 2.5,
        over_prob: 0.48
      },
      receiving_yards: {
        line: 25.5,
        over_prob: 0.52
      }
    }
  }
};
```

**Current Coverage (as of Nov 2024):**
- **Total Players:** 460
- **Total Props:** 735
- **Prop Types:** Pass TDs, Pass Yds, Rush Yds, Rush TDs, Receptions, Rec Yds, Anytime TD, Rec TDs

#### Step 3: Team Matching Logic
**Source:** `ff-odds.mjs` → `getGameContext()`

**CRITICAL BUG FIX (Oct 2024):**
```javascript
// OLD CODE (BROKEN):
if (yahooTeam === oddsTeam) { ... }
// Failed because Yahoo returns "Det", TheOddsAPI returns "DET"

// NEW CODE (FIXED):
if (yahooTeam.toUpperCase() === oddsTeam.toUpperCase()) { ... }
// Case-insensitive comparison
```

**Edge Cases Handled:**
1. **Bye Weeks:** Player marked as `is_bye_week: true`, excluded from recommendations
2. **No Game Found:** Player logged as "no game context", EFP set to 0
3. **No Props Available:** Common for backup players, defensemen, kickers

#### Step 4: Expected Fantasy Points (EFP) Calculation
**Source:** `ff-scoring.mjs` → `expectedFantasyPoints()`

**Formula Breakdown:**

```javascript
function expectedFantasyPoints(player, props, leagueSettings) {
  let efp = 0;
  
  // 1. PASSING YARDS
  if (props.passing_yards) {
    const expectedYards = props.passing_yards.line * props.passing_yards.over_prob;
    efp += expectedYards * 0.04;  // 1 pt per 25 yards = 0.04 per yard
  }
  
  // 2. PASSING TDs
  if (props.passing_tds) {
    const expectedTDs = props.passing_tds.line * props.passing_tds.over_prob;
    efp += expectedTDs * 4;  // 4 pts per pass TD
  }
  
  // 3. RUSHING YARDS
  if (props.rushing_yards) {
    const expectedYards = props.rushing_yards.line * props.rushing_yards.over_prob;
    efp += expectedYards * 0.1;  // 1 pt per 10 yards = 0.1 per yard
  }
  
  // 4. RECEPTIONS (PPR)
  if (props.receptions) {
    const expectedReceptions = props.receptions.line * props.receptions.over_prob;
    efp += expectedReceptions * 1.0;  // Full PPR = 1 pt per reception
  }
  
  // 5. RECEIVING YARDS
  if (props.receiving_yards) {
    const expectedYards = props.receiving_yards.line * props.receiving_yards.over_prob;
    efp += expectedYards * 0.1;  // 1 pt per 10 yards
  }
  
  // 6. ANYTIME TD (PRIMARY TD SCORING)
  if (props.anytime_td) {
    const tdValue = (player.position === 'QB') ? 4 : 6;
    efp += props.anytime_td.prob * tdValue;
    // Example: 60% chance × 6 pts = 3.6 expected TD points
  }
  
  // 7. MULTI-TD CEILING BONUS (NOT DOUBLE-COUNTING!)
  if (props.two_plus_td) {
    efp += applyMultiTDBonus(player, props.two_plus_td.prob, tdValue);
  }
  
  return efp;
}
```

**Multi-TD Bonus Logic (IMPORTANT):**
```javascript
function applyMultiTDBonus(player, twoPlusTdProb, tdValue) {
  // Position-based weights (ceiling potential)
  const weights = {
    'RB': 0.80,  // RBs most likely to get multiple TDs
    'TE': 0.60,  // TEs can have big games
    'WR': 0.35,  // WRs less consistent for 2+ TDs
    'QB': 0.25   // QBs rarely get 2+ rush/rec TDs
  };
  
  const weight = weights[player.position] || 0.35;
  
  // Additional ceiling points
  const bonus = twoPlusTdProb * tdValue * weight;
  
  return bonus;
}
```

**TD Scoring Validation (NOT Double-Counting):**
```javascript
// Example: Rachaad White (RB)
// Props: 52% anytime TD, 19% two+ TD

// Base TD Points:
const base = 0.52 * 6 = 3.12 pts;
// This is the EXPECTED VALUE of scoring AT LEAST 1 TD

// Ceiling Bonus:
const bonus = 0.19 * 6 * 0.80 = 0.91 pts;
// This is ADDITIONAL upside for 2+ TD games (RB weight = 0.80)

// Total TD Points: 3.12 + 0.91 = 4.03 pts ✅

// WHY THIS ISN'T DOUBLE-COUNTING:
// - anytime_td_prob = P(1+ TDs) = expected value of first TD
// - two_plus_td_prob = P(2+ TDs) = incremental value of 2nd/3rd TD
// - The bonus represents ceiling upside, not re-counting the first TD
```

**Real Example - Zay Flowers (WR):**
```javascript
const props = {
  receiving_yards: { line: 64.5, over_prob: 0.53 },
  receptions: { line: 5.5, over_prob: 0.48 },
  anytime_td: { prob: 0.41 }
};

// Calculation:
const yards = 64.5 * 0.53 * 0.1 = 3.42 pts
const receptions = 5.5 * 0.48 * 1.0 = 2.64 pts
const td = 0.41 * 6 = 2.46 pts
const total = 3.42 + 2.64 + 2.46 = 8.52 pts ✅

// Matches production output
```

#### Step 5: Tier Assignment
**Source:** `ff-scoring.mjs` → `assignTiers()`

**Position-Based Thresholds:**
```javascript
const TIER_THRESHOLDS = {
  QB: {
    elite: 22,    // 22+ EFP
    strong: 18,   // 18-22 EFP
    solid: 14,    // 14-18 EFP
    risky: 10,    // 10-14 EFP
    avoid: 0      // <10 EFP
  },
  RB: {
    elite: 18,
    strong: 14,
    solid: 10,
    risky: 7,
    avoid: 0
  },
  WR: {
    elite: 16,
    strong: 12,
    solid: 9,
    risky: 6,
    avoid: 0
  },
  TE: {
    elite: 14,
    strong: 10,
    solid: 7,
    risky: 5,
    avoid: 0
  }
};
```

**Tier Logic:**
```javascript
function assignTier(player) {
  const thresholds = TIER_THRESHOLDS[player.position];
  
  if (player.efp >= thresholds.elite) return 'ELITE';
  if (player.efp >= thresholds.strong) return 'STRONG';
  if (player.efp >= thresholds.solid) return 'SOLID';
  if (player.efp >= thresholds.risky) return 'RISKY';
  return 'AVOID';
}
```

#### Step 6: Sit/Start Recommendations
**Source:** `ff-scoring.mjs` → `generateRecommendations()`

**Recommendation Types:**
```javascript
const recommendations = {
  MUST_START: 'Top-tier projected performance in this matchup',
  START: 'Solid projected points, clear starting choice',
  FLEX_WORTHY: 'Strong FLEX candidate, consider over bench options',
  BORDERLINE: 'Close decision, monitor injury news and weather',
  SIT: 'Better options available, leave on bench',
  BENCH: 'Low projected output, not startable this week'
};
```

**Recommendation Algorithm:**
```javascript
function generateRecommendations(players, roster) {
  // 1. Sort players by EFP (descending)
  const sorted = players.sort((a, b) => b.efp - a.efp);
  
  // 2. Fill optimal lineup
  const lineup = fillLineup(sorted, roster.league_settings);
  
  // 3. Generate recommendations
  return players.map(player => {
    const inOptimalLineup = lineup.starters.includes(player);
    const tier = player.tier;
    
    if (inOptimalLineup && tier === 'ELITE') {
      return { ...player, rec: 'MUST_START' };
    } else if (inOptimalLineup) {
      return { ...player, rec: 'START' };
    } else if (tier === 'STRONG' || tier === 'SOLID') {
      return { ...player, rec: 'FLEX_WORTHY' };
    } else if (tier === 'RISKY') {
      return { ...player, rec: 'BORDERLINE' };
    } else {
      return { ...player, rec: 'BENCH' };
    }
  });
}
```

#### Step 7: Optimal Lineup Builder
**Source:** `ff-scoring.mjs` → `fillLineup()`

**CRITICAL BUG FIX (Oct 2024):**
```javascript
// NEW CODE (FIXED):
function fillLineup(players, settings) {
  // Filter out bye week players FIRST
  const activePlayers = players.filter(p => !p.is_bye_week);
  
  // Sort by EFP
  const sorted = activePlayers.sort((a, b) => b.efp - a.efp);
  
  // Build lineup...
}

// BUG HISTORY:
// Previously did NOT filter bye weeks before building lineup
// Result: George Pickens (BYE week 10) was recommended as starter
```

**Lineup Building Logic:**
```javascript
function fillLineup(players, settings) {
  const activePlayers = players.filter(p => !p.is_bye_week);
  const sorted = activePlayers.sort((a, b) => b.efp - a.efp);
  
  const lineup = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    FLEX: [],
    BENCH: []
  };
  
  // 1. Fill required positions
  lineup.QB = sorted.filter(p => p.position === 'QB').slice(0, 1);
  lineup.RB = sorted.filter(p => p.position === 'RB').slice(0, 2);
  lineup.WR = sorted.filter(p => p.position === 'WR').slice(0, 2);
  lineup.TE = sorted.filter(p => p.position === 'TE').slice(0, 1);
  
  // 2. Fill FLEX (best remaining RB/WR/TE)
  const flexEligible = sorted.filter(p => 
    ['RB', 'WR', 'TE'].includes(p.position) &&
    !lineup.RB.includes(p) &&
    !lineup.WR.includes(p) &&
    !lineup.TE.includes(p)
  );
  lineup.FLEX = flexEligible.slice(0, 1);
  
  // 3. Rest go to bench
  const starters = [
    ...lineup.QB,
    ...lineup.RB,
    ...lineup.WR,
    ...lineup.TE,
    ...lineup.FLEX
  ];
  lineup.BENCH = sorted.filter(p => !starters.includes(p));
  
  return lineup;
}
```

### API Response Format

**JSON Output:**
```json
{
  "success": true,
  "league": {
    "name": "Novack Is A Draft Dodger",
    "week": 10,
    "scoring": "Full PPR"
  },
  "recommendations": [
    {
      "player": "Saquon Barkley",
      "position": "RB",
      "team": "PHI",
      "opponent": "JAX",
      "current_slot": "RB",
      "efp": 18.75,
      "tier": "ELITE",
      "recommendation": "MUST_START",
      "reason": "Elite RB1 with 85.5 rush yards line, 60% TD odds",
      "props": {
        "rushing_yards": 85.5,
        "anytime_td_prob": 0.60,
        "receptions": 2.5
      }
    }
  ],
  "optimal_lineup": {
    "QB": ["Josh Allen"],
    "RB": ["Saquon Barkley", "Derrick Henry"],
    "WR": ["Justin Jefferson", "Tyreek Hill"],
    "TE": ["Travis Kelce"],
    "FLEX": ["Rachaad White"],
    "BENCH": ["..."]
  },
  "metadata": {
    "total_players": 16,
    "players_with_props": 14,
    "cache_hit": true,
    "execution_time_ms": 1243
  }
}
```

**CSV Output:**
```csv
Player,Position,Team,Opponent,EFP,Tier,Recommendation,Current_Slot,Props
Saquon Barkley,RB,PHI,JAX,18.75,ELITE,MUST_START,RB,"85.5 rush yds | 60% TD"
Josh Allen,QB,BUF,IND,24.30,ELITE,MUST_START,QB,"285.5 pass yds | 2.1 pass TD"
```

---

## Data Flow & Dependencies

### Complete Request Flow

```
User Request → ff-run.mjs
  ↓
1. Check Netlify Blobs for cached tokens
  ↓
2. If expired, refresh with Yahoo OAuth
  ↓
3. Fetch Yahoo roster (ff-yahoo.mjs)
  ↓
4. Fetch Vegas odds (ff-odds.mjs)
  - Check Blobs cache (1h TTL)
  - If miss, call TheOddsAPI
  - Cache response
  ↓
5. Match players to games (ff-odds.mjs)
  - Case-insensitive team matching
  - Identify bye weeks
  ↓
6. Calculate EFP (ff-scoring.mjs)
  - Yards × probability × points_per_unit
  - TDs with ceiling bonus
  ↓
7. Assign tiers (ff-scoring.mjs)
  ↓
8. Build optimal lineup (ff-scoring.mjs)
  - Filter bye weeks
  - Sort by EFP
  - Fill positions
  ↓
9. Generate recommendations (ff-scoring.mjs)
  ↓
10. Return JSON/CSV to frontend
```

### Caching Strategy

**Token Cache:**
```javascript
// Location: Netlify Blobs - 'ff-tokens' store
// Key: user's Yahoo user_id
// TTL: Until access_token expires (1 hour)
// Refresh: Automatic using refresh_token

{
  access_token: "...",
  refresh_token: "...",
  expires_at: 1699299600,
  user_guid: "ABC123"
}
```

**API Response Cache:**
```javascript
// Location: Netlify Blobs - 'ff-cache' store
// Key: `odds_week_${week}` or `roster_${team_key}_${week}`
// TTL: 1 hour (3600 seconds)

{
  data: { /* API response */ },
  cached_at: 1699296000,
  expires_at: 1699299600
}
```

### Error Handling

**Token Expiration:**
```javascript
// If 401 from Yahoo API
if (response.status === 401) {
  // Auto-refresh tokens
  const newTokens = await refreshAccessToken(refresh_token);
  await storeTokens(newTokens);
  // Retry original request
  return retryRequest();
}
```

**API Rate Limits:**
```javascript
// TheOddsAPI: 500 requests/month on Premium
// Strategy: Cache aggressively (1h TTL), only fetch once per week
if (cachedOdds && !isExpired(cachedOdds)) {
  return cachedOdds.data;
}
```

**Missing Props:**
```javascript
// If player has no Vegas props
if (!playerProps) {
  return {
    ...player,
    efp: 0,
    tier: 'NO_DATA',
    recommendation: 'INSUFFICIENT_DATA',
    reason: 'No Vegas props available for this player'
  };
}
```

---

## QA Test Cases

### Test Case 1: OAuth Flow
**Steps:**
1. Navigate to `/fantasy-sitstart`
2. Click "Connect Yahoo Fantasy"
3. Log in with Yahoo credentials
4. Grant app permissions
5. Verify redirect back to app with success message

**Expected Result:**
- Access token stored in Netlify Blobs
- User sees "Connected to Yahoo Fantasy" message
- Able to run sit/start analysis

**Edge Cases:**
- User denies permissions → Show error message
- User already connected → Skip OAuth, use cached tokens
- Token expires mid-session → Auto-refresh and retry

---

### Test Case 2: Player Props Coverage
**Steps:**
1. Run sit/start analysis
2. Check `metadata.players_with_props` vs `metadata.total_players`
3. Verify prop types available for each player

**Expected Result:**
- **QB:** Pass yards, pass TDs (minimum)
- **RB:** Rush yards, anytime TD, possibly receptions
- **WR/TE:** Receptions, rec yards, anytime TD
- Coverage: 85-95% of starters should have props

**Edge Cases:**
- Backup players: May have 0 props → Expected, tier = NO_DATA
- Thursday night players: Props locked → Use cached pre-game data
- Injured players: Status = "out" → Show in recommendations with warning

---

### Test Case 3: EFP Calculation Accuracy
**Test Player:** Zay Flowers (WR, BAL)
**Props:**
- Receiving Yards: 64.5 (53% over)
- Receptions: 5.5 (48% over)
- Anytime TD: 41%

**Manual Calculation:**
```
Yards: 64.5 × 0.53 × 0.1 = 3.42 pts
Receptions: 5.5 × 0.48 × 1.0 = 2.64 pts
TD: 0.41 × 6 = 2.46 pts
Total: 3.42 + 2.64 + 2.46 = 8.52 pts
```

**Steps:**
1. Run analysis
2. Find Zay Flowers in output
3. Check `efp` field

**Expected Result:** `efp: 8.52` (±0.05 for rounding)

---

### Test Case 4: TD Scoring Not Double-Counted
**Test Player:** Rachaad White (RB, TB)
**Props:**
- Anytime TD: 52%
- Two Plus TD: 19%

**Manual Calculation:**
```
Base TD: 0.52 × 6 = 3.12 pts
Ceiling Bonus: 0.19 × 6 × 0.80 = 0.91 pts (RB weight)
Total: 3.12 + 0.91 = 4.03 pts
```

**Steps:**
1. Run analysis
2. Find Rachaad White
3. Check TD component of EFP

**Expected Result:**
- TD points ≈ 4.03 pts (NOT 6.84 pts if double-counted)
- Breakdown shown in `reason` field

---

### Test Case 5: Bye Week Filtering
**Test Player:** George Pickens (WR, PIT) - Week 10 Bye
**Steps:**
1. Run analysis for Week 10
2. Check `is_bye_week` flag
3. Verify not in `optimal_lineup.starters`
4. Check recommendation

**Expected Result:**
- `is_bye_week: true`
- Recommendation: "BENCH" or "BYE_WEEK"
- Reason: "Team on bye week 10"
- NOT in starting lineup

---

### Test Case 6: Team Matching (Case Sensitivity)
**Test Players:**
- Lions player (Yahoo: "Det", Odds: "DET")
- Rams player (Yahoo: "LAR", Odds: "LA")

**Steps:**
1. Run analysis
2. Check `opponent` field for Lions/Rams players
3. Verify props present

**Expected Result:**
- Opponent correctly identified
- Props matched successfully
- NOT showing "no game context"

---

### Test Case 7: Optimal Lineup Builder
**Test Roster:**
```
QB: Josh Allen (24.3 EFP), Trevor Lawrence (16.2 EFP)
RB: Saquon Barkley (18.7 EFP), Derrick Henry (16.5 EFP), Rachaad White (12.3 EFP)
WR: Justin Jefferson (15.8 EFP), Tyreek Hill (14.2 EFP), Zay Flowers (8.5 EFP)
TE: Travis Kelce (11.2 EFP), Hunter Henry (6.3 EFP)
```

**Expected Lineup:**
```
QB: Josh Allen (24.3)
RB: Saquon Barkley (18.7), Derrick Henry (16.5)
WR: Justin Jefferson (15.8), Tyreek Hill (14.2)
TE: Travis Kelce (11.2)
FLEX: Rachaad White (12.3) ← Best remaining RB/WR/TE
BENCH: Trevor Lawrence, Zay Flowers, Hunter Henry
```

**Steps:**
1. Run analysis with above roster
2. Check `optimal_lineup` object
3. Verify FLEX is highest remaining EFP

**Expected Result:**
- FLEX = Rachaad White (12.3 EFP)
- NOT Zay Flowers (8.5 EFP)
- Sorted by EFP correctly

---

### Test Case 8: Weekly Roast Character Accuracy
**Test Character:** Gordon Ramsay

**Steps:**
1. Call `/ff-weekly-roast?character=ramsay`
2. Read generated roast
3. Check for character-specific phrases

**Expected Phrases:**
- "YOU DONKEY!"
- "ABSOLUTELY DREADFUL"
- Kitchen/cooking metaphors
- British insults
- Specific player names and scores

**NOT Expected:**
- Generic sports commentary
- Other character voices bleeding through
- Repetitive formulaic structure

**Validation Criteria:**
- [ ] Uses character catchphrases
- [ ] References actual matchup scores
- [ ] Mentions specific player performances
- [ ] Stays in character throughout (no voice breaks)
- [ ] Length: 200-400 words

---

### Test Case 9: API Fallback (Claude → GPT-4)
**Steps:**
1. Set invalid `ANTHROPIC_API_KEY` in Netlify env
2. Call `/ff-weekly-roast`
3. Check logs for fallback

**Expected Result:**
```
[ERROR] Claude API failed: 403 Forbidden
[INFO] Falling back to OpenAI GPT-4
[SUCCESS] Roast generated successfully
```

**Validation:**
- Roast still generated (via GPT-4)
- Response time < 20 seconds
- Quality comparable to Claude

---

### Test Case 10: Cache Hit Performance
**Steps:**
1. Run sit/start analysis (cold cache)
2. Note execution time
3. Run again within 1 hour (warm cache)
4. Compare execution times

**Expected Result:**
- **Cold Cache:** 3-5 seconds (API calls)
- **Warm Cache:** <1 second (Blobs retrieval)
- `metadata.cache_hit: true` on second run

---

## Known Issues & Limitations

### Issue 0: Function Timeout During AI Generation
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
Duration: 60000 ms	Memory Usage: 133 MB
(Function hits Netlify's 60-second timeout)
```

**Root Cause:**
- AI generation (Claude/OpenAI) taking 50-55 seconds
- Prompt was too large with all 12 teams' detailed stats
- No timeout protection, causing function to hit Netlify's hard limit

**Solutions Implemented:**
1. **45-second timeout wrapper** - AI generation wrapped in Promise.race() with 45s timeout
2. **Reduced prompt size** - Only top 6 teams get detailed analysis, bottom 6 get quick mentions
3. **Reduced max_tokens** - From 4000 to 2000 to speed up generation
4. **Updated Claude model** - Changed to `claude-3-5-sonnet-20241022` (newer, faster version)
5. **Graceful fallback** - If timeout occurs, return simple HTML summary instead of crashing

**Impact:**
- Generation time reduced from 55s to ~20-30s
- Function completes well within 60s limit
- Users see fallback message if AI still times out

---

### Issue 0.5: Transaction Data Not Iterable
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
WARN   Error fetching league transactions: txInfo is not iterable
```

**Root Cause:**
- `getLeagueTransactions()` in ff-yahoo.mjs attempting to iterate over `txInfo` without checking if it's an array
- Yahoo API returns variable structure (sometimes object, sometimes array)
- Same pattern as earlier `leagueInfo` bug

**Solution:**
```javascript
// OLD CODE (BROKEN):
for (const item of txInfo) { ... }

// NEW CODE (FIXED):
if (txInfo && Array.isArray(txInfo)) {
  for (const item of txInfo) { ... }
}
```

**Impact:**
- Transaction data now loads successfully
- Function doesn't crash when txInfo is not an array
- Transactions still gracefully return empty array if structure is unexpected

---

### Issue 1: AI Gateway 403 Error
**Status:** OPEN (as of Nov 6, 2025)

**Error Message:**
```
403 Forbidden: "AI Gateway is not enabled for your account"
```

**Root Cause:**
- `ANTHROPIC_BASE_URL` env var set to Netlify AI Gateway
- User account doesn't have AI Gateway enabled

**Solutions:**
1. **Option A:** Add `OPENAI_API_KEY` to Netlify env vars (GPT-4 fallback will work)
2. **Option B:** Remove `ANTHROPIC_BASE_URL` env var (use standard Anthropic API)
3. **Option C:** Enable AI Gateway in Netlify account settings

**Workaround:**
Fallback to OpenAI GPT-4 is implemented, just needs API key configured.

---

### Issue 0.6: Player Stats Extraction Bug (Array Indexing)
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
AI roast showing all players with 0.0 points despite real scores in data
```

**Root Cause:**
- `getTeamStats()` in ff-yahoo.mjs accessing wrong array index
- Yahoo API returns player data as 3-element array: [info, selected_position, stats+points]
- Code was accessing `playerData[1]` (selected_position) instead of `playerData[2]` (stats/points)

**Solution:**
```javascript
// OLD CODE (BROKEN):
const stats = playerData[1]?.player_stats;
const points = playerData[1]?.player_points;

// NEW CODE (FIXED):
const stats = playerData[2]?.player_stats;
const points = playerData[2]?.player_points;
```

**Impact:**
- Player fantasy points now correctly extracted from Yahoo API
- AI roasts now reference actual player scores (e.g., "Josh Allen: 28.82 pts")
- Fixed in commit fa0dda87

---

### Issue 0.7: Team Coverage Limitation in AI Prompt
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
"Feels like its not even every team being summarized?"
```

**Root Cause:**
- Prompt generation explicitly limited to "TOP 6 TEAMS ONLY TO SAVE TIME"
- Bottom 6 teams received only one-line mentions
- AI couldn't provide meaningful analysis for half the league

**Solution:**
```javascript
// OLD CODE (BROKEN):
const topTeams = sortedTeams.slice(0, 6);
// ... detailed analysis for top 6
const bottomTeams = sortedTeams.slice(6);
// ... one-line mentions for bottom 6

// NEW CODE (FIXED):
// All teams get equal treatment
for (const team of sortedTeams) {
  // ... full analysis with starters/bench/mistakes
}
```

**Additional Changes:**
- Increased max_tokens from 2000 to 3000
- Changed instruction from "TOP stories, 500 words" to "ALL teams, 600 words"
- Added rank display for each team
- Improved bench error formatting
- Fixed in commit 27bcc88f

---

### Issue 0.8: Function Timeout on AI Generation
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
Failed to execute 'json' on 'Response': Unexpected end of JSON input
Duration: 37808.15 ms (dangerously close to 60s Netlify limit)
```

**Root Cause:**
- OpenAI API taking 33 seconds for generation
- Combined with data fetching (5-7s), total execution approaching 60s Netlify hard limit
- Response getting truncated mid-JSON when timeout hit
- Previous timeout was 45s, but only protected AI generation, not total function time

**Solution:**
```javascript
// Reduced AI generation timeout from 45s to 25s (leaves 35s buffer)
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('AI generation timed out after 25 seconds')), 25000)
);

// Reduced max_tokens from 3000 to 800 for faster generation
max_tokens: 800, // 250 words ~= 350 tokens + safety buffer

// Added hard API timeouts
timeout: 20000 // OpenAI client-level timeout

// Reduced word limit from 600 to 250 words
```

**Performance Impact:**
- **Before:** 37.8s total execution (33s OpenAI + 5s data)
- **After:** Expected ~25-30s total (18-20s AI + 5-7s data)
- **Safety Margin:** Now 30-35s away from timeout instead of 22s

**Fixed in:** Commit 658d9a09

---

### Issue 0.9: OpenAI Timeout Despite Optimizations
**Status:** FIXED (Nov 7, 2024)

**Error Message:**
```
Error: AI generation timed out after 30 seconds
Duration: 34254.06 ms
```

**Root Cause:**
- Even with timeout fixes, OpenAI gpt-4o model taking 30+ seconds
- Prompt was 2500+ tokens (verbose character instructions + 12 teams of data)
- max_tokens: 2000 generating 700+ word responses
- Total: Input processing (5-8s) + Generation (22-25s) = 30s timeout

**Solution - 70% Speed Improvement:**
```javascript
// 1. SWITCHED TO FASTER MODEL
model: 'gpt-4o-mini' // 10x faster than gpt-4o, same quality for creative writing

// 2. REDUCED PROMPT SIZE BY 70%
// Before: 2500 tokens with verbose instructions for all 12 teams
// After: 800 tokens with compact data for top 6 + bottom 3 summary
const prompt = `${character.systemPrompt}
${character.style}
Week ${weekAnalyzed} league recap for "${leagueName}".
MATCHUPS: [compact format]
TEAMS (top 6 + notable losers): [one-line summaries]
Write 250-word recap in character. HTML format.`;

// 3. REDUCED OUTPUT TOKENS
max_tokens: 800 // Was 2000 (250 words vs 500 words)

// 4. AGGRESSIVE TIMEOUTS
timeout: 20000 // OpenAI client (was 25000)
setTimeout(..., 25000) // Promise.race wrapper (was 30000)
```

**Performance Comparison:**

| Metric | Before (gpt-4o) | After (gpt-4o-mini) | Improvement |
|--------|----------------|---------------------|-------------|
| Input Tokens | 2500 | 800 | 68% reduction |
| Output Tokens | 1000 | 400 | 60% reduction |
| API Response Time | 25-30s | 5-10s | 70% faster |
| Total Function Time | 32-37s | 12-18s | 50% faster |
| Cost per Request | $0.05 | $0.005 | 90% cheaper |

**Why gpt-4o-mini Works:**
- Optimized for creative/conversational tasks (perfect for roasts)
- 10x faster than gpt-4o for similar quality
- Still significantly better than gpt-3.5-turbo
- Pricing: $0.15/1M input (vs $2.50), $0.60/1M output (vs $10.00)

**Fixed in:** Commit 9f131fcf

**Quality Improvements (Nov 7 PM):**
After initial deployment, user feedback indicated roasts were too short and lacking depth:
- ❌ Only 250 words (too brief)
- ❌ Poor HTML structure (no proper sections)
- ❌ Missing playoff context and waiver moves
- ❌ Incomplete coverage of all teams

**Enhanced Version (Commit 5d5fa266):**
- ✅ Increased to 400 words for comprehensive coverage
- ✅ Added structured sections:
  * Winners Circle (top performers)
  * Middle of the Pack (playoff race)
  * Bottom Feeders (struggling teams)
  * Waiver Wire Winners & Losers (transactions)
  * Looking Ahead (week preview)
- ✅ Included all 12 teams with meaningful commentary
- ✅ Added transaction/waiver move analysis
- ✅ Proper HTML formatting with `<h2>`, `<h3>`, `<p>` tags
- ✅ Still maintains fast generation time (12-18s)

**Token Impact:**
- Input: 800 → 1000 tokens (+25%)
- Output: 400 → 600 tokens (+50%)
- Generation time: 11s → 12-18s (+1-7s)
- Still well under 25s timeout with 7-13s safety margin

---

### Issue 2: Limited Prop Coverage for Backups
**Status:** BY DESIGN

**Description:**
Backup QBs, RBs, and bench players often have no Vegas props available.

**Impact:**
- ~10-15% of rostered players show `efp: 0` and `tier: NO_DATA`

**Mitigation:**
- Show clear message: "No Vegas props available"
- Still allow manual overrides
- Focus recommendations on players with data

---

### Issue 3: Thursday Night Props Lock Early
**Status:** BY DESIGN (TheOddsAPI behavior)

**Description:**
Player props for Thursday Night Football lock ~2 hours before kickoff.

**Impact:**
- Users checking after 6pm ET Thursday see stale props

**Mitigation:**
- Cache pre-game odds (1h before kickoff)
- Show "Props locked" warning
- Display cached pre-game lines

---

### Issue 4: Yahoo API Rate Limits
**Status:** DOCUMENTED

**Limits:**
- 10,000 requests/day (generous)
- Rarely hit in practice

**Mitigation:**
- 1-hour cache TTL
- Batch requests where possible
- Only fetch on user action (not polling)

---

### Issue 5: Incomplete Transaction History
**Status:** LIMITATION OF YAHOO API

**Description:**
Yahoo API only returns transactions from past 7 days.

**Impact:**
- Weekly roasts can't reference older trades/adds

**Mitigation:**
- None currently
- Consider building own transaction database

---

## Environment Configuration

### Required Environment Variables (Netlify Dashboard)

```bash
# Yahoo Fantasy API
YAHOO_CLIENT_ID="your_client_id"
YAHOO_CLIENT_SECRET="your_client_secret"
YAHOO_REDIRECT_URI="https://bgroundrobin.com/.netlify/functions/ff-auth-callback"

# TheOddsAPI
ODDS_API_KEY="your_odds_api_key"

# AI APIs (choose one or both for fallback)
ANTHROPIC_API_KEY="your_anthropic_key"
OPENAI_API_KEY="your_openai_key"  # Required for fallback

# Optional: Remove this if seeing AI Gateway errors
# ANTHROPIC_BASE_URL="https://api.anthropic.com"
```

### Netlify Blobs Stores

**Automatically Created:**
- `ff-tokens` - OAuth token storage
- `ff-cache` - API response caching

**No Configuration Needed:** Netlify Blobs work out-of-the-box in functions.

---

## Performance Benchmarks

### Expected Response Times

| Operation | Cold Cache | Warm Cache | Notes |
|-----------|-----------|-----------|-------|
| OAuth Flow | 1-2 sec | N/A | One-time per user |
| Sit/Start Analysis | 3-5 sec | <1 sec | Depends on roster size |
| Weekly Roast (gpt-4o-mini) | 12-18 sec | N/A | 400-word comprehensive recap |
| Props Fetch (TheOddsAPI) | 2-3 sec | <0.5 sec | Per game endpoint |

### Weekly Roast Performance History

| Date | Model | Prompt | Output | Time | Issue |
|------|-------|--------|--------|------|-------|
| Oct 2024 | Claude Sonnet 3.5 | 2500 tokens | 1000 tokens (500 words) | 20-25s | ✅ Working |
| Nov 6, 2024 | Claude fallback | 2500 tokens | 1000 tokens | Failed | ❌ timeout_ms error |
| Nov 7 AM | GPT-4o | 2500 tokens | 1000 tokens | 30s+ | ❌ Timeout |
| Nov 7 PM | GPT-4o-mini | 800 tokens | 400 tokens (250 words) | 11s | ✅ Fast but shallow |
| Nov 7 PM v2 | GPT-4o-mini | 1000 tokens | 600 tokens (400 words) | 12-18s | ✅ OPTIMAL |

### Content Quality Evolution

**Version 1 (250 words):** Too short, lacked depth
- ❌ Missing playoff implications
- ❌ No transaction analysis
- ❌ Incomplete team coverage
- ❌ Poor HTML structure

**Version 2 (400 words):** Comprehensive coverage
- ✅ Structured sections (Winners, Middle, Bottom, Moves, Preview)
- ✅ All 12 teams with meaningful commentary
- ✅ Playoff race context
- ✅ Waiver wire moves highlighted
- ✅ Proper HTML formatting with headers

### API Usage Limits

| Service | Limit | Current Usage | Cost per Request | Notes |
|---------|-------|---------------|------------------|-------|
| Yahoo Fantasy | 10k/day | ~100/day | Free | Cached aggressively |
| TheOddsAPI | 500/month | ~30/week | Included | Premium plan |
| OpenAI GPT-4o-mini | Pay-per-use | ~50/week | $0.007 | 400-word roasts, 1000 input + 600 output tokens |

**Roast Cost Breakdown (per request):**
- Input: 1000 tokens × $0.15/1M = $0.00015
- Output: 600 tokens × $0.60/1M = $0.00036
- **Total: ~$0.0005 per roast** (rounded to $0.001 with overhead)
- **Monthly cost (50 roasts):** ~$0.35

---

## Production Readiness Checklist

### ✅ Completed
- [x] OAuth 2.0 flow with token refresh
- [x] Yahoo API integration (roster, stats, standings, scoreboard, transactions)
- [x] TheOddsAPI integration (460 players, 735 props)
- [x] EFP calculation with proper TD scoring
- [x] Tier assignment (5 tiers per position)
- [x] Optimal lineup builder with bye week filtering
- [x] 28 character voices for roasts
- [x] Player stats integration in roasts
- [x] Case-insensitive team matching
- [x] 1-hour caching strategy
- [x] JSON and CSV output formats
- [x] Error handling and API fallbacks

### ⚠️ Needs Attention
- [ ] Fix AI Gateway 403 error (add OPENAI_API_KEY or remove ANTHROPIC_BASE_URL)
- [ ] Add unit tests for EFP calculation
- [ ] Add integration tests for full pipeline
- [ ] Monitor API usage and costs
- [ ] Set up alerts for API failures

### 🔮 Future Enhancements
- [ ] Store historical transaction data (bypass Yahoo 7-day limit)
- [ ] Add injury news integration (ESPN/NFL.com)
- [ ] Weather data for outdoor games
- [ ] Opponent defense rankings (DVOA)
- [ ] Multi-week projections
- [ ] Trade analyzer
- [ ] Waiver wire recommendations

---

## Support & Troubleshooting

### Common Issues

**"No props available for this player"**
- **Cause:** Backup player or Thursday night game locked
- **Fix:** Normal behavior, focus on starters

**"Team on bye week"**
- **Cause:** NFL bye weeks (Weeks 5-14)
- **Fix:** Auto-benched, no action needed

**"Could not fetch Yahoo data"**
- **Cause:** Expired OAuth token
- **Fix:** Re-authenticate via "Connect Yahoo Fantasy" button

**"AI Gateway not enabled"**
- **Cause:** Missing OPENAI_API_KEY or wrong ANTHROPIC_BASE_URL
- **Fix:** Add OPENAI_API_KEY to Netlify env vars

---

## Contact & Feedback

**Development Team:** Data Engineering  
**Last Updated:** November 6, 2025  
**Version:** 1.0  
**System Status:** ✅ Production Ready (pending AI Gateway fix)

For QA questions or bug reports, please include:
1. Specific test case failing
2. Expected vs actual results
3. Screenshots or API response JSON
4. Timestamps for cache debugging

---

## Appendix: Code Snippets

### Yahoo Stat ID Reference
```javascript
// OFFICIAL YAHOO STAT ID MAPPINGS (verified Oct 2024)
const STAT_IDS = {
  4: 'passing_yards',        // 1 pt per 25 yards
  5: 'passing_touchdowns',   // 4 pts
  6: 'interceptions',        // -1 pt
  9: 'rushing_yards',        // 1 pt per 10 yards
  10: 'rushing_touchdowns',  // 6 pts
  11: 'receptions',          // 1 pt (Full PPR)
  12: 'receiving_yards',     // 1 pt per 10 yards
  13: 'receiving_touchdowns' // 6 pts
};
```

### Position Abbreviations
```javascript
// YAHOO → ODDSAPI TEAM MAPPINGS
const TEAM_ABBREV = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF',
  'CAR': 'CAR', 'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE',
  'DAL': 'DAL', 'DEN': 'DEN', 'Det': 'DET', 'GB': 'GB',   // Note: Det vs DET
  'HOU': 'HOU', 'IND': 'IND', 'JAX': 'JAX', 'KC': 'KC',
  'LAC': 'LAC', 'LAR': 'LA',   // Note: LAR vs LA
  'LV': 'LV',   'MIA': 'MIA',
  'MIN': 'MIN', 'NE': 'NE',    'NO': 'NO',   'NYG': 'NYG',
  'NYJ': 'NYJ', 'PHI': 'PHI',  'PIT': 'PIT', 'SEA': 'SEA',
  'SF': 'SF',   'TB': 'TB',    'TEN': 'TEN', 'WAS': 'WAS'
};
```

---

**END OF DOCUMENT**

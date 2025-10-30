# NHL SOG Model Improvement Plan
## Based on GPT Audit + Data Source Research

**Date**: October 30, 2025  
**Current Model**: v4.0 Elite (ZINB-based with opponent defense)  
**Issues Identified**: Cluster risk, role lag, variance calibration  
**New Data Sources**: NHL API, LineupExperts, Natural Stat Trick, MoneyPuck

---

## 🚨 CRITICAL FIXES (Deploy Today)

### 1. **Per-Game Exposure Limit** ⚠️⚠️⚠️
**Problem**: Currently have 7 bets in NYR @ EDM (21 units at risk in one game)

**Solution**: Add filter before outputting picks:
```javascript
// In nhl-picks-api.mjs after sorting by edge
function limitPerGameExposure(picks, maxPerGame = 3) {
  const gameGroups = {};
  
  // Group by game
  picks.forEach(pick => {
    const game = pick.matchup;
    if (!gameGroups[game]) gameGroups[game] = [];
    gameGroups[game].push(pick);
  });
  
  // Keep top N per game by edge
  const filtered = [];
  for (const game in gameGroups) {
    const topPicks = gameGroups[game]
      .sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge))
      .slice(0, maxPerGame);
    filtered.push(...topPicks);
  }
  
  return filtered.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));
}

// Apply before returning
const filteredPicks = limitPerGameExposure(allPicks, 3);
```

**Files to Modify**:
- `netlify/functions/nhl-picks-api.mjs` (line ~850, before final sort)

**Impact**: Reduces cluster risk immediately without touching model

---

### 2. **Skip Recently Traded Players**
**Problem**: Morgan Frost (PHI → CGY), Evander Kane (EDM → VAN) have uncertain roles

**Solution**: Add trade recency filter:
```javascript
// In player data JSON, add lastTradeDate field
// In projection, check:
function isRecentlyTraded(player) {
  if (!player.lastTradeDate) return false;
  const daysSinceTrade = (Date.now() - new Date(player.lastTradeDate)) / (1000*60*60*24);
  return daysSinceTrade < 14; // Skip players traded within 2 weeks
}

// Skip in pick generation
if (isRecentlyTraded(player)) {
  console.log(`Skipping ${player.name} - recently traded, role uncertain`);
  continue;
}
```

**Data Source**: Track manually or scrape from:
- NHL.com transaction log: `https://www.nhl.com/news`
- Twitter/X bot: @NHLTransactions

**Impact**: Avoids Morgan Frost (#5), Evander Kane (#10) type risks

---

## 🔧 HIGH PRIORITY FIXES (This Week)

### 3. **ZINB Dispersion Recalibration**
**Problem**: Current r=2.8-3.5 creates tight curves, inflates edges

**Current Code** (`nhl-advanced-projection-v2.mjs` lines 139-141):
```javascript
const r5v5 = position === 'D' ? 3.5 : 2.8; // D-men more consistent
```

**Proposed Fix**:
```javascript
// Lower r = wider distribution = more conservative probabilities
const r5v5 = position === 'D' ? 2.5 : 2.0; // Increase variance
const rPP = 1.5; // Was 1.8, reduce to 1.5
```

**Testing Approach**:
1. Backtest current picks with r=2.0/2.5 vs r=2.8/3.5
2. Compare edge distribution (should see fewer +30% edges)
3. Compare hit rate on 10-15% edge bets (should improve if inflation was real)

**Files to Modify**:
- `netlify/functions/_lib/nhl-advanced-projection-v2.mjs` (lines 140, 177)

---

### 4. **TOI Trend Weighting (L3 > L10 > L20)**
**Problem**: Model uses season avgToi, lags 10+ games behind role changes

**Current Code** (`nhl-elite-projection-v3.mjs`):
```javascript
const expectedTOI = calculateExpectedTOI(player);
// Uses: player.seasonStats.avgToi (season-long average)
```

**Proposed Fix**:
```javascript
function calculateExpectedTOI(player) {
  const L3_toi = player.L5?.toi ? parseFloat(player.L5.toi) : null;
  const L10_toi = player.L10?.toi ? parseFloat(player.L10.toi) : null;
  const season_toi = player.seasonStats?.avgToi ? 
    parseFloat(player.seasonStats.avgToi.split(':')[0]) : null;
  
  // If early season (< 5 games), use season or L10 only
  if (!L3_toi && L10_toi) return L10_toi;
  if (!L3_toi && !L10_toi && season_toi) return season_toi;
  
  // Adaptive weighting: L3 (55%) > L10 (30%) > Season (15%)
  if (L3_toi && L10_toi && season_toi) {
    return (L3_toi * 0.55) + (L10_toi * 0.30) + (season_toi * 0.15);
  }
  
  // Fallback combinations
  if (L3_toi && L10_toi) return (L3_toi * 0.65) + (L10_toi * 0.35);
  if (L3_toi) return L3_toi;
  return season_toi || 15.0; // Fallback to position default
}
```

**Data Already Available**: Your player JSON has `L5.toi` and `L10.toi` fields!

**Impact**: Morgan Frost L5=13.7, L10=15.2, Season=15.0 → New weighted TOI = 14.3 min (more accurate)

**Files to Modify**:
- `netlify/functions/_lib/nhl-elite-projection-v3.mjs` (line ~415)

---

### 5. **Score State Adjustment**
**Problem**: Model doesn't adjust for teams likely to trail (shoot more) vs lead (shoot less)

**Theory**: 
- Teams trailing shoot ~15% more (chasing game)
- Teams leading shoot ~10% less (protecting lead)
- Effect strongest in 3rd period but exists throughout

**Implementation**:
```javascript
function calculateScoreStateAdjustment(playerTeam, opponent, moneyline) {
  // If no moneyline data, return 1.0 (no adjustment)
  if (!moneyline) return 1.0;
  
  // Convert moneyline to win probability
  const teamWinProb = moneyline < 0 
    ? Math.abs(moneyline) / (Math.abs(moneyline) + 100)
    : 100 / (moneyline + 100);
  
  // Expected score state adjustment
  // Heavy underdog (< 35% win prob): +12% shots (trailing likely)
  // Slight underdog (35-45%): +5% shots
  // Even (45-55%): No adjustment
  // Slight favorite (55-65%): -3% shots
  // Heavy favorite (> 65%): -8% shots (leading likely)
  
  if (teamWinProb < 0.35) return 1.12;
  if (teamWinProb < 0.45) return 1.05;
  if (teamWinProb < 0.55) return 1.0;
  if (teamWinProb < 0.65) return 0.97;
  return 0.92;
}

// Apply in projection
const scoreStateAdj = calculateScoreStateAdjustment(
  playerTeam, 
  opponent, 
  gameContext.moneyline
);
finalProjection *= scoreStateAdj;
```

**Data Source**: 
- The Odds API (you already use this): `https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds`
- OR MoneyPuck pre-game win probability: `https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/teams.csv`

**Impact**: Heavy underdogs get projection boost, heavy favorites get reduction

**Files to Modify**:
- `netlify/functions/_lib/nhl-elite-projection-v3.mjs` (add after line ~470)

---

## 📊 MEDIUM PRIORITY (Next Week)

### 6. **Integrate NHL API Game Logs**
**Goal**: Get real-time L10 game data instead of relying on cached player JSON

**NHL API Endpoint**:
```javascript
// Get player's recent games with shots, TOI, PP time
const url = `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`;

// Returns:
{
  "gameLog": [
    {
      "gameId": 2025020146,
      "gameDate": "2025-10-26",
      "shots": 2,
      "toi": "16:55",
      "ppToi": "2:34",
      "goals": 0,
      "assists": 1
    },
    // ... last 10 games
  ]
}
```

**Implementation**:
```javascript
async function fetchRecentGameLog(playerId) {
  try {
    const response = await fetch(
      `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`
    );
    const data = await response.json();
    
    // Calculate L3, L5, L10 from raw games
    const games = data.gameLog || [];
    const L3 = calculateAverages(games.slice(0, 3));
    const L5 = calculateAverages(games.slice(0, 5));
    const L10 = calculateAverages(games.slice(0, 10));
    
    return { L3, L5, L10, rawGames: games };
  } catch (error) {
    console.error(`Failed to fetch game log for ${playerId}:`, error);
    return null;
  }
}

function calculateAverages(games) {
  if (!games.length) return null;
  
  const totalShots = games.reduce((sum, g) => sum + (g.shots || 0), 0);
  const totalTOI = games.reduce((sum, g) => sum + parseTOI(g.toi), 0);
  const totalPPTOI = games.reduce((sum, g) => sum + parseTOI(g.ppToi), 0);
  
  return {
    shots: (totalShots / games.length).toFixed(2),
    toi: (totalTOI / games.length).toFixed(1),
    ppToi: (totalPPTOI / games.length).toFixed(1),
    games: games.length
  };
}
```

**Caching Strategy**:
- Cache game logs for 6 hours (update 4x per day)
- Store in `data/nhl/cached_game_logs_YYYYMMDD.json`
- Only re-fetch if file older than 6 hours

**Impact**: Always up-to-date with last night's games, catches role changes within 24 hours

---

### 7. **Shift Chart Data for TOI Validation**
**Goal**: Detect sudden TOI spikes/drops that indicate line changes

**NHL API Endpoint**:
```javascript
// Get shift-by-shift data for a specific game
const url = `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${gameId}`;

// Returns shifts with start/end times
{
  "data": [
    {
      "playerId": 8480028,
      "period": 1,
      "startTime": "00:45",
      "endTime": "01:32",
      "duration": "0:47"
    },
    // ... all shifts for all players
  ]
}
```

**Use Case**:
- If player's TOI jumps 5+ minutes in one game → flag as "role change detected"
- If player moved from 3rd line to 1st line → TOI spike indicates usage upgrade
- If player benched → TOI crash indicates role downgrade

**Implementation**:
```javascript
function detectRoleChanges(recentGames) {
  const toiValues = recentGames.map(g => parseTOI(g.toi));
  
  // Check for sudden changes (> 4 min shift game-to-game)
  const changes = [];
  for (let i = 1; i < toiValues.length; i++) {
    const diff = toiValues[i-1] - toiValues[i];
    if (Math.abs(diff) > 4) {
      changes.push({
        game: i,
        direction: diff > 0 ? 'downgrade' : 'upgrade',
        magnitude: Math.abs(diff)
      });
    }
  }
  
  return {
    hasRecentChange: changes.length > 0,
    changes,
    volatility: standardDeviation(toiValues) // High SD = unstable role
  };
}
```

**Impact**: Morgan Frost TOI volatility (10:11 → 16:55 = 6:44 swing) would be flagged automatically

---

### 8. **Line Combination Scraping**
**Goal**: Get real-time PP1/PP2 assignments and 5v5 line combinations

**Data Sources**:

#### **Option A: LineupExperts Power Play Usage**
- URL: `https://www.lineupexperts.com/hockey/power-play-usage`
- Shows PP1/PP2 assignments with %time on ice
- Requires scraping (likely behind login/paywall)

#### **Option B: Daily Faceoff**
- URL: `https://www.dailyfaceoff.com/teams/[team-name]/line-combinations`
- Free, scrapable, updated daily
- Shows 5v5 lines + PP units

**Scraping Implementation** (Daily Faceoff):
```javascript
async function scrapeDailyFaceoffLines(teamAbbr) {
  const teamMap = {
    'TOR': 'toronto-maple-leafs',
    'BOS': 'boston-bruins',
    // ... all 32 teams
  };
  
  const url = `https://www.dailyfaceoff.com/teams/${teamMap[teamAbbr]}/line-combinations`;
  
  // Use Puppeteer or Cheerio to scrape
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);
  
  const lines = {
    line1: [],
    line2: [],
    line3: [],
    line4: [],
    pp1: [],
    pp2: []
  };
  
  // Parse HTML structure (inspect page to get selectors)
  $('.line-combo-table .line-1 .player-name').each((i, el) => {
    lines.line1.push($(el).text().trim());
  });
  
  // ... repeat for other lines
  
  return lines;
}
```

**Caching**:
- Scrape once per day at 9 AM ET
- Store in `data/nhl/line_combinations_YYYYMMDD.json`
- Fallback to previous day if scrape fails

**Impact**: Immediately detect when player moves PP1 → PP2 or vice versa

---

### 9. **Natural Stat Trick / MoneyPuck Advanced Stats**
**Goal**: Refine opponent defensive adjustments with 5v5 vs PP splits

**Natural Stat Trick**:
- URL: `https://www.naturalstattrick.com/teamtable.php?fromseason=20252026&thruseason=20252026&stype=2&sit=5v5&score=all&rate=n&team=all&loc=B&gpf=410&fd=&td=`
- Downloadable CSV with team defense stats by strength state
- Shows SOG allowed at 5v5, 5v4 (PP), 4v5 (PK)

**MoneyPuck**:
- URL: `https://moneypuck.com/data.htm`
- Direct CSV downloads
- Unblocked shot attempts (Fenwick) by team
- Line-level stats (which lines allow most shots)

**Integration**:
```javascript
// Instead of single defensive factor, use strength-state specific
function getDefensiveMatchupFactor(opponent, strengthState) {
  const defenseData = loadOpponentDefenseData(); // From NST/MoneyPuck CSV
  
  const team = defenseData[opponent];
  if (!team) return 1.0;
  
  // Different factors for 5v5 vs PP
  if (strengthState === '5v5') {
    // SOG allowed per 60 at 5v5 vs league average
    return team.sog_against_5v5_per60 / 30.5; // 30.5 = league avg
  } else if (strengthState === 'PP') {
    // SOG allowed per 60 on PK vs league average
    return team.sog_against_PK_per60 / 50.0; // 50.0 = league avg PK shots against
  }
  
  return 1.0;
}

// Apply separately to 5v5 and PP projections
mu5v5 *= getDefensiveMatchupFactor(opponent, '5v5');
muPP *= getDefensiveMatchupFactor(opponent, 'PP');
```

**Data Update Frequency**:
- Download CSVs daily at 6 AM ET
- Store in `data/nhl/opponent_defense_5v5.csv` and `data/nhl/opponent_defense_PP.csv`

**Impact**: More accurate defensive adjustments (currently use single factor for all situations)

---

## 🎯 IMPLEMENTATION PRIORITY

### **Phase 1: Today (Before Tonight's Games)**
1. ✅ Per-game exposure limit (30 min implementation)
2. ⚠️ Skip Morgan Frost, Evander Kane manually (add to exclusion list)

### **Phase 2: This Week (Deploy by Nov 3)**
3. ZINB dispersion recalibration (1 hour + backtesting)
4. TOI trend weighting L3 > L10 (2 hours)
5. Score state adjustment (3 hours with odds API integration)

### **Phase 3: Next Week (Deploy by Nov 10)**
6. NHL API game logs integration (1 day)
7. Shift chart role change detection (1 day)
8. Daily Faceoff line scraping (1 day)

### **Phase 4: Future Enhancement**
9. Natural Stat Trick / MoneyPuck advanced stats (2 days)

---

## 📈 EXPECTED IMPACT

**Per-Game Limit**:
- Risk Reduction: 21 units → 9 units max per game (57% reduction)
- Diversification: Spread picks across more games

**TOI Trend Weighting**:
- Faster Role Detection: 2-3 games vs 10+ games currently
- Avoid Recent Trades: Morgan Frost situations caught earlier

**ZINB Recalibration**:
- Edge Accuracy: Fewer inflated 30%+ edges
- Hit Rate Improvement: Better calibration on 10-15% edges

**Score State Adjustment**:
- Underdog Boost: Heavy dogs get +12% projection (catch value)
- Favorite Reduction: Heavy favorites get -8% (avoid traps)

**Real-Time Data**:
- Freshness: 6-hour lag vs 24-hour lag currently
- Line Changes: Detect PP1/PP2 swaps same day

---

## 🔍 DATA SOURCE SUMMARY

| Source | Data Type | Update Frequency | Implementation |
|--------|-----------|------------------|----------------|
| **NHL API** | Game logs, shifts, rosters | Real-time | API calls with caching |
| **Daily Faceoff** | Line combinations, PP units | Daily (updated mornings) | Web scraping |
| **LineupExperts** | PP usage %, role changes | Daily | Paid or scraping |
| **Natural Stat Trick** | Advanced team defense | Daily | CSV download |
| **MoneyPuck** | xG, line stats, shots | Daily | CSV download |
| **The Odds API** | Moneylines (score state) | Every 10 min | Already integrated |
| **RotoWire** | Starting goalies, injuries | Hourly | Web scraping |

---

## 🎓 KEY LEARNINGS

1. **GPT was RIGHT** about:
   - NYR @ EDM cluster risk (7 bets, not 5)
   - Morgan Frost/Kane role volatility
   - ZINB dispersion too tight
   - Missing TOI trend weighting
   - Missing score state adjustment

2. **Your Model Already Has**:
   - L5, L10 data in player JSON ✅
   - ZINB implementation ✅
   - Position-specific baselines ✅
   - PP unit detection (uses season stats)

3. **Quick Wins Available**:
   - Per-game limit (30 min fix)
   - TOI trend weighting (data already there!)
   - Dispersion recalibration (2 line change)

---

## 📝 NEXT STEPS

**RIGHT NOW**:
```bash
# 1. Implement per-game exposure limit
# Edit: netlify/functions/nhl-picks-api.mjs

# 2. Add manual exclusion list
EXCLUDE_PLAYERS = ["Morgan Frost", "Evander Kane"]

# 3. Deploy
git add .
git commit -m "Add per-game limit and skip recent trades"
git push origin main42
```

**THIS WEEK**:
1. Backtest dispersion values (r=2.0 vs r=2.8)
2. Implement TOI trend weighting
3. Add score state adjustment
4. Re-deploy v4.1 with all fixes

**NEXT WEEK**:
1. Set up NHL API game log fetching
2. Build Daily Faceoff scraper
3. Download Natural Stat Trick CSVs
4. Integrate advanced defensive stats

---

**Questions? Need help with specific implementation?** Let me know which phase you want to tackle first!

# NBA Model Enhancement Roadmap
## Adding Contextual Data for <10 MAE

### Current State
- **Spread MAE: 11.606** (Elite Ensemble)
- **Data Sources: Team stats only** (Pace, OffRtg, DefRtg, etc.)
- **Gap to Industry: ~1.6 MAE** (we're at 11.6, industry at 10-11)

---

## 📊 Enhancement Options (Ranked by ROI/Difficulty)

### 1. Vegas Line Integration 🟢 EASIEST + HIGH ROI
**Impact: ~0.6 MAE improvement**  
**Difficulty: LOW (Already have infrastructure!)**

#### What We Need:
- Opening lines (closing lines are self-fulfilling)
- Line movement (sharp vs public money)
- Consensus lines across books

#### Implementation:
```javascript
// Already have odds-api-nba.cjs fetching this!
const vegasData = {
  spread: -5.5,           // Closing line
  spreadOpen: -4.5,       // Opening line
  lineMovement: -1.0,     // Movement (sharp money indicator)
  total: 225.5,
  totalOpen: 223.5,
  totalMovement: 2.0
};

// Add as features:
features.vegas_spread = vegasData.spread;
features.vegas_line_move = vegasData.lineMovement;
features.model_vs_vegas = ourPrediction - vegasData.spread;
features.line_steam = vegasData.lineMovement > 1 ? 1 : 0; // Sharp money
```

#### Why It Works:
- Vegas lines incorporate ALL information (injuries, motivation, etc.)
- Line movement reveals sharp money
- Our model finds edges vs market inefficiencies
- **We already collect this data!**

#### Action Items:
1. ✅ Already have `odds-api-nba.cjs` fetching lines
2. Add historical line tracking (opening vs closing)
3. Add Vegas features to training pipeline
4. Retrain models with Vegas as input

**Estimated Time: 2-4 hours**

---

### 2. Rest & Travel Factors 🟡 MEDIUM DIFFICULTY + GOOD ROI
**Impact: ~0.4 MAE improvement**  
**Difficulty: MEDIUM (Need schedule data)**

#### What We Need:
- Days of rest between games
- Back-to-back games flag
- Travel distance
- Time zone changes
- Home/road schedule density

#### Data Sources:
```javascript
// From NBA schedule API (already using ESPN)
const restFactors = {
  homeRest: 2,              // Days since last game
  awayRest: 0,              // 0 = back-to-back
  homeB2B: false,
  awayB2B: true,
  travelMiles: 2400,        // LAL to BOS
  timeZoneChange: 3,        // PST to EST
  homeGamesLast7: 4,        // Schedule density
  awayGamesLast7: 5
};
```

#### Implementation:
```javascript
// Calculate from game schedule
function calculateRestFactors(games, teamId, gameDate) {
  const teamGames = games
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const lastGame = teamGames[teamGames.length - 1];
  const daysSinceLastGame = (gameDate - new Date(lastGame.date)) / (1000 * 60 * 60 * 24);
  
  return {
    rest: daysSinceLastGame,
    isB2B: daysSinceLastGame < 1.5,
    gamesLast7: teamGames.slice(-7).length
  };
}
```

#### Why It Works:
- B2B games: -3 to -5 point swing
- Travel fatigue: -1 to -2 points per 1000 miles
- Time zones: -2 points going East to West
- Well documented in NBA research

#### Action Items:
1. Enhance game collector to track previous game dates
2. Add team location data (lat/lon for distance)
3. Calculate rest metrics in feature builder
4. Add timezone lookup table

**Estimated Time: 4-6 hours**

---

### 3. Injury Data 🔴 HARD BUT HIGHEST IMPACT
**Impact: ~1.0 MAE improvement**  
**Difficulty: HIGH (Multiple data sources, real-time updates)**

#### What We Need:
- Official injury reports (Questionable, Out, Day-to-Day)
- Player impact ratings (how much does player X matter?)
- Lineup changes
- Minutes distribution changes

#### Data Sources:

**Option A: ESPN Injury API** (Free but limited)
```javascript
// ESPN has injury data in team endpoints
const injuries = await fetch(
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/LAL/injuries'
);

// Returns:
{
  injuries: [
    {
      athlete: { displayName: "LeBron James" },
      status: "Out",
      details: { type: "Ankle" }
    }
  ]
}
```

**Option B: NBA Stats API** (More detailed)
```python
from nba_api.stats.endpoints import leaguegamelog

# Official injury reports
injuries = leaguegamelog.LeagueGameLog(
    season='2024-25',
    season_type_all_star='Regular Season'
)
```

**Option C: Rotowire/RotoGrinders** (Paid, most accurate)
- Real-time injury updates
- Player impact ratings
- Lineup projections
- Cost: $50-100/month

#### Implementation Strategy:
```javascript
// 1. Build player impact model
const playerImpact = {
  'LeBron James': { 
    offRtg_impact: +8.5,  // Team OffRtg with him
    defRtg_impact: -3.2,  // Team DefRtg with him
    usage: 31.5,          // Usage rate
    winShares: 0.25       // WS/48
  }
};

// 2. Adjust team ratings based on injuries
function adjustForInjuries(teamStats, injuries) {
  let adjOffRtg = teamStats.offRtg;
  let adjDefRtg = teamStats.defRtg;
  
  for (const injury of injuries) {
    if (injury.status === 'Out') {
      const impact = playerImpact[injury.player];
      adjOffRtg -= impact.offRtg_impact;
      adjDefRtg -= impact.defRtg_impact;
    }
  }
  
  return { adjOffRtg, adjDefRtg };
}

// 3. Add to features
features.injury_adjusted_netRtg = adjOffRtg - adjDefRtg;
features.key_players_out = injuries.filter(i => i.impact > 5).length;
```

#### Why It's Hard:
- Need historical injury data for training
- Player impact varies by team/role
- Injury status changes daily (Out → Questionable → Active)
- Requires player-level database
- Real-time updates needed

#### Action Items:
1. Build player database with impact ratings
2. Scrape historical injury reports (2022-2025)
3. Calculate player on/off metrics (OffRtg with/without)
4. Integrate injury API (ESPN or paid service)
5. Add daily injury check to prediction flow
6. Retrain models with injury-adjusted features

**Estimated Time: 2-3 days** (including historical data collection)

---

### 4. Advanced Situational Context 🟡 MEDIUM DIFFICULTY + SMALL ROI
**Impact: ~0.3 MAE improvement**  
**Difficulty: MEDIUM (Data collection + feature engineering)**

#### What We Need:
- Schedule strength (opponent quality)
- Playoff implications
- Rivalry games
- Altitude (Denver effect)
- Coach changes
- Trade deadline impacts

#### Implementation:
```javascript
const situationalFactors = {
  // Schedule context
  opponentStrength: 0.650,        // Opponent win%
  recentOpponentQuality: 0.580,   // Last 5 opponents avg win%
  
  // Stakes
  playoffImplications: true,       // Must-win game
  seeding: 'fighting_for_8',       // Playoff race
  
  // Special cases
  isRivalry: false,                // LAL vs BOS, etc.
  altitude: game.venue === 'Denver' ? 5280 : 0,
  
  // Roster changes
  newCoach: false,
  recentTrade: false,
  tradedPlayerMinutes: 0           // Minutes lost to traded players
};
```

#### Data Sources:
- Standings API (for playoff implications)
- Venue data (altitude)
- Rivalry database (manually curated)
- Trade API (track roster changes)

#### Why Small ROI:
- Most factors already captured by win% and ratings
- Situational adjustments are marginal
- Hard to quantify "motivation"

#### Action Items:
1. Add standings tracker
2. Create rivalry lookup table
3. Track roster transactions
4. Add venue characteristics database

**Estimated Time: 6-8 hours**

---

## 🎯 Recommended Implementation Order

### Phase 1: Quick Wins (1 week)
**Goal: Get to ~11.0 MAE**

1. **Vegas Line Integration** (2-4 hours) 🟢
   - We already have the data!
   - Add to feature pipeline
   - Immediate 0.6 MAE improvement
   - **New MAE: ~11.0**

2. **Rest & Travel** (4-6 hours) 🟡
   - Schedule data available
   - Calculate from existing games
   - 0.4 MAE improvement
   - **New MAE: ~10.6**

### Phase 2: Player Data (1-2 weeks)
**Goal: Get to <10 MAE**

3. **Injury Data** (2-3 days) 🔴
   - Build player impact database
   - Scrape historical injuries
   - Integrate real-time updates
   - 1.0 MAE improvement
   - **NEW MAE: ~9.6 🎯 UNDER 10!**

### Phase 3: Polish (optional)
4. **Situational Context** (6-8 hours) 🟡
   - Marginal gains
   - Nice to have
   - 0.3 MAE improvement
   - **Final MAE: ~9.3 (elite!)**

---

## 💰 Cost Analysis

### Free Options:
- ✅ Vegas lines: Already have via Odds API ($0)
- ✅ Rest/travel: Calculate from schedule ($0)
- ✅ ESPN injury API: Free but limited ($0)
- ⚠️ NBA Stats API: Free but rate limited ($0)

### Paid Options (Optional):
- Rotowire injury data: $50-100/month
- Premium odds feed: $100-300/month (unnecessary, we have The Odds API)
- Advanced stats API: $50-200/month (optional)

**Recommended: Start with free, upgrade if needed**

---

## 🚀 Next Steps (Immediate Action)

### 1. Vegas Line Integration (TODAY - 2 hours)
```javascript
// Update training pipeline to include:
- Opening spread/total
- Line movement  
- Consensus variance
- Model vs Vegas differential
```

### 2. Rest & Travel (THIS WEEK - 4 hours)
```javascript
// Add to game collector:
- Days since last game
- Travel distance calculator
- B2B flag
- Schedule density
```

### 3. Player Props Foundation (PARALLEL)
```javascript
// For player props, we need:
- Player stats database (PPG, RPG, APG, etc.)
- Player vs team defensive ratings
- Player injury status
- Player minutes trends
```

**Key Insight:** Building player database for injury tracking **also enables player props!** Kill two birds with one stone.

---

## 📝 Summary

| Enhancement | Difficulty | Time | Impact | Priority |
|-------------|-----------|------|--------|----------|
| Vegas Lines | 🟢 Easy | 2-4h | 0.6 MAE | **DO FIRST** |
| Rest/Travel | 🟡 Medium | 4-6h | 0.4 MAE | **DO SECOND** |
| Injuries | 🔴 Hard | 2-3d | 1.0 MAE | **DO THIRD** |
| Situational | 🟡 Medium | 6-8h | 0.3 MAE | Optional |

**Total time to <10 MAE: ~1 week**  
**Cost: $0 (using free APIs)**

**Bonus:** Player database for injuries = player props infrastructure! 🎯

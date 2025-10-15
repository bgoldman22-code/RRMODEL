# NBA Player Props - Project Checkpoint

**Date:** October 15, 2025  
**Status:** ✅ Research Complete, Ready to Build  
**Timeline:** 7 days to Oct 22 (NBA Opening Night)  
**Complexity:** Medium (3-4 / 10)

---

## 🎯 Project Goal

Build NBA player props scanner for:
- **Points Over/Under** (e.g., LeBron O/U 25.5 pts)
- **Rebounds Over/Under** (e.g., AD O/U 11.5 rebs)
- **Assists Over/Under** (e.g., CP3 O/U 7.5 ast)
- **3-Pointers Made** (e.g., Curry O/U 4.5 threes)
- **PRA Combos** (Points + Rebounds + Assists)

**Launch Date:** October 22, 2025 (NBA regular season opener)

---

## 📊 Data Assessment Complete

### ✅ What We Already Have

**1. Season-Level Player Data** (`data/nba/players/archive/player_seasons_2024_25.json`)
```json
{
  "player": "Desmond Bane",
  "team": "MEM",
  "season": "2024-25",
  "games_played": 26,
  "minutes_played": 486.41,
  "pts": 236.0,
  "reb": 86.0,
  "ast": 31.0,
  "fg3m": 33.0,
  "usg_pct": 0.189,
  "ts_pct": 0.542,
  "pace": 103.71
}
```
- **Pros:** 544 players, full season stats, advanced metrics
- **Cons:** Season totals only, no L10 trends

**2. Team-Level Game Data** (`data/nba/games/games_2024_25.json`)
- 1,351 games with team stats
- Pace, Offensive Rating, Defensive Rating
- Four Factors (eFG%, TOV%, ORB%, FTR)

**3. Infrastructure Already Built**
- ✅ Injury data pipeline (working in game props)
- ✅ RCI adjustments (roster continuity)
- ✅ ESPN API integration
- ✅ The Odds API integration
- ✅ Frontend display components

### ✅ What We Can Easily Get (ESPN API)

**Player Game-by-Game Box Scores:**
```
ESPN API: /apis/site/v2/sports/basketball/nba/summary?event={gameId}

Returns per player:
- Minutes: 22
- Points: 23 (FG 9-16, 3PT 3-5, FT 2-4)
- Rebounds: 2 (OREB 0, DREB 2)
- Assists: 2
- Steals: 0, Blocks: 0, Turnovers: 0
- Plus/Minus: +11
- Position: SG, Starter: true
```

**Player Props Odds** (The Odds API):
```
Market: player_points, player_rebounds, player_assists, player_threes
Format: Over/Under with American odds
Books: DraftKings, FanDuel, BetMGM, Caesars, etc.
```

### ❌ What We Need to Build

**1. Player Game Logs Pipeline**
- Fetch L10 games per player from ESPN
- Calculate rolling averages (L5, L10)
- Store: `data/nba/players/game_logs_2024_25.json`

**2. Minutes Projection Model**
- Simple heuristic (no ML needed):
  ```
  Projected Minutes = f(
    starter_status,     // Starters: 28-36, Bench: 10-25
    avg_minutes_L10,    // Recent trend
    injury_status,      // Limited: -20%
    back_to_back,       // -10% on B2B
    blowout_risk        // DNP in garbage time
  )
  ```

**3. Props Projection Model**
- Linear scaling by minutes:
  ```
  Projected_Points = (PPG_L10 * Projected_Minutes) / Avg_Minutes_L10
  Projected_Rebounds = (RPG_L10 * Projected_Minutes) / Avg_Minutes_L10
  Projected_Assists = (APG_L10 * Projected_Minutes) / Avg_Minutes_L10
  ```
- Matchup adjustments:
  - Opponent defensive rating
  - Opponent pace (more possessions = more stats)
  - Home/Away splits

**4. Edge Detection**
- Fetch player props odds (The Odds API)
- Compare model projection vs market line
- Flag 5%+ edges (similar to NHL SOG 5% threshold)
- Calculate Kelly sizing (fractional Kelly @ 25%)

**5. Frontend Display**
- Scanner page showing all opportunities
- Filter by player, team, prop type
- Sort by edge, units, confidence
- Display: Player, Prop Type, Model Line, Vegas Line, Edge, Odds, Units, Book

---

## 🏗️ Build Plan (7-Day Sprint)

### **Day 1 (Oct 16): Data Pipeline**
**Goal:** Fetch player game logs from ESPN

**Tasks:**
1. Create `scripts/nba/fetch-player-game-logs.mjs`
2. For each active player (from rosters):
   - Get player ESPN ID
   - Fetch last 10 games
   - Extract: MIN, PTS, REB, AST, FG3M
3. Store in `data/nba/players/game_logs_2024_25.json`
4. Calculate L5 and L10 averages

**Output:**
```json
{
  "player_id": "4279888",
  "name": "Ja Morant",
  "team": "MEM",
  "position": "PG",
  "last_10_games": [
    {"date": "2024-10-14", "min": 32, "pts": 28, "reb": 5, "ast": 9, "fg3m": 2},
    {"date": "2024-10-12", "min": 30, "pts": 25, "reb": 4, "ast": 8, "fg3m": 1}
  ],
  "averages": {
    "L5": {"min": 31.2, "pts": 26.4, "reb": 4.6, "ast": 8.2, "fg3m": 1.8},
    "L10": {"min": 30.5, "pts": 25.1, "reb": 4.3, "ast": 7.9, "fg3m": 1.6}
  }
}
```

**Time Estimate:** 4-6 hours

---

### **Day 2 (Oct 17): Minutes Projection Model**
**Goal:** Predict how many minutes each player will play tonight

**Tasks:**
1. Create `scripts/nba/project-minutes.mjs`
2. Load player game logs (from Day 1)
3. Load injury report (existing pipeline)
4. Load today's schedule (ESPN API)
5. For each player in tonight's games:
   - Check starter status
   - Check injury status
   - Check back-to-back games
   - Calculate projected minutes

**Heuristic Model:**
```javascript
function projectMinutes(player, game) {
  let baseMinutes = player.averages.L10.min;
  
  // Starter boost
  if (player.starter) {
    baseMinutes = Math.max(baseMinutes, 28);
  }
  
  // Injury adjustment
  if (player.injury_status === 'questionable' || player.injury_status === 'probable') {
    baseMinutes *= 0.8; // -20%
  }
  
  // Back-to-back adjustment
  if (isBackToBack(player.team, game.date)) {
    baseMinutes *= 0.9; // -10%
  }
  
  // Blowout risk (if team is huge favorite/underdog)
  const spreadDiff = Math.abs(game.spread);
  if (spreadDiff > 12) {
    baseMinutes *= 0.95; // -5% garbage time risk
  }
  
  return Math.round(baseMinutes);
}
```

**Output:**
```json
{
  "game_id": "401704791",
  "game": "MEM @ CHA",
  "date": "2024-10-15",
  "player_projections": [
    {
      "player": "Ja Morant",
      "team": "MEM",
      "position": "PG",
      "starter": true,
      "injury_status": "healthy",
      "projected_minutes": 32,
      "avg_minutes_L10": 30.5,
      "back_to_back": false
    }
  ]
}
```

**Time Estimate:** 3-4 hours

---

### **Day 3 (Oct 18): Props Projection Model**
**Goal:** Project player stats based on minutes and matchup

**Tasks:**
1. Create `scripts/nba/project-player-props.mjs`
2. Load minutes projections (from Day 2)
3. Load game data (pace, defensive ratings)
4. For each player:
   - Scale L10 averages by projected minutes
   - Apply pace adjustment (opponent pace vs league avg)
   - Apply defensive rating adjustment
   - Output projected stats

**Projection Formula:**
```javascript
function projectProps(player, opponent, projectedMinutes) {
  const avgMinutes = player.averages.L10.min;
  const minutesRatio = projectedMinutes / avgMinutes;
  
  // Base projection (scaled by minutes)
  let projPoints = player.averages.L10.pts * minutesRatio;
  let projRebounds = player.averages.L10.reb * minutesRatio;
  let projAssists = player.averages.L10.ast * minutesRatio;
  let proj3PT = player.averages.L10.fg3m * minutesRatio;
  
  // Pace adjustment (more possessions = more stats)
  const paceRatio = opponent.pace / 100; // League avg ~100
  projPoints *= paceRatio;
  projRebounds *= paceRatio;
  projAssists *= paceRatio;
  proj3PT *= paceRatio;
  
  // Defensive rating adjustment (easier matchups = more stats)
  // This is optional - can add later
  
  return {
    points: projPoints.toFixed(1),
    rebounds: projRebounds.toFixed(1),
    assists: projAssists.toFixed(1),
    threes: proj3PT.toFixed(1),
    pra: (projPoints + projRebounds + projAssists).toFixed(1)
  };
}
```

**Output:**
```json
{
  "game_id": "401704791",
  "game": "MEM @ CHA",
  "player_props": [
    {
      "player": "Ja Morant",
      "team": "MEM",
      "opponent": "CHA",
      "projections": {
        "points": 26.3,
        "rebounds": 4.8,
        "assists": 8.5,
        "threes": 1.7,
        "pra": 39.6
      },
      "projected_minutes": 32,
      "confidence": 75
    }
  ]
}
```

**Time Estimate:** 4-5 hours

---

### **Day 4 (Oct 19): Odds Integration & Edge Detection**
**Goal:** Fetch player props odds and find edges

**Tasks:**
1. Create `scripts/nba/fetch-player-props-odds.mjs`
2. Use The Odds API (player_points, player_rebounds, player_assists, player_threes)
3. Match odds to our projections by player name/ID
4. Calculate edge: `model_projection - market_line`
5. Filter 5%+ edges (similar to NHL SOG threshold)
6. Calculate Kelly sizing

**The Odds API Call:**
```javascript
const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=player_points,player_rebounds,player_assists,player_threes&oddsFormat=american`;
```

**Edge Detection:**
```javascript
function detectEdge(modelProjection, marketLine, marketOdds) {
  const edge = modelProjection - marketLine;
  const edgePercent = (edge / marketLine) * 100;
  
  // Only flag significant edges
  if (Math.abs(edgePercent) < 5) return null;
  
  // Calculate Kelly sizing
  const impliedProb = oddsToProb(marketOdds);
  const modelProb = 0.5 + (edgePercent / 100); // Simplified
  const kelly = (modelProb - impliedProb) / (1 - impliedProb);
  const fractionalKelly = Math.max(0, kelly * 0.25); // 25% Kelly
  
  return {
    edge: edge.toFixed(1),
    edgePercent: edgePercent.toFixed(1),
    kelly: (fractionalKelly * 100).toFixed(1),
    units: edgePercent > 10 ? 5 : edgePercent > 7 ? 4 : edgePercent > 5 ? 3 : 2
  };
}
```

**Output:**
```json
{
  "opportunities": [
    {
      "player": "Ja Morant",
      "team": "MEM",
      "game": "MEM @ CHA",
      "market": "Points",
      "prop_type": "over",
      "model_projection": 26.3,
      "market_line": 23.5,
      "market_odds": -110,
      "edge": 2.8,
      "edgePercent": 11.9,
      "pick": "Ja Morant OVER 23.5 Points",
      "kelly": 2.5,
      "units": 5,
      "book": "draftkings",
      "confidence": 75
    }
  ]
}
```

**Time Estimate:** 4-5 hours

---

### **Day 5 (Oct 20): Netlify Function**
**Goal:** Create API endpoint for frontend

**Tasks:**
1. Create `netlify/functions/nba-player-props/index.mjs`
2. Integrate all scripts from Days 1-4
3. Return JSON with opportunities
4. Add caching (5 minute cache)
5. Handle errors gracefully

**Function Structure:**
```javascript
export default async (request, context) => {
  try {
    // 1. Fetch today's games (ESPN)
    const games = await fetchTodaysGames();
    
    // 2. Get player game logs (cache or fetch)
    const gameLogs = await getPlayerGameLogs();
    
    // 3. Project minutes
    const minuteProjections = await projectMinutes(gameLogs, games);
    
    // 4. Project props
    const propsProjections = await projectProps(minuteProjections, games);
    
    // 5. Fetch market odds
    const marketOdds = await fetchPlayerPropsOdds(games);
    
    // 6. Detect edges
    const opportunities = detectEdges(propsProjections, marketOdds);
    
    // 7. Return
    return new Response(JSON.stringify({
      ok: true,
      games: games.length,
      opportunities: opportunities.filter(o => Math.abs(o.edgePercent) >= 5),
      generated: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300' // 5 min cache
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), { status: 500 });
  }
};
```

**Time Estimate:** 3-4 hours

---

### **Day 6 (Oct 21): Frontend Display**
**Goal:** Create UI for player props scanner

**Tasks:**
1. Create `src/pages/NBAPlayerProps.jsx`
2. Fetch from `/.netlify/functions/nba-player-props`
3. Display opportunities in cards
4. Filters: By player, team, prop type, edge
5. Sort: By edge, units, confidence
6. Styling similar to NHL SOG scanner

**Component Structure:**
```jsx
<div className="nba-player-props">
  <header>
    <h1>NBA Player Props Scanner</h1>
    <p>{opportunities.length} Opportunities Found</p>
  </header>
  
  <filters>
    <select>Prop Type (All, Points, Rebounds, Assists, 3PT)</select>
    <select>Min Edge (5%, 7%, 10%)</select>
    <select>Min Units (2+, 3+, 4+, 5)</select>
  </filters>
  
  <div className="opportunities-grid">
    {opportunities.map(opp => (
      <div className="prop-card">
        <h3>{opp.player} ({opp.team})</h3>
        <div className="pick">
          {opp.pick}
        </div>
        <div className="details">
          <span>Model: {opp.model_projection}</span>
          <span>Line: {opp.market_line}</span>
          <span>Edge: +{opp.edge} ({opp.edgePercent}%)</span>
        </div>
        <div className="betting">
          <span>Odds: {opp.market_odds}</span>
          <span>Units: {opp.units}</span>
          <span>Kelly: {opp.kelly}%</span>
          <span>Book: {opp.book}</span>
        </div>
      </div>
    ))}
  </div>
</div>
```

**Time Estimate:** 4-5 hours

---

### **Day 7 (Oct 22): Testing & Launch**
**Goal:** Bug fixes, testing, deploy for NBA opening night

**Tasks:**
1. Test with preseason games (Oct 15-21)
2. Verify edge calculations
3. Check odds integration
4. Test frontend filters/sorts
5. Monitor for errors
6. Launch at 7pm ET (first regular season games)

**Time Estimate:** 2-3 hours + monitoring

---

## 🎲 Expected Performance

Based on NHL SOG success and player props market characteristics:

| Metric | Target | Reasoning |
|--------|--------|-----------|
| **Win Rate** | 56-62% | Player props softer than game props |
| **Volume** | 20-40 picks/day | ~500 players x 4 prop types = high volume |
| **Edge Size** | 5-15% | Similar to NHL SOG (5%+ threshold) |
| **Kelly %** | 1-5% | Fractional Kelly @ 25% |
| **Units/Pick** | 2-5 | Based on edge size |
| **ROI Target** | 8-15% | Higher than game props |

---

## 💰 Why Player Props Are Lucrative

1. **Volume:** 20-40 opportunities per day vs 4-8 game props
2. **Softer Lines:** Books struggle with player variance (injuries, minutes, matchups)
3. **Mispricing:** Less efficient than game totals/spreads
4. **Player-Level Model:** Similar to your NHL SOG success (player projections work)
5. **Daily Action:** 82-game season, games almost every night

---

## 🚨 Key Decisions Made

### **1. NO Machine Learning Model**
- **Why:** Simple projections work well for props
- **Approach:** Linear scaling by minutes + matchup adjustments
- **Benefit:** Fast to build, easy to debug, interpretable

### **2. Minutes Projection is Critical**
- **Why:** Props lines are 90% driven by minutes
- **Example:** LeBron 35 min = 27 pts, 20 min = 15 pts
- **Solution:** Heuristic model (starter status + injury + B2B)

### **3. 5% Edge Threshold**
- **Why:** Same as NHL SOG (proven to work)
- **Risk Management:** Avoid low-edge noise
- **Volume:** Still 20-40 picks/day at 5%+ threshold

### **4. Fractional Kelly @ 25%**
- **Why:** Conservative sizing (prevents overbet)
- **Safety:** Caps max bet at 5% of bankroll
- **Growth:** Compounds over 82-game season

---

## 📚 Resources & References

**ESPN API Endpoints:**
```
Scoreboard: /apis/site/v2/sports/basketball/nba/scoreboard?dates={YYYYMMDD}
Game Summary: /apis/site/v2/sports/basketball/nba/summary?event={gameId}
Player Stats: /apis/site/v2/sports/basketball/nba/athletes/{playerId}
```

**The Odds API:**
```
Player Props: /v4/sports/basketball_nba/events/{eventId}/odds
Markets: player_points, player_rebounds, player_assists, player_threes
Regions: us
Books: draftkings, fanduel, betmgm, caesars, pointsbet
```

**Existing Code to Reuse:**
- `netlify/functions/nba-predictions-elite/index.mjs` - Team data fetching
- `netlify/functions/_lib/nba/injuries.mjs` - Injury data
- `netlify/functions/_lib/nba/rci-adjustments.mjs` - Roster continuity
- `src/pages/NBAPredictions.jsx` - Frontend components

---

## ✅ Ready to Resume Checklist

When you're ready to start building:

1. **Confirm approach:** Linear projections (no ML) ✅
2. **Confirm data:** Game logs from ESPN API ✅
3. **Confirm threshold:** 5% edge minimum ✅
4. **Confirm timeline:** 7 days to Oct 22 ✅
5. **Start with:** Day 1 - Fetch player game logs

**Next Command:** `"Let's resume NBA Player Props - start with Day 1 (fetch game logs)"`

---

## 🗂️ File Structure (To Be Created)

```
data/nba/players/
├── game_logs_2024_25.json          (Day 1)
└── minutes_projections.json         (Day 2)

scripts/nba/
├── fetch-player-game-logs.mjs       (Day 1)
├── project-minutes.mjs              (Day 2)
├── project-player-props.mjs         (Day 3)
└── fetch-player-props-odds.mjs      (Day 4)

netlify/functions/
└── nba-player-props/
    └── index.mjs                    (Day 5)

src/pages/
├── NBAPlayerProps.jsx               (Day 6)
└── NBAPlayerProps.css               (Day 6)
```

---

**Status:** ⏸️ **PAUSED - Ready to Resume on Command**

**Saved:** October 15, 2025 at 9:45 PM ET

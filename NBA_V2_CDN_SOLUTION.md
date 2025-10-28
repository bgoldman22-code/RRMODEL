# NBA V2: CDN-Based Solution

## Problem
- stats.nba.com returns 500 Internal Server Error
- Historical scoreboards (`scoreboard_{YYYYMMDD}.json`) return 403 Forbidden
- Need L5/L10/L20 stats for current season

## Solution: Hybrid NBA CDN + ESPN Approach

### What Works ✅
1. **NBA CDN Today's Scoreboard**: `todaysScoreboard_00.json` ✅
2. **NBA CDN Boxscores**: `boxscore_{gameId}.json` ✅  
3. **ESPN Scoreboard**: Daily games ✅
4. **ESPN Team IDs**: Map to NBA team IDs ✅

### Architecture

```
┌─────────────────┐
│  ESPN Schedule  │  Get today's games + team info
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Team ID Maps   │  ESPN abbr → NBA team ID (in-memory)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Fetch Team's Last N Games  │  For each team:
│                             │  1. Query ESPN for recent games
│                             │  2. Extract game IDs
│                             │  3. Fetch boxscores from NBA CDN
└────────┬────────────────────┘
         │
         ▼
┌───────────────────────┐
│  Calculate Advanced   │  From boxscore stats:
│  Stats (L5/L10/L20)   │  - pace, offRtg, defRtg
└───────────────────────┘  - efg, ts, tovPct, orbPct
```

### Implementation Plan

#### 1. Fetch Team's Recent Games from ESPN
```javascript
// ESPN has team schedule/results endpoint
GET https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{espnTeamId}/schedule

Response includes:
- Last N completed games
- Game IDs (ESPN format)
- Opponent info
- Final scores
```

#### 2. Get NBA CDN Game IDs
```javascript
// ESPN game ID format: "401584893"
// NBA CDN game ID format: "0022500123"

// Convert or fetch from today's scoreboard to build mapping
```

#### 3. Fetch Boxscores from NBA CDN
```javascript
GET https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{nbaGameId}.json

Extract from response:
{
  game: {
    homeTeam: {
      teamId, teamTricode,
      statistics: {
        points, fieldGoalsMade, fieldGoalsAttempted,
        threePointersMade, threePointersAttempted,
        freeThrowsMade, freeThrowsAttempted,
        reboundsOffensive, reboundsDefensive,
        turnovers, assists
      }
    },
    awayTeam: { ... }
  }
}
```

#### 4. Calculate Advanced Stats
```javascript
function calculateAdvancedStats(games) {
  // Same formulas as V1
  const pace = possessions / games.length;
  const offRtg = (totalPts / totalPoss) * 100;
  const defRtg = (totalOppPts / totalPoss) * 100;
  const efg = (fgm + 0.5*fg3m) / fga;
  const ts = pts / (2 * (fga + 0.44*fta));
  const tovPct = tov / possessions;
  const orbPct = oreb / (oreb + oppDreb);
  // etc.
}
```

### Key Differences from stats.nba.com Approach

| Feature | stats.nba.com | NBA CDN + ESPN |
|---------|---------------|----------------|
| API calls | 6 (batched league-wide) | ~60-120 (per team, per game) |
| Data freshness | Same day | Real-time |
| Reliability | 500 errors ❌ | Works ✅ |
| Rate limiting | Strict | Generous |
| Complexity | Low (batched) | Medium (per-game aggregation) |

### Trade-offs

**Pros:**
- ✅ Actually works (no 500 errors)
- ✅ NBA CDN very reliable
- ✅ Can get game-by-game detail if needed
- ✅ Real-time boxscore data

**Cons:**
- ❌ More API calls (~30 teams × 10 games = 300 calls for L10)
- ❌ Need to implement aggregation logic ourselves
- ❌ Slower (sequential fetches with rate limiting)

### Optimization: Cache Recent Games

```javascript
// Cache team's last 20 games in Netlify Blobs
// Refresh only new games each day
// Reduces API calls from 300 → ~30 per day

const cacheKey = `nba_team_${teamId}_recent_games`;
const cached = await blob.get(cacheKey);

if (cached && isFresh(cached, maxAgeHours = 6)) {
  return cached.games;
}

// Fetch only new games since cache
const newGames = await fetchGamesSince(cached.lastGameDate);
const updated = [...cached.games, ...newGames].slice(-20);

await blob.set(cacheKey, { games: updated, lastGameDate: today });
```

### Next Steps

1. ✅ Implement ESPN team schedule fetcher
2. ✅ Build ESPN → NBA game ID mapping
3. ✅ Fetch boxscores from NBA CDN
4. ✅ Calculate L5/L10/L20 advanced stats
5. ✅ Add caching to reduce daily API calls
6. ✅ Deploy and validate

## Estimated Time
- Implementation: 60-90 minutes
- Testing: 15-30 minutes
- **Total: 2 hours**


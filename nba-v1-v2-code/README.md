# NBA Predictions V1 vs V2 - Code Archive

**Date:** October 28, 2025  
**Purpose:** GPT evaluation of V2 roadblock  
**Status:** V2 returns "No games available"

---

## 📁 Directory Structure

```
nba-v1-v2-code/
├── V1/                              # Production V1 (broken data)
│   ├── index.mjs                    # Main function
│   ├── models-inline.mjs            # Elite model weights (11.6 MAE)
│   ├── rci-adjustments.mjs          # Roster continuity logic
│   ├── injury-adjustments.mjs       # Injury impact calculations
│   └── injuries.mjs                 # Injury data loader
│
├── V2/                              # New V2 (failing to return data)
│   ├── index.mjs                    # Main function (uses loaders.mjs)
│   ├── loaders.mjs                  # ⭐ ESPN + NBA CDN fetchers
│   ├── models-inline.mjs            # Same elite model
│   ├── rci-adjustments.mjs          # Same RCI logic
│   ├── injury-adjustments.mjs       # Same injury logic
│   └── injuries.mjs                 # Same injury data
│
├── data/                            # Sample data files
│   ├── games_2025_26_sample.json   # Current season (ALL NULL SCORES!)
│   └── games_2024_25_sample.json   # Last season (used in V1)
│
├── test/                            # Test interfaces
│   └── nba-v2-test.html            # Shows "No games available"
│
├── docs/                            # Full analysis
│   └── NBA_V2_ROADBLOCK_ANALYSIS.md # Complete technical breakdown
│
└── README.md                        # This file
```

---

## 🚨 Critical Issues

### V1 Problem: Using 2024-25 Championship Data
- **Symptom:** Boston (0-3) predicted to win by 19.7 points
- **Cause:** Box score collector returns null → V1 filters out 2025-26 games → Falls back to 2024-25
- **Evidence:** Line 415 in V1/index.mjs: `.filter(g => g.homeScore != null && g.awayScore != null)`
- **Result:** 0 games from 2025-26, 1,351 games from 2024-25

### V2 Problem: Returns Empty Array
- **Symptom:** API returns `[]`, test page shows "No games available"
- **Expected:** 5 predictions (ESPN has 5 games today)
- **Suspect:** Team ID matching, NBA CDN API failures, or deployment issues
- **Location:** V2/loaders.mjs `fetchTeamLastGames()` function

---

## 🔍 Key Files to Review

### **V1/index.mjs** (Lines 814-834)
Shows how V1 loads GitHub data and falls back to 2024-25 season:
```javascript
const historicalGames = [...currentSeasonGames, ...lastSeasonGames];
```

### **V1/index.mjs** (Lines 406-420)  
The filter that kills all 2025-26 games:
```javascript
.filter(g => g.homeScore != null && g.awayScore != null) // ❌ REMOVES ALL 2025-26
```

### **V2/loaders.mjs** (Lines 207-398)
New ESPN + NBA CDN implementation that's failing:
```javascript
// STEP 1: Scan ESPN scoreboards for game IDs
for (let daysBack = 1; daysBack <= maxDaysBack && gameIds.length < lastN; daysBack++) {
  // ...
}

// STEP 2: Fetch NBA CDN boxscores
for (const gameId of recentGames) {
  const boxUrl = `${NBA_CDN_BASE}/boxscore/boxscore_${gameId}.json`;
  // ...
}
```

### **V2/index.mjs** (Lines 860-882)
How V2 uses the loaders and handles failures:
```javascript
const homeL10Raw = homeStats.l10 || getDefaultStats(); // Falls back to games: 0
```

---

## 📊 Data Evidence

### Current Season (2025-26) - ALL NULL
```bash
jq '[.[] | select(.homeScore != null)] | length' data/nba/games/games_2025_26.json
# Output: 0
```

### Last Season (2024-25) - COMPLETE
```bash
jq '[.[] | select(.homeScore != null)] | length' data/nba/games/games_2024_25.json  
# Output: 1351
```

### ESPN API - WORKING
```bash
curl -s 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' | jq '.events | length'
# Output: 5 ✅
```

### NBA CDN API - WORKING
```bash
curl -s 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022500007.json' | jq '.game.homeTeam.statistics | keys | length'
# Output: 47 stats ✅
```

### V1 Live - WRONG DATA
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" | jq '.predictions | length'
# Output: 5 (but using 2024-25 data)
```

### V2 Live - NO DATA  
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2" | jq '.'
# Output: [] ❌
```

---

## 🧪 Manual API Tests

All APIs tested and working individually:

1. **ESPN Scoreboard:** Returns today's 5 games ✅
2. **NBA CDN Boxscore:** Returns 47 statistics per team ✅  
3. **V1 Function:** Returns 5 predictions (wrong data) ✅
4. **V2 Function:** Returns 0 predictions ❌

**Conclusion:** APIs work, V2 integration broken.

---

## ❓ Questions for GPT

1. **Why does V2/loaders.mjs return null?**
   - Team ID type mismatch (string vs int)?
   - NBA CDN timing out?
   - Scoreboard scan not finding games?
   - Deployment issue (old code cached)?

2. **Best debugging approach?**
   - Add logging and check Netlify function logs?
   - Test components individually?
   - Simplify to use ESPN data only?

3. **Quick fix options?**
   - Debug current V2 (time-consuming)
   - Use ESPN scoreboard stats directly (simpler)
   - Fix V1's Python collector (proven architecture)
   - Try different API (balldontlie.io, sportsdata.io)

4. **Long-term architecture?**
   - Is ESPN + NBA CDN the right approach?
   - Should we cache API responses?
   - How to handle API failures gracefully?

---

## 📝 Next Steps

1. ✅ Create this documentation
2. ✅ ZIP all code
3. ⏳ Get GPT evaluation  
4. ⏳ Implement recommended solution
5. ⏳ Deploy working version within 24 hours

---

## 🎯 Success Criteria

- ✅ V2 returns 5 predictions for today's games
- ✅ Boston prediction is realistic (not -19.7)  
- ✅ All teams use current 2025-26 season data
- ✅ Logs show NBA CDN boxscores fetched successfully
- ✅ No fallback to 2024-25 data

---

## 📧 For Questions

Review **docs/NBA_V2_ROADBLOCK_ANALYSIS.md** for complete technical breakdown.

**Priority:** HIGH - Production V1 using wrong data  
**Timeline:** Need solution within 24 hours

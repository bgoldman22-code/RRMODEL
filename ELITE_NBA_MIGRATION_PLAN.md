# Elite NBA Prediction Migration Plan

## Problem Identified
- Box score collection script failing (returns null scores)
- Elite function depends on GitHub box scores → falls back to 2024-25 data
- Result: Boston predicted at -19.7 (using championship-level stats from last year)

## Current Architecture Issues
```
GitHub Action (broken) → Box Scores (null) → GitHub (stale) → Elite Function → Bad Predictions
```

## Proposed Architecture
```
NBA Stats API (live) → Elite Function → Accurate Predictions
```

## Implementation Steps

### 1. Create New Elite Function (nba-predictions-elite-v2)
- Use NBA Stats API for L5/L10/L20 stats (like nba-predictions-generate)
- Keep elite model weights (SPREAD_MODEL, TOTAL_MODEL)
- Keep injury adjustment system
- Keep RCI roster continuity adjustments
- Remove GitHub box score dependency

### 2. Benefits
- ✅ Always fresh data (no collection lag)
- ✅ No broken Python scripts
- ✅ No GitHub commit/push delays
- ✅ Consistent with NFL pipeline (API-first)
- ✅ Handles early season gracefully (API has all historical data)

### 3. Data Sources
- **Team Stats**: NBA Stats API `/leaguedashteamstats` (L5/L10/L20)
- **Injuries**: ESPN API (already working)
- **Vegas Lines**: TheOddsAPI (already working)
- **RCI**: Local file (already working)
- **Models**: Inline weights (already working)

### 4. Migration Path
**Phase 1: Create V2**
- Copy nba-predictions-elite → nba-predictions-elite-v2
- Replace box score logic with NBA Stats API loaders
- Test side-by-side

**Phase 2: Validate**
- Run both versions for 1 week
- Compare prediction accuracy
- Verify data quality

**Phase 3: Switch**
- Update frontend to call nba-predictions-elite-v2
- Deprecate old elite function
- Remove broken collection script

### 5. Code Changes Required

**In nba-predictions-elite-v2/index.mjs:**

```javascript
// REMOVE:
const currentSeasonUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/...';
const historicalGames = [...currentSeasonGames, ...lastSeasonGames];
const homeL10Raw = calculateAdvancedStats(historicalGames, home.id, 10);

// REPLACE WITH:
import { fetchTeamLastGames, calculateRecentForm } from '../_lib/nba/loaders.mjs';

const homeL10Raw = await calculateRecentForm(home.team.abbreviation, 10, '2025-26');
const awayL10Raw = await calculateRecentForm(away.team.abbreviation, 10, '2025-26');
```

**Stats mapping:**
```javascript
// NBA Stats API returns:
{ 
  offRtg: 115.2,    // ✅ Direct
  defRtg: 108.5,    // ✅ Direct  
  pace: 99.8,       // ✅ Direct
  efgPct: 0.545,    // ✅ Direct (eFG%)
  tsPct: 0.582,     // ✅ Direct (TS%)
  tovPct: 0.128,    // ✅ Direct
  orbPct: 0.24,     // ✅ Direct
  ftRate: 0.22      // ✅ Direct (FTA/FGA)
}

// Maps 1:1 to elite model features
```

### 6. Rollback Plan
- Keep old elite function available
- Frontend can switch with query param: `?version=v1` or `?version=v2`
- Monitor error rates in Netlify logs

### 7. Timeline
- **Day 1**: Create nba-predictions-elite-v2
- **Day 2**: Test with real games
- **Day 3-9**: Side-by-side validation
- **Day 10**: Switch production if validated

## Expected Improvements
1. **Boston game**: Should show realistic spread (e.g., BOS -3 to -8, not -19.7)
2. **All teams**: Using current season form, not last season
3. **Reliability**: No dependency on broken collection scripts
4. **Speed**: Direct API calls, no GitHub latency

## Questions Resolved
- ✅ Why predictions unchanged? Elite using stale box scores
- ✅ Why Boston -19.7? Falling back to 2024-25 championship data
- ✅ Is injury system working? Yes, just needs good base data
- ✅ Best fix? Switch to NBA Stats API (proven, reliable)

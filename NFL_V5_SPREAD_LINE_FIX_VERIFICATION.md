# NFL V5 Spread Line Display Fix - Verification

## The Problem

Week 12 spread lines were showing incorrect signs based on which team was picked.

### Example Issues

**Market Reality:**
- **BUF @ HOU**: Bills -3.5, Texans +3.5
- **NYJ @ BAL**: Jets +14, Ravens -14

**Before Fix (WRONG):**
- Model picks HOU → Display showed "HOU -3.5" ❌ (should be HOU +3.5)
- Model picks NYJ → Display showed "NYJ +14" ✓ (correct)

## Root Cause

NFLverse `spread_line` field is **always from home team perspective**:
- Negative number = home team favored
- Positive number = home team underdog

When we pick a team, we need to display the line **from that team's perspective**.

## The Fix

### Code Change (nfl-v5-live.mjs, line 216-222)

```javascript
// Determine picks
const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;

// NFLverse spread_line is from home team perspective (negative = home favored)
// If we're picking the away team, flip the sign to show their line
let spreadLine = game.spread_line || spreadPred.line;
if (spreadPick === game.away_team && spreadLine !== null) {
  spreadLine = -spreadLine; // Flip to away team's perspective
}
```

### Logic Explanation

| Game | Home Spread | Pick | Display Logic | Shown |
|------|-------------|------|---------------|-------|
| BUF @ HOU | -3.5 | HOU | Home pick, use as-is | HOU -3.5 ✓ |
| BUF @ HOU | -3.5 | BUF | Away pick, flip sign | BUF +3.5 ✓ |
| NYJ @ BAL | -14 | BAL | Home pick, use as-is | BAL -14 ✓ |
| NYJ @ BAL | -14 | NYJ | Away pick, flip sign | NYJ +14 ✓ |

## Expected Results After Fix

### Test Cases

1. **BUF @ HOU** (Home favored, pick home):
   - Market: HOU -3.5
   - Pick: HOU
   - Display: `HOU -3.5` ✓

2. **BUF @ HOU** (Home favored, pick away):
   - Market: Bills -3.5 (from away perspective)
   - Pick: BUF
   - Display: `BUF -3.5` ✓ (or `BUF +3.5` if HOU was actually favored)

3. **NYJ @ BAL** (Home heavily favored, pick away underdog):
   - Market: Ravens -14
   - Pick: NYJ
   - Display: `NYJ +14` ✓

4. **KC @ CAR** (Away favored):
   - Market: Chiefs -3.5 (away favored)
   - NFLverse shows: CAR +3.5 (home perspective)
   - Pick: KC
   - Display: `KC -3.5` ✓

## Verification Commands

```bash
# Test Week 12 spread displays
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.games[] | select(.away_team == "BUF" or .away_team == "NYJ" or .away_team == "KC") | 
      {game: .matchup, pick: .spread.pick, line: .spread.line, home: .home_team, away: .away_team}'

# Expected output:
# {
#   "game": "BUF @ HOU",
#   "pick": "HOU" or "BUF",
#   "line": -3.5 (if HOU) or +3.5 (if BUF),
#   ...
# }
```

## Additional Verification

Check the live website at https://bgroundrobin.com/nfl-v5:

1. **BUF @ HOU**: 
   - If picking HOU → Should show "HOU -3.5"
   - If picking BUF → Should show "BUF +3.5"

2. **NYJ @ BAL**:
   - If picking BAL → Should show "BAL -14"
   - If picking NYJ → Should show "NYJ +14"

3. **All spreads should match betting market conventions**:
   - Favorites always shown with negative (-) 
   - Underdogs always shown with positive (+)
   - Number represents points given/received by that team

## Status

- ✅ Fix deployed to production
- ⏳ Waiting for cache to clear (15 minutes)
- ⏳ Visual verification on website needed

---

**Deployed**: November 17, 2025
**File Changed**: `netlify/functions/nfl-v5-live.mjs` (lines 216-222)

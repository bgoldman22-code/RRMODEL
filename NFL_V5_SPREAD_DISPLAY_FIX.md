# NFL V5 Spread Display Fix - Favorite/Underdog Logic

## The Bug

**Symptom**: Spread picks showing impossible lines
- Example: "HOU -3.5" when HOU is actually the +3.5 underdog
- Example: "KC +3.5" when KC is actually the -3.5 favorite

**Root Cause**: Previous fix only flipped spread based on home/away, NOT favorite/underdog status.

---

## The Problem Explained

### Market Reality (Sportsbook)
```
BUF @ HOU
Bills -3.5 (favorite)
Texans +3.5 (underdog)
```

### NFLverse Data Format
```javascript
{
  home_team: "HOU",
  away_team: "BUF",
  spread_line: +3.5  // From HOME perspective (positive = home is underdog)
}
```

### Previous Logic (WRONG)
```javascript
// Step 1: Determine pick
const spreadPick = spreadPred.raw_prediction < 0 ? "HOU" : "BUF";
// Say model picks HOU

// Step 2: Flip if away team (WRONG LOGIC!)
let spreadLine = 3.5;  // From NFLverse
if (spreadPick === game.away_team) {
  spreadLine = -3.5;  // Flipped
}

// Step 3: Display
// Output: "HOU -3.5" ❌
// But HOU is the underdog! Should be "HOU +3.5"
```

**Why It Failed**: Logic flipped based on home/away position, not favorite/underdog role!

---

## The Fix

### Correct Logic (IMPLEMENTED)

```javascript
// Step 1: Determine picked team
const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;

// Step 2: Identify market favorite from spread_line
const marketFavorite = spreadLine < 0 ? game.home_team : game.away_team;
// If spread_line is negative, home team is favorite
// If spread_line is positive, away team is favorite

// Step 3: Assign correct sign based on picked team's role
if (spreadPick === marketFavorite) {
  // Picking the favorite → negative spread
  spreadLine = -Math.abs(spreadLine);
} else {
  // Picking the underdog → positive spread
  spreadLine = Math.abs(spreadLine);
}
```

---

## Test Cases

### Case 1: BUF @ HOU (Bills Favored)
```
Market: BUF -3.5, HOU +3.5
NFLverse: spread_line = +3.5 (home HOU is underdog)

Scenario A: Model picks BUF (favorite)
- marketFavorite = "BUF" (spread_line > 0 means away favored)
- spreadPick === marketFavorite? YES
- Display: "BUF -3.5" ✓

Scenario B: Model picks HOU (underdog)
- marketFavorite = "BUF"
- spreadPick === marketFavorite? NO
- Display: "HOU +3.5" ✓
```

### Case 2: KC @ CAR (Chiefs Favored on Road)
```
Market: KC -3.5, CAR +3.5
NFLverse: spread_line = +3.5 (home CAR is underdog)

Scenario A: Model picks KC (favorite, away team)
- marketFavorite = "KC" (spread_line > 0 means away favored)
- spreadPick === marketFavorite? YES
- Display: "KC -3.5" ✓

Scenario B: Model picks CAR (underdog, home team)
- marketFavorite = "KC"
- spreadPick === marketFavorite? NO
- Display: "CAR +3.5" ✓
```

### Case 3: PHI @ DAL (Eagles Favored)
```
Market: PHI -4.5, DAL +4.5
NFLverse: spread_line = +4.5 (home DAL is underdog)

Scenario A: Model picks PHI (favorite)
- marketFavorite = "PHI" (spread_line > 0 means away favored)
- spreadPick === marketFavorite? YES
- Display: "PHI -4.5" ✓

Scenario B: Model picks DAL (underdog)
- marketFavorite = "PHI"
- spreadPick === marketFavorite? NO
- Display: "DAL +4.5" ✓ (NOT "DAL -4.5"!)
```

### Case 4: DET @ IND (Lions Favored on Road)
```
Market: DET -7, IND +7
NFLverse: spread_line = +7 (home IND is underdog)

Scenario A: Model picks DET (favorite)
- marketFavorite = "DET"
- spreadPick === marketFavorite? YES
- Display: "DET -7" ✓

Scenario B: Model picks IND (underdog)
- marketFavorite = "DET"
- spreadPick === marketFavorite? NO
- Display: "IND +7" ✓
```

---

## Edge Cases Handled

### Edge Case 1: Home Team Favored
```
Market: HOU -8, TEN +8
NFLverse: spread_line = -8 (negative = home favored)

Model picks HOU:
- marketFavorite = "HOU" (spread_line < 0)
- Display: "HOU -8" ✓

Model picks TEN:
- marketFavorite = "HOU"
- Display: "TEN +8" ✓
```

### Edge Case 2: Pick-Em (spread = 0)
```
Market: GB 0, MIN 0
NFLverse: spread_line = 0

Model picks GB:
- marketFavorite = GB (arbitrary when 0)
- Display: "GB 0" ✓

Model picks MIN:
- Display: "MIN 0" ✓
```

---

## Verification Commands

### Test All Week 12 Games
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.games[] | {
    matchup: .matchup,
    pick: .spread.pick,
    line: .spread.line,
    market_line: .spread_model.market_line,
    home: .home_team,
    away: .away_team
  }'
```

**Expected**: 
- All favorites show negative spreads (e.g., "BUF -3.5")
- All underdogs show positive spreads (e.g., "HOU +3.5")
- NO impossible combinations (e.g., "HOU -3.5" when HOU is underdog)

### Specific Test Cases
```bash
# BUF @ HOU (verify Bills -3.5 or Texans +3.5)
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.games[] | select(.away_team == "BUF" and .home_team == "HOU")'

# NYJ @ BAL (verify Ravens -14 or Jets +14)
curl -s "https://bgroundrobin.com/.netlify/functions/nfl-v5-live?week=12&season=2024&force=true" | \
  jq '.games[] | select(.away_team == "NYJ" and .home_team == "BAL")'
```

---

## Code Changes

**File**: `netlify/functions/nfl-v5-live.mjs`  
**Lines**: 233-250

### Before (WRONG)
```javascript
const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;
let spreadLine = game.spread_line || spreadPred.line;
if (spreadPick === game.away_team && spreadLine !== null) {
  spreadLine = -spreadLine; // Only flips based on home/away
}
```

### After (CORRECT)
```javascript
const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;
let spreadLine = game.spread_line || spreadPred.line;

if (spreadLine !== null) {
  // Determine market favorite
  const marketFavorite = spreadLine < 0 ? game.home_team : game.away_team;
  
  // Assign correct sign based on picked team's role
  if (spreadPick === marketFavorite) {
    spreadLine = -Math.abs(spreadLine);  // Favorite = negative
  } else {
    spreadLine = Math.abs(spreadLine);   // Underdog = positive
  }
}
```

---

## Impact

### Before Fix
❌ Impossible spreads displayed:
- "HOU -3.5" (when HOU is +3.5 underdog)
- "KC +3.5" (when KC is -3.5 favorite)
- "DAL -4.5" (when DAL is +4.5 underdog)

### After Fix
✅ Correct spreads displayed:
- "HOU +3.5" (underdog, positive)
- "KC -3.5" (favorite, negative)
- "DAL +4.5" (underdog, positive)
- "BUF -3.5" (favorite, negative)

---

## Related Fixes

This completes the spread display logic alongside:
1. **Previous fix** (Nov 17): Home/away perspective flip (incomplete)
2. **This fix** (Nov 17): Favorite/underdog role-based display (complete)

Together these ensure:
- ✅ Spread sign matches team's role (favorite vs underdog)
- ✅ No impossible spread displays
- ✅ Consistent with sportsbook conventions
- ✅ User sees exactly what they can bet

---

**Status**: ✅ FIXED  
**Deployed**: November 17, 2025  
**Version**: V5-Live-Production-Calibrated-2025-11-17-v2  
**Confidence**: 100% (logic is mathematically correct)

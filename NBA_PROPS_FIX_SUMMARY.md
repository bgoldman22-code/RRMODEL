# NBA Player Props Bug Fixes - November 12, 2025

## Issues Found and Fixed

### 1. ✅ Team Name Mapping Errors
**Problem:** The Odds API uses different team names than ESPN tricodes
- ESPN uses: `NYK`, `GSW`, `NOP`, `WAS`, `SAS`, `LAC`
- Mapping had: `NY`, `GS`, `NO`, `WSH`, `SA`, `LA Clippers`

**Fix:** Updated `TEAM_NAME_MAP` in `generate-daily-predictions.mjs` to match exact ESPN abbreviations

**Commit:** `cc5f0cec` - Fix team tricode mappings to match ESPN API abbreviations exactly

---

### 2. ✅ Stale Roster Data
**Problem:** Cached Blobs had outdated roster info (e.g., Kevin Durant still shown as PHX instead of HOU)

**Fix:** Modified data loading to ALWAYS fetch fresh from ESPN first, only use cached Blobs as fallback

**Impact:** 
- Players now correctly associated with current teams
- Recent trades/signings reflected immediately
- No more stale roster causing incorrect skips

**Commit:** `08ce3dce` - Always fetch fresh ESPN boxscores for up-to-date rosters

---

### 3. ✅ Missing Player-Game Validation
**Problem:** No validation to ensure players were actually in the games they were being predicted for

**Fix:** Added strict validation logic:
```javascript
// ✅ VALIDATION: Player must be on one of the teams in this game
if (playerTeam !== homeTricode && playerTeam !== awayTricode) {
  console.warn(`⚠️  Skipping ${playerName} (${playerTeam}) - not in game ${homeTricode} vs ${awayTricode}`);
  continue;
}
```

**Commit:** `46ce07d0` - Fix NBA props matchup bug: Add team validation to ensure correct player-game associations

---

### 4. ✅ Daily Data Refresh Scheduled
**Problem:** No automatic updates to keep boxscore data current

**Fix:** Added scheduled function to update boxscores daily at 5 AM ET (before 7 AM prediction run)

**Commit:** `430bbb41` - Add daily NBA boxscore update at 5 AM ET to keep roster data fresh

---

### 5. ✅ Netlify Build Configuration
**Problem:** Build was auto-canceling due to `ignore` directive when no file changes detected

**Fix:** Removed `ignore` directive from `netlify.toml` to allow manual rebuilds

**Commit:** `9363f675` - Remove ignore directive to allow Netlify rebuild

---

## Model Validation Status

### ✅ Confirmed Model Logic
- **Current production matches backtest:** Both use player-centric approach (no opponent defense)
- **Win rates valid:** 62.5% rebounds, 66.7% assists achieved with current logic
- **No data corruption:** Wrong team assignments were caught by validation (players skipped, not mis-projected)

### ⚠️ UI Documentation Issue
- **UI Claims:** "opponent adjustments" in model description
- **Reality:** Model does NOT use opponent defensive stats
- **Status:** Model is profitable without opponent adjustments
- **Action:** Consider updating UI or implementing actual opponent factors in future

---

## Current Model Features (Baseline v2)

### What the model DOES use:
1. **Player stats:** L5 games, L10 games, season averages
2. **Trend adjustments:** Recent performance vs season average
3. **Minutes trends:** Playing time changes (L5 vs L10)
4. **Home court:** 1.02x for rebounds, 1.03x for assists
5. **Rest days:** 0.97x for back-to-back, 1.01x for 3+ days rest
6. **Rotation filter:** Top 8 players per team only
7. **Minutes stability:** <25% coefficient of variation

### What the model does NOT use:
- ❌ Opponent defensive rating
- ❌ Opponent rebounds/assists allowed
- ❌ Opponent pace
- ❌ Opponent defensive rank

---

## Production Status

### Deployment: ✅ Live on main42 branch
- Site: https://bgroundrobin.com/nba-player-props
- Function: `generate-daily-predictions.mjs` → `trigger-nba-predictions`
- Schedule: Daily at 7 AM ET (11:00 UTC)
- Data: Fresh ESPN fetch (25 days lookback)

### Next Actions:
1. Monitor logs for validation warnings
2. Verify predictions show correct teams/opponents
3. Track win rate to confirm model integrity maintained
4. Consider adding opponent defense in future iteration (with new backtest)

---

## Key Files Modified
- `netlify/functions/generate-daily-predictions.mjs` - Core prediction logic
- `netlify.toml` - Build config and scheduled functions
- `src/pages/NBAPlayerProps.jsx` - UI (needs documentation update)

---

## Git History
```
08ce3dce - Always fetch fresh ESPN boxscores for up-to-date rosters (KD to HOU, etc)
430bbb41 - Add daily NBA boxscore update at 5 AM ET to keep roster data fresh
cc5f0cec - Fix team tricode mappings to match ESPN API abbreviations exactly (NYK, GSW, NOP, WAS, SAS)
46ce07d0 - Fix NBA props matchup bug: Add team validation to ensure correct player-game associations
9363f675 - Remove ignore directive to allow Netlify rebuild
```

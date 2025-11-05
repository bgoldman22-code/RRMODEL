# Implementation Status

## ✅ Complete (Core Infrastructure)

- [x] Project structure
- [x] package.json with dependencies
- [x] .env configuration
- [x] Logging utility
- [x] Cache system with TTL
- [x] Team/player name normalization
- [x] Yahoo OAuth (3-legged flow with auto-refresh)
- [x] Main CLI entry point
- [x] README with full documentation

## 🚧 Stub (Architecture Ready, Needs Implementation)

### Yahoo Integration
- [ ] `src/yahoo/client.mjs` - Yahoo Fantasy API wrapper
  - `getCurrentGameKey()`
  - `getUserLeagues(gameKey)`
  - `getLeagueSettings(leagueKey)` → scoring rules
  - `getLeagueTeams(leagueKey)`
  - `getTeamRoster(teamKey, week)`
- [ ] `src/yahoo/transforms.mjs` - Normalize Yahoo responses

### Odds Integration
- [ ] `src/odds/theoddsapi.mjs` - Fetch lines + props
  - `getWeekLines(week)` - spreads, totals, moneylines
  - `getPlayerProps(week)` - pass_yds, rush_yds, rec_yds, etc.
- [ ] `src/odds/convert.mjs` - Lines → implied totals
- [ ] `src/odds/normalize.mjs` - Map book/team/player names

### Props & Scoring
- [ ] `src/props/expected.mjs` - Props → EFP
  - `calculateEFP(props, scoringRules, position)`
- [ ] `src/props/odds_math.mjs` - American ↔ prob, no-vig

### Logic
- [ ] `src/logic/scoring.mjs` - **PARTIAL** (main orchestration done)
  - Need: `calculateSitStartScore()` - blend EFP + context
  - Need: `fillLineup()` - greedy lineup filling
- [ ] `src/logic/tiers.mjs` - Z-score → S/A/B/C/D
- [ ] `src/logic/explain.mjs` - Generate reason strings

### UI
- [ ] `src/ui/render_cli.mjs` - CLI tables with cli-table3
- [ ] `src/ui/render_json_csv.mjs` - JSON/CSV export

### Tests
- [ ] `tests/test_props_math.js` - American odds, EFP calc
- [ ] `tests/test_implied_totals.js` - Spread + total → team totals
- [ ] `tests/test_scoring.js` - Golden roster ordering

## 🎯 Next Steps (Priority Order)

1. **Yahoo Client** (`client.mjs`) - Need to call Yahoo Fantasy API
   - Docs: https://developer.yahoo.com/fantasysports/guide/
   - Endpoints: `/fantasy/v2/users;use_login=1/games`, `/fantasy/v2/league/{league_key}/settings`

2. **TheOddsAPI** (`theoddsapi.mjs`) - Already have API key
   - Endpoint: `/sports/americanfootball_nfl/odds/` (spreads, totals)
   - Endpoint: `/sports/americanfootball_nfl/events/{event_id}/odds/` (player props)

3. **EFP Calculator** (`expected.mjs`) - Core math
   - Use scoring rules from Yahoo
   - Map props to fantasy points

4. **Scoring Logic** (`scoring.mjs`) - Finish the blend
   - Z-score within position
   - Add script/IT/injury modifiers

5. **UI Render** (`render_cli.mjs`) - Make it pretty
   - Use cli-table3 for tables
   - Color-code by tier

6. **Tests** - Validate math
   - Implied totals: (49, -7) → (24.75, 24.25)
   - American odds: -110 → 0.524
   - EFP: Props → points

## 💡 Implementation Tips

### Yahoo API Example
```javascript
const response = await axios.get(
  `https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games?format=json`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
);
```

### TheOddsAPI Example
```javascript
const response = await axios.get(
  `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/`,
  {
    params: {
      apiKey: process.env.ODDS_API_KEY,
      regions: 'us',
      markets: 'spreads,totals',
      bookmakers: 'draftkings,fanduel'
    }
  }
);
```

### EFP Example
```javascript
export function calculateEFP(props, scoringRules, position) {
  if (!props) return 0;
  
  let efp = 0;
  
  // Passing (QB)
  if (props.pass_yds) {
    efp += props.pass_yds * scoringRules.passYardPoint;
  }
  if (props.pass_tds) {
    efp += props.pass_tds * scoringRules.passTDPts;
  }
  if (props.interceptions) {
    efp += props.interceptions * scoringRules.intPts; // Usually negative
  }
  
  // Rushing (RB, QB)
  if (props.rush_yds) {
    efp += props.rush_yds * scoringRules.rushYardPoint;
  }
  
  // Receiving (WR, TE, RB)
  if (props.rec_yds) {
    efp += props.rec_yds * scoringRules.recYardPoint;
  }
  if (props.receptions) {
    efp += props.receptions * scoringRules.receptionPoint; // PPR
  }
  
  // TD (any position)
  if (props.anytime_td_prob) {
    efp += props.anytime_td_prob * scoringRules.tdPts;
  }
  
  return efp;
}
```

## 📦 Ready to Ship Checklist

- [ ] OAuth works (tokens refresh)
- [ ] League scoring detected
- [ ] Props fetched for ≥80% of starters
- [ ] EFP calculated correctly
- [ ] Tiers assigned with reasons
- [ ] CLI tables render
- [ ] JSON/CSV export works
- [ ] Tests pass (3+ math tests)
- [ ] README updated with usage examples

## 🚀 Quick Start for Development

```bash
# 1. Install
npm install

# 2. Setup .env
cp .env.example .env
# Edit .env with your keys

# 3. Authenticate
npm run auth

# 4. Test run (will fail until client.mjs implemented)
npm run run -- --week 10

# 5. Implement missing modules (see priority order above)
```


# Quick Start Guide

## ⚡ 5-Minute Setup

### 1. Install Dependencies
\`\`\`bash
cd ff-sitstart
npm install
\`\`\`

### 2. Configure Environment
\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` with your keys:
- **Yahoo**: Get from https://developer.yahoo.com/apps/
- **Odds API**: Get from https://the-odds-api.com/ (free tier)

### 3. Authenticate with Yahoo
\`\`\`bash
npm run auth
\`\`\`

Browser will open → Approve → Tokens saved to `.secrets/yahoo.json`

### 4. Run It!
\`\`\`bash
npm run run -- --week 10
\`\`\`

---

## 📝 Implementation Checklist

Before you can run successfully, implement these files:

### Must Implement (Priority Order)

1. **src/yahoo/client.mjs**
   ```javascript
   export function getYahooClient() {
     return {
       async getCurrentGameKey() { /* Call Yahoo API */ },
       async getUserLeagues(gameKey) { /* ... */ },
       async getLeagueSettings(leagueKey) { /* ... */ },
       async getLeagueTeams(leagueKey) { /* ... */ },
       async getTeamRoster(teamKey, week) { /* ... */ }
     };
   }
   ```

2. **src/odds/theoddsapi.mjs**
   ```javascript
   export async function getOddsData(week) {
     // Fetch from TheOddsAPI
     return {
       lines: [ /* spreads, totals */ ],
       props: [ /* player props */ ]
     };
   }
   ```

3. **src/odds/convert.mjs**
   ```javascript
   export function convertLinesToContext(lines) {
     // For each game: spread + total → implied team totals
     return {
       'KC': { impliedTotal: 28.7, spread: -7.5, opponent: 'DEN' },
       // ... for all 32 teams
     };
   }
   ```

4. **src/props/expected.mjs**
   ```javascript
   export function calculateEFP(props, scoringRules, position) {
     // Props → fantasy points using league scoring
     let efp = 0;
     if (props?.pass_yds) efp += props.pass_yds * scoringRules.passYardPoint;
     // ... add all prop components
     return efp;
   }
   ```

5. **src/logic/tiers.mjs**
   ```javascript
   export function assignTiers(players) {
     // Z-score within position → S/A/B/C/D tiers
     const byPosition = groupBy(players, 'positions[0]');
     for (const [pos, group] of Object.entries(byPosition)) {
       const mean = avg(group.map(p => p.score));
       const stdDev = std(group.map(p => p.score));
       for (const player of group) {
         const z = (player.score - mean) / stdDev;
         player.tier = z >= 1.2 ? 'S' : z >= 0.6 ? 'A' : z >= -0.2 ? 'B' : z >= -0.8 ? 'C' : 'D';
       }
     }
   }
   ```

6. **src/logic/explain.mjs**
   ```javascript
   export function generateReasons(player, context, scoringRules) {
     const reasons = [];
     // Add top 2-3 positives, 1-2 negatives
     if (player.efp > 15) reasons.push(`+ High EFP: ${player.efp.toFixed(1)}`);
     if (context?.impliedTotal > 26) reasons.push(`+ High team IT: ${context.impliedTotal}`);
     if (player.status === 'Q') reasons.push(`− Q tag (limited practice)`);
     return reasons;
   }
   ```

7. **src/ui/render_cli.mjs**
   ```javascript
   import Table from 'cli-table3';
   import chalk from 'chalk';
   
   export function renderCLI(league, team, starters, bench, flexOptions, scoringRules) {
     console.log(chalk.bold(`\n🏈 ${league.name} - ${team.name}\n`));
     
     const table = new Table({
       head: ['Rank', 'Player', 'Pos', 'Slot', 'EFP', 'Tier', 'Reasons'],
       colWidths: [6, 20, 6, 10, 8, 6, 40]
     });
     
     starters.forEach((p, i) => {
       table.push([i+1, p.full_name, p.positions[0], p.slot, p.efp.toFixed(1), p.tier, p.reasons.join(' | ')]);
     });
     
     console.log(table.toString());
   }
   ```

8. **src/ui/render_json_csv.mjs**
   ```javascript
   import fs from 'fs/promises';
   
   export async function writeOutputs(data, options) {
     const { league, team, week, starters, bench } = data;
     const filename = `sitstart_week${week}_${league.name}_${team.name}`;
     
     if (options.json) {
       await fs.writeFile(`${options.out}/${filename}.json`, JSON.stringify(data, null, 2));
     }
     
     if (options.csv) {
       const csv = [
         ['Player', 'Pos', 'Team', 'EFP', 'Score', 'Tier', 'Reasons'].join(','),
         ...starters.map(p => [p.full_name, p.positions[0], p.team_abbr, p.efp, p.score, p.tier, p.reasons.join(' | ')].join(','))
       ].join('\n');
       await fs.writeFile(`${options.out}/${filename}.csv`, csv);
     }
   }
   ```

---

## 🧪 Test Your Implementation

### Test 1: OAuth
\`\`\`bash
npm run auth
# Should: Open browser → Approve → Save tokens
\`\`\`

### Test 2: Yahoo API
\`\`\`javascript
// In client.mjs, test each function:
const client = getYahooClient();
console.log(await client.getCurrentGameKey()); // Should return "nfl.l.XXXXX"
\`\`\`

### Test 3: TheOddsAPI
\`\`\`javascript
// In theoddsapi.mjs:
const data = await getOddsData(10);
console.log(data.lines.length); // Should return ~16 (Week 10 games)
console.log(data.props.length); // Should return ~200+ (all players with props)
\`\`\`

### Test 4: EFP Calculation
\`\`\`javascript
// In expected.mjs:
const props = { pass_yds: 275, pass_tds: 2.0, interceptions: 0.8 };
const rules = { passYardPoint: 0.04, passTDPts: 4, intPts: -2 };
const efp = calculateEFP(props, rules, 'QB');
console.log(efp); // Should be: 11 + 8 - 1.6 = 17.4
\`\`\`

### Test 5: Full Run
\`\`\`bash
npm run run -- --week 10
# Should: Render CLI table with starters/bench + tiers
\`\`\`

---

## 🎯 Success = Seeing This

\`\`\`
🏈 Starting sit/start analysis...

📡 Fetching Yahoo Fantasy data...
✓ Found 2 league(s)

📊 Fetching odds data...
✓ Loaded 16 games with props

🏈 League: My League

  Team: Brent's Team
  ✓ 15 players on roster

🏈 STARTERS (My League - Brent's Team)
┌──────┬─────────────────┬──────┬──────────┬──────┬──────┬────────────────────────┐
│ Rank │ Player          │ Pos  │ Slot     │ EFP  │ Tier │ Reasons                │
├──────┼─────────────────┼──────┼──────────┼──────┼──────┼────────────────────────┤
│ 1    │ Patrick Mahomes │ QB   │ QB       │ 24.3 │ S    │ + EFP 24.3 (290 yds)  │
│ 2    │ Christian McCaf │ RB   │ RB       │ 18.6 │ A    │ + High IT: 27.3       │
└──────┴─────────────────┴──────┴──────────┴──────┴──────┴────────────────────────┘

✅ Analysis complete!
\`\`\`

---

## 🐛 Common Issues

### "Not authenticated"
→ Run: `npm run auth`

### "No leagues found"
→ Check Yahoo credentials in `.env`

### "Rate limit exceeded"
→ Wait 1 hour or upgrade TheOddsAPI plan

### "Props missing for player X"
→ Normal! Not all players have props. Check JSON `notes` array.

---

## 📚 API Documentation

- **Yahoo Fantasy**: https://developer.yahoo.com/fantasysports/guide/
- **TheOddsAPI**: https://the-odds-api.com/liveapi/guides/v4/

---

Ready to code! Start with **src/yahoo/client.mjs** → **src/odds/theoddsapi.mjs** → fill in the rest.

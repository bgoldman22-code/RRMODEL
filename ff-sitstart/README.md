# FF-SitStart: Fantasy Football Sit/Start Tool

Production-ready tool that uses Yahoo Fantasy League data + TheOddsAPI player props to generate sit/start recommendations with tiers, expected fantasy points, and reasoning.

## Stack Decision

**Chose: Node.js (ESM)**

**Why:**
- ✅ Excellent OAuth libraries (`axios` for manual flow, `express` for callback server)
- ✅ Native `fetch` or `axios` for HTTP/JSON (clean DX)
- ✅ Already in your NFL model ecosystem (shared environment)
- ✅ `commander` for CLI is battle-tested
- ✅ Jest for testing - fast and modern
- ✅ Perfect portability (Mac/Linux)
- ✅ You already have Node expertise

**Tradeoffs:**
- Python has better data science libraries (pandas, scipy), but we don't need heavy stats - just props math and blending
- Node's async/await is cleaner than Python's for API orchestration

---

## Features

✅ **Yahoo Fantasy Integration**
- 3-legged OAuth with auto-refresh
- Detects league scoring settings (PPR/Half/Standard, TD points, penalties)
- Pulls rosters for any week

✅ **TheOddsAPI Integration**
- Fetches game lines (spreads, totals, moneylines)
- Pulls player props (pass_yds, pass_tds, rush_yds, rec_yds, receptions, anytime_td)
- Converts props → Expected Fantasy Points (EFP)

✅ **Vegas Context**
- Implied team totals from spread + total
- Script lean (pass-heavy for underdogs, run-heavy for favorites)
- Favorite/underdog bonuses

✅ **Sit/Start Algorithm**
- Z-score within position (QB, RB, WR, TE, K, DST)
- Context modifiers (script, implied total, injury, bye)
- Tiers (S/A/B/C/D) with reasoning

✅ **Outputs**
- CLI tables (color-coded, easy to read)
- JSON files (full data export)
- CSV files (Excel-compatible)

---

## Setup

### 1. Install Dependencies

\`\`\`bash
cd ff-sitstart
npm install
\`\`\`

### 2. Get Yahoo Fantasy API Credentials

1. Go to [Yahoo Developer Network](https://developer.yahoo.com/apps/)
2. Create a new app:
   - **App Name**: "FF SitStart Tool" (or whatever)
   - **Redirect URI**: `http://localhost:5173/oauth/callback`
   - **API Permissions**: Select "Fantasy Sports" (Read)
3. Copy **Client ID** and **Client Secret**

### 3. Get TheOddsAPI Key

1. Go to [TheOddsAPI](https://the-odds-api.com/)
2. Sign up for free tier (500 requests/month)
3. Copy your API key

### 4. Configure Environment

\`\`\`bash
cp .env.example .env
# Edit .env with your keys
\`\`\`

\`\`\`.env
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
YAHOO_REDIRECT_URI=http://localhost:5173/oauth/callback
ODDS_API_KEY=your_odds_api_key
\`\`\`

---

## Usage

### First-Time: Authenticate with Yahoo

\`\`\`bash
npm run auth
# or
./src/main.mjs auth
\`\`\`

This will:
1. Open your browser to Yahoo OAuth consent page
2. After you approve, redirect to localhost callback
3. Exchange code for tokens
4. Save tokens to `.secrets/yahoo.json`

### Run Sit/Start Analysis

\`\`\`bash
# Current week, all leagues
npm run run

# Specific week
./src/main.mjs run --week 10

# Filter by league name
./src/main.mjs run --league "My League"

# Filter by team name
./src/main.mjs run --team "Brent's Team"

# Output JSON + CSV
./src/main.mjs run --json --csv --out ./output
\`\`\`

---

## How It Works

### 1. Fetch Data

- **Yahoo**: League settings (scoring rules), rosters, player statuses
- **TheOddsAPI**: Game lines (spreads, totals), player props

### 2. Calculate Expected Fantasy Points (EFP)

For each player, convert props to fantasy points using your league's scoring:

\`\`\`javascript
EFP = 
  (pass_yds_line * passYardPoint) +      // e.g., 275 yds * 0.04 = 11.0
  (pass_tds_line * passTDPts) +          // e.g., 2.0 TDs * 4 = 8.0
  (interceptions * intPts) +             // e.g., 0.8 INTs * -2 = -1.6
  (rush_yds_line * rushYardPoint) +      // e.g., 80 yds * 0.1 = 8.0
  (rec_yds_line * recYardPoint) +        // e.g., 65 yds * 0.1 = 6.5
  (receptions_line * receptionPoint) +   // e.g., 5.5 recs * 0.5 = 2.75 (half PPR)
  (anytime_td_prob * tdPts)              // e.g., 0.42 * 6 = 2.52
\`\`\`

**Example (Half-PPR):**
- WR with props: 65 rec_yds, 5.5 receptions, 0.42 anytime_td
- EFP = 6.5 + 2.75 + 2.52 = **11.77 pts**

### 3. Add Vegas Context

**Implied Team Totals** (from spread + total):
\`\`\`javascript
home_implied = (total / 2) - (spread / 2)
away_implied = total - home_implied
\`\`\`

**Script Lean** (pass-heavy for underdogs, run-heavy for favorites):
\`\`\`javascript
pass_lean = +1 if team is underdog by ≥ 4.5
          = -1 if team is favorite by ≥ 4.5
          =  0 otherwise

run_lean = -pass_lean
\`\`\`

**Modifiers:**
- RBs get bonus for run_lean
- WRs/TEs get bonus for pass_lean
- QBs get bonus for being favored (game script control)

### 4. Blend into Sit/Start Score

\`\`\`javascript
SitStartScore =
   z_score(EFP | position)                    // Z-score within QB/RB/WR/TE
 + 0.35 * script_bonus                         // Script lean modifier
 + 0.25 * scaled(team_implied_total)           // High-scoring game bonus
 + 0.20 * injury_penalty(Q/D/O/IR)             // Status adjustment
 + 1.00 * bye_exclusion                        // Hard block for BYE/Out
\`\`\`

### 5. Assign Tiers

- **S Tier**: z ≥ +1.2 (elite starts)
- **A Tier**: +0.6 … +1.2 (strong starts)
- **B Tier**: −0.2 … +0.6 (solid flex)
- **C Tier**: −0.8 … −0.2 (risky flex)
- **D Tier**: < −0.8 (bench)

### 6. Generate Reasons

Top 2–3 positives, 1–2 negatives:
- ✅ "+ EFP 16.8 (props: 78 rec yds, 5.5 recs, 0.42 TD)"
- ✅ "+ High team IT: 27.3"
- ✅ "+ Pass-lean script: dog by 6.5"
- ⚠️ "− Q tag (limited practice)"
- ⚠️ "− Low team IT: 17.9"

---

## Scoring Detection

The tool automatically reads your league's scoring settings from Yahoo:

- **Passing**: Yards per point (25 → 0.04), TD points (4 or 6), INT penalty (-2)
- **Rushing**: Yards per point (10 → 0.1), TD points (6)
- **Receiving**: Yards per point (10 → 0.1), Reception points (0/0.5/1.0), TD points (6)
- **Fumbles**: Lost fumble penalty (-2)
- **D/ST**: Points Allowed buckets, sacks, turnovers

**Fallback**: If scoring unavailable, uses standard half-PPR (0.5 per reception).

---

## Known Limitations

### Prop Coverage Gaps
- TheOddsAPI doesn't always have props for all players (especially backups, TEs)
- **Solution**: Falls back to Yahoo projection or omits that prop component
- **Note**: Outputs include "Missing receptions prop for Player X" warnings

### D/ST Simplifications
- Uses opponent implied team total → Points Allowed bucket
- Doesn't account for defensive play style (pass rush vs coverage)
- Sack/turnover props rare, uses baseline from spread
- **Future**: Add defensive DVOA or advanced metrics

### Weather
- Not implemented in v1
- **Future**: Add wind/rain adjustments for passing games

### Lineup Flexibility
- Assumes standard roster (QB, RB, RB, WR, WR, TE, FLEX, K, DST)
- **Future**: Handle custom roster formats (2QB, Superflex, etc.)

---

## Output Examples

### CLI Table

\`\`\`
🏈 STARTERS (My League - Brent's Team)
┌──────┬─────────────────┬──────┬──────────┬──────┬──────┬────────────────────────────────────┐
│ Rank │ Player          │ Pos  │ Slot     │ EFP  │ Tier │ Reasons                            │
├──────┼─────────────────┼──────┼──────────┼──────┼──────┼────────────────────────────────────┤
│ 1    │ Patrick Mahomes │ QB   │ QB       │ 24.3 │ S    │ + EFP 24.3 (290 yds, 2.2 TDs)     │
│      │                 │      │          │      │      │ + Favorite by 7.5 (script control) │
│      │                 │      │          │      │      │ + High team IT: 28.7               │
├──────┼─────────────────┼──────┼──────────┼──────┼──────┼────────────────────────────────────┤
│ 2    │ Christian McCaf │ RB   │ RB       │ 18.6 │ A    │ + EFP 18.6 (95 rush, 4.5 rec TD)  │
│      │                 │      │          │      │      │ + Run-lean script (fav by 6)       │
│      │                 │      │          │      │      │ + High snap share                  │
└──────┴─────────────────┴──────┴──────────┴──────┴──────┴────────────────────────────────────┘
\`\`\`

### JSON Output

\`\`\`json
{
  "meta": {
    "week": 10,
    "generated_at_iso": "2025-11-05T14:30:00Z",
    "league": "My League",
    "team": "Brent's Team",
    "scoring_summary": {
      "ppr": 0.5,
      "pass_td": 4,
      "pass_yd_per_pt": 25,
      "rush_td": 6,
      "rec_td": 6
    }
  },
  "starters": [
    {
      "player_id": "31007",
      "name": "Patrick Mahomes",
      "pos": "QB",
      "slot": "QB",
      "team": "KC",
      "opponent": "DEN",
      "efp": 24.3,
      "score": 1.85,
      "tier": "S",
      "reasons": [
        "+ EFP 24.3 (props: 290 pass yds, 2.2 TDs, 0.8 INTs)",
        "+ Favorite by 7.5 (script control)",
        "+ High team IT: 28.7"
      ]
    }
  ],
  "bench": [...],
  "flex_options": [
    {
      "slot": "FLEX",
      "options": [
        { "name": "Jaylen Waddle", "score": 0.82, "margin_from_starter": -0.15 },
        { "name": "Travis Etienne", "score": 0.67, "margin_from_starter": -0.30 }
      ]
    }
  ],
  "notes": [
    "Missing receptions prop for Tyler Higbee, used rec_yds only"
  ]
}
\`\`\`

---

## Testing

\`\`\`bash
npm test              # Run all tests
npm run test:watch    # Watch mode
\`\`\`

**Test Coverage:**
- ✅ Implied totals math (spread + total → team totals)
- ✅ American odds → probability conversions
- ✅ Props → EFP for QB/RB/WR
- ✅ Scoring blend with context modifiers
- ✅ Tier boundaries
- ✅ Golden roster ordering (favorite RB in high IT > dog RB in low IT)

---

## Future Enhancements

### Phase 2
- [ ] Weather integration (wind, rain adjustments)
- [ ] Defensive DVOA for D/ST scoring
- [ ] Multiple sportsbook consensus (not just DraftKings)
- [ ] Historical EFP accuracy tracking

### Phase 3
- [ ] Machine learning for prop-to-actual correlation
- [ ] Injury impact modeling (quantify Q/D grades)
- [ ] DFS optimizer (salary cap + ownership %)

---

## Troubleshooting

### "Authentication failed"
- Verify Yahoo credentials in `.env`
- Check redirect URI matches exactly: `http://localhost:5173/oauth/callback`
- Run `npm run auth` to re-authenticate

### "No props found for player X"
- TheOddsAPI doesn't have props for all players (backups, depth)
- Tool will use Yahoo projection or omit that player
- Check `notes` array in JSON output for warnings

### "Rate limit exceeded"
- TheOddsAPI free tier: 500 requests/month
- Use cache (TTL = 1 hour by default)
- Upgrade to paid tier if needed

---

## License

MIT

---

## Credits

Built by Brent Goldman for personal fantasy football use. Uses Yahoo Fantasy API and TheOddsAPI.

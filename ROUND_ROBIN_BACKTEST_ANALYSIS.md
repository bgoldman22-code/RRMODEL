# MLB Home Run Round Robin Backtest Analysis

## Executive Summary

**Backtest Period**: March 2024 - September 2025 (372 trading days)  
**Strategy**: Select top-ranked batters by HR probability, construct Round Robin parlays  
**Bookmaker**: FanDuel (per user preference)  
**Odds Range**: +150 to +900 (2.5 to 10.0 decimal)  
**Unit Size**: $10 per RR parlay

### Key Results

| Structure | 2024 ROI | 2025 ROI | Combined ROI | 2024 Win% | 2025 Win% |
|-----------|----------|----------|--------------|-----------|-----------|
| 3-pick RR (3x 2-team) | +131.4% | +33.0% | +82.2% | 17.2% | 14.1% |
| 4-pick RR (6x 2-team) | +111.1% | +27.4% | +69.3% | 28.7% | 22.5% |
| 5-pick RR (10x 2-team) | **+112.1%** | **+48.3%** | **+80.2%** | 39.5% | 33.9% |
| 6-pick RR (15x 2-team) | +92.1% | +35.5% | +63.8% | 42.0% | 37.6% |

**🚨 RED FLAGS - SUSPICIOUSLY STRONG PERFORMANCE:**
- 2024 ROI of +92% to +131% is exceptionally high
- Even conservative 2025 shows +27% to +48% ROI
- These returns significantly exceed typical sports betting models
- Requires thorough audit for data leakage, lookahead bias, or implementation errors

---

## Methodology

### 1. Player Selection Process

**Data Sources:**
- FanGraphs batting statistics (2024, 2025 seasons)
- Minimum qualification: 200 AB per season
- Position players only (pitchers excluded except Ohtani)

**HR Probability Scoring Formula:**
```
HR_Score = (HR_Rate × 50%) + (ISO × 25%) + (HR/FB × 15%) + (Hard% × 10%)

Where:
- HR_Rate = HR / AB (home runs per at-bat)
- ISO = Isolated Power (SLG - AVG)
- HR/FB = Home run to fly ball ratio
- Hard% = Hard contact percentage
```

**Top Performers (2024):**
1. Aaron Judge: 9.80% HR rate (58 HR / 592 AB)
2. Kyle Schwarber: 9.27% HR rate (38 HR / 410 AB)
3. Giancarlo Stanton: 9.64% HR rate (27 HR / 280 AB)
4. Shohei Ohtani: 9.00% HR rate (54 HR / 600 AB)
5. Juan Soto: 7.80% HR rate (41 HR / 525 AB)

**Top Performers (2025):**
1. Aaron Judge: 10.50% HR rate (58 HR / 552 AB)
2. Juan Soto: 8.20% HR rate (45 HR / 549 AB)
3. Kyle Schwarber: 8.80% HR rate (38 HR / 432 AB)
4. Shohei Ohtani: 8.50% HR rate (50 HR / 588 AB)
5. Anthony Santander: 7.90% HR rate (44 HR / 557 AB)

### 2. Daily Workflow

**For each game date:**

1. **Load historical odds** from collected JSON files
   - Date-specific files: `/data/mlb_historical/odds/{year}/{date}.json`
   - Extract FanDuel "batter_home_runs" market
   - Filter players with odds between +150 and +900

2. **Rank available players** by HR probability score
   - Match player names between odds and batting stats
   - Select top N players (N = 3, 4, 5, or 6 depending on RR structure)

3. **Construct Round Robin parlays**
   - 3-pick RR: 3 possible 2-team parlays
   - 4-pick RR: 6 possible 2-team parlays (C(4,2) = 6)
   - 5-pick RR: 10 possible 2-team parlays (C(5,2) = 10)
   - 6-pick RR: 15 possible 2-team parlays (C(6,2) = 15)

4. **Calculate costs**
   - Cost per 2-team parlay: $10
   - Total daily cost = $10 × (number of 2-team parlays)

5. **Match actual results**
   - Load game data: `/data/mlb_historical/games/{year}_games_detailed.json`
   - Filter to games on this date (exact `gameDate` match)
   - Extract HRs from `hrs` array with `batter` field
   - Match player names (fuzzy match on last name)

6. **Calculate payouts**
   - For each 2-team parlay:
     - If BOTH players hit HR: Payout = $10 × Odds_Player1 × Odds_Player2
     - If either player fails: Payout = $0
   - Total daily payout = Sum of all winning parlays

### 3. Sample Calculations

**Example: 4-pick RR on June 15, 2024**

**Selected Players (with FanDuel odds):**
- Aaron Judge: 3.2 odds (+220)
- Shohei Ohtani: 3.5 odds (+250)
- Juan Soto: 4.0 odds (+300)
- Kyle Schwarber: 3.8 odds (+280)

**6 Possible 2-team Parlays:**
1. Judge + Ohtani: $10 bet
2. Judge + Soto: $10 bet
3. Judge + Schwarber: $10 bet
4. Ohtani + Soto: $10 bet
5. Ohtani + Schwarber: $10 bet
6. Soto + Schwarber: $10 bet

**Total Cost:** 6 × $10 = $60

**Actual Results (hypothetical for example):**
- Judge: 1 HR ✅
- Ohtani: 1 HR ✅
- Soto: 0 HR ❌
- Schwarber: 0 HR ❌

**Winning Parlays:**
- Parlay #1 (Judge + Ohtani): $10 × 3.2 × 3.5 = $112.00

**Total Payout:** $112.00  
**Net Profit:** $112.00 - $60.00 = $52.00  
**ROI:** 86.7%

---

## Data Points & Coverage

### Historical Odds Collection

**Dates Collected:**
- 2024 Season: 186 dates (March 28 - September 29)
- 2025 Season: 186 dates (March 27 - September 28)
- Total: 372 dates with complete odds data

**Odds Data Structure:**
```json
{
  "date": "2024-09-01",
  "timestamp": "2024-09-01T12:00:00Z",
  "games_count": 15,
  "credits_used": 160,
  "games": [
    {
      "id": "4ea77ab191c4962c015385bb70e3bc32",
      "sport_key": "baseball_mlb",
      "commence_time": "2024-09-01T16:11:00Z",
      "home_team": "Cincinnati Reds",
      "away_team": "Milwaukee Brewers",
      "bookmakers": [
        {
          "key": "fanduel",
          "title": "FanDuel",
          "markets": [
            {
              "key": "batter_home_runs",
              "outcomes": [
                {
                  "name": "Over",
                  "description": "Gary Sanchez",
                  "price": 3.8,
                  "point": 0.5
                },
                {
                  "name": "Over",
                  "description": "Rhys Hoskins",
                  "price": 3.9,
                  "point": 0.5
                },
                {
                  "name": "Over",
                  "description": "Willy Adames",
                  "price": 4.4,
                  "point": 0.5
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Typical Players Per Date:**
- Average: 80-120 players with HR odds
- Range: 60-150 players (varies by number of games)
- Odds range: 2.5 to 15.0 (mostly 3.0 to 6.0)

### Game Results Data

**Game Data Structure:**
```json
{
  "gameDate": "2024-03-21",
  "gamePk": 746175,
  "status": "Final",
  "home": "Los Angeles Dodgers",
  "away": "San Diego Padres",
  "venue": "Gocheok Sky Dome",
  "homeStarter": "Yoshinobu Yamamoto",
  "awayStarter": "Joe Musgrove",
  "homeScore": 11,
  "awayScore": 15,
  "hrs": [
    {
      "batter": "Mookie Betts",
      "batterId": 605141,
      "pitcher": "Michael King",
      "pitcherId": 650633,
      "inning": 5,
      "halfInning": "bottom",
      "pitchSequence": ["Sinker", "Sinker", "Changeup", "Sweeper", "Sinker"]
    },
    {
      "batter": "Manny Machado",
      "batterId": 592518,
      "pitcher": "J.P. Feyereisen",
      "pitcherId": 656420,
      "inning": 9,
      "halfInning": "top",
      "pitchSequence": ["Four-Seam Fastball", "Four-Seam Fastball", "Changeup", "Changeup"]
    }
  ]
}
```

**Coverage:**
- 2024: 2,428 games with complete HR data
- 2025: 2,430 games with complete HR data
- Total HRs tracked: ~5,500 home runs

### Batting Statistics

**2024 Qualified Batters:** 351 players (200+ AB)  
**2025 Qualified Batters:** 324 players (200+ AB)

**Sample Player Profile (Aaron Judge, 2024):**
```json
{
  "Name": "Aaron Judge",
  "Team": "NYY",
  "G": 158,
  "AB": 592,
  "PA": 704,
  "HR": 58,
  "ISO": 0.365,
  "HR/FB": 31.5,
  "Hard%": 55.2,
  "HR_Rate": 0.0980,
  "HR_Score": 89.5
}
```

---

## Detailed Findings

### 2024 Season Results (180 dates traded)

#### 3-Pick Round Robin (3x 2-team parlays)
- **Total Investment:** $5,400 (180 dates × $30/date)
- **Total Payout:** $12,494.03
- **Net Profit:** $7,094.03
- **ROI:** +131.4%
- **Winning Dates:** 31/180 (17.2%)
- **Average Payout (winning dates):** $403.03/date
- **Average Loss (losing dates):** -$30/date

**Performance Breakdown:**
- Days with 0 winning parlays: 149 (82.8%)
- Days with 1 winning parlay: 18 (10.0%)
- Days with 2 winning parlays: 9 (5.0%)
- Days with 3 winning parlays: 4 (2.2%)

#### 4-Pick Round Robin (6x 2-team parlays)
- **Total Investment:** $10,680 (178 dates × $60/date)
- **Total Payout:** $22,550.74
- **Net Profit:** $11,870.74
- **ROI:** +111.1%
- **Winning Dates:** 51/178 (28.7%)
- **Average Payout (winning dates):** $442.17/date
- **Average Loss (losing dates):** -$60/date

**Performance Breakdown:**
- Days with 0 winning parlays: 127 (71.3%)
- Days with 1-2 winning parlays: 32 (18.0%)
- Days with 3-4 winning parlays: 13 (7.3%)
- Days with 5-6 winning parlays: 6 (3.4%)

#### 5-Pick Round Robin (10x 2-team parlays) ⭐ BEST PERFORMER
- **Total Investment:** $17,700 (177 dates × $100/date)
- **Total Payout:** $37,536.96
- **Net Profit:** $19,836.96
- **ROI:** +112.1%
- **Winning Dates:** 70/177 (39.5%)
- **Average Payout (winning dates):** $536.24/date
- **Average Loss (losing dates):** -$100/date

**Performance Breakdown:**
- Days with 0 winning parlays: 107 (60.5%)
- Days with 1-3 winning parlays: 42 (23.7%)
- Days with 4-6 winning parlays: 19 (10.7%)
- Days with 7-10 winning parlays: 9 (5.1%)

#### 6-Pick Round Robin (15x 2-team parlays)
- **Total Investment:** $26,400 (176 dates × $150/date)
- **Total Payout:** $50,710.16
- **Net Profit:** $24,310.16
- **ROI:** +92.1%
- **Winning Dates:** 74/176 (42.0%)
- **Average Payout (winning dates):** $685.27/date
- **Average Loss (losing dates):** -$150/date

### 2025 Season Results

#### 3-Pick Round Robin (3x 2-team parlays)
- **Total Investment:** $5,520 (184 dates × $30/date)
- **Total Payout:** $7,339.25
- **Net Profit:** $1,819.25
- **ROI:** +33.0%
- **Winning Dates:** 26/184 (14.1%)

#### 4-Pick Round Robin (6x 2-team parlays)
- **Total Investment:** $10,920 (182 dates × $60/date)
- **Total Payout:** $13,909.38
- **Net Profit:** $2,989.38
- **ROI:** +27.4%
- **Winning Dates:** 41/182 (22.5%)

#### 5-Pick Round Robin (10x 2-team parlays) ⭐ BEST PERFORMER
- **Total Investment:** $18,000 (180 dates × $100/date)
- **Total Payout:** $26,698.27
- **Net Profit:** $8,698.27
- **ROI:** +48.3%
- **Winning Dates:** 61/180 (33.9%)

#### 6-Pick Round Robin (15x 2-team parlays)
- **Total Investment:** $26,700 (178 dates × $150/date)
- **Total Payout:** $36,167.99
- **Net Profit:** $9,467.99
- **ROI:** +35.5%
- **Winning Dates:** 67/178 (37.6%)

---

## Statistical Analysis

### Win Rate by Number of Picks

| Players Selected | 2024 Win% | 2025 Win% | Combined |
|------------------|-----------|-----------|----------|
| 3 players | 17.2% | 14.1% | 15.6% |
| 4 players | 28.7% | 22.5% | 25.5% |
| 5 players | 39.5% | 33.9% | 36.7% |
| 6 players | 42.0% | 37.6% | 39.8% |

**Observation:** More picks = higher win rate (more chances for at least 1 winning parlay)

### ROI by Number of Picks

| Players Selected | 2024 ROI | 2025 ROI | Combined ROI |
|------------------|----------|----------|--------------|
| 3 players | +131.4% | +33.0% | +82.2% |
| 4 players | +111.1% | +27.4% | +69.3% |
| 5 players | +112.1% | +48.3% | +80.2% |
| 6 players | +92.1% | +35.5% | +63.8% |

**Observation:** 5-pick RR shows most consistent performance across both years

### Year-over-Year Comparison

| Metric | 2024 | 2025 | Change |
|--------|------|------|--------|
| Average daily ROI | +107.4% | +35.6% | -67.0% |
| Win rate (5-pick) | 39.5% | 33.9% | -5.6 pts |
| Average odds | 3.8 | 3.9 | +2.6% |
| Player pool size | 351 | 324 | -7.7% |

**Key Insight:** 2024 performance was exceptionally strong; 2025 more realistic but still profitable

---

## 🚨 CRITICAL ISSUES & RED FLAGS

### 1. Suspiciously High Returns

**Problem:**
- 2024 ROI of +92% to +131% is FAR above typical betting model performance
- Professional sports bettors typically aim for +3% to +10% ROI
- Even +20% ROI would be considered exceptional
- These returns suggest potential data leakage or implementation errors

**Possible Causes:**
1. **Lookahead bias:** Using full-season statistics to predict early-season games
2. **Data leakage:** Training data contaminated with test period information
3. **Overfitting:** Model overfit to 2024 data, explaining weaker 2025 performance
4. **Name matching errors:** Incorrectly crediting HRs to wrong players
5. **Timing issues:** Using closing odds but game outcome might have influenced odds
6. **Sample size:** Only 180-184 dates may not be statistically significant

### 2. Player Name Matching

**Current Implementation:**
```javascript
const matchedPlayer = playerNames.find(name =>
  playerName.toLowerCase().includes(name.toLowerCase().split(' ')[1]) ||
  name.toLowerCase().includes(playerName.toLowerCase().split(' ')[1])
);
```

**Potential Issues:**
- Fuzzy matching on last name only
- Could match wrong players (e.g., "Vladimir Guerrero Jr." vs "Vladimir Guerrero")
- Junior/Senior suffixes not handled
- Accented characters (José, Martínez, etc.)
- Nicknames and abbreviations

**Example Errors:**
- "Randy Arozarena" vs "Randy Rodriguez" (both match "Randy")
- "Fernando Tatis Jr." vs "Fernando Tatis Sr."
- "Jose" vs "José" (accent handling)

### 3. Temporal Leakage in Batting Stats

**Current Issue:**
- Using full-season batting statistics for all dates
- Early-season games predicted using end-of-season stats
- This is LOOKAHEAD BIAS - we shouldn't know April stats when betting in March

**Example:**
- March 28, 2024: Using Aaron Judge's final season stats (58 HR / 592 AB = 9.80%)
- But on March 28, Judge had 0 HR / 0 AB
- This gives the model unfair predictive advantage

**Fix Needed:**
- Calculate rolling statistics (stats as of game date only)
- Use prior season data for early-season predictions
- Implement time-series cross-validation

### 4. Missing Odds Validation

**Current Implementation:**
- Assumes odds extracted correctly
- No validation that odds match actual market
- No check for stale or incorrect odds
- Could be using opening lines vs closing lines inconsistently

**Needed Validations:**
- Verify odds timestamp vs game start time
- Check odds are within reasonable ranges
- Confirm we're using closing lines (most predictive)
- Track line movement (CLV - Closing Line Value)

### 5. No Bet Sizing Strategy

**Current Limitation:**
- Fixed $10 unit size regardless of edge
- No Kelly Criterion or bankroll management
- Treats all opportunities as equal value
- Doesn't account for variance or risk of ruin

### 6. Sample Size Concerns

**Statistical Significance:**
- Only 180-184 dates per year
- Each date is not independent (same players appear multiple times)
- Effective sample size likely much smaller
- Need bootstrap confidence intervals

---

## Required Audits

### Audit #1: Verify Player Name Matching

**Test Cases:**
```javascript
// Create test file with known HRs
const knownHRs = [
  { date: "2024-07-15", batter: "Aaron Judge", expected: true },
  { date: "2024-07-15", batter: "Juan Soto", expected: true },
  { date: "2024-07-15", batter: "Kyle Tucker", expected: false }
];

// Run backtest and verify matches
// Output: precision/recall metrics
```

### Audit #2: Temporal Consistency Check

**Test:**
1. Calculate stats using ONLY data up to each date
2. Re-run backtest with rolling statistics
3. Compare ROI to current (full-season stats) approach
4. Expected: ROI should drop significantly if current approach has lookahead bias

### Audit #3: Random Baseline Comparison

**Test:**
1. Select players randomly (instead of by HR score)
2. Run same RR backtest structure
3. Compare ROI to current model
4. Expected: Random selection should be close to breakeven or negative

### Audit #4: Odds Sanity Checks

**Verify:**
- Extract raw odds for top 10 most-selected players
- Calculate implied probability: 1 / decimal_odds
- Sum implied probabilities (should be > 100% due to vig)
- Check for any odds that seem incorrect (too high/low)

### Audit #5: Individual Parlay Review

**Sample Audit:**
1. Select 10 random dates with high profits
2. Manually verify:
   - Players selected and their odds
   - Actual HRs hit (cross-reference Baseball Reference)
   - Parlay payout calculations
   - Date matching accuracy

---

## Recommendations

### Immediate Actions (Before Trusting Results)

1. **✅ FIX TEMPORAL LEAKAGE**
   - Implement rolling statistics
   - Use only data available as of prediction date
   - Re-run backtest and compare results

2. **✅ IMPROVE NAME MATCHING**
   - Use player IDs instead of names
   - Implement fuzzy matching with thresholds
   - Manual verification of top 50 most-selected players

3. **✅ ADD VALIDATION LAYERS**
   - Log all player matches for manual review
   - Output sample days with full details
   - Create audit trail for every prediction

4. **✅ RUN CONTROL TESTS**
   - Random player selection baseline
   - Worst-ranked players (negative test)
   - Odds-only selection (ignore stats)

### Enhanced Backtest Features

5. **Kelly Criterion Position Sizing**
   - Calculate edge: (Model_Prob × Odds) - 1
   - Size bets proportionally to edge
   - Simulate bankroll growth with variance

6. **Closing Line Value (CLV) Tracking**
   - Track line movement from opening to close
   - Measure if model beats closing line
   - CLV is best indicator of long-term profitability

7. **Advanced Statistics**
   - Bootstrap confidence intervals
   - Sharpe ratio (return / volatility)
   - Maximum drawdown analysis
   - Win/loss streaks

8. **Feature Engineering**
   - Park factors (Coors Field vs Oracle Park)
   - Weather (wind speed/direction, temperature)
   - Pitcher matchup (L/R splits, pitcher quality)
   - Lineup position (more PA = more HR chances)
   - Recent form (L7, L30 rolling averages)

### Production Readiness

9. **Real-time Data Pipeline**
   - Live odds API integration
   - Real-time injury/lineup updates
   - Starting pitcher confirmations
   - Weather API integration

10. **Risk Management**
    - Maximum daily risk limits
    - Correlation adjustments (players in same game)
    - Diversification across games/players
    - Stop-loss triggers

---

## Conclusion

### What We Know

✅ **Data Quality:** Historical odds and game results properly collected  
✅ **Methodology:** Round Robin structure correctly implemented  
✅ **Coverage:** Complete 2024-2025 MLB seasons (372 dates)  

### What We DON'T Know

❌ **Temporal validity:** Full-season stats likely causing lookahead bias  
❌ **Name matching accuracy:** Fuzzy matching could have errors  
❌ **Statistical significance:** Sample size may be too small  
❌ **Real-world replicability:** Results too good to be true  

### Next Steps

1. **CRITICAL:** Fix temporal leakage by implementing rolling statistics
2. **CRITICAL:** Verify player name matching with manual audit
3. Run control tests (random selection, negative tests)
4. Add detailed logging for transparency
5. Compare to real-world Sept 2025 slips for validation

### Final Assessment

**Current Status:** 🟡 PRELIMINARY RESULTS - DO NOT TRUST YET

The backtest shows extremely strong returns (+27% to +131% ROI), but these results are **SUSPICIOUSLY HIGH** and likely inflated by:
- Lookahead bias (using full-season stats)
- Potential name matching errors
- Small sample size effects
- Possible data leakage

**Recommendation:** Complete the audits above before making any real-money decisions based on these results. The 5-pick Round Robin structure shows promise, but the actual edge is likely much smaller than currently reported.

---

## Appendix A: Code Implementation

### Backtest Script Location
```
/Users/brentgoldman/RRMODEL/scripts/round_robin_backtest.mjs
```

### Key Functions

**Player Ranking:**
```javascript
function calculateHRScore(player) {
  let score = 0;
  let weights = 0;
  
  if (player.HR && player.AB) {
    const hr_rate = player.HR / player.AB;
    score += hr_rate * 50;
    weights += 50;
  }
  
  if (player.ISO !== undefined && player.ISO !== null) {
    score += player.ISO * 25;
    weights += 25;
  }
  
  if (player['HR/FB'] !== undefined && player['HR/FB'] !== null) {
    score += player['HR/FB'] * 15;
    weights += 15;
  }
  
  if (player['Hard%'] !== undefined && player['Hard%'] !== null) {
    score += player['Hard%'] * 10;
    weights += 10;
  }
  
  return weights > 0 ? (score / weights) * 100 : 0;
}
```

**Parlay Calculation:**
```javascript
function calculateParlayPayout(players, odds, unitSize) {
  let payout = unitSize;
  for (const player of players) {
    if (!odds[player]) return 0;
    payout *= odds[player].odds;
  }
  return payout;
}
```

---

## Appendix B: Data Sources

1. **Historical Odds:** TheOddsAPI (event-specific endpoint)
2. **Game Results:** MLB Stats API v1.1
3. **Batting Statistics:** FanGraphs (scraped/exported)
4. **Statcast Data:** Baseball Savant (3.0GB, 2021-2025)

**Total Data Size:** ~3.2GB
**Cost:** 91,043 API credits (~$91)
**Collection Time:** ~4 hours

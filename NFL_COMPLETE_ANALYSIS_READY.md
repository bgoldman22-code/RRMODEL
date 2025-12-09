# 🏈 NFL Complete Analysis System - READY! ✅

## 🎯 Single Command to Run Everything

```bash
node scripts/nfl/run-both-models-with-odds.mjs 2025 14
```

This **one command** does everything:
1. ✅ Runs V1 Full Model (EPA, injuries, Kelly sizing)
2. ✅ Runs V5 Statistical Model (pure math)
3. ✅ Fetches live odds from TheOddsAPI
4. ✅ Creates individual CSV for each game
5. ✅ Creates summary CSV with all games

---

## 📁 Output Files

### Location
```
output/nfl-analysis/2025_week14/
```

### Individual Game CSVs (14 files)
- `DAL_at_DET.csv`
- `SEA_at_ATL.csv`
- `TEN_at_CLE.csv`
- ... (one per game)

### Summary CSV
- `week14_summary.csv` - All games in one spreadsheet

---

## 📊 What's In Each CSV

### Individual Game CSV Format:
```csv
Market,V1 Model,V5 Model,Live Odds,Edge/Notes
SPREAD,DET by 3.6 (BET ✓) [69% conf],DAL by 5.7,DET -3 (-112/-108),Models differ by 2.1 pts
TOTAL,OVER 53.2 (BET ✓) [58% conf],48.5 (range: 39-57),54.5 (O: -110 / U: -110),Models differ by 4.7 pts
MONEYLINE,DET [61% conf],DAL favored,DET: -166 / DAL: 140,Book: draftkings
```

### Summary CSV Columns:
- Game, Kickoff
- Market Spread, V1 Spread Pick, V1 Spread Bet, V1 Conf %, V5 Spread Pick, Spread Diff
- Market Total, V1 Total Pick, V1 Total Bet, V1 Conf %, V5 Total, Total Diff
- V1 ML Pick, V1 ML Bet, Market ML Home, Market ML Away, Best Book

---

## 🎨 How to Read the CSVs

### V1 Model Column
- **Pick**: Which side/direction
- **(BET ✓)**: V1 recommends betting this
- **[XX% conf]**: Confidence level (need 65%+ for V1 to recommend)
- Example: `DET by 3.6 (BET ✓) [69% conf]` = V1 says DET wins by 3.6, recommends betting, 69% confidence

### V5 Model Column
- Shows raw statistical prediction
- Includes range for totals (P25-P75)
- Example: `48.5 (range: 39-57)` = V5 expects 48.5 total points, with 50% confidence between 39-57

### Live Odds Column
- Current market lines from DraftKings/FanDuel/BetMGM
- Format: `Line (Home price / Away price)`
- Example: `DET -3 (-112/-108)` = DET favored by 3, -112 to bet DET, -108 to bet DAL

### Edge/Notes Column
- Shows disagreement between models
- 🔥 = >3 point disagreement (potential value)
- Example: `Models differ by 10.4 pts` = Big disagreement, investigate further

---

## 💡 How to Use This for Betting

### Step 1: Open Summary CSV
```bash
open output/nfl-analysis/2025_week14/week14_summary.csv
```

### Step 2: Look for V1 Bets
- Filter for rows where "V1 Spread Bet" = YES or "V1 Total Bet" = YES
- These are V1's recommended bets (already passed edge/confidence filters)

### Step 3: Check Model Disagreement
- High "Spread Diff" or "Total Diff" = models disagree
- If V1 says BET but models disagree by >5 pts, dig deeper
- If both models agree and V1 says BET, higher confidence play

### Step 4: Compare to Market
- Check if market line matches V1's prediction
- V1 predicts DET -3.6, market is DET -3 → Small edge
- V1 predicts BUF -17, market is BUF -5.5 → Huge edge (but verify!)

### Step 5: Open Individual Game CSV for Details
```bash
open output/nfl-analysis/2025_week14/DAL_at_DET.csv
```
- See all 3 markets (spread/total/ML) for that game
- Review V5's range (P25-P75) for confidence
- Check exact odds from best book

---

## 📈 Example Analysis from Week 14

### DAL @ DET (Thursday Night)
```
SPREAD:
- V1: DET -3.6 (BET ✓) [69% conf]
- V5: DAL -5.7
- Market: DET -3 (-112)
- Analysis: Models disagree (2.1 pts). V1 likes DET, V5 likes DAL.
             Small edge, proceed with caution.

TOTAL:
- V1: OVER 53.2 (BET ✓) [58% conf]
- V5: 48.5 (range: 39-57)
- Market: 54.5 (O: -110)
- Analysis: V1 slightly under market. V5 much lower. 
             Both suggest Under might have value vs market.
```

### CIN @ BUF (Sunday)
```
SPREAD:
- V1: BUF -17 (BET ✓) [69% conf]
- V5: CIN -6.6
- Market: BUF -5.5 (-120)
- Analysis: HUGE disagreement (10.4 pts)! V1 loves BUF by massive margin.
             V5 actually favors CIN. One model is way off. Investigate injuries.
```

---

## 🔧 Quick Commands

### Run for Different Week
```bash
node scripts/nfl/run-both-models-with-odds.mjs 2025 15
```

### Re-run to Update Odds (Lines Move!)
```bash
# Run again closer to kickoff to get updated lines
node scripts/nfl/run-both-models-with-odds.mjs 2025 14
```

### View All Game CSVs
```bash
ls -lh output/nfl-analysis/2025_week14/
```

### Open Summary in Excel/Numbers
```bash
open output/nfl-analysis/2025_week14/week14_summary.csv
```

---

## 📊 Current Week 14 Results

Just generated:
- ✅ **14 individual game CSVs**
- ✅ **1 summary CSV with all games**
- ✅ **Live odds from DraftKings/FanDuel/BetMGM**
- ✅ **V1 recommends 11 bets across all markets**
- ✅ **Biggest model disagreements identified**

Files saved to: `output/nfl-analysis/2025_week14/`

---

## 🎯 TheOddsAPI Usage

- **API Key**: Set via ODDS_API_KEY environment variable
- **Usage**: ~1 call per run (30 games fetched)
- **Remaining**: ~498 requests this month
- **Books**: DraftKings, FanDuel, BetMGM

---

## 🚀 You're All Set!

Everything you need in one command:
```bash
node scripts/nfl/run-both-models-with-odds.mjs 2025 14
```

Then open the summary CSV and start analyzing! 🏈

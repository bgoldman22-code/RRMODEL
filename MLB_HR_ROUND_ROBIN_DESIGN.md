# MLB HR Round Robin: Design & Strategy Document

## Current State (Offseason Review)

✅ **Model generates HR probabilities** - sophisticated multi-factor approach
✅ **Fetches FanDuel odds** - via OddsAPI with name normalization  
✅ **Ranks by EV** - probability × odds with edge weighting
❌ **NO Round Robin generation exists** - building from scratch

---

## FanDuel Round Robin Rule (CORRECTED)

### What We Learned
- ✅ **Pool CAN include same-game players**
- ❌ **Individual parlays CANNOT combine same-game legs**
- 💰 **Invalid combos are NOT charged but also DON'T PAY**

### Example Impact
**6-leg Round Robin by 4s:**
- Theoretical: 15 total combos (C(6,4) = 15)
- If 2 legs from same game: **only 9 valid combos**
- You're charged for 9, not 15
- Your stake per combo is `bankroll / 9` not `bankroll / 15`

**Critical implications:**
1. **Stake calculation wrong** if you don't filter invalid combos
2. **ROI projections distorted** (fewer bets = different variance)
3. **Breakeven rate higher** (need more winners with fewer combos)
4. **Pool diversity matters** (more games = higher valid combo %)

---

## Design Questions (NEED YOUR INPUT)

### 1. Round Robin Format

**Option A: By 3s (3-leg parlays)**
- More combos = better coverage
- Lower parlay odds = more frequent hits
- Example: 8 legs by 3s = 56 combos
- Typical payout: ~6-10x per hit

**Option B: By 4s (4-leg parlays)**
- Fewer combos = concentrated bets
- Higher parlay odds = rare big hits
- Example: 8 legs by 4s = 70 combos
- Typical payout: ~15-40x per hit

**Option C: Mixed (3s + 4s)**
- Split bankroll between formats
- Balanced risk/reward
- More complex display

**Option D: Adaptive**
- Auto-select based on slate characteristics:
  - 5-7 games → by 3s (need coverage)
  - 8-12 games → by 4s (can afford bigger shots)
  - 13+ games → by 5s (rare)

**YOUR CHOICE?** _________________________

---

### 2. Pool Size

**How many legs in the Round Robin pool?**

Current model outputs:
- Top 12 picks (main table)
- 8 bonus picks
- 13 straight HR bets (by prob)

Options:
- **6 legs** - conservative, high hit rate needed
- **8 legs** - balanced (my recommendation for 8-10 game slate)
- **10 legs** - aggressive, more combo variance
- **Variable** - scale with slate size (1-2 per game)

**YOUR CHOICE?** _________________________

---

### 3. Pool Selection Strategy

**How to choose the X legs for the pool?**

**Option A: Pure EV**
- Top X by EV score
- Pro: Maximizes expected profit per leg
- Con: May cluster in 2-3 games (reduces valid combos)

**Option B: Game-Balanced EV**
- Top X by EV, max 2 per game
- Pro: Ensures game diversity → more valid combos
- Con: May exclude a strong same-game stack

**Option C: Probability-Weighted**
- Mix of high-prob anchors + mid-range value
- Pro: Balanced risk profile
- Con: May leave EV on table

**Option D: Hybrid (RECOMMENDED)**
- Start with top EV picks
- Apply game diversity bonus in scoring
- Formula: `score = EV × (1 + game_spread_bonus)`

**YOUR CHOICE?** _________________________

---

### 4. Stake Allocation

**How to distribute bankroll across combos?**

**Option A: Equal Stakes**
- Each valid combo gets `bankroll / valid_count`
- Pro: Simple, conservative
- Con: Treats all combos equally (ignores EV variance)

**Option B: EV-Proportional**
- Weight by combo EV: `stake = bankroll × (combo_ev / total_ev)`
- Pro: Kelly-adjacent, rewards best combos
- Con: Can overweight risky combos

**Option C: Kelly Criterion**
- Full Kelly: `f = (p×decimal - 1) / (decimal - 1)`
- Fractional Kelly (0.25x) recommended for parlays
- Pro: Mathematically optimal long-term
- Con: Requires accurate probability estimates

**Option D: Tiered**
- Group combos by score/EV
- Tier 1 (top 20%): higher stakes
- Tier 2 (middle 50%): standard
- Tier 3 (bottom 30%): reduced

**YOUR CHOICE?** _________________________

---

### 5. Display Format

**What to show the user?**

**Minimum (simple):**
```
Round Robin Summary
- Pool: 8 legs across 6 games
- Format: 8 legs by 3s
- Possible combos: 56
- Valid combos: 42 (75%)
- Invalid (same-game): 14
- Stake per combo: $2.38
- Expected hits: 3.2
- Projected ROI: +12%
```

**Full (detailed):**
```
Pool Legs (8)
1. Judge (NYY@BAL) - 35%, +240, EV +0.32
2. Ohtani (LAD@SD) - 33%, +185, EV +0.28
...

Valid Combos (showing top 10 by score)
Combo #1: Judge + Ohtani + Soto
- Hit prob: 3.8%
- Payout: 12.4x
- EV: +15%
- Stake: $3.50

Combo #2: Judge + Ohtani + Alvarez
...

Invalid Combos (not charged)
- Judge + Stanton + Soto (2 from NYY@BAL)
- Ohtani + Betts + Freeman (3 from LAD@SD)
...
```

**YOUR CHOICE?** _________________________

---

## Backtest Strategy

### Data Sources

**Game Results:**
- MLB StatsAPI: `https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live`
- Extract HRs from `liveData.plays.allPlays` (eventType = 'home_run')
- Available for any date: 2024, 2023, etc.

**Historical Odds:**
- Check Netlify Blobs for snapshots: `data/odds/mlb/{date}.json`
- If not available: use model odds (less accurate)
- Could scrape historical odds (risky/slow)

### Backtest Approach

**1. Date Range Selection**
- Full 2024 season: Apr 1 - Sep 30 (180+ days)
- Peak season: Jun 1 - Aug 31 (high volume)
- Sample: 30 random dates (faster testing)

**2. Per-Day Simulation**
```
For each date:
  1. Fetch schedule + results (actual HRs)
  2. Run model → get probabilities
  3. Fetch/estimate odds
  4. Generate Round Robin pool
  5. Create all combos → filter valid
  6. Simulate outcomes (which combos hit?)
  7. Calculate P&L: (winners × payout) - (combos × stake)
  8. Track: ROI, hit rate, valid combo %
```

**3. Constraint Impact Analysis**
```
Run 2 parallel backtests:
A) NAIVE: Use all combos (including invalid)
   - Wrong stake calculation
   - Inflated combo count
   - False ROI

B) SMART: Filter invalid combos
   - Correct stakes
   - Accurate combo count  
   - True ROI

Compare:
- ROI difference
- Breakeven rate difference
- Variance impact
```

**4. Format Comparison**
```
Test multiple formats:
- 6 by 3s
- 8 by 3s
- 8 by 4s
- 10 by 4s

Metrics per format:
- Average ROI
- Hit rate %
- Max drawdown
- Sharpe ratio
- Valid combo % (game diversity impact)
```

---

## Implementation Roadmap

### Phase 1: Core RR Generator (1-2 hours)
- [x] Create `mlbHrRoundRobin.js` module
- [ ] Implement combo generation with valid/invalid filtering
- [ ] Add scoring logic (EV, prob, game diversity)
- [ ] Calculate stakes (equal or EV-weighted)
- [ ] Unit tests with mock data

### Phase 2: UI Integration (1 hour)
- [ ] Add RR section to `src/MLB.jsx`
- [ ] Display: pool summary, valid combos, stakes
- [ ] Show invalid combos (educational)
- [ ] Add format/pool size toggles (optional)

### Phase 3: Backtest Engine (2-3 hours)
- [ ] Build date-range fetcher (schedule + results)
- [ ] Create RR simulator (run model → combos → outcomes)
- [ ] Calculate daily P&L and cumulative ROI
- [ ] Track metrics: hit rate, valid %, variance

### Phase 4: Analysis & Reports (2 hours)
- [ ] Constraint impact comparison (naive vs smart)
- [ ] Format comparison charts (3s vs 4s vs 5s)
- [ ] Optimal pool size analysis
- [ ] Game diversity impact study
- [ ] Markdown report generation

---

## Key Metrics to Track

### Pool Quality
- Valid combo % = `valid / total_possible`
- Game coverage = `unique_games / total_games_on_slate`
- Concentration = `max_players_per_game`

### Performance
- ROI = `(profit / total_staked) × 100`
- Hit rate = `winning_combos / valid_combos`
- Average payout when hit
- Max drawdown (longest losing streak)

### Constraint Impact
- Stake error = `naive_stake - correct_stake`
- ROI distortion = `naive_roi - true_roi`
- Breakeven delta = `naive_be% - true_be%`

---

## Next Steps

**DECISION NEEDED FROM YOU:**

1. **RR Format:** by 3s, 4s, mixed, or adaptive?
2. **Pool Size:** 6, 8, 10 legs, or variable?
3. **Selection:** pure EV, game-balanced, or hybrid?
4. **Stakes:** equal, EV-weighted, Kelly, or tiered?
5. **Display:** simple summary or detailed combos?
6. **Backtest:** full 2024 season or sample dates?

Once you answer these, I'll:
1. Finalize the RR generator logic
2. Integrate into UI
3. Build backtest engine
4. Run analysis and generate reports

**Ready for your input!** 🎯

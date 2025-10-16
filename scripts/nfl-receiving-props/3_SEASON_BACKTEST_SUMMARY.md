# NFL Receiving Props - 3-Season Backtest (2022-2024)

## 🎯 Objective

Comprehensive historical validation of the NFL receiving props model using 3 full seasons of data (2022-2024), similar to the rigorous backtesting approach used for NBA player props.

## 📊 Test Configuration

- **Seasons Tested**: 2022, 2023, 2024
- **Test Weeks**: 5-18 per season (42 total test weeks)
- **Simulations**: 50,000 per player prediction
- **Min Games History**: 3 games (rolling window)

## 🔒 Temporal Safety

### Week-Based Validation (MNF/TNF Safe)

The backtest uses **week numbers** instead of calendar dates for temporal boundaries to properly handle Monday Night Football and Thursday Night Football:

- **Problem**: Game dates can be misleading
  - Example: Oct 3, 2022 is technically "Week 5 starts" on calendar
  - But MNF from Week 4 plays on Oct 3 (game_id: `2022_04_LA_SF`)
  - Using dates would incorrectly flag this as "leakage"

- **Solution**: Use NFL week numbers from nflfastR
  - Training for Week 5: Only games with `week < 5`
  - Test for Week 5: Only games with `week == 5`
  - Accounts for all scheduling variations (TNF, MNF, international games, etc.)

### Walk-Forward Validation

Each week N prediction uses only weeks 1 through N-1 for training:

| Season | Test Week | Training Weeks | Training Games |
|--------|-----------|----------------|----------------|
| 2022   | Week 5    | Weeks 1-4      | ~1,000         |
| 2022   | Week 6    | Weeks 1-5      | ~1,250         |
| ...    | ...       | ...            | ...            |
| 2024   | Week 18   | Weeks 1-17     | ~4,300         |

This simulates the real-world prediction timeline:
1. **Sunday** (end of Week N-1): All games complete
2. **Monday**: Model trains on Weeks 1 through N-1
3. **Tuesday-Friday**: Injury reports, depth chart updates
4. **Saturday/Sunday**: Generate predictions for Week N
5. **Sunday 1pm ET**: FREEZE - use Week N data for next cycle

## 📈 Performance Metrics

### Expected Outcomes

Based on NBA model performance and NFL market characteristics:

- **Win Rate**: 54-58% (lower than NBA due to more efficient NFL markets)
- **ROI**: +3-6% (profit margin after vig)
- **Brier Score**: <0.25 (probability calibration)
- **Opportunities**: ~3,500 bets/season at 5% edge threshold

### Analysis Breakdown

1. **Overall Performance**
   - Total predictions across all 3 seasons
   - Hit rate and average edge
   - ROI in units and percentage

2. **By Edge Threshold** (3%, 5%, 7%, 10%, 15%)
   - Number of bets qualifying
   - Win rate at each threshold
   - ROI and unit profit
   - Sharper thresholds = higher win rate, fewer bets

3. **By Season** (2022, 2023, 2024)
   - Consistency across years
   - Model adaptability to rule changes
   - 2023 expected slightly better (more data = better training)

4. **By Prop Type** (Receptions vs Receiving Yards)
   - Receptions: Easier to predict (less variance)
   - Yards: Higher variance, but more market inefficiency
   - Expected: Receptions 56%+, Yards 52-54%

5. **Calibration Analysis**
   - Probability bins (0-10%, 10-20%, ..., 90-100%)
   - Compare predicted probability vs actual hit rate
   - Goal: 60% model probability → 60% actual hit rate
   - Measures: Brier score (lower is better)

## 🎲 Three-Stage Cascade Model

Each player prediction simulates:

1. **Targets ~ Poisson(λ)**
   - λ = rolling average targets (L5 games)
   - Accounts for: Role changes, game script, opponent

2. **Receptions ~ Binomial(targets, catch_rate)**
   - catch_rate = rolling average (L5 games)
   - Typical values: 55-75% depending on receiver type

3. **Yards ~ Gamma(shape, rate)**
   - Per reception: yards_per_rec (L5 average)
   - Sum across all receptions in simulation
   - Accounts for: Air yards, YAC ability, opponent defense

50,000 simulations per player → Full distribution → P(stat > line)

## 📁 Output Files

### Full Results
`data/nfl_receiving_props/backtest_3season_2022_2024.rds`

Contains all predictions with:
- Player, team, game_date
- Prop type (receptions, receiving_yards)
- Line tested
- Model probability over
- Market probability (simulated with 5% vig)
- Edge (model - market)
- Actual result (hit_over TRUE/FALSE)
- Rolling stats used (L5 averages)

### Summary JSON
`data/nfl_receiving_props/backtest_3season_summary.json`

Contains:
- Performance by edge threshold
- Calibration data (bins + Brier score)
- Overall stats (total predictions, players, etc.)
- Metadata (date generated, test period)

## 🔮 Real-World Application

### What This Tells Us

1. **Model Profitability**
   - If backtest shows +5% ROI at 5% edge → Model is profitable
   - If backtest shows +2% ROI at 5% edge → Need better odds integration
   - If backtest shows -3% ROI at 5% edge → Model has issues

2. **Optimal Edge Threshold**
   - Trade-off: Higher threshold = fewer bets but higher win rate
   - Find the edge threshold that maximizes units/week
   - Example: 5% edge = 40 bets/week at +6 units, 10% edge = 8 bets/week at +2.4 units → Use 5%

3. **Calibration Quality**
   - Well-calibrated: Can size bets using Kelly criterion
   - Poorly calibrated: Need to adjust probabilities before betting
   - Goal: Brier score <0.25, all bins within ±5% of diagonal

### Phase 2 Enhancements (After Backtest)

Once we validate the baseline model works:

1. **Integrate Real Odds** (The Odds API)
   - Replace simulated market odds with actual books
   - Calculate true edge vs market consensus
   - Track CLV (closing line value)

2. **Enhanced Features**
   - Catch rate by depth (0-5 yards, 5-15, 15+)
   - Opponent defense by receiver slot (WR1 vs slot vs WR3)
   - QB pressure impact on catch rate
   - Weather factors (wind, precipitation)

3. **Injury Impact Algorithm**
   - Target redistribution when WR1 out
   - Integration with canonical-availability-v5.mjs
   - Example: Nico Collins OUT → Tank Dell +70% of Collins work

4. **Advanced Game Script**
   - Pass rate expectation from spread
   - In-game adjustments (trailing teams pass more)
   - Garbage time detection and filtering

## 📊 Comparison to NBA Model

| Metric | NBA Player Props | NFL Receiving Props |
|--------|-----------------|---------------------|
| **Test Period** | 2021-22, 2022-23, 2023-24 | 2022, 2023, 2024 |
| **Total Seasons** | 3 seasons | 3 seasons |
| **Expected Win Rate** | 56-60% | 54-58% |
| **Expected ROI** | +6-9% | +3-6% |
| **Opportunities/Season** | ~8,000 | ~3,500 |
| **Market Efficiency** | Medium | High |
| **Variance** | Medium | Medium-High |
| **Data Sources** | NBA API, PBP | nflfastR, PBP |
| **Development Time** | ~64 hours | ~30 hours |

**Why NFL has lower expected performance:**
- NFL betting markets are more efficient (more public action, more sharp money)
- Fewer games per season (17 vs 82) = less data per player
- Higher variance per game (basketball has many possessions, football has ~60 plays)
- BUT: Leveraging existing elite infrastructure (injury system, depth charts, EPA database)

**Why NFL is faster to build:**
- Reusing 70% of NBA infrastructure
- Already have elite injury/depth system (178+ player EPA database, canonical availability v5)
- nflfastR is excellent (vs dealing with multiple NBA data sources)
- Simpler prop types (2 props vs 5+ for NBA)

## ✅ Success Criteria

The backtest is considered **SUCCESSFUL** if:

1. ✅ **Profitable**: ROI > +3% at 5% edge threshold
2. ✅ **Consistent**: Positive ROI in 2/3 seasons
3. ✅ **Well-Calibrated**: Brier score < 0.25
4. ✅ **Sufficient Volume**: >1,000 bets/season at 5% edge
5. ✅ **Edge Decay**: ROI improves as edge threshold increases

If backtest fails any criteria → Diagnose and fix before Phase 2

If backtest passes all criteria → Proceed to Phase 2 (real odds, injury impact, enhanced models)

---

**Status**: 🟡 Running (Started: Oct 16, 2024)
**ETA**: 5-10 minutes (processing 13,004 player-games with 50k simulations each)
**Next Steps**: Analyze results, validate success criteria, proceed to Phase 2

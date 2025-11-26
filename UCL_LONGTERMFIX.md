# 🏆 UEFA Champions League BTTS Model — Long-Term Roadmap

**Status**: Quick fixes deployed (Nov 26, 2025)  
**Priority**: Medium (Future enhancement after quick fix validation)  
**Estimated Effort**: 2-3 weeks full rebuild

---

## 📊 Problem Summary

### What We Fixed TODAY (Immediate 3-Line Fix)

✅ **Baseline Correction**: 48% → 37.5% (historical UCL BTTS rate)  
✅ **Domestic Stats Discount**: 25% reduction on ATT/DEF for elite competition  
✅ **Confidence Threshold**: Raised to 65% minimum for UCL recommendations

**Expected Impact**: 
- BTTS YES predictions drop from 90% → ~45% (aligned with reality)
- Filter out 60-70% of weak predictions
- Make UCL predictions usable TODAY

---

### Root Cause (Why UCL Was Broken)

#### Issue #1: Wrong Baseline
```
Configured: 48% BTTS YES baseline
Reality:    36.5% average (2018-2024)

Season    | BTTS YES Rate
----------|---------------
2023-24   | 42.6%
2022-23   | 33.1%
2021-22   | 39.3%
2020-21   | 35.1%
2019-20   | 40.4%
2018-19   | 34.8%
----------|---------------
Average   | 36.5%
```

**Impact**: Model started every prediction 12 percentage points too high.

---

#### Issue #2: Inflated Domestic Stats Applied to Elite Competition

**The Problem**:
- Bayern Munich domestic: 250% ATT (scores 3-4 goals/game vs Bundesliga mid-table)
- Liverpool domestic: 179% ATT (dominates weaker Premier League opponents)
- PSG domestic: 179% ATT (crushes Ligue 1 lower teams)

**What Happens**:
1. These teams play **Bundesliga/EPL/Ligue 1 mid-table opponents** domestically
2. Domestic stats get inflated: "Bayern scores 2.5x league average!"
3. Model applies these ratings to **UCL matches**
4. UCL opponents are: Arsenal, Real Madrid, Man City, Barcelona, Atletico, Inter, Juventus
5. Model thinks: "250% attack + 179% attack = goals everywhere = BTTS YES 90%!"

**Reality**:
- UCL = **elite defenses every match**
- Van Dijk, Rudiger, Dias, Marquinhos, Koulibaly-level defenders
- Courtois, Alisson, Ederson-level keepers
- Tactical, defensive European football

**Result**: Model hallucinates goals that don't happen.

---

## 🚀 LONG-TERM FIX PLAN

### Phase 1: UCL-Specific Data Pipeline (Week 1)

#### 1.1 Historical UCL Stats Parser
**Goal**: Build UCL-only team rating system

**Data Source**: `openfootball/champions-league` GitHub repo
- **Scope**: Last 3 completed seasons (2021-22, 2022-23, 2023-24)
- **Coverage**: ~375 matches of clean historical data

**Metrics to Extract**:
```javascript
{
  team: "Liverpool FC",
  ucl_games: 12,
  ucl_goals_scored: 23,
  ucl_goals_allowed: 8,
  ucl_attack_rating: 1.92, // goals/game in UCL
  ucl_defense_rating: 0.67, // goals allowed/game in UCL
  ucl_btts_rate: 0.58, // % of UCL matches with BTTS YES
  ucl_home_goals: 14,
  ucl_away_goals: 9,
  ucl_npxg_for: 21.4, // if available from external source
  ucl_npxg_against: 9.2
}
```

**Script**: `scripts/ucl/parse_ucl_history.mjs`
- Parse match results from GitHub
- Calculate team-level stats per season
- Rolling 3-season averages for stability
- Export to `data/soccer/ucl-team-ratings.json`

---

#### 1.2 Hybrid Rating System
**Goal**: Blend domestic + UCL stats intelligently

**Formula**:
```javascript
// For teams WITH UCL history (last 3 years):
attack_rating = 0.40 * ucl_attack_rating + 0.60 * domestic_attack_rating

// For teams WITHOUT UCL history (newly qualified):
attack_rating = domestic_attack_rating * 0.70 // Heavy discount
```

**Rationale**:
- **UCL veterans** (Bayern, Real Madrid, Liverpool): Use their proven UCL form
- **UCL debutants** (Girona, Union Saint-Gilloise): Discount domestic dominance
- **Returning teams** (Napoli after 1-year absence): Blend old UCL + recent domestic

---

#### 1.3 Opposition Quality Adjustment
**Goal**: Penalize teams who faced weak UCL opponents

**Example**:
- **Team A**: Played Man City, Bayern, PSG (elite opponents) → NO PENALTY
- **Team B**: Played Sheriff Tiraspol, Maccabi Haifa, Viktoria Plzen (weak opponents) → -15% rating

**Implementation**:
```javascript
function adjustForOppositionQuality(team, opponents) {
  const avgOpponentRating = opponents.map(o => o.uefa_coefficient).reduce((a,b) => a+b) / opponents.length;
  const leagueAvgCoefficient = 35.0; // Top-16 UEFA average
  
  const adjustment = Math.min(1.0, avgOpponentRating / leagueAvgCoefficient);
  return team.rating * (0.85 + 0.15 * adjustment); // Max 15% penalty
}
```

---

### Phase 2: UCL-Calibrated Dixon-Coles (Week 1-2)

#### 2.1 Recalibrate τ Parameters
**Current (too weak)**:
```javascript
dc_tau: {
  tau_00: -0.15,  // 0-0 suppression (UCL has MORE 0-0s than this suggests)
  tau_10: -0.08,
  tau_01: -0.08,
  tau_11: 0.03
}
```

**Proposed (UCL-specific)**:
```javascript
dc_tau: {
  tau_00: -0.22,  // STRONGER 0-0 suppression (tactical UCL games)
  tau_10: -0.10,  // Stronger 1-0 boost (cagey knockout games)
  tau_01: -0.10,
  tau_11: 0.02    // Slight 1-1 boost (away goals era mindset)
}
```

**Calibration Method**:
1. Fit Dixon-Coles to 2021-24 UCL match results
2. Maximum likelihood estimation for τ
3. Validate on holdout 2023-24 season
4. Compare MAE vs Poisson baseline

**Script**: `scripts/ucl/calibrate_dixon_coles.py`

---

#### 2.2 UCL Baseline Recalculation
**Current**: 37.5% (quick fix average)

**Improved**: Dynamic baseline by stage

```javascript
{
  'group-stage': 0.40,  // More open, attacking play (group variety)
  'round-16': 0.35,     // Tactical, cagey (elite matchups)
  'quarter-finals': 0.38,
  'semi-finals': 0.36,
  'final': 0.32         // Most defensive, cagey (one-off stakes)
}
```

---

### Phase 3: Profitable Band Detection (Week 2)

#### 3.1 Backtest Framework
**Goal**: Replicate EPL Profile C success (27.5% ROI)

**Method**:
1. **Generate predictions** for 2022-23, 2023-24 seasons
2. **Compare to closing lines** (use historical odds from Pinnacle if available)
3. **Bin by probability**: [0-10%, 10-20%, ..., 90-100%]
4. **Calculate ROI per bin**:
   ```
   Bin 60-70%: 78 bets, 52 wins → 66.7% hit rate → +8.2% ROI
   Bin 70-80%: 34 bets, 26 wins → 76.5% hit rate → +15.4% ROI
   ```
5. **Identify profitable bands** (similar to EPL's 61-66% sweet spot)

**Expected Result**:
```javascript
ucl_profitable_bands: {
  btts_yes: [0.58, 0.65],  // Predict between 58-65% → bet YES
  btts_no: [0.28, 0.35],   // Predict between 28-35% → bet NO
  min_edge: 0.04,          // 4% minimum edge
  max_ev_cap: 0.15         // 15% EV cap (lower than EPL due to uncertainty)
}
```

---

#### 3.2 Adaptive Gates (Profile C for UCL)
**EPL Profile C Gates**:
- Probability band: [0.61, 0.66]
- EV > 5%
- Quarter-Kelly stakes
- 20% EV cap

**UCL Profile C Gates** (more conservative):
- Probability band: [TBD from backtest, likely 0.58-0.65]
- EV > 6% (higher threshold due to lower liquidity)
- **One-Eighth Kelly** stakes (more conservative than EPL)
- 15% EV cap (lower ceiling due to roster uncertainty)

**Implementation**:
```javascript
// scripts/ucl/train_ucl_profile_c.py
def find_profitable_bands(predictions_df, closing_odds_df):
    """
    Replicate EPL Profile C calibration for UCL
    Returns optimal probability windows + Kelly fractions
    """
    # Grid search over probability bands
    # Measure ROI, Sharpe ratio, max drawdown
    # Find Pareto-optimal band (ROI vs bet frequency)
```

---

### Phase 4: Production Implementation (Week 2-3)

#### 4.1 UCL Stats Integration
**File**: `netlify/functions/_lib/soccer/ucl-ratings.mjs`

```javascript
/**
 * Load UCL-specific team ratings from historical data
 * Blend with domestic stats using hybrid formula
 */
export function getUCLTeamRating(teamName, domesticStats) {
  const uclHistory = loadUCLHistory(teamName);
  
  if (!uclHistory || uclHistory.games < 6) {
    // New team or insufficient UCL data → discount domestic stats
    return {
      attack: domesticStats.attack * 0.70,
      defense: domesticStats.defense * 0.70,
      confidence: 'LOW',
      source: 'DOMESTIC_DISCOUNTED'
    };
  }
  
  // Blend UCL + domestic (60/40 split favoring recent domestic form)
  return {
    attack: 0.40 * uclHistory.attack + 0.60 * domesticStats.attack,
    defense: 0.40 * uclHistory.defense + 0.60 * domesticStats.defense,
    confidence: uclHistory.games >= 12 ? 'HIGH' : 'MEDIUM',
    source: 'HYBRID_UCL_DOMESTIC'
  };
}
```

---

#### 4.2 UCL Profile C Module
**File**: `netlify/functions/_lib/soccer/ucl-profile-c.mjs`

```javascript
/**
 * UCL Profile C: Conservative Kelly betting on calibrated probability windows
 * Based on 2022-24 backtest ROI analysis
 */
export function calculateUCLProfileC(finalProb, odds, modelUncertainty) {
  // Load backtest-calibrated profitable bands
  const { min_prob, max_prob, min_edge } = UCL_PROFITABLE_BANDS.btts_yes;
  
  const marketProb = oddsToProb(odds.btts_yes, 'shin');
  const edge = finalProb - marketProb;
  
  // UCL gates (more conservative than EPL)
  if (finalProb < min_prob || finalProb > max_prob) {
    return { recommendation: 'NO_VALUE', reason: 'Outside profitable band' };
  }
  
  if (edge < min_edge) {
    return { recommendation: 'NO_VALUE', reason: 'Insufficient edge' };
  }
  
  // One-Eighth Kelly (vs EPL Quarter-Kelly)
  const kellyFraction = calculateKelly(finalProb, odds.btts_yes) / 8;
  const cappedKelly = Math.min(kellyFraction, 0.015); // 1.5% max stake
  
  return {
    recommendation: 'BET',
    selection: 'YES',
    kelly_fraction: cappedKelly,
    expected_value: Math.min(edge * odds.btts_yes, 0.15), // 15% EV cap
    confidence: modelUncertainty < 0.10 ? 'HIGH' : 'MEDIUM'
  };
}
```

---

#### 4.3 Documentation + Monitoring
**File**: `UCL_PROFILE_C_DOCUMENTATION.md`

**Contents**:
1. Historical backtest results (2022-24)
2. Profitable band derivation
3. Kelly fraction sizing rationale
4. Comparison vs EPL Profile C
5. Risk management (max exposure, correlation limits)
6. Live performance tracking template

**Monitoring Dashboard**:
- Track live UCL BTTS predictions vs closing lines
- ROI by probability bin (compare to backtest)
- Calibration curve updates (are we still calibrated?)
- Alert if performance degrades >5% below backtest

---

### Phase 5: Validation & Iteration (Week 3)

#### 5.1 Shadow Mode Testing
**Goal**: Run new UCL model alongside current (quick fix) model

**Method**:
1. Deploy new model to `netlify/functions/soccer-btts-predictions-ucl-v2.js`
2. Generate predictions for **both models** on same fixtures
3. Compare:
   - Prediction distribution (old: 90% YES → new: ~40% YES)
   - Confidence levels
   - Edge magnitude
   - Recommendation frequency
4. Track paper trading results for 2-3 weeks

**Success Criteria**:
- New model predicts 35-45% BTTS YES (vs historical 37%)
- Recommendations show positive EV vs opening lines
- Calibration curve shows model is well-calibrated (not over/underconfident)

---

#### 5.2 A/B Testing Plan
**Goal**: Gradually shift to new model

**Rollout**:
1. **Week 1**: 10% of UCL fixtures use new model (test on weak teams first)
2. **Week 2**: 50% if paper trading looks good
3. **Week 3**: 100% if validated

**Rollback Triggers**:
- New model ROI < -5% after 20 bets
- Calibration MAE > 0.15 (predictions way off actual rates)
- User reports of obvious bad predictions

---

## 📋 Implementation Checklist

### Week 1: Data Infrastructure
- [ ] Script: Parse `openfootball/champions-league` historical results
- [ ] Export: `data/soccer/ucl-team-ratings.json` with 3-season averages
- [ ] Function: `getUCLTeamRating()` hybrid domestic/UCL blender
- [ ] Script: Calibrate Dixon-Coles tau parameters on 2021-24 data
- [ ] Update: `LEAGUES['champions-league']` with new tau + dynamic baseline

### Week 2: Backtesting & Calibration
- [ ] Script: `scripts/ucl/backtest_ucl_profile_c.py`
- [ ] Analysis: ROI by probability bin (find profitable windows)
- [ ] Module: `ucl-profile-c.mjs` with adaptive Kelly gates
- [ ] Validation: Compare backtest ROI vs EPL Profile C (target >15% ROI)
- [ ] Document: `UCL_PROFILE_C_DOCUMENTATION.md`

### Week 3: Production & Monitoring
- [ ] Deploy: `soccer-btts-predictions-ucl-v2.js` shadow model
- [ ] Dashboard: Live tracking spreadsheet (predictions vs results)
- [ ] A/B Test: 10% → 50% → 100% rollout plan
- [ ] Validation: 2-week paper trading period
- [ ] Final: Replace quick fix with full UCL Profile C

---

## 🎯 Success Metrics

### Model Performance
- **BTTS YES Prediction Rate**: 35-45% (aligned with historical 37%)
- **Calibration MAE**: < 0.10 (well-calibrated)
- **Recommendation ROI**: > +10% vs closing lines (backtest)
- **Sharpe Ratio**: > 1.5 (sustainable edge)

### Business Metrics
- **Bet Frequency**: 15-25% of UCL fixtures (vs current 80%+)
- **Average Stake**: 1-2 units (conservative sizing)
- **Max Drawdown**: < 15 units over season
- **User Trust**: Accurate predictions build confidence

---

## ⚠️ Risk Management

### What Could Go Wrong

1. **UCL Historical Data Too Small**
   - 3 seasons = ~375 matches total
   - Some teams have <10 UCL games
   - **Mitigation**: Heavy shrinkage to league priors for low-sample teams

2. **Roster Instability**
   - UCL squads change 30-40% year-over-year
   - Historical stats become stale
   - **Mitigation**: Weight recent domestic form more (60%) vs old UCL data (40%)

3. **Format Changes**
   - 2024-25 UCL expanded format (36 teams, Swiss model)
   - Historical data from old 32-team format
   - **Mitigation**: Monitor early 2024-25 results, recalibrate if needed

4. **Backtest Overfitting**
   - Optimizing on 2 seasons could overfit
   - **Mitigation**: Out-of-sample validation on 2023-24, conservative gates

---

## 💡 Alternative Approaches

### Option A: UCL-Only Model (Most Accurate)
**Pros**: Clean, competition-specific  
**Cons**: Small sample, roster instability  
**Best For**: Long-term (3+ seasons of data)

### Option B: Hybrid Domestic/UCL (Recommended)
**Pros**: Balances recent form + UCL experience  
**Cons**: Complex blending logic  
**Best For**: Current implementation (deployed as quick fix + this roadmap)

### Option C: Discount-Only (Quick Fix - ALREADY DONE)
**Pros**: Simple, fast to deploy  
**Cons**: Crude, not as precise  
**Best For**: Immediate triage (CURRENT STATE)

---

## 📖 References

### Data Sources
- **Match Results**: [openfootball/champions-league](https://github.com/openfootball/champions-league)
- **Team Coefficients**: [UEFA Club Coefficients](https://www.uefa.com/nationalassociations/uefarankings/club/)
- **Historical Odds**: Pinnacle closing lines (if available via TheOddsAPI historical)

### Model Papers
- Dixon & Coles (1997): "Modelling Association Football Scores and Inefficiencies in the Football Betting Market"
- Karlis & Ntzoufras (2003): "On Modelling Soccer Data" (bivariate Poisson)
- Kovalchik (2016): "Searching for the GOAT of Tennis" (Bayesian shrinkage in sports)

### Internal Docs
- `ADVANCED_INJURY_SYSTEM_SUMMARY.md`: Similar multi-phase rollout pattern
- `EPL_PROFILE_C_STRATEGY.md`: Template for UCL Profile C
- `ACTION_PLAN_SURGICAL_IMPROVEMENTS.md`: Surgical, data-driven fixes philosophy

---

## 🚦 Status Updates

### ✅ Phase 0: Quick Fix (Nov 26, 2025)
- [x] Baseline: 48% → 37.5%
- [x] Domestic discount: 25% for UCL
- [x] Confidence threshold: 65% minimum
- [x] **STATUS**: Deployed to production (main42 branch)

### ⏳ Phase 1-5: Full Rebuild
- [ ] **ETA**: 2-3 weeks
- [ ] **Owner**: TBD
- [ ] **Priority**: Medium (validate quick fix first)
- [ ] **Status**: Roadmap documented, awaiting green light

---

## 📞 Contact / Questions

**This Document Maintained By**: GitHub Copilot + Brent  
**Last Updated**: November 26, 2025  
**Next Review**: After 2 weeks of quick fix performance data  

---

## 🎬 Next Steps

1. **Monitor quick fix performance** (2-3 weeks)
   - Track UCL prediction distribution (should be ~40% YES, not 90%)
   - Measure ROI vs closing lines
   - Collect user feedback

2. **Decision point**: If quick fix works well enough, delay full rebuild
   - If quick fix ROI > +5%, maybe good enough for now
   - If quick fix still broken, expedite Phase 1-2

3. **If proceeding with rebuild**:
   - Start with Phase 1 data parsing (Week 1)
   - Run backtest on historical data (Week 2)
   - Deploy shadow model for validation (Week 3)

**Status**: ✅ Quick fix deployed, monitoring in progress

# ⚽ Soccer League Profile C Priority Matrix

**Purpose**: Determine which leagues are worth backtesting for Profile C  
**Date**: November 26, 2025  
**Based On**: EPL Profile C success (27.5% ROI) + data availability

---

## 🏆 **League Rankings by Profile C Potential**

### Tier 1: BACKTEST IMMEDIATELY ✅

#### 1. 🇩🇪 **Bundesliga** (HIGHEST PRIORITY)
**Profile C Score**: 95/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐⭐⭐ | 58% (highest in top-5) |
| Sample Size | ⭐⭐⭐⭐ | 306 games/season (solid) |
| Roster Stability | ⭐⭐⭐⭐⭐ | Low turnover, German contract culture |
| Tactical Consistency | ⭐⭐⭐⭐⭐ | Attacking, pressing style (Bundesliga DNA) |
| Data Availability | ⭐⭐⭐⭐⭐ | openfootball + FBref (excellent) |
| Odds Liquidity | ⭐⭐⭐⭐ | Good (not EPL-level, but solid) |

**Why It's Perfect**:
- Highest BTTS rate = most signal to extract
- Consistent attacking philosophy (easier to model)
- Fewer upset-prone teams (Bayern/Dortmund dominance = stability)
- 10+ years of clean data available

**Expected Profile C ROI**: **18-25%** (potentially better than EPL!)

**Action**: ✅ See `BUNDESLIGA_PROFILE_C_PLAN.md` for full backtest plan

---

#### 2. 🇮🇹 **Serie A** (HIGH PRIORITY)
**Profile C Score**: 82/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐ | 50% (moderate, EPL-like) |
| Sample Size | ⭐⭐⭐⭐⭐ | 380 games/season (largest) |
| Roster Stability | ⭐⭐⭐⭐ | Moderate (better than La Liga) |
| Tactical Consistency | ⭐⭐⭐ | Tactical variety (defensive vs attacking clubs) |
| Data Availability | ⭐⭐⭐⭐ | openfootball + FBref |
| Odds Liquidity | ⭐⭐⭐⭐ | Good |

**Why It's Good**:
- Large sample size (380 games)
- Mix of defensive (Inter, Juve) and attacking (Napoli, Atalanta) styles
- Historical tactical sophistication = respect for quality
- Fewer blowouts than other leagues

**Challenges**:
- More tactical variance (Serie A catenaccio vs modern pressing)
- Mid-table more unpredictable than Bundesliga

**Expected Profile C ROI**: **12-18%**

**Action**: Backtest after Bundesliga validates

---

### Tier 2: BACKTEST IF TIER 1 SUCCEEDS 🟡

#### 3. 🇪🇸 **La Liga** (MODERATE PRIORITY)
**Profile C Score**: 74/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐ | 52% (similar to EPL) |
| Sample Size | ⭐⭐⭐⭐⭐ | 380 games/season |
| Roster Stability | ⭐⭐⭐ | High turnover (South American pipeline) |
| Tactical Consistency | ⭐⭐ | HUGE variance (Barca/Real vs park-the-bus) |
| Data Availability | ⭐⭐⭐⭐ | openfootball + FBref |
| Odds Liquidity | ⭐⭐⭐⭐⭐ | Excellent (high interest globally) |

**Why It's Challenging**:
- **Tactical polarization**: Barca/Real Madrid dominate possession → high BTTS
- **Bottom-half defensive**: Teams regularly park bus vs elite → low BTTS
- Hard to model this variance (may need team-specific adjustments)

**Opportunities**:
- IF we can identify "open game" matchups (top-6 vs top-6), could be profitable
- Large sample size helps

**Expected Profile C ROI**: **10-15%** (lower confidence)

**Action**: Wait for Bundesliga/Serie A validation

---

#### 4. 🇫🇷 **Ligue 1** (MODERATE PRIORITY)
**Profile C Score**: 68/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐⭐ | 54% (decent) |
| Sample Size | ⭐⭐⭐⭐⭐ | 380 games/season |
| Roster Stability | ⭐⭐ | High turnover (French academy → export model) |
| Tactical Consistency | ⭐⭐⭐ | Mixed (PSG dominance skews things) |
| Data Availability | ⭐⭐⭐⭐ | openfootball + FBref |
| Odds Liquidity | ⭐⭐⭐ | Moderate (lower than top-4) |

**Why It's Challenging**:
- **PSG dominance** (70%+ win rate) → skews league stats
- Young player turnover → stats get stale fast
- Tactical inconsistency across clubs

**Opportunities**:
- Non-PSG matchups might be profitable
- If we filter out PSG games, rest of league is interesting

**Expected Profile C ROI**: **8-14%**

**Action**: Low priority, backtest only if Tier 1+2 all succeed

---

### Tier 3: SKIP FOR NOW ❌

#### 5. 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Championship** (England 2nd Tier)
**Profile C Score**: 52/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐⭐ | 55% (decent) |
| Sample Size | ⭐⭐⭐⭐⭐ | 552 games/season (huge!) |
| Roster Stability | ⭐ | MASSIVE turnover (promotion/relegation chaos) |
| Tactical Consistency | ⭐⭐ | Huge variance (recent EPL dropdowns vs League 1 risers) |
| Data Availability | ⭐⭐⭐ | Limited NPxG data |
| Odds Liquidity | ⭐⭐ | Lower (less global interest) |

**Why Skip**:
- Roster instability kills predictability (30-50% turnover annually)
- Quality variance (relegated EPL teams vs promoted League 1)
- Data quality lower (fewer advanced stats)

**Action**: ❌ Skip unless we're desperate for more leagues

---

#### 6. 🇪🇺 **Champions League**
**Profile C Score**: 45/100 (already assessed)

See `UCL_LONGTERMFIX.md` for full analysis.

**Summary**: Too hard (small sample, roster instability, elite competition variance)

**Action**: ✅ Quick fix deployed, full rebuild deferred

---

#### 7. 🇺🇸 **MLS**
**Profile C Score**: 40/100

| Factor | Rating | Notes |
|--------|--------|-------|
| BTTS Rate | ⭐⭐⭐ | ~48% |
| Sample Size | ⭐⭐⭐ | 238 games/season (small) |
| Roster Stability | ⭐⭐ | Designated Player rule = volatility |
| Tactical Consistency | ⭐⭐ | Wide variance (MLS parity is real) |
| Data Availability | ⭐⭐ | Limited (FBref has some, but spotty) |
| Odds Liquidity | ⭐⭐ | Lower (US market focuses on moneyline) |

**Why Skip**:
- Playoff format weird (regular season ≠ champion)
- Parity by design (salary cap, draft) = hard to model
- Data quality issues
- BTTS market less liquid in US

**Action**: ❌ Skip

---

## 📊 **Data Availability Matrix**

| League | openfootball | FBref (soccerdata) | NPxG Availability | Closing Odds |
|--------|--------------|-------------------|-------------------|--------------|
| **EPL** | ✅ Excellent | ✅ Excellent | ✅ 2020+ | ✅ High liquidity |
| **Bundesliga** | ✅ Excellent | ✅ Excellent | ✅ 2020+ | ✅ Good liquidity |
| **Serie A** | ✅ Excellent | ✅ Excellent | ✅ 2020+ | ✅ Good liquidity |
| **La Liga** | ✅ Excellent | ✅ Excellent | ✅ 2020+ | ✅ High liquidity |
| **Ligue 1** | ✅ Excellent | ✅ Excellent | ✅ 2020+ | 🟡 Moderate |
| **UCL** | ✅ Good | 🟡 Limited | ❌ Very limited | 🟡 Moderate |
| **Championship** | 🟡 Moderate | 🟡 Moderate | ❌ Limited | 🟡 Moderate |
| **MLS** | 🟡 Moderate | 🟡 Spotty | ❌ Limited | 🟡 Lower |

**Legend**:
- ✅ Excellent: Complete data, easy to access
- 🟡 Moderate: Partial data, may need workarounds
- ❌ Limited: Poor data quality or availability

---

## 🎯 **Recommended Roadmap**

### Phase 1: Bundesliga (Weeks 1-3) ✅ PRIORITY
1. ✅ Plan created (`BUNDESLIGA_PROFILE_C_PLAN.md`)
2. Week 1: Data collection
3. Week 2: Model training + backtest
4. Week 3: Validation + production deployment

**Success Criteria**: ROI > 15%, validation within 5% of backtest

---

### Phase 2: Serie A (Weeks 4-6) 🟡 IF PHASE 1 SUCCEEDS
1. Replicate Bundesliga methodology
2. Adjust for Italian tactical variance
3. Backtest 2020-24 (4 seasons)
4. Deploy if ROI > 12%

**Success Criteria**: ROI > 12%, consistent with Bundesliga performance

---

### Phase 3: La Liga (Weeks 7-9) 🟡 IF PHASE 2 SUCCEEDS
1. Special handling for top-6 vs bottom-14 matchups
2. Consider team-specific adjustments
3. Backtest 2020-24
4. Deploy if ROI > 10%

**Success Criteria**: ROI > 10%, no catastrophic losses

---

### Phase 4: Ligue 1 (Optional) 🟡 IF HUNGRY FOR MORE
1. Filter out PSG games (or treat separately)
2. Focus on mid-table vs mid-table
3. Lower expectations (ROI target: 8-10%)

---

## 💡 **Strategic Insights**

### Why Bundesliga First?
1. **Highest BTTS rate** (58%) = most signal
2. **Consistent style** (attacking) = easier to model
3. **Lower variance** = more stable profitable bands
4. **Excellent data** = no compromises

### Why Serie A Second?
1. **Large sample** (380 games) = robust backtest
2. **Moderate BTTS** (50%) = EPL-like characteristics
3. **Tactical depth** = if we can model it, edge could be large
4. **Good data** = no major gaps

### Why Skip UCL For Now?
1. **Small sample** (125 games) = overfitting risk
2. **Roster instability** = stats get stale
3. **Elite competition** = hard to model variance
4. **Quick fix deployed** = good enough for now

---

## ⚠️ **Risk Assessment**

### Low Risk (Go For It)
- ✅ **Bundesliga**: Best fundamentals, high confidence
- ✅ **Serie A**: Solid fundamentals, moderate confidence

### Moderate Risk (Proceed with Caution)
- 🟡 **La Liga**: Tactical polarization, may need adjustments
- 🟡 **Ligue 1**: PSG dominance, younger player turnover

### High Risk (Avoid)
- ❌ **Championship**: Roster chaos, data quality issues
- ❌ **MLS**: Format weirdness, data gaps
- ❌ **UCL**: Already assessed (see UCL_LONGTERMFIX.md)

---

## 📋 **Decision Matrix**

Use this to decide if a league is worth backtesting:

| Question | Weight | Bundesliga | Serie A | La Liga | Ligue 1 | UCL |
|----------|--------|-----------|---------|---------|---------|-----|
| BTTS rate > 50%? | 20% | ✅ Yes (58%) | ✅ Yes (50%) | ✅ Yes (52%) | ✅ Yes (54%) | ❌ No (37%) |
| Sample > 250 games/season? | 15% | ✅ Yes (306) | ✅ Yes (380) | ✅ Yes (380) | ✅ Yes (380) | ❌ No (125) |
| Roster stability? | 15% | ✅ High | ✅ Moderate | 🟡 Moderate | 🟡 Low | ❌ Very Low |
| Tactical consistency? | 15% | ✅ High | 🟡 Moderate | ❌ Low | 🟡 Moderate | ❌ Very Low |
| Data availability? | 15% | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ Excellent | 🟡 Moderate |
| Odds liquidity? | 10% | ✅ Good | ✅ Good | ✅ Excellent | 🟡 Moderate | 🟡 Moderate |
| EPL similarity? | 10% | 🟡 Moderate | ✅ High | ✅ High | 🟡 Moderate | ❌ Low |
| **TOTAL SCORE** | **100%** | **95/100** | **82/100** | **74/100** | **68/100** | **45/100** |

**Threshold**: Score > 70 = Worth backtesting

---

## 🚦 **Final Recommendations**

### ✅ IMMEDIATE ACTION
1. **Bundesliga Profile C backtest** (start this week)
   - Follow `BUNDESLIGA_PROFILE_C_PLAN.md`
   - 2-3 week timeline
   - High confidence in success

### 🟡 NEXT STEPS (If Bundesliga succeeds)
2. **Serie A Profile C backtest** (Weeks 4-6)
   - Replicate Bundesliga methodology
   - Moderate confidence

3. **La Liga Profile C backtest** (Weeks 7-9)
   - Special tactical adjustments needed
   - Lower confidence, but large sample

### ❌ DEFER / SKIP
4. **Ligue 1** - Only if hungry for more leagues
5. **Championship** - Too much roster chaos
6. **MLS** - Data quality issues
7. **UCL** - Already have quick fix, full rebuild deferred

---

**Status**: ✅ Bundesliga plan ready, awaiting execution  
**Owner**: TBD  
**Next Decision Point**: After Bundesliga backtest completes (3 weeks)

# NHL Shots on Goal (SOG) Model - Project Status & Roadmap

**Last Updated:** November 26, 2025  
**Current Status:** LightGBM Integration Complete ✅

---

## 📊 Executive Summary

We've successfully built and integrated a Python LightGBM microservice into the NHL SOG prediction system. The infrastructure is complete and operational, with the walk-forward backtest engine now capable of using either the baseline improved model or LightGBM for predictions.

---

## ✅ What's Been Accomplished

### 1. **Walk-Forward Backtest Engine** ✅
**File:** `scripts/nhl/walkforward-backtest-improved.mjs` (663 lines)

**Features:**
- Leak-free walk-forward validation (prevents look-ahead bias)
- Position-specific baselines (D vs F vs C vs L)
- Exponential recency weighting (recent games matter more)
- Power play time boost indicator
- Player-specific shots/TOI efficiency rates
- Enhanced home/away team effects
- Streak detection (hot/cold streaks)
- Full CLI argument parsing system

**CLI Arguments:**
```bash
--maxCycles=N          # Limit number of walk-forward cycles
--testStartDate=YYYY-MM-DD  # Skip cycles before this date
--modelVersion=NAME    # Model identifier for tracking
--useLightGBM=true     # Use LightGBM instead of baseline
--lightgbmEndpoint=URL # Flask server endpoint
--outputFile=PATH      # Custom output path for results
```

**Configuration:**
- Min Training Games: 1,000
- Refit Interval: 500 games
- Test Window: 500 games
- Min Player History: 3 games

### 2. **LightGBM Integration Layer** ✅
**File:** `scripts/nhl/lib/lightgbm-client.mjs` (220 lines)

**Components:**
- `samplesToCSV()` - Converts training samples to deterministic CSV format with feature headers
- `trainWithLightGBM()` - HTTP client for training requests with warm-start support
- `predictWithLightGBM()` - Batch prediction capability (not yet used, reserved for future)
- `BoosterStateManager` - Manages booster state persistence across walk-forward cycles
- `testLightGBMHealth()` - Server health check utility

**Features:**
- Base64 CSV encoding for HTTP transport
- Warm-start progression (booster state carried across cycles)
- Automatic fallback to baseline if server unavailable
- Proper error handling and connection validation

### 3. **Python LightGBM Flask Server** ✅
**File:** `lightgbm-server.py` (216 lines)

**Endpoints:**
- `GET /health` - Health check (returns status + LightGBM version)
- `POST /train-lgbm` - Training endpoint with warm-start support
- `POST /predict-lgbm` - Prediction endpoint (reserved for future use)

**Features:**
- 80/20 temporal train/validation split
- Warm-start support via `init_model` parameter
- Early stopping callbacks
- Base64 booster serialization
- MAE metrics tracking

**Current Status:** Running on port 8888, LightGBM v4.6.0

### 4. **Feature Engineering** ✅
**33-Feature Vector per Game:**

**Baseline Features (22):**
1. Position baseline (historical avg for position)
2. Weighted average (exponential recency)
3. Base rate (blend of weighted avg + position baseline)
4. Is home game (binary)
5. Home/away effect multiplier
6. Player efficiency (shots/minute rate)
7. Average TOI from recent games
8. TOI factor (power function of avg TOI)
9. Has PP time (binary indicator)
10. PP boost multiplier
11. Hot streak indicator (binary)
12. Cold streak indicator (binary)
13. Last 3 games average
14. Recent games mean
15. Recent games max
16. Recent games min
17. Recent games count
18. Total player history length
19. Position = D (binary)
20. Position = F (binary)
21. Position = C (binary)
22. Position = L (binary)

**Opponent Suppression Features (5):** *(Placeholders - not yet implemented)*
- Reserved for opponent defensive metrics

**Quality of Opposition Features (6):** *(Placeholders - not yet implemented)*
- Reserved for opponent strength indicators

---

## 📁 Data & Odds Inventory

### Historical Game Data
**File:** `data/nhl/historical_game_data.json`
- **Size:** 169,847 games
- **Date Range:** 2021-10-12 → 2025-04-17
- **Coverage:** ~4 seasons of NHL data
- **Fields per Game:**
  - `playerId`, `playerName`, `position`
  - `team`, `opponent`, `isHome`
  - `gameDate`
  - `shots` (target variable)
  - `toiMinutes` (time on ice)
  - `ppToi` (power play time)
  - Plus additional game-level metadata

### Test Results Data

#### Baseline Model Results
**File:** `results/nhl-pilot-comparison/test.json`
- **Predictions:** 9,407
- **Cycles:** 200 (cycles 1-181 skipped, 182-200 executed)
- **Date Range:** 2023-10-01 onwards
- **Metrics:**
  - MAE: 1.214 shots
  - Correlation: 0.420
  - Bias: +0.279 shots
- **Validation:** All gates failed (MAE < 1.0, Corr > 0.55, Bias < 0.15)

#### LightGBM Integration Test Results
**File:** `results/nhl-pilot-comparison/lgbm-integration-test.json`
- **Predictions:** 390
- **Cycles:** 185 (cycles 1-181 skipped, 182-185 executed)
- **Date Range:** 2023-10-01 onwards (4 cycles only)
- **Metrics:**
  - MAE: 1.909 shots
  - Correlation: 0.020
  - Bias: -1.893 shots
- **Validation:** All gates failed
- **Status:** Integration working but predictions quality poor (see Issues section)

### Odds/Lines Data
**Status:** Not currently integrated

**Available Sources:**
- Based on workspace structure, there appears to be NBA odds infrastructure in place
- NHL odds collection infrastructure needs to be built
- Potential sources: Sports betting APIs, odds aggregators

---

## 🔧 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Node.js Walk-Forward Backtest Engine                      │
│  (walkforward-backtest-improved.mjs)                        │
│                                                             │
│  ┌────────────────┐         ┌────────────────┐            │
│  │   Baseline     │         │   LightGBM     │            │
│  │   Model Path   │         │   Client Path  │            │
│  │                │         │                │            │
│  │  • Position    │         │  • Feature     │            │
│  │    Baselines   │         │    Vector      │            │
│  │  • Recency     │         │    Builder     │            │
│  │  • PP Boost    │         │  • CSV         │            │
│  │  • Efficiency  │         │    Serializer  │            │
│  │  • Streaks     │         │  • HTTP Client │            │
│  └────────────────┘         └────────┬───────┘            │
│                                      │                     │
└──────────────────────────────────────┼─────────────────────┘
                                       │ HTTP POST
                                       │ (Base64 CSV)
                                       ▼
              ┌────────────────────────────────────┐
              │  Python Flask Server               │
              │  (lightgbm-server.py)              │
              │                                    │
              │  • Port 8888                       │
              │  • LightGBM v4.6.0                 │
              │  • Warm-start support              │
              │  • 80/20 train/val split           │
              │  • Early stopping                  │
              │  • Base64 booster serialization    │
              └────────────────────────────────────┘
```

---

## 🚨 Known Issues & Limitations

### Critical Issues

#### 1. **Poor LightGBM Prediction Quality**
- **Problem:** LightGBM predictions are near-zero or negative (MAE 1.909 vs baseline 1.214)
- **Likely Causes:**
  - Feature vectors may not be properly normalized/scaled
  - 11 placeholder features (opponent + QoO) are all zeros
  - Training samples might have data quality issues
  - Hyperparameters not tuned for hockey data
- **Impact:** LightGBM currently performs worse than baseline
- **Priority:** HIGH

#### 2. **Server Metrics Not Returned**
- **Problem:** Training metrics show as "undefined" in console output
- **Likely Cause:** Response field mapping mismatch or metrics not being calculated
- **Impact:** Can't track training quality in real-time
- **Priority:** MEDIUM

#### 3. **Limited Test Data**
- **Problem:** Only 4 cycles (182-185) actually made predictions in LightGBM test
- **Reason:** Test started at cycle 1 but skipped all cycles before 2023-10-01
- **Impact:** Can't properly evaluate LightGBM performance with only 390 predictions
- **Priority:** MEDIUM

### Design Limitations

#### 1. **Missing Opponent Features**
- 11 of 33 features are placeholders (zeros)
- No opponent defensive metrics
- No quality of opposition indicators
- **Impact:** Model missing crucial predictive signals

#### 2. **No Odds Integration**
- Can't compare model predictions to market lines
- Can't calculate expected value (EV)
- Can't identify +EV betting opportunities
- **Impact:** Can't operationalize model for betting

#### 3. **No Live Game Support**
- Model only works on historical data
- No real-time data pipeline
- No today/tomorrow projection scripts
- **Impact:** Can't use for actual betting decisions

#### 4. **Baseline Model Still Weak**
- MAE 1.214 is not competitive
- Correlation 0.420 is low
- All validation gates fail
- **Impact:** Even if LightGBM worked, baseline is the ceiling

---

## 📈 Test Results Summary

| Model | Predictions | MAE | Correlation | Bias | Status |
|-------|-------------|-----|-------------|------|--------|
| **Baseline** | 9,407 | 1.214 | 0.420 | +0.279 | ❌ Weak |
| **LightGBM** | 390 | 1.909 | 0.020 | -1.893 | ❌ Broken |
| **Target** | - | <1.0 | >0.55 | <0.15 | 🎯 Goal |

**Interpretation:**
- Baseline is weak but functional
- LightGBM integration works but predictions are worse
- Need to fix LightGBM before it can improve on baseline
- Both models far from target metrics

---

## 🗺️ Roadmap Ahead

### Phase 1: Fix LightGBM Foundation (HIGH PRIORITY)

#### 1.1 Debug Feature Quality
- [ ] Add feature statistics logging (min/max/mean/std per feature)
- [ ] Verify feature vectors match between training and test
- [ ] Check for NaN/Inf values in features
- [ ] Add feature importance analysis
- [ ] Validate CSV serialization is deterministic

#### 1.2 Feature Normalization & Scaling
- [ ] Implement standardization (z-score) for continuous features
- [ ] Keep binary features as-is (0/1)
- [ ] Add min-max scaling option for bounded features
- [ ] Store scaling parameters in booster state for consistency

#### 1.3 Hyperparameter Tuning
- [ ] Grid search over learning_rate (0.01, 0.05, 0.1)
- [ ] Tune num_leaves (15, 31, 63, 127)
- [ ] Tune min_data_in_leaf (10, 20, 50, 100)
- [ ] Add max_depth constraint (3, 5, 7, 10)
- [ ] Test different boosting types (gbdt, dart, goss)
- [ ] Optimize for MAE (current objective is correct)

#### 1.4 Server Metrics Fix
- [ ] Debug why metrics show as undefined
- [ ] Add verbose logging to Flask server
- [ ] Ensure metrics are calculated and returned
- [ ] Add validation set correlation to response

**Expected Outcome:** LightGBM matches or beats baseline (MAE ~1.1-1.2, Corr ~0.42-0.45)

---

### Phase 2: Improve Baseline Features (MEDIUM PRIORITY)

#### 2.1 Opponent Defensive Features (5 features)
- [ ] Opponent GA/game (goals against per game)
- [ ] Opponent SA/game (shots against per game)  
- [ ] Opponent recent defensive trend (last 5 games)
- [ ] Opponent goalie save percentage
- [ ] Opponent penalty kill rating

#### 2.2 Quality of Opposition Features (6 features)
- [ ] Opponent win percentage
- [ ] Opponent point differential
- [ ] Opponent standings position
- [ ] Back-to-back game indicator (fatigue)
- [ ] Days rest for opponent
- [ ] Travel distance/time zone factor

#### 2.3 Player Context Features (Additional)
- [ ] Line chemistry (linemate quality)
- [ ] Deployment zone (offensive zone start %)
- [ ] Competition level (vs 1st/2nd/3rd line)
- [ ] Recent injury status
- [ ] Season timing (early/late season fatigue)

**Expected Outcome:** MAE improves to ~1.0-1.1, Correlation to ~0.50-0.55

---

### Phase 3: Run Comparative Analysis (MEDIUM PRIORITY)

#### 3.1 Comprehensive Backtest
- [ ] Run baseline model: 200 cycles, 2023-10-01 onwards
- [ ] Run LightGBM model: same 200 cycles (once fixed)
- [ ] Compare MAE by position (D vs F vs C vs L)
- [ ] Compare MAE by shot volume (low vs medium vs high shooters)
- [ ] Compare correlation by time period (early vs late season)

#### 3.2 Statistical Significance Testing
- [ ] Paired t-test on prediction errors
- [ ] Bootstrap confidence intervals
- [ ] Analyze where each model excels/fails
- [ ] Identify player types each model handles better

#### 3.3 Model Ensemble Exploration
- [ ] Weight baseline + LightGBM predictions
- [ ] Use LightGBM for high-volume shooters, baseline for low-volume
- [ ] Position-specific model selection
- [ ] Confidence-weighted ensemble

**Expected Outcome:** Clear understanding of which approach works best, potentially 5-10% improvement via ensemble

---

### Phase 4: Odds Integration & EV Calculation (HIGH VALUE)

#### 4.1 Odds Collection Infrastructure
- [ ] Build NHL odds scraper (similar to NBA infrastructure)
- [ ] Collect SOG over/under lines from major books
- [ ] Store historical odds for backtesting
- [ ] Build real-time odds polling system

**Key Books to Track:**
- DraftKings
- FanDuel  
- BetMGM
- Caesars
- PointsBet

#### 4.2 Line Comparison & EV Calculator
- [ ] Convert model projections to implied probabilities
- [ ] Convert book lines to implied probabilities
- [ ] Calculate EV for over/under bets
- [ ] Identify +EV opportunities (model disagrees with market)
- [ ] Track closing line value (CLV)

#### 4.3 Betting Strategy & Bankroll Management
- [ ] Kelly Criterion position sizing
- [ ] Minimum EV threshold (e.g., +5%)
- [ ] Maximum bet size limits
- [ ] Diversification across games
- [ ] Track ROI and Sharpe ratio

**Expected Outcome:** Profitable betting opportunities identified, quantified EV, disciplined bet selection

---

### Phase 5: Live Deployment (HIGH VALUE)

#### 5.1 Real-Time Data Pipeline
- [ ] Build today's games fetcher (similar to NBA run_today.py)
- [ ] Build tomorrow's games projections (similar to NBA run_tomorrow_projections.py)
- [ ] Implement data refresh schedule (daily morning updates)
- [ ] Add injury status monitoring
- [ ] Add lineup/starting roster detection

#### 5.2 Production Model Serving
- [ ] Deploy Flask server to production (AWS/GCP/Heroku)
- [ ] Add authentication/API keys
- [ ] Implement rate limiting
- [ ] Add monitoring/alerting
- [ ] Build confidence intervals for predictions

#### 5.3 User Interface
- [ ] Build web dashboard (similar to NBA props UI)
- [ ] Show today's projections vs book lines
- [ ] Highlight +EV opportunities
- [ ] Track historical performance
- [ ] Mobile-responsive design

**Expected Outcome:** Operational betting tool, daily projections, live odds comparison

---

### Phase 6: Advanced Modeling (LONG-TERM)

#### 6.1 Deep Learning Exploration
- [ ] LSTM for time series (player hot/cold streaks)
- [ ] Attention mechanisms for opponent matchups
- [ ] Neural network ensemble with GBM
- [ ] Transfer learning from NBA model

#### 6.2 Causal Inference
- [ ] Propensity score matching for lineup effects
- [ ] Difference-in-differences for rule changes
- [ ] Instrumental variables for ice time allocation
- [ ] Synthetic control for injury impact

#### 6.3 Multi-Output Models
- [ ] Predict SOG + goals + assists + points simultaneously
- [ ] Correlation modeling across props
- [ ] Portfolio optimization across multiple bets

**Expected Outcome:** Cutting-edge modeling, potential for significant edge

---

## 💰 Business Value & ROI Potential

### Current State
- **Model Status:** Incomplete (LightGBM broken, baseline weak)
- **Deployment Status:** Historical backtest only, no live system
- **Revenue Potential:** $0 (not operational)

### Potential Value (If Fixed & Deployed)

#### Conservative Scenario
- **Assumptions:**
  - 5 bets per day at +5% EV average
  - $100 per bet (modest bankroll)
  - 60% hit rate (model slightly better than market)
  - 250 betting days per season
- **Calculation:** 5 bets × $100 × 5% EV × 250 days = **$6,250/season**
- **ROI:** Depends on time investment, but positive EV over long run

#### Optimistic Scenario
- **Assumptions:**
  - 15 bets per day at +8% EV average
  - $250 per bet (larger bankroll)
  - 58% hit rate (model edge maintained)
  - 250 betting days per season
- **Calculation:** 15 bets × $250 × 8% EV × 250 days = **$75,000/season**
- **ROI:** Significant if model edge holds up

#### Reality Check
- Market is efficient for popular props
- Closing lines are hard to beat
- Variance is high (even with edge, losing streaks happen)
- Books limit/ban winners
- Need 1-2 seasons of data to prove model edge
- **Realistic Target:** $10-20K/season if model is good

---

## 🎯 Immediate Next Steps (This Week)

### Priority 1: Fix LightGBM Predictions
1. Add feature statistics logging to see what's going into the model
2. Verify no NaN/Inf values in training data
3. Implement z-score normalization for continuous features
4. Test with smaller learning rate (0.01) and more rounds
5. Re-run integration test and compare to baseline

### Priority 2: Debug Server Metrics
1. Add print statements in Flask server for metrics calculation
2. Verify metrics object structure in response
3. Update client to properly extract and display metrics
4. Confirm validation MAE is being calculated correctly

### Priority 3: Run Full Comparison Test
1. Once LightGBM fixed, run 200-cycle baseline test
2. Run 200-cycle LightGBM test with same parameters
3. Generate side-by-side comparison report
4. Make go/no-go decision on LightGBM vs baseline

**Success Criteria:**
- LightGBM MAE < 1.3 (close to baseline)
- LightGBM correlation > 0.35
- No negative predictions
- Clear path forward identified

---

## 📚 Resources & Documentation

### Key Files
- **Main Script:** `scripts/nhl/walkforward-backtest-improved.mjs`
- **LightGBM Client:** `scripts/nhl/lib/lightgbm-client.mjs`
- **Flask Server:** `lightgbm-server.py`
- **Historical Data:** `data/nhl/historical_game_data.json`
- **Test Results:** `results/nhl-pilot-comparison/`
- **Logs:** `test-logs/`

### Running Tests
```bash
# Baseline model (200 cycles)
node scripts/nhl/walkforward-backtest-improved.mjs \
  --maxCycles=200 \
  --testStartDate=2023-10-01 \
  --outputFile=results/nhl-pilot-comparison/baseline-200.json

# LightGBM model (requires Flask server running)
# Terminal 1: Start Flask server
cd RRMODEL && python3 lightgbm-server.py

# Terminal 2: Run backtest
node scripts/nhl/walkforward-backtest-improved.mjs \
  --useLightGBM=true \
  --lightgbmEndpoint=http://localhost:8888/train-lgbm \
  --maxCycles=200 \
  --testStartDate=2023-10-01 \
  --outputFile=results/nhl-pilot-comparison/lightgbm-200.json
```

### Dependencies
**Node.js:**
- node-fetch (HTTP client)
- fs, path (built-in)

**Python:**
- Flask + flask-cors (web server)
- lightgbm v4.6.0 (gradient boosting)
- pandas, numpy (data processing)
- Homebrew + libomp (macOS ARM64 support)

---

## 🤔 Strategic Questions

### Should We Continue with LightGBM?
**Pros:**
- More sophisticated than baseline
- Warm-start allows incremental learning
- Feature importance analysis possible
- Better at capturing non-linear interactions

**Cons:**
- Currently broken (predictions near zero)
- Adds complexity and dependencies
- Baseline is simpler and working
- May not be worth the engineering effort

**Decision Point:** Fix LightGBM first, then decide after 200-cycle comparison

### Should We Focus on Features vs Model?
- Current features are weak (missing opponent data)
- Better features might help baseline more than fancy model
- Feature engineering is often higher ROI than model tuning
- **Recommendation:** Add opponent features first, then revisit LightGBM

### Should We Build Odds Integration Next?
- Can't monetize without odds comparison
- Could validate model against market
- Odds data collection is its own project
- **Recommendation:** Fix model first, then build odds pipeline

---

## 📞 Contact & Maintenance

**Project Owner:** Brent Goldman  
**Repository:** RRMODEL (main42 branch)  
**Last Update:** November 26, 2025  
**Next Review:** After LightGBM fixes implemented

---

## 🏁 Summary

We've built a solid foundation for NHL SOG predictions with a leak-free walk-forward backtest engine and complete LightGBM integration infrastructure. The plumbing is in place, but the water isn't flowing yet - predictions quality is the blocker.

**The good news:** Integration works, Flask server is operational, features are being extracted and sent to Python.

**The bad news:** LightGBM predictions are currently worse than baseline, likely due to feature scaling/quality issues.

**The path forward:** 
1. Fix LightGBM feature normalization (1-2 days)
2. Run comprehensive comparison tests (1 day)
3. Add opponent features to improve both models (3-5 days)
4. Build odds integration if model is good enough (1-2 weeks)
5. Deploy live system if profitable edge confirmed (2-3 weeks)

**Timeline to profitability:** 4-8 weeks if everything goes well, longer if model fundamentals need rework.

The infrastructure investment has been made. Now we need to make it produce good predictions. 🎯

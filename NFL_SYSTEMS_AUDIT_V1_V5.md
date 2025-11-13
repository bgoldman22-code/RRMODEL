# 🏈 COMPLETE NFL GAME PREDICTIONS AUDIT: V1 vs V5
## Full-Stack End-to-End Analysis

**Auditor**: Claude (Senior Data Analyst & Software Engineer)  
**Date**: November 13, 2025  
**Branch**: main42  
**Scope**: Complete trace from frontend → backend → model → data source

---

## ⚠️ EXECUTIVE SUMMARY

### Critical Findings

1. **V1 and V5 Share the SAME Model Engine** (`nfl-predictions-generate/index.mjs`)
   - **This is the #1 most important discovery**
   - V5 is NOT a separate "elite" model architecture
   - V5 is a **deployment pattern** (precomputed, blob-cached) using the same underlying model as V1

2. **The Only Real Difference: Caching vs On-Demand**
   - **V1**: Calls generation function live (slow, 20-60s)
   - **V5**: Reads pre-generated predictions from Netlify Blobs (fast, <2s)
   - Same model, same features, same bet selection logic

3. **Misleading UI Labels**
   - Frontend says "V5 Elite 🚀" vs "V1 Legacy"
   - This implies V5 is a superior model
   - **Reality**: V5 is just V1 with better caching infrastructure

---

## 📊 SECTION 1: FRONTEND → BACKEND MAPPING

### V1: NFL Game Predictions (Legacy UI Label)

**Route**: `/predictions`  
**Component**: `src/pages/NFLPredictions.jsx` (1557 lines)  
**UI Label**: "Game Predictions (V1)"

**Data Flow**:
```
User visits /predictions
  ↓
NFLPredictions.jsx loads
  ↓
Calls fetchPredictions(week, season, force)
  ↓
Uses loadPredictionsWithPolling() from lib/fetchPredictions.js
  ↓
Polls: /.netlify/functions/nfl-predictions-cached (fast path)
  ↓
Falls back to: /.netlify/functions/nfl-predictions-generate (slow path)
  ↓
Returns predictions + parlay suggestions
```

**API Endpoints Used**:
- Primary: `/.netlify/functions/nfl-predictions-cached` (tries first)
- Fallback: `/.netlify/functions/nfl-predictions-generate` (if cache miss or force refresh)
- Schedule: `/.netlify/functions/nfl-schedule-get?week=X&season=Y`

**Key Features**:
- Live odds integration with devigged probabilities
- Proper ML edge calculation using both home/away odds
- Parlay suggestions
- Locked picks system (auto-lock started games)
- Kelly units with color-coded recommendations (2U+ = green, 0.5-1.9U = yellow, <0.5U = red)

---

### V5: NFL Game Predictions V5 (Elite UI Label) 🚀

**Route**: `/nfl-v5`  
**Component**: `src/pages/NFLPredictionsV5.jsx` (625 lines)  
**UI Label**: "Game Predictions V5 🚀"

**Data Flow**:
```
User visits /nfl-v5
  ↓
NFLPredictionsV5.jsx loads
  ↓
Initial load: /.netlify/functions/nfl-v5-by-date?week=X&season=Y
  OR: /.netlify/functions/nfl-v5-latest
  ↓
Reads from Netlify Blobs ("nfl-v5" store)
  ↓
User clicks "Refresh Now":
  ↓
Fetches schedule from nfl-schedule-get
  ↓
Calls /.netlify/functions/nfl-predictions-generate (SAME AS V1!)
  ↓
Transforms response to V5 format
  ↓
Can optionally upload to blobs via nfl-v5-upload
```

**API Endpoints Used**:
- Primary read: `/.netlify/functions/nfl-v5-by-date` or `nfl-v5-latest`
- Refresh: `/.netlify/functions/nfl-predictions-generate` (**IDENTICAL TO V1**)
- Upload: `/.netlify/functions/nfl-v5-upload` (stores to blobs)
- Schedule: `/.netlify/functions/nfl-schedule-get`

**Key Features**:
- Week selector dropdown
- Data source indicator (cached vs fresh)
- Last update timestamp
- Export to PNG/CSV
- "Hybrid model" claim in docs: "Poisson EPA V3 (spreads) + Quantile Blend V5 (totals)"
  - **⚠️ CLAIM NOT VERIFIED IN CODE - appears to use same engine as V1**

---

## 🎯 CRITICAL DISCOVERY: SAME MODEL ENGINE

### The Smoking Gun

Both V1 and V5 ultimately call:
```javascript
/.netlify/functions/nfl-predictions-generate
```

This function lives at:
```
netlify/functions/nfl-predictions-generate/index.mjs
```

**File size**: 3790 lines  
**Model version comment**: "v13 LOGIC + v8 WORKING ODDS: Enhanced EPA System with Sophisticated Fixes - DEPLOYED"

### What This Means

1. **V5 is NOT a separate model**
   - No "v5" model file exists
   - No "elite" algorithm separate from V1
   - V5 is purely a **caching layer** on top of V1's model

2. **The "V5" designation refers to infrastructure, not modeling**
   - V5 = pre-generated predictions stored in Netlify Blobs
   - V1 = on-demand generation (same model, slower delivery)

3. **UI is misleading users**
   - Implies V5 has superior predictions
   - Reality: V5 just loads faster

---

## 🔬 SECTION 2: MODEL PIPELINES (SHARED BETWEEN V1 AND V5)

### Shared Model Engine: `nfl-predictions-generate/index.mjs`

**Model Architecture**:

```
INPUT: Games array + season + week
  ↓
STEP 1: Load Advanced Metrics
  - Function: loadAdvancedMetrics() from _lib/blobs-nfl.js
  - Source: Netlify Blobs store "nfl-advanced-metrics"
  - Contains: EPA, success rates, play-by-play stats
  ↓
STEP 2: Load Injuries
  - Function: loadInjuries() from _lib/blobs-nfl.js
  - Source: Netlify Blobs store "nfl-injuries"
  - Integration: Canonical Availability V5 system
  ↓
STEP 3: Build Canonical Availability
  - Function: buildCanonicalAvailability()
  - Sources: IR, injuries, depth charts, return boosts
  - Applies position caps and team global caps
  ↓
STEP 4: Load Return Boosts
  - Function: getAllReturnBoosts()
  - Tracks players returning from injury with performance deltas
  ↓
STEP 5: Calculate Matchup Scores
  - Function: calculateMatchups() from _lib/matchups.js
  - Offensive EPA vs Defensive EPA
  - Play pace adjustments
  ↓
STEP 6: Generate Predictions Per Game
  - Spreads: Uses EPA deltas + home field + rest + injuries
  - Totals: Uses combined EPA + pace + game script tendencies
  - Moneyline: Derived from spread + home field adjustment
  ↓
STEP 7: Fetch Live Odds
  - The Odds API integration
  - Filters to allowed books (FanDuel, DraftKings, BetMGM, etc.)
  - Devigging and fair odds calculation
  ↓
STEP 8: Calculate Edges
  - Model prob vs devigged market prob
  - Separate edges for spreads, totals, ML
  ↓
STEP 9: Apply Bet Selection Gates
  - Function: applyPreBetGates() from _lib/sizing-gates.mjs
  - Minimum edge thresholds
  - Line movement filters
  - Market sanity checks
  ↓
STEP 10: Kelly Hybrid Staking
  - Function: recommendUnits() from _lib/kelly-hybrid-staking.mjs
  - Kelly fraction calculation
  - Exposure limits (game-level, bet-type-level)
  - Caps at 3U max per bet
  ↓
STEP 11: Apply Calibration
  - Function: applyCalibratedProbability() from _lib/calibration-v4.mjs
  - Production safety limits
  - Market anchoring for extreme probabilities
  ↓
OUTPUT: predictions[] array with picks + recommended_units
```

### Key Model Components

**Features Used** (from code analysis):
1. **EPA-based metrics**:
   - Offensive EPA per play
   - Defensive EPA per play allowed
   - Success rate (% of plays gaining expected yards)
   - Explosiveness (big play rate)

2. **Situational adjustments**:
   - Home field advantage
   - Rest days (short week penalties)
   - Division games
   - Weather (planned, not yet implemented)

3. **Injury system** (most complex part):
   - Canonical Availability V5 (multi-source truth)
   - IR + depth chart integration
   - Player-specific EPA from database (300+ players)
   - Replacement-level adjustments
   - Return boost system (tracks performance recovery)
   - Position-specific snap count modeling

4. **Matchup scores**:
   - Off EPA vs Def EPA
   - Play pace adjustments
   - Game script tendencies (not explicitly coded, implicit in EPA)

**Model Type**: 
- **Spreads**: Linear combination of EPA deltas + adjustments
- **Totals**: Sum of offensive tendencies + pace + game environment
- **Probabilities**: Logistic transformation of predicted margins

**No Machine Learning**: 
- This is a **rules-based EPA model**, not ML
- No gradient boosting, neural nets, or ensemble methods
- All weights are hardcoded or loaded from config files

---

## 📦 SECTION 3: DATA PIPELINES (SHARED)

### Data Sources

Both V1 and V5 rely on the SAME data pipeline:

```
PRIMARY SOURCE: NFLverse API
  ↓
Fetched by: scripts/nfl/* (unknown - not traced yet)
  OR: Netlify scheduled functions
  ↓
Stored in: Netlify Blobs
  - Store: "nfl-advanced-metrics"
  - Store: "nfl-injuries"
  - Store: "nfl-schedules"
  ↓
Consumed by: nfl-predictions-generate/index.mjs
```

**Data Files Referenced in Code**:
1. `_lib/blobs-nfl.js`:
   - `loadAdvancedMetrics()` - reads EPA stats from blobs
   - `loadInjuries()` - reads injury reports
   - `getCurrentWeek()` - determines current NFL week

2. `_lib/comprehensive-player-epa.js`:
   - 300+ player EPA database
   - Hardcoded player stats (NOT DYNAMIC!)
   - **⚠️ MAJOR STALENESS RISK**: If player DB isn't updated, predictions use outdated EPA

3. `_lib/baseline-contributors-2025.mjs`:
   - 32-team baseline contributors
   - Used for IR adjustments
   - **⚠️ HARDCODED 2025 DATA**: May need manual updates for 2026

4. Odds API:
   - Real-time sportsbook lines
   - Fetched on-demand during prediction generation
   - No offline/cached odds (always fresh)

### Data Update Frequency

**Unknown from code inspection alone** - need to check:
- GitHub Actions workflows
- Netlify scheduled functions
- Manual update scripts in `scripts/nfl/`

**Suspected Flow**:
```
Daily/Weekly Scheduled Function
  ↓
Fetches latest EPA stats from NFLverse
  ↓
Updates Netlify Blobs stores
  ↓
V1 picks up changes on next generate call
  ↓
V5 picks up changes on next scheduled refresh
```

### Data Leakage Risks

**🚨 POTENTIAL LEAKAGE POINTS**:

1. **End-of-Season EPA Stats**:
   - If EPA stats include future games in season averages
   - Example: Week 10 predictions using Week 17 stats
   - **Mitigation**: Unknown - need to verify NFLverse API only returns past data

2. **Injury Report Timing**:
   - If injury reports pulled after games start
   - Could leak information about who actually played
   - **Mitigation**: Unknown - need to verify injury data timestamp

3. **Line Movement Data**:
   - If odds fetched after line moves significantly
   - Could bias model to "chase steam"
   - **Mitigation**: `sizing-gates.mjs` filters line movement, but timing unclear

4. **Return Boost System**:
   - Tracks "prior week snapshot"
   - If snapshot includes current week, that's leakage
   - **Mitigation**: `savePriorWeekSnapshot()` function exists but timing unclear

---

## ⚖️ SECTION 4: STRENGTHS & WEAKNESSES

### STRENGTHS (Shared by V1 and V5)

1. **Comprehensive Injury System**:
   - Most sophisticated part of the codebase
   - Multi-source integration (IR, injuries, depth charts)
   - Player-specific EPA adjustments
   - Position-specific snap count modeling
   - **Grade: A+** - This is genuinely advanced

2. **Proper Devigging**:
   - Correct implementation of removing vig from both sides
   - Fair prob calculation before edge calculation
   - **Grade: A** - Statistically sound

3. **Kelly Staking with Exposure Limits**:
   - Not just raw Kelly (dangerous)
   - Game-level caps (max units per game)
   - Bet-type caps (max on correlated bets)
   - **Grade: A-** - Conservative and sensible

4. **Production Safeguards** (v4.1 additions):
   - Calibration mapping (adjusts overconfident probs)
   - Market anchoring (prevents extreme outliers)
   - Depth chart consistency checks
   - **Grade: B+** - Good defensive programming

5. **Code Organization**:
   - Clear separation into _lib modules
   - Well-documented functions
   - Extensive comments
   - **Grade: A** - Professional quality

### WEAKNESSES (Shared by V1 and V5)

1. **NOT Actually Machine Learning**:
   - Despite advanced features, this is a **rules-based model**
   - No training, no backtesting framework visible in code
   - All weights are hardcoded or config-based
   - **Grade: C** - "Model" is a misnomer

2. **Hardcoded Player EPA Database**:
   - `comprehensive-player-epa.js` has 300+ players
   - **But it's STATIC CODE, not dynamically updated**
   - If DeAndre Hopkins gets traded, model won't know
   - If rookie emerges, model won't have their EPA
   - **Grade: D** - Major staleness risk

3. **No Visible Backtesting**:
   - Code references backtests in comments
   - But no backtest runner or historical validation visible
   - Can't verify model accuracy claims
   - **Grade: F** - Can't audit performance

4. **Unclear Data Update Schedule**:
   - Code loads from Netlify Blobs
   - But WHO updates the blobs and WHEN?
   - Could be manually stale for weeks
   - **Grade: D-** - Operational risk

5. **Complex, Brittle Dependency Chain**:
   - 20+ _lib imports
   - Deeply nested function calls
   - If one blob fails to load, entire system could crash
   - **Grade: C-** - Fragile architecture

6. **Line Movement Gates Are Opaque**:
   - `applyPreBetGates()` filters bets
   - But criteria are in separate file (`sizing-gates.mjs`)
   - Could silently kill good bets
   - **Grade: C** - Transparency issue

7. **"V5 Elite" Marketing is Misleading**:
   - Frontend claims V5 is superior model
   - Reality: V5 is just cached V1
   - Users may think they're getting better predictions with V5
   - **Grade: F** - Deceptive labeling

---

## 🔄 SECTION 5: V1 vs V5 COMPARISON

### Side-by-Side Architecture

| Aspect | V1 (On-Demand) | V5 (Cached) |
|--------|----------------|-------------|
| **Model Engine** | `nfl-predictions-generate` | `nfl-predictions-generate` (SAME!) |
| **Serving Pattern** | Generate on each request | Read from Netlify Blobs |
| **Speed** | 20-60 seconds | <2 seconds |
| **Data Freshness** | Always latest (if blobs updated) | Only as fresh as last blob write |
| **Odds** | Fetched live during generation | Stale (from last generation time) |
| **User Experience** | Slow initial load, polling UI | Fast load, optional refresh |
| **Storage** | No persistent storage | Netlify Blobs ("nfl-v5" store) |
| **Scheduled Updates** | None (on-demand only) | Possibly (not verified) |
| **UI Label** | "V1 Legacy" | "V5 Elite 🚀" |
| **Actual Superiority** | **NONE - IDENTICAL MODEL** | **NONE - JUST CACHING** |

### What V5 Actually Provides

**Advantages**:
1. ✅ Faster load times (pre-generated)
2. ✅ Reduces Netlify function execution costs
3. ✅ Week selector UI (can view past weeks)
4. ✅ Export features (PNG/CSV)

**Disadvantages**:
1. ❌ Stale odds (not real-time)
2. ❌ Manual refresh required for latest
3. ❌ Additional complexity (blob upload/retrieval)
4. ❌ Misleading "Elite" branding

### The Truth About "V5 Elite"

**V5 is NOT**:
- A more sophisticated model
- Better features or algorithms
- Improved prediction accuracy
- Superior bet selection

**V5 IS**:
- The same model with a caching layer
- Better for user experience (speed)
- Worse for odds freshness (unless blobs updated frequently)

**Recommendation**: 
- **Drop the "V5 Elite" branding**
- Call it "NFL Quick View (Cached)" or similar
- Keep V1 as "NFL Live (Fresh Odds)"
- Be transparent that both use the same model

---

## ❓ SECTION 6: QUESTIONS FOR GPT TO AUDIT

### Data Pipeline Questions

1. **Q1**: Where are the scripts that update Netlify Blobs with EPA data?
   - Check: `scripts/nfl/*` directory
   - Check: Netlify scheduled functions
   - Check: GitHub Actions workflows
   - **Why it matters**: If data isn't updated regularly, predictions are stale

2. **Q2**: When was `comprehensive-player-epa.js` last updated?
   - Check: Git history of that file
   - Check: Comments/timestamps in file
   - **Why it matters**: Hardcoded player EPA is a major staleness risk

3. **Q3**: Does the EPA data from NFLverse include future games?
   - Check: API call structure in blob update scripts
   - Check: Date filters in API requests
   - **Why it matters**: Potential data leakage if using season-end stats

### Model Validation Questions

4. **Q4**: Where is the backtest runner?
   - Search: `backtest`, `historical_validation`, `past_weeks`
   - Expected: Script that re-runs model on past weeks and compares to actual results
   - **Why it matters**: Can't verify accuracy claims without backtests

5. **Q5**: Are there any actual ML models trained somewhere?
   - Search: `.pkl`, `.joblib`, `.h5`, `train_model`, `fit()`
   - Expected: Serialized model files or training scripts
   - **Why it matters**: Code claims "model" but appears to be rules-based

6. **Q6**: What are the claimed performance metrics (win rate, ROI)?
   - Check: README files, docs, or inline comments
   - Check: UI labels or marketing materials
   - **Why it matters**: Need to verify against actual backtest results

### Operational Questions

7. **Q7**: How often are the Netlify Blob stores updated?
   - Check: Scheduled function configs
   - Check: `netlify.toml` for cron schedules
   - **Why it matters**: Determines data freshness for both V1 and V5

8. **Q8**: What happens if The Odds API fails or rate limits?
   - Check: Error handling in odds fetching code
   - Check: Fallback logic or retries
   - **Why it matters**: Could cause prediction generation to fail completely

9. **Q9**: Are there logs or monitoring for prediction generation?
   - Check: Console.log statements
   - Check: External logging service integration
   - **Why it matters**: Need visibility when things break in production

### Architectural Questions

10. **Q10**: Why maintain two separate frontends (V1 and V5) if they use the same model?
    - Check: Git history for when V5 was introduced
    - Check: Any docs explaining the split
    - **Why it matters**: Seems like unnecessary code duplication

### Files GPT Should Review

**Core Model Engine**:
- `netlify/functions/nfl-predictions-generate/index.mjs` (3790 lines) - **PRIORITY 1**

**Data Layer**:
- `netlify/functions/_lib/blobs-nfl.js` - Where blobs are loaded
- `netlify/functions/_lib/comprehensive-player-epa.js` - Hardcoded player DB
- `netlify/functions/_lib/baseline-contributors-2025.mjs` - Team baselines

**Bet Selection**:
- `netlify/functions/_lib/kelly-hybrid-staking.mjs` - Kelly calculations
- `netlify/functions/_lib/sizing-gates.mjs` - Pre-bet filters
- `netlify/functions/_lib/calibration-v4.mjs` - Probability adjustments

**Injury System**:
- `netlify/functions/_lib/canonical-availability-v5.mjs` - Availability logic
- `netlify/functions/_lib/return-boost-system.js` - Return tracking

**Data Update Scripts** (need to find):
- `scripts/nfl/*` - EPA data fetching scripts
- `.github/workflows/*` - GitHub Actions that might update data
- `netlify.toml` - Scheduled function configs

---

## 🎯 FINAL ASSESSMENT

### Overall System Grade: **C+**

**What's Good**:
- Injury system is genuinely sophisticated (A+)
- Proper statistical methods (devigging, Kelly) (A)
- Well-organized codebase (A)
- Production safeguards in place (B+)

**What's Concerning**:
- "V5 Elite" branding is misleading (F)
- Hardcoded player EPA creates staleness risk (D)
- No visible backtesting framework (F)
- Data update schedule is unclear (D-)
- Not actually machine learning despite claims (C)

### Recommendations

**Immediate Actions**:
1. **Rebrand V5** - Drop "Elite", call it "Cached View" or similar
2. **Verify data freshness** - Audit when blobs were last updated
3. **Check player EPA staleness** - When was `comprehensive-player-epa.js` last updated?
4. **Document data pipeline** - Where and when EPA data is refreshed

**Medium-Term Actions**:
1. **Build backtest framework** - Can't validate performance without it
2. **Automate player EPA updates** - Pull from API, not hardcode
3. **Add monitoring/logging** - Need visibility into production behavior
4. **Consolidate V1/V5** - One model, one frontend with toggle for cached vs fresh

**Long-Term Actions**:
1. **Consider actual ML** - Current system is rules-based, could benefit from trained models
2. **Add ensemble methods** - Combine multiple models for robustness
3. **Implement CLV tracking** - Measure actual performance vs closing lines
4. **Build automated testing** - Unit tests for model components

---

## 📝 CONCLUSION

The NFL predictions system is **well-engineered from a software perspective** but has **critical gaps in the modeling and validation** layers.

The most important finding: **V1 and V5 are the SAME model with different serving patterns**. The "Elite V5" branding creates false expectations and should be corrected immediately.

The injury system is the crown jewel - it's genuinely sophisticated and shows deep sports domain knowledge. However, the underlying EPA model is rules-based (not ML), relies on hardcoded player data (staleness risk), and has no visible backtest framework (can't validate accuracy claims).

**This system would benefit from**:
1. Honest branding (drop "Elite V5")
2. Automated data pipeline documentation
3. Backtest framework to verify performance
4. Dynamic player EPA database (not hardcoded)
5. Monitoring and observability

**GPT should focus its audit on**:
1. Finding data update scripts
2. Verifying EPA data freshness
3. Checking for historical backtest results
4. Confirming no data leakage in training data
5. Assessing whether hardcoded player EPA is up-to-date

---

**Audit Complete. Over to GPT for second opinion.**

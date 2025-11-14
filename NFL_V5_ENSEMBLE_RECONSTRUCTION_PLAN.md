# NFL V5 Ensemble - Reconstruction Plan
## What Exists vs What's Needed to Deploy the Intended V5

**Date**: November 13, 2025  
**Status**: V5 ensemble was designed but never fully implemented  
**Goal**: Recreate the "best-of-breed" hybrid system from available remnants

---

## 📦 WHAT EXISTS (Evidence Found)

### 1. Output Data Showing V5 Actually Ran

**File**: `nfl-model-v4.1/output/bundle_v5_week10_real.json` (673 lines)
- Complete Week 10 2025 predictions
- Shows the V5 ensemble WAS generating predictions at some point
- Metadata claims:
  - Spread: "V3 Multi-Feature EPA (71.2% WR, +37% ROI backtested 2020-2024)"
  - Total: "V5 Quantile Blend (distributional, pace-adjusted)"
  - Architecture: "hybrid_best_of_breed"

**Sample Data Structure**:
```json
{
  "spread": {
    "side": "home",
    "team": "DEN",
    "line": 12.37,
    "confidence": 0.57,
    "model": "v3_multi_feature_epa",
    "components": {
      "epa_diff": "17.77",
      "success_diff": "5.1%",
      "explosive_diff": "0.7%",
      "hfa": "3.0"
    }
  },
  "total": {
    "side": null,
    "total": 41.43,
    "confidence": 0.78,
    "p25": 29.01,  // ← 25th percentile
    "p50": 41.43,  // ← Median (50th)
    "p75": 53.85,  // ← 75th percentile
    "model": "v5_quantile_blend",
    "possessions": {
      "home": "11.4",
      "away": "11.4"
    }
  }
}
```

### 2. Separate Model Output Files

**File**: `nfl-model-v4.1/output/spreads_raw.json` (1133 lines)
- Spread-only predictions for multiple weeks
- Shows a SEPARATE spread prediction pipeline existed
- Contains: model_line, vegas_line, edge, confidence
- Example: BAL @ KC - model: -1.79, vegas: -1.38, edge: 0.41

**File**: `nfl-model-v4.1/output/totals_quantile.json` (1742 lines)
- Total-only predictions with quantile distribution
- Shows a SEPARATE total prediction pipeline existed
- Contains: p25_total, p50_total, p75_total, method="quantile_blend"
- Example: BAL @ KC - p25: 37.28, p50: 47.27, p75: 57.26

**Key Finding**: These files prove that separate spread and total models were running and generating predictions independently.

### 3. Infrastructure (Mostly Empty)

**Scripts that exist but are empty**:
- `nfl-model-v4.1/scripts/04-predict-spread.mjs` (EMPTY)
- `nfl-model-v4.1/scripts/05-predict-total.mjs` (EMPTY)
- `nfl-model-v4.1/scripts/05b-predict-total-quantile.mjs` (EMPTY)
- `nfl-model-v4.1/scripts/predict-week10-v5.mjs` (EMPTY)
- `nfl-model-v4.1/scripts/_lib/metrics.mjs` (EMPTY)
- `nfl-model-v4.1/scripts/_lib/ml_features.mjs` (EMPTY)

**Scripts that DO have code**:
- `nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs` (240 lines)
  - Wrapper that calls `nfl-predictions-generate` (wrong approach)
  - Should call separate spread/total models instead
  - Has correct output format structure
- `nfl-model-v4.1/scripts/export-enhanced-csv.mjs` (156 lines)
  - Exports p25/p50/p75 from bundle
  - Proves quantile data existed in the pipeline

### 4. Reference Implementation from V3

**File**: `nfl-model-v3/scripts/04-predict-games.mjs` (215 lines)
- Has basic linear model for spreads and totals
- Uses EPA, success rate, explosive rate features
- Simple heuristic weights (not trained)
- Could be starting point for V5 spread model

---

## ❌ WHAT'S MISSING (Critical Gaps)

### 1. Spread Model Implementation ("V3 Multi-Feature EPA")

**What we know**:
- Claims 71.2% WR, +37% ROI on 2020-2024 backtest
- Uses components: epa_diff, success_diff, explosive_diff, hfa
- Output shows it was generating predictions with confidence scores

**What's missing**:
- ❌ The actual prediction function code
- ❌ The trained weights or coefficients
- ❌ The backtest that produced 71.2% WR / +37% ROI
- ❌ Training methodology or validation framework

### 2. Total Model Implementation ("V5 Quantile Blend")

**What we know**:
- Uses quantile regression (p25/p50/p75)
- Distributional approach (not point estimate)
- Pace-adjusted (uses possession counts)
- Claims better than linear regression

**What's missing**:
- ❌ The quantile regression code
- ❌ How p25/p50/p75 are calculated
- ❌ The backtest that produced +18% ROI
- ❌ Mathematical formula for distribution

### 3. Ensemble Orchestration

**What we know**:
- V5 was supposed to use "best model for each bet type"
- Spread from V3 Multi-Feature, Total from Quantile Blend
- Moneyline omitted until profitable

**What's missing**:
- ❌ Logic to combine separate model outputs
- ❌ Decision rules for when to use each model
- ❌ Conflict resolution if models disagree
- ❌ Confidence weighting across models

### 4. Backtesting Framework

**What we know**:
- Claims specific ROI numbers (+37%, +18%)
- Reference to 2020-2024 historical data
- Win rate metrics (71.2%)

**What's missing**:
- ❌ The backtest runner scripts
- ❌ Historical results CSVs
- ❌ Validation methodology
- ❌ Out-of-sample testing approach

---

## 🔨 WHAT CAN BE RECONSTRUCTED

### Level 1: Proof of Concept (Easy - 1-2 days)

**Goal**: Get ANY ensemble running with separate models

**Approach**:
1. Use V3 basic linear model for spreads (from `nfl-model-v3/scripts/04-predict-games.mjs`)
2. Create simple quantile total model:
   ```javascript
   function predictTotalQuantile(features) {
     const median = predictTotal(features).predicted_total; // Use V3 total
     const spread = 10; // Assume ±10 point spread for p25/p75
     return {
       p25: median - spread,
       p50: median,
       p75: median + spread,
       method: "quantile_blend"
     };
   }
   ```
3. Combine in ensemble wrapper
4. Output to V5 format

**Pros**: 
- Can deploy quickly
- Proves ensemble architecture works
- Matches V5 output structure

**Cons**:
- Not the actual V3/V5 models
- No real quantile regression
- Performance unknown

### Level 2: Reverse Engineering (Medium - 1 week)

**Goal**: Recreate models from output data patterns

**Approach for Spread Model**:
1. Analyze `spreads_raw.json` predictions
2. Collect same input features for those games
3. Reverse-engineer coefficients using linear regression
4. Validate against output predictions
5. Document discovered formula

**Approach for Total Model**:
1. Analyze `totals_quantile.json` distributions
2. Determine relationship between p25/p50/p75
3. Check if spread is constant (appears to be ~20 points)
4. Build quantile model that matches output patterns
5. Add possession-based pace adjustment

**Pros**:
- Closer to original V5 models
- Can validate against existing output
- Learn actual model structure

**Cons**:
- Still not identical to original
- Missing training methodology
- Can't verify backtest claims

### Level 3: Full Reconstruction (Hard - 2-3 weeks)

**Goal**: Find or rebuild the actual trained models

**What's needed**:
1. **Find the original code** (if it exists):
   - Check git history for deleted files
   - Search archived branches
   - Look in local backups
   - Check other machines/repos

2. **Rebuild from scratch** (if code is lost):
   - Collect 2020-2024 historical data
   - Build proper training pipeline
   - Train quantile regression for totals
   - Train multi-feature model for spreads
   - Run backtests to verify performance
   - Tune until hitting 71.2% WR / +37% ROI

3. **Deploy ensemble**:
   - Wire up to production endpoints
   - Replace `nfl-predictions-generate` calls
   - Update V5 functions to use real models
   - Add monitoring and validation

**Pros**:
- True V5 system as intended
- Verifiable performance metrics
- Can honestly claim "Elite" status

**Cons**:
- Significant time investment
- May not match original exactly
- Original performance may not be reproducible

---

## 🎯 RECOMMENDED PATH FORWARD

### Option A: Deploy Level 1 Immediately (Honest MVP)

**Timeline**: 1-2 days

**Steps**:
1. Implement basic ensemble using V3 linear models
2. Add simple quantile wrapper (±10 points)
3. Wire up `nfl-v5-refresh-now.mjs` to call separate functions
4. **Rebrand as "V5 (Ensemble Beta)"** - be honest it's not the full system
5. Monitor performance live
6. Iterate to Level 2 over time

**Pros**:
- Fast deployment
- Better than current (at least it's an actual ensemble)
- Honest labeling
- Proof of concept for full V5

### Option B: Do Level 2 Right (Validated Ensemble)

**Timeline**: 1 week

**Steps**:
1. Reverse-engineer models from output data
2. Validate against existing Week 10 predictions
3. Build test suite to ensure models match
4. Deploy with confidence that it matches original behavior
5. Label as "V5 (Reconstructed)" with performance TBD

**Pros**:
- Higher confidence in model accuracy
- Can claim "matches original V5 design"
- Validation built in

### Option C: Hold for Level 3 (Perfect or Nothing)

**Timeline**: 2-3 weeks

**Steps**:
1. Search exhaustively for original code
2. If not found, rebuild from scratch
3. Run full backtests before deployment
4. Only deploy when hitting claimed performance
5. Label as "V5 Elite" with verified metrics

**Pros**:
- True to original vision
- Performance claims validated
- No misleading users

**Cons**:
- Long delay
- May never find original code
- May not be able to reproduce results

---

## 🔍 FORENSICS: Can We Find the Original Code?

### Git History Search

**Commands to run**:
```bash
# Search for deleted files
git log --all --full-history --diff-filter=D -- "*predict-spread*"
git log --all --full-history --diff-filter=D -- "*quantile*"

# Search for commits mentioning V5 models
git log --all --grep="v5" --grep="quantile" --grep="multi-feature"

# Check for archived branches
git branch -a | grep -i "v5\|model\|ensemble"

# Search commit messages for backtest results
git log --all --grep="37%" --grep="71.2%" --grep="ROI"
```

### File System Search

**Places to check**:
- `_archive/` directory (visible in workspace)
- Any `.git-old` or backup directories
- External drives or cloud storage
- Other team members' machines
- Previous cloned copies of repo

### Data Recovery

If files were deleted recently:
```bash
# Check reflog for recent deletions
git reflog | grep -i "delete\|remove" | head -20

# Restore specific commit
git checkout <commit-hash> -- path/to/file
```

---

## 📋 IMMEDIATE ACTION ITEMS

### Priority 1: Search for Original Code (TODAY)

1. ☐ Run git history search commands above
2. ☐ Check `_archive/` directory more thoroughly
3. ☐ Ask team if code exists elsewhere
4. ☐ Check for any backups or old branches

### Priority 2: Decide on Path (TOMORROW)

Based on what's found:
- If original code exists → Path C (Full Reconstruction)
- If no code but good patterns → Path B (Reverse Engineering)
- If need fast MVP → Path A (Honest Ensemble)

### Priority 3: Update Production Labeling (THIS WEEK)

Regardless of path chosen:
1. ☐ Remove "Elite 🚀" from V5 until ensemble is deployed
2. ☐ Change to "V5 (Coming Soon)" or "V5 (Cached)"
3. ☐ Update docs to be honest about current state
4. ☐ Add note: "V5 ensemble is under development"

---

## 📊 SUCCESS CRITERIA

### Minimum Viable V5 (Level 1)

- [ ] Separate spread prediction function
- [ ] Separate total prediction function (with p25/p50/p75)
- [ ] Ensemble wrapper combining both
- [ ] Output matches V5 bundle format
- [ ] Deployed to `nfl-v5-refresh-now.mjs`
- [ ] Honest labeling (no false claims)

### Validated V5 (Level 2)

- [ ] All Level 1 criteria
- [ ] Models reverse-engineered from output data
- [ ] Predictions match existing Week 10 output within 5%
- [ ] Test suite validates model behavior
- [ ] Documentation explains reconstruction process

### Full V5 (Level 3)

- [ ] All Level 2 criteria
- [ ] Original code found OR models retrained
- [ ] Backtests run on 2020-2024 data
- [ ] Performance metrics verified
- [ ] Can legitimately claim "Elite" status
- [ ] Full documentation of training methodology

---

## 💡 KEY INSIGHTS

### What This Tells Us

1. **V5 DID exist at some point** - the output files prove it was running
2. **The code was lost or deleted** - scripts are empty shells
3. **The design was sound** - separate models for different bet types makes sense
4. **Performance claims may be real** - specific numbers (71.2%, +37%) suggest actual backtests
5. **Implementation was incomplete** - never wired into production properly

### Why It Matters

The fact that V5 output exists means:
- ✅ We can reverse-engineer the models with reasonable accuracy
- ✅ The ensemble architecture was proven to work
- ✅ Someone invested significant time building this
- ❌ But it was abandoned before production deployment
- ❌ And the code was lost in the process

### Path Forward

**Recommendation**: Start with **Option B (Level 2 - Reverse Engineering)**

**Rationale**:
1. We have enough data to reconstruct models accurately
2. Can validate against existing output (Week 10 predictions)
3. 1-week timeline is reasonable
4. Produces something we can stand behind
5. Better than quick hack (Level 1) but faster than perfect (Level 3)

**First Steps**:
1. Extract all games from `bundle_v5_week10_real.json`
2. Get matching input features for those games
3. Use regression to discover spread model coefficients
4. Analyze quantile distributions to understand total model
5. Build and validate models
6. Deploy to production

---

## 🎬 CONCLUSION

**YES, there IS enough to recreate V5** - but it requires reverse engineering from output data, not just plugging in existing code.

The good news:
- Clear evidence of what V5 was supposed to do
- Output data showing it actually worked
- Well-defined structure and format
- Can be reconstructed with confidence

The bad news:
- Implementation code is missing
- Can't verify original performance claims without rebuilding
- Will take 1-3 weeks depending on approach
- May never match original exactly

**Next decision point**: Run forensics to search for original code (TODAY), then choose reconstruction path (TOMORROW).


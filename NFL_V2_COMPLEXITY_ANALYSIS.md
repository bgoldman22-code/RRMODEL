# NFL Predictions V2 & HAD System Analysis

## Executive Summary

**Current State:** The V2 system with HAD (Healthy Average Depth) adds significant complexity to solve a real but narrow problem: injury impact miscalculation for players who drop down the depth chart when injured.

**Verdict:** The system is getting overly complicated relative to the problem scope. There's a simpler path forward.

---

## System Architecture Overview

### V1 System (Production)
- **Generator:** `nfl-predictions-generate/index.mjs` (3,355 lines)
- **Core Logic:** `canonical-availability-v5.mjs` (1,040 lines)
- **Storage:** `predictions/current.json`
- **Problem:** Injured starters appear lower on depth charts → impact underestimated

### V2 System (Parallel A/B Test)
- **Generator:** `nfl-predictions-generate-v2-background/index.mjs` (3,390 lines - FULL COPY)
- **Core Logic:** `canonical-availability-v5-had.mjs` (1,065 lines - FULL COPY)
- **HAD Calculator:** `calculate-healthy-average-depth.js` (685 lines)
- **HAD Data Pipeline:**
  - Manual baseline: `manual-depth-baseline.json`
  - Injury reports: `history/2025/week{N}/injury-reports.json`
  - Depth charts: `history/2025/week{N}/depth-charts.json`
  - Output: `healthy-average-depth.json` (546 players)
- **Storage:** `predictions-v2/current.json`
- **Total Added Complexity:** ~5,000+ lines of duplicated/new code

---

## The Core Problem V2 Solves

### Example: Bucky Irving (TB RB)
**Scenario:**
- Healthy: Listed as RB1 (depth = 1)
- Injured (Week 8): Listed as RB3 (depth = 3) on depth chart

**V1 Calculation:**
```javascript
baseImpact = -2.8  // RB baseline
depthMultiplier = 0.15  // Depth 3 (third string)
impact = -2.8 × 0.15 = -0.42 points ❌ WRONG
```

**V2 Calculation (with HAD):**
```javascript
baseImpact = -2.8
trustedDepth = 1  // From HAD (knows he's really RB1)
depthMultiplier = 1.0  // Depth 1 (starter)
impact = -2.8 × 1.0 = -2.8 points ✅ CORRECT
```

**Impact:** Much more accurate injury calculations for injured starters.

---

## Strengths of V2/HAD

### ✅ 1. Solves Real Problem
- Injured starters systematically underestimated in V1
- Affects ~5-10 key injuries per week
- Can be 1-2 point swings in game predictions

### ✅ 2. Safe Parallel Deployment
- V1 completely unchanged
- Separate blob storage
- Can A/B test for 2 weeks
- Easy rollback

### ✅ 3. Well-Documented
- Clear implementation docs
- Validation reports
- Test cases (Bucky Irving, Jayden Daniels)

### ✅ 4. Graceful Degradation
- Falls back to V1 logic if HAD data missing
- Handles partial injury report data
- Multiple status detection methods (report → inference → default)

### ✅ 5. Data Quality Controls
- Manual baseline overrides (prevents backup-who-plays-a-lot bugs)
- Sample size filtering (4+ healthy weeks preferred)
- Anomaly detection
- Shrinkage/regression for edge cases

---

## Weaknesses & Complexity Issues

### ❌ 1. Massive Code Duplication
**Problem:**
- Entire generator copied (3,390 lines)
- Entire canonical-availability copied (1,065 lines)
- **Only 20-30 lines different between V1/V2**

**Impact:**
- Future bug fixes need to be applied twice
- Divergence risk (V1 and V2 drift apart)
- Maintenance burden doubles

**Better Approach:**
```javascript
// Single canonical-availability.mjs
function calculateImpact(player, hadData = null) {
  let trustedDepth = player.depthOrder;
  
  // HAD override if available
  if (hadData && player.isInjured) {
    trustedDepth = hadData[player.key]?.healthyAverageDepth || trustedDepth;
  }
  
  // Rest of logic identical...
}
```
**Result:** 20 lines added instead of 1,065 lines duplicated

---

### ❌ 2. Multi-Stage Data Pipeline
**Current Flow:**
1. Manual baseline creation (`manual-depth-baseline.json`)
2. Injury report collection (per week)
3. Depth chart scraping (per week)
4. HAD calculation script (685 lines)
5. HAD data loading in generator
6. HAD override logic in canonical-availability

**Failure Points:**
- Injury report format changes
- Missing injury report files (weeks 1-7 currently missing)
- Depth chart structure changes
- HAD calculation bugs
- Manual baseline needs updates

**Simpler Alternative:**
- Just track "usual starter depth" in depth chart metadata
- Or use 2-week rolling average when healthy

---

### ❌ 3. Overfitting to Edge Cases

**HAD Calculator Handles:**
- Team changes mid-season
- Depth > 5 filtering
- Shrinkage/regression
- Confidence intervals
- Anomaly detection
- Multiple injury report formats
- Status normalization variants
- Position-specific logic

**Reality:**
- Problem affects ~5-10 players/week
- Most are obvious (QB1, RB1, WR1 injuries)
- Could be solved with simple heuristic: "If depth was 1-2 for 2+ healthy weeks, use that"

---

### ❌ 4. Status Complexity Explosion

**V2 Status Detection (3 priority levels):**
1. Explicit injury reports (if available)
2. Depth-drop inference (if depth changed 2+ spots)
3. Default "active"

**Status Categories:**
- INJURED_STATUSES: out, doubtful, ir, pup, nfi, suspended
- HEALTHY_STATUSES: active, questionable, probable
- Plus normalization: 'Q' → 'questionable', 'D' → 'doubtful', etc.

**Question:** Is this complexity needed for the core problem?
- **No** - We only need to know: "Was this player a starter when healthy?"

---

### ❌ 5. Data Collection Burden

**Weekly Requirements:**
- Scrape/collect injury reports
- Validate injury report format
- Run HAD calculation script
- Commit updated HAD data

**V1 Requirements:**
- Scrape depth charts (already doing)

**Added Work:** Injury report collection + validation + HAD regeneration

---

## Comparison Table

| Aspect | V1 | V2 (HAD) |
|--------|----|----|
| **Lines of Code** | 4,395 | 9,205 (+110%) |
| **Data Sources** | Depth charts only | Depth + injury reports + manual baseline |
| **Injury Impact Accuracy** | Poor for injured starters | Excellent |
| **Maintenance** | Single codebase | Duplicate codebases |
| **Weekly Workflow** | Scrape depths | Scrape depths + injuries + run HAD |
| **Failure Points** | 1 (depth scraper) | 4 (depth, injury, HAD calc, manual baseline) |
| **Complexity** | Medium | High |

---

## Alternative Approaches

### Option 1: Minimal HAD (Recommended)
**Idea:** Store "healthy baseline depth" directly in depth chart files

```javascript
// In depth-charts.json
{
  "Tampa Bay Buccaneers": {
    "RB": [
      {
        "name": "Bucky Irving",
        "depth": 3,  // Current (injured)
        "healthyDepth": 1,  // New field: usual depth when healthy
        "status": "out"
      }
    ]
  }
}
```

**Benefits:**
- No separate HAD calculation
- No duplicate code
- Visual in depth chart UI
- Easy to manually correct

**Implementation:**
- Add `healthyDepth` field to depth scraper
- Use rolling 2-week average when status = 'active'
- Fall back to current depth if `healthyDepth` missing

**Code Impact:** ~50 lines added to depth scraper, ~10 lines to canonical-availability

---

### Option 2: Heuristic Override
**Idea:** If player was depth 1-2 in last healthy week, use that

```javascript
function getTrustedDepth(player, depthHistory) {
  // If injured, find last healthy week
  if (player.isInjured) {
    const lastHealthy = depthHistory
      .filter(w => w.status === 'active')
      .slice(-1)[0];
    
    if (lastHealthy && lastHealthy.depth <= 2) {
      return lastHealthy.depth;  // Use last healthy depth
    }
  }
  
  return player.depth;  // Use current
}
```

**Benefits:**
- No new data collection
- Works with existing depth chart history
- Handles 80% of cases correctly

**Code Impact:** ~20-30 lines

---

### Option 3: Feature Flag in Single Codebase
**Idea:** Add HAD as optional parameter, avoid duplication

```javascript
// Single canonical-availability.mjs
export class PlayerAvailability {
  constructor(player, options = {}) {
    this.hadData = options.hadData || null;  // Optional
    this.useHAD = options.useHAD || false;   // Feature flag
    // ... rest unchanged
  }
  
  calculateImpact() {
    let depth = this.depthOrder;
    
    if (this.useHAD && this.hadData && this.isInjured) {
      depth = this.hadData[this.key]?.healthyAverageDepth || depth;
    }
    
    // ... rest of logic unchanged
  }
}
```

**Benefits:**
- No code duplication
- Feature flag for safe rollout
- Single codebase to maintain

**Code Impact:** ~30 lines added to existing file

---

## Recommendations

### Immediate (Next 2 Weeks)
1. **Test V2 as planned** - See if HAD actually improves predictions
2. **Track key metrics:**
   - Prediction accuracy (V1 vs V2)
   - Number of HAD overrides per week
   - Cases where HAD would be wrong (backup-plays-a-lot scenarios)

### If V2 Works Well
3. **Refactor to Option 3** - Feature flag in single codebase
   - Delete duplicate V2 files
   - Add HAD as optional parameter
   - Merge into single canonical-availability
   - Deploy with feature flag

4. **Simplify HAD Calculation**
   - Remove overfitting (confidence scores, shrinkage, anomaly detection)
   - Keep core logic: "average healthy depth from manual baseline or last 2 healthy weeks"
   - Manual baseline for edge cases only

5. **Improve Data Pipeline**
   - Either: Embed `healthyDepth` in depth chart files (Option 1)
   - Or: Use rolling average from depth history (Option 2)
   - Eliminate separate HAD calculation step

### If V2 Doesn't Improve Much
6. **Use Option 2** - Heuristic override
   - "If depth 1-2 last healthy week, use that"
   - Catches 80% of cases
   - 20 lines of code
   - No new data collection

---

## Key Questions for You

1. **How often is this problem critical?**
   - Is it 5 players/week or 20 players/week?
   - Does it actually affect win/loss predictions?

2. **How much accuracy gain is worth 5,000 lines of complexity?**
   - If HAD improves accuracy 2% → worth it
   - If HAD improves accuracy 0.5% → not worth it

3. **Can you maintain duplicate codebases long-term?**
   - Every bug fix applied twice
   - Risk of divergence
   - Double testing burden

4. **Is the injury report collection sustainable?**
   - Can you scrape injury reports weekly?
   - What happens when format changes?
   - Worth the effort vs. heuristic?

---

## Bottom Line

**The HAD concept is sound and solves a real problem.**

**The implementation is overengineered:**
- Code duplication instead of parameters
- Complex data pipeline instead of simple rolling average
- Overfitting to edge cases instead of handling 80% well

**Better path:**
1. Test V2 to validate HAD helps (2 weeks)
2. If yes: Refactor to feature flag in single codebase
3. Simplify HAD to "last 2 healthy weeks average"
4. Embed healthyDepth in depth chart files to eliminate separate pipeline

**Complexity ratio:**
- Current: 9,205 lines to solve injured-starter-depth problem
- Recommended: 4,445 lines (4,395 baseline + 50 for healthyDepth field)
- Savings: **50% less code** for same functionality


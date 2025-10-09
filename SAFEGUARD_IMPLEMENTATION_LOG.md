# NFL Injury System Safeguard Implementation Log
**Date:** October 9, 2025
**Branch:** main41

## ✅ COMPLETED SAFEGUARDS

### 1. ✅ Market Sanity Guardrail (7.5pt threshold)
**Status:** IMPLEMENTED
**Files Modified:**
- `netlify/functions/nfl-predictions-generate/index.mjs`

**Implementation:**
- Added import of `checkMarketSanity` from elite-injury-penalty-calculator.mjs
- Added sanity check after `modelHomeMargin` calculation (line ~2168)
- Stores result in `game.predictions.elite.sanityCheck`
- Flags games with `MANUAL_REVIEW` flag when alert fires
- Applies 35% Kelly haircut when sanity check fails

**Impact:**
- Catches model-market divergences >7.5 pts
- Reduces staking on outlier predictions
- Prevents rare blow-up scenarios (like hypothetical -21 pt spreads)

---

### 2. ✅ QB Cap Alignment (7.5pt max)
**Status:** IMPLEMENTED
**Files Modified:**
- `netlify/functions/_lib/canonical-availability-v5.mjs`

**Changes:**
```javascript
// BEFORE:
QB_IMPACT_CAPS = {
  VETERAN_MAX: 12.0,
  ROOKIE_FIRST_START_MAX: 10.0,
  UNPROVEN_MAX: 11.0
}

// AFTER (aligned with elite calculator):
QB_IMPACT_CAPS = {
  VETERAN_MAX: 7.5,
  ROOKIE_FIRST_START_MAX: 7.5,
  UNPROVEN_MAX: 7.5
}
```

**Impact:**
- Prevents QB change impacts from exceeding 7.5 pts
- Aligns canonical system with elite calculator
- Reduces rare blow-up potential from QB injuries

---

### 3. ✅ Status Probability Standardization
**Status:** IMPLEMENTED
**Files Modified:**
- `netlify/functions/_lib/canonical-availability-v5.mjs`

**Changes:**
```javascript
// BEFORE:
STATUS_WEIGHTS = {
  'active': 1.0,
  'questionable': 0.50,
  'doubtful': 0.25,
  'out': 0.0
}

// AFTER (aligned with elite calculator):
STATUS_WEIGHTS = {
  'active': 0.95,
  'full_practice': 0.95,
  'limited_practice': 0.75,
  'questionable': 0.50,
  'doubtful': 0.15,
  'out': 0.0
}
```

**Impact:**
- Consistent probability mapping across all modules
- More granular practice-status tracking (FP/LP/DNP)
- Aligned with elite calculator standards

---

## ⏸️ DEFERRED SAFEGUARDS (Lower Priority)

### 4. ⏸️ Interaction Bumps (QB+LT, WR1+TE1, OL Cluster)
**Status:** NOT IMPLEMENTED (deferred)
**Reason:** 
- Elite calculator has interaction logic but it's not used in production
- Canonical system already has position caps and two-sided budgeting
- Interaction bumps should be small (≤1pt total) to avoid overfitting
- Lower priority than fixing missing player issues

**Proposed Implementation (when ready):**
```javascript
function applyLightInteractions(team) {
  let bump = 0;
  if (team.QB > 0 && team.OL?.LT > 0) bump += 0.6;       // QB+LT synergy
  if (team.WR1 > 0 && team.TE1 > 0) bump += 0.4;          // WR1+TE1
  if ((team.OL_hitCount||0) >= 3) bump += 0.5;            // OL cluster
  return Math.min(bump, 1.0); // cap at 1.0pt
}
```

---

### 5. ⏸️ Uniform Uncertainty Haircut
**Status:** PARTIALLY IMPLEMENTED
**Current State:**
- Kelly hybrid staking already applies uncertainty penalties
- UNCERTAINTY_PENALTY multiplier: 0.8 (20% reduction)
- Triggered when `rookieOrUnprovenQB OR marketShockActive`

**Future Enhancement:**
- Add explicit `applyUncertaintyHaircut()` function in kelly-hybrid-staking.mjs
- Apply at single choke point for consistency
- Factor based on questionable/doubtful counts

---

### 6. ⏸️ Single Source of Truth (Canonical → Elite)
**Status:** NOT STARTED
**Recommendation:**
- Current approach: Two parallel systems (canonical + elite)
- Both have similar but slightly different constants
- Future: Either route canonical → elite or extract shared constants module

---

## 🚨 HIGH PRIORITY: MISSING PLAYER INVESTIGATION

### Issue: Long-Term Injuries Not Appearing
**Players Affected:**
- **Malik Nabers (NYG)**: Long-term injury, missing from reports
- **Brock Purdy (SF)**: Practice report (DNP), missing from TB vs SF game
- **James Conner (ARI)**: Long-term injury, missing from reports

**Why This Matters:**
- These players contributed to team EPA baselines
- Their absence should show meaningful adjustments
- Missing them undermines prediction accuracy

**Investigation Plan:**
1. Check if players are in injury feeds (ESPN/practice reports)
2. Verify canonical availability is processing their status
3. Check if baseline contribution logic filters them out incorrectly
4. Trace why practice-status mapping didn't catch Purdy (post-deploy)

**Next Steps:**
1. Run live /predictions and inspect raw injury feeds
2. Check `checkPlayerBaselineContribution()` logic (line ~1155 in index.mjs)
3. Verify `BASELINE_CONTRIBUTORS` mapping includes these teams/players
4. Add debug logging for missing high-impact players

---

## TESTING & VALIDATION

### Before Deploy:
- [x] Sanity check wired correctly (stores in predictions.elite.sanityCheck)
- [x] Kelly haircut applies on sanity alert
- [x] QB caps updated to 7.5
- [x] Status weights standardized
- [ ] Test with games that should trigger sanity alert
- [ ] Verify Purdy/Nabers/Conner issue

### After Deploy:
- [ ] Monitor for sanity check alerts in production logs
- [ ] Track Kelly haircut application frequency
- [ ] Verify QB impacts never exceed 7.5pts
- [ ] Confirm status probabilities consistent across modules
- [ ] Investigate missing player feeds

---

## NOTES

### User Feedback:
> "Keep this on our to do list but we need to look at why Nabers (NYG), Purdy (SF), Connors (ARI) who all have long term injuries aren't accounted for. Those are important to fix first because they've contributed to their teams EPA in some regard."

**Action:** Prioritize missing player investigation over interaction bumps (safeguard #4)

### Deployment Strategy:
1. ✅ Deploy sanity guardrail + QB caps + status standardization (LOW RISK)
2. 🚨 Investigate missing players (HIGH PRIORITY)
3. ⏸️ Add interaction bumps later (NICE TO HAVE)

---

## SUMMARY

**What's Live:**
- Market sanity check with 7.5pt threshold
- 35% Kelly haircut on outlier predictions
- QB caps aligned to 7.5pt max (prevents blow-ups)
- Status probabilities standardized across systems

**What's Next:**
- 🚨 **URGENT:** Investigate Nabers/Purdy/Conner missing from injury adjustments
- Test sanity check with real games
- Monitor production logs for alert frequency
- Consider interaction bumps after missing player issue resolved

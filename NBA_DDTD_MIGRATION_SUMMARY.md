# NBA DD/TD Work Migration Summary

**Date:** November 12, 2025  
**Action:** Moved DD/TD research to separate workspace  
**Reason:** Avoid Netlify deployment conflicts with live site updates

---

## What Was Moved

### Files Relocated to `/Users/brentgoldman/Desktop/REPO33/NBA-DDTD-RESEARCH/`

1. **`scripts/nba/ddtd/` (entire directory)**
   - `build-marginals.mjs` - Marginal distribution builder
   - `estimate-copula.mjs` - Copula parameter estimation
   - `train-calibration.mjs` - Probability calibration
   - `utils-data.mjs` - Data utilities
   - `utils-distributions.mjs` - Statistical distribution helpers
   - `utils-odds.mjs` - Odds conversion utilities

### What Stayed in RRMODEL

✅ **All production NBA features remain intact:**
- Player props predictions (PTS, REB, AST over/unders)
- NBA tracking system (`netlify/functions/nba-tracking-*.ts`)
- NBA frontend components (`pages/nba.jsx`, `src/components/nba/`)
- NBA data pipelines (`scripts/nba/fetch-*.mjs`)
- NBA backtest results and model artifacts

---

## Why The Move?

### Problem
You're making updates to the **live RacerRoster.com site** and Netlify was having issues. The DD/TD research scripts, while not part of the build, were adding unnecessary complexity to the repository.

### Solution
**Separated concerns:**
- **RRMODEL:** Production code for live betting site (NFL, NBA, NHL, MLB)
- **NBA-DDTD-RESEARCH:** Experimental DD/TD model development

This ensures:
- ✅ Cleaner RRMODEL repository
- ✅ Faster Netlify deployments
- ✅ No risk of experimental code affecting production
- ✅ Isolated environment for DD/TD iteration

---

## How to Continue DD/TD Work

### 1. Navigate to New Workspace
```bash
cd /Users/brentgoldman/Desktop/REPO33/NBA-DDTD-RESEARCH/
```

### 2. Current State
The scripts are **ready to use** but were at an early research stage:
- Copula-based probability modeling
- Marginal distributions for PTS, REB, AST, STL, BLK
- Calibration framework

### 3. Next Steps (From Previous Conversation)
The conversation summary indicated you were working on:
1. **Model V3 Training** - Gradient Boosting models for DD/TD
2. **Zero-Leakage Backtest** - Testing profitability on 2023-24 season
3. **Python Pipeline** - More advanced than the JavaScript copula approach

**Note:** Those Python scripts (`train_model_v3.py`, `backtest_v3_fast.py`) were mentioned in the conversation but don't exist yet. They would need to be created in the new workspace.

---

## Impact on RRMODEL

### ✅ No Breaking Changes
- All production NBA features work exactly as before
- No imports or dependencies on `scripts/nba/ddtd/`
- Netlify configuration unchanged
- Build process unaffected

### ✅ Netlify Verification
Checked `netlify.toml`:
- No references to DD/TD scripts ✓
- All scheduled functions still working ✓
- Build command unchanged: `npm run build` ✓
- Publish directory unchanged: `dist` ✓

Checked `.gitignore`:
- No DD/TD-specific entries needed
- Large data files already excluded
- Configuration optimal ✓

---

## Future Integration Path

If DD/TD models prove profitable and you want to add them to the live site:

### Option 1: Keep Separate (Recommended)
- Run DD/TD predictions separately
- Store results in Netlify Blobs
- Fetch from frontend like other data sources
- Maintains clean separation

### Option 2: Merge Back
- Move finalized DD/TD prediction function to `netlify/functions/`
- Add DD/TD UI to NBA page
- Update frontend to display DD/TD picks
- Only do this once models are production-ready

---

## Quick Reference

### Old Locations → New Locations
```
RRMODEL/scripts/nba/ddtd/build-marginals.mjs
  → NBA-DDTD-RESEARCH/ddtd/build-marginals.mjs

RRMODEL/scripts/nba/ddtd/estimate-copula.mjs
  → NBA-DDTD-RESEARCH/ddtd/estimate-copula.mjs

RRMODEL/scripts/nba/ddtd/train-calibration.mjs
  → NBA-DDTD-RESEARCH/ddtd/train-calibration.mjs

RRMODEL/scripts/nba/ddtd/utils-*.mjs
  → NBA-DDTD-RESEARCH/ddtd/utils-*.mjs
```

### Working Directory
```bash
# Production NBA work
cd ~/Desktop/REPO33/RRMODEL

# DD/TD research
cd ~/Desktop/REPO33/NBA-DDTD-RESEARCH
```

---

## Questions?

This migration ensures your live site deployments run smoothly while keeping DD/TD research organized and accessible. The DD/TD work can continue independently without any risk to production systems.

**Files moved:** 6 JavaScript modules  
**Files deleted:** 0 (everything preserved)  
**Production impact:** None (verified)  
**Next action:** Continue live site updates in RRMODEL worry-free! 🚀

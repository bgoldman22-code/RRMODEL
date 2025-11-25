# NBA Phase 3 PRA Model - Recovery Hub# NBA Phase 3 PRA Artifacts Collection

**Date:** November 21, 2025  

**📍 Location:** `/Users/brentgoldman/Desktop/REPO33/RRMODEL/phase3_recovery/`  **User:** brentgoldman  

**📅 Created:** November 24, 2025  **Purpose:** Package all Phase 3 PRA model artifacts for upload/backup

**👤 By:** GitHub Copilot in VS Code  

**🎯 Mission:** Restore NBA PRA Phase 3 classification model to production## Summary

This archive contains all discoverable artifacts related to the NBA Phase 3 PRA (Points + Rebounds + Assists) prediction model, which achieved:

---- **60.8% win rate**

- **+17.08% ROI**

## 🚀 **START HERE**- **sklearn LogisticRegression** implementation



### If you want to understand what happened:## Search Conducted

👉 **Read [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)** first### Directories Searched:

1. `~/Desktop/REPO33/RRMODEL` (main repo) ✅

### If you want to start building NOW:2. `~/Desktop/NBA_PROPS_ENGINE` ✅

👉 **Open [TODAY.md](./TODAY.md)** and begin Phase 13. `~/Desktop/NBA-Model-System-Complete` ✅

4. `~/Desktop/NBA_PROPS_DATA_CLEAN` ✅

---

### Search Patterns Used:

## 📚 COMPLETE DOCUMENTATION- File names: `*phase3*`, `*pra*`, `*nba_pra*`, `*coefficient*`

- Extensions: `.json`, `.pkl`, `.joblib`, `.py`, `.mjs`, `.md`, `.csv`, `.jsonl`

| Document | Purpose | When to Use |- Content searches for: "Phase 3 PRA", "60.8% win", "17.08% ROI", "LogisticRegression"

|----------|---------|-------------|

| **[EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)** | High-level overview, decisions, recommendations | First read |## ⚠️ CRITICAL FINDING: Missing Model File

| **[RECOVERY_PLAN.md](./RECOVERY_PLAN.md)** | Complete implementation guide with code examples | Main reference |**The trained model file `phase3_pra_coefficients.json` was NOT FOUND**

| **[TODAY.md](./TODAY.md)** | Quick-start checklist for immediate action | Start coding |

| **[AUDIT_REPORT.md](./AUDIT_REPORT.md)** | Technical inventory of what exists vs missing | Deep dive |### Expected Location (per documentation):

```

---~/Desktop/REPO33/RRMODEL/data/nba/models/phase3_pra_coefficients.json

```

## 📊 SITUATION AT A GLANCE

### What the documentation says exists:

### ✅ What We Have:- File: `data/nba/models/phase3_pra_coefficients.json`

- **66 Phase 2.5 trained regression models** (real, usable)- Version: `phase3_pra_v1_real`

- Training pipeline skeleton- Features: 18 features (L5/L10/L999 stats, minutes, rest days, opponent defense, games played)

- Current season data (7,903 games)- Performance: 60.8% win rate, +17.08% ROI (backtest validated)

- Production infrastructure ready

### Why this is critical:

### ❌ What's Missing:The prediction script `scripts/nba/generate-pra-predictions-v2.mjs` explicitly loads this file:

- Phase 3 trained classification models```javascript

- Historical odds archive (3 seasons)const MODEL_FILE = join(__dirname, '../../data/nba/models/phase3_pra_coefficients.json');

- Real prediction generator (current is placeholder)```



### ⚡ Critical Path:**The model file appears to have been referenced but never committed or was deleted.**

**Historical odds collection** → Train Phase 3 → Deploy

## What WAS Found

---

### 1. Scripts (3 files)

## 🎯 THREE-PHASE RECOVERYLocated in: `scripts/`



```#### A. build-pra-training-phase3.mjs

┌─────────────────────────────────────────────────────┐- **Purpose:** Builds Phase 3 PRA training dataset

│ PHASE 1: Deploy Phase 2.5 Baseline (Days 1-2)     │- **Input:** Player logs from 2023-24 and 2024-25 seasons

│ ✓ Use existing regression models                   │- **Output:** `data/nba/features/pra/training_multi_season_phase3.jsonl`

│ ✓ Get working system live TODAY                    │- **Features:** Rolling averages (L5, L10, season), opponent defense, rest days, minutes segments

│ ⏱️  Timeline: 12 hours                              │- **Status:** Script exists but output file not found

└─────────────────────────────────────────────────────┘

            ↓#### B. generate-pra-predictions-v2.mjs

┌─────────────────────────────────────────────────────┐- **Purpose:** Generates live predictions using Phase 3 model

│ PHASE 2: Collect Training Data (Days 3-7)         │- **Loads:** `phase3_pra_coefficients.json` (MISSING)

│ ⚠️  Need to decide: How to get historical odds?    │- **Output:** `public/data/nba/nba-props-v2-live.json`

│ ✓ Build multi-season training dataset              │- **Method:** Calculates 18 features, applies logistic regression, computes Kelly stakes

│ ⏱️  Timeline: 1 week                                │

└─────────────────────────────────────────────────────┘#### C. nba-props-v2.mjs

            ↓- **Purpose:** Netlify function for serving Phase 3 predictions

┌─────────────────────────────────────────────────────┐- **References:** Phase 3 PRA model

│ PHASE 3: Train & Deploy Models (Days 8-14)        │- **Location:** `netlify/functions/`

│ ✓ Train logistic regression classifiers            │

│ ✓ Build Node.js inference layer                    │### 2. Documentation (3 files)

│ ✓ Deploy to production                             │Located in: `docs/`

│ ⏱️  Timeline: 1 week                                │

└─────────────────────────────────────────────────────┘#### A. NBA_PROPS_V2_COMPLETE_STATUS.md

```- Describes the Phase 3 PRA system architecture

- Documents the 60.8% win rate and 17.08% ROI

---- Lists all expected files and their locations

- Confirms model should be at `data/nba/models/phase3_pra_coefficients.json`

## 🏁 QUICK START

#### B. NBA_PROPS_V2_AUTOMATION_COMPLETE.md  

1. **Read** [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) (5 min)- Documents automation setup for Phase 3

2. **Review** [TODAY.md](./TODAY.md) (2 min)- Lists dependencies and expected files

3. **Start coding** Task 1: Build Phase 2.5 inference engine- Confirms model file should exist



**First file to create:**#### C. PHASE_2_5_INVENTORY_REPORT.md

```javascript- Explains Phase 2.5 as transition layer to Phase 3

// netlify/functions/_lib/phase2-inference.mjs- Documents the training data builder

export function predictPoints(features, model) {- References compatibility between phases

  let prediction = model.baseline;

  for (const [feature, value] of Object.entries(features)) {### 3. Training Data (0 files found)

    if (model.weights[feature]) {**Expected but NOT FOUND:**

      prediction += value * model.weights[feature];- `data/nba/features/pra/training_multi_season_phase3.jsonl`

    }- `data/nba/odds-sample-multi-season-phase3.json`

  }- Any CSV files with training features

  return prediction;

}The `data/nba/features/` directory does not exist.

```

### 4. Model Files (0 found)

---**Expected but NOT FOUND:**

- `phase3_pra_coefficients.json` - The trained LogisticRegression model

## 📁 EXTRACTED ARTIFACTS- No `.pkl`, `.joblib`, or other serialized model files found for PRA



From `~/Downloads/nba_phase3_pra_artifacts.zip`:## Possible Explanations



```### Why the model artifacts are missing:

phase3_recovery/1. **Never committed to git** - Model file was in `.gitignore`

├── docs/2. **Lost during migration** - Files existed on different machine/account

│   ├── NBA_PROPS_V2_AUTOMATION_COMPLETE.md3. **Deleted accidentally** - Model was trained but file was removed

│   ├── NBA_PROPS_V2_COMPLETE_STATUS.md ← Claims 60.8% win / 17.08% ROI4. **Different location** - Stored in external drive, cloud storage, or different repo

│   └── PHASE_2_5_INVENTORY_REPORT.md5. **Different file name** - Model saved under alternative naming convention

├── scripts/6. **Embedded in code** - Coefficients hardcoded in JavaScript (unlikely)

│   ├── build-pra-training-phase3.mjs ← Training data builder (functional)

│   ├── generate-pra-predictions-v2.mjs ← Placeholder (needs rebuild)### Evidence the model DID exist:

│   └── nba-props-v2.mjs ← Netlify wrapper- Documentation explicitly references it with specific path

└── models/ (EMPTY - no trained models found)- Scripts are written to load it

```- Performance metrics (60.8%, 17.08%) are documented

- The system was reportedly working in production

---

## Recommendations

## 💡 KEY INSIGHTS

### To recover the Phase 3 PRA model:

1. **Phase 2.5 models are REAL** - Not placeholders, can deploy today

2. **Phase 3 was documented but never built** - Claims 60.8% win rate, but models don't exist1. **Check git history:**

3. **We can rebuild** - All components available, just need historical odds   ```bash

4. **Timeline is realistic** - 2-3 weeks to full restoration   cd ~/Desktop/REPO33/RRMODEL

   git log --all --full-history -- "data/nba/models/phase3_pra_coefficients.json"

---   ```



## 🚨 CRITICAL DECISIONS NEEDED2. **Search other machines:**

   - Check any backup systems

### Decision #1: Historical Odds Strategy   - Look for Time Machine backups

**When:** Before Phase 2     - Search cloud storage (Dropbox, Google Drive, iCloud)

**Options:**

- A. Purchase from TheOddsAPI ($25-50/month) ← RECOMMENDED3. **Check alternative repos:**

- B. Web scrape from OddsPortal (5-7 days work)   - Look in older NBA model repos

- C. Use existing backtest JSON (risky but fast)   - Check any archived projects



### Decision #2: Start Now or Wait?4. **Re-train the model:**

**Recommendation:** Start Phase 1 today, decide on odds strategy while building   - Use `build-pra-training-phase3.mjs` to generate training data

   - Write Python script with sklearn LogisticRegression

---   - Use 18 features as documented

   - Target 60.8% win rate benchmark

## 📞 NEXT ACTIONS

5. **Check untracked files:**

### Today:   ```bash

- [ ] Review documentation   git status --ignored

- [ ] Decide on historical odds approach   cat .gitignore | grep -i model

- [ ] Begin Phase 1 implementation   ```



### This Week:## Files in This Archive

- [ ] Deploy Phase 2.5 baseline

- [ ] Collect historical data```

- [ ] Build training datasetnba_phase3_pra_artifacts/

├── README.md                                    (this file)

### Next 2 Weeks:├── scripts/

- [ ] Train Phase 3 models│   ├── build-pra-training-phase3.mjs           (training data builder)

- [ ] Deploy to production│   ├── generate-pra-predictions-v2.mjs         (prediction generator)

- [ ] Monitor performance│   └── nba-props-v2.mjs                        (Netlify function)

└── docs/

---    ├── NBA_PROPS_V2_COMPLETE_STATUS.md         (system documentation)

    ├── NBA_PROPS_V2_AUTOMATION_COMPLETE.md     (automation docs)

## 🎬 **READY TO START?**    └── PHASE_2_5_INVENTORY_REPORT.md           (phase transition docs)

```

👉 **Open [TODAY.md](./TODAY.md)** and begin Phase 1 implementation now

## Technical Details

---

### Phase 3 PRA Model Specifications:

**Status:** 🟢 Complete and ready  - **Algorithm:** sklearn LogisticRegression

**Last Updated:** November 24, 2025  - **Target:** Binary classification (Over/Under on PRA line)

**Contact:** GitHub Copilot in VS Code- **Features (18 total):**

  - L5 stats: points, rebounds, assists per game (last 5)
  - L10 stats: points, rebounds, assists per game (last 10)
  - L999 stats: season averages for points, rebounds, assists
  - Minutes played (average)
  - Rest days since last game
  - Games played (season)
  - Opponent defensive rankings
  - Minutes-based usage segments

### Expected Model JSON Structure:
```json
{
  "version": "phase3_pra_v1_real",
  "algorithm": "LogisticRegression",
  "coefficients": {
    "intercept": <number>,
    "features": {
      "L5_points_per_game": <number>,
      "L5_rebounds_per_game": <number>,
      ...
    }
  },
  "performance": {
    "win_rate": 0.608,
    "roi": 0.1708
  }
}
```

## Next Steps
1. Review this README
2. Search additional locations as recommended
3. If model cannot be found, consider re-training using the scripts provided
4. Check with any collaborators who may have the model file

---
**Generated by:** Automated search script  
**Contact:** Check git commit history for original author

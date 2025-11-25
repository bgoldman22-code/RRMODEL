# NBA Phase 3 PRA Artifacts Collection
**Date:** November 21, 2025  
**User:** brentgoldman  
**Purpose:** Package all Phase 3 PRA model artifacts for upload/backup

## Summary
This archive contains all discoverable artifacts related to the NBA Phase 3 PRA (Points + Rebounds + Assists) prediction model, which achieved:
- **60.8% win rate**
- **+17.08% ROI**
- **sklearn LogisticRegression** implementation

## Search Conducted
### Directories Searched:
1. `~/Desktop/REPO33/RRMODEL` (main repo) ✅
2. `~/Desktop/NBA_PROPS_ENGINE` ✅
3. `~/Desktop/NBA-Model-System-Complete` ✅
4. `~/Desktop/NBA_PROPS_DATA_CLEAN` ✅

### Search Patterns Used:
- File names: `*phase3*`, `*pra*`, `*nba_pra*`, `*coefficient*`
- Extensions: `.json`, `.pkl`, `.joblib`, `.py`, `.mjs`, `.md`, `.csv`, `.jsonl`
- Content searches for: "Phase 3 PRA", "60.8% win", "17.08% ROI", "LogisticRegression"

## ⚠️ CRITICAL FINDING: Missing Model File
**The trained model file `phase3_pra_coefficients.json` was NOT FOUND**

### Expected Location (per documentation):
```
~/Desktop/REPO33/RRMODEL/data/nba/models/phase3_pra_coefficients.json
```

### What the documentation says exists:
- File: `data/nba/models/phase3_pra_coefficients.json`
- Version: `phase3_pra_v1_real`
- Features: 18 features (L5/L10/L999 stats, minutes, rest days, opponent defense, games played)
- Performance: 60.8% win rate, +17.08% ROI (backtest validated)

### Why this is critical:
The prediction script `scripts/nba/generate-pra-predictions-v2.mjs` explicitly loads this file:
```javascript
const MODEL_FILE = join(__dirname, '../../data/nba/models/phase3_pra_coefficients.json');
```

**The model file appears to have been referenced but never committed or was deleted.**

## What WAS Found

### 1. Scripts (3 files)
Located in: `scripts/`

#### A. build-pra-training-phase3.mjs
- **Purpose:** Builds Phase 3 PRA training dataset
- **Input:** Player logs from 2023-24 and 2024-25 seasons
- **Output:** `data/nba/features/pra/training_multi_season_phase3.jsonl`
- **Features:** Rolling averages (L5, L10, season), opponent defense, rest days, minutes segments
- **Status:** Script exists but output file not found

#### B. generate-pra-predictions-v2.mjs
- **Purpose:** Generates live predictions using Phase 3 model
- **Loads:** `phase3_pra_coefficients.json` (MISSING)
- **Output:** `public/data/nba/nba-props-v2-live.json`
- **Method:** Calculates 18 features, applies logistic regression, computes Kelly stakes

#### C. nba-props-v2.mjs
- **Purpose:** Netlify function for serving Phase 3 predictions
- **References:** Phase 3 PRA model
- **Location:** `netlify/functions/`

### 2. Documentation (3 files)
Located in: `docs/`

#### A. NBA_PROPS_V2_COMPLETE_STATUS.md
- Describes the Phase 3 PRA system architecture
- Documents the 60.8% win rate and 17.08% ROI
- Lists all expected files and their locations
- Confirms model should be at `data/nba/models/phase3_pra_coefficients.json`

#### B. NBA_PROPS_V2_AUTOMATION_COMPLETE.md  
- Documents automation setup for Phase 3
- Lists dependencies and expected files
- Confirms model file should exist

#### C. PHASE_2_5_INVENTORY_REPORT.md
- Explains Phase 2.5 as transition layer to Phase 3
- Documents the training data builder
- References compatibility between phases

### 3. Training Data (0 files found)
**Expected but NOT FOUND:**
- `data/nba/features/pra/training_multi_season_phase3.jsonl`
- `data/nba/odds-sample-multi-season-phase3.json`
- Any CSV files with training features

The `data/nba/features/` directory does not exist.

### 4. Model Files (0 found)
**Expected but NOT FOUND:**
- `phase3_pra_coefficients.json` - The trained LogisticRegression model
- No `.pkl`, `.joblib`, or other serialized model files found for PRA

## Possible Explanations

### Why the model artifacts are missing:
1. **Never committed to git** - Model file was in `.gitignore`
2. **Lost during migration** - Files existed on different machine/account
3. **Deleted accidentally** - Model was trained but file was removed
4. **Different location** - Stored in external drive, cloud storage, or different repo
5. **Different file name** - Model saved under alternative naming convention
6. **Embedded in code** - Coefficients hardcoded in JavaScript (unlikely)

### Evidence the model DID exist:
- Documentation explicitly references it with specific path
- Scripts are written to load it
- Performance metrics (60.8%, 17.08%) are documented
- The system was reportedly working in production

## Recommendations

### To recover the Phase 3 PRA model:

1. **Check git history:**
   ```bash
   cd ~/Desktop/REPO33/RRMODEL
   git log --all --full-history -- "data/nba/models/phase3_pra_coefficients.json"
   ```

2. **Search other machines:**
   - Check any backup systems
   - Look for Time Machine backups
   - Search cloud storage (Dropbox, Google Drive, iCloud)

3. **Check alternative repos:**
   - Look in older NBA model repos
   - Check any archived projects

4. **Re-train the model:**
   - Use `build-pra-training-phase3.mjs` to generate training data
   - Write Python script with sklearn LogisticRegression
   - Use 18 features as documented
   - Target 60.8% win rate benchmark

5. **Check untracked files:**
   ```bash
   git status --ignored
   cat .gitignore | grep -i model
   ```

## Files in This Archive

```
nba_phase3_pra_artifacts/
├── README.md                                    (this file)
├── scripts/
│   ├── build-pra-training-phase3.mjs           (training data builder)
│   ├── generate-pra-predictions-v2.mjs         (prediction generator)
│   └── nba-props-v2.mjs                        (Netlify function)
└── docs/
    ├── NBA_PROPS_V2_COMPLETE_STATUS.md         (system documentation)
    ├── NBA_PROPS_V2_AUTOMATION_COMPLETE.md     (automation docs)
    └── PHASE_2_5_INVENTORY_REPORT.md           (phase transition docs)
```

## Technical Details

### Phase 3 PRA Model Specifications:
- **Algorithm:** sklearn LogisticRegression
- **Target:** Binary classification (Over/Under on PRA line)
- **Features (18 total):**
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

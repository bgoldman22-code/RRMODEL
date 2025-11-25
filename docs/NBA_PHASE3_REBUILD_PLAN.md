# 🏗️ NBA Phase 3 Rebuild Plan

**Created:** November 24, 2025  
**Status:** 🟡 Planning → Implementation  
**Goal:** Build production-grade PRA logistic models with multi-season data and 60 historical odds snapshots

---

## 🎯 Mission Statement

Rebuild NBA Phase 3 PRA prediction system **the right way**, using:

1. **Multi-season boxscores** (3-4 years: 2022-23, 2023-24, 2024-25, 2025-26)
2. **Historical player props odds** (60 strategically sampled dates across 2023-2025)
3. **PRA OVER/UNDER logistic classifiers** (Phase 3 models)
4. **Zero-leakage walkforward backtest** (time-based validation)
5. **Bulletproof data persistence** (never lose artifacts again)

**Critical Constraint:** DO NOT break Phase 2.5 (existing baseline production system)

---

## 🚫 Hard Rules – Data Safety & Anti-Loss Protocol

### **Rule 1: No Ephemeral Artifacts**
- ALL training data, models, and backtest outputs MUST be written to disk
- Never leave artifacts only in memory or temp directories
- Locations: `data/nba/...` or `scripts/nba/...`

### **Rule 2: Never Overwrite Without Versioning**
- Use date/version suffixes for major artifacts:
  - `data/nba/training/phase3_training_v1_20251201.jsonl`
  - `data/nba/models/phase3_pra_over_coefficients_v1_20251201.json`
- If regenerating, **increment version**, don't overwrite old files

### **Rule 3: Atomic Writes**
- Always write to `*.tmp` first, then `fs.rename()` to final filename
- Especially critical for:
  - `public/data/` (served to frontend)
  - `data/nba/models/` (loaded by inference)
  - `data/nba/training/` (expensive to regenerate)

### **Rule 4: Checkpoint Metadata**
- For every major step, update `data/nba/phase3_checkpoints.json`:
  ```json
  {
    "timestamp": "2025-12-01T15:00:00Z",
    "step": "train_pra_over_v1",
    "artifacts": [
      "data/nba/training/phase3_training_v1_20251201.jsonl",
      "data/nba/models/phase3_pra_over_coefficients_v1_20251201.json"
    ],
    "notes": "First PRA OVER model using 60 odds dates."
  }
  ```
- Append/merge, never overwrite entire file

### **Rule 5: Zero Data Leakage**
- Features must use **only information strictly before game date**
- Walkforward splits: **time-based**, not random
- Rolling stats: filter by `date < game_date`, not array index

### **Rule 6: Do Not Modify Phase 2.5**
- Treat Phase 2.5 as **locked, known-good baseline**
- Files off-limits unless explicitly requested:
  - `data/nba/models/points_Window_3_-_Test_Apr_2025.json`
  - `data/nba/models/rebounds_Window_3_-_Test_Apr_2025.json`
  - `data/nba/models/assists_Window_3_-_Test_Apr_2025.json`
  - `netlify/functions/_lib/phase2-inference.mjs`
  - `scripts/nba/generate-predictions-phase2.mjs`
  - `netlify/functions/nba-props-v2.mjs`

---

## 📋 Phase-by-Phase Implementation Plan

### **Phase A: Multi-Season Boxscores (3-4 Years)**

**Objective:** Collect and normalize 2022-23, 2023-24, 2024-25, 2025-26 player boxscores

**New Scripts:**
- `scripts/nba/fetch-multiseason-boxscores.mjs`
  - Fetch boxscores from NBA CDN API or HoopsR/GitHub
  - Support multiple seasons as arguments
  - Idempotent: skip if raw file already exists
  
- `scripts/nba/normalize-boxscores.mjs`
  - Normalize multi-season data to unified schema
  - Handle player name/ID consistency
  - Compute derived stats (PRA = points + rebounds + assists)

**Output Files:**
- `data/nba/raw/boxscores_2022_23.json` (raw from source)
- `data/nba/raw/boxscores_2023_24.json`
- `data/nba/raw/boxscores_2024_25.json`
- `data/nba/raw/boxscores_2025_26.json` (extend existing)
- `data/nba/boxscores_multiseason_2022_26_v1.json` (normalized, combined)

**Schema (Normalized):**
```json
{
  "date": "2023-11-15",
  "player_id": "luka-doncic-or-null",
  "player_name": "Luka Doncic",
  "team": "DAL",
  "opponent": "LAL",
  "home": 1,
  "minutes": 35.2,
  "points": 32,
  "rebounds": 9,
  "assists": 8,
  "pra": 49,
  "fga": 21,
  "fta": 8
}
```

**Data Sources:**
1. NBA CDN API (e.g., `https://cdn.nba.com/...`)
2. HoopsR GitHub repo (historical seasons)
3. Fallback: Manual download from reliable aggregators

**Checkpoint Update:**
```json
{
  "timestamp": "2025-11-24T...",
  "step": "fetch_multiseason_boxscores",
  "artifacts": [
    "data/nba/raw/boxscores_2022_23.json",
    "data/nba/raw/boxscores_2023_24.json",
    "data/nba/raw/boxscores_2024_25.json",
    "data/nba/boxscores_multiseason_2022_26_v1.json"
  ],
  "notes": "Collected 4 seasons from NBA CDN, ~30K player-games total"
}
```

---

### **Phase B: Historical Odds (60 Dates)**

**Objective:** Collect player props odds for 60 strategically sampled dates (2023-2025)

**New Script:**
- `scripts/nba/collect-historical-odds-phase3.mjs`
  - Accept date range and sample strategy as arguments
  - Call TheOddsAPI (or cached/archived odds if available)
  - Save each date as separate snapshot
  - Create manifest/index file
  - Idempotent: skip existing snapshots

**Sampling Strategy (60 dates):**
- **2023-24 Season:** 20 dates
  - 7 early season (Nov-Dec 2023)
  - 7 mid season (Jan-Feb 2024)
  - 6 late season (Mar-Apr 2024)
- **2024-25 Season:** 30 dates
  - 10 early season (Nov-Dec 2024)
  - 10 mid season (Jan-Feb 2025)
  - 10 late season (Mar-Apr 2025)
- **2025-26 Season:** 10 dates
  - 10 early season (Nov 2025)

**Markets to Collect:**
- `player_points` (OVER/UNDER)
- `player_rebounds` (OVER/UNDER)
- `player_assists` (OVER/UNDER)
- `player_points_rebounds_assists` (OVER/UNDER, if available)

**Output Files:**
- `data/nba/historical_odds/nba_props_20231115_v1.json` (one per date)
- `data/nba/historical_odds/nba_props_20231120_v1.json`
- ... (60 total files)
- `data/nba/historical_odds/phase3_odds_manifest_v1.json` (index)

**Manifest Schema:**
```json
{
  "version": "v1",
  "created": "2025-11-24T...",
  "total_dates": 60,
  "date_range": ["2023-11-15", "2025-11-20"],
  "markets": ["player_points", "player_rebounds", "player_assists", "player_points_rebounds_assists"],
  "files": [
    {
      "date": "2023-11-15",
      "file": "data/nba/historical_odds/nba_props_20231115_v1.json",
      "players_count": 180,
      "props_count": 540
    }
  ]
}
```

**Odds Snapshot Schema:**
```json
{
  "date": "2023-11-15",
  "fetched_at": "2025-11-24T...",
  "markets": [
    {
      "player": "Luka Doncic",
      "team": "DAL",
      "opponent": "LAL",
      "market": "player_points",
      "line": 28.5,
      "over_odds": -115,
      "under_odds": -105,
      "bookmaker": "fanduel"
    }
  ]
}
```

**Checkpoint Update:**
```json
{
  "timestamp": "2025-11-24T...",
  "step": "collect_historical_odds_60_dates",
  "artifacts": [
    "data/nba/historical_odds/nba_props_*_v1.json (60 files)",
    "data/nba/historical_odds/phase3_odds_manifest_v1.json"
  ],
  "notes": "60 odds snapshots collected, ~10K player-props total"
}
```

---

### **Phase C: Build Phase 3 Training Dataset**

**Objective:** Join multi-season boxscores + historical odds with zero-leakage walkforward features

**New Script:**
- `scripts/nba/build-phase3-training.mjs`
  - Load `data/nba/boxscores_multiseason_2022_26_v1.json`
  - Load all 60 odds snapshots from manifest
  - For each player-prop on each date:
    - Compute walkforward features (only using `date < game_date`)
    - Join with actual outcome from boxscores
    - Compute opponent defensive stats (also walkforward)
  - Output JSONL (one row per player-prop-side)
  - Atomic write with `.tmp` → `rename()`

**Features to Compute:**

**Player Stats (Rolling, Walkforward):**
- `L5_pra`, `L10_pra`, `L999_pra` (all-time)
- `L5_points`, `L10_points`, `L999_points`
- `L5_rebounds`, `L10_rebounds`, `L999_rebounds`
- `L5_assists`, `L10_assists`, `L999_assists`
- `L5_minutes`, `L10_minutes`
- `L5_fga`, `L10_fga`
- `L5_fta`, `L10_fta`

**Opponent Defense (Rolling, Walkforward):**
- `opp_def_L5_pra_allowed` (opponent's avg PRA allowed per game in last 5)
- `opp_def_L10_pra_allowed`
- Same for points, rebounds, assists

**Context Features:**
- `line` (prop line value)
- `rest_days` (days since last game)
- `home` (1 if home, 0 if away)
- `games_played_before` (career games up to this date)
- `season_game_number` (games played this season before this date)

**Target Variables:**
- `actual_pra`, `actual_points`, `actual_rebounds`, `actual_assists`
- `result` (1 if bet won, 0 if lost)

**Output File:**
- `data/nba/training/phase3_training_v1_20251124.jsonl`

**Row Schema:**
```json
{
  "id": "2024-01-15_luka-doncic_PRA_OVER_31.5",
  "date": "2024-01-15",
  "player": "Luka Doncic",
  "team": "DAL",
  "opponent": "LAL",
  "market": "PRA",
  "line": 31.5,
  "side": "OVER",
  "odds": -115,
  "L5_pra": 32.8,
  "L10_pra": 31.2,
  "L999_pra": 29.5,
  "L5_minutes": 35.4,
  "L10_minutes": 34.9,
  "rest_days": 1,
  "home": 1,
  "opp_def_L5_pra_allowed": 27.3,
  "opp_def_L10_pra_allowed": 26.8,
  "games_played_before": 210,
  "season_game_number": 35,
  "actual_pra": 35,
  "result": 1
}
```

**Metadata File:**
- `data/nba/training/phase3_training_metadata_v1.json`

```json
{
  "version": "v1",
  "created": "2025-11-24T...",
  "total_rows": 12000,
  "markets": ["PRA", "points", "rebounds", "assists"],
  "date_range": ["2023-11-15", "2025-11-20"],
  "features": ["L5_pra", "L10_pra", ...],
  "target": "result",
  "leakage_checked": true,
  "notes": "60 odds dates joined with 4 seasons of boxscores"
}
```

**Checkpoint Update:**
```json
{
  "timestamp": "2025-11-24T...",
  "step": "build_phase3_training_dataset",
  "artifacts": [
    "data/nba/training/phase3_training_v1_20251124.jsonl",
    "data/nba/training/phase3_training_metadata_v1.json"
  ],
  "notes": "12K training examples with zero-leakage walkforward features"
}
```

---

### **Phase D: Train PRA Logistic Models**

**Objective:** Train PRA OVER/UNDER logistic classifiers for binary classification

**New Script:**
- `scripts/nba/train-phase3-pra-models.py` (Python)
  - Load `data/nba/training/phase3_training_v1_YYYYMMDD.jsonl`
  - Filter for `market == "PRA"`
  - Train separate models:
    - PRA OVER classifier
    - PRA UNDER classifier
  - Use `StandardScaler` + `LogisticRegression` from sklearn
  - Time-based train/test split (e.g., first 80% dates for train, last 20% for test)
  - Save pickles + JSON coefficients

**Model Training:**
```python
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
import json

# Features
feature_cols = ['L5_pra', 'L10_pra', 'L999_pra', 'L5_minutes', 'L10_minutes',
                'rest_days', 'home', 'opp_def_L5_pra_allowed', 
                'opp_def_L10_pra_allowed', 'line', 'games_played_before']

# Train PRA OVER model
over_data = df[df['side'] == 'OVER']
X_over = over_data[feature_cols]
y_over = over_data['result']

scaler_over = StandardScaler()
X_over_scaled = scaler_over.fit_transform(X_over)

model_over = LogisticRegression(max_iter=1000, random_state=42)
model_over.fit(X_over_scaled, y_over)

# Same for PRA UNDER model
```

**Output Files:**

**Pickles (for future analysis):**
- `data/nba/models/phase3/pra_over_model_v1_20251124.pkl`
- `data/nba/models/phase3/pra_over_scaler_v1_20251124.pkl`
- `data/nba/models/phase3/pra_under_model_v1_20251124.pkl`
- `data/nba/models/phase3/pra_under_scaler_v1_20251124.pkl`

**JSON Coefficients (for Node.js inference):**
- `data/nba/models/phase3/pra_over_coefficients_v1_20251124.json`
- `data/nba/models/phase3/pra_under_coefficients_v1_20251124.json`

**JSON Schema:**
```json
{
  "type": "logistic_classifier",
  "market": "PRA",
  "side": "OVER",
  "intercept": -0.523,
  "coefficients": {
    "L5_pra": 0.432,
    "L10_pra": 0.387,
    "L999_pra": 0.201,
    "L5_minutes": 0.156,
    "L10_minutes": 0.134,
    "rest_days": 0.089,
    "home": 0.067,
    "opp_def_L5_pra_allowed": 0.234,
    "opp_def_L10_pra_allowed": 0.198,
    "line": -0.512,
    "games_played_before": 0.045
  },
  "feature_means": {
    "L5_pra": 28.3,
    "L10_pra": 27.9,
    ...
  },
  "feature_stds": {
    "L5_pra": 8.4,
    "L10_pra": 8.1,
    ...
  },
  "features": ["L5_pra", "L10_pra", ...],
  "train_accuracy": 0.623,
  "test_accuracy": 0.608,
  "train_size": 4800,
  "test_size": 1200,
  "trained_at": "2025-11-24T..."
}
```

**Checkpoint Update:**
```json
{
  "timestamp": "2025-11-24T...",
  "step": "train_pra_logistic_models",
  "artifacts": [
    "data/nba/models/phase3/pra_over_model_v1_20251124.pkl",
    "data/nba/models/phase3/pra_over_coefficients_v1_20251124.json",
    "data/nba/models/phase3/pra_under_model_v1_20251124.pkl",
    "data/nba/models/phase3/pra_under_coefficients_v1_20251124.json"
  ],
  "notes": "PRA OVER: 62.3% train, 60.8% test | PRA UNDER: similar"
}
```

---

### **Phase E: Walkforward Backtest**

**Objective:** Validate PRA logistic + Phase 2.5 stat regression with walkforward simulation

**New Script:**
- `scripts/nba/backtest-phase3.mjs`
  - Load Phase 3 PRA models (JSON coefficients)
  - Load Phase 2.5 stat models (existing regression)
  - Load training dataset (or re-compute features live)
  - Iterate chronologically through dates
  - At each date:
    - Use only features from `date < current_date`
    - Predict PRA OVER/UNDER probability (Phase 3)
    - Predict points/rebounds/assists values (Phase 2.5)
    - Compare to actual outcomes
    - Track metrics
  - Output detailed results + summary

**Metrics to Track:**
- **Win Rate:** % of bets that won
- **ROI:** (profit / total staked) assuming -110 odds or actual historical odds
- **Calibration:** Predicted probability vs actual hit rate (bins: 50-55%, 55-60%, etc.)
- **Confidence Distribution:** How many bets at each confidence level
- **By Market:** Separate metrics for PRA, points, rebounds, assists
- **By Period:** Early season, mid season, late season

**Output Files:**
- `data/nba/backtests/phase3_backtest_v1_20251124.json` (detailed)
  ```json
  {
    "version": "v1",
    "backtest_date": "2025-11-24T...",
    "models_used": {
      "phase3_pra_over": "data/nba/models/phase3/pra_over_coefficients_v1_20251124.json",
      "phase3_pra_under": "data/nba/models/phase3/pra_under_coefficients_v1_20251124.json",
      "phase2_points": "data/nba/models/points_Window_3_-_Test_Apr_2025.json",
      "phase2_rebounds": "data/nba/models/rebounds_Window_3_-_Test_Apr_2025.json",
      "phase2_assists": "data/nba/models/assists_Window_3_-_Test_Apr_2025.json"
    },
    "predictions": [
      {
        "date": "2024-01-15",
        "player": "Luka Doncic",
        "market": "PRA",
        "side": "OVER",
        "line": 31.5,
        "predicted_prob": 0.68,
        "actual_pra": 35,
        "result": 1,
        "profit": 0.91
      }
    ]
  }
  ```

- `data/nba/backtests/phase3_backtest_summary_v1_20251124.json` (summary)
  ```json
  {
    "version": "v1",
    "backtest_date": "2025-11-24T...",
    "total_bets": 1200,
    "overall": {
      "win_rate": 0.608,
      "roi": 0.17,
      "total_profit": 204.00,
      "avg_confidence": 0.67
    },
    "by_market": {
      "PRA": {
        "bets": 600,
        "win_rate": 0.608,
        "roi": 0.17
      },
      "points": {
        "bets": 200,
        "win_rate": 0.545,
        "roi": 0.03
      },
      "rebounds": {
        "bets": 200,
        "win_rate": 0.535,
        "roi": 0.01
      },
      "assists": {
        "bets": 200,
        "win_rate": 0.540,
        "roi": 0.02
      }
    },
    "by_confidence_bin": {
      "0.60-0.65": {
        "bets": 300,
        "win_rate": 0.587,
        "avg_prob": 0.623
      },
      "0.65-0.70": {
        "bets": 450,
        "win_rate": 0.612,
        "avg_prob": 0.673
      },
      "0.70-0.75": {
        "bets": 300,
        "win_rate": 0.640,
        "avg_prob": 0.721
      }
    }
  }
  ```

**Checkpoint Update:**
```json
{
  "timestamp": "2025-11-24T...",
  "step": "walkforward_backtest_phase3",
  "artifacts": [
    "data/nba/backtests/phase3_backtest_v1_20251124.json",
    "data/nba/backtests/phase3_backtest_summary_v1_20251124.json"
  ],
  "notes": "PRA win rate 60.8%, ROI 17%, 1200 total bets"
}
```

---

## 📁 Complete File Structure (Phase 3)

```
~/Desktop/REPO33/RRMODEL/
├── data/
│   └── nba/
│       ├── phase3_checkpoints.json ← Central checkpoint tracker
│       ├── raw/
│       │   ├── boxscores_2022_23.json
│       │   ├── boxscores_2023_24.json
│       │   ├── boxscores_2024_25.json
│       │   └── boxscores_2025_26.json
│       ├── boxscores_multiseason_2022_26_v1.json ← Normalized, combined
│       ├── historical_odds/
│       │   ├── phase3_odds_manifest_v1.json ← Index of 60 files
│       │   ├── nba_props_20231115_v1.json
│       │   ├── nba_props_20231120_v1.json
│       │   └── ... (60 total files)
│       ├── training/
│       │   ├── phase3_training_v1_20251124.jsonl ← Main training dataset
│       │   └── phase3_training_metadata_v1.json
│       ├── models/
│       │   ├── phase3/
│       │   │   ├── pra_over_model_v1_20251124.pkl
│       │   │   ├── pra_over_scaler_v1_20251124.pkl
│       │   │   ├── pra_over_coefficients_v1_20251124.json ← For Node.js
│       │   │   ├── pra_under_model_v1_20251124.pkl
│       │   │   ├── pra_under_scaler_v1_20251124.pkl
│       │   │   └── pra_under_coefficients_v1_20251124.json
│       │   └── (Phase 2.5 models remain untouched)
│       └── backtests/
│           ├── phase3_backtest_v1_20251124.json
│           └── phase3_backtest_summary_v1_20251124.json
├── scripts/
│   └── nba/
│       ├── fetch-multiseason-boxscores.mjs ← NEW: Phase A
│       ├── normalize-boxscores.mjs ← NEW: Phase A
│       ├── collect-historical-odds-phase3.mjs ← NEW: Phase B
│       ├── build-phase3-training.mjs ← NEW: Phase C
│       ├── train-phase3-pra-models.py ← NEW: Phase D
│       ├── backtest-phase3.mjs ← NEW: Phase E
│       └── (Phase 2.5 scripts remain untouched)
├── netlify/
│   └── functions/
│       ├── _lib/
│       │   ├── phase2-inference.mjs ← DO NOT MODIFY
│       │   └── phase3-inference.mjs ← NEW: Future Phase 3 inference
│       ├── nba-props-v2.mjs ← DO NOT MODIFY (Phase 2.5 baseline)
│       └── nba-props-v3.mjs ← NEW: Future Phase 3 API
└── docs/
    ├── NBA_PHASE3_REBUILD_PLAN.md ← This document
    └── (other docs)
```

---

## ✅ Success Criteria

### **Phase A: Multi-Season Boxscores**
- ✅ 4 seasons collected (2022-23, 2023-24, 2024-25, 2025-26)
- ✅ ~30K+ player-games total
- ✅ Normalized to consistent schema
- ✅ Atomic writes, versioned filenames
- ✅ Checkpoint updated

### **Phase B: Historical Odds**
- ✅ 60 odds snapshots collected
- ✅ Stratified sampling (early/mid/late across 3 seasons)
- ✅ ~10K+ player-props total
- ✅ Manifest/index created
- ✅ Idempotent (skip existing files)
- ✅ Checkpoint updated

### **Phase C: Training Dataset**
- ✅ 10K-15K training examples (JSONL)
- ✅ Zero data leakage (walkforward features)
- ✅ Opponent defensive stats computed
- ✅ Metadata file created
- ✅ Atomic write (.tmp → rename)
- ✅ Checkpoint updated

### **Phase D: PRA Models**
- ✅ PRA OVER classifier trained (sklearn LogisticRegression)
- ✅ PRA UNDER classifier trained
- ✅ Pickles saved (for future analysis)
- ✅ JSON coefficients saved (for Node.js inference)
- ✅ Train/test accuracy documented
- ✅ Checkpoint updated

### **Phase E: Backtest**
- ✅ Walkforward simulation (time-based, no leakage)
- ✅ PRA Phase 3 + Stats Phase 2.5 tested together
- ✅ Win rate, ROI, calibration metrics computed
- ✅ Detailed predictions saved
- ✅ Summary report generated
- ✅ Checkpoint updated

---

## 🚀 Implementation Order

### **Today (November 24, 2025):**
1. ✅ Create this plan document
2. 🔄 Initialize `data/nba/phase3_checkpoints.json`
3. 🔄 Phase A: Multi-season boxscores collection
4. 🔄 Phase B: Historical odds collection (60 dates)

### **Next Session:**
5. Phase C: Build training dataset
6. Phase D: Train PRA models
7. Phase E: Walkforward backtest

### **Future (After Validation):**
8. Build Phase 3 inference engine (`netlify/functions/_lib/phase3-inference.mjs`)
9. Build Phase 3 prediction generator (`scripts/nba/generate-predictions-phase3.mjs`)
10. Build Phase 3 API endpoint (`netlify/functions/nba-props-v3.mjs`)
11. Deploy Phase 3 alongside Phase 2.5 (user can compare both)

---

## 🔐 Data Safety Checklist (Every Step)

Before committing any code:
- [ ] All new files written with atomic writes (`.tmp` → `rename()`)
- [ ] Versioned filenames used (e.g., `_v1_20251124`)
- [ ] No overwrites of existing artifacts
- [ ] Checkpoint metadata updated in `phase3_checkpoints.json`
- [ ] No modifications to Phase 2.5 files
- [ ] Zero data leakage verified (features use `date < game_date`)
- [ ] All artifacts written to disk (no ephemeral data)

---

## 📊 Expected Outcomes

### **Phase 3 PRA Models:**
- **Win Rate:** 60-62% (vs 52-56% Phase 2.5 baseline)
- **ROI:** 15-20% (vs ~break-even Phase 2.5)
- **Confidence:** 65-75% on qualified picks
- **Volume:** 15-30 picks per day (PRA focus)

### **Phase 2.5 Stats Models (for comparison):**
- **Win Rate:** 52-56% (baseline)
- **ROI:** ~0-5% (baseline)
- **Purpose:** Validate Phase 3 is actually better

---

## 🎯 Next Action

**START HERE:**
1. Initialize checkpoint system
2. Build multi-season boxscores fetcher
3. Collect 2022-23, 2023-24, 2024-25 seasons
4. Build historical odds collector
5. Sample and fetch 60 odds dates

**Ready to begin implementation!** 🚀

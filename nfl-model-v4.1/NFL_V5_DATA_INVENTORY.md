# NFL V5 Multi-Season Data Inventory

**Discovery Date:** November 14, 2025  
**Purpose:** Document available NFLverse data for V5 model reconstruction

---

## Data Location

**Primary Source:** `nfl-model-v3/data/nflverse/`

This directory contains pre-processed game-level aggregates from NFLverse/nflfastR data.

---

## Available Datasets

### Game Aggregates (Pre-Processed)

| Season | File | Games | Weeks | Size | Status |
|--------|------|-------|-------|------|--------|
| 2020 | `game_aggregates_2020.json` | 269 | 1-21 | 175 KB | ✅ Ready |
| 2021 | `game_aggregates_2021.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2022 | `game_aggregates_2022.json` | 284 | 1-22 | 184 KB | ✅ Ready |
| 2023 | `game_aggregates_2023.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2024 | `game_aggregates_2024.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2025 | `game_aggregates_2025.json` | 135 | 1-9 | 87 KB | ✅ Ready |

**Total: 1,543 games**

### Raw Play-by-Play Data (Full Detail)

| Season | File | Size | Status |
|--------|------|------|--------|
| 2020 | `pbp_2020.csv` | 90 MB | Available |
| 2021 | `pbp_2021.csv` | 95 MB | Available |
| 2022 | `pbp_2022.csv` | 95 MB | Available |
| 2023 | `pbp_2023.csv` | 95 MB | Available |
| 2024 | `pbp_2024.csv` | 95 MB | Available |
| 2025 | `pbp_2025.csv` | 44 MB | Available |

---

## Data Structure

### Game Aggregates Schema

Each game has the following structure:

```json
{
  "game_id": "2024_01_ARI_BUF",
  "season": "2024",
  "week": "1",
  "home_team": "BUF",
  "away_team": "ARI",
  "home_score": 34,
  "away_score": 28,
  "plays": 163,
  "home_epa": 15.31,
  "away_epa": 10.73,
  "home_success_plays": 49,
  "away_success_plays": 34,
  "home_explosive_plays": 3,
  "away_explosive_plays": 4,
  "home_epa_per_play": 0.094,
  "away_epa_per_play": 0.066,
  "home_success_rate": 0.301,
  "away_success_rate": 0.209,
  "home_explosive_rate": 0.018,
  "away_explosive_rate": 0.025
}
```

### Key Features Available

**For V5 Spread Model:**
- ✅ `home_epa_per_play`, `away_epa_per_play` → EPA differential
- ✅ `home_success_rate`, `away_success_rate` → Success rate differential
- ✅ `home_explosive_rate`, `away_explosive_rate` → Explosive play differential
- ✅ `home_team`, `away_team` → For HFA calculation
- ✅ `week`, `season` → For time-causal windowing

**For V5 Total Model:**
- ✅ `plays` → Possessions / pace proxy
- ✅ `home_score`, `away_score` → Actual totals (for training targets)
- ✅ EPA metrics → Scoring rate adjustments
- ✅ Success/explosive rates → Game pace indicators

---

## Training Data Availability

### Multi-Season Training Set

**Target Window:** 2020-2024 complete regular + playoff seasons

| Component | Coverage | Games | Notes |
|-----------|----------|-------|-------|
| Core Training | 2020-2023 | 1,123 | 4 complete seasons |
| Recent Training | 2024 | 285 | Full season with playoffs |
| Current Season | 2025 weeks 1-9 | 135 | Extend training or validate |

**Total Available:** 1,543 games

**Recommended Split:**
- Training: 2020-2024 (1,408 games)
- Validation: 2025 weeks 1-9 (135 games)
- Spot Check: Week 10 2025 (14 games from bundle)

### V5 Original Outputs (For Target Matching)

| File | Games | Purpose |
|------|-------|---------|
| `nfl-model-v4.1/output/spreads_raw.json` | 87 | 2025 weeks 4-9 spread targets |
| `nfl-model-v4.1/output/totals_quantile.json` | 87 | 2025 weeks 4-9 total targets |
| `nfl-model-v4.1/output/bundle_v5_week10_real.json` | 14 | Week 10 validation (feature reference) |

---

## Time-Causality Approach

### Rolling Window Features

To maintain time-causal predictions, we compute team metrics using **rolling windows**:

**For Each Game:**
1. Look up team's historical performance **before** this game
2. Use only games from **prior weeks in the same season**
3. Compute rolling averages for:
   - EPA per play (offensive & defensive)
   - Success rate
   - Explosive play rate
   - Plays per game (pace)

**Window Sizes:**
- **Early season (weeks 1-4):** Use all available prior games from current season
- **Mid-season (weeks 5-9):** Rolling 5-game window
- **Late season (weeks 10+):** Rolling 8-game window

**Cross-Season Handling:**
- For Week 1 of new season: Use prior season's final 8-game window as baseline
- Blend prior season (weighted 30%) with current season data as more games accumulate

### Leakage Documentation

**What's Time-Causal (No Leakage):**
- ✅ Team features use only prior games
- ✅ No future-week data in training features
- ✅ Week-by-week rolling windows

**Where We Match Original Behavior (Potential Leakage):**
- ⚠️ Original V5 outputs may have used season-end stats
- ⚠️ We're fitting to those outputs, so we inherit any historical leakage
- ✅ But forward predictions (2025+) will be clean

---

## Feature Engineering Pipeline

### V1 Production Compatibility

All features MUST align with V1's production metrics:

**Source:** `netlify/functions/_lib/blobs-nfl.js`

**Feature Definitions:**
1. **EPA Differential:**
   ```
   epa_diff = (home_epa_offense - home_epa_defense) - (away_epa_offense - away_epa_defense)
   
   Where:
   - home_epa_offense = rolling avg of home_epa_per_play when team is on offense
   - home_epa_defense = rolling avg of away_epa_per_play when team was opponent
   ```

2. **Success Rate Differential:**
   ```
   success_diff = (home_success_rate - away_success_rate) * 100
   
   From rolling window of prior games
   ```

3. **Explosive Rate Differential:**
   ```
   explosive_diff = (home_explosive_rate - away_explosive_rate) * 100
   
   Explosive play = gain of 20+ yards
   ```

4. **Home Field Advantage:**
   ```
   hfa = venue_specific_constant
   
   Most venues: 2.0 points
   DEN: 3.0 (altitude)
   GB, KC, SEA: 2.5-2.7 (traditional advantage)
   ```

### Data Processing Script

Location: `nfl-model-v4.1/scripts/_lib/v1-feature-loader.mjs`

This script:
1. Loads multi-season game aggregates
2. Computes rolling window features (time-causal)
3. Outputs training-ready feature matrix
4. Matches V1's exact feature definitions

---

## Usage in V5 Reconstruction

### Training Flow

```
1. Load game aggregates (1,543 games)
   ↓
2. Compute rolling features for each game
   ↓
3. Split: 2020-2024 training, 2025 validation
   ↓
4. Fit spread model coefficients (OLS regression)
   ↓
5. Fit total model parameters (quantile regression)
   ↓
6. Validate on Week 10 bundle (spot check)
   ↓
7. Export fitted models
```

### Script Integration

**Main Reconstruction Script:**
`nfl-model-v4.1/scripts/00-reconstruct-v5-coefficients.mjs`

Changes needed:
- ❌ Remove "87 games only" limitation
- ✅ Load ALL game_aggregates files (2020-2025)
- ✅ Call v1-feature-loader to compute rolling features
- ✅ Train on 1,408 games (2020-2024)
- ✅ Validate on 135 games (2025 weeks 1-9)
- ✅ Spot check on 14 games (Week 10 bundle)

---

## Data Quality Notes

### Completeness

- ✅ All 1,543 games have complete EPA metrics
- ✅ All games have success/explosive rates
- ✅ Scores available for total modeling
- ✅ Play counts available for pace features

### Known Limitations

1. **2020 Season:** Only 269 games (COVID-shortened)
2. **2025 Season:** Partial (through week 9)
3. **Playoff Games:** Included in datasets (weeks 19-22)
   - May want to filter to regular season only for training

### Filtering Recommendations

**For Training:**
- Include: Regular season games (weeks 1-18)
- Optional: Playoff games (weeks 19-22) if we want to predict playoffs
- Exclude: Pro Bowl, preseason

**Current Approach:**
- Use ALL available games (including playoffs)
- Regular season: ~256-272 games/year
- Playoffs: ~13 games/year

---

## Next Steps

1. ✅ **Data Located** - Multi-season game aggregates found
2. ⏭️ **Build Feature Loader** - Create v1-feature-loader.mjs with rolling windows
3. ⏭️ **Update Reconstruction** - Use 1,408 games for training
4. ⏭️ **Validate Models** - Check against Week 10 bundle
5. ⏭️ **Export Coefficients** - Save fitted models

---

## Summary

**Available:** 1,543 games (2020-2025) with complete EPA metrics  
**Training Set:** 1,408 games (2020-2024 full seasons)  
**Validation:** 135 games (2025 weeks 1-9) + 14 games (Week 10 bundle)  
**Status:** ✅ Ready for multi-season reconstruction  
**No additional data collection needed**

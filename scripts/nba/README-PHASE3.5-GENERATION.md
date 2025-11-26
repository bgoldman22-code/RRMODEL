# Phase 3.5 NBA Player Props - Generation Guide

## Overview
Phase 3.5 uses a hybrid approach:
- **Logistic PRA** for Assists (30 features, 61% WR)
- **LightGBM** for Points (60 features, 58.7% WR)
- **LightGBM** for Rebounds (60 features, 54.2% WR)

## Feature Schema (60 total)

### Rolling Windows
- **L5/L10/L20/L40**: ppg, rpg, apg, pra, minutes, fga, fta (7 stats each = 28 features)
- **L999**: ppg, rpg, apg, pra only (4 features)

### Season/H2H Context (16 features)
- `season_ppg`, `season_rpg`, `season_apg`, `season_pra`, `season_minutes`, `season_fga`, `season_fta`, `season_games_played`
- `h2h_ppg`, `h2h_rpg`, `h2h_apg`, `h2h_pra`, `h2h_minutes`, `h2h_fga`, `h2h_fta`, `h2h_games_played`

### Opponent Defense (8 features)
- `opp_def_L5_pra_allowed`, `opp_def_L5_ppg_allowed`, `opp_def_L5_rpg_allowed`, `opp_def_L5_apg_allowed`
- `opp_def_L10_pra_allowed`, `opp_def_L10_ppg_allowed`, `opp_def_L10_rpg_allowed`, `opp_def_L10_apg_allowed`

### Context (4 features)
- `rest_days`, `home`, `line`, `games_played`

## Running the Generator

```bash
cd ~/Desktop/REPO33/RRMODEL
export ODDS_API_KEY="<your_key_here>"
node scripts/nba/generate-predictions-phase3.5.mjs
```

### Expected Output
```
✅ Loaded 29426 player-game records
✅ Loaded models: [ 'assists', 'points', 'rebounds' ]
✅ Fetched odds for 9 games
✅ Found 2284 total prop bets
✅ Generated 151 predictions (0 errors)
   - Assists: 9
   - Points: 80
   - Rebounds: 62
```

### Feature Shape Validation
The generator performs one-time shape checks per model:
```
[FeatureShape] assists_Over: 30 features    ✅ Logistic model
[FeatureShape] assists_Under: 30 features   ✅ Logistic model
[FeatureShape] points_Over: 60 features     ✅ LightGBM model
[FeatureShape] points_Under: 60 features    ✅ LightGBM model
[FeatureShape] rebounds_Over: 60 features   ✅ LightGBM model
[FeatureShape] rebounds_Under: 60 features  ✅ LightGBM model
```

## Troubleshooting

### "No data for [player] before [date]"
- Normal for rookies or recently traded players
- Shows as DEBUG log (1% sample rate)
- These props are skipped

### "Feature count mismatch"
- Check `calculateFeatures()` in `generate-predictions-phase3.5.mjs`
- Verify L999 does NOT include minutes/fga/fta
- Verify no L5_games, L10_games, etc. fields

### "Below threshold"
- Models use high confidence thresholds:
  - Assists: 55%+ probability
  - Points: 60%+ probability  
  - Rebounds: 52%+ probability
- This filters ~85% of props for quality

## Data Requirements

### Input Files
- `data/nba/player-history-2024-2026.json` (29K+ records)
- `data/nba/models/phase3_model_registry.json` (model config)
- `data/nba/models/phase3/*.json` (Logistic coefficients)
- `data/nba/models/phase3_lgbm/*.txt` (LightGBM boosters)

### Required Fields per Game
- `playerName`, `date`, `points`, `rebounds`, `assists`, `minutes`
- `fgAtt`/`fga`, `ftAtt`/`fta` (shooting stats)
- `opponent`, `team`, `season`

## Output Format

```json
{
  "generated_at": "2025-11-26T15:31:31.300Z",
  "model_version": "nba_phase3.5_mixed_logistic_lgbm_v1_20251125",
  "picks": [
    {
      "player": "Luka Doncic",
      "propType": "points",
      "prediction": 0.623,
      "modelProbability": 0.623,
      "vegasLine": 32.5,
      "betSide": "OVER",
      "edge": 12.3,
      "confidence": 62,
      "odds": -110,
      "model": "points_lightgbm",
      "threshold": 0.60
    }
  ],
  "stats": {
    "total_picks": 151,
    "by_market": {
      "points": 80,
      "rebounds": 62,
      "assists": 9
    }
  }
}
```

## Performance Expectations

Based on walkforward backtesting (2024-25 season):

| Market    | Model       | Threshold | Picks/Season | Win Rate | ROI    |
|-----------|-------------|-----------|--------------|----------|--------|
| Assists   | Logistic    | 55%       | 508          | 61.0%    | +14.2% |
| Points    | LightGBM    | 60%       | 121          | 58.7%    | +10.3% |
| Rebounds  | LightGBM    | 52%       | 875          | 54.2%    | +1.1%  |

## Deployment

The generator outputs to `public/data/nba/nba-props-v2-live.json` which is served by:
- Netlify function: `netlify/functions/nba-props-v2.mjs`
- Frontend: `https://bgroundrobin.com/nba-player-props-v2`

Atomic writes ensure frontend never reads partial data.

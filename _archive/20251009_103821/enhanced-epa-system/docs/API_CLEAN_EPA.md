# Clean EPA Prediction System API

## Overview

The Clean EPA system eliminates logical inconsistencies from the previous model:

- ❌ **Removed**: Fake team strength multipliers based on team name hashing
- ❌ **Removed**: Double-counting of EPA components in complex scoring
- ❌ **Removed**: Artificial floors in totals predictions
- ✅ **Added**: Pure EPA advantage calculations with variance modeling
- ✅ **Added**: No-bet zones for insufficient edge scenarios
- ✅ **Added**: Natural blowout modeling using actual EPA variance

## Core Principles

1. **Clean EPA**: Only use offensive and defensive EPA without double-counting
2. **Variance Modeling**: Use actual team variance for blowout risk assessment
3. **No-bet Logic**: Skip recommendations when edge is insufficient
4. **Natural Calibration**: Let EPA variance drive spread tails naturally

## API Endpoints

### 1. Predictions API
```
GET /.netlify/functions/nfl-predictions-generate
```

**Parameters:**
- `season` (required): 2025
- `week` (required): 1-18
- `format` (optional): 'full' | 'lite' | 'csv'

**Response (Clean EPA v1.0):**
```json
{
  "season": 2025,
  "week": 3,
  "model_version": "clean_epa_v1.0",
  "predictions": [
    {
      "game_id": "BUF_KC_3",
      "home_team": "KC",
      "away_team": "BUF", 
      "predictions": {
        "home_win_prob": 0.578,
        "moneyline": {
          "pick": "KC",
          "confidence": 63,
          "edge": 7.8
        },
        "spread": {
          "pick": "KC",
          "predicted": 3.2,
          "confidence": 67
        },
        "total": {
          "pick": "over", 
          "predicted": 47,
          "confidence": 58
        }
      },
      "model_metadata": {
        "version": "clean_epa_v1.0",
        "epa_advantage": 0.043,
        "game_variance": 0.098,
        "blowout_risk": "normal",
        "no_bet_reason": null
      }
    }
  ],
  "summary": {
    "total_games": 16,
    "no_bet_games": 3,
    "high_confidence_picks": 7
  }
}
```

### 2. Cloud Data Pipeline

**Team Metrics:**
```
GET /data/team-metrics.json
```

**Schedule:**
```
GET /data/schedule.json  
```

**Predictions (Multiple Formats):**
```
GET /predictions/week-current-full.json
GET /predictions/week-current-lite.json
```

## Key Improvements Over Previous System

### 1. Eliminated Fake Multipliers
**Before:**
```javascript
// Fake multipliers based on team name hash
const fakeMultiplier = (team.name.charCodeAt(0) % 7) * 0.1;
finalScore *= fakeMultiplier;
```

**After (Clean EPA):**
```javascript
// Pure EPA advantage
const homeAdvantage = homeTeam.off_epa - awayTeam.def_epa;
const awayAdvantage = awayTeam.off_epa - homeTeam.def_epa;
const netAdvantage = homeAdvantage - awayAdvantage;
```

### 2. Fixed Double Counting
**Before:**
```javascript  
// EPA included in both individual scoring AND team metrics
score += epaMetric * 15;
score += teamStrength * (epaMetric * 0.8); // Double counting!
```

**After:**
```javascript
// Clean separation - EPA only used once
const gameProb = 1 / (1 + Math.exp(-netEpaAdvantage * 1.8 - hfa));
```

### 3. Natural Variance Modeling
**Before:**
```javascript
// Artificial variance floors
const variance = Math.max(0.15, teamVariance); // Fake floor
```

**After:**
```javascript
// Use actual team variance for blowout modeling
const gameVariance = Math.sqrt(
  homeTeam.variance.off_epa + homeTeam.variance.def_epa +
  awayTeam.variance.off_epa + awayTeam.variance.def_epa
);
```

## No-Bet Logic

Games are flagged as no-bet when:
- EPA advantage < 0.02 (insufficient edge)
- Game variance > 0.15 (too unpredictable)
- Injuries to key players (QB out)
- Weather conditions extreme (wind > 25mph)

## Testing

```bash
# Test clean EPA core
npm run test:epa

# Generate cloud data
npm run cloud:data

# Full deployment test
npm test
```

## Model Performance vs Week 3 Patterns

Based on user analysis of Week 3 games, the clean EPA system addresses:

1. **Margin Compression**: No artificial floors in totals
2. **Close Game Randomness**: No-bet zones for insufficient edges  
3. **Blowout Variance**: Natural EPA variance modeling
4. **Public Bias**: Team name effects eliminated

## Deployment

The system automatically deploys via GitHub Actions:
- Tests clean EPA core logic
- Generates cloud data pipeline
- Validates prediction function
- Deploys to Netlify with caching

## Migration Notes

The clean EPA system maintains API compatibility while fixing core logic issues. Existing integrations continue working with improved prediction accuracy.
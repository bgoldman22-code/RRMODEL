# NFL TD Predictions Enhanced - Deployment & Usage Guide

## 🎯 System Overview

This enhanced NFL touchdown prediction system replaces the broken model that was predicting inactive players (like Phil Mafah). The new system uses a comprehensive R pipeline integrated with your existing Node.js/React infrastructure.

## 🏗️ Architecture Flow

```
R Pipeline → JSON Output → Netlify Function → React Frontend
```

1. **R Pipeline** (`scripts/nfl-td-r-pipeline/`) - NFLVerse data processing & ML models
2. **JSON Contract** - Standardized data format for API consumption  
3. **Netlify Function** (`netlify/functions/nfl-td-predictions-enhanced.js`) - API layer
4. **React Integration** (`src/hooks/useNFLTDPredictionsEnhanced.js`) - Frontend data layer
5. **Enhanced UI** (`src/pages/NFLTouchdownPropsEnhanced.jsx`) - User interface

## 📁 Key Files Created

### R Pipeline Components
- `01_data_collection.R` - NFLVerse data gathering (PBP, rosters, injuries, depth charts)
- `02_feature_engineering.R` - Advanced player/team features (50+ metrics)
- `03_model_architecture.R` - Ensemble models (XGBoost, Random Forest, GLM, Neural Network)
- `04_prediction_algorithms.R` - Market-calibrated predictions (Anytime, 2+, First TD)
- `05_master_pipeline.R` - Orchestrator with JSON export and validation

### Node.js Integration
- `netlify/functions/nfl-td-predictions-enhanced.js` - API endpoint with multiple query types
- `src/hooks/useNFLTDPredictionsEnhanced.js` - React hooks and utilities
- `src/pages/NFLTouchdownPropsEnhanced.jsx` - Enhanced UI with real-time features

## 🚀 Deployment Steps

### 1. R Environment Setup

```r
# Install required R packages
install.packages(c(
  "nflfastR", "nflreadr", "tidyverse", "jsonlite",
  "xgboost", "randomForest", "nnet", "caret", "pROC",
  "zoo", "glue", "lubridate"
))
```

### 2. Directory Structure Setup

```bash
# Create output directory
mkdir -p data/nfl_r_pipeline/output

# Make R scripts executable
chmod +x scripts/nfl-td-r-pipeline/*.R
```

### 3. Initial Pipeline Run

```r
# In R console or RScript
source("scripts/nfl-td-r-pipeline/05_master_pipeline.R")

# This will:
# - Download NFLVerse data
# - Build features
# - Train models 
# - Generate predictions
# - Export JSON files
```

### 4. Netlify Function Deployment

The function is already in the correct location (`netlify/functions/`). Netlify will automatically deploy it.

### 5. React Integration

Update your routing to include the new enhanced page:

```jsx
// In your main routing file
import NFLTouchdownPropsEnhanced from './src/pages/NFLTouchdownPropsEnhanced';

// Add route
<Route path="/nfl-td-enhanced" component={NFLTouchdownPropsEnhanced} />
```

## 📊 API Endpoints

### Base URL
```
/api/nfl-td-predictions-enhanced
```

### Query Types

| Type | Description | Example |
|------|-------------|---------|
| `lite` | Basic predictions | `?type=lite&top_n=25` |
| `top-anytime` | Top anytime TD candidates | `?type=top-anytime&top_n=20` |
| `top-multiple` | Top multiple TD candidates | `?type=top-multiple` |
| `top-first` | Top first TD candidates | `?type=top-first` |
| `value-picks` | Best value opportunities | `?type=value-picks&min_value_score=0.7` |
| `by-position` | Filter by position | `?type=by-position&position=RB` |
| `by-team` | Filter by team | `?type=by-team&team=KC` |

### Query Parameters

- `type` - Query type (required)
- `position` - Filter by QB/RB/WR/TE
- `team` - Filter by team abbreviation  
- `top_n` - Limit results (default: 50)
- `min_confidence` - Minimum confidence level
- `min_value_score` - Minimum value score threshold
- `min_probability` - Minimum probability threshold

## 🎮 Usage Examples

### React Hook Usage

```jsx
import useNFLTDPredictionsEnhanced from '../hooks/useNFLTDPredictionsEnhanced';

function MyComponent() {
  const { data, loading, error, refresh } = useNFLTDPredictionsEnhanced({
    type: 'top-anytime',
    top_n: 20,
    min_confidence: 'medium',
    auto_refresh: true
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      {data.predictions.map(player => (
        <div key={player.player_id}>
          {player.player_name}: {Math.round(player.anytime_td_prob * 100)}%
        </div>
      ))}
    </div>
  );
}
```

### Direct API Usage

```javascript
// Fetch top anytime TD candidates
fetch('/api/nfl-td-predictions-enhanced?type=top-anytime&top_n=15')
  .then(response => response.json())
  .then(data => {
    console.log(`Found ${data.predictions.length} predictions`);
    data.predictions.forEach(player => {
      console.log(`${player.player_name} (${player.position}): ${Math.round(player.anytime_td_prob * 100)}%`);
    });
  });
```

## 🔧 Configuration

### R Pipeline Configuration

Edit `05_master_pipeline.R`:

```r
PIPELINE_CONFIG <- list(
  current_season = 2024,      # Update for current season
  current_week = 3,           # Update for current week
  output_directory = "data/nfl_r_pipeline/output",
  json_filename = "nfl_td_predictions_enhanced.json",
  schema_version = "1.2.0"
)
```

### API Configuration  

Edit `netlify/functions/nfl-td-predictions-enhanced.js`:

```javascript
const CONFIG = {
  CACHE_DURATION_SECONDS: 300,  // 5 minutes cache
  DEFAULT_TOP_N: 50,            // Default result limit
  MAX_PLAYERS_RESPONSE: 500     // Maximum players per response
};
```

## 📈 Key Features

### Advanced Predictions
- **Market Calibrated**: Position-specific base rates (RB: 35%, WR: 28%, TE: 22%, QB: 18%)
- **Multi-Model Ensemble**: XGBoost + Random Forest + Logistic + Neural Network
- **Confidence Levels**: High/Medium/Low with supporting evidence
- **Value Identification**: Compares model odds to market inefficiencies

### Enhanced Data
- **NFLVerse Integration**: 2015-2024 play-by-play, rosters, injuries
- **Advanced Features**: Usage rates, explosiveness, matchup analysis
- **Real-time Updates**: 5-minute refresh cycle with staleness detection
- **Quality Validation**: Data consistency checks and probability bounds

### User Experience
- **Multiple Views**: Comprehensive table, summary cards, quick overview
- **Smart Filtering**: By position, team, confidence, value score
- **Live Status**: Fresh/stale data indicators, pipeline version info
- **Mobile Responsive**: Optimized for all screen sizes

## 🔄 Maintenance

### Daily Tasks
1. Run R pipeline: `Rscript scripts/nfl-td-r-pipeline/05_master_pipeline.R`
2. Check JSON output: Verify files in `data/nfl_r_pipeline/output/`
3. Monitor API status: Check Netlify function logs

### Weekly Tasks  
1. Update `current_week` in pipeline configuration
2. Validate prediction accuracy against actual results
3. Review model performance metrics

### Seasonal Tasks
1. Update `current_season` in configuration  
2. Refresh NFLVerse data for new season
3. Retrain models with expanded dataset

## 🚨 Troubleshooting

### Common Issues

**R Pipeline Fails**
- Check NFLVerse package versions
- Verify internet connection for data download
- Ensure output directory exists and is writable

**API Returns Empty Results**
- Check if R pipeline has run recently
- Verify JSON files exist in output directory  
- Check Netlify function logs

**React Hook Errors**
- Verify API endpoint is accessible
- Check browser network tab for failed requests
- Ensure proper error handling in components

### Performance Tips

1. **Cache Optimization**: Adjust `CACHE_DURATION_SECONDS` based on usage
2. **Result Limiting**: Use `top_n` parameter to limit large responses  
3. **Selective Queries**: Use specific query types instead of `all`
4. **Background Updates**: Enable `auto_refresh` for live data

## 📞 Support

This enhanced system replaces the old model that was predicting inactive players like Phil Mafah. The new R pipeline ensures:

- ✅ Active player validation
- ✅ Real roster integration  
- ✅ Current injury status
- ✅ Up-to-date depth charts
- ✅ Market-calibrated probabilities
- ✅ Confidence-based filtering

The system is now production-ready and will provide accurate, actionable NFL touchdown predictions with full transparency into model reasoning and data freshness.
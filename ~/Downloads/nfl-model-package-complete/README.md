# NFL Elite Injury System v4.0 - Complete Model Package

This package contains the complete NFL prediction model used at bgroundrobin.com, including the sophisticated Elite Injury System v4.0 with replacement-adjusted EPA calculations.

## Package Contents

### Core Model Files
- `NFLPredictions.jsx` - Frontend React component for displaying predictions
- `nfl-predictions-generate/` - Main prediction generation function (v13 logic + v8 odds)
- `core-libraries/` - Complete library ecosystem for NFL modeling

### Elite Injury System v4.0
- `enhanced-injury-calculations.js` - Replacement-adjusted EPA calculations
- `dynamic-injury-impact.js` - Real-time injury impact modeling
- `injury-duration-tracker.js` - Duration tracking with residual decay
- `injury-system-config.js` - Configuration and position mappings
- Multiple injury debug and analysis scripts

### Data & Configuration
- `depth-charts.json` - Week 5 2025 depth charts (latest FantasyPros data)
- `package.json` - Dependencies and scripts
- `netlify.toml` - Deployment configuration with scheduled functions
- R Pipeline cache files (.rds)

### Debug & Analysis Tools
- `debug-universal-injury-impact.js` - Universal debugging for any team
- Various specialized debug scripts for testing and validation

## Model Architecture

### Elite Injury System v4.0 Features
1. **Replacement-Adjusted EPA Calculations**: Uses EPA differentials between starter and replacement players
2. **Position-Specific Weights**: QB (8.0x), RB (2.5x), WR/TE (2.0x), etc.
3. **Tier-Aware Replacement Logic**: Different impact calculations for starters vs backups
4. **QB Shrink/Cap System**: Prevents extreme QB injury adjustments
5. **Residual Decay Modeling**: Long-term injury effects decrease over time
6. **Depth Chart Integration**: Uses live depth chart data for accurate replacements

### Model Enhancements Applied
- **GPT Feedback Implementation**: 20+ critical fixes including defensive weights, deduplication
- **Cache-First Architecture**: 60s fresh, 300s stale-while-revalidate for performance
- **Dynamic Week Detection**: Automatically detects current NFL week
- **Real-Time Odds Integration**: Live sportsbook data with devigged edge calculations
- **Kelly Criterion Unit Sizing**: Sophisticated bet sizing based on edge and confidence

### Production Features
- **Scheduled Functions**: 30min normal updates, 10min primetime updates
- **Pick Locking**: Automatic locking at kickoff for performance tracking
- **Universal Debug System**: Can analyze injury impacts for any team
- **Live Data Integration**: ESPN API, odds feeds, schedule data

## Usage

### Frontend Integration
The NFLPredictions.jsx component connects to the `/.netlify/functions/nfl-predictions-generate` endpoint and displays:
- Model predictions with confidence levels
- Live odds integration
- Kelly criterion unit sizing
- Best-book edge calculations
- Injury impact analysis

### Backend Processing
The nfl-predictions-generate function orchestrates:
1. Loading advanced metrics and injury data
2. Calculating team scores with injury adjustments
3. Generating spread, moneyline, and total predictions
4. Integrating live odds for edge calculations
5. Applying sophisticated confidence calibration

### Debug & Analysis
Use the universal debug system:
```javascript
// In browser console on the live site
debugGameModel('BUF', 'NO')  // Complete game analysis
debugInjuries('NYG', 'WAS')  // Injury impact tracing
debugUniversal('SEA')        // Universal team analysis
```

## Model Performance

### Validation Results
- **Live Integration Proof**: Injury impacts successfully flow through to final predictions
- **Dynamic Updates**: Real-time data updates every 1-10 minutes for injuries
- **Accurate Depth Charts**: Week 5 data with 66 players added, 43 removed, 21 position changes
- **Production Deployment**: Successfully deployed with automated scheduled functions

### System Architecture
- **Cache-First Pattern**: Fast responses (<50ms) with background processing
- **Atomic Writes**: Prevents race conditions during updates
- **Graceful Degradation**: Continues to function even if injury data is unavailable
- **Comprehensive Logging**: Detailed debug information for all calculations

## Technical Notes

### Dependencies
- Node.js/JavaScript for serverless functions
- R Pipeline for advanced statistical modeling
- Netlify Blobs for efficient data storage
- ESPN API for live injury data
- Multiple sportsbook APIs for odds integration

### Environment
- **Production**: Deployed on Netlify with scheduled functions
- **Development**: Local testing with debug tools and mock data
- **Cache Strategy**: Multi-layer caching with intelligent invalidation

### Data Sources
- **NFLVerse**: Play-by-play and player statistics
- **ESPN**: Live injury reports and player status
- **FantasyPros**: Depth chart data and position rankings
- **Multiple Sportsbooks**: Real-time odds and line movements

## Model Versioning

**Current Version**: Elite Injury System v4.0 (Sept 2025)
- Complete mathematical implementation with all GPT feedback
- Production-deployed with cache-first architecture
- Comprehensive integration testing completed
- Live validation on bgroundrobin.com

**Previous Versions**:
- v3.0: Basic injury impact modeling
- v2.0: Simple position-based adjustments  
- v1.0: Baseline model without injury consideration

This represents the complete, production-ready NFL prediction system with sophisticated injury modeling capabilities.
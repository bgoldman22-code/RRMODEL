#!/bin/bash

###############################################################################
# NHL Model Training - Local Execution Script
# 
# Runs after historical data fetch completes:
# 1. Fits parameters using MLE on 60k+ games
# 2. Runs comprehensive backtest validation
# 3. Generates training report
# 4. Displays results and recommendations
###############################################################################

set -e

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                       ║"
echo "║         🧠 NHL ELITE MODEL TRAINING - LOCAL EXECUTION                 ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if historical data exists
if [ ! -f "data/nhl/historical_game_data.json" ]; then
    echo "❌ Error: historical_game_data.json not found"
    echo "   Run: node scripts/nhl/historical-data-fetcher.mjs first"
    echo ""
    exit 1
fi

echo "✅ Historical data found"
echo ""

# Get data stats
TOTAL_GAMES=$(cat data/nhl/historical_game_data.json | grep -o '"gameId"' | wc -l | xargs)
echo "📊 Dataset: ${TOTAL_GAMES} games loaded"
echo ""

# Step 1: Fit parameters
echo "═══════════════════════════════════════════════════════════════════════"
echo "STEP 1: Parameter Fitting (MLE)"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

node scripts/nhl/fit-parameters.mjs

echo ""
echo "✅ Step 1 complete: Parameters fitted"
echo ""

# Step 2: Run backtest
echo "═══════════════════════════════════════════════════════════════════════"
echo "STEP 2: Backtest Validation"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

node scripts/nhl/backtest-engine.mjs

echo ""
echo "✅ Step 2 complete: Backtest finished"
echo ""

# Step 3: Display results summary
echo "═══════════════════════════════════════════════════════════════════════"
echo "STEP 3: Results Summary"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [ -f "data/nhl/backtest_results.json" ]; then
    MAE=$(cat data/nhl/backtest_results.json | grep -o '"meanAbsoluteError":[0-9.]*' | head -1 | cut -d: -f2)
    CORR=$(cat data/nhl/backtest_results.json | grep -o '"correlation":[0-9.]*' | head -1 | cut -d: -f2)
    BIAS=$(cat data/nhl/backtest_results.json | grep -o '"bias":[-0-9.]*' | head -1 | cut -d: -f2)
    SCORE=$(cat data/nhl/backtest_results.json | grep -o '"modelScore":[0-9.]*' | head -1 | cut -d: -f2)
    
    echo "📊 BACKTEST RESULTS:"
    echo "   Mean Absolute Error: ${MAE} shots"
    echo "   Correlation: ${CORR}"
    echo "   Bias: ${BIAS} shots"
    echo "   Model Quality Score: ${SCORE}/100"
    echo ""
    
    # Determine if model is ready
    MAE_OK=$(echo "$MAE < 1.0" | bc -l)
    CORR_OK=$(echo "$CORR > 0.55" | bc -l)
    BIAS_OK=$(echo "sqrt($BIAS * $BIAS) < 0.15" | bc -l)
    SCORE_OK=$(echo "$SCORE > 65" | bc -l)
    
    if [ "$MAE_OK" -eq 1 ] && [ "$CORR_OK" -eq 1 ] && [ "$BIAS_OK" -eq 1 ] && [ "$SCORE_OK" -eq 1 ]; then
        echo "✅ MODEL VALIDATED - Ready for deployment!"
        echo ""
        echo "💡 Next steps:"
        echo "   1. node scripts/nhl/update-projection-with-learned-params.mjs"
        echo "   2. Update projection engine with learned parameters"
        echo "   3. git add + commit + push"
        echo "   4. Deploy to Netlify"
        echo ""
    elif [ "$SCORE_OK" -eq 1 ]; then
        echo "⚠️ MODEL IS GOOD - Profitable but could improve"
        echo ""
        echo "💡 Consider:"
        echo "   - Add more features (score effects, rest days)"
        echo "   - Or deploy with conservative Kelly (0.1-0.25)"
        echo ""
    else
        echo "🚨 MODEL NEEDS WORK - Not ready for real money"
        echo ""
        echo "💡 Improvements needed:"
        [ "$MAE_OK" -eq 0 ] && echo "   - MAE too high (need < 1.0)"
        [ "$CORR_OK" -eq 0 ] && echo "   - Correlation too low (need > 0.55)"
        [ "$BIAS_OK" -eq 0 ] && echo "   - Significant bias (need < 0.15)"
        echo "   - Add more features or adjust methodology"
        echo ""
    fi
else
    echo "⚠️ No backtest results found"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════════"
echo "📁 Generated Files:"
echo "   - data/nhl/historical_game_data.json"
echo "   - data/nhl/learned_parameters.json"
echo "   - data/nhl/backtest_results.json"
echo ""
echo "✅ Training complete!"
echo "═══════════════════════════════════════════════════════════════════════"

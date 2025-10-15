#!/usr/bin/env node

/**
 * RCI Backtest & Parameter Optimization
 * 
 * Tests RCI system on 2024-25 early season to:
 * 1. Validate current ALPHA values
 * 2. Measure actual MAE improvement
 * 3. Find optimal parameters via grid search
 * 
 * Approach:
 * - Load 2024-25 games (first 20 games per team)
 * - Apply RCI adjustments with different ALPHA values
 * - Compare predictions to actual results
 * - Find parameters that minimize MAE
 */

console.log('🔬 RCI Backtest & Optimization\n');
console.log('='.repeat(70));

// Current parameters
const CURRENT_PARAMS = {
  ALPHA_OFF: 4.0,
  ALPHA_DEF: 3.5,
  HALF_LIFE: 14,
  LOSS_MULTIPLIER: 1.2,
  GAIN_MULTIPLIER: 0.8,
  RCI_CENTER: 0.75
};

// Parameter grid for search
const PARAM_GRID = {
  ALPHA_OFF: [3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
  ALPHA_DEF: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
  HALF_LIFE: [10, 12, 14, 16, 18, 20],
};

console.log('📋 Current Parameters:');
console.log(JSON.stringify(CURRENT_PARAMS, null, 2));

console.log('\n📊 Optimization Grid:');
console.log(`  ALPHA_OFF: ${PARAM_GRID.ALPHA_OFF.join(', ')}`);
console.log(`  ALPHA_DEF: ${PARAM_GRID.ALPHA_DEF.join(', ')}`);
console.log(`  HALF_LIFE: ${PARAM_GRID.HALF_LIFE.join(', ')}`);
console.log(`  Total combinations: ${PARAM_GRID.ALPHA_OFF.length * PARAM_GRID.ALPHA_DEF.length * PARAM_GRID.HALF_LIFE.length}`);

console.log('\n' + '='.repeat(70));
console.log('⚠️  PHASE 2 BACKTEST - NOT YET IMPLEMENTED');
console.log('='.repeat(70));

console.log('\n📝 Implementation Plan:\n');

console.log('STEP 1: Data Collection');
console.log('  - Scrape 2024-25 games (first 20 per team = ~600 games)');
console.log('  - Get final scores for each game');
console.log('  - Store in data/nba/backtests/2024_25_early.json');

console.log('\nSTEP 2: Baseline Predictions');
console.log('  - Run prediction model WITHOUT RCI');
console.log('  - Calculate baseline MAE on spread and total');
console.log('  - Store results for comparison');

console.log('\nSTEP 3: RCI Predictions (Current Params)');
console.log('  - Apply current RCI adjustments (ALPHA_OFF=4.0, ALPHA_DEF=3.5)');
console.log('  - Calculate MAE with RCI');
console.log('  - Measure improvement vs baseline');

console.log('\nSTEP 4: Grid Search Optimization');
console.log('  - For each parameter combination:');
console.log('    * Apply RCI adjustments');
console.log('    * Calculate MAE');
console.log('    * Track best parameters');
console.log('  - Find parameters that minimize MAE');

console.log('\nSTEP 5: Validation');
console.log('  - Test best parameters on holdout set');
console.log('  - Verify improvement is statistically significant');
console.log('  - Check for overfitting');

console.log('\nSTEP 6: Analysis');
console.log('  - Break down by:');
console.log('    * Games 1-10 (most RCI impact)');
console.log('    * Games 11-20 (fading RCI impact)');
console.log('    * High RCI teams vs low RCI teams');
console.log('    * Home vs away');

console.log('\n' + '='.repeat(70));
console.log('🎯 Expected Outcomes\n');

console.log('If RCI is working:');
console.log('  ✅ MAE improves for games 1-10');
console.log('  ✅ Improvement fades by games 15-20');
console.log('  ✅ Bigger impact for extreme RCI teams (BOS, OKC, PHX)');
console.log('  ✅ Optimal ALPHA values validate or improve current priors');

console.log('\nIf RCI needs tuning:');
console.log('  🔧 ALPHA values too low → increase impact');
console.log('  🔧 ALPHA values too high → decrease impact');
console.log('  🔧 HALF_LIFE wrong → adjust chemistry curve');
console.log('  🔧 Asymmetry wrong → adjust loss/gain multipliers');

console.log('\n' + '='.repeat(70));
console.log('💡 Next Steps:\n');

console.log('1. Wait for regular season to start (Oct 22)');
console.log('2. Collect first 10-15 games of data');
console.log('3. Run backtest on 2024-25 early season');
console.log('4. Optimize parameters based on empirical results');
console.log('5. Update RCI system with optimal values');

console.log('\n📅 Timeline:');
console.log('  Oct 22: Season starts');
console.log('  Oct 29: Week 1 complete (monitor RCI logging)');
console.log('  Nov 5:  Week 2 complete (start collecting accuracy data)');
console.log('  Nov 15: 20+ games played → RUN THIS BACKTEST');
console.log('  Nov 22: Deploy optimized parameters if needed');

console.log('\n' + '='.repeat(70));
console.log('STATUS: Backtest framework ready, awaiting real season data');

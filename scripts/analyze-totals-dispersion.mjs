#!/usr/bin/env node
/**
 * NBA Totals Dispersion Analysis
 * 
 * Quantifies whether "clustered" model predictions are actually a problem.
 * Compares model vs Vegas distributions and validates edge calibration.
 * 
 * Usage:
 *   node scripts/analyze-totals-dispersion.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

/**
 * Load backtest results from walk-forward
 */
function loadBacktestResults() {
  const paths = [
    'data/nba/backtests/nba_totals_walkforward_elastic_net_production_results.csv',
    'data/nba/backtests/nba_totals_production_70_30_blend_results.csv',
    'data/nba/backtests/nba_totals_walkforward_lgbm_v2_top15_results.csv',
    'data/nba/backtests/nba_totals_walkforward_v1_results.csv'
  ];
  
  for (const path of paths) {
    try {
      const fullPath = join(REPO_ROOT, path);
      const csv = readFileSync(fullPath, 'utf-8');
      const lines = csv.trim().split('\n');
      const headers = lines[0].split(',');
      
      const games = lines.slice(1).map(line => {
        const values = line.split(',');
        const game = {};
        headers.forEach((h, i) => {
          game[h] = values[i];
        });
        return game;
      });
      
      log(`✓ Loaded ${games.length} games from ${path}`, 'green');
      return { games, path };
    } catch (err) {
      // Try next path
      continue;
    }
  }
  
  throw new Error('No backtest results found. Run walk-forward backtest first.');
}

/**
 * Calculate basic statistics
 */
function calcStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  return {
    n,
    min: sorted[0],
    q25: sorted[Math.floor(n * 0.25)],
    median: sorted[Math.floor(n * 0.5)],
    q75: sorted[Math.floor(n * 0.75)],
    max: sorted[n - 1],
    mean,
    std,
    range: sorted[n - 1] - sorted[0]
  };
}

/**
 * Analyze dispersion
 */
function analyzeDispersion(games) {
  log('\n' + '═'.repeat(80), 'cyan');
  log('📊 DISPERSION ANALYSIS: Model vs Vegas', 'bright');
  log('═'.repeat(80) + '\n', 'cyan');
  
  // Extract totals
  const modelTotals = [];
  const vegasTotals = [];
  const edges = [];
  const residuals = [];
  
  for (const g of games) {
    const modelTotal = parseFloat(g.pred_total || g.model_total || g.predicted_total);
    const vegasTotal = parseFloat(g.market_line || g.vegas_total);
    
    if (isNaN(modelTotal) || isNaN(vegasTotal)) continue;
    
    modelTotals.push(modelTotal);
    vegasTotals.push(vegasTotal);
    edges.push(Math.abs(modelTotal - vegasTotal));
    residuals.push(modelTotal - vegasTotal);
  }
  
  log(`Sample size: ${modelTotals.length} games\n`, 'cyan');
  
  // Model totals
  const modelStats = calcStats(modelTotals);
  log('MODEL TOTALS:', 'bright');
  log(`  Range:      ${modelStats.min.toFixed(1)} → ${modelStats.max.toFixed(1)} (${modelStats.range.toFixed(1)} points)`);
  log(`  Mean:       ${modelStats.mean.toFixed(1)}`);
  log(`  Std Dev:    ${modelStats.std.toFixed(1)}`);
  log(`  Quartiles:  ${modelStats.q25.toFixed(1)} | ${modelStats.median.toFixed(1)} | ${modelStats.q75.toFixed(1)}\n`);
  
  // Vegas totals
  const vegasStats = calcStats(vegasTotals);
  log('VEGAS TOTALS:', 'bright');
  log(`  Range:      ${vegasStats.min.toFixed(1)} → ${vegasStats.max.toFixed(1)} (${vegasStats.range.toFixed(1)} points)`);
  log(`  Mean:       ${vegasStats.mean.toFixed(1)}`);
  log(`  Std Dev:    ${vegasStats.std.toFixed(1)}`);
  log(`  Quartiles:  ${vegasStats.q25.toFixed(1)} | ${vegasStats.median.toFixed(1)} | ${vegasStats.q75.toFixed(1)}\n`);
  
  // Edge distribution
  const edgeStats = calcStats(edges);
  log('EDGE MAGNITUDE (|Model - Vegas|):', 'bright');
  log(`  Range:      ${edgeStats.min.toFixed(1)} → ${edgeStats.max.toFixed(1)}`);
  log(`  Mean:       ${edgeStats.mean.toFixed(1)}`);
  log(`  Std Dev:    ${edgeStats.std.toFixed(1)}`);
  log(`  Quartiles:  ${edgeStats.q25.toFixed(1)} | ${edgeStats.median.toFixed(1)} | ${edgeStats.q75.toFixed(1)}\n`);
  
  // Residual distribution
  const residualStats = calcStats(residuals.map(Math.abs));
  log('RESIDUAL DISTRIBUTION (Model - Vegas):', 'bright');
  log(`  Std Dev:    ${residualStats.std.toFixed(1)} points`, 'cyan');
  
  // Interpretation
  log('\n' + '─'.repeat(80), 'cyan');
  log('INTERPRETATION:', 'bright');
  
  if (modelStats.std < 3) {
    log(`  ⚠️  Model std dev is VERY LOW (${modelStats.std.toFixed(1)} pts)`, 'yellow');
    log('     → Model predictions are tightly clustered', 'yellow');
  } else if (modelStats.std < 5) {
    log(`  ⚠️  Model std dev is LOW (${modelStats.std.toFixed(1)} pts)`, 'yellow');
    log('     → Model is conservative but may still find edges', 'yellow');
  } else {
    log(`  ✓ Model std dev is reasonable (${modelStats.std.toFixed(1)} pts)`, 'green');
  }
  
  if (residualStats.std >= 4 && residualStats.std <= 8) {
    log(`  ✓ Residual std dev is HEALTHY (${residualStats.std.toFixed(1)} pts)`, 'green');
    log('     → Model is finding meaningful disagreements with Vegas', 'green');
  } else if (residualStats.std < 4) {
    log(`  ⚠️  Residual std dev is LOW (${residualStats.std.toFixed(1)} pts)`, 'yellow');
    log('     → Model is too similar to Vegas', 'yellow');
  } else {
    log(`  ⚠️  Residual std dev is HIGH (${residualStats.std.toFixed(1)} pts)`, 'yellow');
    log('     → Model may be overconfident', 'yellow');
  }
  
  return { modelStats, vegasStats, edgeStats, residualStats };
}

/**
 * Analyze edge buckets by outcome
 */
function analyzeEdgeBuckets(games) {
  log('\n' + '═'.repeat(80), 'cyan');
  log('🎯 EDGE CALIBRATION: Performance by Edge Bucket', 'bright');
  log('═'.repeat(80) + '\n', 'cyan');
  
  const buckets = {
    '4.0-5.0': [],
    '5.0-6.0': [],
    '6.0-7.0': [],
    '7.0-8.0': [],
    '8.0+': []
  };
  
  for (const g of games) {
    const edge = Math.abs(parseFloat(g.edge || g.total_edge || 0));
    const won = (g.result === 'WIN' || g.won === 'true' || g.won === '1');
    
    if (isNaN(edge) || edge === 0) continue;
    
    if (edge >= 4 && edge < 5) buckets['4.0-5.0'].push(won);
    else if (edge >= 5 && edge < 6) buckets['5.0-6.0'].push(won);
    else if (edge >= 6 && edge < 7) buckets['6.0-7.0'].push(won);
    else if (edge >= 7 && edge < 8) buckets['7.0-8.0'].push(won);
    else if (edge >= 8) buckets['8.0+'].push(won);
  }
  
  log('Edge Range | Bets | Win Rate | Expected @ -110', 'bright');
  log('─'.repeat(50));
  
  for (const [range, results] of Object.entries(buckets)) {
    if (results.length === 0) continue;
    
    const wins = results.filter(x => x).length;
    const winRate = (wins / results.length) * 100;
    const expected = 52.38; // Breakeven at -110
    const delta = winRate - expected;
    
    const color = winRate >= 55 ? 'green' : winRate >= 52.38 ? 'yellow' : 'red';
    const arrow = delta > 0 ? '↑' : '↓';
    
    log(`${range.padEnd(10)} | ${String(results.length).padStart(4)} | ${winRate.toFixed(1)}%    | ${arrow} ${Math.abs(delta).toFixed(1)}pp`, color);
  }
  
  log('\n');
}

/**
 * Analyze OVER vs UNDER performance
 */
function analyzeOverUnder(games) {
  log('═'.repeat(80), 'cyan');
  log('📈 OVER vs UNDER PERFORMANCE', 'bright');
  log('═'.repeat(80) + '\n', 'cyan');
  
  const overs = [];
  const unders = [];
  const highEdgeUnders = [];
  
  for (const g of games) {
    const edge = Math.abs(parseFloat(g.edge || g.total_edge || 0));
    const pick = g.bet_direction || g.pick || g.total_pick;
    const won = (g.result === 'WIN' || g.won === 'true' || g.won === '1');
    
    if (!pick || isNaN(edge) || edge === 0) continue;
    
    if (pick.includes('OVER')) {
      overs.push(won);
    } else if (pick.includes('UNDER')) {
      unders.push(won);
      if (edge >= 6.5) {
        highEdgeUnders.push(won);
      }
    }
  }
  
  // Calculate stats
  const calcWinRate = (results) => {
    if (results.length === 0) return { bets: 0, wins: 0, winRate: 0, roi: 0 };
    const wins = results.filter(x => x).length;
    const winRate = (wins / results.length) * 100;
    const roi = ((wins * 1.909 - results.length) / results.length) * 100; // -110 odds
    return { bets: results.length, wins, winRate, roi };
  };
  
  const overStats = calcWinRate(overs);
  const underStats = calcWinRate(unders);
  const highEdgeStats = calcWinRate(highEdgeUnders);
  
  log('Strategy          | Bets | Win Rate | ROI     | Status', 'bright');
  log('─'.repeat(60));
  
  const printRow = (label, stats) => {
    if (stats.bets === 0) return;
    const color = stats.roi >= 5 ? 'green' : stats.roi >= 0 ? 'yellow' : 'red';
    const status = stats.roi >= 5 ? '✓ STRONG' : stats.roi >= 0 ? '~ Marginal' : '✗ LOSING';
    log(`${label.padEnd(17)} | ${String(stats.bets).padStart(4)} | ${stats.winRate.toFixed(1)}%    | ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(2)}% | ${status}`, color);
  };
  
  printRow('All OVERS', overStats);
  printRow('All UNDERS', underStats);
  printRow('UNDERS (6.5+ edge)', highEdgeStats);
  
  // Combined strategy
  const combinedWins = overStats.wins + highEdgeStats.wins;
  const combinedBets = overStats.bets + highEdgeStats.bets;
  const combinedWinRate = (combinedWins / combinedBets) * 100;
  const combinedROI = ((combinedWins * 1.909 - combinedBets) / combinedBets) * 100;
  
  log('─'.repeat(60));
  const combinedColor = combinedROI >= 7 ? 'green' : combinedROI >= 5 ? 'yellow' : 'red';
  const combinedStatus = combinedROI >= 7 ? '★ OPTIMAL' : combinedROI >= 5 ? '✓ STRONG' : '~ Marginal';
  log(`${'OPTIMAL STRATEGY'.padEnd(17)} | ${String(combinedBets).padStart(4)} | ${combinedWinRate.toFixed(1)}%    | ${combinedROI >= 0 ? '+' : ''}${combinedROI.toFixed(2)}% | ${combinedStatus}`, combinedColor);
  
  log('\n');
  
  return { overStats, underStats, highEdgeStats, combinedROI };
}

/**
 * Main analysis
 */
function main() {
  try {
    log('\n🏀 NBA TOTALS DISPERSION & CALIBRATION ANALYSIS', 'bright');
    log('═'.repeat(80) + '\n', 'cyan');
    
    // Load data
    const { games, path } = loadBacktestResults();
    log(`Data source: ${path}\n`, 'cyan');
    
    // Run analyses
    const dispersion = analyzeDispersion(games);
    analyzeEdgeBuckets(games);
    const performance = analyzeOverUnder(games);
    
    // Final summary
    log('═'.repeat(80), 'cyan');
    log('📋 SUMMARY & RECOMMENDATIONS', 'bright');
    log('═'.repeat(80) + '\n', 'cyan');
    
    if (dispersion.modelStats.std < 3) {
      log('⚠️  CONCERN: Model predictions are tightly clustered', 'yellow');
      log(`   Model std dev: ${dispersion.modelStats.std.toFixed(1)} pts (Vegas: ${dispersion.vegasStats.std.toFixed(1)} pts)\n`, 'yellow');
      
      if (dispersion.residualStats.std >= 5) {
        log('✓ BUT: Residuals show model IS finding edges vs Vegas', 'green');
        log(`   Residual std dev: ${dispersion.residualStats.std.toFixed(1)} pts (healthy)\n`, 'green');
      } else {
        log('⚠️  AND: Residuals are small - model too similar to Vegas', 'red');
        log(`   Residual std dev: ${dispersion.residualStats.std.toFixed(1)} pts (too low)\n`, 'red');
      }
    } else {
      log('✓ Model dispersion is adequate', 'green');
      log(`   Model std dev: ${dispersion.modelStats.std.toFixed(1)} pts\n`, 'green');
    }
    
    if (performance.combinedROI >= 7) {
      log('✓ OPTIMAL STRATEGY IS PROFITABLE', 'green');
      log(`   OVERS + 6.5+ UNDERS: +${performance.combinedROI.toFixed(2)}% ROI\n`, 'green');
      log('📝 RECOMMENDATION: Keep current model & strategy', 'green');
      log('   Clustering is cosmetic - edges are real and profitable', 'green');
    } else if (performance.combinedROI >= 3) {
      log('~ Strategy is marginally profitable', 'yellow');
      log(`   ROI: +${performance.combinedROI.toFixed(2)}%\n`, 'yellow');
      log('📝 RECOMMENDATION: Monitor performance, consider improvements', 'yellow');
    } else {
      log('✗ Strategy is NOT profitable in backtest', 'red');
      log(`   ROI: ${performance.combinedROI.toFixed(2)}%\n`, 'red');
      log('📝 RECOMMENDATION: Do NOT deploy - investigate model issues', 'red');
    }
    
    log('\n' + '═'.repeat(80) + '\n', 'cyan');
    
  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();

/**
 * NBA RCI Monitoring Dashboard
 * 
 * Real-time performance monitoring for the NBA RCI prediction system.
 * Shows rolling metrics, alerts, and performance breakdowns.
 * 
 * Usage:
 *   node scripts/nba/monitor-dashboard.mjs [window]
 * 
 * Examples:
 *   node scripts/nba/monitor-dashboard.mjs       # 10-game rolling window
 *   node scripts/nba/monitor-dashboard.mjs 20    # 20-game rolling window
 */

import PredictionLogger from './log-prediction.mjs';

const logger = new PredictionLogger();

// ============================================================================
// Enhanced Dashboard with Breakdowns
// ============================================================================

function printEnhancedDashboard(window = 10) {
  const predictions = logger.getAllPredictions()
    .filter(p => p.actual_spread !== undefined && p.actual_spread !== '');

  console.log('\n' + '='.repeat(80));
  console.log('📊 NBA RCI LIVE MONITORING DASHBOARD');
  console.log('='.repeat(80));

  if (predictions.length === 0) {
    console.log('\n⏳ No completed games logged yet. Waiting for results...\n');
    return;
  }

  console.log(`\nTotal Games Logged: ${predictions.length}`);
  console.log(`Analysis Window: Last ${Math.min(window, predictions.length)} games`);

  // Overall metrics
  const metrics10 = logger.calculateRollingMetrics(10);
  const metrics20 = logger.calculateRollingMetrics(20);
  const alerts = logger.checkAlerts(metrics10);

  if (metrics10) {
    console.log('\n' + '─'.repeat(80));
    console.log('🎯 ROLLING 10-GAME METRICS');
    console.log('─'.repeat(80));
    console.log(`Win Rate (RCI):       ${metrics10.rciWinRate}% │ Target: ≥60%`);
    console.log(`Win Rate (Baseline):  ${metrics10.baselineWinRate}%`);
    console.log(`MAE (RCI):            ${metrics10.rciMAE} │ Target: ≤11.5`);
    console.log(`MAE (Baseline):       ${metrics10.baselineMAE}`);
    console.log(`MAE Improvement:      ${metrics10.maeImprovement}%`);
    console.log(`Cap Hit Rate:         ${metrics10.capHitRate}% │ Target: <10%`);
    console.log(`ROI (RCI):            ${metrics10.roiRci} units`);
    console.log(`ROI (Baseline):       ${metrics10.roiBaseline} units`);
    console.log(`ROI Advantage:        ${metrics10.roiDiff} units`);
  }

  if (metrics20) {
    console.log('\n' + '─'.repeat(80));
    console.log('📈 ROLLING 20-GAME METRICS (Smoothed)');
    console.log('─'.repeat(80));
    console.log(`Win Rate (RCI):       ${metrics20.rciWinRate}%`);
    console.log(`MAE (RCI):            ${metrics20.rciMAE}`);
    console.log(`ROI (RCI):            ${metrics20.roiRci} units`);
  }

  // Performance by RCI quartile
  console.log('\n' + '─'.repeat(80));
  console.log('📊 PERFORMANCE BY RCI QUARTILE');
  console.log('─'.repeat(80));
  
  const byRCI = analyzeByRCIQuartile(predictions);
  console.log('Quartile │  RCI Range  │ Games │ Win%  │  MAE  │  ROI  │ Notes');
  console.log('─'.repeat(80));
  byRCI.forEach(q => {
    const quartile = q.quartile.padEnd(8);
    const range = q.range.padEnd(12);
    const games = String(q.games).padStart(5);
    const winRate = String(q.winRate).padStart(5);
    const mae = String(q.mae).padStart(6);
    const roi = String(q.roi).padStart(6);
    console.log(`${quartile} │ ${range} │ ${games} │ ${winRate} │ ${mae} │ ${roi} │ ${q.notes}`);
  });

  // Performance by spread size
  console.log('\n' + '─'.repeat(80));
  console.log('📊 PERFORMANCE BY SPREAD SIZE');
  console.log('─'.repeat(80));
  
  const bySpread = analyzeBySpreadSize(predictions);
  console.log('Spread Range │ Games │ RCI Win% │ RCI MAE │ Baseline MAE │ Improvement');
  console.log('─'.repeat(80));
  bySpread.forEach(s => {
    const range = s.range.padEnd(12);
    const games = String(s.games).padStart(5);
    const winRate = String(s.rciWinRate).padStart(8);
    const rciMae = String(s.rciMae).padStart(7);
    const baseMae = String(s.baseMae).padStart(12);
    const improvement = String(s.improvement).padStart(11);
    console.log(`${range} │ ${games} │ ${winRate} │ ${rciMae} │ ${baseMae} │ ${improvement}`);
  });

  // Alerts
  console.log('\n' + '─'.repeat(80));
  if (alerts && alerts.length > 0) {
    console.log(`🚨 ACTIVE ALERTS (${alerts.length})`);
    console.log('─'.repeat(80));
    alerts.forEach(alert => {
      console.log(`${alert.level.padEnd(10)} │ ${alert.message}`);
    });
  } else {
    console.log('✅ NO ALERTS - System Performing Within Expected Range');
  }

  // Recent games
  console.log('\n' + '─'.repeat(80));
  console.log('📋 LAST 5 GAMES');
  console.log('─'.repeat(80));
  const recent = predictions.slice(-5);
  console.log('Date       │ Game        │ RCI   │ dNet  │ Pred  │ Actual │ Error │ Result');
  console.log('─'.repeat(80));
  recent.forEach(p => {
    const date = p.date.substring(5);  // MM-DD
    const game = `${p.team} vs ${p.opponent}`.padEnd(11);
    const rci = p.rci.toFixed(2).padStart(5);
    const dNet = p.delta_net.toFixed(1).padStart(5);
    const pred = p.rci_spread.toFixed(1).padStart(5);
    const actual = p.actual_spread.toFixed(1).padStart(6);
    const error = p.rci_error.toFixed(1).padStart(5);
    const result = p.rci_correct ? '✅ WIN' : '❌ LOSS';
    console.log(`${date} │ ${game} │ ${rci} │ ${dNet} │ ${pred} │ ${actual} │ ${error} │ ${result}`);
  });

  console.log('\n' + '='.repeat(80) + '\n');
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeByRCIQuartile(predictions) {
  const sorted = [...predictions].sort((a, b) => a.rci - b.rci);
  const quartileSize = Math.floor(sorted.length / 4);

  const quartiles = [
    { name: 'Q1 (Low)', data: sorted.slice(0, quartileSize), range: '0.30-0.68' },
    { name: 'Q2', data: sorted.slice(quartileSize, quartileSize * 2), range: '0.68-0.75' },
    { name: 'Q3', data: sorted.slice(quartileSize * 2, quartileSize * 3), range: '0.75-0.84' },
    { name: 'Q4 (High)', data: sorted.slice(quartileSize * 3), range: '0.84-0.95' }
  ];

  return quartiles.map(q => {
    const games = q.data.length;
    if (games === 0) return { quartile: q.name, range: q.range, games: 0, winRate: 'N/A', mae: 'N/A', roi: 'N/A', notes: '' };

    const wins = q.data.filter(p => p.rci_correct === 1).length;
    const winRate = (wins / games * 100).toFixed(1) + '%';
    const mae = (q.data.reduce((sum, p) => sum + p.rci_error, 0) / games).toFixed(2);
    const roi = q.data.reduce((sum, p) => sum + (p.roi_rci || 0), 0).toFixed(1);
    
    let notes = '';
    if (q.name === 'Q1 (Low)') notes = 'Low continuity → harder to predict';
    if (q.name === 'Q4 (High)') notes = 'High continuity → should outperform';

    return {
      quartile: q.name,
      range: q.range,
      games,
      winRate,
      mae,
      roi,
      notes
    };
  });
}

function analyzeBySpreadSize(predictions) {
  const buckets = [
    { name: 'Toss-up', min: 0, max: 3, data: [] },
    { name: 'Small', min: 3, max: 7, data: [] },
    { name: 'Medium', min: 7, max: 10, data: [] },
    { name: 'Large', min: 10, max: 100, data: [] }
  ];

  predictions.forEach(p => {
    const absSpread = Math.abs(p.rci_spread);
    const bucket = buckets.find(b => absSpread >= b.min && absSpread < b.max);
    if (bucket) bucket.data.push(p);
  });

  return buckets
    .filter(b => b.data.length > 0)
    .map(b => {
      const games = b.data.length;
      const rciWins = b.data.filter(p => p.rci_correct === 1).length;
      const rciWinRate = (rciWins / games * 100).toFixed(1) + '%';
      const rciMae = (b.data.reduce((sum, p) => sum + p.rci_error, 0) / games).toFixed(2);
      const baseMae = (b.data.reduce((sum, p) => sum + p.baseline_error, 0) / games).toFixed(2);
      const improvement = (((parseFloat(baseMae) - parseFloat(rciMae)) / parseFloat(baseMae)) * 100).toFixed(1) + '%';

      return {
        range: `${b.min}-${b.max < 100 ? b.max : '+'}`,
        games,
        rciWinRate,
        rciMae,
        baseMae,
        improvement
      };
    });
}

// ============================================================================
// Main
// ============================================================================

const window = parseInt(process.argv[2]) || 10;
printEnhancedDashboard(window);

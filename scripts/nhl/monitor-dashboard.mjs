/**
 * NHL Performance Dashboard
 * 
 * Displays real-time performance metrics, alerts, and analysis.
 * Shows performance by direction (over/under), position, team, etc.
 */

import NHLPredictionLogger from './log-prediction.mjs';

function generateDashboard(window = 10) {
  console.log('\n🏒 NHL SOG PROPS - PERFORMANCE DASHBOARD');
  console.log('=' .repeat(70));
  
  const logger = new NHLPredictionLogger();
  const all = logger.getAllPredictions().filter(p => p.actual_sog && p.actual_sog !== '');
  
  if (all.length === 0) {
    console.log('\n⚠️  No completed predictions yet');
    console.log('   Run predictions first, then update results with:');
    console.log('   node scripts/nhl/update-results.mjs\n');
    return;
  }
  
  console.log(`\n📊 SEASON SUMMARY (${all.length} completed picks)`);
  console.log('-'.repeat(70));
  
  // Overall metrics
  const seasonMetrics = logger.calculateRollingMetrics(all.length);
  console.log(`   Win Rate: ${seasonMetrics.winRate}%`);
  console.log(`   MAE: ${seasonMetrics.mae} SOG`);
  console.log(`   ROI: ${seasonMetrics.roi} units/pick`);
  console.log(`   Total ROI: ${seasonMetrics.totalROI} units`);
  console.log(`   Profit: $${(parseFloat(seasonMetrics.totalROI) * 10).toFixed(2)} (at $10/unit)`);
  
  // Rolling window
  const rolling = logger.calculateRollingMetrics(window);
  if (rolling) {
    console.log(`\n📈 LAST ${window} GAMES`);
    console.log('-'.repeat(70));
    console.log(`   Win Rate: ${rolling.winRate}% (${rolling.hits}/${rolling.totalPicks})`);
    console.log(`   MAE: ${rolling.mae} SOG`);
    console.log(`   ROI: ${rolling.roi} units/pick`);
    console.log(`   Total ROI: ${rolling.totalROI} units`);
  }
  
  // By direction
  console.log(`\n🎯 PERFORMANCE BY DIRECTION`);
  console.log('-'.repeat(70));
  console.log(`   Overs:   ${seasonMetrics.overs.winRate}% (${seasonMetrics.overs.count} picks)`);
  console.log(`   Unders:  ${seasonMetrics.unders.winRate}% (${seasonMetrics.unders.count} picks)`);
  
  // By position
  const positions = {};
  for (const pred of all) {
    const pos = pred.position || 'Unknown';
    if (!positions[pos]) {
      positions[pos] = { total: 0, hits: 0 };
    }
    positions[pos].total++;
    if (pred.hit === '1') positions[pos].hits++;
  }
  
  console.log(`\n🏒 PERFORMANCE BY POSITION`);
  console.log('-'.repeat(70));
  for (const [pos, stats] of Object.entries(positions).sort((a, b) => b[1].total - a[1].total)) {
    const winRate = ((stats.hits / stats.total) * 100).toFixed(1);
    console.log(`   ${pos.padEnd(10)} ${winRate}% (${stats.hits}/${stats.total})`);
  }
  
  // Recent picks
  console.log(`\n📋 LAST 5 PICKS`);
  console.log('-'.repeat(70));
  const recent = all.slice(-5).reverse();
  for (const pred of recent) {
    const result = pred.hit === '1' ? '✅ HIT' : '❌ MISS';
    const roi = pred.roi ? `${parseFloat(pred.roi) > 0 ? '+' : ''}${pred.roi}U` : '';
    console.log(`   ${result} ${pred.player.padEnd(20)} ${pred.direction.padEnd(6)} ${pred.line} (${pred.actual_sog} SOG) ${roi}`);
  }
  
  // Alerts
  console.log(`\n🚨 ALERTS`);
  console.log('-'.repeat(70));
  
  const alerts = [];
  
  if (rolling && parseFloat(rolling.winRate) < 53) {
    alerts.push(`⚠️  WARNING: ${window}-game win rate below 53% (${rolling.winRate}%)`);
  }
  
  if (rolling && parseFloat(rolling.roi) < -1) {
    alerts.push(`🚨 CRITICAL: ${window}-game ROI negative (${rolling.roi} units)`);
  }
  
  if (seasonMetrics.overs.count > 10 && parseFloat(seasonMetrics.overs.winRate) < 50) {
    alerts.push(`⚠️  CAUTION: Overs performing below 50% (${seasonMetrics.overs.winRate}%)`);
  }
  
  if (seasonMetrics.unders.count > 10 && parseFloat(seasonMetrics.unders.winRate) < 50) {
    alerts.push(`⚠️  CAUTION: Unders performing below 50% (${seasonMetrics.unders.winRate}%)`);
  }
  
  if (alerts.length === 0) {
    console.log(`   ✅ All systems nominal`);
  } else {
    for (const alert of alerts) {
      console.log(`   ${alert}`);
    }
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const window = parseInt(process.argv[2]) || 10;
  generateDashboard(window);
}

export default generateDashboard;

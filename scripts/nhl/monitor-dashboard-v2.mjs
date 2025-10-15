#!/usr/bin/env node

/**
 * NHL Performance Dashboard V2 - ENHANCED
 * 
 * NEW FEATURES:
 * - Per-player performance tracking (form, streaks)
 * - Player vs team matchup analysis  
 * - Direction calibration buckets
 * - 50-game EMA for stability
 * - CLV tracking
 * - Void/push handling
 * - Patrick Kane anomaly detection
 */

import NHLPredictionLoggerV2 from './log-prediction-v2.mjs';

function displayDashboard(season = '2024-25', window = 20) {
  const logger = new NHLPredictionLoggerV2(season);
  const predictions = logger.getAllPredictions();
  
  // Filter to completed (exclude void/push for win% but show separately)
  const completed = predictions.filter(p => p.status === 'hit' || p.status === 'miss');
  const voids = predictions.filter(p => p.status === 'void');
  const pushes = predictions.filter(p => p.status === 'push');
  
  console.log('\n' + '='.repeat(70));
  console.log('🏒 NHL SOG PROPS - PERFORMANCE DASHBOARD V2');
  console.log('='.repeat(70));

  if (completed.length === 0) {
    console.log('\n⚠️  No completed predictions yet');
    console.log('   Run predictions first, then update results with:');
    console.log('   node scripts/nhl/update-results-v2.mjs\n');
    return;
  }

  // SEASON SUMMARY
  console.log('\n📊 SEASON SUMMARY (2024-25)');
  console.log('-'.repeat(70));
  
  const totalPicks = completed.length;
  const hits = completed.filter(p => p.status === 'hit').length;
  const winRate = (hits / totalPicks * 100).toFixed(1);
  
  const errors = completed
    .filter(p => p.actual_sog !== null && p.actual_sog !== 'null')
    .map(p => Math.abs(parseFloat(p.predicted_sog) - parseFloat(p.actual_sog)));
  const mae = (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2);
  
  const rois = completed
    .filter(p => p.roi !== null && p.roi !== 'null')
    .map(p => parseFloat(p.roi));
  const avgROI = (rois.reduce((a, b) => a + b, 0) / rois.length).toFixed(2);
  const totalROI = rois.reduce((a, b) => a + b, 0).toFixed(2);
  const totalProfit = (totalROI * 100).toFixed(0); // Assuming $100 per bet
  
  console.log(`Total Predictions: ${totalPicks} (${voids.length} void, ${pushes.length} push)`);
  console.log(`Win Rate: ${winRate}% ${winRate >= 54 ? '✅' : '⚠️'}`);
  console.log(`Mean Absolute Error: ${mae} SOG`);
  console.log(`Total ROI: ${(avgROI * 100).toFixed(1)}% ($${totalProfit} profit on $${totalPicks * 100} wagered)`);

  // CLV Summary (if available)
  const withCLV = completed.filter(p => p.clv !== null && p.clv !== 'null');
  if (withCLV.length > 0) {
    const avgCLV = (withCLV.reduce((sum, p) => sum + parseFloat(p.clv), 0) / withCLV.length).toFixed(2);
    console.log(`Average CLV: ${avgCLV > 0 ? '+' : ''}${avgCLV}% ${avgCLV > 0 ? '✅ (beating closing)' : '⚠️ (losing to closing)'}`);
  }

  // ROLLING WINDOW
  console.log(`\n📈 LAST ${window} GAMES`);
  console.log('-'.repeat(70));
  
  const metrics = logger.calculateRollingMetrics(window);
  console.log(`Win Rate: ${metrics.winRate}% ${parseFloat(metrics.winRate) >= 53 ? '✅' : '⚠️'}`);
  console.log(`ROI: ${metrics.roi}`);
  console.log(`MAE: ${metrics.mae} SOG`);

  // 50-GAME EMA (STABILITY)
  if (completed.length >= 50) {
    console.log(`\n📉 50-GAME EMA (STABILITY)`);
    console.log('-'.repeat(70));
    
    const ema50 = logger.calculateRollingMetrics(50);
    console.log(`EMA Win Rate: ${ema50.winRate}%`);
    console.log(`EMA MAE: ${ema50.mae} SOG`);
    console.log(`EMA ROI: ${ema50.roi}`);
  }

  // PERFORMANCE BY DIRECTION
  console.log('\n🎯 PERFORMANCE BY DIRECTION');
  console.log('-'.repeat(70));
  console.log(`Overs: ${metrics.overs.winRate}% (${metrics.overs.count} of ${window} picks) ${parseFloat(metrics.overs.winRate) >= 50 ? '✅' : '⚠️'}`);
  console.log(`Unders: ${metrics.unders.winRate}% (${metrics.unders.count} of ${window} picks) ${parseFloat(metrics.unders.winRate) >= 50 ? '✅' : '⚠️'}`);

  // DIRECTION CALIBRATION BUCKETS
  console.log('\n📊 CALIBRATION BY EDGE (MONOTONICITY CHECK)');
  console.log('-'.repeat(70));
  
  const calibration = logger.getCalibrationBuckets();
  
  console.log('\nOVERS (higher edge should = higher hit%):');
  for (const [bucket, stats] of Object.entries(calibration.overs)) {
    const icon = stats.count >= 5 && parseFloat(stats.hitRate) >= 50 ? '✅' : (stats.count < 5 ? 'ℹ️' : '⚠️');
    console.log(`  ${bucket.padEnd(8)} - ${stats.hitRate.padStart(6)} (${String(stats.count).padStart(3)} picks) ${icon}`);
  }
  
  console.log('\nUNDERS (higher edge should = higher hit%):');
  for (const [bucket, stats] of Object.entries(calibration.unders)) {
    const icon = stats.count >= 5 && parseFloat(stats.hitRate) >= 50 ? '✅' : (stats.count < 5 ? 'ℹ️' : '⚠️');
    console.log(`  ${bucket.padEnd(8)} - ${stats.hitRate.padStart(6)} (${String(stats.count).padStart(3)} picks) ${icon}`);
  }

  // PERFORMANCE BY POSITION
  console.log('\n🏒 PERFORMANCE BY POSITION');
  console.log('-'.repeat(70));
  
  const positions = ['C', 'W', 'D'];
  for (const pos of positions) {
    const posPreds = completed.filter(p => p.position === pos);
    if (posPreds.length > 0) {
      const posHits = posPreds.filter(p => p.status === 'hit').length;
      const posWinRate = (posHits / posPreds.length * 100).toFixed(1);
      console.log(`${pos.padEnd(10)}: ${posWinRate}% (${posHits} of ${posPreds.length}) ${posWinRate >= 50 ? '✅' : '⚠️'}`);
    }
  }

  // PER-PLAYER INSIGHTS (FORM TRACKING)
  console.log('\n👤 PER-PLAYER INSIGHTS (TOP 10 BY PICKS)');
  console.log('-'.repeat(70));
  
  const playerStats = logger.getAllPlayerStats()
    .sort((a, b) => parseInt(b.total_picks) - parseInt(a.total_picks))
    .slice(0, 10);

  if (playerStats.length > 0) {
    console.log('');
    console.log('Player'.padEnd(25) + 'Picks'.padStart(6) + 'Win%'.padStart(8) + 'Streak'.padStart(10) + 'Last 5'.padStart(12));
    console.log('-'.repeat(70));
    
    for (const stat of playerStats) {
      const winRate = parseFloat(stat.win_rate);
      const icon = winRate >= 55 ? '🔥' : (winRate <= 40 ? '❄️' : '  ');
      const streakIcon = stat.streak[0] === 'W' ? '📈' : '📉';
      
      console.log(
        `${icon} ${stat.player.padEnd(20)}`.substring(0, 25) +
        String(stat.total_picks).padStart(6) +
        `${stat.win_rate}%`.padStart(8) +
        `${streakIcon} ${stat.streak}`.padStart(10) +
        stat.last_5_results.padStart(12)
      );
    }

    // ANOMALY DETECTION (e.g., Patrick Kane)
    console.log('\n🔍 ANOMALY DETECTION');
    console.log('-'.repeat(70));
    
    const anomalies = playerStats.filter(s => {
      const picks = parseInt(s.total_picks);
      const winRate = parseFloat(s.win_rate);
      return picks >= 3 && winRate <= 35; // 3+ picks with ≤35% win rate
    });

    if (anomalies.length > 0) {
      console.log('\n⚠️ Players consistently UNDERPERFORMING model:');
      for (const anomaly of anomalies) {
        console.log(`   🚨 ${anomaly.player}: ${anomaly.win_rate}% (${anomaly.total_picks} picks) - Streak: ${anomaly.streak}`);
        console.log(`      Consider: Reduce exposure or investigate why model overestimates`);
      }
    } else {
      console.log('✅ No systematic underperformers detected');
    }

    // Hot streaks
    const hotStreaks = playerStats.filter(s => s.streak.startsWith('W') && parseInt(s.streak.slice(1)) >= 3);
    if (hotStreaks.length > 0) {
      console.log('\n🔥 Players on HOT STREAKS (3+ wins):');
      for (const hot of hotStreaks) {
        console.log(`   ✅ ${hot.player}: ${hot.streak} (${hot.win_rate}% overall)`);
      }
    }

  } else {
    console.log('ℹ️ No player stats available yet (need completed predictions)');
  }

  // LAST 5 PICKS
  console.log('\n📋 LAST 5 PICKS');
  console.log('-'.repeat(70));
  
  const last5 = completed.slice(-5).reverse();
  for (const pred of last5) {
    const icon = pred.status === 'hit' ? '✅' : '❌';
    const roi = pred.roi !== null && pred.roi !== 'null' ? ` (${(parseFloat(pred.roi) * 100).toFixed(0)}% ROI)` : '';
    const ot = pred.went_ot === '1' ? ' [OT]' : '';
    console.log(`${icon} ${pred.player} ${pred.direction} ${pred.line_open} → ${pred.actual_sog} SOG${ot} (${pred.odds_open})${roi}`);
  }

  // ALERTS
  console.log('\n🚨 ALERTS');
  console.log('-'.repeat(70));
  
  const alerts = [];
  
  if (parseFloat(metrics.winRate) < 53 && completed.length >= window) {
    alerts.push(`⚠️ WARNING: ${window}-game win% (${metrics.winRate}%) below 53% threshold`);
  }
  
  if (parseFloat(metrics.roi) < -1 && completed.length >= window) {
    alerts.push(`🚨 CRITICAL: ${window}-game ROI (${metrics.roi}) below -1 unit threshold → STOP BETTING`);
  }
  
  if (metrics.overs.count >= 10 && parseFloat(metrics.overs.winRate) < 50) {
    alerts.push(`⚠️ CAUTION: Overs underperforming (${metrics.overs.winRate}% in last ${window})`);
  }
  
  if (metrics.unders.count >= 10 && parseFloat(metrics.unders.winRate) < 50) {
    alerts.push(`⚠️ CAUTION: Unders underperforming (${metrics.unders.winRate}% in last ${window})`);
  }

  if (parseFloat(mae) > 0.8) {
    alerts.push(`⚠️ WARNING: MAE (${mae}) exceeds 0.8 SOG threshold → Model degraded`);
  }

  if (alerts.length > 0) {
    alerts.forEach(alert => console.log(alert));
  } else {
    console.log('✅ All systems normal');
  }

  console.log('\n' + '='.repeat(70));
}

// Main execution
const args = process.argv.slice(2);
const season = args[0] || '2024-25';
const window = args[1] ? parseInt(args[1]) : 20;

displayDashboard(season, window);

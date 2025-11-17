#!/usr/bin/env node

/**
 * NFL V5 EPA Fix - Final Validation Script
 * 
 * This script performs comprehensive validation of the EPA fix:
 * 1. Week 12 predictions (upcoming)
 * 2. Feature distribution validation
 * 3. Historical weeks spot-check (Weeks 8, 10)
 * 4. Health check verification
 */

const ENDPOINT = 'https://nba-model-iq.netlify.app/.netlify/functions/nfl-v5-live';

async function fetchPredictions(season, week) {
  const url = `${ENDPOINT}?season=${season}&week=${week}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return await response.json();
}

function analyzeWeek(data, weekLabel) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 ${weekLabel} ANALYSIS`);
  console.log('='.repeat(70));
  
  // Basic info
  console.log('\n📋 METADATA:');
  console.log(`  Model Version: ${data.model_version}`);
  console.log(`  Generated: ${data.generated_at}`);
  console.log(`  Games: ${data.games_count}`);
  console.log(`  Generation Time: ${data.generation_time_ms}ms`);
  
  // Health check
  console.log('\n🏥 HEALTH CHECK:');
  const healthIcon = data.health_check.passed ? '✅' : '❌';
  console.log(`  Status: ${healthIcon} ${data.health_check.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`  OVER picks: ${data.health_check.over_count}`);
  console.log(`  UNDER picks: ${data.health_check.under_count}`);
  console.log(`  Mean Total: ${data.health_check.mean_total.toFixed(2)}`);
  
  // Feature diagnostics
  if (data.feature_diagnostics) {
    console.log('\n🔬 FEATURE DIAGNOSTICS:');
    console.log('  Feature          Live      Training   Diff     Status');
    console.log('  ' + '-'.repeat(62));
    
    const means = data.feature_diagnostics.means;
    const targets = data.feature_diagnostics.training_targets;
    
    Object.keys(targets).forEach(key => {
      const live = means[key];
      const target = targets[key];
      const diff = live - target;
      const pctDiff = (diff / target) * 100;
      const status = Math.abs(pctDiff) < 15 ? '✅' : '⚠️';
      
      console.log(`  ${key.padEnd(16)} ${live.toFixed(4).padStart(8)}  ${target.toFixed(4).padStart(8)}  ${diff.toFixed(4).padStart(7)}  ${status}`);
    });
    
    console.log(`\n  EPA Denominator: ${data.feature_diagnostics.epa_denominator}`);
    console.log(`  Scale Factor: ${data.feature_diagnostics.scale_factor}`);
  }
  
  // Totals distribution
  console.log('\n📈 TOTALS DISTRIBUTION:');
  const totals = data.games.map(g => g.total.predicted);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  
  console.log(`  Mean: ${mean.toFixed(2)}`);
  console.log(`  Min: ${min.toFixed(2)}`);
  console.log(`  Max: ${max.toFixed(2)}`);
  console.log(`  Range: ${(max - min).toFixed(2)}`);
  
  // Target ranges
  const inRange = mean >= 40 && mean <= 50;
  const rangeIcon = inRange ? '✅' : '⚠️';
  console.log(`  Target Range: 42-48 ${rangeIcon}`);
  
  // Spread distribution
  console.log('\n📊 SPREADS DISTRIBUTION:');
  const spreads = data.games.map(g => Math.abs(g.spread_model.predicted_spread));
  const spreadMean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const spreadMin = Math.min(...spreads);
  const spreadMax = Math.max(...spreads);
  
  console.log(`  Mean: ${spreadMean.toFixed(2)}`);
  console.log(`  Min: ${spreadMin.toFixed(2)}`);
  console.log(`  Max: ${spreadMax.toFixed(2)}`);
  
  return {
    healthPassed: data.health_check.passed,
    meanTotal: mean,
    minTotal: min,
    maxTotal: max,
    overCount: data.health_check.over_count,
    underCount: data.health_check.under_count,
    features: data.feature_diagnostics?.means
  };
}

function spotCheckGames(data, count = 5) {
  console.log(`\n🔍 SPOT CHECK (First ${count} Games):`);
  console.log('  ' + '-'.repeat(68));
  
  for (let i = 0; i < Math.min(count, data.games.length); i++) {
    const g = data.games[i];
    console.log(`\n  Game ${i + 1}: ${g.matchup}`);
    console.log(`    Predicted Total: ${g.total.predicted.toFixed(1)} | Line: ${g.total.line} | Pick: ${g.total.pick}`);
    
    if (g.total_model.features) {
      const f = g.total_model.features;
      console.log(`    Features:`);
      console.log(`      pace_combined: ${f.pace_combined.toFixed(2)}`);
      console.log(`      epa_off_sum: ${f.epa_off_sum.toFixed(4)}`);
      console.log(`      success_sum: ${f.success_sum.toFixed(4)}`);
      console.log(`      explosive_sum: ${f.explosive_sum.toFixed(4)}`);
      
      // Validation
      const issues = [];
      if (f.pace_combined < 160 || f.pace_combined > 185) issues.push('pace out of range');
      if (f.epa_off_sum < -0.2 || f.epa_off_sum > 0.3) issues.push('EPA extreme');
      if (f.success_sum < 0.3 || f.success_sum > 0.7) issues.push('success out of range');
      if (Math.abs(f.explosive_sum - 0.041) > 0.02) issues.push('explosive off target');
      
      if (issues.length > 0) {
        console.log(`      ⚠️  Issues: ${issues.join(', ')}`);
      } else {
        console.log(`      ✅ All features in expected range`);
      }
    }
    
    // Check spread sign logic
    const spreadPick = g.spread.pick;
    const spreadLine = g.spread.line;
    const isHomeFavorite = spreadLine < 0;
    const pickingFavorite = (isHomeFavorite && spreadPick === g.home_team) || 
                           (!isHomeFavorite && spreadPick === g.away_team);
    
    const spreadSignCorrect = (pickingFavorite && spreadLine < 0) || (!pickingFavorite && spreadLine > 0);
    const spreadIcon = spreadSignCorrect ? '✅' : '❌';
    
    console.log(`    Spread: ${spreadPick} ${spreadLine > 0 ? '+' : ''}${spreadLine} ${spreadIcon}`);
  }
}

async function main() {
  console.log('🏈 NFL V5 EPA Fix - Final Validation');
  console.log('Date: ' + new Date().toISOString());
  console.log('Endpoint: ' + ENDPOINT);
  
  const results = {
    week12: null,
    week8: null,
    week10: null
  };
  
  try {
    // A. Week 12 Validation (Primary)
    console.log('\n' + '█'.repeat(70));
    console.log('█  A. WEEK 12 VALIDATION (PRIMARY)');
    console.log('█'.repeat(70));
    
    const week12 = await fetchPredictions(2025, 12);
    results.week12 = analyzeWeek(week12, 'WEEK 12 (Upcoming)');
    spotCheckGames(week12, 5);
    
  } catch (error) {
    console.error('\n❌ Week 12 Error:', error.message);
    console.log('   This may indicate the function is not yet deployed.');
  }
  
  try {
    // B. Historical Validation (Week 8)
    console.log('\n\n' + '█'.repeat(70));
    console.log('█  B. HISTORICAL VALIDATION - WEEK 8');
    console.log('█'.repeat(70));
    
    const week8 = await fetchPredictions(2025, 8);
    results.week8 = analyzeWeek(week8, 'WEEK 8 (Historical)');
    spotCheckGames(week8, 3);
    
  } catch (error) {
    console.error('\n❌ Week 8 Error:', error.message);
  }
  
  try {
    // C. Historical Validation (Week 10)
    console.log('\n\n' + '█'.repeat(70));
    console.log('█  C. HISTORICAL VALIDATION - WEEK 10');
    console.log('█'.repeat(70));
    
    const week10 = await fetchPredictions(2025, 10);
    results.week10 = analyzeWeek(week10, 'WEEK 10 (Historical)');
    spotCheckGames(week10, 3);
    
  } catch (error) {
    console.error('\n❌ Week 10 Error:', error.message);
  }
  
  // Final Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📋 FINAL VALIDATION SUMMARY');
  console.log('='.repeat(70));
  
  const weeks = ['week12', 'week8', 'week10'];
  const labels = ['Week 12 (Upcoming)', 'Week 8 (Historical)', 'Week 10 (Historical)'];
  
  console.log('\n| Week | Health | Mean Total | Range | OVER/UNDER | Status |');
  console.log('|------|--------|------------|-------|------------|--------|');
  
  weeks.forEach((week, i) => {
    const r = results[week];
    if (r) {
      const healthIcon = r.healthPassed ? '✅' : '❌';
      const rangeOk = r.meanTotal >= 40 && r.meanTotal <= 50;
      const rangeIcon = rangeOk ? '✅' : '⚠️';
      const balance = Math.abs(r.overCount - r.underCount);
      const balanceOk = balance <= 4;
      const balanceIcon = balanceOk ? '✅' : '⚠️';
      
      console.log(`| ${labels[i].padEnd(20)} | ${healthIcon} | ${r.meanTotal.toFixed(1).padStart(10)} | ${r.minTotal.toFixed(0)}-${r.maxTotal.toFixed(0)} | ${r.overCount}/${r.underCount} ${balanceIcon} | ${rangeIcon} |`);
    } else {
      console.log(`| ${labels[i].padEnd(20)} | N/A | N/A | N/A | N/A | ❌ |`);
    }
  });
  
  // Success criteria check
  console.log('\n✅ SUCCESS CRITERIA:');
  let allPassed = true;
  
  if (results.week12) {
    const checks = [
      { name: 'Health check passes', pass: results.week12.healthPassed },
      { name: 'Mean total 40-50', pass: results.week12.meanTotal >= 40 && results.week12.meanTotal <= 50 },
      { name: 'Balanced OVER/UNDER', pass: Math.abs(results.week12.overCount - results.week12.underCount) <= 4 },
      { name: 'Min total >= 35', pass: results.week12.minTotal >= 35 },
      { name: 'Max total <= 60', pass: results.week12.maxTotal <= 60 }
    ];
    
    checks.forEach(c => {
      const icon = c.pass ? '✅' : '❌';
      console.log(`  ${icon} ${c.name}`);
      if (!c.pass) allPassed = false;
    });
  } else {
    console.log('  ❌ Week 12 data not available (deployment issue)');
    allPassed = false;
  }
  
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('🎉 EPA FIX VALIDATION: COMPLETE & SUCCESSFUL');
    console.log('   Week 12 predictions are production-ready.');
  } else {
    console.log('⚠️  EPA FIX VALIDATION: ISSUES DETECTED');
    console.log('   Review the analysis above and adjust if needed.');
  }
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err);
  process.exit(1);
});

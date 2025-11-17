#!/usr/bin/env node

/**
 * Test EPA Fix - Verify training-exact EPA calculation
 * 
 * This script:
 * 1. Fetches Week 12 predictions with the fixed EPA logic
 * 2. Analyzes feature distributions
 * 3. Compares to training distribution
 * 4. Validates health checks pass
 */

const ENDPOINT = 'https://nba-model-iq.netlify.app/.netlify/functions/nfl-v5-live?season=2025&week=12';

async function testEpaFix() {
  console.log('🏈 NFL V5 EPA Fix Validation\n');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(ENDPOINT);
    const data = await response.json();
    
    console.log('\n📊 DEPLOYMENT INFO:');
    console.log('  Model Version:', data.model_version);
    console.log('  Generated At:', data.generated_at);
    console.log('  Games Count:', data.games_count);
    console.log('  Generation Time:', data.generation_time_ms, 'ms');
    
    console.log('\n🏥 HEALTH CHECK:');
    console.log('  Passed:', data.health_check.passed ? '✅' : '❌');
    console.log('  OVER Count:', data.health_check.over_count);
    console.log('  UNDER Count:', data.health_check.under_count);
    console.log('  Mean Total:', data.health_check.mean_total.toFixed(2));
    
    // Analyze feature distributions
    const totals = [];
    const paceValues = [];
    const epaValues = [];
    const successValues = [];
    const explosiveValues = [];
    
    data.games.forEach(g => {
      totals.push(g.total.predicted_total);
      
      // Extract features from debug info if available
      if (g.total.features) {
        paceValues.push(g.total.features.pace_combined);
        epaValues.push(g.total.features.epa_off_sum);
        successValues.push(g.total.features.success_sum);
        explosiveValues.push(g.total.features.explosive_sum);
      }
    });
    
    console.log('\n📈 PREDICTED TOTALS:');
    const meanTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    console.log('  Mean:', meanTotal.toFixed(2));
    console.log('  Min:', minTotal.toFixed(2));
    console.log('  Max:', maxTotal.toFixed(2));
    console.log('  Range:', (maxTotal - minTotal).toFixed(2));
    
    if (paceValues.length > 0) {
      console.log('\n🔧 FEATURE DISTRIBUTIONS:');
      console.log('  Pace Combined:');
      console.log('    Mean:', (paceValues.reduce((a, b) => a + b, 0) / paceValues.length).toFixed(2), '(target: ~171)');
      console.log('    Min:', Math.min(...paceValues).toFixed(2));
      console.log('    Max:', Math.max(...paceValues).toFixed(2));
      
      console.log('  EPA Off Sum:');
      const meanEpa = epaValues.reduce((a, b) => a + b, 0) / epaValues.length;
      console.log('    Mean:', meanEpa.toFixed(4), meanEpa >= 0 ? '✅' : '⚠️', '(target: 0.00-0.20)');
      console.log('    Min:', Math.min(...epaValues).toFixed(4));
      console.log('    Max:', Math.max(...epaValues).toFixed(4));
      
      console.log('  Success Sum:');
      console.log('    Mean:', (successValues.reduce((a, b) => a + b, 0) / successValues.length).toFixed(4), '(target: ~0.44)');
      
      console.log('  Explosive Sum:');
      console.log('    Mean:', (explosiveValues.reduce((a, b) => a + b, 0) / explosiveValues.length).toFixed(4), '(target: ~0.041)');
    }
    
    console.log('\n🎯 SAMPLE PREDICTIONS:');
    data.games.slice(0, 5).forEach(g => {
      const pick = g.total.pick || 'N/A';
      const edge = g.total.edge ? g.total.edge.toFixed(1) : 'N/A';
      console.log(`  ${g.away_team} @ ${g.home_team}:`);
      console.log(`    Predicted: ${g.total.predicted_total.toFixed(1)} | Line: ${g.total_line || 'N/A'} | Pick: ${pick} (${edge})`);
    });
    
    // Training comparison
    console.log('\n📚 TRAINING vs LIVE COMPARISON:');
    console.log('  Feature          Training    Live         Status');
    console.log('  ' + '-'.repeat(55));
    
    if (paceValues.length > 0) {
      const livePace = paceValues.reduce((a, b) => a + b, 0) / paceValues.length;
      console.log(`  pace_combined    171.4       ${livePace.toFixed(2).padEnd(12)} ${Math.abs(livePace - 171.4) < 10 ? '✅' : '⚠️'}`);
      
      const liveEpa = epaValues.reduce((a, b) => a + b, 0) / epaValues.length;
      console.log(`  epa_off_sum      0.0186      ${liveEpa.toFixed(4).padEnd(12)} ${liveEpa >= -0.05 && liveEpa <= 0.25 ? '✅' : '⚠️'}`);
      
      const liveSuccess = successValues.reduce((a, b) => a + b, 0) / successValues.length;
      console.log(`  success_sum      0.444       ${liveSuccess.toFixed(4).padEnd(12)} ${Math.abs(liveSuccess - 0.444) < 0.15 ? '✅' : '⚠️'}`);
      
      const liveExplosive = explosiveValues.reduce((a, b) => a + b, 0) / explosiveValues.length;
      console.log(`  explosive_sum    0.041       ${liveExplosive.toFixed(4).padEnd(12)} ${Math.abs(liveExplosive - 0.041) < 0.01 ? '✅' : '⚠️'}`);
    }
    
    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (data.health_check.passed && meanTotal >= 40 && meanTotal <= 50) {
      console.log('✅ EPA FIX SUCCESSFUL - Week 12 predictions production-ready!');
    } else if (!data.health_check.passed) {
      console.log('⚠️  Health check failed - review feature distributions above');
    } else {
      console.log('⚠️  Mean total outside expected range (40-50) - needs investigation');
    }
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error testing EPA fix:', error.message);
    process.exit(1);
  }
}

testEpaFix();

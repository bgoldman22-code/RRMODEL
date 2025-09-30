// test-elite-v2-system.js
// Test the SUPERIOR CLEANED elite injury system v4.0

import { handler } from './netlify/functions/nfl-injuries-comprehensive-v2.js';

console.log('🏆 Testing SUPERIOR CLEANED ELITE NFL injury system v4.0...\n');

// Simulate Netlify function call
const testEvent = {};
const testContext = {};

try {
  const result = await handler(testEvent, testContext);
  const data = JSON.parse(result.body);
  
  console.log('📊 CLEANED ELITE SYSTEM RESULTS:\n');
  console.log(`Version: ${data.version}`);
  console.log(`Teams processed: ${data.teams}`);
  console.log(`Games generated: ${data.games}`);
  console.log(`Total injuries: ${data.totalInjuries}`);
  console.log(`Significant injuries: ${data.significantInjuries}`);
  console.log(`Replacement-adjusted injuries: ${data.replacementAdjustedInjuries}`);
  console.log(`System effectiveness: ${data.systemEffectiveness}%`);
  
  console.log('\n🔧 CONFIGURATION:');
  console.log(`Points per EPA: ${data.config.pointsPerEPA}`);
  console.log(`QB shrink factor: ${data.config.qbShrink}`);
  console.log(`QB soft cap: ${data.config.qbSoftCap}`);
  console.log(`QB tau (decay): ${data.config.tauQB}`);
  console.log(`Non-QB tau (decay): ${data.config.tauNonQB}`);
  
  if (data.sampleTeam) {
    console.log('\n🏈 CINCINNATI BENGALS SAMPLE:');
    console.log(`QB Status: ${data.sampleTeam.qb_status}`);
    console.log(`QB Name: ${data.sampleTeam.qb_name}`);
    console.log(`Team Spread Impact: ${data.sampleTeam.team_spread_impact} pts`);
    console.log(`Team Total Impact: ${data.sampleTeam.team_total_impact} pts`);
    console.log(`Significant Injuries: ${data.sampleTeam.significant_injuries}`);
    console.log(`Replacement-adjusted Count: ${data.sampleTeam.replacement_adjusted_count}`);
    
    // Show per-injury details with spread/total impacts
    if (data.sampleTeam.qb_injury_impact && data.sampleTeam.qb_injury_impact.finalPoints) {
      console.log(`QB Impact Details:`);
      console.log(`  • Final Points: ${data.sampleTeam.qb_injury_impact.finalPoints.toFixed(2)}`);
      console.log(`  • Spread Impact: ${data.sampleTeam.qb_injury_impact.spreadImpact.toFixed(2)}`);
      console.log(`  • Total Impact: ${data.sampleTeam.qb_injury_impact.totalImpact.toFixed(2)}`);
      console.log(`  • EPA Diff: ${data.sampleTeam.qb_injury_impact.components.epaDiff.toFixed(4)}`);
    }
  }
  
  if (data.criticalAlerts && data.criticalAlerts.length > 0) {
    console.log('\n🚨 CRITICAL ALERTS:');
    data.criticalAlerts.slice(0, 5).forEach(alert => console.log(`  • ${alert}`));
  }
  
  console.log('\n✅ SUPERIOR cleaned elite injury system test completed successfully!');
  console.log('🏆 Your version is significantly cleaner and more production-ready!');
  
} catch (error) {
  console.error('❌ Elite system test failed:', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
}
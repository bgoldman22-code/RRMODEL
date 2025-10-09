// test-elite-injury-system.js
// Test the ELITE injury system v4.0 with replacement-adjusted impacts

import { handler } from './netlify/functions/nfl-injuries-comprehensive-elite.js';

console.log('🏆 Testing ELITE NFL injury system v4.0...\n');

// Simulate Netlify function call
const testEvent = {};
const testContext = {};

try {
  const result = await handler(testEvent, testContext);
  const data = JSON.parse(result.body);
  
  console.log('📊 ELITE SYSTEM RESULTS:\n');
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
  
  if (data.sample.CIN) {
    console.log('\n🏈 CINCINNATI BENGALS SAMPLE:');
    console.log(`QB Status: ${data.sample.CIN.qb_status}`);
    console.log(`QB Name: ${data.sample.CIN.qb_name}`);
    console.log(`QB EPA Impact: ${data.sample.CIN.qb_replacement_adjusted?.toFixed(4) || 'N/A'}`);
    console.log(`Team Spread Impact: ${data.sample.CIN.team_spread_impact?.toFixed(2) || 'N/A'}`);
    console.log(`Team Total Impact: ${data.sample.CIN.team_total_impact?.toFixed(2) || 'N/A'}`);
    console.log(`Significant Injuries: ${data.sample.CIN.significant_injuries}`);
  }
  
  if (data.sampleGame) {
    console.log('\n🎯 SAMPLE GAME IMPACT:');
    console.log(`Game: ${data.sampleGame.away} @ ${data.sampleGame.home}`);
    console.log(`Net Spread Impact: ${data.sampleGame.netImpacts.spread?.toFixed(2)} pts`);
    console.log(`Net Total Impact: ${data.sampleGame.netImpacts.total?.toFixed(2)} pts`);
  }
  
  if (data.criticalAlerts && data.criticalAlerts.length > 0) {
    console.log('\n🚨 CRITICAL ALERTS:');
    data.criticalAlerts.slice(0, 5).forEach(alert => console.log(`  • ${alert}`));
  }
  
  console.log('\n✅ Elite injury system test completed successfully!');
  
} catch (error) {
  console.error('❌ Elite system test failed:', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
}
// Test script for depth chart change detection (QB, RB1, WR1)
import { analyzeDepthChartChanges } from './netlify/functions/_lib/depth-chart-change-detector.js';

async function testDepthChartChanges() {
  console.log('🏈 Elite Depth Chart Change Detection System\n');
  console.log('═'.repeat(70));
  
  // Analyze Week 5 vs Week 4 changes
  const result = await analyzeDepthChartChanges(5, 2025);
  
  if (!result.success) {
    console.error('❌ Failed to analyze depth chart changes:', result.error);
    return;
  }
  
  if (result.warning) {
    console.log(`⚠️  ${result.warning}\n`);
    return;
  }
  
  console.log(`\n📊 Week ${result.currentWeek} Personnel Changes (vs Week ${result.previousWeek})`);
  console.log(`   Generated: ${new Date(result.asOf).toLocaleString()}\n`);
  console.log('─'.repeat(70));
  
  // Summary
  console.log('\n📈 SUMMARY:');
  console.log(`   Total Position Changes: ${result.summary.totalChanges}`);
  console.log(`   Significant Changes: ${result.summary.significantChanges}`);
  console.log(`   QB Changes: ${result.summary.qbChanges}`);
  console.log(`   RB1 Changes: ${result.summary.rb1Changes}`);
  console.log(`   WR1 Changes: ${result.summary.wr1Changes}\n`);
  
  // QB Changes
  if (result.qbChanges.changes.length > 0) {
    console.log('─'.repeat(70));
    console.log('\n🎯 QUARTERBACK CHANGES:\n');
    
    result.qbChanges.changes
      .sort((a, b) => a.spreadImpact - b.spreadImpact) // Most negative impact first
      .forEach((change, idx) => {
        const impact = change.spreadImpact;
        const icon = change.isSignificant ? '🔥' : '📊';
        const arrow = impact < 0 ? '📉' : '📈';
        
        console.log(`${icon} ${idx + 1}. ${change.team}: ${change.previousStarter} → ${change.currentStarter}`);
        console.log(`   ${arrow} Spread Impact: ${impact >= 0 ? '+' : ''}${impact.toFixed(2)} pts`);
        console.log(`   EPA Change: ${change.previousEPA.toFixed(3)} → ${change.currentEPA.toFixed(3)} (Δ ${change.epaDelta >= 0 ? '+' : ''}${change.epaDelta.toFixed(3)})`);
        console.log(`   Confidence: ${(change.confidence * 100).toFixed(0)}%`);
        console.log(`   Status: ${change.reason}${change.isSignificant ? ' ⚠️ SIGNIFICANT' : ''}\n`);
      });
  } else {
    console.log('\n✅ No QB changes detected\n');
  }
  
  // RB1 Changes
  if (result.rb1Changes.changes.length > 0) {
    console.log('─'.repeat(70));
    console.log('\n🏃 RB1 CHANGES:\n');
    
    result.rb1Changes.changes.forEach((change, idx) => {
      const icon = change.isSignificant ? '🔥' : '📊';
      console.log(`${icon} ${idx + 1}. ${change.team}: ${change.previousStarter} → ${change.currentStarter}`);
      console.log(`   Spread Impact: ${change.spreadImpact >= 0 ? '+' : ''}${change.spreadImpact.toFixed(2)} pts\n`);
    });
  }
  
  // Significant Impacts Summary
  if (result.significantImpacts.length > 0) {
    console.log('─'.repeat(70));
    console.log('\n⚠️  SIGNIFICANT BETTING IMPACTS:\n');
    
    result.significantImpacts.forEach((change, idx) => {
      console.log(`${idx + 1}. ${change.team} ${change.position}: ${change.previousStarter} → ${change.currentStarter}`);
      console.log(`   Expected line movement: ${change.spreadImpact >= 0 ? '+' : ''}${change.spreadImpact.toFixed(1)} pts`);
      console.log(`   Total impact: ${change.totalImpact >= 0 ? '+' : ''}${change.totalImpact.toFixed(1)} pts\n`);
    });
  }
  
  // Cleveland Highlight
  const cleQBChange = result.qbChanges.changes.find(c => c.team === 'CLE');
  if (cleQBChange) {
    console.log('─'.repeat(70));
    console.log('\n🎯 CLEVELAND BROWNS QB SITUATION:');
    console.log(`   Week 4 Starter: ${cleQBChange.previousStarter}`);
    console.log(`   Week 5 Starter: ${cleQBChange.currentStarter}`);
    console.log(`   Expected Impact: ${cleQBChange.spreadImpact.toFixed(1)} points against the spread`);
    console.log(`   EPA Delta: ${cleQBChange.epaDelta.toFixed(3)} per play`);
    console.log(`   \n   💡 This explains why MIN @ CLE predictions showed minimal change!`);
    console.log(`   The model wasn't detecting this personnel change as an "injury-like" event.`);
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ Analysis Complete\n');
}

testDepthChartChanges().catch(console.error);

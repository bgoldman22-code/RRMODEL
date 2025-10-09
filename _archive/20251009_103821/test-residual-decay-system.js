#!/usr/bin/env node

// Test script for residual decay system
import { updateInjuryDurations, getWeeksOut, applyResidualDecay, getInjuryDurationSummary } from './netlify/functions/_lib/injury-duration-tracker.js';

console.log('🧪 TESTING RESIDUAL DECAY SYSTEM');
console.log('=====================================');

// Simulate injury data for testing
const testInjuryData = {
  teams: {
    WAS: {
      qb_status: 'out',
      qb_name: 'Jayden Daniels',
      rb_injuries: [],
      wr_injuries: [
        { name: 'Terry McLaurin', status: 'out', position: 'WR' }
      ],
      te_injuries: []
    },
    NYG: {
      qb_status: 'active',
      qb_name: 'Daniel Jones',
      rb_injuries: [],
      wr_injuries: [
        { name: 'Malik Nabers', status: 'out', position: 'WR' }
      ],
      te_injuries: []
    }
  }
};

async function testResidualDecay() {
  try {
    console.log('\n📊 Step 1: Initialize injury tracking for Week 4');
    await updateInjuryDurations(testInjuryData, 4, 2025);
    
    console.log('\n📊 Step 2: Simulate Week 5 - same players still out');
    await updateInjuryDurations(testInjuryData, 5, 2025);
    
    console.log('\n📊 Step 3: Simulate Week 6 - same players still out');
    await updateInjuryDurations(testInjuryData, 6, 2025);
    
    console.log('\n📊 Step 4: Test weeks out calculation');
    const danielsWeeksOut = getWeeksOut('Jayden Daniels', 'WAS', 6, 2025);
    const nabersWeeksOut = getWeeksOut('Malik Nabers', 'NYG', 6, 2025);
    
    console.log(`   Jayden Daniels weeks out: ${danielsWeeksOut}`);
    console.log(`   Malik Nabers weeks out: ${nabersWeeksOut}`);
    
    console.log('\n📊 Step 5: Test residual decay application');
    const rawQBImpact = -8.5; // Strong QB impact
    const rawWRImpact = -2.8; // Strong WR impact
    
    console.log(`   Raw QB impact: ${rawQBImpact}`);
    console.log(`   Raw WR impact: ${rawWRImpact}`);
    
    const decayedQBImpact = applyResidualDecay(rawQBImpact, danielsWeeksOut, 4);
    const decayedWRImpact = applyResidualDecay(rawWRImpact, nabersWeeksOut, 4);
    
    console.log(`   Decayed QB impact (${danielsWeeksOut} weeks): ${decayedQBImpact.toFixed(2)}`);
    console.log(`   Decayed WR impact (${nabersWeeksOut} weeks): ${decayedWRImpact.toFixed(2)}`);
    
    console.log('\n📊 Step 6: Show decay factors');
    for (let weeks = 0; weeks <= 8; weeks++) {
      const decayFactor = Math.exp(-weeks / 4);
      console.log(`   Week ${weeks}: ${(decayFactor * 100).toFixed(1)}% of original impact`);
    }
    
    console.log('\n📊 Step 7: Get injury duration summary');
    const summary = await getInjuryDurationSummary();
    console.log('Injury Duration Summary:', JSON.stringify(summary, null, 2));
    
    console.log('\n✅ Residual decay system test completed successfully!');
    console.log('\n🎯 KEY BENEFITS:');
    console.log('   • Long-term injuries have reduced impact over time');
    console.log('   • Market has time to adjust to player absence');
    console.log('   • Prevents stale injury impacts from dominating predictions');
    console.log('   • Automatic tracking across weeks');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testResidualDecay();
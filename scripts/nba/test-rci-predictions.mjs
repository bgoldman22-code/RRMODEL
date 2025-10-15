#!/usr/bin/env node

/**
 * Test RCI-Adjusted NBA Predictions
 * 
 * This script tests the RCI integration by simulating prediction requests
 * for teams with different RCI profiles:
 * - Celtics (0.670 - lost major players)
 * - Thunder (0.961 - best continuity)
 * - Suns (0.498 - worst continuity)
 */

import handler from '../../netlify/functions/nba-predictions-elite/index.mjs';

// Helper to create mock Netlify request
function createRequest(queryParams = {}) {
  const url = new URL('https://example.com/nba-predictions-elite');
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  
  return new Request(url.toString(), {
    method: 'GET',
    headers: {},
  });
}

// Mock Netlify context
const mockContext = {
  log: console.log,
};

// Helper to extract key info from prediction
async function summarizePrediction(result) {
  const body = await result.json();
  
  if (!body.predictions || body.predictions.length === 0) {
    console.log('❌ No predictions returned');
    return;
  }

  const pred = body.predictions[0];
  console.log(`\n📊 ${pred.home.team.displayName} vs ${pred.away.team.displayName}`);
  console.log(`   Date: ${pred.date}`);
  
  // RCI Info
  if (pred.home.rci) {
    console.log(`\n   🏠 ${pred.home.team.abbreviation} RCI:`);
    console.log(`      RCI: ${pred.home.rci.rci.toFixed(3)}`);
    console.log(`      ΔOff: ${pred.home.rci.deltaOff.toFixed(2)} pts/100`);
    console.log(`      ΔDef: ${pred.home.rci.deltaDef.toFixed(2)} pts/100`);
    console.log(`      Impact: ${pred.home.rci.impact}`);
  }
  
  if (pred.away.rci) {
    console.log(`\n   ✈️  ${pred.away.team.abbreviation} RCI:`);
    console.log(`      RCI: ${pred.away.rci.rci.toFixed(3)}`);
    console.log(`      ΔOff: ${pred.away.rci.deltaOff.toFixed(2)} pts/100`);
    console.log(`      ΔDef: ${pred.away.rci.deltaDef.toFixed(2)} pts/100`);
    console.log(`      Impact: ${pred.away.rci.impact}`);
  }
  
  // Predictions
  console.log(`\n   📈 Predictions:`);
  console.log(`      Spread: ${pred.home.team.abbreviation} ${pred.prediction.spread > 0 ? '+' : ''}${pred.prediction.spread.toFixed(1)}`);
  console.log(`      Total: ${pred.prediction.total.toFixed(1)}`);
  console.log(`      Win Probability: ${(pred.prediction.homeWinProb * 100).toFixed(1)}%`);
}

async function runTests() {
  console.log('🏀 Testing RCI-Adjusted NBA Predictions\n');
  console.log('=' .repeat(60));
  
  // Test 1: Get all predictions (should show RCI for all teams)
  console.log('\n🧪 Test 1: All Current Predictions');
  console.log('-'.repeat(60));
  
  const request1 = createRequest();
  const result1 = await handler(request1, mockContext);
  
  if (result1.status === 200) {
    const body = await result1.json();
    console.log(`✅ Status: ${result1.status}`);
    console.log(`📊 Predictions returned: ${body.predictions?.length || 0}`);
    
    if (body.predictions && body.predictions.length > 0) {
      // Show first prediction in detail
      const firstPredResult = { status: 200, json: async () => body };
      summarizePrediction(firstPredResult);
      
      // Summary of RCI impacts
      console.log('\n\n📋 RCI Summary for All Games:');
      console.log('-'.repeat(60));
      
      body.predictions.forEach((pred, idx) => {
        const homeRCI = pred.home.rci?.rci || 'N/A';
        const awayRCI = pred.away.rci?.rci || 'N/A';
        const homeImpact = pred.home.rci?.impact || 'N/A';
        const awayImpact = pred.away.rci?.impact || 'N/A';
        
        console.log(`${idx + 1}. ${pred.home.team.abbreviation} (${typeof homeRCI === 'number' ? homeRCI.toFixed(3) : homeRCI}) vs ${pred.away.team.abbreviation} (${typeof awayRCI === 'number' ? awayRCI.toFixed(3) : awayRCI})`);
        console.log(`   Home: ${homeImpact}, Away: ${awayImpact}`);
      });
    }
  } else {
    console.log(`❌ Error: ${result1.status}`);
    const errorText = await result1.text();
    console.log(errorText);
  }
  
  // Test 2: Specific team with low RCI (if available)
  console.log('\n\n🧪 Test 2: Team-Specific Prediction');
  console.log('-'.repeat(60));
  console.log('Note: Only works if that team has an upcoming game');
  
  const request2 = createRequest({ team: 'BOS' }); // Celtics
  const result2 = await handler(request2, mockContext);
  
  if (result2.status === 200) {
    summarizePrediction(result2);
  } else {
    console.log(`ℹ️  No upcoming game for requested team`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Testing Complete');
  console.log('\n💡 What to look for:');
  console.log('   - Teams with RCI < 0.75 should have NEGATIVE impact');
  console.log('   - Teams with RCI > 0.75 should have POSITIVE impact');
  console.log('   - ΔOff and ΔDef should be small (~0.3 to 1.2 pts/100)');
  console.log('   - Chemistry decay will reduce impact over time');
  console.log('\n📊 Expected RCI ranges:');
  console.log('   - Celtics (BOS): ~0.670 (lost Jrue, Horford, KP)');
  console.log('   - Thunder (OKC): ~0.961 (kept everyone)');
  console.log('   - Suns (PHX): ~0.498 (worst in league)');
}

// Run tests
runTests().catch(console.error);

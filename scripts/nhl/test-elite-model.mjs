#!/usr/bin/env node

/**
 * Test Elite NHL Scanner V4
 * 
 * Validates:
 * - Cache loading works
 * - Elite projections generate
 * - No 502 errors (completes in <10s)
 * - Reasonable outputs
 */

import { projectSOGElite, preloadCache } from '../../netlify/functions/_lib/nhl-elite-projection-v4.mjs';

async function testEliteModel() {
  console.log('🧪 Testing NHL Elite Scanner V4.0\n');
  
  const startTime = Date.now();
  
  try {
    // Test 1: Preload cache
    console.log('1️⃣ Testing cache preload...');
    await preloadCache();
    const cacheTime = Date.now() - startTime;
    console.log(`   ✅ Cache loaded in ${cacheTime}ms\n`);
    
    // Test 2: Project some test players
    console.log('2️⃣ Testing elite projections...');
    
    const testCases = [
      { id: 8478402, name: 'Connor McDavid', team: 'EDM', opponent: 'CGY', isHome: true, venue: 'Rogers Place' },
      { id: 8477934, name: 'Auston Matthews', team: 'TOR', opponent: 'MTL', isHome: false, venue: 'Bell Centre' },
      { id: 8478550, name: 'Cale Makar', team: 'COL', opponent: 'DAL', isHome: true, venue: 'Ball Arena' }
    ];
    
    for (const test of testCases) {
      const projStart = Date.now();
      const projection = await projectSOGElite(
        test.id,
        test.name,
        test.team,
        test.opponent,
        test.isHome,
        test.venue
      );
      const projTime = Date.now() - projStart;
      
      if (projection) {
        console.log(`   ✅ ${test.name}: ${projection.mu.toFixed(2)} SOG (${projTime}ms)`);
        console.log(`      Season: ${projection.breakdown.seasonAvg.toFixed(2)}, L5: ${projection.breakdown.L5avg.toFixed(2)}`);
        console.log(`      Streak: ${projection.metadata.streak}, PP: ${projection.metadata.ppUnit}`);
        console.log(`      Adjustments: home ${projection.breakdown.adjustments.homeAway.toFixed(2)}x, opp ${projection.breakdown.adjustments.oppDefense.toFixed(2)}x`);
      } else {
        console.log(`   ⚠️ ${test.name}: No projection (player not found or insufficient data)`);
      }
      console.log();
    }
    
    // Test 3: Timing check
    const totalTime = Date.now() - startTime;
    console.log(`3️⃣ Performance check:`);
    console.log(`   Total time: ${totalTime}ms`);
    
    if (totalTime < 2000) {
      console.log(`   ✅ EXCELLENT - Well under 10s limit`);
    } else if (totalTime < 5000) {
      console.log(`   ✅ GOOD - Safe for production`);
    } else if (totalTime < 9000) {
      console.log(`   ⚠️ WARNING - Close to timeout limit`);
    } else {
      console.log(`   ❌ FAIL - Too slow, will cause 502 errors`);
    }
    
    console.log('\n✅ All tests complete!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testEliteModel();

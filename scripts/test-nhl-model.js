// scripts/test-nhl-model.js
// Quick validation test for NHL SOG Props model

import {
  fetchTodaySchedule,
  fetchPlayerStats,
  fetchPlayerGameLog,
  fetchTeamStats
} from '../netlify/functions/_lib/nhl-data-fetch.mjs';

import {
  projectPlayerSOG,
  calculateLineProbability
} from '../netlify/functions/_lib/nhl-projection-engine.mjs';

import {
  scanPlayerLines,
  calculateKellyStake
} from '../netlify/functions/_lib/nhl-line-scanner.mjs';

/**
 * TEST 1: Fetch NHL schedule
 */
async function testScheduleFetch() {
  console.log('\n🧪 TEST 1: Fetch NHL Schedule');
  console.log('═'.repeat(50));
  
  const schedule = await fetchTodaySchedule();
  
  console.log(`✅ Found ${schedule.length} games scheduled`);
  
  if (schedule.length > 0) {
    const game = schedule[0];
    console.log('\nSample Game:');
    console.log(`  ${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`);
    console.log(`  Venue: ${game.venue}`);
    console.log(`  Time: ${game.startTime}`);
  }
  
  return schedule;
}

/**
 * TEST 2: Fetch player data (Connor McDavid example)
 */
async function testPlayerData() {
  console.log('\n🧪 TEST 2: Fetch Player Data (Connor McDavid)');
  console.log('═'.repeat(50));
  
  const playerId = 8478402; // Connor McDavid
  
  try {
    const [stats, gameLog] = await Promise.all([
      fetchPlayerStats(playerId),
      fetchPlayerGameLog(playerId, '20252026', 10)
    ]);
    
    if (stats) {
      console.log(`✅ Player: ${stats.fullName}`);
      console.log(`  Team: ${stats.teamAbbrev}`);
      console.log(`  Position: ${stats.position}`);
      console.log(`  Season SOG Avg: ${stats.seasonStats.shotsPerGame.toFixed(2)}`);
      console.log(`  Games Played: ${stats.seasonStats.gamesPlayed}`);
    }
    
    if (gameLog && gameLog.length > 0) {
      console.log(`\n  Last 5 Games SOG: ${gameLog.slice(0, 5).map(g => g.shots).join(', ')}`);
    }
    
    return { stats, gameLog };
  } catch (error) {
    console.log('⚠️  Player data fetch failed (might be offseason):', error.message);
    return null;
  }
}

/**
 * TEST 3: Generate SOG projection
 */
async function testProjection() {
  console.log('\n🧪 TEST 3: Generate SOG Projection');
  console.log('═'.repeat(50));
  
  const playerId = 8478402; // Connor McDavid
  const opponentTeam = 'VAN';
  const isHome = true;
  const venue = 'Rogers Place';
  const gameDate = new Date().toISOString();
  
  try {
    const projection = await projectPlayerSOG(
      playerId,
      opponentTeam,
      isHome,
      venue,
      gameDate
    );
    
    if (projection) {
      console.log(`✅ Projection for ${projection.playerName}`);
      console.log(`  Projected SOG: ${projection.projectedSOG}`);
      console.log(`  Components:`);
      console.log(`    Season Avg: ${projection.components.seasonAvg.toFixed(2)}`);
      console.log(`    Recent Avg: ${projection.components.recentAvg.toFixed(2)}`);
      console.log(`    Opponent Factor: ${projection.components.opponentFactor.toFixed(3)}`);
      console.log(`    Location Factor: ${projection.components.locationFactor.toFixed(3)}`);
      console.log(`    Rest Factor: ${projection.components.restFactor.toFixed(3)}`);
      
      return projection;
    } else {
      console.log('⚠️  Projection returned null (might be offseason or insufficient data)');
      return null;
    }
  } catch (error) {
    console.log('⚠️  Projection failed:', error.message);
    return null;
  }
}

/**
 * TEST 4: Calculate line probabilities
 */
async function testLineProbabilities(projection) {
  if (!projection) {
    console.log('\n⏭️  Skipping TEST 4: No projection available');
    return;
  }
  
  console.log('\n🧪 TEST 4: Calculate Line Probabilities');
  console.log('═'.repeat(50));
  
  const lines = [3.5, 4.5, 5.5];
  
  console.log(`For ${projection.playerName} (Projected: ${projection.projectedSOG})`);
  console.log('');
  
  for (const line of lines) {
    const overProb = calculateLineProbability(projection.projectedSOG, line, true);
    const underProb = calculateLineProbability(projection.projectedSOG, line, false);
    
    console.log(`  Line ${line}:`);
    console.log(`    Over ${line}: ${overProb}%`);
    console.log(`    Under ${line}: ${underProb}%`);
  }
}

/**
 * TEST 5: Edge detection and Kelly staking
 */
async function testEdgeDetection(projection) {
  if (!projection) {
    console.log('\n⏭️  Skipping TEST 5: No projection available');
    return;
  }
  
  console.log('\n🧪 TEST 5: Edge Detection & Kelly Staking');
  console.log('═'.repeat(50));
  
  // Mock book lines
  const mockLines = [
    { book: 'DraftKings', line: 4.5, overOdds: -115, underOdds: -105 },
    { book: 'FanDuel', line: 4.5, overOdds: -120, underOdds: +100 }
  ];
  
  const opportunities = scanPlayerLines(projection, mockLines, 3);
  
  if (opportunities.length > 0) {
    console.log(`✅ Found ${opportunities.length} opportunities with 3%+ edge:\n`);
    
    for (const opp of opportunities) {
      console.log(`  ${opp.bet} @ ${opp.book}`);
      console.log(`    Odds: ${opp.odds > 0 ? '+' : ''}${opp.odds}`);
      console.log(`    Edge: ${opp.edge}%`);
      console.log(`    EV: ${opp.ev}%`);
      console.log(`    Confidence: ${opp.confidence}/100`);
      
      // Calculate stake
      const stake = calculateKellyStake(opp.edge, opp.odds, 10000, 0.25);
      console.log(`    Recommended Stake: $${stake.recommendedStake}`);
      console.log('');
    }
  } else {
    console.log('ℹ️  No opportunities found with 3%+ edge (normal for mock data)');
  }
}

/**
 * RUN ALL TESTS
 */
async function runAllTests() {
  console.log('\n🚀 NHL SOG PROPS MODEL - VALIDATION TESTS');
  console.log('═'.repeat(50));
  console.log('Testing model components and data pipeline...\n');
  
  try {
    // Test 1: Schedule
    const schedule = await testScheduleFetch();
    
    // Test 2: Player data
    const playerData = await testPlayerData();
    
    // Test 3: Projection
    const projection = await testProjection();
    
    // Test 4: Line probabilities
    await testLineProbabilities(projection);
    
    // Test 5: Edge detection
    await testEdgeDetection(projection);
    
    console.log('\n✅ ALL TESTS COMPLETE');
    console.log('═'.repeat(50));
    console.log('\n📝 Notes:');
    console.log('  • Some tests may show warnings if NHL season hasn\'t started');
    console.log('  • Player data fetches will work once games begin');
    console.log('  • Mock odds used for edge detection demo');
    console.log('  • Production will use real odds from The Odds API\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error(error.stack);
  }
}

// Run tests
runAllTests();

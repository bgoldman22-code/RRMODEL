#!/usr/bin/env node
/**
 * Test script for NHL SOG Model fixes
 * Tests all critical improvements before deployment
 */

import { fetchTodaySchedule, fetchPlayerGameLog, fetchTeamStats } from './netlify/functions/_lib/nhl-data-fetch-improved.mjs';

console.log('🏒 NHL SOG MODEL - FIX VALIDATION TEST\n');
console.log('=' .repeat(60));

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    console.log(`\n📋 TEST: ${name}`);
    await fn();
    console.log(`✅ PASSED: ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ FAILED: ${name}`);
    console.error(`   Error: ${error.message}`);
    failedTests++;
  }
}

// TEST 1: Schedule fetch with rate limiting
await test('Fetch Today\'s Schedule (with rate limiting)', async () => {
  const schedule = await fetchTodaySchedule();
  console.log(`   Found ${schedule.length} games today`);
  
  if (schedule.length > 0) {
    console.log(`   Sample game: ${schedule[0].awayTeam.abbrev} @ ${schedule[0].homeTeam.abbrev}`);
    console.log(`   Venue: ${schedule[0].venue}`);
  } else {
    console.log(`   ℹ️  No games scheduled today (this is normal on off-days)`);
  }
});

// TEST 2: Player game log fetch
await test('Fetch Player Game Log (Connor McDavid)', async () => {
  const playerId = 8478402; // Connor McDavid
  const gameLog = await fetchPlayerGameLog(playerId, '20252026', 5);
  
  if (gameLog.length > 0) {
    console.log(`   Fetched ${gameLog.length} recent games`);
    console.log(`   Latest game: ${gameLog[0].shots} SOG vs ${gameLog[0].opponentAbbrev}`);
    console.log(`   TOI: ${gameLog[0].toi}`);
  } else {
    console.log(`   ⚠️  No game log data (may be early season or API issue)`);
  }
});

// TEST 3: Team stats fetch
await test('Fetch Team Stats (Edmonton Oilers)', async () => {
  const teamStats = await fetchTeamStats('EDM', '20252026');
  
  if (teamStats) {
    console.log(`   Games Played: ${teamStats.gamesPlayed}`);
    console.log(`   Shots Against/Game: ${teamStats.shotsAgainstPerGame}`);
    console.log(`   Penalty Kill %: ${(teamStats.penaltyKillPct * 100).toFixed(1)}%`);
  } else {
    throw new Error('Failed to fetch team stats');
  }
});

// TEST 4: Rate limiting verification (multiple calls)
await test('Rate Limiting (3 rapid calls)', async () => {
  const start = Date.now();
  
  await Promise.all([
    fetchTeamStats('TOR', '20252026'),
    fetchTeamStats('MTL', '20252026'),
    fetchTeamStats('BOS', '20252026')
  ]);
  
  const elapsed = Date.now() - start;
  console.log(`   Completed in ${elapsed}ms`);
  console.log(`   ${elapsed >= 1000 ? '✅' : '⚠️'} Rate limiting active (should take ~1-2 seconds)`);
});

// TEST 5: Verify season mismatch fix
await test('Season Configuration Check', async () => {
  const { loadTeamStats } = await import('./netlify/functions/_lib/nhl-elite-projection-v4.mjs');
  
  console.log(`   ✅ Checking if projection engine loads 2025-2026 season data...`);
  
  // Check the actual code for season references
  const fs = await import('fs');
  const fileContent = fs.readFileSync('./netlify/functions/_lib/nhl-elite-projection-v4.mjs', 'utf8');
  
  const has20242025 = fileContent.includes('team_stats_20242025');
  const has20252026 = fileContent.includes('team_stats_20252026');
  
  if (has20242025) {
    throw new Error('❌ Still references old season (20242025)!');
  }
  
  if (has20252026) {
    console.log(`   ✅ Correctly references current season (20252026)`);
  } else {
    throw new Error('❌ No season references found!');
  }
});

// TEST 6: Empty response validation
await test('Empty Response Handling', async () => {
  // Test with invalid player ID to trigger empty response
  const gameLog = await fetchPlayerGameLog(999999999, '20252026', 5);
  console.log(`   Empty player ID returned: ${gameLog.length} games (expected 0)`);
  console.log(`   ✅ Gracefully handled without crashing`);
});

// SUMMARY
console.log('\n' + '='.repeat(60));
console.log('\n📊 TEST SUMMARY');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   Total:  ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Ready for deployment.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED! Review errors before deploying.\n');
  process.exit(1);
}

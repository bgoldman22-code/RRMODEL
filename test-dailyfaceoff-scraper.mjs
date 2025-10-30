/**
 * TEST SCRIPT: Daily Faceoff PP Line Scraper
 * 
 * Tests the scraper with a few known players to verify:
 * - Scraper can fetch team lines
 * - Name matching works correctly
 * - PP unit detection is accurate
 * - Fallbacks work when needed
 */

import { determinePPUnit, warmPPLineCache, getAllPP1Players } from './netlify/functions/_lib/nhl-dailyfaceoff-scraper.mjs';

console.log('🧪 Testing Daily Faceoff PP Line Scraper');
console.log('='.repeat(60));

// Test players (known PP1 assignments as of Oct 2025)
const testPlayers = [
  { name: 'Auston Matthews', team: 'Toronto Maple Leafs', expectedUnit: 'PP1' },
  { name: 'Connor McDavid', team: 'Edmonton Oilers', expectedUnit: 'PP1' },
  { name: 'Quinn Hughes', team: 'Vancouver Canucks', expectedUnit: 'PP1' },
  { name: 'Cale Makar', team: 'Colorado Avalanche', expectedUnit: 'PP1' },
  { name: 'Morgan Frost', team: 'Philadelphia Flyers', expectedUnit: 'PP1' },
  { name: 'Erik Karlsson', team: 'Pittsburgh Penguins', expectedUnit: 'PP1' },
  
  // PP2 players
  { name: 'John Tavares', team: 'Toronto Maple Leafs', expectedUnit: 'PP2' },
  { name: 'Ryan Nugent-Hopkins', team: 'Edmonton Oilers', expectedUnit: 'PP2' },
  
  // Non-PP players
  { name: 'Cal Clutterbuck', team: 'New York Islanders', expectedUnit: 'NONE' }
];

async function runTests() {
  console.log('\n📊 Test 1: Individual Player PP Detection\n');
  
  for (const player of testPlayers) {
    try {
      const unit = await determinePPUnit(player.name, player.team);
      const status = unit === player.expectedUnit ? '✅' : '❌';
      
      console.log(`${status} ${player.name} (${player.team}): ${unit} (expected: ${player.expectedUnit})`);
    } catch (error) {
      console.error(`❌ ${player.name}: ERROR - ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test 2: Cache Warming (All Teams)\n');
  
  await warmPPLineCache();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test 3: Get All PP1 Players Across League\n');
  
  const allPP1 = await getAllPP1Players();
  
  console.log(`\nFound ${allPP1.length} PP1 players across ${new Set(allPP1.map(p => p.team)).size} teams:`);
  
  // Group by team
  const byTeam = {};
  allPP1.forEach(({ player, team }) => {
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push(player);
  });
  
  // Show sample teams
  const sampleTeams = ['Edmonton Oilers', 'Toronto Maple Leafs', 'Colorado Avalanche'];
  for (const team of sampleTeams) {
    if (byTeam[team]) {
      console.log(`\n${team} PP1 (${byTeam[team].length} players):`);
      byTeam[team].forEach(p => console.log(`  - ${p}`));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Tests complete!');
}

runTests().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

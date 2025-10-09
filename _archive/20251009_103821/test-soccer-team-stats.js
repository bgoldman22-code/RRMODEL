// Quick test script to validate soccer team statistics lookup
const fs = require('fs');
const path = require('path');

// Read and parse the soccer BTTS function
const functionPath = path.join(__dirname, 'netlify/functions/soccer-btts-predictions.js');
const functionCode = fs.readFileSync(functionPath, 'utf8');

// Extract the PREMIER_LEAGUE_TEAM_STATS
const statsMatch = functionCode.match(/const PREMIER_LEAGUE_TEAM_STATS = {([\s\S]*?)};/);
if (!statsMatch) {
  console.log('❌ Could not extract PREMIER_LEAGUE_TEAM_STATS');
  process.exit(1);
}

console.log('✅ Successfully extracted team stats from function');

// Count teams in our database
let PREMIER_LEAGUE_TEAM_STATS;
try {
  const teamStatsCode = `PREMIER_LEAGUE_TEAM_STATS = {${statsMatch[1]}};`;
  eval(teamStatsCode);
} catch (e) {
  console.log('❌ Error parsing team stats:', e.message);
  process.exit(1);
}

const teamCount = Object.keys(PREMIER_LEAGUE_TEAM_STATS).length;
console.log(`📊 Total teams in database: ${teamCount}`);

// Test team names that commonly appear
const testTeams = [
  'Manchester City',
  'Arsenal', 
  'Chelsea',
  'Liverpool',
  'Brighton & Hove Albion',
  'Brighton',
  'Tottenham Hotspur',
  'Tottenham',
  'Newcastle United',
  'Newcastle',
  'Manchester United',
  'Brentford',
  'Fulham',
  'Crystal Palace',
  'West Ham United',
  'Bournemouth',
  'Wolverhampton Wanderers',
  'Everton',
  'Leicester City',
  'Ipswich Town',
  'Southampton'
];

console.log('\n🧪 Testing team lookup:');
let foundCount = 0;
let missingTeams = [];

testTeams.forEach(team => {
  if (PREMIER_LEAGUE_TEAM_STATS[team]) {
    console.log(`✅ ${team} - Found`);
    foundCount++;
  } else {
    console.log(`❌ ${team} - Missing`);
    missingTeams.push(team);
  }
});

console.log(`\n📈 Results: ${foundCount}/${testTeams.length} teams found`);

if (missingTeams.length > 0) {
  console.log(`\n❌ Missing teams: ${missingTeams.join(', ')}`);
} else {
  console.log('\n🎉 All test teams found in database!');
}

// Test some alternative names that the API might return
console.log('\n🔍 Testing alternative name variations:');
const alternativeNames = [
  'Brighton and Hove Albion',
  'Man City',
  'Man United',
  'Tottenham',
  'Newcastle',
  'West Ham',
  'Leicester',
  'Ipswich',
  'Wolves'
];

alternativeNames.forEach(name => {
  const variations = [
    name,
    name.replace(' & ', ' and '),
    name.replace(' and ', ' & '),
    name.replace(' United', ''),
    name.replace(' City', ''),
    name.replace(' Town', ''),
    name + ' FC',
    name + ' United'
  ];
  
  let found = false;
  for (const variation of variations) {
    if (PREMIER_LEAGUE_TEAM_STATS[variation]) {
      console.log(`✅ "${name}" -> Found as "${variation}"`);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log(`❌ "${name}" -> No variation found`);
  }
});

console.log('\n✨ Team statistics validation complete!');
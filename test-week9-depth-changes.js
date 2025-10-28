/**
 * Test script for Week 9 depth chart change detection
 * Validates replacement detection for QB and RB1 changes
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Week 8 and Week 9 depth charts
const week8Path = join(__dirname, 'public/history/2025/week8/depth-charts.json');
const week9Path = join(__dirname, 'public/history/2025/week9/depth-charts.json');

const week8Data = JSON.parse(readFileSync(week8Path, 'utf8'));
const week9Data = JSON.parse(readFileSync(week9Path, 'utf8'));

// Transform array format to keyed object format
function transformDepthChart(dataArray) {
  const teamMap = {
    'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
    'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
    'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
    'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
  };

  const result = {};
  for (const teamData of dataArray) {
    const code = teamMap[teamData.team];
    if (code) {
      result[code] = {
        QB: teamData.QB || [],
        RB: teamData.RB || [],
        WR: teamData.WR || [],
        TE: teamData.TE || []
      };
    }
  }
  return result;
}

const week8 = transformDepthChart(week8Data);
const week9 = transformDepthChart(week9Data);

console.log('\n🔍 Testing Week 9 Depth Chart Change Detection\n');
console.log('=' .repeat(60));

// Test QB changes
console.log('\n📋 QB CHANGES (Week 8 → Week 9):\n');

const qbChanges = [];
for (const team of Object.keys(week9)) {
  const week8QB1 = week8[team]?.QB?.[0];
  const week9QB1 = week9[team]?.QB?.[0];
  
  if (week8QB1 && week9QB1 && week8QB1 !== week9QB1) {
    qbChanges.push({ team, old: week8QB1, new: week9QB1 });
    console.log(`🔄 ${team}: ${week8QB1} → ${week9QB1}`);
  }
}

if (qbChanges.length === 0) {
  console.log('   ❌ NO QB CHANGES DETECTED');
} else {
  console.log(`\n   ✅ Found ${qbChanges.length} QB change(s)`);
}

// Test RB1 changes
console.log('\n📋 RB1 CHANGES (Week 8 → Week 9):\n');

const rb1Changes = [];
for (const team of Object.keys(week9)) {
  const week8RB1 = week8[team]?.RB?.[0];
  const week9RB1 = week9[team]?.RB?.[0];
  
  if (week8RB1 && week9RB1 && week8RB1 !== week9RB1) {
    rb1Changes.push({ team, old: week8RB1, new: week9RB1 });
    console.log(`🔄 ${team}: ${week8RB1} → ${week9RB1}`);
  }
}

if (rb1Changes.length === 0) {
  console.log('   ❌ NO RB1 CHANGES DETECTED');
} else {
  console.log(`\n   ✅ Found ${rb1Changes.length} RB1 change(s)`);
}

// Test specific expected changes from our Week 9 update
console.log('\n📋 VALIDATION - Expected Changes:\n');

const expectedQBChanges = [
  { team: 'CAR', old: 'Andy Dalton', new: 'Bryce Young' },
  { team: 'NYJ', old: 'Tyrod Taylor', new: 'Justin Fields' },
  { team: 'SF', old: 'Mac Jones', new: 'Brock Purdy' },
  { team: 'WAS', old: 'Marcus Mariota', new: 'Jayden Daniels' }
];

const expectedRBChanges = [
  { team: 'TB', old: 'Rachaad White', new: 'Bucky Irving' },
  { team: 'TEN', old: 'Tony Pollard', new: 'Tyjae Spears' }
];

let allValid = true;

for (const expected of expectedQBChanges) {
  const actual = qbChanges.find(c => c.team === expected.team);
  if (actual && actual.old === expected.old && actual.new === expected.new) {
    console.log(`   ✅ ${expected.team}: ${expected.old} → ${expected.new}`);
  } else {
    console.log(`   ❌ ${expected.team}: Expected ${expected.old} → ${expected.new}, got ${actual ? `${actual.old} → ${actual.new}` : 'NO CHANGE'}`);
    allValid = false;
  }
}

for (const expected of expectedRBChanges) {
  const actual = rb1Changes.find(c => c.team === expected.team);
  if (actual && actual.old === expected.old && actual.new === expected.new) {
    console.log(`   ✅ ${expected.team}: ${expected.old} → ${expected.new}`);
  } else {
    console.log(`   ❌ ${expected.team}: Expected ${expected.old} → ${expected.new}, got ${actual ? `${actual.old} → ${actual.new}` : 'NO CHANGE'}`);
    allValid = false;
  }
}

// Test replacement detection
console.log('\n📋 REPLACEMENT DETECTION TEST:\n');

// Test: If Bryce Young gets injured, replacement should be Andy Dalton (QB2)
const carQB = week9['CAR']?.QB || [];
console.log(`   CAR QB Depth: [${carQB.join(', ')}]`);
console.log(`   If Bryce Young injured → Replacement: ${carQB[1] || 'NONE'}`);
console.log(`   Expected: Andy Dalton`);
console.log(`   ${carQB[1] === 'Andy Dalton' ? '✅ PASS' : '❌ FAIL'}`);

// Test: If Bucky Irving gets injured, replacement should be Rachaad White (RB2)
const tbRB = week9['TB']?.RB || [];
console.log(`\n   TB RB Depth: [${tbRB.join(', ')}]`);
console.log(`   If Bucky Irving injured → Replacement: ${tbRB[1] || 'NONE'}`);
console.log(`   Expected: Rachaad White`);
console.log(`   ${tbRB[1] === 'Rachaad White' ? '✅ PASS' : '❌ FAIL'}`);

// Test: Baltimore Cooper Rush at QB3
const balQB = week9['BAL']?.QB || [];
console.log(`\n   BAL QB Depth: [${balQB.join(', ')}]`);
console.log(`   QB3 = ${balQB[2] || 'NONE'}`);
console.log(`   Expected: Cooper Rush`);
console.log(`   ${balQB[2] === 'Cooper Rush' ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n' + '='.repeat(60));
console.log(allValid ? '\n✅ ALL TESTS PASSED\n' : '\n❌ SOME TESTS FAILED\n');

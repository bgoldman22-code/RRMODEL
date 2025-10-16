#!/usr/bin/env node
/**
 * Compare NFL depth charts between two weeks
 */

import fs from 'fs';

const week6Path = 'public/history/2025/week6/depth-charts.json';
const week7Path = 'public/history/2025/week7/depth-charts.json';

const week6Data = JSON.parse(fs.readFileSync(week6Path, 'utf-8'));
const week7 = JSON.parse(fs.readFileSync(week7Path, 'utf-8'));

// Team name to abbreviation mapping
const teamAbbrevs = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS'
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('🏈 NFL DEPTH CHART CHANGES: Week 6 → Week 7');
console.log('═══════════════════════════════════════════════════════════════\n');

const positions = ['QB', 'RB', 'WR', 'TE'];
let totalChanges = 0;

week7.forEach(team7 => {
  const abbrev = teamAbbrevs[team7.team];
  const team6 = week6Data[abbrev];
  
  if (!team6) {
    console.log(`⚠️ ${team7.team} (${abbrev}) not found in week 6`);
    return;
  }
  
  const teamChanges = [];
  
  positions.forEach(pos => {
    const week6Players = team6[pos] || [];
    const week7Players = team7[pos].map(p => p.name);
    
    // Find additions
    week7Players.forEach((player, idx) => {
      if (!week6Players.includes(player)) {
        teamChanges.push(`  ➕ ${pos}: ${player} (NEW at #${idx + 1})`);
      } else {
        // Check for position changes
        const oldIdx = week6Players.indexOf(player);
        if (oldIdx !== idx) {
          const direction = idx < oldIdx ? '⬆️' : '⬇️';
          teamChanges.push(`  ${direction} ${pos}: ${player} (${oldIdx + 1} → ${idx + 1})`);
        }
      }
    });
    
    // Find removals
    week6Players.forEach(player => {
      if (!week7Players.includes(player)) {
        teamChanges.push(`  ➖ ${pos}: ${player} (REMOVED)`);
      }
    });
  });
  
  if (teamChanges.length > 0) {
    console.log(`\n🔵 ${team7.team} (${abbrev}):`);
    teamChanges.forEach(change => console.log(change));
    totalChanges += teamChanges.length;
  }
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`📊 Total Changes: ${totalChanges}`);
console.log('═══════════════════════════════════════════════════════════════\n');

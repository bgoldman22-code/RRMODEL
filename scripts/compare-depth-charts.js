const fs = require('fs');

const week6 = JSON.parse(fs.readFileSync('public/history/2025/week6/depth-charts.json', 'utf8'));
const week7 = JSON.parse(fs.readFileSync('public/history/2025/week7/depth-charts.json', 'utf8'));

const changes = {};

for (const team of Object.keys(week7).sort()) {
  const teamChanges = { added: {}, removed: {}, moved: {} };
  
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const w6Players = week6[team]?.[pos] || [];
    const w7Players = week7[team]?.[pos] || [];
    
    // Find removed players
    for (const player of w6Players) {
      if (!w7Players.includes(player)) {
        if (!teamChanges.removed[pos]) teamChanges.removed[pos] = [];
        teamChanges.removed[pos].push(player);
      }
    }
    
    // Find added players
    for (const player of w7Players) {
      if (!w6Players.includes(player)) {
        if (!teamChanges.added[pos]) teamChanges.added[pos] = [];
        teamChanges.added[pos].push(player);
      }
    }
    
    // Find moved players (depth change)
    for (const player of w7Players) {
      const w6Idx = w6Players.indexOf(player);
      const w7Idx = w7Players.indexOf(player);
      if (w6Idx !== -1 && w6Idx !== w7Idx) {
        if (!teamChanges.moved[pos]) teamChanges.moved[pos] = [];
        teamChanges.moved[pos].push(`${player} (${w6Idx+1}→${w7Idx+1})`);
      }
    }
  }
  
  // Only record if there are changes
  if (Object.keys(teamChanges.added).length > 0 || 
      Object.keys(teamChanges.removed).length > 0 || 
      Object.keys(teamChanges.moved).length > 0) {
    changes[team] = teamChanges;
  }
}

// Pretty print changes
console.log('\n📊 NFL DEPTH CHART CHANGES - Week 6 → Week 7\n');
console.log('='.repeat(70));

for (const [team, teamChanges] of Object.entries(changes)) {
  console.log(`\n🏈 ${team}:`);
  
  if (Object.keys(teamChanges.added).length > 0) {
    console.log('  ✅ ADDED:');
    for (const [pos, players] of Object.entries(teamChanges.added)) {
      console.log(`     ${pos}: ${players.join(', ')}`);
    }
  }
  
  if (Object.keys(teamChanges.removed).length > 0) {
    console.log('  ❌ REMOVED:');
    for (const [pos, players] of Object.entries(teamChanges.removed)) {
      console.log(`     ${pos}: ${players.join(', ')}`);
    }
  }
  
  if (Object.keys(teamChanges.moved).length > 0) {
    console.log('  🔄 DEPTH CHANGES:');
    for (const [pos, players] of Object.entries(teamChanges.moved)) {
      console.log(`     ${pos}: ${players.join(', ')}`);
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log(`\n📈 Total teams with changes: ${Object.keys(changes).length}/32`);

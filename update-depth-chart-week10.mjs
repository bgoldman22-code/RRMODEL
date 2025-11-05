import fs from 'fs';

const csvPath = '/Users/brentgoldman/Downloads/FantasyPros_Fantasy_Football_2025_Depth_Charts (11).csv';
const jsonPath = './public/history/2025/week10/depth-charts.json';

// Read CSV
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

const teams = [];
let currentTeam = null;
let inPlayerData = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Empty line or just quotes - reset state
  if (!line || line === '""') {
    if (currentTeam && currentTeam.QB.length > 0) {
      teams.push(currentTeam);
      currentTeam = null;
    }
    inPlayerData = false;
    continue;
  }
  
  // Team name line (single quoted string, no commas in header row)
  if (line.startsWith('"') && !line.includes(',') && line.length < 50) {
    currentTeam = {
      team: line.replace(/"/g, ''),
      QB: [],
      RB: [],
      WR: [],
      TE: []
    };
    inPlayerData = false;
    continue;
  }
  
  // ECR header row - skip
  if (line.includes('ECR') && line.includes('Quarterbacks')) {
    inPlayerData = true;
    continue;
  }
  
  // Player data rows
  if (currentTeam && inPlayerData && line.includes(',')) {
    const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
    
    // Parse 4 pairs: ECR,Name for QB, RB, WR, TE
    // Format: "ECR","QB Name","ECR","RB Name","ECR","WR Name","ECR","TE Name"
    if (parts[1] && parts[1] !== '' && !parts[1].match(/^\d+$/)) currentTeam.QB.push(parts[1]);
    if (parts[3] && parts[3] !== '' && !parts[3].match(/^\d+$/) && parts[3] !== '-') currentTeam.RB.push(parts[3]);
    if (parts[5] && parts[5] !== '' && !parts[5].match(/^\d+$/) && parts[5] !== '-') currentTeam.WR.push(parts[5]);
    if (parts[7] && parts[7] !== '' && !parts[7].match(/^\d+$/) && parts[7] !== '-') currentTeam.TE.push(parts[7]);
  }
}

// Add last team
if (currentTeam && currentTeam.QB.length > 0) {
  teams.push(currentTeam);
}

// Write JSON
fs.writeFileSync(jsonPath, JSON.stringify(teams, null, 2));

console.log(`✅ Updated ${teams.length} teams in ${jsonPath}`);
console.log('\nSample teams updated:');
teams.slice(0, 5).forEach(t => {
  console.log(`\n${t.team}:`);
  console.log(`  QB: ${t.QB.join(', ')}`);
  console.log(`  RB: ${t.RB.slice(0, 3).join(', ')}`);
  console.log(`  WR: ${t.WR.slice(0, 3).join(', ')}`);
  console.log(`  TE: ${t.TE.slice(0, 2).join(', ')}`);
});

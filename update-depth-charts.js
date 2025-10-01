// Script to update depth chart JSON from FantasyPros CSV data
// This will parse the CSV and update the existing depth chart structure

import fs from 'fs';
import path from 'path';

// Team name mapping from FantasyPros to our abbreviations
const teamNameMapping = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL", 
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Las Vegas Raiders": "LV",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS"
};

function parseFantasyProsCsv(csvData) {
  const lines = csvData.split('\n');
  const depthCharts = {};
  
  let currentTeam = null;
  let isHeaderRow = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line || line === '""') continue;
    
    // Check if this is a team name (wrapped in quotes)
    if (line.startsWith('"') && line.endsWith('"') && !line.includes(',')) {
      const teamName = line.replace(/"/g, '');
      currentTeam = teamNameMapping[teamName];
      
      if (currentTeam) {
        console.log(`Processing team: ${teamName} (${currentTeam})`);
        depthCharts[currentTeam] = {
          QB: [],
          RB: [],
          WR: [],
          TE: []
        };
        isHeaderRow = true; // Next line should be header
      }
      continue;
    }
    
    // Skip header rows
    if (isHeaderRow) {
      isHeaderRow = false;
      continue;
    }
    
    // Parse player data
    if (currentTeam && line.includes(',')) {
      const fields = line.split(',').map(field => field.replace(/"/g, '').trim());
      
      // Fields: ECR, QB, ECR, RB, ECR, WR, ECR, TE
      // Extract players from positions (skip ECR columns)
      const qb = fields[1];
      const rb = fields[3]; 
      const wr = fields[5];
      const te = fields[7];
      
      if (qb && qb !== '' && qb !== 'Quarterbacks') {
        depthCharts[currentTeam].QB.push(qb);
      }
      if (rb && rb !== '' && rb !== 'Running Backs') {
        depthCharts[currentTeam].RB.push(rb);
      }
      if (wr && wr !== '' && wr !== 'Wide Receivers') {
        depthCharts[currentTeam].WR.push(wr);
      }
      if (te && te !== '' && te !== 'Tight Ends') {
        depthCharts[currentTeam].TE.push(te);
      }
    }
  }
  
  return depthCharts;
}

function updateDepthCharts() {
  try {
    // Read the CSV data
    const csvPath = '/Users/brentgoldman/Downloads/FantasyPros_Fantasy_Football_2025_Depth_Charts (8).csv';
    const csvData = fs.readFileSync(csvPath, 'utf8');
    
    console.log('🔄 Parsing FantasyPros CSV data...');
    const newDepthCharts = parseFantasyProsCsv(csvData);
    
    // Read current depth chart
    const currentDepthChartPath = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/public/history/2025/week5/depth-charts.json';
    const currentDepthCharts = JSON.parse(fs.readFileSync(currentDepthChartPath, 'utf8'));
    
    console.log('📊 Comparing changes...');
    
    // Track changes
    const changes = {
      teamsUpdated: 0,
      playersAdded: 0,
      playersRemoved: 0,
      positionChanges: 0
    };
    
    // Update each team
    Object.keys(newDepthCharts).forEach(teamCode => {
      const newTeam = newDepthCharts[teamCode];
      const currentTeam = currentDepthCharts[teamCode] || { QB: [], RB: [], WR: [], TE: [] };
      
      let teamChanged = false;
      
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        const newPlayers = newTeam[position] || [];
        const currentPlayers = currentTeam[position] || [];
        
        // Check for changes
        if (JSON.stringify(newPlayers) !== JSON.stringify(currentPlayers)) {
          console.log(`\n${teamCode} ${position} changes:`);
          
          // Find added players
          const added = newPlayers.filter(p => !currentPlayers.includes(p));
          const removed = currentPlayers.filter(p => !newPlayers.includes(p));
          
          if (added.length > 0) {
            console.log(`  + Added: ${added.join(', ')}`);
            changes.playersAdded += added.length;
          }
          
          if (removed.length > 0) {
            console.log(`  - Removed: ${removed.join(', ')}`);
            changes.playersRemoved += removed.length;
          }
          
          // Check for position changes
          const orderChanged = newPlayers.length === currentPlayers.length && 
                              newPlayers.some((player, idx) => player !== currentPlayers[idx]);
          
          if (orderChanged) {
            console.log(`  ↕ Order changed: ${newPlayers.join(' → ')}`);
            changes.positionChanges++;
          }
          
          teamChanged = true;
        }
      });
      
      if (teamChanged) {
        changes.teamsUpdated++;
        // Update the current data with new data
        currentDepthCharts[teamCode] = newTeam;
      }
    });
    
    // Write updated depth chart
    const outputPath = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/public/history/2025/week5/depth-charts.json';
    fs.writeFileSync(outputPath, JSON.stringify(currentDepthCharts, null, 2));
    
    console.log('\n✅ Depth chart update complete!');
    console.log(`📊 Summary:`);
    console.log(`   Teams updated: ${changes.teamsUpdated}`);
    console.log(`   Players added: ${changes.playersAdded}`);
    console.log(`   Players removed: ${changes.playersRemoved}`);
    console.log(`   Position changes: ${changes.positionChanges}`);
    
    // Show most significant changes
    const significantChanges = [];
    Object.keys(newDepthCharts).forEach(teamCode => {
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        const newPlayers = newDepthCharts[teamCode][position] || [];
        const currentPlayers = currentDepthCharts[teamCode][position] || [];
        
        if (newPlayers.length !== currentPlayers.length) {
          significantChanges.push(`${teamCode} ${position}: ${currentPlayers.length} → ${newPlayers.length} players`);
        }
      });
    });
    
    if (significantChanges.length > 0) {
      console.log('\n🔄 Significant depth changes:');
      significantChanges.forEach(change => console.log(`   ${change}`));
    }
    
    console.log(`\n📁 Updated file: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error updating depth charts:', error);
  }
}

// Run the update
updateDepthCharts();
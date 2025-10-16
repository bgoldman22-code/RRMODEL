#!/usr/bin/env node
/**
 * Convert FantasyPros depth chart CSV to JSON format
 */

import fs from 'fs';

const csvPath = process.argv[2];
const outputPath = process.argv[3];

if (!csvPath || !outputPath) {
  console.error('Usage: node convert-depth-chart-csv.mjs <input.csv> <output.json>');
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf-8');
const lines = csv.split('\n').filter(l => l.trim());

const teams = [];
let currentTeam = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Remove quotes for parsing
  const cleanLine = line.replace(/^"|"$/g, '');
  
  // Check if this is a team name (no commas, just team name in quotes)
  if (line.startsWith('"') && !line.includes(',')) {
    // Save previous team
    if (currentTeam) {
      teams.push(currentTeam);
    }
    
    // Start new team
    currentTeam = {
      team: cleanLine,
      QB: [],
      RB: [],
      WR: [],
      TE: []
    };
  } 
  // Skip header rows
  else if (line.includes('Quarterbacks')) {
    continue;
  }
  // Parse player rows
  else if (currentTeam && line.includes(',')) {
    const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
    
    // Format: ECR, QB, ECR, RB, ECR, WR, ECR, TE
    // Columns: 0-1 (QB), 2-3 (RB), 4-5 (WR), 6-7 (TE)
    
    if (parts[1] && parts[1] !== '') {
      currentTeam.QB.push({
        rank: parts[0] || null,
        name: parts[1]
      });
    }
    
    if (parts[3] && parts[3] !== '') {
      currentTeam.RB.push({
        rank: parts[2] || null,
        name: parts[3]
      });
    }
    
    if (parts[5] && parts[5] !== '') {
      currentTeam.WR.push({
        rank: parts[4] || null,
        name: parts[5]
      });
    }
    
    if (parts[7] && parts[7] !== '') {
      currentTeam.TE.push({
        rank: parts[6] || null,
        name: parts[7]
      });
    }
  }
}

// Add last team
if (currentTeam) {
  teams.push(currentTeam);
}

// Write output
fs.writeFileSync(outputPath, JSON.stringify(teams, null, 2));
console.log(`✅ Converted ${teams.length} teams to ${outputPath}`);

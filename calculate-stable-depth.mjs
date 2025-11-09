#!/usr/bin/env node
// Calculate stable depth from historical depth charts
import fs from 'fs';
import path from 'path';

const HISTORY_PATH = './public/history/2025';
const WEEKS_TO_ANALYZE = ['week1', 'week2', 'week3', 'week4', 'week5', 'week6', 'week7', 'week8'];

// Calculate mode (most common value)
function mode(arr) {
  if (!arr || arr.length === 0) return null;
  const counts = {};
  arr.forEach(val => counts[val] = (counts[val] || 0) + 1);
  return parseInt(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
}

// Normalize player name from different formats
function getPlayerName(player) {
  if (typeof player === 'string') return player;
  if (player && player.name) return player.name;
  return null;
}

// Load depth chart for a specific week
function loadDepthChart(week) {
  try {
    const filePath = path.join(HISTORY_PATH, week, 'depth-charts.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

// Build player history across weeks
function buildPlayerHistory() {
  const playerHistory = {}; // {team_position_name: {weeks: [], depths: []}}
  
  WEEKS_TO_ANALYZE.forEach(week => {
    const depthChart = loadDepthChart(week);
    if (!depthChart || !Array.isArray(depthChart)) return;
    
    depthChart.forEach(teamData => {
      const team = teamData.team;
      
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        if (!teamData[position]) return;
        
        teamData[position].forEach((player, index) => {
          const playerName = getPlayerName(player);
          if (!playerName) return;
          
          const key = `${team}_${position}_${playerName}`;
          const depth = index + 1; // Convert array index to depth (1-indexed)
          
          if (!playerHistory[key]) {
            playerHistory[key] = {
              team,
              position,
              name: playerName,
              weeks: [],
              depths: []
            };
          }
          
          playerHistory[key].weeks.push(week);
          playerHistory[key].depths.push(depth);
        });
      });
    });
  });
  
  return playerHistory;
}

// Calculate stable depth for each player
function calculateStableDepths(playerHistory) {
  const results = [];
  
  Object.entries(playerHistory).forEach(([key, data]) => {
    // Get last 5 appearances
    const recentDepths = data.depths.slice(-5);
    const stableDepth = mode(recentDepths);
    const currentDepth = data.depths[data.depths.length - 1];
    
    // Flag if current depth differs from stable (potential injury impact issue)
    const isDifferent = currentDepth !== stableDepth;
    const depthChange = currentDepth - stableDepth;
    
    results.push({
      team: data.team,
      position: data.position,
      name: data.name,
      currentDepth,
      stableDepth,
      weeksTracked: data.weeks.length,
      depthHistory: data.depths.join(' -> '),
      flagged: isDifferent,
      depthChange
    });
  });
  
  return results.sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    return a.currentDepth - b.currentDepth;
  });
}

// Main execution
console.log('🔍 Analyzing historical depth charts (weeks 1-8)...\n');

const playerHistory = buildPlayerHistory();
const results = calculateStableDepths(playerHistory);

// Summary stats
const total = results.length;
const flagged = results.filter(r => r.flagged).length;
const movedDown = results.filter(r => r.depthChange > 0).length;
const movedUp = results.filter(r => r.depthChange < 0).length;

console.log(`📊 Summary:`);
console.log(`   Total Players Tracked: ${total}`);
console.log(`   Depth Changed from Stable: ${flagged}`);
console.log(`   - Moved Down (potential injury): ${movedDown}`);
console.log(`   - Moved Up (opportunity/promotion): ${movedUp}`);
console.log(`\n`);

// Show players who moved DOWN (these are the injury impact issues)
const movedDownPlayers = results.filter(r => r.depthChange > 0);
if (movedDownPlayers.length > 0) {
  console.log('🚨 MOVED DOWN (Potential Injury Impact Issues):');
  console.log('='.repeat(100));
  console.log('These players would have UNDERESTIMATED injury impacts in current system\n');
  
  movedDownPlayers.forEach(player => {
    console.log(`${player.team} ${player.position}: ${player.name}`);
    console.log(`   Current Depth: ${player.currentDepth} | Stable Depth: ${player.stableDepth} | Change: +${player.depthChange}`);
    console.log(`   History: ${player.depthHistory}`);
    console.log(`   ❌ V1 Impact: Uses depth ${player.currentDepth} (WRONG - underestimates)`);
    console.log(`   ✅ V2 Impact: Would use depth ${player.stableDepth} (CORRECT - true starter value)`);
    console.log('');
  });
} else {
  console.log('✅ No players moved down in Week 8 (no injury depth issues detected)');
  console.log('   This might mean:');
  console.log('   - No major injuries in Week 8');
  console.log('   - OR injured players not in depth charts yet');
  console.log('');
}

// Save to JSON
const output = {
  summary: { total, flagged, movedDown, movedUp },
  movedDownPlayers: movedDownPlayers,
  movedUpPlayers: results.filter(r => r.depthChange < 0),
  allPlayers: results
};

fs.writeFileSync('./stable-depth-analysis.json', JSON.stringify(output, null, 2));
console.log('✅ Full analysis saved to: stable-depth-analysis.json\n');


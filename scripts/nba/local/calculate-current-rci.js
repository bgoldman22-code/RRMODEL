#!/usr/bin/env node
/**
 * Calculate 2025-26 RCI using roster presence
 * 
 * Since the season just started, we compare:
 * - 2025-26 rosters (who's on the team now)
 * - 2024-25 stats (who played significant minutes last year)
 * 
 * This shows which teams lost key contributors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load 2024-25 player stats (previous season)
const prevSeasonFile = path.join(__dirname, '../../../data/nba/players/archive/player_seasons_2024_25.json');
const prevSeasonData = JSON.parse(fs.readFileSync(prevSeasonFile, 'utf8'));
const prevSeasonPlayers = prevSeasonData.players;

// Load 2025-26 rosters (current season)
const currentRosterFile = path.join(__dirname, '../../../data/nba/rosters/rosters_2025_26.json');
const currentRosterData = JSON.parse(fs.readFileSync(currentRosterFile, 'utf8'));
const currentRosters = currentRosterData.teams;

console.log('🏀 2025-26 RCI Calculator (Roster-Based)');
console.log('='.repeat(60));
console.log('Comparing:');
console.log('  - 2024-25 stats (who played significant minutes)');
console.log('  - 2025-26 rosters (who\'s on team now)');
console.log('='.repeat(60));

// Group last season's players by team
const lastSeasonByTeam = {};
for (const player of prevSeasonPlayers) {
  const team = player.team;
  if (!lastSeasonByTeam[team]) {
    lastSeasonByTeam[team] = [];
  }
  // Only include significant contributors (20+ games, 200+ minutes)
  if (player.games_played >= 20 && player.minutes_played >= 200) {
    lastSeasonByTeam[team].push(player);
  }
}

const results = [];

for (const [teamAbbr, teamData] of Object.entries(currentRosters)) {
  const currentRoster = new Set(teamData.roster.map(p => p.player));
  const prevPlayers = lastSeasonByTeam[teamAbbr] || [];
  
  if (prevPlayers.length === 0) {
    console.log(`\n⚠️  ${teamAbbr}: No previous season data`);
    continue;
  }
  
  // Calculate returning minutes
  const totalPrevMinutes = prevPlayers.reduce((sum, p) => sum + p.minutes_played, 0);
  let returningMinutes = 0;
  let returningPlayers = [];
  let lostPlayers = [];
  
  for (const prevPlayer of prevPlayers) {
    if (currentRoster.has(prevPlayer.player)) {
      returningMinutes += prevPlayer.minutes_played;
      returningPlayers.push(prevPlayer);
    } else {
      lostPlayers.push(prevPlayer);
    }
  }
  
  const rci = returningMinutes / totalPrevMinutes;
  
  results.push({
    team: teamData.team,
    abbreviation: teamAbbr,
    season: '2025-26',
    rci: Math.round(rci * 1000) / 1000,
    returning_minutes_pct: Math.round(rci * 1000) / 1000,
    returning_player_count: returningPlayers.length,
    total_previous_players: prevPlayers.length,
    lost_player_count: lostPlayers.length,
    returning_players: returningPlayers.map(p => ({
      player: p.player,
      minutes_2024_25: p.minutes_played,
      games_2024_25: p.games_played
    })),
    lost_players: lostPlayers.map(p => ({
      player: p.player,
      minutes_2024_25: p.minutes_played,
      games_2024_25: p.games_played
    }))
  });
}

// Sort by RCI (lowest first)
results.sort((a, b) => a.rci - b.rci);

console.log('\n📉 Teams with MOST roster turnover (lost key players):');
results.slice(0, 10).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.abbreviation}: RCI = ${r.rci.toFixed(3)} (lost ${r.lost_player_count}/${r.total_previous_players})`);
  if (i < 3) {
    console.log(`     Lost: ${r.lost_players.slice(0, 3).map(p => p.player).join(', ')}`);
  }
});

console.log('\n📈 Teams with LEAST roster turnover (kept core):');
results.slice(-10).reverse().forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.abbreviation}: RCI = ${r.rci.toFixed(3)} (kept ${r.returning_player_count}/${r.total_previous_players})`);
});

// Find Celtics specifically
const celtics = results.find(r => r.abbreviation === 'BOS');
if (celtics) {
  console.log('\n' + '='.repeat(60));
  console.log('🍀 BOSTON CELTICS DETAILED ANALYSIS');
  console.log('='.repeat(60));
  console.log(`RCI: ${celtics.rci.toFixed(3)} (${(celtics.rci * 100).toFixed(1)}% of last year's minutes returning)`);
  console.log(`\n✅ RETURNING (${celtics.returning_player_count}):`);
  celtics.returning_players
    .sort((a, b) => b.minutes_2024_25 - a.minutes_2024_25)
    .forEach(p => {
      console.log(`  - ${p.player.padEnd(25)} ${Math.round(p.minutes_2024_25).toString().padStart(5)} min, ${p.games_2024_25} games`);
    });
  
  console.log(`\n❌ LOST (${celtics.lost_player_count}):`);
  celtics.lost_players
    .sort((a, b) => b.minutes_2024_25 - a.minutes_2024_25)
    .forEach(p => {
      console.log(`  - ${p.player.padEnd(25)} ${Math.round(p.minutes_2024_25).toString().padStart(5)} min, ${p.games_2024_25} games`);
    });
}

// Save results
const outputFile = path.join(__dirname, '../../../data/nba/rosters/rci_2025_26.json');
fs.writeFileSync(outputFile, JSON.stringify({
  schema_version: 1,
  calculated_at: new Date().toISOString(),
  season: '2025-26',
  previous_season: '2024-25',
  formula: 'RCI = returning_minutes / total_previous_minutes (roster-based)',
  note: 'Based on roster presence in 2025-26 vs minutes played in 2024-25',
  teams: results
}, null, 2));

console.log('\n' + '='.repeat(60));
console.log(`📁 Saved: ${outputFile}`);
console.log('💡 This RCI data should be integrated into your prediction model!');

/**
 * Roster Continuity Index (RCI) Calculator
 * 
 * Calculates roster continuity between consecutive seasons using:
 * RCI = 0.6 * (returning_minutes_pct) + 0.4 * (returning_BPM_pct)
 * 
 * Purpose: Adjusts team performance expectations based on roster turnover
 * Example: 2024 Celtics lost key players → Low RCI → Downward adjustment
 * 
 * Input Files:
 * - data/nba/players/archive/player_seasons_combined.json
 * - data/nba/aggregates/archive/team_seasons_combined.json
 * 
 * Output Files:
 * - data/nba/rosters/archive/rosters_with_rci_YYYY_YY.json (per season)
 * - data/nba/rosters/archive/rosters_with_rci_combined.json (all seasons)
 * 
 * Usage: node scripts/nba/local/build-rosters-with-rci.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Seasons to calculate RCI for (needs previous season data)
const SEASONS = [
  { current: '2022-23', previous: '2021-22' },
  { current: '2023-24', previous: '2022-23' },
  { current: '2024-25', previous: '2023-24' },
  { current: '2025-26', previous: '2024-25' }
];

// Minimum playing time to count as "significant" player
const MIN_GAMES_PLAYED = 20;
const MIN_TOTAL_MINUTES = 200;

/**
 * Loads player data from combined archive
 */
function loadPlayerData() {
  const filePath = path.join(
    __dirname,
    '../../../data/nba/players/archive/player_seasons_combined.json'
  );
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Player data not found: ${filePath}\nRun scrape-players-historical.js first`);
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`✅ Loaded ${data.players.length} player-seasons`);
  
  return data.players;
}

/**
 * Loads team data from combined archive
 */
function loadTeamData() {
  const filePath = path.join(
    __dirname,
    '../../../data/nba/aggregates/archive/team_seasons_combined.json'
  );
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Team data not found: ${filePath}\nRun scrape-teams-historical.js first`);
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`✅ Loaded ${data.teams.length} team-seasons`);
  
  return data.teams;
}

/**
 * Filters players to significant contributors only
 */
function getSignificantPlayers(players, season) {
  return players.filter(p => 
    p.season === season &&
    p.games_played >= MIN_GAMES_PLAYED &&
    p.minutes_played >= MIN_TOTAL_MINUTES
    // Note: BPM not required - we'll use minutes-based RCI if BPM unavailable
  );
}

/**
 * Groups players by team and season
 */
function groupPlayersByTeam(players) {
  const grouped = {};
  
  for (const player of players) {
    const key = `${player.team}|${player.season}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(player);
  }
  
  return grouped;
}

/**
 * Calculates Roster Continuity Index for a team
 * 
 * Formula: RCI = 0.6 * (returning_minutes_pct) + 0.4 * (returning_BPM_impact_pct)
 * 
 * Where:
 * - returning_minutes_pct = sum(returning player minutes) / sum(previous season minutes)
 * - returning_BPM_impact_pct = sum(returning player BPM * minutes) / sum(previous season BPM * minutes)
 */
function calculateRCI(currentPlayers, previousPlayers) {
  if (!previousPlayers || previousPlayers.length === 0) {
    return {
      rci: null,
      returning_minutes_pct: null,
      returning_bpm_impact_pct: null,
      reason: 'No previous season data'
    };
  }
  
  // Calculate previous season totals
  const prevTotalMinutes = previousPlayers.reduce((sum, p) => sum + (p.minutes_played || 0), 0);
  const prevTotalBPMImpact = previousPlayers.reduce((sum, p) => 
    sum + ((p.bpm || 0) * (p.minutes_played || 0)), 0
  );
  
  if (prevTotalMinutes === 0) {
    return {
      rci: null,
      returning_minutes_pct: null,
      returning_bpm_impact_pct: null,
      reason: 'Zero previous season minutes'
    };
  }
  
  // Find returning players (match by player name)
  const prevPlayerNames = new Set(previousPlayers.map(p => p.player));
  const returningPlayers = currentPlayers.filter(p => prevPlayerNames.has(p.player));
  
  // Calculate returning player contributions from PREVIOUS season stats
  let returningMinutes = 0;
  let returningBPMImpact = 0;
  
  for (const currentPlayer of returningPlayers) {
    // Find this player's PREVIOUS season stats
    const prevStats = previousPlayers.find(p => p.player === currentPlayer.player);
    if (prevStats) {
      returningMinutes += prevStats.minutes_played || 0;
      returningBPMImpact += (prevStats.bpm || 0) * (prevStats.minutes_played || 0);
    }
  }
  
  // Calculate percentages
  const returningMinutesPct = returningMinutes / prevTotalMinutes;
  const returningBPMImpactPct = prevTotalBPMImpact !== 0 
    ? returningBPMImpact / prevTotalBPMImpact 
    : null;
  
  // Calculate RCI
  // If BPM data available: weighted 60% minutes, 40% BPM impact
  // If BPM data unavailable: 100% minutes-based
  let rci;
  if (returningBPMImpactPct !== null && !isNaN(returningBPMImpactPct)) {
    rci = (0.6 * returningMinutesPct) + (0.4 * returningBPMImpactPct);
  } else {
    rci = returningMinutesPct; // Fallback to minutes-only
  }
  
  return {
    rci: Math.round(rci * 1000) / 1000, // Round to 3 decimals
    returning_minutes_pct: Math.round(returningMinutesPct * 1000) / 1000,
    returning_bpm_impact_pct: returningBPMImpactPct !== null ? Math.round(returningBPMImpactPct * 1000) / 1000 : null,
    returning_player_count: returningPlayers.length,
    total_previous_players: previousPlayers.length,
    new_player_count: currentPlayers.length - returningPlayers.length
  };
}

/**
 * Builds roster data with RCI for a single season pair
 */
function buildSeasonRosters(playersByTeam, currentSeason, previousSeason) {
  console.log(`\n📊 Building rosters for ${currentSeason.current}`);
  
  const rosters = [];
  const teams = new Set();
  
  // Extract unique teams from current season
  for (const key of Object.keys(playersByTeam)) {
    const [team, season] = key.split('|');
    if (season === currentSeason.current) {
      teams.add(team);
    }
  }
  
  console.log(`  🏀 Found ${teams.size} teams`);
  
  for (const team of teams) {
    const currentKey = `${team}|${currentSeason.current}`;
    const previousKey = `${team}|${currentSeason.previous}`;
    
    const currentPlayers = playersByTeam[currentKey] || [];
    const previousPlayers = playersByTeam[previousKey] || [];
    
    const rciData = calculateRCI(currentPlayers, previousPlayers);
    
    rosters.push({
      team,
      season: currentSeason.current,
      ...rciData,
      roster: currentPlayers.map(p => ({
        player: p.player,
        minutes_played: p.minutes_played,
        games_played: p.games_played,
        bpm: p.bpm,
        vorp: p.vorp,
        is_returning: previousPlayers.some(prev => prev.player === p.player)
      }))
    });
  }
  
  // Sort by RCI (lowest first = most roster turnover)
  rosters.sort((a, b) => (a.rci || 0) - (b.rci || 0));
  
  // Show top 5 teams with most turnover
  console.log(`\n  📉 Teams with MOST roster turnover (lowest RCI):`);
  rosters.slice(0, 5).forEach((r, i) => {
    console.log(`    ${i + 1}. ${r.team}: RCI = ${r.rci?.toFixed(3) || 'N/A'} (${r.returning_player_count}/${r.total_previous_players} returning)`);
  });
  
  // Show top 5 teams with least turnover
  console.log(`\n  📈 Teams with LEAST roster turnover (highest RCI):`);
  rosters.slice(-5).reverse().forEach((r, i) => {
    console.log(`    ${i + 1}. ${r.team}: RCI = ${r.rci?.toFixed(3) || 'N/A'} (${r.returning_player_count}/${r.total_previous_players} returning)`);
  });
  
  return rosters;
}

/**
 * Main orchestrator
 */
async function buildAllRosters() {
  console.log('🏀 NBA Roster Continuity Index (RCI) Calculator');
  console.log('=' .repeat(60));
  console.log('Formula: RCI = 0.6 * (returning_minutes_pct) + 0.4 * (returning_BPM_impact_pct)');
  console.log('=' .repeat(60));
  
  // Load data
  console.log('\n📂 Loading data...');
  const players = loadPlayerData();
  const teams = loadTeamData();
  
  // Filter to significant players only
  const significantPlayers = players.filter(p => 
    p.games_played >= MIN_GAMES_PLAYED &&
    p.minutes_played >= MIN_TOTAL_MINUTES
    // Note: BPM not required since NBA API doesn't provide it
  );
  console.log(`✅ Filtered to ${significantPlayers.length} significant players`);
  
  // Group by team and season
  const playersByTeam = groupPlayersByTeam(significantPlayers);
  
  // Calculate RCI for each season
  const allRosters = [];
  
  for (const season of SEASONS) {
    const rosters = buildSeasonRosters(playersByTeam, season);
    allRosters.push(...rosters);
    
    // Save individual season file
    const seasonFile = path.join(
      __dirname,
      '../../../data/nba/rosters/archive',
      `rosters_with_rci_${season.current.replace('-', '_')}.json`
    );
    
    fs.mkdirSync(path.dirname(seasonFile), { recursive: true });
    fs.writeFileSync(seasonFile, JSON.stringify({
      schema_version: 1,
      calculated_at: new Date().toISOString(),
      season: season.current,
      previous_season: season.previous,
      team_count: rosters.length,
      formula: 'RCI = 0.6 * (returning_minutes_pct) + 0.4 * (returning_BPM_impact_pct)',
      min_games_played: MIN_GAMES_PLAYED,
      min_total_minutes: MIN_TOTAL_MINUTES,
      rosters
    }, null, 2));
    
    console.log(`\n  💾 Saved: ${seasonFile}`);
  }
  
  // Save combined archive
  const combinedFile = path.join(
    __dirname,
    '../../../data/nba/rosters/archive',
    'rosters_with_rci_combined.json'
  );
  
  fs.writeFileSync(combinedFile, JSON.stringify({
    schema_version: 1,
    calculated_at: new Date().toISOString(),
    seasons: SEASONS.map(s => s.current),
    total_team_seasons: allRosters.length,
    formula: 'RCI = 0.6 * (returning_minutes_pct) + 0.4 * (returning_BPM_impact_pct)',
    min_games_played: MIN_GAMES_PLAYED,
    min_total_minutes: MIN_TOTAL_MINUTES,
    rosters: allRosters
  }, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ RCI CALCULATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`📁 Combined file: ${combinedFile}`);
  console.log(`📊 Total team-seasons: ${allRosters.length}`);
  console.log(`🏀 Average teams per season: ${Math.round(allRosters.length / SEASONS.length)}`);
  
  // Calculate overall statistics
  const validRCIs = allRosters.filter(r => r.rci !== null).map(r => r.rci);
  const avgRCI = validRCIs.reduce((sum, rci) => sum + rci, 0) / validRCIs.length;
  const minRCI = Math.min(...validRCIs);
  const maxRCI = Math.max(...validRCIs);
  
  console.log(`\n📈 RCI Statistics:`);
  console.log(`  Average: ${avgRCI.toFixed(3)}`);
  console.log(`  Range: ${minRCI.toFixed(3)} - ${maxRCI.toFixed(3)}`);
  console.log(`  Valid entries: ${validRCIs.length}/${allRosters.length}`);
  
  console.log('\n💡 Next steps:');
  console.log('  1. Validate data: node scripts/nba/local/validate-data.js');
  console.log('  2. Review rosters: cat data/nba/rosters/archive/rosters_with_rci_2024_25.json | grep -A 5 "Celtics"');
  console.log('  3. Commit to GitHub');
  console.log('  4. Integrate RCI into prediction model');
}

// Run calculator
buildAllRosters().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

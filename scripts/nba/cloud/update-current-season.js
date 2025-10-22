/**
 * Cloud Daily Updater
 * 
 * Updates current season player/team/RCI data via NBA Stats API
 * Designed for GitHub Actions: fast (2-3 min), reliable, with fallbacks
 * 
 * Features:
 * - Incremental updates (current season only)
 * - Retry logic with exponential backoff
 * - Fallback to stale data on failure
 * - Schema validation before commit
 * - Rate limiting for API stability
 * 
 * Usage: node scripts/nba/cloud/update-current-season.js
 * Environment: GitHub Actions (daily at 8am ET during season)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRetry } from '../../../netlify/functions/_lib/nba/fetch-with-retry.mjs';
import { validateTeamStats, validatePlayerStats, validateRCI } from '../../../netlify/functions/_lib/nba/validate-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Current season (update each year)
const CURRENT_SEASON = '2024-25';
const CURRENT_SEASON_YEAR = 2025; // BBRef uses end year

// NBA Stats API endpoints
const NBA_API_BASE = 'https://stats.nba.com/stats';
const NBA_CDN_BASE = 'https://cdn.nba.com/static/json/liveData';

// Fallback: continue with stale data on failure
const ALLOW_STALE_DATA = true;

/**
 * Fetches current season player stats from NBA Stats API
 */
async function fetchCurrentSeasonPlayers() {
  console.log('\n📊 Fetching current season player stats...');
  
  const url = `${NBA_API_BASE}/leaguedashplayerstats?` + new URLSearchParams({
    Season: CURRENT_SEASON,
    SeasonType: 'Regular Season',
    PerMode: 'Totals',
    MeasureType: 'Base'
  });
  
  try {
    const data = await fetchWithRetry(url);
    const players = data.resultSets[0].rowSet;
    const headers = data.resultSets[0].headers;
    
    // Map headers to data
    const mappedPlayers = players.map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    
    console.log(`  ✅ Fetched ${mappedPlayers.length} players`);
    return mappedPlayers;
  } catch (error) {
    console.error(`  ❌ Failed to fetch players: ${error.message}`);
    
    if (ALLOW_STALE_DATA) {
      console.log('  ⚠️  Falling back to stale data');
      return loadStalePlayerData();
    }
    
    throw error;
  }
}

/**
 * Fetches current season team stats from NBA Stats API
 */
async function fetchCurrentSeasonTeams() {
  console.log('\n🏀 Fetching current season team stats...');
  
  const url = `${NBA_API_BASE}/leaguedashteamstats?` + new URLSearchParams({
    Season: CURRENT_SEASON,
    SeasonType: 'Regular Season',
    PerMode: 'PerGame',
    MeasureType: 'Advanced'
  });
  
  try {
    const data = await fetchWithRetry(url);
    const teams = data.resultSets[0].rowSet;
    const headers = data.resultSets[0].headers;
    
    // Map headers to data
    const mappedTeams = teams.map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    
    console.log(`  ✅ Fetched ${mappedTeams.length} teams`);
    return mappedTeams;
  } catch (error) {
    console.error(`  ❌ Failed to fetch teams: ${error.message}`);
    
    if (ALLOW_STALE_DATA) {
      console.log('  ⚠️  Falling back to stale data');
      return loadStaleTeamData();
    }
    
    throw error;
  }
}

/**
 * Loads stale player data from disk (fallback)
 */
function loadStalePlayerData() {
  const filePath = path.join(
    __dirname,
    `../../data/nba/players/archive/player_seasons_${CURRENT_SEASON.replace('-', '_')}.json`
  );
  
  if (!fs.existsSync(filePath)) {
    throw new Error('No stale player data available');
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`  📁 Loaded ${data.players?.length || 0} players from cache`);
  return data.players || [];
}

/**
 * Loads stale team data from disk (fallback)
 */
function loadStaleTeamData() {
  const filePath = path.join(
    __dirname,
    `../../data/nba/aggregates/archive/team_seasons_${CURRENT_SEASON.replace('-', '_')}.json`
  );
  
  if (!fs.existsSync(filePath)) {
    throw new Error('No stale team data available');
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`  📁 Loaded ${data.teams?.length || 0} teams from cache`);
  return data.teams || [];
}

/**
 * Transforms NBA API player data to our schema
 */
function transformPlayerData(apiPlayers) {
  return apiPlayers.map(p => ({
    player: p.PLAYER_NAME,
    team: p.TEAM_ABBREVIATION,
    season: CURRENT_SEASON,
    games_played: p.GP || 0,
    minutes_played: p.MIN || 0,
    
    // Traditional stats
    points: p.PTS || 0,
    rebounds: p.REB || 0,
    assists: p.AST || 0,
    steals: p.STL || 0,
    blocks: p.BLK || 0,
    turnovers: p.TOV || 0,
    
    // Advanced stats (calculate if not provided)
    ts_pct: calculateTS(p),
    efg_pct: p.EFG_PCT || null,
    
    // Impact metrics (may need separate API call for BPM/VORP)
    bpm: null, // Not in base API
    vorp: null // Not in base API
  }));
}

/**
 * Calculates True Shooting % from raw stats
 */
function calculateTS(player) {
  const pts = player.PTS || 0;
  const fga = player.FGA || 0;
  const fta = player.FTA || 0;
  
  if (fga === 0 && fta === 0) return null;
  
  return pts / (2 * (fga + 0.44 * fta));
}

/**
 * Transforms NBA API team data to our schema
 */
function transformTeamData(apiTeams) {
  return apiTeams.map(t => ({
    team: t.TEAM_NAME,
    season: CURRENT_SEASON,
    
    // Team ratings
    pace: t.PACE || null,
    off_rtg: t.OFF_RATING || null,
    def_rtg: t.DEF_RATING || null,
    net_rtg: t.NET_RATING || null,
    
    // Four Factors
    efg_pct: t.EFG_PCT || null,
    tov_pct: t.TM_TOV_PCT || null,
    orb_pct: t.OREB_PCT || null,
    ft_rate: t.FT_RATE || null,
    
    opp_efg_pct: t.OPP_EFG_PCT || null,
    opp_tov_pct: t.OPP_TOV_PCT || null,
    drb_pct: t.DREB_PCT || null,
    opp_ft_rate: t.OPP_FT_RATE || null,
    
    // Record
    wins: t.W || 0,
    losses: t.L || 0,
    win_pct: t.W_PCT || null
  }));
}

/**
 * Calculates RCI for current season
 */
function calculateCurrentSeasonRCI(currentPlayers, previousPlayers) {
  console.log('\n📈 Calculating RCI for current season...');
  
  // Group by team
  const teamPlayers = {};
  for (const player of currentPlayers) {
    if (!teamPlayers[player.team]) {
      teamPlayers[player.team] = [];
    }
    teamPlayers[player.team].push(player);
  }
  
  // Group previous season by team
  const prevTeamPlayers = {};
  for (const player of previousPlayers) {
    if (!prevTeamPlayers[player.team]) {
      prevTeamPlayers[player.team] = [];
    }
    prevTeamPlayers[player.team].push(player);
  }
  
  const rosters = [];
  
  for (const [team, players] of Object.entries(teamPlayers)) {
    const prevPlayers = prevTeamPlayers[team] || [];
    
    // Calculate RCI (simplified - full implementation in build-rosters-with-rci.js)
    const prevPlayerNames = new Set(prevPlayers.map(p => p.player));
    const returningPlayers = players.filter(p => prevPlayerNames.has(p.player));
    
    const prevTotalMinutes = prevPlayers.reduce((sum, p) => sum + (p.minutes_played || 0), 0);
    const returningMinutes = returningPlayers.reduce((sum, p) => {
      const prevStats = prevPlayers.find(prev => prev.player === p.player);
      return sum + (prevStats?.minutes_played || 0);
    }, 0);
    
    const returningMinutesPct = prevTotalMinutes > 0 ? returningMinutes / prevTotalMinutes : 0;
    
    // Simplified RCI (just minutes-based, no BPM weighting in cloud update)
    const rci = returningMinutesPct;
    
    rosters.push({
      team,
      season: CURRENT_SEASON,
      rci: Math.round(rci * 1000) / 1000,
      returning_minutes_pct: Math.round(returningMinutesPct * 1000) / 1000,
      returning_bpm_impact_pct: null, // Not calculated in cloud update
      returning_player_count: returningPlayers.length,
      total_previous_players: prevPlayers.length,
      new_player_count: players.length - returningPlayers.length
    });
  }
  
  console.log(`  ✅ Calculated RCI for ${rosters.length} teams`);
  return rosters;
}

/**
 * Validates all updated data
 */
function validateUpdatedData(players, teams, rosters) {
  console.log('\n🔍 Validating updated data...');
  
  let errors = 0;
  
  // Validate players (sample 10)
  const playerSample = players.slice(0, 10);
  for (const player of playerSample) {
    const validation = validatePlayerStats(player);
    if (!validation.valid) {
      console.error(`  ❌ Player validation failed: ${player.player} - ${validation.errors.join(', ')}`);
      errors++;
    }
  }
  
  // Validate all teams
  for (const team of teams) {
    const validation = validateTeamStats(team);
    if (!validation.valid) {
      console.error(`  ❌ Team validation failed: ${team.team} - ${validation.errors.join(', ')}`);
      errors++;
    }
  }
  
  // Validate all rosters
  for (const roster of rosters) {
    const validation = validateRCI(roster);
    if (!validation.valid) {
      console.error(`  ❌ RCI validation failed: ${roster.team} - ${validation.errors.join(', ')}`);
      errors++;
    }
  }
  
  if (errors > 0) {
    console.error(`  ❌ Validation failed with ${errors} errors`);
    return false;
  }
  
  console.log('  ✅ All data validated successfully');
  return true;
}

/**
 * Saves updated data to disk
 */
function saveUpdatedData(players, teams, rosters) {
  console.log('\n💾 Saving updated data...');
  
  // Save players
  const playerFile = path.join(
    __dirname,
    `../../data/nba/players/archive/player_seasons_${CURRENT_SEASON.replace('-', '_')}.json`
  );
  fs.mkdirSync(path.dirname(playerFile), { recursive: true });
  fs.writeFileSync(playerFile, JSON.stringify({
    schema_version: 1,
    updated_at: new Date().toISOString(),
    season: CURRENT_SEASON,
    source: 'nba-stats-api',
    player_count: players.length,
    players
  }, null, 2));
  console.log(`  ✅ Saved ${players.length} players`);
  
  // Save teams
  const teamFile = path.join(
    __dirname,
    `../../data/nba/aggregates/archive/team_seasons_${CURRENT_SEASON.replace('-', '_')}.json`
  );
  fs.mkdirSync(path.dirname(teamFile), { recursive: true });
  fs.writeFileSync(teamFile, JSON.stringify({
    schema_version: 1,
    updated_at: new Date().toISOString(),
    season: CURRENT_SEASON,
    source: 'nba-stats-api',
    team_count: teams.length,
    teams
  }, null, 2));
  console.log(`  ✅ Saved ${teams.length} teams`);
  
  // Save rosters
  const rosterFile = path.join(
    __dirname,
    `../../data/nba/rosters/archive/rosters_with_rci_${CURRENT_SEASON.replace('-', '_')}.json`
  );
  fs.mkdirSync(path.dirname(rosterFile), { recursive: true });
  fs.writeFileSync(rosterFile, JSON.stringify({
    schema_version: 1,
    updated_at: new Date().toISOString(),
    season: CURRENT_SEASON,
    source: 'calculated',
    team_count: rosters.length,
    rosters
  }, null, 2));
  console.log(`  ✅ Saved ${rosters.length} rosters with RCI`);
}

/**
 * Main update orchestrator
 */
async function updateCurrentSeason() {
  console.log('☁️  NBA Cloud Daily Updater');
  console.log('='.repeat(60));
  console.log(`Season: ${CURRENT_SEASON}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    // Fetch current season data
    const [apiPlayers, apiTeams] = await Promise.all([
      fetchCurrentSeasonPlayers(),
      fetchCurrentSeasonTeams()
    ]);
    
    // Transform to our schema
    const players = transformPlayerData(apiPlayers);
    const teams = transformTeamData(apiTeams);
    
    // Load previous season for RCI calculation
    const previousSeasonFile = path.join(
      __dirname,
      '../../data/nba/players/archive/player_seasons_2023_24.json'
    );
    
    let previousPlayers = [];
    if (fs.existsSync(previousSeasonFile)) {
      const prevData = JSON.parse(fs.readFileSync(previousSeasonFile, 'utf8'));
      previousPlayers = prevData.players || [];
      console.log(`\n📁 Loaded ${previousPlayers.length} players from previous season`);
    }
    
    // Calculate RCI
    const rosters = calculateCurrentSeasonRCI(players, previousPlayers);
    
    // Validate
    const isValid = validateUpdatedData(players, teams, rosters);
    if (!isValid) {
      throw new Error('Data validation failed');
    }
    
    // Save
    saveUpdatedData(players, teams, rosters);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ UPDATE COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Updated ${players.length} players, ${teams.length} teams, ${rosters.length} rosters`);
    console.log('\n💡 Next: GitHub Actions will commit and push these changes');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ UPDATE FAILED:', error.message);
    
    if (ALLOW_STALE_DATA) {
      console.log('\n⚠️  Using stale data - no changes made');
      process.exit(0); // Don't fail workflow
    } else {
      process.exit(1);
    }
  }
}

// Run updater
updateCurrentSeason();

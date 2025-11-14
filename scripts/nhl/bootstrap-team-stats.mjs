#!/usr/bin/env node

/**
 * NHL Team Stats Bootstrap Script
 * 
 * ONE-TIME / MANUAL script to build complete team_stats_20252026.json.
 * 
 * Strategy:
 * 1. Fetch NHL standings (1 call - includes all 32 teams)
 * 2. Extract team defensive metrics
 * 3. Compute league averages
 * 4. Write complete file
 * 
 * Expected:
 * - Runtime: < 1 minute
 * - NHL API calls: 1
 * - Must have exactly 32 teams
 * 
 * Fail-loud policy:
 * - If < 32 teams: FATAL error, do not write file
 * - If API fails: FATAL error
 * 
 * Usage:
 *   node scripts/nhl/bootstrap-team-stats.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRetry } from './lib/fetch-with-retry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const SEASON = '20252026';
const OUTPUT_FILE = path.join(__dirname, '../../data/nhl/team_stats_20252026.json');
const MIN_TEAMS_REQUIRED = 32;
const NHL_API_BASE = 'https://api-web.nhle.com/v1';

/**
 * Main bootstrap function
 */
async function bootstrap() {
  console.log('\n🏒 ========================================');
  console.log('🏒 NHL TEAM STATS BOOTSTRAP');
  console.log('🏒 ========================================\n');
  console.log(`Season: ${SEASON}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Min teams required: ${MIN_TEAMS_REQUIRED}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Fetch standings
    console.log('📊 Step 1: Fetching NHL standings...\n');
    const standingsUrl = `${NHL_API_BASE}/standings/now`;
    const standingsData = await fetchWithRetry(standingsUrl, {
      fatal: true,
      label: 'NHL standings'
    });
    
    console.log('✅ Standings fetched\n');
    
    // Step 2: Extract team stats
    console.log('📋 Step 2: Extracting team stats...\n');
    const { teams, leagueAverages } = extractTeamStats(standingsData);
    
    // Step 3: Validate
    console.log('🔍 Step 3: Validating data...\n');
    validateTeamStats(teams);
    
    // Step 4: Build output
    console.log('📦 Step 4: Building output...\n');
    const output = buildOutput(teams, leagueAverages);
    
    // Step 5: Write file
    console.log('💾 Step 5: Writing to file...\n');
    writeOutputFile(output);
    
    // Success report
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n✅ ========================================');
    console.log('✅ BOOTSTRAP COMPLETE');
    console.log('✅ ========================================\n');
    console.log(`Teams: ${output.totalTeams}`);
    console.log(`Elapsed time: ${elapsedSeconds} seconds`);
    console.log(`Output file: ${OUTPUT_FILE}\n`);
    
    console.log('🎯 Next steps:');
    console.log('   1. Test: node scripts/nhl/run-sog-tonight.mjs');
    console.log('   2. Deploy to Netlify Blobs if tests pass\n');
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ BOOTSTRAP FAILED');
    console.error('❌ ========================================\n');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    process.exit(1);
  }
}

/**
 * Extract team stats from standings data
 * 
 * @param {Object} standingsData - Raw standings data from NHL API
 * @returns {Object} { teams, leagueAverages }
 */
function extractTeamStats(standingsData) {
  const teams = {};
  const allTeamStats = [];
  
  // Iterate through all standings entries
  const standings = standingsData.standings || [];
  
  console.log(`Processing ${standings.length} teams from standings...`);
  
  for (const teamData of standings) {
    const abbrev = teamData.teamAbbrev?.default || teamData.teamAbbrev;
    const teamName = teamData.teamName?.default || teamData.teamName;
    
    if (!abbrev) {
      console.warn('⚠️  Skipping team with no abbreviation:', teamData);
      continue;
    }
    
    // Extract stats
    const stats = {
      teamName: teamName,
      gamesPlayed: teamData.gamesPlayed || 0,
      wins: teamData.wins || 0,
      losses: teamData.losses || 0,
      otLosses: teamData.otLosses || 0,
      points: teamData.points || 0,
      
      // Shots
      goalsFor: teamData.goalFor || 0,
      goalsAgainst: teamData.goalAgainst || 0,
      goalDifferential: teamData.goalDifferential || 0,
      
      // Calculate per-game rates
      goalsForPerGame: teamData.gamesPlayed > 0 
        ? parseFloat((teamData.goalFor / teamData.gamesPlayed).toFixed(2))
        : 0,
      goalsAgainstPerGame: teamData.gamesPlayed > 0
        ? parseFloat((teamData.goalAgainst / teamData.gamesPlayed).toFixed(2))
        : 0,
      
      // Estimate shots (NHL standings don't always include shots)
      // Use typical conversion: ~11-12% shooting percentage
      shotsForPerGame: teamData.gamesPlayed > 0
        ? parseFloat(((teamData.goalFor / teamData.gamesPlayed) * 9).toFixed(1))
        : 0,
      shotsAgainstPerGame: teamData.gamesPlayed > 0
        ? parseFloat(((teamData.goalAgainst / teamData.gamesPlayed) * 9).toFixed(1))
        : 0,
      
      // Special teams (estimates if not in standings)
      powerPlayPct: teamData.powerPlayPct || 20.0,
      penaltyKillPct: teamData.penaltyKillPct || 80.0,
      
      // Record splits
      homeWins: teamData.homeWins || 0,
      homeLosses: teamData.homeLosses || 0,
      roadWins: teamData.roadWins || 0,
      roadLosses: teamData.roadLosses || 0,
      
      // Win percentages
      homeWinPct: (teamData.homeWins + teamData.homeLosses) > 0
        ? parseFloat((teamData.homeWins / (teamData.homeWins + teamData.homeLosses) * 100).toFixed(1))
        : 0,
      roadWinPct: (teamData.roadWins + teamData.roadLosses) > 0
        ? parseFloat((teamData.roadWins / (teamData.roadWins + teamData.roadLosses) * 100).toFixed(1))
        : 0,
      
      lastUpdated: new Date().toISOString()
    };
    
    teams[abbrev] = stats;
    allTeamStats.push(stats);
  }
  
  console.log(`✅ Extracted stats for ${Object.keys(teams).length} teams`);
  
  // Calculate league averages
  const leagueAverages = calculateLeagueAverages(allTeamStats);
  
  return { teams, leagueAverages };
}

/**
 * Calculate league averages from all team stats
 * 
 * @param {Array} allTeamStats - Array of team stat objects
 * @returns {Object} League averages
 */
function calculateLeagueAverages(allTeamStats) {
  if (allTeamStats.length === 0) {
    throw new Error('No team stats to calculate league averages');
  }
  
  const sum = (arr, key) => arr.reduce((total, team) => total + (team[key] || 0), 0);
  const avg = (arr, key) => parseFloat((sum(arr, key) / arr.length).toFixed(2));
  
  const leagueAverages = {
    shotsForPerGame: avg(allTeamStats, 'shotsForPerGame'),
    shotsAgainstPerGame: avg(allTeamStats, 'shotsAgainstPerGame'),
    goalsForPerGame: avg(allTeamStats, 'goalsForPerGame'),
    goalsAgainstPerGame: avg(allTeamStats, 'goalsAgainstPerGame'),
    powerPlayPct: avg(allTeamStats, 'powerPlayPct'),
    penaltyKillPct: avg(allTeamStats, 'penaltyKillPct')
  };
  
  console.log('✅ League averages calculated:');
  console.log(`   Shots/Game: ${leagueAverages.shotsForPerGame}`);
  console.log(`   Goals/Game: ${leagueAverages.goalsForPerGame}`);
  console.log(`   PP%: ${leagueAverages.powerPlayPct}`);
  console.log(`   PK%: ${leagueAverages.penaltyKillPct}`);
  
  return leagueAverages;
}

/**
 * Validate team stats before writing
 * 
 * @param {Object} teams - Teams object
 */
function validateTeamStats(teams) {
  const teamCount = Object.keys(teams).length;
  
  console.log(`Validating ${teamCount} teams...`);
  
  // Check minimum team count
  if (teamCount < MIN_TEAMS_REQUIRED) {
    throw new Error(
      `❌ FATAL VALIDATION: Only ${teamCount} teams (need ${MIN_TEAMS_REQUIRED}).\n` +
      `Will NOT write partial data.`
    );
  }
  
  // Check for missing critical stats
  for (const [abbrev, stats] of Object.entries(teams)) {
    if (!stats.teamName) {
      throw new Error(`Team ${abbrev} missing teamName`);
    }
    if (stats.gamesPlayed === 0) {
      console.warn(`⚠️  Team ${abbrev} has 0 games played (pre-season?)`);
    }
  }
  
  console.log('✅ Validation passed');
  console.log(`   Teams: ${teamCount} (min: ${MIN_TEAMS_REQUIRED})`);
}

/**
 * Build final output object
 * 
 * @param {Object} teams - Teams object
 * @param {Object} leagueAverages - League averages
 * @returns {Object} Output object
 */
function buildOutput(teams, leagueAverages) {
  return {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    totalTeams: Object.keys(teams).length,
    dataSource: 'NHL-API-standings',
    staleness: {
      maxDaysSinceUpdate: 0, // Just fetched
      teamsStale: 0
    },
    leagueAverages,
    teams
  };
}

/**
 * Write output to file
 * 
 * @param {Object} output - Output object
 */
function writeOutputFile(output) {
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  // Report file size
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeKB = (stats.size / 1024).toFixed(2);
  
  console.log(`✅ File written: ${OUTPUT_FILE}`);
  console.log(`   Size: ${sizeKB} KB`);
}

// Run bootstrap
bootstrap();

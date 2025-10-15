/**
 * Data Validation Script
 * 
 * Validates all scraped and calculated data before GitHub commit
 * Checks: schema compliance, data ranges, completeness, consistency
 * 
 * Validates:
 * - Player data (traditional + advanced + on/off stats)
 * - Team data (pace, ratings, Four Factors)
 * - RCI data (roster continuity calculations)
 * 
 * Usage: node scripts/nba/local/validate-data.js
 * Exit code: 0 = success, 1 = validation errors found
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateTeamStats, validatePlayerStats, validateRCI } from '../../../netlify/functions/_lib/nba/validate-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation results
const results = {
  passed: 0,
  warnings: 0,
  errors: 0,
  details: []
};

/**
 * Logs validation result
 */
function logResult(category, check, status, message) {
  const entry = { category, check, status, message };
  results.details.push(entry);
  
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  console.log(`  ${icon} ${check}: ${message}`);
  
  if (status === 'pass') results.passed++;
  else if (status === 'warn') results.warnings++;
  else results.errors++;
}

/**
 * Validates file exists
 */
function validateFileExists(filePath, category) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  if (!fs.existsSync(filePath)) {
    logResult(category, 'File exists', 'error', `Missing: ${relativePath}`);
    return false;
  }
  
  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  logResult(category, 'File exists', 'pass', `${relativePath} (${sizeMB} MB)`);
  return true;
}

/**
 * Validates JSON structure
 */
function validateJSONStructure(filePath, category) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Check required top-level fields
    if (!data.schema_version) {
      logResult(category, 'Schema version', 'error', 'Missing schema_version field');
      return null;
    }
    
    if (data.schema_version !== 1) {
      logResult(category, 'Schema version', 'warn', `Unexpected version: ${data.schema_version}`);
    } else {
      logResult(category, 'Schema version', 'pass', 'v1');
    }
    
    return data;
  } catch (error) {
    logResult(category, 'JSON parsing', 'error', error.message);
    return null;
  }
}

/**
 * Validates player data
 */
function validatePlayerData() {
  console.log('\n📊 PLAYER DATA VALIDATION');
  console.log('='.repeat(60));
  
  const combinedPath = path.join(
    __dirname,
    '../../../data/nba/players/archive/player_seasons_combined.json'
  );
  
  if (!validateFileExists(combinedPath, 'Players')) return;
  
  const data = validateJSONStructure(combinedPath, 'Players');
  if (!data) return;
  
  // Validate player count
  if (!data.players || data.players.length === 0) {
    logResult('Players', 'Player count', 'error', 'No players found');
    return;
  }
  
  logResult('Players', 'Player count', 'pass', `${data.players.length} player-seasons`);
  
  // Validate seasons coverage
  const seasons = new Set(data.players.map(p => p.season));
  const expectedSeasons = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25'];
  const missingSeason = expectedSeasons.filter(s => !seasons.has(s));
  
  if (missingSeason.length > 0) {
    logResult('Players', 'Season coverage', 'error', `Missing seasons: ${missingSeason.join(', ')}`);
  } else {
    logResult('Players', 'Season coverage', 'pass', `All 5 seasons present`);
  }
  
  // Sample validation: check first 100 players
  const sampleSize = Math.min(100, data.players.length);
  let validCount = 0;
  let invalidCount = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const player = data.players[i];
    const validation = validatePlayerStats(player);
    
    if (validation.valid) {
      validCount++;
    } else {
      invalidCount++;
      if (invalidCount <= 5) { // Show first 5 errors
        logResult('Players', `Sample player ${i + 1}`, 'error', 
          `${player.player}: ${validation.errors.join(', ')}`);
      }
    }
  }
  
  if (invalidCount === 0) {
    logResult('Players', 'Sample validation', 'pass', 
      `${sampleSize} players validated successfully`);
  } else {
    logResult('Players', 'Sample validation', 'error', 
      `${invalidCount}/${sampleSize} players failed validation`);
  }
  
  // Check for duplicate player-seasons
  const playerSeasonKeys = new Set();
  let duplicates = 0;
  
  for (const player of data.players) {
    const key = `${player.player}|${player.team}|${player.season}`;
    if (playerSeasonKeys.has(key)) {
      duplicates++;
      if (duplicates <= 3) {
        logResult('Players', 'Duplicates', 'warn', `Duplicate: ${key}`);
      }
    }
    playerSeasonKeys.add(key);
  }
  
  if (duplicates === 0) {
    logResult('Players', 'Duplicates', 'pass', 'No duplicate player-seasons');
  } else {
    logResult('Players', 'Duplicates', 'warn', `${duplicates} duplicates found`);
  }
}

/**
 * Validates team data
 */
function validateTeamData() {
  console.log('\n🏀 TEAM DATA VALIDATION');
  console.log('='.repeat(60));
  
  const combinedPath = path.join(
    __dirname,
    '../../../data/nba/aggregates/archive/team_seasons_combined.json'
  );
  
  if (!validateFileExists(combinedPath, 'Teams')) return;
  
  const data = validateJSONStructure(combinedPath, 'Teams');
  if (!data) return;
  
  // Validate team count
  if (!data.teams || data.teams.length === 0) {
    logResult('Teams', 'Team count', 'error', 'No teams found');
    return;
  }
  
  logResult('Teams', 'Team count', 'pass', `${data.teams.length} team-seasons`);
  
  // Expected: 30 teams × 5 seasons = 150 team-seasons
  const expectedCount = 30 * 5;
  if (data.teams.length < expectedCount * 0.9) {
    logResult('Teams', 'Expected count', 'warn', 
      `Expected ~${expectedCount}, got ${data.teams.length}`);
  } else {
    logResult('Teams', 'Expected count', 'pass', 
      `${data.teams.length} team-seasons (expected ${expectedCount})`);
  }
  
  // Validate all teams
  let validCount = 0;
  let invalidCount = 0;
  
  for (const team of data.teams) {
    const validation = validateTeamStats(team);
    
    if (validation.valid) {
      validCount++;
    } else {
      invalidCount++;
      if (invalidCount <= 5) {
        logResult('Teams', `Team validation`, 'error', 
          `${team.team} ${team.season}: ${validation.errors.join(', ')}`);
      }
    }
  }
  
  if (invalidCount === 0) {
    logResult('Teams', 'Data validation', 'pass', 
      `All ${data.teams.length} teams validated successfully`);
  } else {
    logResult('Teams', 'Data validation', 'error', 
      `${invalidCount}/${data.teams.length} teams failed validation`);
  }
  
  // Check for missing teams per season
  const seasons = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25'];
  for (const season of seasons) {
    const seasonTeams = data.teams.filter(t => t.season === season);
    if (seasonTeams.length < 28) {
      logResult('Teams', `Season ${season}`, 'warn', 
        `Only ${seasonTeams.length}/30 teams`);
    } else {
      logResult('Teams', `Season ${season}`, 'pass', 
        `${seasonTeams.length} teams`);
    }
  }
}

/**
 * Validates RCI data
 */
function validateRCIData() {
  console.log('\n📈 RCI DATA VALIDATION');
  console.log('='.repeat(60));
  
  const combinedPath = path.join(
    __dirname,
    '../../../data/nba/rosters/archive/rosters_with_rci_combined.json'
  );
  
  if (!validateFileExists(combinedPath, 'RCI')) return;
  
  const data = validateJSONStructure(combinedPath, 'RCI');
  if (!data) return;
  
  // Validate roster count
  if (!data.rosters || data.rosters.length === 0) {
    logResult('RCI', 'Roster count', 'error', 'No rosters found');
    return;
  }
  
  logResult('RCI', 'Roster count', 'pass', `${data.rosters.length} team-seasons`);
  
  // Expected: 30 teams × 4 seasons = 120 (no RCI for first season)
  const expectedCount = 30 * 4;
  if (data.rosters.length < expectedCount * 0.9) {
    logResult('RCI', 'Expected count', 'warn', 
      `Expected ~${expectedCount}, got ${data.rosters.length}`);
  } else {
    logResult('RCI', 'Expected count', 'pass', 
      `${data.rosters.length} team-seasons (expected ${expectedCount})`);
  }
  
  // Validate all RCI calculations
  let validCount = 0;
  let invalidCount = 0;
  let nullRCICount = 0;
  
  for (const roster of data.rosters) {
    const validation = validateRCI(roster);
    
    if (validation.valid) {
      validCount++;
    } else {
      invalidCount++;
      if (invalidCount <= 5) {
        logResult('RCI', `RCI validation`, 'error', 
          `${roster.team} ${roster.season}: ${validation.errors.join(', ')}`);
      }
    }
    
    if (roster.rci === null) {
      nullRCICount++;
    }
  }
  
  if (invalidCount === 0) {
    logResult('RCI', 'Data validation', 'pass', 
      `All ${data.rosters.length} rosters validated successfully`);
  } else {
    logResult('RCI', 'Data validation', 'error', 
      `${invalidCount}/${data.rosters.length} rosters failed validation`);
  }
  
  if (nullRCICount > 0) {
    logResult('RCI', 'Null RCI values', 'warn', 
      `${nullRCICount} rosters have null RCI (missing previous season data)`);
  }
  
  // Calculate RCI statistics
  const validRCIs = data.rosters.filter(r => r.rci !== null).map(r => r.rci);
  if (validRCIs.length > 0) {
    const avg = validRCIs.reduce((sum, rci) => sum + rci, 0) / validRCIs.length;
    const min = Math.min(...validRCIs);
    const max = Math.max(...validRCIs);
    
    logResult('RCI', 'Statistics', 'pass', 
      `Avg: ${avg.toFixed(3)}, Range: ${min.toFixed(3)} - ${max.toFixed(3)}`);
    
    // Sanity check: RCI should be between 0 and 1
    const outOfRange = validRCIs.filter(rci => rci < 0 || rci > 1);
    if (outOfRange.length > 0) {
      logResult('RCI', 'Range check', 'error', 
        `${outOfRange.length} RCI values outside [0, 1] range`);
    } else {
      logResult('RCI', 'Range check', 'pass', 
        'All RCI values within [0, 1] range');
    }
  }
}

/**
 * Prints validation summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`✅ Passed:   ${results.passed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log(`❌ Errors:   ${results.errors}`);
  
  const total = results.passed + results.warnings + results.errors;
  const passRate = ((results.passed / total) * 100).toFixed(1);
  
  console.log(`\n📊 Pass rate: ${passRate}%`);
  
  if (results.errors > 0) {
    console.log('\n❌ VALIDATION FAILED');
    console.log('Fix errors before committing to GitHub');
    return false;
  } else if (results.warnings > 0) {
    console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS');
    console.log('Review warnings before committing to GitHub');
    return true;
  } else {
    console.log('\n✅ VALIDATION PASSED');
    console.log('Ready to commit to GitHub');
    return true;
  }
}

/**
 * Main validator
 */
async function validateAllData() {
  console.log('🔍 NBA Data Validation');
  console.log('='.repeat(60));
  console.log('Validating all scraped and calculated data...\n');
  
  validatePlayerData();
  validateTeamData();
  validateRCIData();
  
  const success = printSummary();
  
  console.log('\n💡 Next steps:');
  if (success) {
    console.log('  1. git add data/');
    console.log('  2. git commit -m "Add 5 seasons of NBA player/team/RCI data"');
    console.log('  3. git push');
    console.log('  4. Set up GitHub Actions: .github/workflows/nba-daily-update.yml');
  } else {
    console.log('  1. Review errors above');
    console.log('  2. Re-run scrapers if needed');
    console.log('  3. Run validation again');
  }
  
  process.exit(success ? 0 : 1);
}

// Run validation
validateAllData().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * MLB Research V1.1 - Game Record Transformer
 * 
 * Task 2: Transform raw game feeds into V1.1 schema format
 * 
 * Input: data/mlb_research/raw/statsapi_games/{year}/{game_pk}.json
 * Output: data/mlb_research/derived/game_records_v1/{year}/{game_pk}.json
 * 
 * What this produces:
 * - metadata: game_pk, teams, venue, datetime
 * - pregame: lineups (with handedness), starting pitchers, weather
 * - outcomes: labels for all markets (HR, Ks, Outs, SB, H+R+RBI, F5)
 * - qa: data quality flags
 * 
 * What this does NOT produce (Task 3):
 * - Rolling window features (computed separately with temporal ordering)
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const RAW_DIR = 'data/mlb_research/raw/statsapi_games';
const OUTPUT_DIR = 'data/mlb_research/derived/game_records_v1';
const QA_DIR = 'data/mlb_research/qa';

const YEARS = [2021, 2022, 2023, 2024, 2025];

// ============================================================================
// Utility Functions
// ============================================================================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseIP(ipString) {
  // Parse innings pitched like "5.2" -> 5.666... or "5.0" -> 5.0
  if (!ipString) return 0;
  const parts = String(ipString).split('.');
  const full = parseInt(parts[0]) || 0;
  const thirds = parseInt(parts[1]) || 0;
  return full + (thirds / 3);
}

function ipToOuts(ipString) {
  // Convert IP to outs: "5.2" -> 17 outs
  if (!ipString) return 0;
  const parts = String(ipString).split('.');
  const full = parseInt(parts[0]) || 0;
  const thirds = parseInt(parts[1]) || 0;
  return (full * 3) + thirds;
}

function parseWindInfo(windString) {
  // Parse "7 mph, Out To CF" -> { speed: 7, direction: "Out To CF" }
  if (!windString) return { speed: null, direction: null };
  const match = windString.match(/(\d+)\s*mph,?\s*(.*)/i);
  if (match) {
    return {
      speed: parseInt(match[1]),
      direction: match[2].trim() || null
    };
  }
  return { speed: null, direction: windString };
}

// ============================================================================
// Lineup Extraction (with handedness from player lookup)
// ============================================================================

function extractStartingLineup(rawGame, side) {
  // side = 'home' or 'away'
  const lineupRaw = rawGame.lineups?.[side] || [];
  const players = rawGame.players || {};
  
  // The lineup already has batting_order as 1-9 from our collector
  // Just enrich with handedness from players lookup
  const lineup = [];
  
  for (const player of lineupRaw) {
    const order = player.batting_order;
    
    // Skip if not a valid batting order position
    if (order < 1 || order > 9) continue;
    
    // Look up handedness from players object
    const playerInfo = players[String(player.player_id)] || {};
    
    lineup.push({
      batting_order: order,
      player_id: player.player_id,
      full_name: player.full_name,
      bats: player.bats || playerInfo.bats || null,
      throws: player.throws || playerInfo.throws || null,
      primary_position: player.position || playerInfo.primary_position || null
    });
  }
  
  // Sort by batting order
  lineup.sort((a, b) => a.batting_order - b.batting_order);
  
  // Return first 9 (starters only)
  return lineup.slice(0, 9);
}

// ============================================================================
// Outcome Extraction (Labels)
// ============================================================================

function extractBatterOutcomes(rawGame, side) {
  // Extract all batter outcomes for a side
  const boxscore = rawGame.boxscore?.[side]?.batters || [];
  const players = rawGame.players || {};
  const teamId = rawGame[`${side}_team`]?.id;
  
  const outcomes = [];
  
  for (const batter of boxscore) {
    const orderRaw = parseInt(batter.batting_order) || 0;
    
    // batting_order in boxscore is "100", "200", etc for starters
    // "101", "201" for substitutes
    const slotNum = Math.floor(orderRaw / 100);
    const isStarter = orderRaw % 100 === 0;
    
    // Only include valid lineup slots (1-9)
    if (slotNum < 1 || slotNum > 9) continue;
    
    const playerInfo = players[String(batter.player_id)] || {};
    
    outcomes.push({
      player_id: batter.player_id,
      full_name: batter.full_name,
      team_id: teamId,
      is_home_team: side === 'home',
      batting_order: slotNum,
      is_starter: isStarter,
      
      // Raw stats
      pa: batter.pa || 0,
      ab: batter.ab || 0,
      h: batter.h || 0,
      doubles: batter.doubles || 0,
      triples: batter.triples || 0,
      hr: batter.hr || 0,
      rbi: batter.rbi || 0,
      r: batter.r || 0,
      bb: batter.bb || 0,
      k: batter.k || 0,
      sb: batter.sb || 0,
      cs: batter.cs || 0,
      hbp: batter.hbp || 0,
      
      // Computed labels
      hit_hr: (batter.hr || 0) > 0,
      hr_count: batter.hr || 0,
      h_r_rbi: (batter.h || 0) + (batter.r || 0) + (batter.rbi || 0),
      
      // Player info
      bats: playerInfo.bats || null
    });
  }
  
  return outcomes;
}

function extractSPOutcome(rawGame, side) {
  const sp = rawGame.starting_pitchers?.[side];
  if (!sp) return null;
  
  const stats = sp.stats || {};
  
  return {
    player_id: sp.player_id,
    full_name: sp.full_name,
    throws: sp.throws || null,
    
    // Raw stats
    ip: stats.inningsPitched || '0',
    ip_decimal: parseIP(stats.inningsPitched),
    outs_recorded: ipToOuts(stats.inningsPitched),
    k: stats.strikeOuts || 0,
    bb: stats.baseOnBalls || 0,
    h: stats.hits || 0,
    hr_allowed: stats.homeRuns || 0,
    er: stats.earnedRuns || 0,
    r: stats.runs || 0,
    bf: stats.battersFaced || 0,
    pitches: stats.pitchesThrown || stats.numberOfPitches || 0,
    
    // Computed rates (for labels)
    k_pct: stats.battersFaced > 0 ? (stats.strikeOuts || 0) / stats.battersFaced : null,
    
    // Game decision
    decision: stats.wins > 0 ? 'W' : stats.losses > 0 ? 'L' : 'ND'
  };
}

function extractF5Scores(rawGame) {
  const innings = rawGame.linescore?.innings || [];
  
  let home_f5 = 0;
  let away_f5 = 0;
  
  for (let i = 0; i < Math.min(5, innings.length); i++) {
    const inning = innings[i];
    home_f5 += inning.home_runs || 0;
    away_f5 += inning.away_runs || 0;
  }
  
  return {
    home_f5,
    away_f5,
    f5_total: home_f5 + away_f5,
    f5_complete: innings.length >= 5
  };
}

function extractTeamTotals(rawGame) {
  const totals = rawGame.linescore?.totals || {};
  
  return {
    home: {
      runs: totals.home?.runs || 0,
      hits: totals.home?.hits || 0,
      errors: totals.home?.errors || 0
    },
    away: {
      runs: totals.away?.runs || 0,
      hits: totals.away?.hits || 0,
      errors: totals.away?.errors || 0
    },
    total_runs: (totals.home?.runs || 0) + (totals.away?.runs || 0)
  };
}

// ============================================================================
// Main Transform Function
// ============================================================================

function transformGameToV1(rawGame) {
  const anomalies = [];
  
  // === METADATA ===
  const metadata = {
    game_pk: rawGame.game_pk,
    season: parseInt(rawGame.season),
    game_type: rawGame.game_type,
    game_date: rawGame.game_date,
    
    // Datetime (both scheduled and actual)
    scheduled_first_pitch_utc: rawGame.datetime?.scheduled_first_pitch_utc || null,
    actual_first_pitch_utc: rawGame.datetime?.actual_first_pitch_utc || null,
    day_night: rawGame.datetime?.day_night || null,
    
    // Teams
    home_team_id: rawGame.home_team?.id,
    home_team_abbrev: rawGame.home_team?.abbreviation,
    home_team_name: rawGame.home_team?.name,
    away_team_id: rawGame.away_team?.id,
    away_team_abbrev: rawGame.away_team?.abbreviation,
    away_team_name: rawGame.away_team?.name,
    
    // Venue
    venue_id: rawGame.venue?.id,
    venue_name: rawGame.venue?.name,
    venue_city: rawGame.venue?.city,
    venue_state: rawGame.venue?.state,
    venue_roof: rawGame.venue?.roof_type,
    venue_surface: rawGame.venue?.surface,
    venue_capacity: rawGame.venue?.capacity,
    venue_dimensions: rawGame.venue?.dimensions || null,
    
    // Status
    status: rawGame.status?.detailed_state,
    is_final: rawGame.status?.is_final || false
  };
  
  // Check for missing actual first pitch
  if (!metadata.actual_first_pitch_utc) {
    anomalies.push('missing_actual_first_pitch');
  }
  
  // === PREGAME CONTEXT ===
  const homeLineup = extractStartingLineup(rawGame, 'home');
  const awayLineup = extractStartingLineup(rawGame, 'away');
  
  // Check lineup completeness
  if (homeLineup.length < 9) {
    anomalies.push(`incomplete_home_lineup_${homeLineup.length}`);
  }
  if (awayLineup.length < 9) {
    anomalies.push(`incomplete_away_lineup_${awayLineup.length}`);
  }
  
  // Check for missing handedness
  const missingBats = [...homeLineup, ...awayLineup].filter(p => !p.bats).length;
  if (missingBats > 0) {
    anomalies.push(`missing_bats_${missingBats}`);
  }
  
  // Weather
  const windInfo = parseWindInfo(rawGame.weather?.wind);
  const weather = rawGame.weather ? {
    condition: rawGame.weather.condition || null,
    temp_f: rawGame.weather.temp_f || null,
    wind_speed_mph: windInfo.speed,
    wind_direction: windInfo.direction,
    source: 'mlb_api'
  } : null;
  
  const pregame = {
    home_lineup: homeLineup,
    away_lineup: awayLineup,
    home_sp: {
      player_id: rawGame.starting_pitchers?.home?.player_id,
      full_name: rawGame.starting_pitchers?.home?.full_name,
      throws: rawGame.starting_pitchers?.home?.throws
    },
    away_sp: {
      player_id: rawGame.starting_pitchers?.away?.player_id,
      full_name: rawGame.starting_pitchers?.away?.full_name,
      throws: rawGame.starting_pitchers?.away?.throws
    },
    weather,
    lineup_source: rawGame.lineups?.source || 'boxscore_batting_order',
    lineup_confirmed: homeLineup.length === 9 && awayLineup.length === 9
  };
  
  // === OUTCOMES (LABELS) ===
  const homeBatterOutcomes = extractBatterOutcomes(rawGame, 'home');
  const awayBatterOutcomes = extractBatterOutcomes(rawGame, 'away');
  const f5Scores = extractF5Scores(rawGame);
  const teamTotals = extractTeamTotals(rawGame);
  
  const outcomes = {
    // Game-level
    game_final_status: rawGame.status?.detailed_state || 'Unknown',
    innings_played: rawGame.linescore?.currentInning || 9,
    
    // Team totals
    home_score: teamTotals.home.runs,
    away_score: teamTotals.away.runs,
    total_runs: teamTotals.total_runs,
    
    // F5 (First 5 innings)
    f5_home_score: f5Scores.home_f5,
    f5_away_score: f5Scores.away_f5,
    f5_total: f5Scores.f5_total,
    f5_complete: f5Scores.f5_complete,
    
    // Starting pitcher outcomes
    home_sp_outcome: extractSPOutcome(rawGame, 'home'),
    away_sp_outcome: extractSPOutcome(rawGame, 'away'),
    
    // Batter outcomes (for HR, H+R+RBI, SB markets)
    batter_outcomes: [...homeBatterOutcomes, ...awayBatterOutcomes],
    
    // Quick lookups
    home_team_hr: homeBatterOutcomes.reduce((sum, b) => sum + b.hr_count, 0),
    away_team_hr: awayBatterOutcomes.reduce((sum, b) => sum + b.hr_count, 0),
    home_team_sb: homeBatterOutcomes.reduce((sum, b) => sum + b.sb, 0),
    away_team_sb: awayBatterOutcomes.reduce((sum, b) => sum + b.sb, 0)
  };
  
  // === QA FLAGS ===
  const qa = {
    schema_version: 'v1.1',
    generated_at: new Date().toISOString(),
    lineup_source: pregame.lineup_source,
    lineup_complete: pregame.lineup_confirmed,
    weather_available: weather !== null,
    actual_first_pitch_available: metadata.actual_first_pitch_utc !== null,
    anomalies
  };
  
  return {
    metadata,
    pregame,
    outcomes,
    qa
  };
}

// ============================================================================
// Processing Pipeline
// ============================================================================

async function processYear(year, options = {}) {
  const { dryRun = false, limit = null } = options;
  
  const inputDir = path.join(RAW_DIR, String(year));
  const outputDir = path.join(OUTPUT_DIR, String(year));
  
  if (!fs.existsSync(inputDir)) {
    console.log(`⚠️  No data for ${year}`);
    return { processed: 0, errors: 0 };
  }
  
  ensureDir(outputDir);
  
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));
  const toProcess = limit ? files.slice(0, limit) : files;
  
  let processed = 0;
  let errors = 0;
  const allAnomalies = [];
  
  for (const file of toProcess) {
    const gamePk = path.basename(file, '.json');
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    
    try {
      const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      const transformed = transformGameToV1(rawData);
      
      if (!dryRun) {
        fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
      }
      
      processed++;
      
      // Track anomalies
      if (transformed.qa.anomalies.length > 0) {
        allAnomalies.push({
          game_pk: gamePk,
          year,
          anomalies: transformed.qa.anomalies
        });
      }
      
      // Progress
      if (processed % 100 === 0) {
        process.stdout.write(`\r  ${year}: ${processed}/${toProcess.length} games processed`);
      }
      
    } catch (err) {
      errors++;
      console.error(`\n  ❌ Error processing ${gamePk}: ${err.message}`);
    }
  }
  
  console.log(`\r  ${year}: ${processed}/${toProcess.length} games processed, ${errors} errors`);
  
  return { processed, errors, anomalies: allAnomalies };
}

async function main() {
  const args = process.argv.slice(2);
  const yearArg = args.find(a => a.startsWith('--year='));
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  
  const years = yearArg ? [parseInt(yearArg.split('=')[1])] : YEARS;
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       MLB Research V1.1 - Game Record Transformer              ║
╠════════════════════════════════════════════════════════════════╣
║  Years: ${years.join(', ').padEnd(52)}║
║  Dry Run: ${dryRun ? 'Yes' : 'No'}${' '.repeat(50)}║
║  Limit: ${limit ? limit + ' per year' : 'All'}${' '.repeat(46)}║
╚════════════════════════════════════════════════════════════════╝
`);

  ensureDir(OUTPUT_DIR);
  ensureDir(QA_DIR);
  
  let totalProcessed = 0;
  let totalErrors = 0;
  const allAnomalies = [];
  
  for (const year of years) {
    console.log(`\n📦 Processing ${year}...`);
    const result = await processYear(year, { dryRun, limit });
    totalProcessed += result.processed;
    totalErrors += result.errors;
    allAnomalies.push(...(result.anomalies || []));
  }
  
  // Write QA report
  if (!dryRun && allAnomalies.length > 0) {
    const qaPath = path.join(QA_DIR, 'transform_anomalies.json');
    fs.writeFileSync(qaPath, JSON.stringify({
      generated_at: new Date().toISOString(),
      total_anomalies: allAnomalies.length,
      anomalies: allAnomalies
    }, null, 2));
    console.log(`\n📋 QA report written to ${qaPath}`);
  }
  
  // Summary
  console.log(`
════════════════════════════════════════════════════════════════
✅ Transform Complete
   Processed: ${totalProcessed} games
   Errors: ${totalErrors}
   Anomalies: ${allAnomalies.length} games with issues
   Output: ${OUTPUT_DIR}
════════════════════════════════════════════════════════════════
`);

  // Print anomaly summary
  if (allAnomalies.length > 0) {
    const anomalyTypes = {};
    for (const a of allAnomalies) {
      for (const type of a.anomalies) {
        const key = type.replace(/_\d+$/, ''); // Normalize counts
        anomalyTypes[key] = (anomalyTypes[key] || 0) + 1;
      }
    }
    console.log('Anomaly Summary:');
    for (const [type, count] of Object.entries(anomalyTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  }
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * NFL Model V3 - Play-by-Play Feature Extraction
 * 
 * Extracts advanced features from NFLverse play-by-play data:
 * - Third down success rates (offense/defense)
 * - Red zone TD rates (offense/defense)
 * - Pressure rates (offense/defense)
 * - QB EPA under pressure
 * - Explosive play rates (offense/defense)
 * 
 * Outputs: team-week-level stats to data/pbp_features/
 * 
 * Run: node nfl-model-v3/scripts/03a-extract-pbp-features.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const NFLVERSE_DIR = path.join(__dirname, '../data/nflverse');
const OUTPUT_DIR = path.join(__dirname, '../data/pbp_features');

// Team name normalization map
const TEAM_MAP = {
  'LA': 'LAR',
  'LAR': 'LAR',
  'SD': 'LAC',
  'STL': 'LAR',
  'OAK': 'LV',
  'LV': 'LV'
};

function normalizeTeam(team) {
  return TEAM_MAP[team] || team;
}

/**
 * Extract all play-by-play features for a season
 */
async function extractPBPFeatures(season) {
  console.log(`\n📊 Extracting PBP features for ${season}...`);
  
  const pbpFile = path.join(NFLVERSE_DIR, `pbp_${season}.csv`);
  const csvText = await fs.readFile(pbpFile, 'utf-8');
  
  console.log('   Parsing CSV...');
  const plays = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      // Cast numeric columns
      if (context.column === 'week' || 
          context.column === 'down' || 
          context.column === 'yardline_100' ||
          context.column === 'yards_gained' ||
          context.column === 'epa') {
        return value === '' || value === 'NA' ? null : parseFloat(value);
      }
      return value;
    }
  });
  
  console.log(`   Loaded ${plays.length.toLocaleString()} plays`);
  
  // Initialize team-week stats
  const teamWeekStats = {};
  
  const initTeamWeek = (team, week) => {
    const key = `${team}_${week}`;
    if (!teamWeekStats[key]) {
      teamWeekStats[key] = {
        team: normalizeTeam(team),
        week,
        
        // Third down tracking
        third_down_attempts_off: 0,
        third_down_conversions_off: 0,
        third_down_attempts_def: 0,
        third_down_conversions_def: 0,
        
        // Red zone tracking
        red_zone_attempts_off: 0,
        red_zone_tds_off: 0,
        red_zone_attempts_def: 0,
        red_zone_tds_def: 0,
        
        // Pressure tracking
        qb_dropbacks_off: 0,
        qb_pressures_off: 0, // sacks + qb_hits
        qb_epa_under_pressure_total: 0,
        qb_epa_under_pressure_count: 0,
        qb_dropbacks_def: 0,
        qb_pressures_def: 0,
        
        // Explosive plays
        explosive_plays_off: 0,
        total_plays_off: 0,
        explosive_plays_def: 0,
        total_plays_def: 0,
        
        // Overall EPA for context
        total_epa_off: 0,
        total_epa_def: 0,
        play_count_off: 0,
        play_count_def: 0
      };
    }
    return teamWeekStats[key];
  };
  
  // Process each play
  for (const play of plays) {
    const week = play.week;
    const posteam = play.posteam;
    const defteam = play.defteam;
    
    // Skip if no teams or invalid week
    if (!posteam || !defteam || !week || week < 1 || week > 18) continue;
    
    const offStats = initTeamWeek(posteam, week);
    const defStats = initTeamWeek(defteam, week);
    
    const down = play.down;
    const yardline = play.yardline_100;
    const yards = play.yards_gained;
    const epa = play.epa;
    const isQBDropback = play.qb_dropback === '1';
    const isSack = play.sack === '1';
    const isQBHit = play.qb_hit === '1';
    const thirdDownConverted = play.third_down_converted === '1';
    const thirdDownFailed = play.third_down_failed === '1';
    const isTD = play.td_team === posteam;
    const playType = play.play_type;
    
    // Skip non-regular plays
    if (!playType || ['no_play', 'kickoff', 'extra_point', 'qb_kneel', 'qb_spike'].includes(playType)) {
      continue;
    }
    
    // Track total plays and EPA
    offStats.total_plays_off++;
    defStats.total_plays_def++;
    
    if (epa !== null && !isNaN(epa)) {
      offStats.total_epa_off += epa;
      offStats.total_epa_def -= epa; // Defense wants negative EPA for offense
      offStats.play_count_off++;
      defStats.play_count_def++;
    }
    
    // 1. THIRD DOWN SUCCESS
    if (down === 3) {
      offStats.third_down_attempts_off++;
      defStats.third_down_attempts_def++;
      
      if (thirdDownConverted) {
        offStats.third_down_conversions_off++;
      } else if (thirdDownFailed) {
        defStats.third_down_conversions_def++;
      }
    }
    
    // 2. RED ZONE TD RATE
    if (yardline !== null && yardline <= 20 && yardline > 0) {
      offStats.red_zone_attempts_off++;
      defStats.red_zone_attempts_def++;
      
      if (isTD) {
        offStats.red_zone_tds_off++;
      } else {
        // Defensive stop in red zone
        if (!isTD && (down === 4 || playType === 'field_goal')) {
          // Count as defensive red zone success
        }
      }
    }
    
    // 3. PRESSURE RATES
    if (isQBDropback) {
      offStats.qb_dropbacks_off++;
      defStats.qb_dropbacks_def++;
      
      const isPressure = isSack || isQBHit;
      
      if (isPressure) {
        offStats.qb_pressures_off++;
        defStats.qb_pressures_def++;
        
        // Track QB EPA under pressure
        if (epa !== null && !isNaN(epa)) {
          offStats.qb_epa_under_pressure_total += epa;
          offStats.qb_epa_under_pressure_count++;
        }
      }
    }
    
    // 4. EXPLOSIVE PLAYS (15+ yards passing, 10+ yards rushing)
    if (yards !== null && !isNaN(yards)) {
      const isExplosive = (playType === 'pass' && yards >= 15) || 
                          (playType === 'run' && yards >= 10);
      
      if (isExplosive) {
        offStats.explosive_plays_off++;
        defStats.explosive_plays_def++;
      }
    }
  }
  
  // Calculate rates for each team-week
  const finalStats = [];
  
  for (const [key, stats] of Object.entries(teamWeekStats)) {
    const record = {
      team: stats.team,
      season,
      week: stats.week,
      
      // Third down success rates
      third_down_success_rate_off: stats.third_down_attempts_off > 0 
        ? stats.third_down_conversions_off / stats.third_down_attempts_off 
        : 0,
      third_down_success_rate_def: stats.third_down_attempts_def > 0
        ? 1 - (stats.third_down_conversions_def / stats.third_down_attempts_def)
        : 0.5, // Default to league average
      
      // Red zone TD rates
      red_zone_td_rate_off: stats.red_zone_attempts_off > 0
        ? stats.red_zone_tds_off / stats.red_zone_attempts_off
        : 0,
      red_zone_td_rate_def: stats.red_zone_attempts_def > 0
        ? 1 - (stats.red_zone_tds_def / stats.red_zone_attempts_def)
        : 0.5,
      
      // Pressure rates
      pressure_rate_off: stats.qb_dropbacks_off > 0
        ? stats.qb_pressures_off / stats.qb_dropbacks_off
        : 0.25, // League average ~25%
      pressure_rate_def: stats.qb_dropbacks_def > 0
        ? stats.qb_pressures_def / stats.qb_dropbacks_def
        : 0.25,
      
      // QB EPA under pressure
      qb_epa_under_pressure: stats.qb_epa_under_pressure_count > 0
        ? stats.qb_epa_under_pressure_total / stats.qb_epa_under_pressure_count
        : -0.3, // Default to negative (pressure hurts)
      
      // Explosive play rates
      explosive_play_rate_off: stats.total_plays_off > 0
        ? stats.explosive_plays_off / stats.total_plays_off
        : 0,
      explosive_play_rate_def: stats.total_plays_def > 0
        ? stats.explosive_plays_def / stats.total_plays_def
        : 0.12, // League average
      
      // Context metrics
      avg_epa_off: stats.play_count_off > 0 ? stats.total_epa_off / stats.play_count_off : 0,
      avg_epa_def: stats.play_count_def > 0 ? stats.total_epa_def / stats.play_count_def : 0,
      plays_off: stats.total_plays_off,
      plays_def: stats.total_plays_def
    };
    
    finalStats.push(record);
  }
  
  // Sort by team and week
  finalStats.sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return a.week - b.week;
  });
  
  console.log(`   ✅ Extracted stats for ${finalStats.length} team-weeks`);
  
  return finalStats;
}

/**
 * Calculate rolling averages with recency weighting
 */
function calculateRollingAverage(teamStats, metric, weights = { last_3: 0.5, last_5: 0.3, season: 0.2 }) {
  if (teamStats.length === 0) return null;
  
  const values = teamStats.map(s => s[metric] || 0);
  
  const last3 = values.slice(-3);
  const last5 = values.slice(-5);
  const all = values;
  
  const avg3 = last3.reduce((a, b) => a + b, 0) / last3.length;
  const avg5 = last5.reduce((a, b) => a + b, 0) / last5.length;
  const avgAll = all.reduce((a, b) => a + b, 0) / all.length;
  
  return (
    avg3 * weights.last_3 +
    avg5 * weights.last_5 +
    avgAll * weights.season
  );
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V3 - PBP Feature Extraction');
  console.log('=========================================');
  
  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Process each season
  const allFeatures = [];
  
  for (const season of config.seasons) {
    const features = await extractPBPFeatures(season);
    allFeatures.push(...features);
    
    // Save season-specific file
    const outputFile = path.join(OUTPUT_DIR, `pbp_features_${season}.json`);
    await fs.writeFile(outputFile, JSON.stringify(features, null, 2));
    console.log(`   💾 Saved to ${outputFile}`);
  }
  
  // Save combined file
  const combinedFile = path.join(OUTPUT_DIR, 'pbp_features_all.json');
  await fs.writeFile(combinedFile, JSON.stringify(allFeatures, null, 2));
  console.log(`\n✅ Combined file saved to ${combinedFile}`);
  
  // Summary statistics
  const teams = new Set(allFeatures.map(f => f.team));
  console.log(`\n📈 Summary:`);
  console.log(`   Total records: ${allFeatures.length.toLocaleString()}`);
  console.log(`   Teams: ${teams.size}`);
  console.log(`   Seasons: ${config.seasons.join(', ')}`);
  
  // Sample stats
  const sample = allFeatures[Math.floor(allFeatures.length / 2)];
  console.log(`\n📋 Sample Record (${sample.team} Week ${sample.week}, ${sample.season}):`);
  console.log(`   Third Down Success Off: ${(sample.third_down_success_rate_off * 100).toFixed(1)}%`);
  console.log(`   Red Zone TD Rate Off: ${(sample.red_zone_td_rate_off * 100).toFixed(1)}%`);
  console.log(`   Pressure Rate Allowed: ${(sample.pressure_rate_off * 100).toFixed(1)}%`);
  console.log(`   QB EPA Under Pressure: ${sample.qb_epa_under_pressure.toFixed(3)}`);
  console.log(`   Explosive Play Rate: ${(sample.explosive_play_rate_off * 100).toFixed(1)}%`);
}

main().catch(console.error);

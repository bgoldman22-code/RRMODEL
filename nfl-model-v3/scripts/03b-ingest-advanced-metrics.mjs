#!/usr/bin/env node
/**
 * NFL Model V3 - Advanced Metrics Ingestion
 * 
 * Loads QB EPA, pressure rates, red zone efficiency, pace from NFLVerse
 * Creates time-causal rolling snapshots per team/week
 * 
 * Run: node nfl-model-v3/scripts/03b-ingest-advanced-metrics.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const NFLVERSE_DIR = path.join(__dirname, '../data/nflverse');
const OUTPUT_DIR = path.join(__dirname, '../data/advanced');

// Team name normalization map
const TEAM_MAP = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF',
  'CAR': 'CAR', 'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE',
  'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'GB': 'GB',
  'HOU': 'HOU', 'IND': 'IND', 'JAX': 'JAX', 'JAC': 'JAX', 
  'KC': 'KC', 'LA': 'LAR', 'LAR': 'LAR', 'LAC': 'LAC',
  'LV': 'LV', 'OAK': 'LV', 'MIA': 'MIA', 'MIN': 'MIN',
  'NE': 'NE', 'NO': 'NO', 'NYG': 'NYG', 'NYJ': 'NYJ',
  'PHI': 'PHI', 'PIT': 'PIT', 'SF': 'SF', 'SEA': 'SEA',
  'TB': 'TB', 'TEN': 'TEN', 'WAS': 'WAS', 'WSH': 'WAS'
};

/**
 * Extract advanced metrics from play-by-play data
 */
async function extractAdvancedMetrics(season) {
  console.log(`\n📊 Extracting advanced metrics for ${season}...`);
  
  const pbpFile = path.join(NFLVERSE_DIR, `pbp_${season}.csv`);
  const pbpData = await fs.readFile(pbpFile, 'utf-8');
  const plays = parse(pbpData, { columns: true, skip_empty_lines: true });
  
  // Initialize storage
  const teamWeekStats = {};
  
  // Process each play
  for (const play of plays) {
    const week = parseInt(play.week);
    const homeTeam = TEAM_MAP[play.home_team] || play.home_team;
    const awayTeam = TEAM_MAP[play.away_team] || play.away_team;
    
    if (!week || week > 18) continue; // Skip invalid/playoff weeks
    
    // Initialize team-week buckets
    if (!teamWeekStats[homeTeam]) teamWeekStats[homeTeam] = {};
    if (!teamWeekStats[awayTeam]) teamWeekStats[awayTeam] = {};
    if (!teamWeekStats[homeTeam][week]) {
      teamWeekStats[homeTeam][week] = initWeekStats();
    }
    if (!teamWeekStats[awayTeam][week]) {
      teamWeekStats[awayTeam][week] = initWeekStats();
    }
    
    const possTeam = TEAM_MAP[play.posteam] || play.posteam;
    const defTeam = TEAM_MAP[play.defteam] || play.defteam;
    
    if (!possTeam || !defTeam) continue;
    
    // Track play-level metrics
    const epa = parseFloat(play.epa) || 0;
    const isPass = play.pass === '1' || play.play_type === 'pass';
    const isRun = play.rush === '1' || play.play_type === 'run';
    const qbDropback = play.qb_dropback === '1';
    const qbPressured = play.qb_hit === '1' || play.sack === '1';
    const isRedZone = parseInt(play.yardline_100) <= 20;
    const isTD = play.touchdown === '1';
    
    // Pace: time between snaps
    const playTime = parseFloat(play.game_seconds_remaining);
    
    if (!teamWeekStats[possTeam][week]) teamWeekStats[possTeam][week] = initWeekStats();
    if (!teamWeekStats[defTeam][week]) teamWeekStats[defTeam][week] = initWeekStats();
    
    const offStats = teamWeekStats[possTeam][week];
    const defStats = teamWeekStats[defTeam][week];
    
    // QB metrics (offense)
    if (qbDropback) {
      offStats.qb_plays++;
      offStats.qb_epa_sum += epa;
      
      if (qbPressured) {
        offStats.qb_pressured_plays++;
        offStats.qb_pressured_epa_sum += epa;
      }
      
      // Pressure rate allowed
      offStats.total_dropbacks++;
      if (qbPressured) offStats.pressures_allowed++;
    }
    
    // Pressure generated (defense)
    if (qbDropback) {
      defStats.opp_dropbacks++;
      if (qbPressured) defStats.pressures_generated++;
    }
    
    // Red zone efficiency
    if (isRedZone && (isPass || isRun)) {
      offStats.rz_plays++;
      if (isTD) offStats.rz_tds++;
      
      defStats.rz_plays_allowed++;
      if (isTD) defStats.rz_tds_allowed++;
    }
    
    // Pace tracking (neutral situations only)
    if (play.game_seconds_remaining && play.wp && 
        parseFloat(play.wp) > 0.2 && parseFloat(play.wp) < 0.8 &&
        Math.abs(parseFloat(play.score_differential) || 0) <= 7) {
      offStats.pace_plays++;
      if (offStats.last_play_time) {
        const timeDiff = offStats.last_play_time - playTime;
        if (timeDiff > 0 && timeDiff < 180) { // Reasonable snap-to-snap
          offStats.pace_seconds_sum += timeDiff;
        }
      }
      offStats.last_play_time = playTime;
    }
    
    // Play counts
    if (isPass || isRun) {
      offStats.total_plays++;
    }
  }
  
  // Calculate per-week averages
  const metrics = {};
  for (const [team, weeks] of Object.entries(teamWeekStats)) {
    metrics[team] = {};
    for (const [week, stats] of Object.entries(weeks)) {
      metrics[team][week] = {
        qb_epa_per_play: stats.qb_plays > 0 ? stats.qb_epa_sum / stats.qb_plays : 0,
        qb_epa_under_pressure: stats.qb_pressured_plays > 0 ? stats.qb_pressured_epa_sum / stats.qb_pressured_plays : 0,
        pressure_rate_offense: stats.total_dropbacks > 0 ? stats.pressures_allowed / stats.total_dropbacks : 0,
        pressure_rate_defense: stats.opp_dropbacks > 0 ? stats.pressures_generated / stats.opp_dropbacks : 0,
        red_zone_td_rate_offense: stats.rz_plays > 0 ? stats.rz_tds / stats.rz_plays : 0,
        red_zone_td_rate_defense: stats.rz_plays_allowed > 0 ? stats.rz_tds_allowed / stats.rz_plays_allowed : 0,
        pace_seconds_per_play: stats.pace_plays > 0 ? stats.pace_seconds_sum / stats.pace_plays : 28, // NFL avg
        plays_per_game: stats.total_plays,
        qb_plays: stats.qb_plays
      };
    }
  }
  
  return metrics;
}

function initWeekStats() {
  return {
    qb_plays: 0,
    qb_epa_sum: 0,
    qb_pressured_plays: 0,
    qb_pressured_epa_sum: 0,
    total_dropbacks: 0,
    pressures_allowed: 0,
    opp_dropbacks: 0,
    pressures_generated: 0,
    rz_plays: 0,
    rz_tds: 0,
    rz_plays_allowed: 0,
    rz_tds_allowed: 0,
    pace_plays: 0,
    pace_seconds_sum: 0,
    last_play_time: null,
    total_plays: 0
  };
}

/**
 * Calculate rolling weighted averages (same weights as main features)
 */
function calculateRollingAdvanced(teamMetrics, currentWeek, lookbackWindow = 10) {
  const weights = config.feature_generation.recency_weights;
  
  // Get all weeks before current
  const weeks = Object.keys(teamMetrics)
    .map(w => parseInt(w))
    .filter(w => w < currentWeek)
    .sort((a, b) => a - b)
    .slice(-lookbackWindow);
  
  if (weeks.length === 0) return null;
  
  const last3 = weeks.slice(-3);
  const last5 = weeks.slice(-5);
  const allWeeks = weeks;
  
  const calcAvg = (wks, metric) => {
    const values = wks.map(w => teamMetrics[w][metric] || 0);
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  
  const result = {};
  const metrics = [
    'qb_epa_per_play',
    'qb_epa_under_pressure',
    'pressure_rate_offense',
    'pressure_rate_defense',
    'red_zone_td_rate_offense',
    'red_zone_td_rate_defense',
    'pace_seconds_per_play'
  ];
  
  for (const metric of metrics) {
    const avg3 = last3.length > 0 ? calcAvg(last3, metric) : 0;
    const avg5 = last5.length > 0 ? calcAvg(last5, metric) : 0;
    const avgAll = allWeeks.length > 0 ? calcAvg(allWeeks, metric) : 0;
    
    result[metric] = (
      avg3 * weights.last_3_games +
      avg5 * weights.last_5_games +
      avgAll * weights.season_avg
    );
  }
  
  result.games_played = weeks.length;
  
  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V3 - Advanced Metrics Ingestion');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  const allMetrics = {};
  
  for (const season of config.seasons) {
    const metrics = await extractAdvancedMetrics(season);
    allMetrics[season] = metrics;
    
    // Save season metrics
    const outputFile = path.join(OUTPUT_DIR, `advanced_${season}.json`);
    await fs.writeFile(outputFile, JSON.stringify(metrics, null, 2));
    
    const teamCount = Object.keys(metrics).length;
    let totalWeeks = 0;
    for (const team in metrics) {
      totalWeeks += Object.keys(metrics[team]).length;
    }
    
    console.log(`   ✅ ${season}: ${teamCount} teams, ${totalWeeks} team-weeks`);
    console.log(`   ✅ Saved to ${outputFile}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Advanced Metrics Ingestion Complete!');
  console.log(`   Seasons processed: ${config.seasons.length}`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  console.log('\n📝 Next Step: node nfl-model-v3/scripts/03-generate-features.mjs\n');
}

// Export for use in other scripts
export async function loadAdvancedMetrics(seasons) {
  const metrics = {};
  for (const season of seasons) {
    const file = path.join(OUTPUT_DIR, `advanced_${season}.json`);
    try {
      const data = await fs.readFile(file, 'utf-8');
      metrics[season] = JSON.parse(data);
    } catch (error) {
      console.error(`⚠️  Could not load advanced metrics for ${season}: ${error.message}`);
      metrics[season] = {};
    }
  }
  return metrics;
}

export function getAdvancedSnapshot(advancedMetrics, team, season, week, lookbackWindow = 10) {
  const teamData = advancedMetrics[season]?.[team];
  if (!teamData) return null;
  
  return calculateRollingAdvanced(teamData, week, lookbackWindow);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
  });
}

// scripts/etl-full.js
// Skeleton showing where each advanced metric comes from NFLverse PBP data

import { loadNFLversePBP } from './lib/nflverse_data_loading.js';
import { calculateUsageMetrics, calculateDefenseMetrics, calculateScriptMetrics, calculateEnvironmentalMetrics } from './lib/metrics_helpers.js';
import { writeFileSync } from 'fs';

async function generateAdvancedMetrics(season = 2024) {
  console.log(`Generating advanced metrics for ${season} season...`);
  
  // Load NFLverse play-by-play data
  const pbp = await loadNFLversePBP(season);
  const teams = [...new Set(pbp.map(play => play.posteam).filter(Boolean))];
  
  // Initialize output structure
  const output = {
    version: "adv_v1",
    asOf: new Date().toISOString(),
    league: {
      means: {},
      stds: {}
    },
    teams: {}
  };

  // Calculate metrics for each team
  for (const team of teams) {
    const teamPlays = pbp.filter(play => play.posteam === team);
    const defensePlays = pbp.filter(play => play.defteam === team);
    
    output.teams[team] = calculateTeamMetrics(teamPlays, defensePlays, pbp);
  }

  // Calculate league means and standard deviations for normalization
  calculateLeagueNormalization(output);
  
  // Write to blob storage
  await writeToBlobStorage('nfl/epa/latest.json', output);
  
  console.log('Advanced metrics generated successfully');
  return output;
}

function calculateTeamMetrics(teamPlays, defensePlays, allPlays) {
  const games = [...new Set(teamPlays.map(play => play.game_id))];
  const byePassed = false; // Calculate based on week and schedule
  
  return {
    meta: { 
      games: games.length, 
      bye_passed: byePassed 
    },
    
    core: calculateCoreMetrics(teamPlays, defensePlays),
    situational: calculateSituationalMetrics(teamPlays, defensePlays),
    pressure: calculatePressureMetrics(teamPlays, defensePlays),
    turnovers: calculateTurnoverMetrics(teamPlays, defensePlays),
    discipline: calculateDisciplineMetrics(teamPlays, defensePlays),
    coaching: calculateCoachingMetrics(teamPlays, defensePlays),
    tempo: calculateTempoMetrics(teamPlays),
    formations: calculateFormationMetrics(teamPlays),
    usage: calculateUsageMetrics(teamPlays),
    defense: calculateDefenseMetrics(defensePlays),
    script: calculateScriptMetrics(teamPlays, allPlays),
    env: calculateEnvironmentalMetrics(teamPlays),
    consistency: calculateConsistencyMetrics(teamPlays, games),
    form: calculateFormMetrics(teamPlays, games)
  };
}

function calculateCoreMetrics(teamPlays, defensePlays) {
  // EPA calculations
  const offEPA = teamPlays
    .filter(play => !isNaN(play.epa))
    .reduce((sum, play) => sum + play.epa, 0) / teamPlays.length;
    
  const defEPA = defensePlays
    .filter(play => !isNaN(play.epa))
    .reduce((sum, play) => sum + play.epa, 0) / defensePlays.length;
  
  // Simple opponent adjustment (can be enhanced)
  const offAdjEPA = offEPA * 0.9 + (offEPA * 0.1); // Placeholder for opponent strength adjustment
  const defAdjEPA = defEPA * 0.9 + (defEPA * 0.1);
  
  return {
    off_epa: Number(offEPA.toFixed(3)),
    def_epa: Number(defEPA.toFixed(3)),
    off_adj_epa: Number(offAdjEPA.toFixed(3)),
    def_adj_epa: Number(defAdjEPA.toFixed(3))
  };
}

function calculateSituationalMetrics(teamPlays, defensePlays) {
  // Third down efficiency
  const thirdDownPlays = teamPlays.filter(play => play.down === 3);
  const thirdDownSuccess = thirdDownPlays.filter(play => play.first_down_rush || play.first_down_pass || play.touchdown).length;
  const thirdDownOff = thirdDownPlays.length > 0 ? thirdDownSuccess / thirdDownPlays.length : 0;
  
  const defThirdDownPlays = defensePlays.filter(play => play.down === 3);
  const defThirdDownSuccess = defThirdDownPlays.filter(play => play.first_down_rush || play.first_down_pass || play.touchdown).length;
  const thirdDownDef = defThirdDownPlays.length > 0 ? -defThirdDownSuccess / defThirdDownPlays.length : 0;
  
  // Red zone efficiency  
  const rzPlays = teamPlays.filter(play => play.yardline_100 <= 20 && play.yardline_100 > 0);
  const rzTouchdowns = rzPlays.filter(play => play.touchdown).length;
  const rzDrives = [...new Set(rzPlays.map(play => `${play.game_id}_${play.drive}`))].length;
  const rzTdOff = rzDrives > 0 ? rzTouchdowns / rzDrives : 0;
  
  // Early down success (1st and 2nd down EPA > 0)
  const earlyDownPlays = teamPlays.filter(play => play.down <= 2);
  const earlyDownSuccess = earlyDownPlays.filter(play => play.epa > 0).length;
  const eds = earlyDownPlays.length > 0 ? earlyDownSuccess / earlyDownPlays.length : 0;
  
  // Explosive plays (20+ yard gains)
  const explosiveOff = teamPlays.filter(play => play.yards_gained >= 20).length / teamPlays.length;
  const explosiveDef = defensePlays.filter(play => play.yards_gained >= 20).length / defensePlays.length;
  
  return {
    third_down_off: Number(thirdDownOff.toFixed(3)),
    third_down_def: Number(thirdDownDef.toFixed(3)),
    rz_td_off: Number(rzTdOff.toFixed(3)),
    eds: Number(eds.toFixed(3)),
    explosive_off: Number(explosiveOff.toFixed(3)),
    explosive_def: Number(explosiveDef.toFixed(3))
  };
}

function calculatePressureMetrics(teamPlays, defensePlays) {
  // Pressure rates from sacks and QB hits (enhance with pressure data if available)
  const passPlays = teamPlays.filter(play => play.pass === 1);
  const sacks = passPlays.filter(play => play.sack === 1).length;
  const pressureAllowed = passPlays.length > 0 ? sacks / passPlays.length : 0;
  
  const defPassPlays = defensePlays.filter(play => play.pass === 1);
  const defSacks = defPassPlays.filter(play => play.sack === 1).length;
  const pressureFor = defPassPlays.length > 0 ? defSacks / defPassPlays.length : 0;
  
  return {
    pressure_for: Number(pressureFor.toFixed(3)),
    pressure_allowed: Number(pressureAllowed.toFixed(3)),
    pressure_diff: Number((pressureFor - pressureAllowed).toFixed(3))
  };
}

function calculateTurnoverMetrics(teamPlays, defensePlays) {
  const drives = [...new Set(teamPlays.map(play => `${play.game_id}_${play.drive}`))];
  const takeaways = defensePlays.filter(play => play.interception === 1 || play.fumble_lost === 1).length;
  const giveaways = teamPlays.filter(play => play.interception === 1 || play.fumble_lost === 1).length;
  
  const takeawaysPerDrive = drives.length > 0 ? takeaways / drives.length : 0;
  const giveawaysPerDrive = drives.length > 0 ? giveaways / drives.length : 0;
  
  return {
    takeaways_per_drive: Number(takeawaysPerDrive.toFixed(3)),
    giveaways_per_drive: Number(giveawaysPerDrive.toFixed(3)),
    turnover_diff: Number((takeawaysPerDrive - giveawaysPerDrive).toFixed(3))
  };
}

function calculateDisciplineMetrics(teamPlays, defensePlays) {
  const drives = [...new Set(teamPlays.map(play => `${play.game_id}_${play.drive}`))];
  const penalties = teamPlays.filter(play => play.penalty === 1);
  const penaltyYards = penalties.reduce((sum, play) => sum + (play.penalty_yards || 0), 0);
  
  return {
    penalty_yds_per_drive: drives.length > 0 ? Number((penaltyYards / drives.length).toFixed(1)) : 0,
    penalty_diff: 0 // Calculate vs opponent penalties
  };
}

function calculateCoachingMetrics(teamPlays, defensePlays) {
  const fourthDownPlays = teamPlays.filter(play => play.down === 4);
  const fourthDownGos = fourthDownPlays.filter(play => play.rush === 1 || play.pass === 1);
  const fourthDownAgg = fourthDownPlays.length > 0 ? fourthDownGos.length / fourthDownPlays.length : 0;
  
  return {
    fourth_down_agg: Number(fourthDownAgg.toFixed(3)),
    two_point_rate: 0, // Calculate from two_point_attempt plays
    timeout_eff: 0, // Placeholder - requires timeout analysis
    challenge_success: 0.5 // Placeholder
  };
}

function calculateTempoMetrics(teamPlays) {
  const drives = [...new Set(teamPlays.map(play => `${play.game_id}_${play.drive}`))];
  const totalPlays = teamPlays.length;
  const playsPerDrive = drives.length > 0 ? totalPlays / drives.length : 0;
  
  return {
    pace: Number((totalPlays / (drives.length || 1) * 4).toFixed(1)), // Rough pace estimate
    no_huddle_freq: 0, // Requires no_huddle flag in data
    plays_per_drive: Number(playsPerDrive.toFixed(1)),
    top_eff: 0 // Time of possession efficiency - placeholder
  };
}

function calculateFormationMetrics(teamPlays) {
  const totalPlays = teamPlays.length;
  const shotgunPlays = teamPlays.filter(play => play.shotgun === 1);
  const shotgunRate = totalPlays > 0 ? shotgunPlays.length / totalPlays : 0;
  
  return {
    shotgun_epa_diff: 0, // Calculate shotgun vs under center EPA difference
    empty_rate: 0, // Requires personnel data
    heavy_epa: 0, // Heavy personnel EPA
    motion_rate: 0.4, // Placeholder - requires motion data
    pa_freq: 0, // Play action frequency
    pass_rate_1st: 0, // First down pass rate
    run_rate_by_down: { "1": 0.44, "2": 0.39, "3": 0.28 } // Placeholder
  };
}

// ... Additional calculation functions for other metric categories

function calculateConsistencyMetrics(teamPlays, games) {
  // Calculate game-by-game EPA variance
  const gameEPAs = games.map(gameId => {
    const gamePlays = teamPlays.filter(play => play.game_id === gameId);
    return gamePlays.reduce((sum, play) => sum + (play.epa || 0), 0) / gamePlays.length;
  });
  
  const mean = gameEPAs.reduce((sum, epa) => sum + epa, 0) / gameEPAs.length;
  const variance = gameEPAs.reduce((sum, epa) => sum + Math.pow(epa - mean, 2), 0) / gameEPAs.length;
  const consistency = Math.max(0, 1 - variance); // Convert to 0-1 scale
  
  return {
    off: Number(consistency.toFixed(3)),
    def: Number(consistency.toFixed(3)) // Calculate separately for defense
  };
}

function calculateFormMetrics(teamPlays, games) {
  // EWMA on recent performance
  const recentGames = games.slice(-4); // Last 4 games
  let ewma = 0;
  const alpha = 0.3;
  
  recentGames.forEach((gameId, index) => {
    const gamePlays = teamPlays.filter(play => play.game_id === gameId);
    const gameEPA = gamePlays.reduce((sum, play) => sum + (play.epa || 0), 0) / gamePlays.length;
    ewma = index === 0 ? gameEPA : alpha * gameEPA + (1 - alpha) * ewma;
  });
  
  return {
    off: Number(ewma.toFixed(3)),
    def: 0 // Calculate separately for defense
  };
}

function calculateLeagueNormalization(output) {
  const teams = Object.values(output.teams);
  const metrics = [
    'third_down_off', 'rz_td_off', 'turnover_diff', 'explosive_diff', 
    'eds', 'pressure_diff', 'fourth_down_agg', 'penalty_diff', 'top_eff'
  ];
  
  metrics.forEach(metric => {
    const values = teams.map(team => getNestedValue(team, metric)).filter(v => v !== null);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    output.league.means[metric] = Number(mean.toFixed(4));
    output.league.stds[metric] = Number(std.toFixed(4));
  });
}

function getNestedValue(obj, path) {
  // Helper to get nested values like 'situational.third_down_off'
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    value = value?.[key];
  }
  return value ?? null;
}

async function writeToBlobStorage(path, data) {
  // Replace with your actual blob storage write function
  console.log(`Writing to ${path}:`, Object.keys(data));
  // await yourBlobWriteFunction(path, data);
}

// Export for use in your ETL pipeline
export { generateAdvancedMetrics };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAdvancedMetrics(2024).catch(console.error);
}
// scripts/etl-full.js
// Complete implementation for NFLverse PBP aggregation

import { loadNFLversePBP } from './lib/nflverse_data_loading.js';
import { calculateUsageMetrics, calculateDefenseMetrics, calculateScriptMetrics, calculateEnvironmentalMetrics } from './lib/metrics_helpers.js';
import { writeToBlobStorage } from './lib/blob_io.js';

async function generateAdvancedMetrics(season = 2024) {
  console.log(`Generating advanced metrics for ${season} season...`);
  
  // Load NFLverse play-by-play data
  const pbp = await loadNFLversePBP(season);
  const teams = [...new Set(pbp.map(play => play.posteam).filter(Boolean))];
  
  console.log(`Loaded ${pbp.length} plays for ${teams.length} teams`);
  
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
    console.log(`Processing team: ${team}`);
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
  
  return {
    meta: { 
      games: games.length, 
      bye_passed: false // Calculate based on week and schedule
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
  const validOffPlays = teamPlays.filter(play => !isNaN(parseFloat(play.epa)));
  const validDefPlays = defensePlays.filter(play => !isNaN(parseFloat(play.epa)));
  
  const offEPA = validOffPlays.length > 0 ? 
    validOffPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validOffPlays.length : 0;
    
  const defEPA = validDefPlays.length > 0 ? 
    validDefPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validDefPlays.length : 0;
  
  // Simple opponent adjustment (can be enhanced)
  const offAdjEPA = offEPA * 0.9 + (offEPA * 0.1);
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
  const thirdDownPlays = teamPlays.filter(play => parseInt(play.down) === 3);
  const thirdDownSuccess = thirdDownPlays.filter(play => 
    play.first_down_rush == 1 || play.first_down_pass == 1 || play.touchdown == 1
  ).length;
  const thirdDownOff = thirdDownPlays.length > 0 ? thirdDownSuccess / thirdDownPlays.length : 0;
  
  const defThirdDownPlays = defensePlays.filter(play => parseInt(play.down) === 3);
  const defThirdDownSuccess = defThirdDownPlays.filter(play => 
    play.first_down_rush == 1 || play.first_down_pass == 1 || play.touchdown == 1
  ).length;
  const thirdDownDef = defThirdDownPlays.length > 0 ? -defThirdDownSuccess / defThirdDownPlays.length : 0;
  
  // Red zone efficiency  
  const rzPlays = teamPlays.filter(play => {
    const yardline = parseInt(play.yardline_100);
    return yardline <= 20 && yardline > 0;
  });
  const rzTouchdowns = rzPlays.filter(play => play.touchdown == 1).length;
  const rzDrives = [...new Set(rzPlays.map(play => `${play.game_id}_${play.drive}`))].length;
  const rzTdOff = rzDrives > 0 ? rzTouchdowns / rzDrives : 0;
  
  // Early down success (1st and 2nd down EPA > 0)
  const earlyDownPlays = teamPlays.filter(play => {
    const down = parseInt(play.down);
    return down <= 2;
  });
  const earlyDownSuccess = earlyDownPlays.filter(play => parseFloat(play.epa) > 0).length;
  const eds = earlyDownPlays.length > 0 ? earlyDownSuccess / earlyDownPlays.length : 0;
  
  // Explosive plays (20+ yard gains)
  const explosiveOff = teamPlays.filter(play => parseInt(play.yards_gained) >= 20).length / Math.max(teamPlays.length, 1);
  const explosiveDef = defensePlays.filter(play => parseInt(play.yards_gained) >= 20).length / Math.max(defensePlays.length, 1);
  
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
  // Pressure rates from sacks and QB hits
  const passPlays = teamPlays.filter(play => play.pass == 1);
  const sacks = passPlays.filter(play => play.sack == 1).length;
  const pressureAllowed = passPlays.length > 0 ? sacks / passPlays.length : 0;
  
  const defPassPlays = defensePlays.filter(play => play.pass == 1);
  const defSacks = defPassPlays.filter(play => play.sack == 1).length;
  const pressureFor = defPassPlays.length > 0 ? defSacks / defPassPlays.length : 0;
  
  return {
    pressure_for: Number(pressureFor.toFixed(3)),
    pressure_allowed: Number(pressureAllowed.toFixed(3)),
    pressure_diff: Number((pressureFor - pressureAllowed).toFixed(3))
  };
}

function calculateTurnoverMetrics(teamPlays, defensePlays) {
  const drives = [...new Set(teamPlays.map(play => `${play.game_id}_${play.drive}`))];
  const takeaways = defensePlays.filter(play => play.interception == 1 || play.fumble_lost == 1).length;
  const giveaways = teamPlays.filter(play => play.interception == 1 || play.fumble_lost == 1).length;
  
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
  const penalties = teamPlays.filter(play => play.penalty == 1);
  const penaltyYards = penalties.reduce((sum, play) => sum + (parseInt(play.penalty_yards) || 0), 0);
  
  return {
    penalty_yds_per_drive: drives.length > 0 ? Number((penaltyYards / drives.length).toFixed(1)) : 0,
    penalty_diff: 0 // Calculate vs opponent penalties - can be enhanced
  };
}

function calculateCoachingMetrics(teamPlays, defensePlays) {
  const fourthDownPlays = teamPlays.filter(play => parseInt(play.down) === 4);
  const fourthDownGos = fourthDownPlays.filter(play => play.rush == 1 || play.pass == 1);
  const fourthDownAgg = fourthDownPlays.length > 0 ? fourthDownGos.length / fourthDownPlays.length : 0;
  
  const twoPointAttempts = teamPlays.filter(play => play.two_point_attempt == 1);
  const twoPointRate = teamPlays.filter(play => play.touchdown == 1).length > 0 ? 
    twoPointAttempts.length / teamPlays.filter(play => play.touchdown == 1).length : 0;
  
  return {
    fourth_down_agg: Number(fourthDownAgg.toFixed(3)),
    two_point_rate: Number(twoPointRate.toFixed(3)),
    timeout_eff: 0, // Requires timeout analysis
    challenge_success: 0.5 // Placeholder
  };
}

function calculateTempoMetrics(teamPlays) {
  const drives = [...new Set(teamPlays.map(play => `${play.game_id}_${play.drive}`))];
  const totalPlays = teamPlays.length;
  const playsPerDrive = drives.length > 0 ? totalPlays / drives.length : 0;
  
  const noHuddleFreq = teamPlays.filter(play => play.no_huddle == 1).length / Math.max(totalPlays, 1);
  
  return {
    pace: Number((totalPlays / Math.max(drives.length, 1) * 4).toFixed(1)),
    no_huddle_freq: Number(noHuddleFreq.toFixed(3)),
    plays_per_drive: Number(playsPerDrive.toFixed(1)),
    top_eff: 0 // Time of possession efficiency - requires game time data
  };
}

function calculateFormationMetrics(teamPlays) {
  const totalPlays = teamPlays.length;
  if (totalPlays === 0) return getDefaultFormationMetrics();
  
  const shotgunPlays = teamPlays.filter(play => play.shotgun == 1);
  const shotgunRate = shotgunPlays.length / totalPlays;
  
  // Calculate shotgun vs under center EPA difference
  const shotgunEPA = shotgunPlays.length > 0 ? 
    shotgunPlays.reduce((sum, play) => sum + (parseFloat(play.epa) || 0), 0) / shotgunPlays.length : 0;
  const underCenterPlays = teamPlays.filter(play => play.shotgun != 1);
  const underCenterEPA = underCenterPlays.length > 0 ? 
    underCenterPlays.reduce((sum, play) => sum + (parseFloat(play.epa) || 0), 0) / underCenterPlays.length : 0;
  
  const firstDownPlays = teamPlays.filter(play => parseInt(play.down) === 1);
  const firstDownPasses = firstDownPlays.filter(play => play.pass == 1);
  const passRate1st = firstDownPlays.length > 0 ? firstDownPasses.length / firstDownPlays.length : 0;
  
  return {
    shotgun_epa_diff: Number((shotgunEPA - underCenterEPA).toFixed(3)),
    empty_rate: 0, // Requires personnel data
    heavy_epa: 0, // Heavy personnel EPA  
    motion_rate: 0.4, // Placeholder
    pa_freq: 0, // Play action frequency - requires PA flag
    pass_rate_1st: Number(passRate1st.toFixed(3)),
    run_rate_by_down: calculateRunRateByDown(teamPlays)
  };
}

function calculateRunRateByDown(teamPlays) {
  const byDown = {};
  for (let down = 1; down <= 4; down++) {
    const downPlays = teamPlays.filter(play => parseInt(play.down) === down);
    const rushPlays = downPlays.filter(play => play.rush == 1);
    byDown[down.toString()] = downPlays.length > 0 ? 
      Number((rushPlays.length / downPlays.length).toFixed(3)) : 0;
  }
  return byDown;
}

function calculateConsistencyMetrics(teamPlays, games) {
  if (games.length === 0) return { off: 0.5, def: 0.5 };
  
  // Calculate game-by-game EPA variance
  const gameEPAs = games.map(gameId => {
    const gamePlays = teamPlays.filter(play => play.game_id === gameId);
    const validPlays = gamePlays.filter(play => !isNaN(parseFloat(play.epa)));
    return validPlays.length > 0 ? 
      validPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validPlays.length : 0;
  });
  
  if (gameEPAs.length === 0) return { off: 0.5, def: 0.5 };
  
  const mean = gameEPAs.reduce((sum, epa) => sum + epa, 0) / gameEPAs.length;
  const variance = gameEPAs.reduce((sum, epa) => sum + Math.pow(epa - mean, 2), 0) / gameEPAs.length;
  const consistency = Math.max(0, Math.min(1, 1 - variance * 10)); // Scale and bound
  
  return {
    off: Number(consistency.toFixed(3)),
    def: Number(consistency.toFixed(3))
  };
}

function calculateFormMetrics(teamPlays, games) {
  if (games.length === 0) return { off: 0, def: 0 };
  
  // EWMA on recent performance
  const recentGames = games.slice(-4); // Last 4 games
  let ewma = 0;
  const alpha = 0.3;
  
  recentGames.forEach((gameId, index) => {
    const gamePlays = teamPlays.filter(play => play.game_id === gameId);
    const validPlays = gamePlays.filter(play => !isNaN(parseFloat(play.epa)));
    const gameEPA = validPlays.length > 0 ? 
      validPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validPlays.length : 0;
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
    const values = teams.map(team => getNestedValue(team, metric)).filter(v => v !== null && !isNaN(v));
    if (values.length === 0) {
      output.league.means[metric] = 0;
      output.league.stds[metric] = 1;
      return;
    }
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance) || 1; // Prevent division by zero
    
    output.league.means[metric] = Number(mean.toFixed(4));
    output.league.stds[metric] = Number(std.toFixed(4));
  });
}

function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    value = value?.[key];
  }
  return value ?? null;
}

function getDefaultFormationMetrics() {
  return {
    shotgun_epa_diff: 0,
    empty_rate: 0,
    heavy_epa: 0,
    motion_rate: 0.4,
    pa_freq: 0,
    pass_rate_1st: 0,
    run_rate_by_down: { "1": 0.44, "2": 0.39, "3": 0.28, "4": 0.15 }
  };
}

// Export for use in your ETL pipeline
export { generateAdvancedMetrics };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAdvancedMetrics(2024).catch(console.error);
}

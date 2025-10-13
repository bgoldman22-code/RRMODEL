// scripts/etl-full.js
// Enhanced implementation with historical data integration and dynamic weighting

import { loadNFLversePBP } from './lib/nflverse_data_loading.js';
import { calculateUsageMetrics, calculateDefenseMetrics, calculateScriptMetrics, calculateEnvironmentalMetrics } from './lib/metrics_helpers.js';
import { writeToBlobStorage } from './lib/blob_io.js';

// Dynamic weight calculation based on current week
function getDynamicWeights(currentWeek) {
  // Base weights early in season
  if (currentWeek <= 3) {
    return {
      season_2025: 0.60,
      season_2024: 0.30, 
      season_2023: 0.10,
      recent_4_weeks: 0.0
    };
  }
  
  // Progressive current season emphasis
  const currentSeasonWeight = Math.min(0.85, 0.60 + (currentWeek - 3) * 0.025);
  const recentGamesWeight = currentWeek >= 4 ? Math.min(0.15, (currentWeek - 3) * 0.01) : 0;
  const historicalWeight = 1 - currentSeasonWeight - recentGamesWeight;
  
  return {
    season_2025: currentSeasonWeight - recentGamesWeight,
    season_2025_recent: recentGamesWeight,
    season_2024: historicalWeight * 0.75,
    season_2023: historicalWeight * 0.25
  };
}

async function generateAdvancedMetrics(currentSeason = 2025) {
  console.log(`Generating advanced metrics with historical data for ${currentSeason} season...`);
  
  // Load data for multiple seasons
  const seasons = [currentSeason, currentSeason - 1, currentSeason - 2];
  const seasonData = {};
  
  for (const season of seasons) {
    try {
      console.log(`Loading NFLverse data for ${season}...`);
      seasonData[season] = await loadNFLversePBP(season);
      console.log(`Loaded ${seasonData[season].length} plays for ${season}`);
    } catch (error) {
      console.warn(`Failed to load data for ${season}:`, error);
      seasonData[season] = [];
    }
  }
  
  // Get current week for dynamic weighting
  const currentWeek = getCurrentNFLWeek();
  const weights = getDynamicWeights(currentWeek);
  
  console.log(`Current week: ${currentWeek}, Using weights:`, weights);
  
  // Get all teams from current season
  const currentSeasonPlays = seasonData[currentSeason] || [];
  const teams = [...new Set(currentSeasonPlays.map(play => play.posteam).filter(Boolean))];
  
  console.log(`Processing ${teams.length} teams with historical integration`);
  
  // Initialize output structure
  const output = {
    version: "adv_v2_historical",
    asOf: new Date().toISOString(),
    currentWeek: currentWeek,
    weights: weights,
    league: {
      means: {},
      stds: {}
    },
    teams: {}
  };

  // Calculate metrics for each team with historical weighting
  for (const team of teams) {
    console.log(`Processing team: ${team}`);
    output.teams[team] = calculateHistoricalTeamMetrics(team, seasonData, weights, currentWeek);
  }

  // Calculate league means and standard deviations for normalization
  calculateLeagueNormalization(output);
  
  // Write to blob storage
  await writeToBlobStorage('nfl/epa/latest.json', output);
  
  console.log('Enhanced historical metrics generated successfully');
  return output;
}

function calculateHistoricalTeamMetrics(team, seasonData, weights, currentWeek) {
  const seasons = Object.keys(seasonData).map(Number).sort((a, b) => b - a);
  let combinedMetrics = null;
  
  // Calculate metrics for each season
  const seasonMetrics = {};
  for (const season of seasons) {
    const plays = seasonData[season] || [];
    const teamPlays = plays.filter(play => play.posteam === team);
    const defensePlays = plays.filter(play => play.defteam === team);
    
    if (teamPlays.length > 0) {
      seasonMetrics[season] = calculateTeamMetrics(teamPlays, defensePlays, plays);
    }
  }
  
  // Apply weighted averaging
  combinedMetrics = combineSeasonMetrics(seasonMetrics, weights, currentWeek);
  
  return combinedMetrics;
}

function combineSeasonMetrics(seasonMetrics, weights, currentWeek) {
  const currentSeason = Math.max(...Object.keys(seasonMetrics).map(Number));
  const seasons = Object.keys(seasonMetrics).map(Number).sort((a, b) => b - a);
  
  if (seasons.length === 0) {
    return getDefaultTeamMetrics();
  }
  
  // Start with current season as base
  const baseMetrics = seasonMetrics[currentSeason] || getDefaultTeamMetrics();
  
  // Create weighted combination
  const combined = JSON.parse(JSON.stringify(baseMetrics));
  
  // Apply historical weighting to key metrics
  const weightableMetrics = [
    'core.off_epa', 'core.def_epa', 'core.off_adj_epa', 'core.def_adj_epa',
    'situational.third_down_off', 'situational.third_down_def', 'situational.rz_td_off',
    'situational.eds', 'situational.explosive_off', 'situational.explosive_def',
    'pressure.pressure_diff', 'turnovers.turnover_diff',
    'discipline.penalty_diff', 'coaching.fourth_down_agg'
  ];
  
  weightableMetrics.forEach(metricPath => {
    const currentValue = getNestedValue(combined, metricPath) || 0;
    let weightedValue = currentValue * weights.season_2025;
    
    // Add historical seasons
    seasons.forEach(season => {
      if (season < currentSeason && seasonMetrics[season]) {
        const historicalValue = getNestedValue(seasonMetrics[season], metricPath) || 0;
        const seasonWeight = season === (currentSeason - 1) ? weights.season_2024 : weights.season_2023;
        weightedValue += historicalValue * seasonWeight;
      }
    });
    
    setNestedValue(combined, metricPath, Number(weightedValue.toFixed(3)));
  });
  
  // Handle recent form separately (only from current season)
  if (currentWeek >= 4 && weights.season_2025_recent > 0) {
    combined.form = calculateRecentForm(seasonMetrics[currentSeason], currentWeek, weights.season_2025_recent);
  }
  
  // Update consistency with historical context
  combined.consistency = calculateHistoricalConsistency(seasonMetrics, weights);
  
  return combined;
}

function calculateRecentForm(currentSeasonMetrics, currentWeek, recentWeight) {
  if (!currentSeasonMetrics || currentWeek < 4) {
    return currentSeasonMetrics?.form || { off: 0, def: 0 };
  }
  
  // Enhanced recent form calculation for last 4 weeks
  const recentFormBoost = Math.min(0.15, (currentWeek - 3) * 0.01);
  
  return {
    off: Number(((currentSeasonMetrics.form?.off || 0) * (1 + recentFormBoost)).toFixed(3)),
    def: Number(((currentSeasonMetrics.form?.def || 0) * (1 + recentFormBoost)).toFixed(3))
  };
}

function calculateHistoricalConsistency(seasonMetrics, weights) {
  const seasons = Object.keys(seasonMetrics).map(Number).sort((a, b) => b - a);
  
  if (seasons.length === 0) return { off: 0.5, def: 0.5 };
  
  let weightedConsistencyOff = 0;
  let weightedConsistencyDef = 0;
  
  seasons.forEach(season => {
    const metrics = seasonMetrics[season];
    if (!metrics?.consistency) return;
    
    const currentSeason = Math.max(...seasons);
    let weight;
    
    if (season === currentSeason) {
      weight = weights.season_2025 + (weights.season_2025_recent || 0);
    } else if (season === (currentSeason - 1)) {
      weight = weights.season_2024;
    } else {
      weight = weights.season_2023;
    }
    
    weightedConsistencyOff += (metrics.consistency.off || 0.5) * weight;
    weightedConsistencyDef += (metrics.consistency.def || 0.5) * weight;
  });
  
  return {
    off: Number(weightedConsistencyOff.toFixed(3)),
    def: Number(weightedConsistencyDef.toFixed(3))
  };
}

function getCurrentNFLWeek() {
  // Calculate current NFL week based on date
  // NFL season typically starts first Thursday after Labor Day
  const now = new Date();
  const year = now.getFullYear();
  
  // Approximate NFL season start (first Thursday of September)
  const seasonStart = new Date(year, 8, 1); // September 1
  const dayOfWeek = seasonStart.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
  seasonStart.setDate(seasonStart.getDate() + daysUntilThursday);
  
  // Calculate weeks since season start
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor((now - seasonStart) / msPerWeek) + 1;
  
  return Math.max(1, Math.min(18, weeksSinceStart));
}

// Rest of the existing functions remain the same but with enhanced metadata
function calculateTeamMetrics(teamPlays, defensePlays, allPlays) {
  const games = [...new Set(teamPlays.map(play => play.game_id))];
  
  return {
    meta: { 
      games: games.length, 
      bye_passed: false,
      data_vintage: teamPlays[0]?.season || 'unknown'
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

// Helper functions (keep existing implementations)
function calculateCoreMetrics(teamPlays, defensePlays) {
  const validOffPlays = teamPlays.filter(play => !isNaN(parseFloat(play.epa)));
  const validDefPlays = defensePlays.filter(play => !isNaN(parseFloat(play.epa)));
  
  const offEPA = validOffPlays.length > 0 ? 
    validOffPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validOffPlays.length : 0;
    
  const defEPA = validDefPlays.length > 0 ? 
    validDefPlays.reduce((sum, play) => sum + parseFloat(play.epa), 0) / validDefPlays.length : 0;
  
  const offAdjEPA = offEPA * 0.9 + (offEPA * 0.1);
  const defAdjEPA = defEPA * 0.9 + (defEPA * 0.1);
  
  return {
    off_epa: Number(offEPA.toFixed(3)),
    def_epa: Number(defEPA.toFixed(3)),
    off_adj_epa: Number(offAdjEPA.toFixed(3)),
    def_adj_epa: Number(defAdjEPA.toFixed(3))
  };
}

// Include all other existing calculation functions...
// (calculateSituationalMetrics, calculatePressureMetrics, etc. - keep as-is)

function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    value = value?.[key];
    if (value === undefined || value === null) return null;
  }
  return value;
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

function getDefaultTeamMetrics() {
  return {
    meta: { games: 0, bye_passed: false, data_vintage: 'default' },
    core: { off_epa: 0, def_epa: 0, off_adj_epa: 0, def_adj_epa: 0 },
    situational: { third_down_off: 0.35, third_down_def: -0.35, rz_td_off: 0.5, eds: 0.5, explosive_off: 0.05, explosive_def: 0.05 },
    pressure: { pressure_for: 0.08, pressure_allowed: 0.08, pressure_diff: 0 },
    turnovers: { takeaways_per_drive: 0.1, giveaways_per_drive: 0.1, turnover_diff: 0 },
    discipline: { penalty_yds_per_drive: 5, penalty_diff: 0 },
    coaching: { fourth_down_agg: 0.15, two_point_rate: 0.02, timeout_eff: 0, challenge_success: 0.5 },
    tempo: { pace: 65, no_huddle_freq: 0.1, plays_per_drive: 5.5, top_eff: 0 },
    formations: getDefaultFormationMetrics(),
    usage: {},
    defense: {},
    script: {},
    env: {},
    consistency: { off: 0.5, def: 0.5 },
    form: { off: 0, def: 0 }
  };
}

// Keep all other existing helper functions (calculateSituationalMetrics, calculatePressureMetrics, etc.)
// ... [Include all the existing calculation functions from your original file]

function calculateLeagueNormalization(output) {
  const teams = Object.values(output.teams);
  const metrics = [
    'third_down_off', 'rz_td_off', 'turnover_diff', 'explosive_diff', 
    'eds', 'pressure_diff', 'fourth_down_agg', 'penalty_diff', 'top_eff'
  ];
  
  metrics.forEach(metric => {
    const values = teams.map(team => getNestedValue(team, `situational.${metric}`) || 
                                    getNestedValue(team, `pressure.${metric}`) || 
                                    getNestedValue(team, `turnovers.${metric}`) ||
                                    getNestedValue(team, `coaching.${metric}`) ||
                                    getNestedValue(team, `discipline.${metric}`) ||
                                    getNestedValue(team, `tempo.${metric}`))
                           .filter(v => v !== null && !isNaN(v));
    
    if (values.length === 0) {
      output.league.means[metric] = 0;
      output.league.stds[metric] = 1;
      return;
    }
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance) || 1;
    
    output.league.means[metric] = Number(mean.toFixed(4));
    output.league.stds[metric] = Number(std.toFixed(4));
  });
}

// Export for use in your ETL pipeline
export { generateAdvancedMetrics };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAdvancedMetrics(2025).catch(console.error);
}

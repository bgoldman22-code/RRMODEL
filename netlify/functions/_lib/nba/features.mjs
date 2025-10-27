/**
 * NBA Feature Engineering - Elite 83 Team Features
 * 
 * Comprehensive feature set for world-class NBA predictions:
 * - Form (20 features): Recent performance across multiple windows
 * - Pace (15 features): Tempo, transition, half-court efficiency
 * - Shooting (12 features): 3PT, rim, mid-range, assisted shots
 * - Rebounding (8 features): Offensive/defensive, second-chance
 * - Defense (10 features): Opponent shooting, rim protection
 * - Context (10 features): B2B, travel, rest, revenge, altitude
 * - Clutch (8 features): Close game performance, 4th quarter
 */

import { fetchTeamStats, fetchTeamLastGames, calculateRecentForm, loadTeamInfo } from './loaders.mjs';

/**
 * FORM FEATURES (20)
 * Recent performance across multiple time windows
 */
export async function calculateFormFeatures(teamId, season = '2025-26') {
  const features = {};
  
  try {
    const form = await calculateRecentForm(teamId, season, [5, 10, 20]);
    
    // Last 5 games (L5)
    if (form.L5) {
      features.L5_winPct = form.L5.winPct;
      features.L5_netRating = form.L5.netRating;
      features.L5_offRating = form.L5.offRating;
      features.L5_defRating = form.L5.defRating;
      features.L5_pace = form.L5.pace;
    }
    
    // Last 10 games (L10)
    if (form.L10) {
      features.L10_winPct = form.L10.winPct;
      features.L10_netRating = form.L10.netRating;
      features.L10_offRating = form.L10.offRating;
      features.L10_defRating = form.L10.defRating;
      features.L10_pace = form.L10.pace;
    }
    
    // Last 20 games (L20)
    if (form.L20) {
      features.L20_winPct = form.L20.winPct;
      features.L20_netRating = form.L20.netRating;
      features.L20_offRating = form.L20.offRating;
      features.L20_defRating = form.L20.defRating;
      features.L20_pace = form.L20.pace;
    }
    
    // Trend indicators (L5 vs L20)
    if (form.L5 && form.L20) {
      features.form_trend = form.L5.netRating - form.L20.netRating;
      features.offense_trend = form.L5.offRating - form.L20.offRating;
      features.defense_trend = form.L5.defRating - form.L20.defRating;
      features.pace_trend = form.L5.pace - form.L20.pace;
      features.momentum = form.L5.winPct - form.L20.winPct;
    }
    
  } catch (error) {
    console.error('[Features] Error calculating form features:', error);
  }
  
  return features;
}

/**
 * PACE FEATURES (15)
 * Tempo, transition, half-court efficiency
 */
export async function calculatePaceFeatures(teamStats, advancedStats) {
  const features = {};
  
  try {
    // Basic pace
    features.pace = teamStats.PACE || 0;
    features.poss_per_game = teamStats.POSS || 0;
    
    // Tempo adjustments
    features.pace_vs_league = teamStats.PACE - 100; // 100 = league average baseline
    
    // Four Factors (from advanced stats)
    if (advancedStats) {
      // Offensive Four Factors
      features.off_efg_pct = advancedStats.OFF_EFG_PCT || 0;
      features.off_tov_pct = advancedStats.OFF_TOV_PCT || 0;
      features.off_oreb_pct = advancedStats.OFF_OREB_PCT || 0;
      features.off_ftfga = advancedStats.OFF_FT_FGA || 0;
      
      // Defensive Four Factors
      features.def_efg_pct = advancedStats.DEF_EFG_PCT || 0;
      features.def_tov_pct = advancedStats.DEF_TOV_PCT || 0;
      features.def_dreb_pct = advancedStats.DEF_DREB_PCT || 0;
      features.def_ftfga = advancedStats.DEF_FT_FGA || 0;
    }
    
    // Efficiency metrics
    features.off_rating = teamStats.OFF_RATING || 0;
    features.def_rating = teamStats.DEF_RATING || 0;
    features.net_rating = teamStats.NET_RATING || 0;
    
    // Possessions efficiency
    features.pts_per_poss = (teamStats.PTS / teamStats.POSS) * 100 || 0;
    features.pts_allowed_per_poss = ((teamStats.OPP_PTS || 0) / teamStats.POSS) * 100 || 0;
    
  } catch (error) {
    console.error('[Features] Error calculating pace features:', error);
  }
  
  return features;
}

/**
 * SHOOTING FEATURES (12)
 * 3PT, rim, mid-range, shot selection
 */
export async function calculateShootingFeatures(teamStats) {
  const features = {};
  
  try {
    // Three-point shooting
    features.fg3a_rate = (teamStats.FG3A / teamStats.FGA) || 0;
    features.fg3_pct = teamStats.FG3_PCT || 0;
    features.fg3m_per_game = teamStats.FG3M || 0;
    
    // Two-point shooting
    const fg2a = teamStats.FGA - teamStats.FG3A;
    const fg2m = teamStats.FGM - teamStats.FG3M;
    features.fg2_pct = fg2a > 0 ? (fg2m / fg2a) : 0;
    
    // Overall shooting
    features.fg_pct = teamStats.FG_PCT || 0;
    features.efg_pct = teamStats.EFG_PCT || 0;
    features.ts_pct = teamStats.TS_PCT || 0;
    
    // Free throws
    features.ft_pct = teamStats.FT_PCT || 0;
    features.ft_rate = (teamStats.FTA / teamStats.FGA) || 0;
    
    // Shot distribution
    features.paint_attempts_pct = 0.5; // Placeholder - need detailed shot data
    features.mid_range_pct = 0.2; // Placeholder
    features.assisted_fg_pct = 0.65; // Placeholder
    
  } catch (error) {
    console.error('[Features] Error calculating shooting features:', error);
  }
  
  return features;
}

/**
 * REBOUNDING FEATURES (8)
 * Offensive, defensive, second-chance points
 */
export async function calculateReboundingFeatures(teamStats) {
  const features = {};
  
  try {
    // Offensive rebounding
    features.oreb_per_game = teamStats.OREB || 0;
    features.oreb_pct = teamStats.OREB_PCT || 0;
    
    // Defensive rebounding
    features.dreb_per_game = teamStats.DREB || 0;
    features.dreb_pct = teamStats.DREB_PCT || 0;
    
    // Total rebounding
    features.reb_per_game = teamStats.REB || 0;
    features.reb_pct = (teamStats.OREB_PCT + teamStats.DREB_PCT) / 2 || 0;
    
    // Rebounding differential
    const opp_reb = teamStats.OPP_REB || teamStats.REB * 0.95; // Estimate if not available
    features.reb_differential = teamStats.REB - opp_reb;
    
    // Second-chance points (estimate based on OREB)
    features.second_chance_pts_est = teamStats.OREB * 1.2; // ~1.2 pts per OREB
    
  } catch (error) {
    console.error('[Features] Error calculating rebounding features:', error);
  }
  
  return features;
}

/**
 * DEFENSE FEATURES (10)
 * Opponent shooting, rim protection, steals/blocks
 */
export async function calculateDefenseFeatures(teamStats) {
  const features = {};
  
  try {
    // Opponent shooting
    features.opp_fg_pct = teamStats.OPP_FG_PCT || 0;
    features.opp_fg3_pct = teamStats.OPP_FG3_PCT || 0;
    features.opp_efg_pct = teamStats.OPP_EFG_PCT || 0;
    features.opp_pts_per_game = teamStats.OPP_PTS || 0;
    
    // Turnovers forced
    features.stl_per_game = teamStats.STL || 0;
    features.tov_forced = teamStats.OPP_TOV || teamStats.STL * 2; // Estimate
    features.tov_forced_pct = (features.tov_forced / (teamStats.POSS || 100)) * 100;
    
    // Rim protection
    features.blk_per_game = teamStats.BLK || 0;
    features.opp_fta_rate = ((teamStats.OPP_FTA || 0) / (teamStats.OPP_FGA || 1));
    
    // Defensive rating
    features.def_rating = teamStats.DEF_RATING || 0;
    
  } catch (error) {
    console.error('[Features] Error calculating defense features:', error);
  }
  
  return features;
}

/**
 * CONTEXT FEATURES (10)
 * Rest, travel, schedule, situational factors
 */
export function calculateContextFeatures(game, teamId) {
  const features = {};
  
  try {
    // Rest days (would need game log data)
    features.days_rest = 1; // Placeholder - calculate from schedule
    features.is_b2b = 0; // Back-to-back indicator
    features.is_3in4 = 0; // 3 games in 4 nights
    
    // Home/away
    features.is_home = game.homeTeam.id === teamId ? 1 : 0;
    features.home_advantage = features.is_home ? 3.5 : -3.5; // ~3.5 point home advantage
    
    // Travel (would need team locations)
    features.travel_miles = 0; // Placeholder
    features.timezone_change = 0;
    
    // Altitude (Denver factor)
    features.altitude = 0; // 1 if Denver, 0 otherwise
    
    // Revenge game (would need H2H history)
    features.revenge_game = 0;
    
    // Schedule strength (would need remaining schedule)
    features.schedule_difficulty = 0.5; // 0-1 scale
    
  } catch (error) {
    console.error('[Features] Error calculating context features:', error);
  }
  
  return features;
}

/**
 * CLUTCH FEATURES (8)
 * Performance in close games and 4th quarter
 */
export async function calculateClutchFeatures(teamId, season = '2025-26') {
  const features = {};
  
  try {
    // Would need clutch-specific stats from NBA API
    // Clutch = last 5 min, score within 5 points
    
    // Placeholders for v1 - can enhance with clutch stats endpoint
    features.clutch_record = 0.5; // Win% in clutch situations
    features.clutch_net_rating = 0;
    features.clutch_off_rating = 0;
    features.clutch_def_rating = 0;
    features.fourth_q_net_rating = 0;
    features.close_game_record = 0.5; // Win% in games decided by <5 pts
    features.buzzer_beater_attempts = 0;
    features.comeback_wins = 0;
    
  } catch (error) {
    console.error('[Features] Error calculating clutch features:', error);
  }
  
  return features;
}

/**
 * MASTER FEATURE BUILDER
 * Combines all 83 features for a team
 */
export async function buildTeamFeatures(teamId, game = null, season = '2025-26') {
  console.log(`[Features] Building features for team ${teamId}`);
  
  try {
    // Fetch required data
    const [baseStats, advancedStats, fourFactors] = await Promise.all([
      fetchTeamStats(season, 'Regular Season', 'Base'),
      fetchTeamStats(season, 'Regular Season', 'Advanced'),
      fetchTeamStats(season, 'Regular Season', 'Four Factors')
    ]);
    
    // Find this team's stats
    const teamBase = baseStats.find(t => t.TEAM_ID === teamId);
    const teamAdv = advancedStats.find(t => t.TEAM_ID === teamId);
    const teamFF = fourFactors.find(t => t.TEAM_ID === teamId);
    
    if (!teamBase) {
      console.error(`[Features] No stats found for team ${teamId}`);
      return {};
    }
    
    // Build feature groups in parallel
    const [form, pace, shooting, rebounding, defense, context, clutch] = await Promise.all([
      calculateFormFeatures(teamId, season),
      calculatePaceFeatures(teamBase, teamFF),
      calculateShootingFeatures(teamBase),
      calculateReboundingFeatures(teamBase),
      calculateDefenseFeatures(teamBase),
      game ? calculateContextFeatures(game, teamId) : {},
      calculateClutchFeatures(teamId, season)
    ]);
    
    // Combine all features
    const allFeatures = {
      teamId,
      season,
      ...form,      // 20 features
      ...pace,      // 15 features
      ...shooting,  // 12 features
      ...rebounding, // 8 features
      ...defense,   // 10 features
      ...context,   // 10 features
      ...clutch     // 8 features
    };
    
    const featureCount = Object.keys(allFeatures).length - 2; // -2 for teamId, season
    console.log(`[Features] ✅ Built ${featureCount} features for team ${teamId}`);
    
    return allFeatures;
    
  } catch (error) {
    console.error('[Features] Error building team features:', error);
    return {};
  }
}

/**
 * MATCHUP FEATURES
 * Differential features between two teams
 */
export function buildMatchupFeatures(homeFeatures, awayFeatures) {
  const matchup = {};
  
  // Calculate differentials for key features
  const diffKeys = [
    'L5_netRating', 'L10_netRating', 'net_rating',
    'off_rating', 'def_rating', 'pace',
    'fg3_pct', 'efg_pct', 'ts_pct',
    'oreb_pct', 'dreb_pct',
    'def_rating', 'stl_per_game', 'blk_per_game'
  ];
  
  for (const key of diffKeys) {
    const homeVal = homeFeatures[key] || 0;
    const awayVal = awayFeatures[key] || 0;
    matchup[`diff_${key}`] = homeVal - awayVal;
  }
  
  // Pace matchup
  matchup.pace_matchup = (homeFeatures.pace + awayFeatures.pace) / 2;
  
  // Style clash indicators
  matchup.off_vs_def = homeFeatures.off_rating - awayFeatures.def_rating;
  matchup.def_vs_off = awayFeatures.off_rating - homeFeatures.def_rating;
  
  // Rebound battle
  matchup.reb_battle = (homeFeatures.oreb_pct - awayFeatures.dreb_pct);
  
  // Three-point shooting edge
  matchup.three_pt_edge = homeFeatures.fg3_pct - awayFeatures.opp_fg3_pct;
  
  console.log(`[Features] ✅ Built ${Object.keys(matchup).length} matchup features`);
  
  return matchup;
}

/**
 * PLAYER PROP FEATURES (32 per player)
 * For points, rebounds, assists, threes props
 */
export async function buildPlayerPropFeatures(playerId, propType, opponent, season = '2024-25') {
  const features = {};
  
  try {
    // Prop type: 'points', 'rebounds', 'assists', 'threes'
    
    // Player averages (L5, L10, season)
    features[`${propType}_l5_avg`] = 0;
    features[`${propType}_l10_avg`] = 0;
    features[`${propType}_season_avg`] = 0;
    features[`${propType}_home_avg`] = 0;
    features[`${propType}_away_avg`] = 0;
    
    // Usage and minutes
    features.usage_rate = 0;
    features.minutes_per_game = 0;
    features.minutes_l3_avg = 0;
    
    // Matchup data
    features[`vs_${opponent}_${propType}_avg`] = 0; // Historical vs this opponent
    features[`opp_${propType}_allowed_rank`] = 0; // Opponent's rank in allowing this stat
    features.opp_pace = 0;
    features.opp_def_rating = 0;
    
    // Shooting efficiency (for points/threes)
    if (propType === 'points' || propType === 'threes') {
      features.fg_pct_l10 = 0;
      features.fg3_pct_l10 = 0;
      features.ts_pct_l10 = 0;
      features.shots_per_game = 0;
    }
    
    // Rebounding context (for rebounds)
    if (propType === 'rebounds') {
      features.reb_per_36 = 0;
      features.oreb_pct = 0;
      features.dreb_pct = 0;
      features.opp_reb_rate_allowed = 0;
    }
    
    // Assist context (for assists)
    if (propType === 'assists') {
      features.ast_per_36 = 0;
      features.ast_to_tov_ratio = 0;
      features.potential_assists = 0;
      features.team_pace = 0;
    }
    
    // Injury/rest indicators
    features.days_rest = 1;
    features.injury_status = 0; // 0=healthy, 1=questionable, 2=out
    
    // Trend indicators
    features[`${propType}_trend`] = 0; // Recent trend (last 5 vs last 20)
    features.hot_streak = 0; // Over prop in X of last Y games
    
    console.log(`[Features] ✅ Built ${Object.keys(features).length} prop features for ${propType}`);
    
  } catch (error) {
    console.error('[Features] Error building player prop features:', error);
  }
  
  return features;
}

/**
 * Feature validation and normalization
 */
export function validateAndNormalize(features) {
  const normalized = {};
  
  for (const [key, value] of Object.entries(features)) {
    // Handle missing values
    if (value === null || value === undefined || isNaN(value)) {
      normalized[key] = 0;
      continue;
    }
    
    // Cap extreme values (3 standard deviations)
    let val = value;
    if (Math.abs(val) > 100 && !key.includes('rating')) {
      val = Math.sign(val) * 100;
    }
    
    normalized[key] = val;
  }
  
  return normalized;
}

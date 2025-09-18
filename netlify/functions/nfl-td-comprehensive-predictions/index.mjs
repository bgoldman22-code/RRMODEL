// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// Advanced NFL TD Prediction Engine with Multi-Path Analysis

import { getStore } from '@netlify/blobs';

const STORE = process.env.BLOBS_STORE_NFL || 'nfl-td';

// Advanced feature weights for comprehensive TD prediction
const TD_MODEL_WEIGHTS = {
  // ANYTIME TD Model - Multi-path approach
  ANYTIME: {
    // Red Zone Path (40% of model)
    red_zone_opportunities: 0.20,     // Expected RZ touches per game
    red_zone_efficiency: 0.12,        // Historical RZ TD rate
    goal_line_specialist: 0.08,       // Goal line usage rate
    
    // Explosive Play Path (25% of model)
    explosive_play_propensity: 0.15,  // 20+ yard TD capability
    deep_target_share: 0.10,          // Deep passing involvement
    
    // Opportunistic Path (20% of model) 
    situational_usage: 0.10,          // 3rd down, 2-min drill usage
    injury_opportunity_boost: 0.10,   // Boost from teammate injuries
    
    // Consistency/Reliability (15% of model)
    historical_td_rate: 0.08,         // Career TD per game rate
    opponent_matchup: 0.07            // Historical vs opponent
  },
  
  // FIRST TD Model - Opening drive focus
  FIRST_TD: {
    opening_drive_involvement: 0.35,   // First drive target/touch rate
    team_first_drive_success: 0.25,    // Team's opening drive TD rate
    early_game_usage: 0.20,           // Usage in first quarter
    anytime_base_factor: 0.20         // Scaled anytime probability
  },
  
  // MULTIPLE TD Model - Game script dependent
  MULTIPLE_TD: {
    anytime_probability_squared: 0.40,  // Base probability factor
    game_script_favorable: 0.25,       // Blowout/high-scoring potential
    historical_multi_rate: 0.20,       // Player's multi-TD history
    elite_usage_bonus: 0.15            // High-volume player bonus
  }
};

// Team situational factors
const TEAM_CONTEXT_WEIGHTS = {
  red_zone_efficiency: 0.15,          // Team RZ TD rate
  explosive_play_rate: 0.12,          // Team explosive play tendency
  pace_factor: 0.10,                  // Plays per game
  scoring_environment: 0.08,          // Expected total points
  first_drive_success: 0.05           // Opening drive TD rate
};

// Opponent defensive factors  
const OPPONENT_WEIGHTS = {
  position_defense: 0.20,             // TDs allowed to position
  red_zone_defense: 0.15,             // RZ defense rating
  explosive_defense: 0.10,            // Big plays allowed
  overall_defense: 0.05               // General defensive quality
};

function parseIntOr(v, d) { 
  const n = parseInt(v, 10); 
  return Number.isFinite(n) ? n : d; 
}

async function readJsonFromBlobs(key) {
  try {
    const store = getStore({ 
      name: STORE, 
      siteID: process.env.NETLIFY_SITE_ID, 
      token: process.env.NETLIFY_TOKEN 
    });
    const blob = await store.get(key, { type: 'json' });
    return blob || null;
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return null;
  }
}

async function writeJsonToBlobs(key, data) {
  try {
    const store = getStore({ 
      name: STORE, 
      siteID: process.env.NETLIFY_SITE_ID, 
      token: process.env.NETLIFY_TOKEN 
    });
    await store.set(key, JSON.stringify(data), { contentType: 'application/json' });
    return true;
  } catch (error) {
    console.error(`Error writing ${key}:`, error);
    return false;
  }
}

// Main prediction calculation functions
function calculateAnytimeTDProbability(player, teamContext, opponentAnalysis, gameContext) {
  console.log(`Calculating ANYTIME TD for ${player.name} (${player.position})`);
  
  const weights = TD_MODEL_WEIGHTS.ANYTIME;
  let totalScore = 0;
  
  // RED ZONE PATH (40% of model)
  const rzOpportunities = calculateRedZoneOpportunities(player, teamContext, gameContext);
  const rzEfficiency = player.historical?.red_zone_efficiency || getPositionDefault(player.position, 'rz_efficiency');
  const goalLineUsage = player.situational?.goal_line_specialist || 0;
  
  totalScore += rzOpportunities * weights.red_zone_opportunities;
  totalScore += rzEfficiency * weights.red_zone_efficiency;
  totalScore += goalLineUsage * weights.goal_line_specialist;
  
  // EXPLOSIVE PLAY PATH (25% of model)
  const explosivePropensity = calculateExplosivePropensity(player, teamContext, opponentAnalysis);
  const deepTargetShare = player.opportunity_factors?.air_yards_share || 0;
  
  totalScore += explosivePropensity * weights.explosive_play_propensity;
  totalScore += deepTargetShare * weights.deep_target_share;
  
  // OPPORTUNISTIC PATH (20% of model)
  const situationalUsage = calculateSituationalUsage(player);
  const injuryBoost = calculateInjuryOpportunityBoost(player, gameContext);
  
  totalScore += situationalUsage * weights.situational_usage;
  totalScore += injuryBoost * weights.injury_opportunity_boost;
  
  // CONSISTENCY PATH (15% of model)
  const historicalRate = player.historical?.career_td_rate || 0;
  const opponentMatchup = calculateOpponentMatchup(player, opponentAnalysis);
  
  totalScore += historicalRate * weights.historical_td_rate;
  totalScore += opponentMatchup * weights.opponent_matchup;
  
  // Convert to probability with position-specific scaling
  const baseProbability = Math.max(0.01, Math.min(0.75, totalScore));
  const positionAdjusted = applyPositionScaling(baseProbability, player.position);
  
  console.log(`${player.name}: Base=${baseProbability.toFixed(3)}, Position Adjusted=${positionAdjusted.toFixed(3)}`);
  return positionAdjusted;
}

function calculateFirstTDProbability(player, teamContext, anytimeProbability, gameContext) {
  const weights = TD_MODEL_WEIGHTS.FIRST_TD;
  
  // Opening drive involvement
  const openingDriveUsage = player.situational?.first_down_usage || getPositionDefault(player.position, 'first_drive');
  const teamFirstDriveRate = teamContext?.first_drive_success_rate || 0.25;
  const earlyGameUsage = calculateEarlyGameUsage(player);
  
  const firstTDScore = 
    (openingDriveUsage * weights.opening_drive_involvement) +
    (teamFirstDriveRate * weights.team_first_drive_success) +
    (earlyGameUsage * weights.early_game_usage) +
    (anytimeProbability * weights.anytime_base_factor);
  
  // First TD is generally much lower probability
  return Math.max(0.005, Math.min(0.20, firstTDScore * 0.15));
}

function calculateMultipleTDProbability(player, teamContext, anytimeProbability, gameContext) {
  const weights = TD_MODEL_WEIGHTS.MULTIPLE_TD;
  
  // Base on squared anytime probability (conservative)
  const baseMultiple = Math.pow(anytimeProbability, 1.8);
  
  // Game script favorability
  const gameScriptBoost = calculateGameScriptFavorability(teamContext, gameContext);
  
  // Historical multi-TD rate
  const historicalMultiRate = calculateHistoricalMultiTDRate(player);
  
  // Elite usage bonus
  const eliteBonus = calculateEliteUsageBonus(player);
  
  const multipleTDScore = 
    (baseMultiple * weights.anytime_probability_squared) +
    (gameScriptBoost * weights.game_script_favorable) +
    (historicalMultiRate * weights.historical_multi_rate) +
    (eliteBonus * weights.elite_usage_bonus);
  
  return Math.max(0.005, Math.min(0.35, multipleTDScore));
}

// Helper calculation functions
function calculateRedZoneOpportunities(player, teamContext, gameContext) {
  const teamRZTrips = teamContext?.red_zone_trip_rate || 3.0;
  const playerRZShare = player.opportunity_factors?.red_zone_target_share || 
                       getPositionDefault(player.position, 'rz_share');
  const snapShare = player.current_season?.snap_percentage || 0.5;
  
  return (teamRZTrips * playerRZShare * snapShare) / 10; // Normalize
}

function calculateExplosivePropensity(player, teamContext, opponentAnalysis) {
  const playerExplosive = player.historical?.explosive_td_rate || 
                         getPositionDefault(player.position, 'explosive_rate');
  const teamExplosive = teamContext?.explosive_play_rate || 0.08;
  const oppDefense = opponentAnalysis?.explosive_defense || 1.0;
  
  return (playerExplosive * teamExplosive * oppDefense) * 2; // Scale up
}

function calculateSituationalUsage(player) {
  const thirdDownUsage = player.situational?.third_down_usage || 0;
  const twoMinuteUsage = player.situational?.two_minute_drill_usage || 0;
  const goalLineUsage = player.situational?.goal_line_specialist || 0;
  
  return (thirdDownUsage + twoMinuteUsage + goalLineUsage) / 3;
}

function calculateInjuryOpportunityBoost(player, gameContext) {
  const teamInjuries = gameContext?.injury_context?.[player.team] || {};
  const targetShareAvailable = teamInjuries.target_share_available || 0;
  const rzOpportunitiesAvailable = teamInjuries.red_zone_opportunities_available || 0;
  const playerDepth = player.depth_chart_position || 1;
  
  // Players higher on depth chart benefit more from injuries
  const depthFactor = Math.max(0, (3 - playerDepth) / 3);
  
  return (targetShareAvailable + rzOpportunitiesAvailable) * depthFactor;
}

function calculateOpponentMatchup(player, opponentAnalysis) {
  const positionDefense = getPositionDefense(opponentAnalysis, player.position);
  const redZoneDefense = opponentAnalysis?.red_zone_defense_rating || 0.5;
  const overallDefense = opponentAnalysis?.overall_defense || 0.5;
  
  // Lower defense ratings = better matchup for offense
  return (1 - positionDefense) * 0.5 + (1 - redZoneDefense) * 0.3 + (1 - overallDefense) * 0.2;
}

function getPositionDefense(opponentAnalysis, position) {
  const defenseMap = {
    'RB': opponentAnalysis?.td_allowed_vs_rb || 1.2,
    'WR': opponentAnalysis?.td_allowed_vs_wr || 0.8,
    'TE': opponentAnalysis?.td_allowed_vs_te || 0.4,
    'QB': opponentAnalysis?.td_allowed_vs_qb || 0.3
  };
  
  // Normalize to 0-1 scale (higher = worse defense)
  return Math.min(1.0, (defenseMap[position] || 0.8) / 2.0);
}

function calculateGameScriptFavorability(teamContext, gameContext) {
  const expectedDifferential = teamContext?.average_point_differential || 0;
  const highScoringProb = gameContext?.high_scoring_environment || 0.3;
  const paceBonus = (teamContext?.pace_plays_per_game || 65) > 70 ? 0.1 : 0;
  
  // Positive game script = more TD opportunities
  const scriptScore = Math.max(0, expectedDifferential / 14) + highScoringProb + paceBonus;
  return Math.min(1.0, scriptScore);
}

function calculateHistoricalMultiTDRate(player) {
  const careerGames = player.historical?.career_games || 20;
  const careerTDs = player.historical?.career_td_rate * careerGames || 5;
  
  // Estimate multi-TD games (rough approximation)
  const estimatedMultiTDGames = Math.max(0, careerTDs - careerGames * 0.5);
  return Math.min(0.5, estimatedMultiTDGames / careerGames);
}

function calculateEliteUsageBonus(player) {
  const snapShare = player.current_season?.snap_percentage || 0;
  const targetShare = player.opportunity_factors?.target_share || 0;
  const rzShare = player.opportunity_factors?.red_zone_target_share || 0;
  
  // Elite players have high usage across multiple categories
  const eliteScore = (snapShare * 0.4) + (targetShare * 0.4) + (rzShare * 0.2);
  return Math.max(0, eliteScore - 0.3); // Bonus only for above-average players
}

function calculateEarlyGameUsage(player) {
  // Approximation based on overall usage and position
  const baseUsage = player.current_season?.snap_percentage || 0;
  const positionEarlyBonus = {
    'RB': 0.1,
    'WR': 0.05,
    'TE': 0.03,
    'QB': 0.15
  };
  
  return baseUsage * (1 + (positionEarlyBonus[player.position] || 0));
}

function applyPositionScaling(probability, position) {
  const positionMultipliers = {
    'RB': 1.2,  // RBs score more TDs per opportunity
    'WR': 1.0,  // Baseline
    'TE': 0.8,  // TEs score fewer TDs
    'QB': 0.6   // QBs have different scoring patterns
  };
  
  return probability * (positionMultipliers[position] || 1.0);
}

function getPositionDefault(position, metric) {
  const defaults = {
    'RB': {
      'rz_efficiency': 0.25,
      'rz_share': 0.35,
      'explosive_rate': 0.15,
      'first_drive': 0.4
    },
    'WR': {
      'rz_efficiency': 0.18,
      'rz_share': 0.25,
      'explosive_rate': 0.35,
      'first_drive': 0.3
    },
    'TE': {
      'rz_efficiency': 0.20,
      'rz_share': 0.20,
      'explosive_rate': 0.12,
      'first_drive': 0.25
    },
    'QB': {
      'rz_efficiency': 0.08,
      'rz_share': 0.10,
      'explosive_rate': 0.05,
      'first_drive': 0.15
    }
  };
  
  return defaults[position]?.[metric] || 0.1;
}

function calculateConfidence(anytimeProb, firstProb, multipleProb, player, dataQuality) {
  // Confidence based on probability strength and data quality
  const probStrength = Math.max(anytimeProb, firstProb * 3, multipleProb * 1.5);
  const dataReliability = calculateDataReliability(player);
  
  let baseConfidence = Math.min(90, 40 + (probStrength * 100));
  
  // Adjust for data quality
  baseConfidence *= dataReliability;
  
  // Position-specific confidence adjustments
  const positionConfidenceMultiplier = {
    'RB': 1.1,  // More predictable
    'WR': 1.0,  // Baseline
    'TE': 0.9,  // Less predictable
    'QB': 0.8   // Very situation dependent
  };
  
  baseConfidence *= (positionConfidenceMultiplier[player.position] || 1.0);
  
  return Math.round(Math.max(35, Math.min(85, baseConfidence)));
}

function calculateDataReliability(player) {
  const seasonGames = player.current_season?.games_played || 0;
  const careerGames = player.historical?.career_games || 0;
  const consistencyScore = player.historical?.consistency_score || 0.3;
  
  // More games = higher reliability
  const sampleSizeReliability = Math.min(1.0, (seasonGames * 2 + careerGames * 0.5) / 20);
  
  // More consistent players = higher reliability  
  const consistencyReliability = 0.5 + (consistencyScore * 0.5);
  
  return (sampleSizeReliability * 0.6) + (consistencyReliability * 0.4);
}

function probabilityToAmericanOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-100 / (probability / (1 - probability)));
  } else {
    return Math.round(100 * ((1 - probability) / probability));
  }
}

// Main prediction generation function
async function generateComprehensiveTDPredictions(games, season, week) {
  console.log('Loading comprehensive NFL TD data...');
  
  // Load comprehensive data
  const comprehensiveData = await readJsonFromBlobs(`nfl/comprehensive/player-data-${season}-week${week}.json`) ||
                           await readJsonFromBlobs(`nfl/comprehensive/latest.json`);
  
  if (!comprehensiveData) {
    throw new Error('Comprehensive player data not available');
  }
  
  console.log(`Loaded comprehensive data: ${Object.keys(comprehensiveData.players).length} players`);
  
  const allPredictions = [];
  
  for (const game of games) {
    console.log(`\nProcessing ${game.away_team} @ ${game.home_team}`);
    
    const homeTeamPlayers = getTeamPlayers(comprehensiveData.players, game.home_team);
    const awayTeamPlayers = getTeamPlayers(comprehensiveData.players, game.away_team);
    
    const homeTeamContext = comprehensiveData.team_situational[game.home_team];
    const awayTeamContext = comprehensiveData.team_situational[game.away_team];
    
    const homeOpponentAnalysis = comprehensiveData.opponent_analysis[game.away_team];
    const awayOpponentAnalysis = comprehensiveData.opponent_analysis[game.home_team];
    
    // Process home team players
    const homePlayerPredictions = homeTeamPlayers.map(player => 
      processSinglePlayer(player, homeTeamContext, awayOpponentAnalysis, comprehensiveData)
    );
    
    // Process away team players
    const awayPlayerPredictions = awayTeamPlayers.map(player => 
      processSinglePlayer(player, awayTeamContext, homeOpponentAnalysis, comprehensiveData)
    );
    
    const allGamePlayers = [...homePlayerPredictions, ...awayPlayerPredictions]
      .filter(p => p.anytime_td.probability > 0.03) // Filter low-probability players
      .sort((a, b) => b.anytime_td.probability - a.anytime_td.probability);
    
    allPredictions.push({
      game_id: game.game_id,
      home_team: game.home_team,
      away_team: game.away_team,
      players: allGamePlayers,
      metadata: {
        total_players: allGamePlayers.length,
        high_confidence_count: allGamePlayers.filter(p => p.anytime_td.confidence >= 70).length,
        top_probability: allGamePlayers[0]?.anytime_td.probability || 0
      }
    });
  }
  
  return allPredictions;
}

function getTeamPlayers(playersDb, teamAbbrev) {
  return Object.values(playersDb).filter(player => player.team === teamAbbrev);
}

function processSinglePlayer(player, teamContext, opponentAnalysis, gameData) {
  const anytimeProb = calculateAnytimeTDProbability(player, teamContext, opponentAnalysis, gameData);
  const firstProb = calculateFirstTDProbability(player, teamContext, anytimeProb, gameData);
  const multipleProb = calculateMultipleTDProbability(player, teamContext, anytimeProb, gameData);
  
  const confidence = calculateConfidence(anytimeProb, firstProb, multipleProb, player, gameData);
  
  return {
    player_id: player.id,
    name: player.name,
    position: player.position,
    team: player.team,
    depth_chart_position: player.depth_chart_position,
    
    anytime_td: {
      probability: Number(anytimeProb.toFixed(4)),
      confidence: confidence,
      implied_odds: probabilityToAmericanOdds(anytimeProb)
    },
    
    first_td: {
      probability: Number(firstProb.toFixed(4)),
      confidence: Math.round(confidence * 0.7),
      implied_odds: probabilityToAmericanOdds(firstProb)
    },
    
    multiple_td: {
      probability: Number(multipleProb.toFixed(4)),
      confidence: Math.round(confidence * 0.6),
      implied_odds: probabilityToAmericanOdds(multipleProb)
    },
    
    key_factors: {
      snap_percentage: player.current_season?.snap_percentage,
      red_zone_efficiency: player.historical?.red_zone_efficiency,
      career_td_rate: player.historical?.career_td_rate,
      consistency_score: player.historical?.consistency_score,
      injury_opportunity_boost: calculateInjuryOpportunityBoost(player, gameData)
    },
    
    model_metadata: {
      data_reliability: calculateDataReliability(player),
      primary_td_path: determinePrimaryTDPath(player),
      upside_factors: identifyUpsideFactors(player, teamContext),
      risk_factors: identifyRiskFactors(player, opponentAnalysis)
    }
  };
}

function determinePrimaryTDPath(player) {
  const rzRate = player.historical?.red_zone_efficiency || 0;
  const explosiveRate = player.historical?.explosive_td_rate || 0;
  const situationalRate = player.situational?.goal_line_specialist || 0;
  
  if (rzRate > explosiveRate && rzRate > situationalRate) return 'red_zone';
  if (explosiveRate > situationalRate) return 'explosive';
  return 'situational';
}

function identifyUpsideFactors(player, teamContext) {
  const factors = [];
  
  if (player.depth_chart_position === 1) factors.push('primary_option');
  if (player.current_season?.snap_percentage > 0.8) factors.push('high_snap_share');
  if (teamContext?.red_zone_trip_rate > 3.5) factors.push('high_red_zone_team');
  if (player.historical?.explosive_td_rate > 0.3) factors.push('big_play_ability');
  
  return factors;
}

function identifyRiskFactors(player, opponentAnalysis) {
  const factors = [];
  
  if (player.depth_chart_position > 2) factors.push('depth_chart_concern');
  if (player.historical?.consistency_score < 0.4) factors.push('inconsistent_production');
  if (opponentAnalysis?.red_zone_defense_rating < 0.3) factors.push('strong_opponent_defense');
  if (player.current_season?.games_played < 2) factors.push('limited_sample_size');
  
  return factors;
}

// Netlify Function Handler
export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: ''
      };
    }

    const season = parseIntOr(event.queryStringParameters?.season, 2025);
    const week = parseIntOr(event.queryStringParameters?.week, 3);
    
    let games = [];
    
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      games = body.games || [];
    }

    if (games.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No games provided for TD predictions' })
      };
    }

    console.log(`Generating comprehensive TD predictions for ${games.length} games`);
    const predictions = await generateComprehensiveTDPredictions(games, season, week);
    
    // Cache predictions
    await writeJsonToBlobs(`nfl/predictions/comprehensive-td-${season}-week${week}.json`, {
      metadata: {
        generated_at: new Date().toISOString(),
        season,
        week,
        games_count: games.length,
        total_player_predictions: predictions.reduce((sum, game) => sum + game.players.length, 0)
      },
      predictions
    });
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        metadata: {
          model: 'comprehensive-td-v1',
          generated_at: new Date().toISOString(),
          games_processed: games.length,
          total_players: predictions.reduce((sum, game) => sum + game.players.length, 0)
        },
        predictions
      })
    };
    
  } catch (error) {
    console.error('Comprehensive TD prediction error:', error);
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'Comprehensive TD prediction generation failed',
        message: error.message
      })
    };
  }
}

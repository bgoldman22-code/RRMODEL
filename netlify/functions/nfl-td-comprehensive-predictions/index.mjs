// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// FIXED VERSION: Reads live data from Netlify Blobs (same pattern as working NFL predictions)

import { loadBlob } from '../_lib/blobs-nfl.js';

// Remove the massive EMBEDDED_PLAYER_DATA object entirely
// This function will now load live data from blobs

// TD prediction weights
const TD_MODEL_WEIGHTS = {
  ANYTIME: {
    red_zone_targets: 0.30,
    goal_line_usage: 0.25,
    opponent_td_defense: 0.15,
    snap_percentage: 0.12,
    historical_vs_opponent: 0.08,
    team_red_zone_trips: 0.05,
    injury_opportunity_boost: 0.05
  },
  FIRST_TD: {
    opening_drive_usage: 0.40,
    team_opening_drive_rate: 0.30,
    anytime_base_probability: 0.30
  },
  MULTIPLE_TD: {
    anytime_base_probability: 0.60,
    game_script_projection: 0.20,
    historical_multi_td_rate: 0.15,
    elite_player_bonus: 0.05
  }
};

// Load live player data from Netlify Blobs (same pattern as NFL predictions)
async function loadPlayerData(season = '2025') {
  console.log('Loading live player data from Netlify Blobs...');
  
  try {
    // Try to load the latest comprehensive player data
    const currentWeek = getCurrentWeek();
    const playerData = await loadBlob(`nfl/comprehensive/player-data-${season}-week${currentWeek}.json`);
    
    if (playerData && playerData.players) {
      console.log(`✅ Loaded live data: ${Object.keys(playerData.players).length} players from week ${currentWeek}`);
      return playerData;
    }
    
    // Fallback to latest
    const fallbackData = await loadBlob(`nfl/comprehensive/latest.json`);
    if (fallbackData && fallbackData.players) {
      console.log(`✅ Loaded fallback data: ${Object.keys(fallbackData.players).length} players`);
      return fallbackData;
    }
    
    throw new Error('No player data found in blobs');
    
  } catch (error) {
    console.error('❌ Failed to load player data from blobs:', error);
    
    // Emergency fallback: Use minimal realistic data instead of massive embedded object
    console.log('⚠️ Using emergency fallback data');
    return getEmergencyPlayerData();
  }
}

// Get current NFL week (copy from working system)
function getCurrentWeek() {
  const now = new Date();
  const seasonStart = new Date('2025-09-04'); // NFL 2025 season start
  const diffTime = now.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(18, week));
}

// Emergency fallback (much smaller than embedded data)
function getEmergencyPlayerData() {
  return {
    metadata: {
      season: '2025',
      week: getCurrentWeek(),
      totalPlayers: 32, // Just top players
      dataSource: 'emergency_fallback'
    },
    players: {
      'kc_qb1': {
        name: 'Patrick Mahomes',
        position: 'QB',
        team: 'KC',
        redZoneMetrics: { targets: 0, carries: 0.5, touchdowns: 2, efficiency: 0.4 },
        opportunityFactors: { snapShare: 0.98, targetShare: 0, redZoneShare: 0.02, goalLineShare: 0.1 },
        recentForm: { trendDirection: 0.1, consistency: 0.8 },
        predictionFactors: { baseRate: 0.05, positionalMultiplier: 0.8, teamOffensiveRating: 1.2, injuryOpportunity: 0.05 }
      },
      'buf_qb1': {
        name: 'Josh Allen',
        position: 'QB', 
        team: 'BUF',
        redZoneMetrics: { targets: 0, carries: 1.2, touchdowns: 3, efficiency: 0.5 },
        opportunityFactors: { snapShare: 0.98, targetShare: 0, redZoneShare: 0.03, goalLineShare: 0.15 },
        recentForm: { trendDirection: 0.2, consistency: 0.7 },
        predictionFactors: { baseRate: 0.06, positionalMultiplier: 0.8, teamOffensiveRating: 1.15, injuryOpportunity: 0.05 }
      }
      // Add a few more key players but keep it minimal
    }
  };
}

// Main TD prediction function
async function generateTDPredictions(games, season) {
  console.log('=== NFL TD COMPREHENSIVE PREDICTIONS (LIVE DATA) ===');
  
  // Load live player data from blobs
  const playerData = await loadPlayerData(season);
  
  if (!playerData || !playerData.players) {
    throw new Error('No player data available');
  }
  
  console.log(`Processing ${Object.keys(playerData.players).length} players with live data`);
  
  const predictions = [];
  
  for (const game of games) {
    console.log(`Processing ${game.away_team} @ ${game.home_team}`);
    
    // Get players for both teams
    const homePlayers = getTeamPlayers(playerData.players, game.home_team);
    const awayPlayers = getTeamPlayers(playerData.players, game.away_team);
    
    // Generate predictions for each player
    const homePlayerPreds = generatePlayerPredictions(homePlayers, game);
    const awayPlayerPreds = generatePlayerPredictions(awayPlayers, game);
    
    predictions.push({
      game_id: game.game_id,
      home_team: game.home_team,
      away_team: game.away_team,
      players: [...homePlayerPreds, ...awayPlayerPreds],
      metadata: {
        total_players: homePlayerPreds.length + awayPlayerPreds.length,
        high_confidence_count: [...homePlayerPreds, ...awayPlayerPreds]
          .filter(p => p.anytime_td.confidence > 65).length,
        data_source: playerData.metadata.dataSource || 'live_blobs',
        data_freshness: playerData.metadata.generatedAt || 'unknown'
      }
    });
  }
  
  return {
    predictions,
    metadata: {
      total_games: predictions.length,
      total_players: predictions.reduce((sum, game) => sum + game.metadata.total_players, 0),
      data_source: playerData.metadata.dataSource || 'live_blobs',
      generated_at: new Date().toISOString(),
      system_version: 'comprehensive_live_v1'
    }
  };
}

// Get players for a specific team
function getTeamPlayers(allPlayers, teamCode) {
  const teamPlayers = [];
  
  for (const [playerId, player] of Object.entries(allPlayers)) {
    if (player.team === teamCode && shouldIncludePlayer(player)) {
      teamPlayers.push({ id: playerId, ...player });
    }
  }
  
  return teamPlayers;
}

// Filter players worth predicting
function shouldIncludePlayer(player) {
  return (
    ['QB', 'RB', 'WR', 'TE'].includes(player.position) &&
    (player.opportunityFactors?.snapShare > 0.2 || 
     player.redZoneMetrics?.targets > 0.5 ||
     player.redZoneMetrics?.carries > 0.3 ||
     player.predictionFactors?.baseRate > 0.05)
  );
}

// Generate predictions for a list of players
function generatePlayerPredictions(players, game) {
  const predictions = [];
  
  for (const player of players) {
    // Calculate ANYTIME TD probability
    const anytimeProbability = calculateAnytimeTDProbability(player, game);
    
    // Calculate FIRST TD probability
    const firstTDProbability = calculateFirstTDProbability(player, anytimeProbability, game);
    
    // Calculate 2+ TD probability  
    const multipleTDProbability = calculateMultipleTDProbability(player, anytimeProbability, game);
    
    // Calculate confidence levels
    const anytimeConfidence = calculateTDConfidence(anytimeProbability, 'anytime');
    const firstConfidence = calculateTDConfidence(firstTDProbability, 'first');
    const multipleConfidence = calculateTDConfidence(multipleTDProbability, 'multiple');
    
    predictions.push({
      player_id: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      
      anytime_td: {
        probability: Number(anytimeProbability.toFixed(3)),
        confidence: anytimeConfidence,
        implied_odds: probabilityToAmericanOdds(anytimeProbability)
      },
      
      first_td: {
        probability: Number(firstTDProbability.toFixed(3)),
        confidence: firstConfidence,
        implied_odds: probabilityToAmericanOdds(firstTDProbability)
      },
      
      multiple_td: {
        probability: Number(multipleTDProbability.toFixed(3)),
        confidence: multipleConfidence,
        implied_odds: probabilityToAmericanOdds(multipleTDProbability)
      },
      
      key_factors: {
        snap_share: player.opportunityFactors?.snapShare || 0,
        red_zone_usage: (player.redZoneMetrics?.targets || 0) + (player.redZoneMetrics?.carries || 0),
        team_offensive_rating: player.predictionFactors?.teamOffensiveRating || 1.0,
        recent_form: player.recentForm?.trendDirection || 0,
        base_td_rate: player.predictionFactors?.baseRate || 0.05
      }
    });
  }
  
  return predictions.sort((a, b) => b.anytime_td.probability - a.anytime_td.probability);
}

// TD probability calculations
function calculateAnytimeTDProbability(player, game) {
  const weights = TD_MODEL_WEIGHTS.ANYTIME;
  
  const redZoneTargets = player.redZoneMetrics?.targets || 0;
  const goalLineUsage = player.redZoneMetrics?.carries || 0;
  const snapShare = player.opportunityFactors?.snapShare || 0.5;
  const teamRating = player.predictionFactors?.teamOffensiveRating || 1.0;
  const baseRate = player.predictionFactors?.baseRate || 0.05;
  const recentForm = player.recentForm?.trendDirection || 0;
  
  // Weighted calculation
  const probabilityScore = 
    (redZoneTargets * weights.red_zone_targets) +
    (goalLineUsage * weights.goal_line_usage) +
    (snapShare * weights.snap_percentage) +
    (teamRating * weights.team_red_zone_trips) +
    (baseRate * 10) + // Scale base rate
    (recentForm * 2); // Recent form bonus
  
  return Math.max(0.05, Math.min(0.35, probabilityScore));
}

function calculateFirstTDProbability(player, anytimeProbability, game) {
  const expectedGameTDs = 6;
  const firstTDBase = anytimeProbability / expectedGameTDs;
  const positionBonus = player.position === 'RB' ? 1.2 : player.position === 'QB' ? 1.1 : 1.0;
  
  return Math.max(0.01, Math.min(0.15, firstTDBase * positionBonus));
}

function calculateMultipleTDProbability(player, anytimeProbability, game) {
  const baseProbability = Math.pow(anytimeProbability, 1.7);
  const eliteBonus = anytimeProbability > 0.25 ? 1.3 : 1.0;
  
  return Math.max(0.01, Math.min(0.25, baseProbability * eliteBonus));
}

function calculateTDConfidence(probability, type) {
  const baseConfidence = Math.min(90, 50 + (probability * 120));
  
  const typeMultipliers = {
    anytime: 1.0,
    first: 0.7,
    multiple: 0.6
  };
  
  return Math.round(baseConfidence * typeMultipliers[type]);
}

function probabilityToAmericanOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-100 / (probability / (1 - probability)));
  } else {
    return Math.round(100 * ((1 - probability) / probability));
  }
}

// Netlify Function Handler
export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    let games = [];
    let season = '2025';
    
    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2025';
    }

    if (games.length === 0) {
      throw new Error('No games provided for TD predictions');
    }

    console.log(`Generating live TD predictions for ${games.length} games`);
    const result = await generateTDPredictions(games, season);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('TD prediction generation failed:', error);
    
    return new Response(JSON.stringify({
      error: 'TD prediction generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

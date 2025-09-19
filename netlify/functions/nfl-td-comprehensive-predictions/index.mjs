// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// QUICK FIX: Adapted to work with current data structure

// Simple feature weights for quick implementation
const QUICK_TD_WEIGHTS = {
  ANYTIME: {
    red_zone_targets: 0.30,
    red_zone_carries: 0.25, 
    snap_share: 0.20,
    target_share: 0.15,
    team_quality: 0.10
  },
  FIRST_TD: {
    anytime_base: 0.60,
    first_drive_bonus: 0.40
  },
  MULTIPLE_TD: {
    anytime_squared: 0.70,
    elite_player_bonus: 0.30
  }
};

async function loadComprehensiveData() {
  try {
    // Use the working blob access pattern
    const response = await fetch(`${process.env.URL || 'https://bgroundrobin.com'}/.netlify/functions/blobs-get?key=nfl/comprehensive/latest.json`);
    if (!response.ok) throw new Error(`Blob access failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load comprehensive data:', error);
    return null;
  }
}

function calculateQuickAnytimeTD(player) {
  const weights = QUICK_TD_WEIGHTS.ANYTIME;
  
  // Use actual data structure from your collection
  const redZoneTargets = player.redZoneMetrics?.targets || 0;
  const redZoneCarries = player.redZoneMetrics?.carries || 0;
  const snapShare = player.opportunityFactors?.snapShare || 0.5;
  const targetShare = player.opportunityFactors?.targetShare || 0.1;
  const teamQuality = getTeamQuality(player.team);
  
  const score = 
    (redZoneTargets / 3 * weights.red_zone_targets) +
    (redZoneCarries / 2 * weights.red_zone_carries) +
    (snapShare * weights.snap_share) +
    (targetShare * weights.target_share) +
    (teamQuality * weights.team_quality);
  
  // Position-specific scaling
  const positionMultiplier = {
    'RB': 1.2,
    'WR': 1.0, 
    'TE': 0.8,
    'QB': 0.6
  }[player.position] || 1.0;
  
  return Math.max(0.02, Math.min(0.65, score * positionMultiplier));
}

function calculateQuickFirstTD(anytimeProb, player) {
  const weights = QUICK_TD_WEIGHTS.FIRST_TD;
  const firstDriveBonus = player.position === 'RB' ? 0.15 : 0.10;
  
  return Math.max(0.01, Math.min(0.18, 
    (anytimeProb * weights.anytime_base * 0.15) + 
    (firstDriveBonus * weights.first_drive_bonus * 0.15)
  ));
}

function calculateQuickMultipleTD(anytimeProb, player) {
  const weights = QUICK_TD_WEIGHTS.MULTIPLE_TD;
  const baseMultiple = Math.pow(anytimeProb, 1.8);
  const eliteBonus = (player.opportunityFactors?.snapShare || 0) > 0.8 ? 0.1 : 0;
  
  return Math.max(0.01, Math.min(0.30,
    (baseMultiple * weights.anytime_squared) +
    (eliteBonus * weights.elite_player_bonus)
  ));
}

function getTeamQuality(team) {
  const ratings = {
    'KC': 1.5, 'BUF': 1.4, 'SF': 1.3, 'PHI': 1.2, 'DAL': 1.1,
    'MIA': 1.0, 'CIN': 1.0, 'DET': 1.0, 'MIN': 0.9, 'LAC': 0.9,
    'GB': 0.8, 'LAR': 0.8, 'ATL': 0.8, 'NYJ': 0.8, 'PIT': 0.8,
    'IND': 0.7, 'TB': 0.7, 'JAX': 0.7, 'NO': 0.7, 'CLE': 0.7,
    'LV': 0.6, 'DEN': 0.6, 'WAS': 0.6, 'CHI': 0.6, 'NE': 0.5,
    'NYG': 0.5, 'CAR': 0.5, 'ARI': 0.5, 'TEN': 0.7, 'HOU': 0.9
  };
  return (ratings[team] || 1.0) / 1.5; // Normalize
}

function calculateConfidence(anytimeProb, firstProb, multipleProb) {
  const maxProb = Math.max(anytimeProb, firstProb * 3, multipleProb * 1.5);
  return Math.round(Math.max(45, Math.min(85, 40 + (maxProb * 60))));
}

function probabilityToAmericanOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-100 / (probability / (1 - probability)));
  } else {
    return Math.round(100 * ((1 - probability) / probability));
  }
}

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

    let games = [];
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      games = body.games || [];
    }

    if (games.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No games provided' })
      };
    }

    console.log('Loading comprehensive data...');
    const comprehensiveData = await loadComprehensiveData();
    
    if (!comprehensiveData || !comprehensiveData.players) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false,
          error: 'Comprehensive player data not available',
          debug: comprehensiveData ? 'Data loaded but no players field' : 'No data loaded'
        })
      };
    }

    console.log(`Processing ${Object.keys(comprehensiveData.players).length} players`);
    
    const allPredictions = [];
    
    for (const game of games) {
      const gamePlayerPredictions = [];
      
      // Process all players for this game
      for (const [playerId, player] of Object.entries(comprehensiveData.players)) {
        if (player.team !== game.home_team && player.team !== game.away_team) continue;
        if (!['QB', 'RB', 'WR', 'TE'].includes(player.position)) continue;
        
        const anytimeProb = calculateQuickAnytimeTD(player);
        const firstProb = calculateQuickFirstTD(anytimeProb, player);
        const multipleProb = calculateQuickMultipleTD(anytimeProb, player);
        const confidence = calculateConfidence(anytimeProb, firstProb, multipleProb);
        
        // Only include players with reasonable probability
        if (anytimeProb < 0.03) continue;
        
        gamePlayerPredictions.push({
          player_id: playerId,
          name: player.name,
          position: player.position,
          team: player.team,
          
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
            red_zone_targets: player.redZoneMetrics?.targets,
            red_zone_carries: player.redZoneMetrics?.carries,
            snap_share: player.opportunityFactors?.snapShare,
            target_share: player.opportunityFactors?.targetShare,
            team_quality: getTeamQuality(player.team)
          }
        });
      }
      
      // Sort by anytime TD probability
      gamePlayerPredictions.sort((a, b) => b.anytime_td.probability - a.anytime_td.probability);
      
      allPredictions.push({
        game_id: game.game_id,
        home_team: game.home_team,
        away_team: game.away_team,
        players: gamePlayerPredictions,
        metadata: {
          total_players: gamePlayerPredictions.length,
          high_confidence_count: gamePlayerPredictions.filter(p => p.anytime_td.confidence >= 70).length
        }
      });
    }
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        metadata: {
          model: 'quick-fix-td-v1',
          generated_at: new Date().toISOString(),
          games_processed: games.length,
          total_players: allPredictions.reduce((sum, game) => sum + game.players.length, 0)
        },
        predictions: allPredictions
      })
    };
    
  } catch (error) {
    console.error('TD prediction error:', error);
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'TD prediction generation failed',
        message: error.message
      })
    };
  }
}

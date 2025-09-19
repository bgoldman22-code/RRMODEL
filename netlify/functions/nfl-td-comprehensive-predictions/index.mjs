// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// COMPLETE CLEAN VERSION - No duplicates

const QUICK_TD_WEIGHTS = {
  ANYTIME: {
    red_zone_targets: 0.30,
    red_zone_carries: 0.25, 
    snap_share: 0.20,
    target_share: 0.15,
    team_quality: 0.10
  }
};

async function loadPlayerDataDirect() {
  try {
    const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
    const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
    
    if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
      throw new Error('Missing Netlify credentials');
    }

    const fetch = (await import('node-fetch')).default;
    
    const blobKeys = [
      'nfl/comprehensive/latest.json',
      'nfl/players/stats-current.json',
      'nfl/players/rosters-2025.json'
    ];
    
    for (const key of blobKeys) {
      try {
        console.log(`Trying to load: ${key}`);
        
        const blobUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
        const urlResponse = await fetch(blobUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${NETLIFY_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!urlResponse.ok) {
          console.log(`${key} not found: ${urlResponse.status}`);
          continue;
        }
        
        const urlData = await urlResponse.json();
        if (!urlData.url) {
          console.log(`No signed URL for ${key}`);
          continue;
        }
        
        const dataResponse = await fetch(urlData.url);
        if (!dataResponse.ok) {
          console.log(`Failed to fetch data from ${key}: ${dataResponse.status}`);
          continue;
        }
        
        const actualData = await dataResponse.json();
        console.log(`Successfully loaded ${key}`);
        
        return { data: actualData, source: key };
        
      } catch (error) {
        console.log(`Error loading ${key}:`, error.message);
        continue;
      }
    }
    
    throw new Error('No data sources available');
    
  } catch (error) {
    console.error('Direct data loading failed:', error);
    return null;
  }
}

function transformToExpectedFormat(data, source) {
  const players = {};
  
  if (source === 'nfl/comprehensive/latest.json') {
    if (data.players) {
      return data.players;
    }
  }
  
  if (source === 'nfl/players/stats-current.json') {
    for (const [playerId, player] of Object.entries(data)) {
      if (!player.team || !player.position) continue;
      
      players[playerId] = {
        ...player,
        redZoneMetrics: {
          targets: estimateRedZoneTargets(player),
          carries: estimateRedZoneCarries(player),
          touchdowns: player.currentSeason?.totalTDs || 0,
          efficiency: 0.25
        },
        opportunityFactors: {
          snapShare: estimateSnapShare(player),
          targetShare: estimateTargetShare(player),
          redZoneShare: 0.15,
          goalLineShare: 0.25
        }
      };
    }
  }
  
  if (source === 'nfl/players/rosters-2025.json') {
    for (const [teamCode, teamData] of Object.entries(data)) {
      if (!teamData.players) continue;
      
      for (const [position, playerList] of Object.entries(teamData.players)) {
        if (!Array.isArray(playerList)) continue;
        
        for (const player of playerList) {
          players[player.id] = {
            ...player,
            team: teamCode,
            redZoneMetrics: {
              targets: estimateRedZoneTargets({ position }),
              carries: estimateRedZoneCarries({ position }),
              touchdowns: position === 'RB' ? 1 : position === 'WR' ? 1 : 0,
              efficiency: 0.25
            },
            opportunityFactors: {
              snapShare: estimateSnapShare({ position }),
              targetShare: estimateTargetShare({ position }),
              redZoneShare: 0.15,
              goalLineShare: 0.25
            }
          };
        }
      }
    }
  }
  
  return players;
}

function estimateRedZoneTargets(player) {
  const base = { 'RB': 1.5, 'WR': 2.0, 'TE': 1.8, 'QB': 0 };
  return base[player.position] || 0;
}

function estimateRedZoneCarries(player) {
  return player.position === 'RB' ? 2.0 : player.position === 'QB' ? 0.3 : 0;
}

function estimateSnapShare(player) {
  const base = { 'QB': 0.98, 'RB': 0.55, 'WR': 0.65, 'TE': 0.70 };
  return base[player.position] || 0.5;
}

function estimateTargetShare(player) {
  const base = { 'RB': 0.10, 'WR': 0.20, 'TE': 0.15, 'QB': 0 };
  return base[player.position] || 0;
}

function calculateQuickAnytimeTD(player) {
  const weights = QUICK_TD_WEIGHTS.ANYTIME;
  
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
  
  const positionMultiplier = {
    'RB': 1.2, 'WR': 1.0, 'TE': 0.8, 'QB': 0.6
  }[player.position] || 1.0;
  
  return Math.max(0.02, Math.min(0.65, score * positionMultiplier));
}

function calculateQuickFirstTD(anytimeProb) {
  return Math.max(0.01, Math.min(0.18, anytimeProb * 0.15));
}

function calculateQuickMultipleTD(anytimeProb) {
  return Math.max(0.01, Math.min(0.30, Math.pow(anytimeProb, 1.8)));
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
  return (ratings[team] || 1.0) / 1.5;
}

function calculateConfidence(anytimeProb) {
  return Math.round(Math.max(45, Math.min(85, 40 + (anytimeProb * 60))));
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

    console.log('Loading player data with direct Netlify Blobs access...');
    const result = await loadPlayerDataDirect();
    
    if (!result) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false,
          error: 'Failed to load player data',
          debug: 'Direct Netlify Blobs access failed'
        })
      };
    }

    const { data, source } = result;
    const players = transformToExpectedFormat(data, source);
    
    console.log(`Using data from: ${source} with ${Object.keys(players).length} players`);
    
    const allPredictions = [];
    
    for (const game of games) {
      const gamePlayerPredictions = [];
      
      for (const [playerId, player] of Object.entries(players)) {
        if (player.team !== game.home_team && player.team !== game.away_team) continue;
        if (!['QB', 'RB', 'WR', 'TE'].includes(player.position)) continue;
        
        const anytimeProb = calculateQuickAnytimeTD(player);
        const firstProb = calculateQuickFirstTD(anytimeProb);
        const multipleProb = calculateQuickMultipleTD(anytimeProb);
        const confidence = calculateConfidence(anytimeProb);
        
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
          model: 'direct-access-v1',
          data_source: source,
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

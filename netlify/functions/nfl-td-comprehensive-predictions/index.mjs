// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// FIXED VERSION: Uses same blob pattern as working NFL predictions + does actual TD predictions

import fs from 'fs/promises';

// Enhanced embedded player data (your full roster but organized)
const EMBEDDED_PLAYER_DATA = {
  'kc_qb1': { id: 'kc_qb1', name: 'Patrick Mahomes', position: 'QB', team: 'KC' },
  'kc_rb1': { id: 'kc_rb1', name: 'Isiah Pacheco', position: 'RB', team: 'KC' },
  'buf_qb1': { id: 'buf_qb1', name: 'Josh Allen', position: 'QB', team: 'BUF' },
  'buf_rb1': { id: 'buf_rb1', name: 'James Cook', position: 'RB', team: 'BUF' },
  'buf_wr1': { id: 'buf_wr1', name: 'Khalil Shakir', position: 'WR', team: 'BUF' },
  'buf_te1': { id: 'buf_te1', name: 'Dalton Kincaid', position: 'TE', team: 'BUF' },
  'nyg_qb1': { id: 'nyg_qb1', name: 'Daniel Jones', position: 'QB', team: 'NYG' },
  'nyg_rb1': { id: 'nyg_rb1', name: 'Tyrone Tracy Jr.', position: 'RB', team: 'NYG' },
  'nyg_wr1': { id: 'nyg_wr1', name: 'Malik Nabers', position: 'WR', team: 'NYG' },
  'nyg_wr2': { id: 'nyg_wr2', name: 'Darius Slayton', position: 'WR', team: 'NYG' },
  'nyg_te1': { id: 'nyg_te1', name: 'Daniel Bellinger', position: 'TE', team: 'NYG' },
  'ari_qb1': { id: 'ari_qb1', name: 'Kyler Murray', position: 'QB', team: 'ARI' },
  'ari_rb1': { id: 'ari_rb1', name: 'James Conner', position: 'RB', team: 'ARI' },
  'ari_wr1': { id: 'ari_wr1', name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI' },
  'ari_te1': { id: 'ari_te1', name: 'Trey McBride', position: 'TE', team: 'ARI' },
  'gb_qb1': { id: 'gb_qb1', name: 'Jordan Love', position: 'QB', team: 'GB' },
  'gb_rb1': { id: 'gb_rb1', name: 'Josh Jacobs', position: 'RB', team: 'GB' },
  'chi_qb1': { id: 'chi_qb1', name: 'Caleb Williams', position: 'QB', team: 'CHI' },
  'chi_rb1': { id: 'chi_rb1', name: "D'Andre Swift", position: 'RB', team: 'CHI' },
  'chi_wr1': { id: 'chi_wr1', name: 'DJ Moore', position: 'WR', team: 'CHI' },
  'hou_qb1': { id: 'hou_qb1', name: 'C.J. Stroud', position: 'QB', team: 'HOU' },
  'hou_rb1': { id: 'hou_rb1', name: 'Joe Mixon', position: 'RB', team: 'HOU' },
  'hou_wr1': { id: 'hou_wr1', name: 'Nico Collins', position: 'WR', team: 'HOU' },
  'hou_wr2': { id: 'hou_wr2', name: 'Stefon Diggs', position: 'WR', team: 'HOU' }
};

// TD prediction weights
const QUICK_TD_WEIGHTS = {
  ANYTIME: {
    position_base: 0.40,
    team_quality: 0.25,
    snap_share: 0.20,
    red_zone_role: 0.15
  }
};

// Load player data from committed JSON (public/nfl-anytime-td-player-data.json)
async function loadPlayerData() {
  try {
    const raw = await fs.readFile('public/nfl-anytime-td-player-data.json', 'utf8');
    const data = JSON.parse(raw);
    if (data && data.players) {
      console.log(`✅ Loaded player data: ${Object.keys(data.players).length} players`);
      return data;
    }
    throw new Error('No valid player data in file');
  } catch (error) {
    console.warn('⚠️ Player data file missing or invalid:', error.message);
    console.log('📦 Using embedded player data as fallback');
    return null;
  }
}

function getCurrentWeek() {
  const now = new Date();
  const seasonStart = new Date('2025-09-04');
  const diffTime = now.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(18, week));
}

// Add metrics to any player data
function addPlayerMetrics(player) {
  return {
    ...player,
    redZoneMetrics: {
      targets: estimateRedZoneTargets(player),
      carries: estimateRedZoneCarries(player),
      touchdowns: estimateSeasonTDs(player),
      efficiency: 0.25
    },
    opportunityFactors: {
      snapShare: estimateSnapShare(player),
      targetShare: estimateTargetShare(player),
      redZoneShare: estimateRedZoneShare(player),
      goalLineShare: estimateGoalLineShare(player)
    }
  };
}

function estimateRedZoneTargets(player) {
  const base = { 'RB': 1.5, 'WR': 2.0, 'TE': 1.8, 'QB': 0 };
  return (base[player.position] || 0) * getTeamQuality(player.team);
}

function estimateRedZoneCarries(player) {
  const base = player.position === 'RB' ? 2.0 : player.position === 'QB' ? 0.3 : 0;
  return base * getTeamQuality(player.team);
}

function estimateSnapShare(player) {
  const base = { 'QB': 0.98, 'RB': 0.60, 'WR': 0.70, 'TE': 0.75 };
  return base[player.position] || 0.5;
}

function estimateTargetShare(player) {
  const base = { 'RB': 0.12, 'WR': 0.22, 'TE': 0.18, 'QB': 0 };
  return base[player.position] || 0;
}

function estimateRedZoneShare(player) {
  const base = { 'RB': 0.18, 'WR': 0.22, 'TE': 0.20, 'QB': 0.02 };
  return base[player.position] || 0.1;
}

function estimateGoalLineShare(player) {
  const base = { 'RB': 0.65, 'WR': 0.18, 'TE': 0.28, 'QB': 0.12 };
  return base[player.position] || 0.1;
}

function estimateSeasonTDs(player) {
  const teamQuality = getTeamQuality(player.team);
  const base = { 'RB': 8, 'WR': 6, 'TE': 4, 'QB': 3 };
  return Math.round((base[player.position] || 2) * teamQuality);
}

function calculateQuickAnytimeTD(player) {
  const weights = QUICK_TD_WEIGHTS.ANYTIME;
  
  const positionBase = {
    'RB': 0.25, 'WR': 0.20, 'TE': 0.15, 'QB': 0.08
  }[player.position] || 0.10;
  
  const teamQuality = getTeamQuality(player.team);
  const snapShare = player.opportunityFactors?.snapShare || 0.5;
  const redZoneRole = player.opportunityFactors?.redZoneShare || 0.1;
  
  const score = 
    (positionBase * weights.position_base) +
    (teamQuality * weights.team_quality) +
    (snapShare * weights.snap_share) +
    (redZoneRole * weights.red_zone_role);
  
  return Math.max(0.03, Math.min(0.75, score));
}

function calculateQuickFirstTD(anytimeProb) {
  return Math.max(0.01, Math.min(0.20, anytimeProb * 0.18));
}

function calculateQuickMultipleTD(anytimeProb) {
  return Math.max(0.01, Math.min(0.35, Math.pow(anytimeProb, 1.6)));
}

function getTeamQuality(team) {
  const ratings = {
    'KC': 1.5, 'BUF': 1.4, 'SF': 1.3, 'PHI': 1.2, 'DAL': 1.1, 'BAL': 1.1,
    'MIA': 1.0, 'CIN': 1.0, 'DET': 1.0, 'MIN': 0.9, 'LAC': 0.9, 'HOU': 0.9,
    'GB': 0.8, 'LAR': 0.8, 'ATL': 0.8, 'NYJ': 0.8, 'PIT': 0.8, 'SEA': 0.8,
    'IND': 0.7, 'TB': 0.7, 'JAX': 0.7, 'NO': 0.7, 'CLE': 0.7, 'TEN': 0.7,
    'LV': 0.6, 'DEN': 0.6, 'WAS': 0.6, 'CHI': 0.6, 'NE': 0.5, 'NYG': 0.5, 'CAR': 0.5, 'ARI': 0.5
  };
  return ratings[team] || 1.0;
}

function calculateConfidence(anytimeProb) {
  return Math.round(Math.max(50, Math.min(85, 45 + (anytimeProb * 65))));
}

function probabilityToAmericanOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-100 / (probability / (1 - probability)));
  } else {
    return Math.round(100 * ((1 - probability) / probability));
  }
}

// Main TD prediction generation
async function generateTDPredictions(games, season = '2025') {
  console.log('=== NFL TD COMPREHENSIVE PREDICTIONS (FIXED VERSION) ===');
  
  // Try to load live data from blobs first
  const blobData = await loadPlayerData(season);
  let playerData, dataSource;
  
  if (blobData && blobData.players) {
    playerData = blobData.players;
    dataSource = 'live_blobs';
    console.log(`🎯 Using LIVE data: ${Object.keys(playerData).length} players`);
  } else {
    playerData = EMBEDDED_PLAYER_DATA;
    dataSource = 'embedded_fallback';
    console.log(`📦 Using embedded data: ${Object.keys(playerData).length} players`);
  }
  
  const allPredictions = [];
  
  for (const game of games) {
    const gamePlayerPredictions = [];
    
    // Process all players for this game
    for (const [playerId, basePlayer] of Object.entries(playerData)) {
      if (basePlayer.team !== game.home_team && basePlayer.team !== game.away_team) continue;
      
      const player = addPlayerMetrics(basePlayer);
      
      const anytimeProb = calculateQuickAnytimeTD(player);
      const firstProb = calculateQuickFirstTD(anytimeProb);
      const multipleProb = calculateQuickMultipleTD(anytimeProb);
      const confidence = calculateConfidence(anytimeProb);
      
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
          confidence: Math.round(confidence * 0.75),
          implied_odds: probabilityToAmericanOdds(firstProb)
        },
        
        multiple_td: {
          probability: Number(multipleProb.toFixed(4)),
          confidence: Math.round(confidence * 0.65),
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
        high_confidence_count: gamePlayerPredictions.filter(p => p.anytime_td.confidence >= 70).length,
        data_source: dataSource
      }
    });
  }
  
  return {
    success: true,
    metadata: {
      model: 'comprehensive-fixed-v1',
      data_source: dataSource,
      generated_at: new Date().toISOString(),
      games_processed: games.length,
      total_players: allPredictions.reduce((sum, game) => sum + game.players.length, 0),
      blob_attempt: blobData ? 'successful' : 'failed'
    },
    predictions: allPredictions
  };
}

// Netlify Function Handler (FIXED - proper pattern)
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

    console.log(`🏈 Generating TD predictions for ${games.length} games`);
    const result = await generateTDPredictions(games, season);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ TD prediction generation failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'TD prediction generation failed',
      message: error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// OPTION 1: Self-contained with embedded player data

// Embedded player data - no external dependencies
const EMBEDDED_PLAYER_DATA = {
  // Kansas City Chiefs
  'kc_qb1': { id: 'kc_qb1', name: 'Patrick Mahomes', position: 'QB', team: 'KC' },
  'kc_rb1': { id: 'kc_rb1', name: 'Isiah Pacheco', position: 'RB', team: 'KC' },
  'kc_rb2': { id: 'kc_rb2', name: 'Kareem Hunt', position: 'RB', team: 'KC' },
  'kc_wr1': { id: 'kc_wr1', name: 'DeAndre Hopkins', position: 'WR', team: 'KC' },
  'kc_wr2': { id: 'kc_wr2', name: 'Xavier Worthy', position: 'WR', team: 'KC' },
  'kc_te1': { id: 'kc_te1', name: 'Travis Kelce', position: 'TE', team: 'KC' },
  
  // Buffalo Bills  
  'buf_qb1': { id: 'buf_qb1', name: 'Josh Allen', position: 'QB', team: 'BUF' },
  'buf_rb1': { id: 'buf_rb1', name: 'James Cook', position: 'RB', team: 'BUF' },
  'buf_wr1': { id: 'buf_wr1', name: 'Khalil Shakir', position: 'WR', team: 'BUF' },
  'buf_wr2': { id: 'buf_wr2', name: 'Keon Coleman', position: 'WR', team: 'BUF' },
  'buf_te1': { id: 'buf_te1', name: 'Dalton Kincaid', position: 'TE', team: 'BUF' },
  
  // Philadelphia Eagles
  'phi_qb1': { id: 'phi_qb1', name: 'Jalen Hurts', position: 'QB', team: 'PHI' },
  'phi_rb1': { id: 'phi_rb1', name: 'Saquon Barkley', position: 'RB', team: 'PHI' },
  'phi_wr1': { id: 'phi_wr1', name: 'A.J. Brown', position: 'WR', team: 'PHI' },
  'phi_wr2': { id: 'phi_wr2', name: 'DeVonta Smith', position: 'WR', team: 'PHI' },
  'phi_te1': { id: 'phi_te1', name: 'Dallas Goedert', position: 'TE', team: 'PHI' },
  
  // San Francisco 49ers
  'sf_qb1': { id: 'sf_qb1', name: 'Brock Purdy', position: 'QB', team: 'SF' },
  'sf_rb1': { id: 'sf_rb1', name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
  'sf_wr1': { id: 'sf_wr1', name: 'Deebo Samuel', position: 'WR', team: 'SF' },
  'sf_wr2': { id: 'sf_wr2', name: 'Brandon Aiyuk', position: 'WR', team: 'SF' },
  'sf_te1': { id: 'sf_te1', name: 'George Kittle', position: 'TE', team: 'SF' },
  
  // Dallas Cowboys
  'dal_qb1': { id: 'dal_qb1', name: 'Dak Prescott', position: 'QB', team: 'DAL' },
  'dal_rb1': { id: 'dal_rb1', name: 'Rico Dowdle', position: 'RB', team: 'DAL' },
  'dal_wr1': { id: 'dal_wr1', name: 'CeeDee Lamb', position: 'WR', team: 'DAL' },
  'dal_wr2': { id: 'dal_wr2', name: 'Brandin Cooks', position: 'WR', team: 'DAL' },
  'dal_te1': { id: 'dal_te1', name: 'Jake Ferguson', position: 'TE', team: 'DAL' },
  
  // Baltimore Ravens
  'bal_qb1': { id: 'bal_qb1', name: 'Lamar Jackson', position: 'QB', team: 'BAL' },
  'bal_rb1': { id: 'bal_rb1', name: 'Derrick Henry', position: 'RB', team: 'BAL' },
  'bal_wr1': { id: 'bal_wr1', name: 'Zay Flowers', position: 'WR', team: 'BAL' },
  'bal_te1': { id: 'bal_te1', name: 'Mark Andrews', position: 'TE', team: 'BAL' },
  'bal_te2': { id: 'bal_te2', name: 'Isaiah Likely', position: 'TE', team: 'BAL' },
  
  // Miami Dolphins
  'mia_qb1': { id: 'mia_qb1', name: 'Tua Tagovailoa', position: 'QB', team: 'MIA' },
  'mia_rb1': { id: 'mia_rb1', name: "De'Von Achane", position: 'RB', team: 'MIA' },
  'mia_wr1': { id: 'mia_wr1', name: 'Tyreek Hill', position: 'WR', team: 'MIA' },
  'mia_wr2': { id: 'mia_wr2', name: 'Jaylen Waddle', position: 'WR', team: 'MIA' },
  'mia_te1': { id: 'mia_te1', name: 'Jonnu Smith', position: 'TE', team: 'MIA' },
  
  // Cincinnati Bengals
  'cin_qb1': { id: 'cin_qb1', name: 'Joe Burrow', position: 'QB', team: 'CIN' },
  'cin_rb1': { id: 'cin_rb1', name: 'Zack Moss', position: 'RB', team: 'CIN' },
  'cin_wr1': { id: 'cin_wr1', name: "Ja'Marr Chase", position: 'WR', team: 'CIN' },
  'cin_wr2': { id: 'cin_wr2', name: 'Tee Higgins', position: 'WR', team: 'CIN' },
  'cin_te1': { id: 'cin_te1', name: 'Mike Gesicki', position: 'TE', team: 'CIN' },
  
  // Detroit Lions
  'det_qb1': { id: 'det_qb1', name: 'Jared Goff', position: 'QB', team: 'DET' },
  'det_rb1': { id: 'det_rb1', name: 'Jahmyr Gibbs', position: 'RB', team: 'DET' },
  'det_rb2': { id: 'det_rb2', name: 'David Montgomery', position: 'RB', team: 'DET' },
  'det_wr1': { id: 'det_wr1', name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET' },
  'det_wr2': { id: 'det_wr2', name: 'Jameson Williams', position: 'WR', team: 'DET' },
  'det_te1': { id: 'det_te1', name: 'Sam LaPorta', position: 'TE', team: 'DET' },
  
  // Minnesota Vikings
  'min_qb1': { id: 'min_qb1', name: 'Sam Darnold', position: 'QB', team: 'MIN' },
  'min_rb1': { id: 'min_rb1', name: 'Aaron Jones', position: 'RB', team: 'MIN' },
  'min_wr1': { id: 'min_wr1', name: 'Justin Jefferson', position: 'WR', team: 'MIN' },
  'min_wr2': { id: 'min_wr2', name: 'Jordan Addison', position: 'WR', team: 'MIN' },
  'min_te1': { id: 'min_te1', name: 'T.J. Hockenson', position: 'TE', team: 'MIN' },
  
  // New York Giants
  'nyg_qb1': { id: 'nyg_qb1', name: 'Daniel Jones', position: 'QB', team: 'NYG' },
  'nyg_rb1': { id: 'nyg_rb1', name: 'Tyrone Tracy Jr.', position: 'RB', team: 'NYG' },
  'nyg_wr1': { id: 'nyg_wr1', name: 'Malik Nabers', position: 'WR', team: 'NYG' },
  'nyg_wr2': { id: 'nyg_wr2', name: 'Darius Slayton', position: 'WR', team: 'NYG' },
  'nyg_te1': { id: 'nyg_te1', name: 'Daniel Bellinger', position: 'TE', team: 'NYG' },
  
  // Arizona Cardinals
  'ari_qb1': { id: 'ari_qb1', name: 'Kyler Murray', position: 'QB', team: 'ARI' },
  'ari_rb1': { id: 'ari_rb1', name: 'James Conner', position: 'RB', team: 'ARI' },
  'ari_wr1': { id: 'ari_wr1', name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI' },
  'ari_te1': { id: 'ari_te1', name: 'Trey McBride', position: 'TE', team: 'ARI' },
  
  // Add more key players from other teams...
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

const QUICK_TD_WEIGHTS = {
  ANYTIME: {
    position_base: 0.40,
    team_quality: 0.25,
    snap_share: 0.20,
    red_zone_role: 0.15
  }
};

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

    console.log('Using embedded player data - no external dependencies');
    
    const allPredictions = [];
    
    for (const game of games) {
      const gamePlayerPredictions = [];
      
      // Process embedded players for this game
      for (const [playerId, basePlayer] of Object.entries(EMBEDDED_PLAYER_DATA)) {
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
          model: 'embedded-data-v1',
          data_source: 'embedded_player_data',
          generated_at: new Date().toISOString(),
          games_processed: games.length,
          total_players: allPredictions.reduce((sum, game) => sum + game.players.length, 0),
          player_count_available: Object.keys(EMBEDDED_PLAYER_DATA).length
        },
        predictions: allPredictions
      })
    };
    
  } catch (error) {
    console.error('Embedded TD prediction error:', error);
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'Embedded TD prediction failed',
        message: error.message
      })
    };
  }
}

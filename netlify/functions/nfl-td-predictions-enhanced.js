/**
 * NFL Touchdown Predictions - Enhanced R Pipeline Integration
 * Netlify Function to serve R pipeline predictions to React frontend
 * 
 * Supports multiple data formats:
 * - Full predictions with metadata
 * - Lightweight predictions for mobile
 * - Player-specific queries
 * - Game-specific queries
 * - Value-ranked lists
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  // R pipeline output paths
  PIPELINE_OUTPUT_DIR: path.join(process.cwd(), 'data', 'nfl_r_pipeline', 'output'),
  FULL_PREDICTIONS_FILE: 'nfl_td_predictions_enhanced.json',
  LITE_PREDICTIONS_FILE: 'nfl_td_predictions_lite.json',
  
  // Cache settings
  CACHE_DURATION_SECONDS: 300, // 5 minutes
  
  // Response limits
  MAX_PLAYERS_RESPONSE: 500,
  DEFAULT_TOP_N: 50,
  
  // Supported query types
  QUERY_TYPES: [
    'all',           // All predictions
    'lite',          // Lightweight format
    'top-anytime',   // Top anytime TD candidates
    'top-multiple',  // Top multiple TD candidates  
    'top-first',     // Top first TD candidates
    'by-game',       // Predictions for specific game
    'by-player',     // Predictions for specific player
    'by-team',       // Predictions for specific team
    'by-position',   // Predictions by position
    'value-picks',   // Best value opportunities
    'high-confidence', // High confidence picks only
    'data-quality',  // Data quality analysis and diagnostics
    'raw'           // Raw data without adjustments (debug mode)
  ]
};

// Cache management
let cachedData = {
  full: null,
  lite: null,
  lastUpdate: null
};

/**
 * Load and cache R pipeline predictions
 */
async function loadPipelineData(forceRefresh = false) {
  const now = Date.now();
  
  // Check if cache is valid
  if (!forceRefresh && 
      cachedData.lastUpdate && 
      (now - cachedData.lastUpdate) < (CONFIG.CACHE_DURATION_SECONDS * 1000)) {
    return cachedData;
  }
  
  try {
    // Load full predictions
    const fullPath = path.join(CONFIG.PIPELINE_OUTPUT_DIR, CONFIG.FULL_PREDICTIONS_FILE);
    const fullData = JSON.parse(await fs.readFile(fullPath, 'utf8'));
    
    // Load lite predictions  
    const litePath = path.join(CONFIG.PIPELINE_OUTPUT_DIR, CONFIG.LITE_PREDICTIONS_FILE);
    const liteData = JSON.parse(await fs.readFile(litePath, 'utf8'));
    
    // Update cache
    cachedData = {
      full: fullData,
      lite: liteData,
      lastUpdate: now
    };
    
    console.log(`✅ Loaded pipeline data: ${fullData.predictions.length} players, ${fullData.summary.total_games} games`);
    
    return cachedData;
    
  } catch (error) {
    console.error('❌ Failed to load pipeline data:', error.message);
    
    // Return cached data if available, otherwise throw
    if (cachedData.full) {
      console.log('⚠️ Using cached data due to load failure');
      return cachedData;
    }
    
    throw new Error(`Pipeline data not available: ${error.message}`);
  }
}

/**
 * Validate and normalize query parameters
 */
function processQueryParams(event) {
  const params = event.queryStringParameters || {};
  
  return {
    // Query type
    type: params.type || 'lite',
    
    // Filters
    position: params.position?.toUpperCase(),
    team: params.team?.toUpperCase(),
    player_id: params.player_id,
    game_id: params.game_id,
    
    // Ranking options
    top_n: parseInt(params.top_n) || CONFIG.DEFAULT_TOP_N,
    min_confidence: params.min_confidence || 'medium',
    
    // Value thresholds
    min_value_score: parseFloat(params.min_value_score) || 0.5,
    min_probability: parseFloat(params.min_probability) || 0.05,
    
    // Response format
    include_metadata: params.include_metadata !== 'false',
    include_summary: params.include_summary !== 'false',
    
    // Debugging
    debug: params.debug === 'true'
  };
}

/**
 * Apply reliability adjustment using shrinkage to position priors (not scaling)
 */
function applyReliabilityAdjustment(prediction) {
  // Parse reliability as 0..1
  let r = 0.75; // Default reliability
  if (prediction.reliability != null) {
    const reliabilityStr = String(prediction.reliability);
    const match = reliabilityStr.match(/(\d+(\.\d+)?)%?/);
    if (match) {
      r = Math.max(0, Math.min(1, parseFloat(match[1]) / 100));
    }
  }
  
  // Position priors based on historical TD rates
  const priors = { 
    RB: 0.22,    // RBs score most frequently
    WR: 0.16,    // WRs moderate rate
    TE: 0.13,    // TEs lower rate
    QB: 0.05,    // QBs rarely score rushing TDs
    default: 0.16 
  };
  
  const position = prediction.position || 'default';
  const prior = priors[position] ?? priors.default;
  
  // Reliability weight: map r in [0,1] to lambda in [0.35..0.95]
  // Higher reliability = more weight to model, less shrinkage to prior
  const lambda = 0.35 + 0.60 * r;
  
  const clamp = (x) => Math.max(0.001, Math.min(0.95, x));
  
  // Shrink probabilities toward position priors
  const anytimeAdjusted = clamp(lambda * (prediction.anytime_td_prob || 0) + (1 - lambda) * prior);
  const multipleAdjusted = clamp(lambda * (prediction.multiple_td_prob || 0) + (1 - lambda) * (prior * 0.12));
  const firstAdjusted = clamp(lambda * (prediction.first_td_prob || 0) + (1 - lambda) * (prior * 0.10));
  
  return {
    ...prediction,
    reliability_adjusted: true,
    reliability_factor: Math.round(lambda * 100) / 100,
    original_anytime_prob: prediction.anytime_td_prob,
    anytime_td_prob: anytimeAdjusted,
    multiple_td_prob: multipleAdjusted,
    first_td_prob: firstAdjusted,
    position_prior: prior,
    shrinkage_amount: Math.round((1 - lambda) * 100) / 100
  };
}

/**
 * Reconcile team-level TD totals using per-game projections from totals/spreads
 */
function reconcileTeamTotals(predictions, games = []) {
  // Build game index for team TD projections
  const gameIndex = new Map();
  
  for (const game of games || []) {
    const gameId = game.game_id || game.id;
    if (!gameId) continue;
    
    // Extract game total and favorite
    const totalPoints = game.total_points || game.market_total || game.over_under || 44; // fallback
    const favorite = game.favorite_team || game.fav_team || null;
    const homeTeam = game.home_team_abbr || game.home_team || game.home || 'HOME';
    const awayTeam = game.away_team_abbr || game.away_team || game.away || 'AWAY';
    
    // Determine team shares (55% to favorite, 45% to dog)
    let homeShare = 0.5;
    if (favorite) {
      if (favorite === homeTeam || favorite.includes(homeTeam) || homeTeam.includes(favorite)) {
        homeShare = 0.55;
      } else if (favorite === awayTeam || favorite.includes(awayTeam) || awayTeam.includes(favorite)) {
        homeShare = 0.45;
      }
    }
    
    // Convert points to TDs (rough conversion: ~7 points per TD)
    const tdPerPoint = 1 / 7.0;
    const gameTotalTDs = Math.max(4.0, totalPoints * tdPerPoint); // Floor at 4 TDs minimum
    
    const homeTDs = Math.max(0.8, gameTotalTDs * homeShare);
    const awayTDs = Math.max(0.8, gameTotalTDs * (1 - homeShare));
    
    gameIndex.set(gameId, {
      home_team: homeTeam,
      away_team: awayTeam,
      total_points: totalPoints,
      team_proj_TDs: {
        [homeTeam]: homeTDs,
        [awayTeam]: awayTDs
      }
    });
  }
  
  // Group predictions by (team, game_id)
  const teamGameBuckets = new Map();
  for (const pred of predictions) {
    const team = pred.team || pred.team_abbr || 'UNKNOWN';
    const gameId = pred.game_id || 'unknown';
    const key = `${team}::${gameId}`;
    
    if (!teamGameBuckets.has(key)) teamGameBuckets.set(key, []);
    teamGameBuckets.get(key).push(pred);
  }
  
  const adjustedPredictions = [];
  
  // Reconcile each team-game bucket
  for (const [key, players] of teamGameBuckets.entries()) {
    const [team, gameId] = key.split('::');
    const gameInfo = gameIndex.get(gameId);
    const teamCap = gameInfo?.team_proj_TDs?.[team];
    
    // Calculate current team total
    const currentTotal = players.reduce((sum, p) => sum + (p.anytime_td_prob || 0), 0);
    
    // Use game-specific cap or fallback to 2.8
    const cap = teamCap ?? 2.8;
    
    if (currentTotal > cap && currentTotal > 0) {
      // Scale down proportionally
      const scalingFactor = cap / currentTotal;
      
      players.forEach(player => {
        adjustedPredictions.push({
          ...player,
          anytime_td_prob: (player.anytime_td_prob || 0) * scalingFactor,
          multiple_td_prob: (player.multiple_td_prob || 0) * scalingFactor,
          first_td_prob: (player.first_td_prob || 0) * scalingFactor,
          team_reconciled: true,
          scaling_factor: Math.round(scalingFactor * 1000) / 1000,
          team_cap_TDs: Math.round(cap * 100) / 100,
          team_sum_before: Math.round(currentTotal * 100) / 100,
          game_total_proj: gameInfo ? Math.round(gameInfo.total_points * 10) / 10 : null
        });
      });
    } else {
      // No adjustment needed
      players.forEach(player => {
        adjustedPredictions.push({
          ...player,
          team_reconciled: false,
          team_cap_TDs: Math.round(cap * 100) / 100,
          team_sum_before: Math.round(currentTotal * 100) / 100
        });
      });
    }
  }
  
  return adjustedPredictions;
}

/**
 * Validate odds realism and flag suspicious data
 */
function validateOddsRealism(predictions) {
  // Normalize odds fields first for consistent validation
  const normalized = predictions.map(normalizeRow);
  const totalPredictions = normalized.length;
  
  if (totalPredictions === 0) return { isValid: true, warnings: [] };
  
  const warnings = [];
  
  // Check for uniform odds (placeholder detection)
  const oddsCounts = {};
  const oddsAvailable = normalized.filter(p => p.american_odds);
  
  oddsAvailable.forEach(p => {
    const odds = String(p.american_odds);
    oddsCounts[odds] = (oddsCounts[odds] || 0) + 1;
  });
  
  // Flag if >40% have identical odds (among those with odds)
  if (oddsAvailable.length > 0) {
    Object.entries(oddsCounts).forEach(([odds, count]) => {
      const percentage = (count / oddsAvailable.length) * 100;
      if (percentage > 40) {
        warnings.push(`⚠️ ${percentage.toFixed(0)}% of predictions have identical odds (${odds}) - possible placeholder data`);
      }
    });
  }
  
  // Check for suspiciously uniform book counts
  const singleBookCount = normalized.filter(p => Number(p.books_count) <= 1).length;
  const singleBookPercentage = (singleBookCount / totalPredictions) * 100;
  
  if (singleBookPercentage > 60) {
    warnings.push(`⚠️ ${singleBookPercentage.toFixed(0)}% of predictions from ≤1 book - limited market coverage`);
  }
  
  // Check for missing odds data
  const noOddsCount = normalized.filter(p => !p.american_odds).length;
  const noOddsPercentage = (noOddsCount / totalPredictions) * 100;
  
  if (noOddsPercentage > 30) {
    warnings.push(`⚠️ ${noOddsPercentage.toFixed(0)}% of predictions missing odds data`);
  }
  
  // Check for realistic probability ranges
  const highProbCount = normalized.filter(p => (p.anytime_td_prob || 0) > 0.65).length;
  const lowProbCount = normalized.filter(p => (p.anytime_td_prob || 0) < 0.05).length;
  
  if (highProbCount > totalPredictions * 0.05) {
    warnings.push(`⚠️ ${highProbCount} players with >65% TD probability - check calibration`);
  }
  
  if (lowProbCount > totalPredictions * 0.3) {
    warnings.push(`⚠️ ${lowProbCount} players with <5% TD probability - possible data quality issues`);
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    validation_summary: {
      total_predictions: totalPredictions,
      odds_available: oddsAvailable.length,
      single_book_percentage: Math.round(singleBookPercentage),
      no_odds_percentage: Math.round(noOddsPercentage),
      high_prob_count: highProbCount,
      unique_odds: Object.keys(oddsCounts).length,
      most_common_odds: Object.entries(oddsCounts).sort((a, b) => b[1] - a[1])[0]
    }
  };
}

/**
 * Normalize field names for consistent processing
 */
function normalizeRow(prediction) {
  const americanOdds = prediction.american_odds ?? 
                      prediction.best_price ?? 
                      prediction.anytime_best_odds ?? 
                      prediction.odds ?? null;
  
  const booksCount = prediction.books_count ?? 
                    prediction.num_books ?? 
                    (Array.isArray(prediction.odds_sources) ? prediction.odds_sources.length : null) ??
                    1; // Default to 1 book if unknown
  
  return {
    ...prediction,
    american_odds: americanOdds,
    books_count: booksCount
  };
}

/**
 * Apply odds quality gates and adjust confidence/value accordingly
 */
function oddsGate(predictions) {
  return predictions.map(pred => {
    const booksCount = Number(pred.books_count) || 0;
    const hasOdds = !!(pred.american_odds || pred.best_price);
    
    // Require ≥2 books AND valid odds for qualification
    const oddsQualified = booksCount >= 2 && hasOdds;
    
    return {
      ...pred,
      odds_qualified: oddsQualified,
      // Zero out value scores and lower confidence for unqualified odds
      anytime_value_score: oddsQualified ? pred.anytime_value_score : 0,
      multiple_value_score: oddsQualified ? pred.multiple_value_score : 0,
      first_value_score: oddsQualified ? pred.first_value_score : 0,
      anytime_confidence: oddsQualified ? pred.anytime_confidence : 'low',
      odds_reason: !oddsQualified ? 
        (!hasOdds ? 'no_odds' : 'insufficient_books') : 'qualified'
    };
  });
}

/**
 * Filter predictions based on query parameters
 */
function filterPredictions(predictions, queryParams, games = []) {
  // Normalize field names first
  let filtered = predictions.map(normalizeRow);
  
  // Apply reliability adjustments (skip if already adjusted)
  filtered = filtered.map(p => p.__adjusted ? p : applyReliabilityAdjustment(p));
  
  // Apply team-level reconciliation with game data
  filtered = reconcileTeamTotals(filtered, games).map(p => ({ ...p, __adjusted: true }));
  
  // Apply odds quality gates
  filtered = oddsGate(filtered);
  
  // Position filter
  if (queryParams.position) {
    filtered = filtered.filter(p => p.position === queryParams.position);
  }
  
  // Team filter
  if (queryParams.team) {
    filtered = filtered.filter(p => p.team === queryParams.team);
  }
  
  // Player filter
  if (queryParams.player_id) {
    filtered = filtered.filter(p => p.player_id === queryParams.player_id);
  }
  
  // Game filter
  if (queryParams.game_id) {
    filtered = filtered.filter(p => p.game_id === queryParams.game_id);
  }
  
  // Confidence filter
  if (queryParams.min_confidence !== 'low') {
    const confidenceOrder = { 'low': 1, 'medium': 2, 'high': 3 };
    const minLevel = confidenceOrder[queryParams.min_confidence] || 2;
    
    filtered = filtered.filter(p => {
      const level = confidenceOrder[p.anytime_confidence] || 1;
      return level >= minLevel;
    });
  }
  
  // Value score filter
  if (queryParams.min_value_score > 0) {
    filtered = filtered.filter(p => 
      p.anytime_value_score >= queryParams.min_value_score ||
      p.multiple_value_score >= queryParams.min_value_score ||
      p.first_value_score >= queryParams.min_value_score
    );
  }
  
  // Probability filter (applied after adjustments)
  if (queryParams.min_probability > 0) {
    filtered = filtered.filter(p => 
      p.anytime_td_prob >= queryParams.min_probability
    );
  }
  
  // Cap displayed probabilities for realism (avoid >85% for non-QBs)
  filtered = filtered.map(p => ({
    ...p,
    anytime_td_prob: Math.max(0.01, Math.min(p.position === 'QB' ? 0.95 : 0.85, p.anytime_td_prob)),
    multiple_td_prob: Math.max(0.001, Math.min(0.60, p.multiple_td_prob || 0)),
    first_td_prob: Math.max(0.001, Math.min(0.75, p.first_td_prob || 0))
  }));
  
  return filtered;
}

/**
 * Generate response for specific query types
 */
function generateResponseByType(data, queryParams) {
  const { type, top_n } = queryParams;
  
  switch (type) {
    case 'all':
      return {
        predictions: filterPredictions(data.full.predictions, queryParams, data.full.games),
        metadata: queryParams.include_metadata ? data.full.metadata : undefined,
        summary: queryParams.include_summary ? data.full.summary : undefined,
        games: data.full.games
      };
      
    case 'lite':
      return {
        predictions: filterPredictions(data.lite.predictions, queryParams, data.full.games).slice(0, queryParams.top_n),
        metadata: data.lite.metadata
      };
      
    case 'top-anytime':
      const topAnytime = filterPredictions(data.full.predictions, queryParams, data.full.games)
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, top_n);
      
      return {
        type: 'anytime_td_leaders',
        predictions: topAnytime,
        metadata: data.full.metadata,
        summary: {
          count: topAnytime.length,
          avg_probability: topAnytime.reduce((sum, p) => sum + p.anytime_td_prob, 0) / topAnytime.length,
          top_probability: topAnytime[0]?.anytime_td_prob || 0
        }
      };
      
    case 'top-multiple':
      const topMultiple = filterPredictions(data.full.predictions, queryParams, data.full.games)
        .sort((a, b) => b.multiple_td_prob - a.multiple_td_prob)
        .slice(0, top_n);
      
      return {
        type: 'multiple_td_leaders',
        predictions: topMultiple,
        metadata: data.full.metadata,
        summary: {
          count: topMultiple.length,
          avg_probability: topMultiple.reduce((sum, p) => sum + p.multiple_td_prob, 0) / topMultiple.length,
          top_probability: topMultiple[0]?.multiple_td_prob || 0
        }
      };
      
    case 'top-first':
      const topFirst = filterPredictions(data.full.predictions, queryParams, data.full.games)
        .sort((a, b) => b.first_td_prob - a.first_td_prob)
        .slice(0, top_n);
      
      return {
        type: 'first_td_leaders',
        predictions: topFirst,
        metadata: data.full.metadata,
        summary: {
          count: topFirst.length,
          avg_probability: topFirst.reduce((sum, p) => sum + p.first_td_prob, 0) / topFirst.length,
          top_probability: topFirst[0]?.first_td_prob || 0
        }
      };
      
    case 'by-game':
      if (!queryParams.game_id) {
        return { error: 'game_id parameter required for by-game queries' };
      }
      
      const gameData = data.full.games.find(g => g.game_id === queryParams.game_id);
      const gamePlayers = filterPredictions(data.full.predictions, queryParams, data.full.games);
      
      return {
        type: 'game_predictions',
        game_info: gameData,
        predictions: gamePlayers,
        metadata: data.full.metadata
      };
      
    case 'by-position':
      const byPosition = {};
      const positions = ['QB', 'RB', 'WR', 'TE'];
      
      positions.forEach(pos => {
        const posPlayers = filterPredictions(data.full.predictions, { ...queryParams, position: pos }, data.full.games)
          .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
          .slice(0, Math.ceil(top_n / positions.length));
        
        byPosition[pos] = posPlayers;
      });
      
      return {
        type: 'position_breakdown',
        by_position: byPosition,
        metadata: data.full.metadata
      };
      
    case 'value-picks':
      const valuePicks = filterPredictions(data.full.predictions, queryParams, data.full.games)
        .filter(p => p.odds_qualified) // Only show qualified odds for value picks
        .filter(p => p.anytime_value_score >= 0.6 || p.multiple_value_score >= 0.6 || p.first_value_score >= 0.6)
        .sort((a, b) => Math.max(b.anytime_value_score, b.multiple_value_score, b.first_value_score) - 
                       Math.max(a.anytime_value_score, a.multiple_value_score, a.first_value_score))
        .slice(0, top_n);
      
      return {
        type: 'value_opportunities',
        predictions: valuePicks,
        metadata: data.full.metadata,
        summary: {
          count: valuePicks.length,
          avg_anytime_value: valuePicks.reduce((sum, p) => sum + p.anytime_value_score, 0) / valuePicks.length,
          avg_multiple_value: valuePicks.reduce((sum, p) => sum + p.multiple_value_score, 0) / valuePicks.length
        }
      };
      
    case 'high-confidence':
      const highConfidence = filterPredictions(data.full.predictions, { ...queryParams, min_confidence: 'high' }, data.full.games)
        .filter(p => p.odds_qualified) // Only show qualified odds for high confidence picks
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, top_n);
      
      return {
        type: 'high_confidence_picks',
        predictions: highConfidence,
        metadata: data.full.metadata,
        summary: {
          count: highConfidence.length,
          avg_probability: highConfidence.length > 0 ? 
            highConfidence.reduce((sum, p) => sum + p.anytime_td_prob, 0) / highConfidence.length : 0
        }
      };
      
    case 'data-quality':
      // Skip filtering to analyze raw data
      const rawPredictions = data.full.predictions || [];
      const validation = validateOddsRealism(rawPredictions);
      
      // Team total analysis
      const teamTotals = {};
      rawPredictions.forEach(p => {
        const team = p.team || p.team_abbr;
        if (!teamTotals[team]) teamTotals[team] = { total: 0, count: 0, players: [] };
        teamTotals[team].total += (p.anytime_td_prob || 0);
        teamTotals[team].count += 1;
        teamTotals[team].players.push({
          name: p.name || p.player_name,
          position: p.position,
          prob: p.anytime_td_prob,
          reliability: p.reliability
        });
      });
      
      const teamAnalysis = Object.entries(teamTotals)
        .map(([team, data]) => ({
          team,
          total_prob: Math.round(data.total * 100) / 100,
          player_count: data.count,
          avg_prob: Math.round((data.total / data.count) * 100) / 100,
          needs_scaling: data.total > 2.8,
          top_players: data.players
            .sort((a, b) => (b.prob || 0) - (a.prob || 0))
            .slice(0, 3)
        }))
        .sort((a, b) => b.total_prob - a.total_prob);
      
      return {
        type: 'data_quality_analysis',
        validation_result: validation,
        team_analysis: teamAnalysis,
        distribution_analysis: {
          total_players: rawPredictions.length,
          avg_probability: rawPredictions.reduce((sum, p) => sum + (p.anytime_td_prob || 0), 0) / rawPredictions.length,
          high_prob_players: rawPredictions.filter(p => (p.anytime_td_prob || 0) > 0.5).length,
          zero_prob_players: rawPredictions.filter(p => (p.anytime_td_prob || 0) === 0).length,
          positions: {
            RB: rawPredictions.filter(p => p.position === 'RB').length,
            WR: rawPredictions.filter(p => p.position === 'WR').length,
            TE: rawPredictions.filter(p => p.position === 'TE').length,
            QB: rawPredictions.filter(p => p.position === 'QB').length
          }
        },
        sample_predictions: rawPredictions.slice(0, 5),
        metadata: data.full.metadata
      };
      
    case 'raw':
      // Raw data without any adjustments (debug mode)
      let rawFiltered = [...data.full.predictions];
      
      // Apply only basic filters without adjustments
      if (queryParams.position) {
        rawFiltered = rawFiltered.filter(p => p.position === queryParams.position);
      }
      if (queryParams.team) {
        rawFiltered = rawFiltered.filter(p => p.team === queryParams.team);
      }
      if (queryParams.player_id) {
        rawFiltered = rawFiltered.filter(p => p.player_id === queryParams.player_id);
      }
      
      return {
        type: 'raw_predictions',
        predictions: rawFiltered.slice(0, top_n),
        metadata: data.full.metadata,
        note: 'Raw predictions without reliability adjustments, team reconciliation, or odds gating'
      };
      
    default:
      return { error: `Unsupported query type: ${type}. Supported types: ${CONFIG.QUERY_TYPES.join(', ')}` };
  }
}

/**
 * Main Netlify function handler
 */
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CONFIG.CACHE_DURATION_SECONDS}`
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const startTime = Date.now();
    
    // Process query parameters
    const queryParams = processQueryParams(event);
    
    // Load pipeline data
    const data = await loadPipelineData();
    
    // Validate data freshness
    if (!data.full || !data.full.metadata) {
      throw new Error('Invalid pipeline data structure');
    }
    
    // Check data age (warn if older than 24 hours)
    const dataAge = Date.now() - new Date(data.full.metadata.generated_at).getTime();
    const dataAgeHours = dataAge / (1000 * 60 * 60);
    
    // Validate data quality before processing
    const validationResult = validateOddsRealism(data.full.predictions || []);
    
    // Log warnings for monitoring
    if (validationResult.warnings.length > 0) {
      console.warn('📊 Data Quality Warnings:', validationResult.warnings);
    }
    
    // Generate response based on query type
    const response = generateResponseByType(data, queryParams);
    
    if (response.error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: response.error,
          supported_types: CONFIG.QUERY_TYPES,
          example_urls: [
            '/api/nfl-td-predictions?type=lite',
            '/api/nfl-td-predictions?type=top-anytime&top_n=25',
            '/api/nfl-td-predictions?type=by-position&position=RB',
            '/api/nfl-td-predictions?type=value-picks&min_value_score=0.7'
          ]
        })
      };
    }
    
    // Add data quality information to response
    response.data_quality = {
      validation_status: validationResult.isValid ? 'passed' : 'warnings',
      warnings: validationResult.warnings,
      validation_summary: validationResult.validation_summary
    };
    
    // Calculate adjustment statistics
    const adjustmentStats = {
      reliability_adjusted: (response.predictions || []).filter(p => p.reliability_adjusted).length,
      team_reconciled: (response.predictions || []).filter(p => p.team_reconciled).length,
      total_predictions: (response.predictions || []).length
    };
    
    // Add performance and freshness metadata
    const responseWithMeta = {
      ...response,
      api_metadata: {
        response_time_ms: Date.now() - startTime,
        data_age_hours: Math.round(dataAgeHours * 100) / 100,
        cache_status: data.lastUpdate ? 'hit' : 'miss',
        pipeline_version: data.full.metadata.version,
        total_available_players: data.full.predictions.length,
        adjustments_applied: adjustmentStats,
        query_params: queryParams.debug ? queryParams : undefined
      }
    };
    
    // Log request for monitoring
    console.log(`✅ NFL TD Predictions API: ${queryParams.type} query, ${JSON.stringify(response).length} bytes, ${Date.now() - startTime}ms`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseWithMeta, null, queryParams.debug ? 2 : undefined)
    };
    
  } catch (error) {
    console.error('❌ NFL TD Predictions API Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
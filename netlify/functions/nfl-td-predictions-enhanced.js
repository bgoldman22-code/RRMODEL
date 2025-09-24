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
    'data-quality'   // Data quality analysis and diagnostics
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
 * Apply reliability scaling to individual predictions
 */
function applyReliabilityAdjustment(prediction) {
  // Extract reliability percentage (handle different formats)
  let reliabilityScore = 75; // Default reliability
  
  if (prediction.reliability) {
    const reliabilityStr = String(prediction.reliability);
    const reliabilityMatch = reliabilityStr.match(/(\d+)%?/);
    if (reliabilityMatch) {
      reliabilityScore = parseInt(reliabilityMatch[1]);
    }
  }
  
  // Scale probabilities based on reliability (70-100% range)
  const reliabilityFactor = Math.max(0.7, Math.min(1.0, reliabilityScore / 100));
  const confidenceMultiplier = 0.85 + (0.15 * reliabilityFactor); // 85-100% range
  
  return {
    ...prediction,
    anytime_td_prob: prediction.anytime_td_prob * confidenceMultiplier,
    multiple_td_prob: (prediction.multiple_td_prob || 0) * confidenceMultiplier,
    first_td_prob: (prediction.first_td_prob || 0) * confidenceMultiplier,
    reliability_adjusted: true,
    original_anytime_prob: prediction.anytime_td_prob,
    reliability_factor: Math.round(reliabilityFactor * 100) / 100
  };
}

/**
 * Reconcile team-level TD totals to realistic bounds
 */
function reconcileTeamTotals(predictions) {
  // Group predictions by team
  const teamGroups = {};
  predictions.forEach(pred => {
    const team = pred.team || pred.team_abbr;
    if (!teamGroups[team]) teamGroups[team] = [];
    teamGroups[team].push(pred);
  });
  
  const adjustedPredictions = [];
  
  Object.entries(teamGroups).forEach(([team, teamPlayers]) => {
    // Calculate team total anytime TD probability
    const teamTotal = teamPlayers.reduce((sum, p) => sum + (p.anytime_td_prob || 0), 0);
    const REALISTIC_TEAM_MAX = 2.8; // ~2.8 TDs per team per game average
    
    if (teamTotal > REALISTIC_TEAM_MAX) {
      // Scale down all players proportionally
      const scalingFactor = REALISTIC_TEAM_MAX / teamTotal;
      
      teamPlayers.forEach(player => {
        adjustedPredictions.push({
          ...player,
          anytime_td_prob: player.anytime_td_prob * scalingFactor,
          multiple_td_prob: (player.multiple_td_prob || 0) * scalingFactor,
          first_td_prob: (player.first_td_prob || 0) * scalingFactor,
          team_reconciled: true,
          original_team_total: Math.round(teamTotal * 100) / 100,
          scaling_factor: Math.round(scalingFactor * 100) / 100,
          reconciled_team_total: Math.round(REALISTIC_TEAM_MAX * 100) / 100
        });
      });
    } else {
      // No adjustment needed
      teamPlayers.forEach(player => {
        adjustedPredictions.push({
          ...player,
          team_reconciled: false
        });
      });
    }
  });
  
  return adjustedPredictions;
}

/**
 * Validate odds realism and flag suspicious data
 */
function validateOddsRealism(predictions) {
  const totalPredictions = predictions.length;
  if (totalPredictions === 0) return { isValid: true, warnings: [] };
  
  const warnings = [];
  
  // Check for uniform odds (placeholder detection)
  const oddsCounts = {};
  predictions.forEach(p => {
    if (p.american_odds) {
      oddsCounts[p.american_odds] = (oddsCounts[p.american_odds] || 0) + 1;
    }
  });
  
  // Flag if >40% have identical odds
  Object.entries(oddsCounts).forEach(([odds, count]) => {
    const percentage = (count / totalPredictions) * 100;
    if (percentage > 40) {
      warnings.push(`⚠️ ${percentage.toFixed(0)}% of predictions have identical odds (${odds}) - possible placeholder data`);
    }
  });
  
  // Check for suspiciously uniform book counts
  const singleBookCount = predictions.filter(p => p.books_count === 1 || p.books_count === '1').length;
  const singleBookPercentage = (singleBookCount / totalPredictions) * 100;
  
  if (singleBookPercentage > 60) {
    warnings.push(`⚠️ ${singleBookPercentage.toFixed(0)}% of predictions from single book - limited market coverage`);
  }
  
  // Check for realistic probability ranges
  const highProbCount = predictions.filter(p => (p.anytime_td_prob || 0) > 0.65).length;
  const lowProbCount = predictions.filter(p => (p.anytime_td_prob || 0) < 0.05).length;
  
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
      single_book_percentage: Math.round(singleBookPercentage),
      high_prob_count: highProbCount,
      unique_odds: Object.keys(oddsCounts).length,
      most_common_odds: Object.entries(oddsCounts).sort((a, b) => b[1] - a[1])[0]
    }
  };
}

/**
 * Filter predictions based on query parameters
 */
function filterPredictions(predictions, queryParams) {
  let filtered = [...predictions];
  
  // Apply reliability adjustments first
  filtered = filtered.map(applyReliabilityAdjustment);
  
  // Apply team-level reconciliation
  filtered = reconcileTeamTotals(filtered);
  
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
        predictions: filterPredictions(data.full.predictions, queryParams),
        metadata: queryParams.include_metadata ? data.full.metadata : undefined,
        summary: queryParams.include_summary ? data.full.summary : undefined,
        games: data.full.games
      };
      
    case 'lite':
      return {
        predictions: filterPredictions(data.lite.predictions, queryParams).slice(0, queryParams.top_n),
        metadata: data.lite.metadata
      };
      
    case 'top-anytime':
      const topAnytime = filterPredictions(data.full.predictions, queryParams)
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
      const topMultiple = filterPredictions(data.full.predictions, queryParams)
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
      const topFirst = filterPredictions(data.full.predictions, queryParams)
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
      const gamePlayers = filterPredictions(data.full.predictions, queryParams);
      
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
        const posPlayers = filterPredictions(data.full.predictions, { ...queryParams, position: pos })
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
      const valuePicks = filterPredictions(data.full.predictions, queryParams)
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
      const highConfidence = filterPredictions(data.full.predictions, { ...queryParams, min_confidence: 'high' })
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, top_n);
      
      return {
        type: 'high_confidence_picks',
        predictions: highConfidence,
        metadata: data.full.metadata,
        summary: {
          count: highConfidence.length,
          avg_probability: highConfidence.reduce((sum, p) => sum + p.anytime_td_prob, 0) / highConfidence.length
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
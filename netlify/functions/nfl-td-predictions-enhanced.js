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
    'high-confidence' // High confidence picks only
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
 * Filter predictions based on query parameters
 */
function filterPredictions(predictions, queryParams) {
  let filtered = [...predictions];
  
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
  
  // Probability filter
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
    
    // Add performance and freshness metadata
    const responseWithMeta = {
      ...response,
      api_metadata: {
        response_time_ms: Date.now() - startTime,
        data_age_hours: Math.round(dataAgeHours * 100) / 100,
        cache_status: data.lastUpdate ? 'hit' : 'miss',
        pipeline_version: data.full.metadata.version,
        total_available_players: data.full.predictions.length,
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
/**
 * Bundesliga BTTS Predictions - Netlify Function (Cache-Based)
 * 
 * Endpoint: /.netlify/functions/bundesliga-btts-predict
 * 
 * This function serves pre-generated Bundesliga BTTS predictions from a cache
 * file that is updated periodically by GitHub Actions. No Python execution
 * happens at runtime - all predictions are pre-computed.
 * 
 * Cache location: data/bundesliga/cache/bundesliga_btts_latest.json
 * Update schedule: Twice daily via .github/workflows/bundesliga-btts-cache.yml
 * 
 * Returns: JSON with predictions and betting recommendations
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export const handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // In Netlify, the cache file is included via netlify.toml and available at these paths
    const possiblePaths = [
      // Netlify's function directory structure
      join(process.cwd(), 'data', 'bundesliga', 'cache', 'bundesliga_btts_latest.json'),
      // Alternative bundled location
      '/var/task/data/bundesliga/cache/bundesliga_btts_latest.json',
    ];
    
    let rawCache = null;
    let usedPath = null;
    
    // Try each path until one works
    for (const path of possiblePaths) {
      try {
        console.log('Trying cache path:', path);
        rawCache = await readFile(path, 'utf8');
        usedPath = path;
        console.log('✓ Successfully read cache from:', path);
        break;
      } catch (err) {
        console.log('✗ Failed to read from:', path, '-', err.message);
      }
    }
    
    if (!rawCache) {
      throw new Error('Cache file not found in any expected location. Paths tried: ' + possiblePaths.join(', '));
    }
    
    const cache = JSON.parse(rawCache);
    
    // Filter predictions to only include upcoming fixtures
    const now = new Date();
    const upcomingPredictions = (cache.predictions || []).filter((prediction) => {
      if (!prediction.commence_time) return true; // Include if no time specified
      
      const commenceTime = new Date(prediction.commence_time);
      return commenceTime > now; // Only include future games
    });
    
    // Calculate cache age
    let cacheAgeHours = null;
    if (cache.generated_at) {
      const generatedAt = new Date(cache.generated_at);
      const ageMs = now - generatedAt;
      cacheAgeHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
    }
    
    // Build response
    const response = {
      ...cache,
      predictions: upcomingPredictions,
      total_predictions: upcomingPredictions.length,
      recommended_bets: upcomingPredictions.filter(
        p => p.bet_decision?.should_bet
      ).length,
      cache_age_hours: cacheAgeHours,
      note: cache.note || 
        'Bundesliga BTTS predictions are updated twice daily via CI. ' +
        'Odds may be slightly stale but predictions are based on the latest model.',
    };
    
    console.log(
      `Serving ${upcomingPredictions.length} predictions, ` +
      `${response.recommended_bets} recommended bets, ` +
      `cache age: ${cacheAgeHours}h`
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
    
  } catch (error) {
    console.error('Bundesliga BTTS cache error:', error);

    // Return a friendly error that doesn't break the frontend
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Service Temporarily Unavailable',
        message: 'Bundesliga BTTS predictions cache is currently unavailable.',
        details: error.message,
        fallback: 'Premier League BTTS predictions are still available.',
        predictions: [],
        total_predictions: 0,
        recommended_bets: 0,
      }),
    };
  }
};

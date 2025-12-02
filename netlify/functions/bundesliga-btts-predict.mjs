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
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    // Resolve path to cache file
    // In Netlify build, functions are bundled, so we need to find the repo root
    const cachePath = resolve(__dirname, '../../data/bundesliga/cache/bundesliga_btts_latest.json');
    
    console.log('Reading Bundesliga BTTS cache from:', cachePath);
    
    // Read and parse cache
    const rawCache = await readFile(cachePath, 'utf8');
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

/**
 * EPL BTTS Poisson Predictions - Netlify Function (Cache-Based)
 * 
 * Endpoint: /.netlify/functions/epl-btts-poisson
 * 
 * Serves pre-generated EPL BTTS predictions from production Poisson model.
 * Predictions are generated locally (with THEODDSAPI_KEY) and uploaded to
 * Netlify as static JSON. This function simply reads and serves that cache.
 * 
 * NO API calls happen at runtime - all predictions are pre-computed.
 * 
 * Cache location: public/epl_btts_preds_latest.json
 * Update method: Manual or CI - run generate_epl_btts_production_predictions.py locally
 * 
 * Returns: JSON with match predictions and betting decisions
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export const handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // Only support GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  try {
    // Possible cache file locations in Netlify environment
    const possiblePaths = [
      // Standard public directory
      join(process.cwd(), 'public', 'epl_btts_preds_latest.json'),
      // Alternative research directory path (if deployed from research/btts_option_c)
      join(process.cwd(), 'research', 'btts_option_c', 'public', 'epl_btts_preds_latest.json'),
      // Netlify function bundled path
      '/var/task/public/epl_btts_preds_latest.json',
      // RRMODEL public directory
      join(process.cwd(), 'RRMODEL', 'research', 'btts_option_c', 'public', 'epl_btts_preds_latest.json'),
    ];
    
    let rawCache = null;
    let usedPath = null;
    
    // Try each path until one works
    for (const path of possiblePaths) {
      try {
        console.log('🔍 Trying cache path:', path);
        rawCache = await readFile(path, 'utf8');
        usedPath = path;
        console.log('✅ Successfully read cache from:', path);
        break;
      } catch (err) {
        console.log('❌ Failed to read from:', path, '-', err.message);
      }
    }
    
    if (!rawCache) {
      // Cache not found - return friendly error
      const error = {
        error: 'Cache not found',
        message: 'EPL BTTS predictions cache file is not available. Please regenerate predictions.',
        details: 'Run: THEODDSAPI_KEY=xxx python3 scripts/generate_epl_btts_production_predictions.py',
        paths_tried: possiblePaths,
      };
      
      console.error('❌ Cache file not found. Paths tried:', possiblePaths);
      
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify(error, null, 2),
      };
    }
    
    // Parse cache
    const cache = JSON.parse(rawCache);
    
    // Filter predictions to only include upcoming fixtures
    const now = new Date();
    const upcomingMatches = (cache.matches || []).filter((match) => {
      if (!match.kickoff_iso) return true; // Include if no kickoff time
      
      const kickoffTime = new Date(match.kickoff_iso);
      return kickoffTime > now; // Only include future matches
    });
    
    // Calculate cache age
    let cacheAgeHours = null;
    if (cache.generated_at) {
      const generatedAt = new Date(cache.generated_at);
      const ageMs = now - generatedAt;
      cacheAgeHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
    }
    
    // Count bets
    const totalBets = upcomingMatches.filter(m => m.chosen_side !== 'NO_BET').length;
    const yesBets = upcomingMatches.filter(m => m.chosen_side === 'YES').length;
    const noBets = upcomingMatches.filter(m => m.chosen_side === 'NO').length;
    const noBetCount = upcomingMatches.length - totalBets;
    
    // Build response
    const response = {
      ...cache,
      matches: upcomingMatches,
      summary: {
        total_matches: upcomingMatches.length,
        total_bets: totalBets,
        yes_bets: yesBets,
        no_bets: noBets,
        no_bet: noBetCount,
      },
      cache_info: {
        generated_at: cache.generated_at,
        cache_age_hours: cacheAgeHours,
        used_path: usedPath,
      },
      note: 
        'EPL BTTS predictions from production Poisson model. ' +
        'Run generate_epl_btts_production_predictions.py locally to update.',
    };
    
    console.log(
      `✅ Serving ${upcomingMatches.length} matches, ` +
      `${totalBets} recommended bets (cache age: ${cacheAgeHours}h)`
    );
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2),
    };
    
  } catch (error) {
    console.error('❌ Error serving EPL BTTS predictions:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        details: 'Failed to load or parse EPL BTTS predictions cache',
      }, null, 2),
    };
  }
};

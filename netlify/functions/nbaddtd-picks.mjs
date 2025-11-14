/**
 * NBA DD/TD Picks Netlify Function
 * Serves pre-generated picks from NBA-DDTD-RESEARCH repo
 * No model inference - just reads JSON and caches it
 */

import { getJson, setJson } from './_lib/blobs-nba.mjs';

// URL to raw JSON file in NBA-DDTD-RESEARCH repo
// NOTE: Repo must be public for this URL to work, or use a GitHub token
// Replace YOUR_GITHUB_USERNAME with your actual username
const PICKS_JSON_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NBA-DDTD-RESEARCH/main/data/nba/ddtd_today_picks.json';

/**
 * Fetch picks from GitHub repo
 * @returns {Promise<Object|null>} - Picks data or null on error
 */
async function fetchPicksFromGitHub() {
  try {
    const response = await fetch(PICKS_JSON_URL);
    
    if (!response.ok) {
      console.error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching picks from GitHub:', error);
    return null;
  }
}

/**
 * Main handler
 */
export async function handler(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    // Get today's date for cache key
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `picks-${today}`;
    
    // Try to get from cache first (but don't fail if blobs not configured)
    let cached = null;
    try {
      console.log(`Checking cache for ${cacheKey}...`);
      cached = await getJson(cacheKey);
      if (cached) {
        console.log('✅ Serving picks from cache');
        return {
          statusCode: 200,
          headers: {
            ...headers,
            'X-Cache': 'HIT',
            'X-Generated-At': cached.generated_at || 'unknown'
          },
          body: JSON.stringify(cached)
        };
      }
    } catch (blobError) {
      console.warn('⚠️  Blobs not available (not enabled), skipping cache:', blobError.message);
    }
    
    // Cache miss (or blobs unavailable) - fetch from GitHub
    console.log('⚠️  Cache miss, fetching from GitHub...');
    const picks = await fetchPicksFromGitHub();
    
    if (!picks) {
      // Return sample data if GitHub repo not set up yet
      console.log('⚠️  GitHub repo not ready, returning sample data');
      const sampleData = {
        date: new Date().toISOString().split('T')[0],
        generated_at: new Date().toISOString(),
        picks: [],
        message: 'NBA-DDTD-RESEARCH repo not set up yet. Coming soon!',
        status: 'pending_setup'
      };
      
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'X-Cache': 'NONE',
          'X-Status': 'pending_setup'
        },
        body: JSON.stringify(sampleData)
      };
    }
    
    // Validate picks structure
    if (!picks.date || !picks.picks) {
      console.error('Invalid picks structure:', picks);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Invalid picks data structure',
          message: 'Data validation failed'
        })
      };
    }
    
    // Cache for 24 hours (if blobs available)
    try {
      console.log(`Caching picks for ${today}...`);
      await setJson(cacheKey, picks, 86400);
    } catch (cacheError) {
      console.warn('⚠️  Could not cache picks (blobs not enabled):', cacheError.message);
    }
    
    console.log('✅ Serving fresh picks from GitHub');
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'X-Cache': 'MISS',
        'X-Generated-At': picks.generated_at || 'unknown'
      },
      body: JSON.stringify(picks)
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
}

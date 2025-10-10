// netlify/functions/nfl-predictions-cached/index.mjs
// Cached predictions API - returns pre-generated predictions from Netlify Blobs
// Predictions are regenerated every 30 minutes by scheduled function

import { getStore } from "@netlify/blobs";

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const week = params.week || 'current';
    const season = params.season || '2025';
    const force = params.force === 'true' || params.refresh === 'true';
    
    const store = getStore({ name: "predictions-cache", context });
    const cacheKey = `nfl-predictions-${season}-week${week}`;
    
    // If force refresh, skip cache and trigger regeneration
    if (force) {
      console.log(`[CACHE] Force refresh requested for ${cacheKey}`);
      
      // Trigger background regeneration
      await triggerPredictionRegeneration(season, week);
      
      return {
        statusCode: 202,
        headers: {
          ...headers,
          'Retry-After': '3' // seconds
        },
        body: JSON.stringify({
          status: 'pending',
          season: parseInt(season),
          week: week,
          message: 'Predictions are being regenerated. Retry in 3 seconds.',
          estimated_wait_seconds: 3
        })
      };
    }
    
    // Try to get cached predictions
    const cachedData = await store.get(cacheKey, { type: 'json' });
    
    if (cachedData) {
      const age = Date.now() - new Date(cachedData.generated_at).getTime();
      const ageMinutes = Math.floor(age / 60000);
      
      console.log(`[CACHE] Serving cached predictions (${ageMinutes}min old)`);
      
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'X-Cache-Hit': 'true',
          'X-Cache-Age': ageMinutes.toString(),
          'Cache-Control': 'public, max-age=300' // 5min browser cache
        },
        body: JSON.stringify({
          ...cachedData,
          cache_hit: true,
          cache_age_minutes: ageMinutes
        })
      };
    }
    
    // Cache miss - trigger regeneration and return 202
    console.log(`[CACHE] Cache miss for ${cacheKey}, triggering regeneration`);
    
    await triggerPredictionRegeneration(season, week);
    
    return {
      statusCode: 202,
      headers: {
        ...headers,
        'Retry-After': '3' // seconds
      },
      body: JSON.stringify({
        status: 'pending',
        season: parseInt(season),
        week: week,
        message: 'Cache warming… grabbing latest odds & injury snapshots. Retry in 3 seconds.',
        estimated_wait_seconds: 3
      })
    };
    
  } catch (error) {
    console.error('[CACHE] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        fallback: 'Try /.netlify/functions/nfl-predictions-generate for live generation'
      })
    };
  }
};

/**
 * Trigger background prediction regeneration
 * Calls the generator function asynchronously
 */
async function triggerPredictionRegeneration(season, week) {
  try {
    // Get schedule first
    const scheduleUrl = `${process.env.URL || 'https://localhost:8888'}/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`;
    const scheduleRes = await fetch(scheduleUrl);
    const scheduleData = await scheduleRes.json();
    
    const games = (scheduleData.matchups || []).map(game => ({
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      game_id: game.id,
      start: game.kickoff
    }));
    
    if (games.length === 0) {
      console.warn('[CACHE] No games found in schedule');
      return;
    }
    
    // Trigger prediction generation (don't await - let it run in background)
    const genUrl = `${process.env.URL || 'https://localhost:8888'}/.netlify/functions/nfl-predictions-generate`;
    
    fetch(genUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        season: season.toString(),
        games: games,
        cache: true // Signal to save to cache
      })
    }).catch(err => {
      console.error('[CACHE] Background generation failed:', err);
    });
    
    console.log(`[CACHE] Triggered background generation for ${games.length} games`);
    
  } catch (error) {
    console.error('[CACHE] Failed to trigger regeneration:', error);
    throw error;
  }
}

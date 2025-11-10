// netlify/functions/nfl-v5-refresh-now.mjs
/**
 * On-demand refresh endpoint for NFL V5 predictions
 * 
 * Generates fresh predictions with:
 * - Latest odds from TheOddsAPI
 * - Current injury data
 * - Live weather conditions (dome detection)
 * - All advanced metrics and safety rails
 * 
 * Flow:
 * 1. Call nfl-predictions-generate with current week
 * 2. Transform to V5 bundle format
 * 3. Update Netlify Blobs storage
 * 4. Return fresh predictions to user
 * 
 * Usage: User clicks "Refresh" button on V5 page
 */

import { getStore } from '@netlify/blobs';

// V5 model configuration
const V5_MODELS = {
  spread: {
    name: "Poisson EPA V3",
    description: "Advanced EPA-based spread predictions",
    backtested_roi: "+37%",
    min_edge: "5%"
  },
  total: {
    name: "Quantile Blend V5", 
    description: "25th/75th percentile totals",
    backtested_roi: "+18%",
    min_edge: "4%"
  }
};

/**
 * Get current NFL week number (2025 season)
 */
function getCurrentNFLWeek() {
  const now = new Date();
  const season = 2025;
  const seasonStart = new Date('2025-09-05'); // Week 1 Thursday
  
  const diffMs = now - seasonStart;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Special logic for weeks 1-3 (account for early Thursday games)
  if (diffDays < 4) return 1;
  if (diffDays < 11) return 2;
  if (diffDays < 18) return 3;
  
  // Week 4+: Standard 7-day weeks
  return Math.floor((diffDays - 18) / 7) + 4;
}

/**
 * Fetch current week's schedule
 */
async function fetchSchedule(season, week) {
  try {
    // Try internal schedule endpoint first
    const scheduleUrl = `${process.env.URL || 'https://bgroundrobin.com'}/.netlify/functions/nfl-schedule-get?season=${season}&week=${week}`;
    const res = await fetch(scheduleUrl);
    
    if (res.ok) {
      const data = await res.json();
      // nfl-schedule-get returns { matchups: [...] } not { games: [...] }
      const matchups = data.matchups || [];
      
      // Transform matchups to games format expected by nfl-predictions-generate
      return matchups.map(m => ({
        game_id: m.id,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        start: m.kickoff
      }));
    }
  } catch (err) {
    console.warn('[V5-REFRESH] Schedule fetch failed:', err.message);
  }
  
  return [];
}

/**
 * Generate predictions by calling existing nfl-predictions-generate endpoint
 */
async function generatePredictions(season, games) {
  const generateUrl = `${process.env.URL || 'https://bgroundrobin.com'}/.netlify/functions/nfl-predictions-generate`;
  
  const res = await fetch(generateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      season,
      games,
      refresh: true // Force fresh data
    })
  });
  
  if (!res.ok) {
    throw new Error(`Prediction generation failed: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  // nfl-predictions-generate returns { predictions: [...], parlaySuggestions: [...] }
  // We only need the predictions array
  return data.predictions || data || [];
}

/**
 * Transform V1 predictions to V5 bundle format
 */
function transformToV5Bundle(predictions, season, week) {
  const timestamp = new Date().toISOString();
  
  // Build rows array with V5 structure
  const rows = predictions.map(pred => {
    const spread = pred.predictions?.spread || {};
    const total = pred.predictions?.total || {};
    const moneyline = pred.predictions?.moneyline || {};
    
    return {
      game_id: pred.game_id,
      matchup: `${pred.away_team} @ ${pred.home_team}`,
      kickoff: pred.start || pred.kickoff,
      
      // Team identifiers
      away_team: pred.away_team,
      home_team: pred.home_team,
      
      // Spread prediction (Poisson EPA V3)
      spread: {
        pick: spread.pick,
        line: spread.line,
        predicted_margin: spread.predicted,
        confidence: spread.confidence,
        edge: spread.edge,
        recommended_units: spread.recommended_units || 0
      },
      
      // Total prediction (Quantile Blend V5)
      total: {
        pick: total.pick,
        line: total.line,
        predicted_total: total.predicted,
        confidence: total.confidence,
        edge: total.edge,
        recommended_units: total.recommended_units || 0
      },
      
      // Moneyline
      moneyline: {
        pick: moneyline.pick,
        confidence: moneyline.confidence,
        edge: moneyline.edge,
        recommended_units: moneyline.recommended_units || 0
      },
      
      // Probabilities
      home_win_prob: pred.predictions?.home_win_prob || 0.5,
      away_win_prob: pred.predictions?.away_win_prob || 0.5,
      
      // Model version info
      model_version: "v5-hybrid",
      generated_at: timestamp
    };
  });
  
  // Build metadata
  const meta = {
    model_version: "v5",
    season,
    week,
    updated_at: timestamp,
    games_count: rows.length,
    models: V5_MODELS,
    data_sources: {
      odds: "TheOddsAPI (real-time)",
      injuries: "Canonical Availability V5",
      weather: "Dome detection + historical",
      metrics: "Advanced EPA system"
    }
  };
  
  return { meta, rows };
}

/**
 * Upload bundle to Netlify Blobs with multiple storage keys
 */
async function uploadToBlobs(bundle) {
  const name = process.env.BLOBS_STORE_V5 || "nfl-v5";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  
  const store = (siteID && token) 
    ? getStore({ siteID, token, name }) 
    : getStore(name);
  
  const { meta } = bundle;
  const date = new Date().toISOString().split('T')[0];
  
  // Store in multiple locations for different access patterns
  await Promise.all([
    // Primary: Latest predictions
    store.set('predictions/latest.json', JSON.stringify(bundle)),
    
    // Historical: By date
    store.set(`predictions/${date}.json`, JSON.stringify(bundle)),
    
    // By week
    store.set(`predictions/${meta.season}-week${meta.week}.json`, JSON.stringify(bundle)),
    
    // Summary metadata
    store.set('predictions/summary.json', JSON.stringify({
      last_updated: meta.updated_at,
      season: meta.season,
      week: meta.week,
      games_count: meta.games_count
    }))
  ]);
  
  console.log(`[V5-REFRESH] Uploaded to Blobs: ${meta.games_count} games for Week ${meta.week}`);
}

/**
 * Main handler
 */
export default async (request) => {
  const startTime = Date.now();
  
  try {
    console.log('[V5-REFRESH] Starting on-demand refresh...');
    
    // 1. Determine current week
    const season = 2025;
    const week = getCurrentNFLWeek();
    console.log(`[V5-REFRESH] Current week: ${season} Week ${week}`);
    
    // 2. Fetch schedule
    const games = await fetchSchedule(season, week);
    if (games.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No games found for current week',
        season,
        week
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    console.log(`[V5-REFRESH] Found ${games.length} games`);
    
    // 3. Generate predictions (calls nfl-predictions-generate)
    console.log('[V5-REFRESH] Generating predictions with fresh odds + injuries...');
    const predictions = await generatePredictions(season, games);
    console.log(`[V5-REFRESH] Generated ${predictions.length} predictions`);
    
    // 4. Transform to V5 format
    const bundle = transformToV5Bundle(predictions, season, week);
    
    // 5. Upload to Blobs
    await uploadToBlobs(bundle);
    
    // 6. Return fresh data to client
    const duration = Date.now() - startTime;
    
    return new Response(JSON.stringify({
      ok: true,
      ...bundle,
      refresh_metadata: {
        duration_ms: duration,
        refreshed_at: new Date().toISOString(),
        source: 'on-demand'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Don't cache refresh responses
        'X-Refresh-Duration': `${duration}ms`
      }
    });
    
  } catch (error) {
    console.error('[V5-REFRESH] Error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

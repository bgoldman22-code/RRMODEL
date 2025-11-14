/**
 * Netlify Function: nfl-v5-get
 * 
 * Returns V5 predictions from Netlify Blobs for a specified season and week.
 * Zero dependencies on V1 codebase - reads pre-generated bundle only.
 * 
 * FLOW:
 * =====
 * 1. Parse query params for season and week (both required for explicit retrieval)
 * 2. Fetch bundle from Netlify Blobs using key: nfl-v5-<season>-week-<week>
 * 3. Return bundle as JSON with minimal metadata wrapper
 * 4. Cache for 60 seconds (allows frequent updates during game weeks)
 * 
 * ENVIRONMENT:
 * ============
 * - NODE_VERSION: 20.x (Netlify default)
 * - No model inference, no data loading - just read from Blobs
 * - No V1 dependencies
 * 
 * ENDPOINTS:
 * ==========
 * GET /.netlify/functions/nfl-v5-get?season=2025&week=11
 *   Query params: season (required), week (required)
 *   Response: { "season": 2025, "week": 11, "source": "blobs:nfl-v5", "bundle": {...} }
 * 
 * NOTE: Both season and week are required. This ensures explicit retrieval
 * and avoids ambiguity about which week is "current" or "latest".
 */

import { getBundle, getBundleKey } from './_lib/blobs-nfl-v5.mjs';

export default async function handler(req, context) {
  try {
    // Parse query params
    const url = new URL(req.url);
    const seasonParam = url.searchParams.get('season');
    const weekParam = url.searchParams.get('week');
    
    // Validate required parameters
    if (!seasonParam || !weekParam) {
      return new Response(JSON.stringify({
        error: 'Invalid parameters',
        message: 'Both "season" and "week" query parameters are required',
        example: '/.netlify/functions/nfl-v5-get?season=2025&week=11'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const season = parseInt(seasonParam, 10);
    const week = parseInt(weekParam, 10);
    
    // Validate season
    if (isNaN(season) || season < 2020 || season > 2030) {
      return new Response(JSON.stringify({
        error: 'Invalid parameters',
        message: 'Season must be between 2020 and 2030'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate week
    if (isNaN(week) || week < 1 || week > 18) {
      return new Response(JSON.stringify({
        error: 'Invalid parameters',
        message: 'Week must be between 1 and 18'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📦 Fetching V5 bundle for ${season} Week ${week}`);
    
    // Fetch bundle from Blobs
    const bundle = await getBundle(season, week);
    
    if (!bundle) {
      const key = getBundleKey(season, week);
      console.log(`❌ Bundle not found: ${key}`);
      
      return new Response(JSON.stringify({
        error: 'Bundle not found',
        message: `No V5 predictions available for ${season} Week ${week}`,
        bundle_key: key,
        note: 'Bundle may not have been generated yet. Try generating it first via /api/nfl-v5/generate'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    console.log(`✅ Bundle retrieved: ${bundle.games_count} games`);
    
    // Return bundle wrapped with minimal metadata
    const response = {
      season: bundle.season,
      week: bundle.week,
      source: 'blobs:nfl-v5',
      bundle: bundle
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' // Cache for 60 seconds
      }
    });
    
  } catch (error) {
    console.error('❌ Error in nfl-v5-get:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

export const config = {
  path: '/api/nfl-v5/get'
};

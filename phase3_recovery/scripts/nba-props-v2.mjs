/**
 * NBA Player Props V2 API (Phase 3 PRA Model)
 * 
 * Serves Phase 3 PRA predictions (Points/Rebounds/Assists)
 * 
 * Modes:
 * - Default: Serves static JSON (fast, cached)
 * - Refresh: Regenerates predictions on-demand (requires ODDS_API_KEY)
 * 
 * Pattern mirrors nba-player-props.mjs (V1) for consistency
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  try {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Check if this is a refresh request
    // V1 pattern: refresh is implicit when called, no special query param
    // We'll still support query param for explicit refresh
    const url = new URL(req.url);
    const isRefreshRequest = url.searchParams.get('refresh') === '1';

    // If refresh requested, regenerate predictions
    if (isRefreshRequest) {
      console.log('🔄 V2 Refresh requested - regenerating predictions...');
      
      // Check for ODDS_API_KEY
      if (!process.env.ODDS_API_KEY) {
        console.error('❌ ODDS_API_KEY not configured');
        return new Response(
          JSON.stringify({ 
            error: 'Refresh not available - ODDS_API_KEY not configured',
            predictions: []
          }),
          { status: 403, headers }
        );
      }

      try {
        // Step 1: Update boxscores (also updates opponent defense)
        console.log('  📊 Updating boxscores...');
        execSync('node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily', {
          cwd: process.cwd(),
          stdio: 'inherit',
          timeout: 60000 // 60 second timeout
        });
        
        // Step 2: Generate fresh predictions
        console.log('  🎯 Generating V2 predictions...');
        execSync('node scripts/nba/generate-pra-predictions-v2.mjs', {
          cwd: process.cwd(),
          env: { 
            ...process.env, 
            ODDS_API_KEY: process.env.ODDS_API_KEY 
          },
          stdio: 'inherit',
          timeout: 120000 // 2 minute timeout
        });
        
        console.log('✅ V2 predictions refreshed successfully');
        
      } catch (error) {
        console.error('❌ Refresh failed:', error.message);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to refresh predictions',
            message: error.message,
            predictions: []
          }),
          { status: 500, headers }
        );
      }
    }

    // Load and serve the predictions JSON (whether refreshed or existing)
    const jsonPath = join(process.cwd(), 'public/data/nba/nba-props-v2-live.json');
    
    if (!existsSync(jsonPath)) {
      console.warn('⚠️  V2 predictions file not found');
      return new Response(
        JSON.stringify({ 
          error: 'Predictions not yet generated',
          message: 'Run: node scripts/nba/generate-pra-predictions-v2.mjs',
          predictions: []
        }),
        { status: 404, headers }
      );
    }

    const data = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(data);
    
    console.log(`✓ Serving ${parsed.predictions?.length || 0} V2 predictions`);
    
    return new Response(data, { status: 200, headers });
    
  } catch (error) {
    console.error('❌ Error serving V2 predictions:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to load predictions',
        message: error.message,
        predictions: []
      }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/nba-props-v2"
};

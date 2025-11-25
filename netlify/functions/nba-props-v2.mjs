/**
 * NBA Player Props V2 API (Phase 3.5 Production)
 * 
 * Serves Phase 3.5 hybrid predictions (Points/Rebounds/Assists):
 * - Logistic PRA for Assists (61% WR, +14.2% ROI)
 * - LightGBM for Points (58.7% WR, +10.3% ROI)
 * - LightGBM for Rebounds (54.2% WR, +1.1% ROI)
 * 
 * Modes:
 * - Default: Serves static JSON (fast, cached)
 * - Refresh: Regenerates predictions on-demand (requires ODDS_API_KEY)
 * 
 * WARNING: Refresh mode is slow (~2-3 min) and may timeout on Netlify free tier.
 * Daily updates should be handled by GitHub Actions scheduled workflow.
 * Use refresh endpoint for emergency/manual updates only.
 * 
 * NOTE: This endpoint now serves Phase 3.5 data (mixed Logistic + LightGBM)
 * while maintaining backward compatibility with the V2 API contract.
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
      console.log('🔄 Phase 3.5 Refresh requested - regenerating predictions...');
      
      // Check for ODDS_API_KEY
      if (!process.env.ODDS_API_KEY) {
        console.error('❌ ODDS_API_KEY not configured');
        return new Response(
          JSON.stringify({ 
            error: 'Refresh not available - ODDS_API_KEY not configured',
            picks: []
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
        
        // Step 2: Generate fresh Phase 3.5 predictions (hybrid Logistic + LightGBM)
        console.log('  🎯 Generating Phase 3.5 predictions (Logistic + LightGBM)...');
        execSync('node scripts/nba/generate-predictions-phase3.5.mjs', {
          cwd: process.cwd(),
          env: { 
            ...process.env, 
            ODDS_API_KEY: process.env.ODDS_API_KEY 
          },
          stdio: 'inherit',
          timeout: 180000 // 3 minute timeout (LightGBM needs more time)
        });
        
        console.log('✅ Phase 3.5 predictions refreshed successfully');
        
      } catch (error) {
        console.error('❌ Refresh failed:', error.message);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to refresh predictions',
            message: error.message,
            picks: []
          }),
          { status: 500, headers }
        );
      }
    }

    // Load and serve the predictions JSON (whether refreshed or existing)
    const jsonPath = join(process.cwd(), 'public/data/nba/nba-props-v2-live.json');
    
    if (!existsSync(jsonPath)) {
      console.warn('⚠️  Phase 3.5 predictions file not found');
      return new Response(
        JSON.stringify({ 
          error: 'Predictions not yet generated',
          message: 'Run: node scripts/nba/generate-predictions-phase3.5.mjs',
          picks: []
        }),
        { status: 404, headers }
      );
    }

    const data = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(data);
    
    console.log(`✓ Serving ${parsed.picks?.length || 0} Phase 3.5 predictions (model: ${parsed.model_version || 'unknown'})`);
    
    return new Response(data, { status: 200, headers });
    
  } catch (error) {
    console.error('❌ Error serving Phase 3.5 predictions:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to load predictions',
        message: error.message,
        picks: []
      }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/nba-props-v2"
};

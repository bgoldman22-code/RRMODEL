/**
 * Netlify Function: nfl-v5-generate
 * 
 * Generates V5 predictions for a specified NFL week and stores them in Netlify Blobs.
 * Spawns the generate-v5-week.mjs script, waits for completion, then stores the bundle.
 * 
 * FLOW:
 * =====
 * 1. Parse query params for season and week (week is required)
 * 2. Spawn nfl-model-v4.1/scripts/generate-v5-week.mjs
 * 3. Wait for script to complete and write bundle to output/
 * 4. Read the generated bundle JSON
 * 5. Store in Netlify Blobs using key: nfl-v5-<season>-week-<week>
 * 6. Return status JSON with metadata
 * 
 * ENVIRONMENT:
 * ============
 * - NODE_VERSION: 20.x (Netlify default)
 * - No V1 dependencies (isolated from V1 codebase)
 * - Uses frozen V5 coefficients
 * 
 * ENDPOINTS:
 * ==========
 * GET /.netlify/functions/nfl-v5-generate?season=2025&week=11
 *   Query params: season (optional, defaults to current year), week (required)
 *   Response: { "status": "ok", "season": 2025, "week": 11, "games_count": 14, ... }
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBundleKey, setBundle } from './_lib/blobs-nfl-v5.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, context) {
  try {
    // Parse query parameters
    const url = new URL(req.url);
    const seasonParam = url.searchParams.get('season');
    const weekParam = url.searchParams.get('week');
    
    // Validate week (required)
    if (!weekParam) {
      return new Response(JSON.stringify({
        error: 'Invalid week',
        message: 'Query parameter "week" is required (1-18)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const week = parseInt(weekParam, 10);
    if (isNaN(week) || week < 1 || week > 18) {
      return new Response(JSON.stringify({
        error: 'Invalid week',
        message: 'Week must be between 1 and 18'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Parse season (optional, defaults to current year)
    const season = seasonParam ? parseInt(seasonParam, 10) : new Date().getFullYear();
    if (isNaN(season) || season < 2020 || season > 2030) {
      return new Response(JSON.stringify({
        error: 'Invalid season',
        message: 'Season must be between 2020 and 2030'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`🏈 Generating V5 predictions for ${season} Week ${week}`);
    
    // Paths
    const repoRoot = path.join(__dirname, '..', '..', '..');
    const v5Root = path.join(repoRoot, 'nfl-model-v4.1');
    const scriptPath = path.join(v5Root, 'scripts', 'generate-v5-week.mjs');
    const outputPath = path.join(v5Root, 'output', `bundle_v5_${season}_week${week}.json`);
    
    // Spawn the generation script
    const generationResult = await new Promise((resolve, reject) => {
      const child = spawn('node', [
        scriptPath,
        '--season', season.toString(),
        '--week', week.toString(),
        '--output', outputPath
      ], {
        cwd: v5Root,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to spawn script: ${error.message}`));
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Script exited with code ${code}\nStderr: ${stderr}`));
        }
      });
    });
    
    console.log('✅ Generation script completed successfully');
    
    // Read the generated bundle
    const bundleJson = await readFile(outputPath, 'utf-8');
    const bundle = JSON.parse(bundleJson);
    
    console.log(`📦 Bundle loaded: ${bundle.games_count} games`);
    
    // Store in Netlify Blobs
    const stored = await setBundle(season, week, bundle);
    
    if (!stored) {
      throw new Error('Failed to store bundle in Netlify Blobs');
    }
    
    // Extract metadata for response
    const response = {
      status: 'ok',
      season: bundle.season,
      week: bundle.week,
      bundle_key: getBundleKey(season, week),
      games_count: bundle.games_count,
      generated_at: bundle.generated_at,
      model_version: bundle.model_version
    };
    
    console.log('✅ Bundle stored successfully');
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('❌ Error in nfl-v5-generate:', error);
    
    return new Response(JSON.stringify({
      error: 'Generation failed',
      message: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

export const config = {
  path: '/api/nfl-v5/generate'
};

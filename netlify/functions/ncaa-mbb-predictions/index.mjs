// NCAA MBB Predictions Function
// Calls the NCAA MBB Model to generate moneyline predictions

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

export default async function handler(event, context) {
  console.log('[NCAA MBB] Starting predictions...');
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    console.log(`[NCAA MBB] Generating predictions for ${today}`);
    
    // Path to NCAA MBB Model - use environment variable or default path
    const ncaaModelPath = process.env.NCAA_MBB_MODEL_PATH || '/opt/build/repo/../NCAAMBBModel';
    const outputPath = path.join(ncaaModelPath, 'data/ncaabb/picks', `variant_b_picks_odds_aware_${today}.json`);
    const csvPath = path.join(ncaaModelPath, 'data/ncaabb/picks', `variant_b_picks_odds_aware_${today}.csv`);
    
    // Check if today's picks already exist (cached)
    try {
      const existingPicks = await fs.readFile(outputPath, 'utf-8');
      const data = JSON.parse(existingPicks);
      console.log(`[NCAA MBB] ✅ Found cached picks: ${data.num_picks} games`);
      
      // Transform to frontend format
      const transformed = transformPicks(data, today);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // 5 minute cache
        },
        body: JSON.stringify({
          ok: true,
          predictions: transformed.predictions,
          metadata: transformed.metadata,
          generated: new Date().toISOString(),
          cached: true
        })
      };
    } catch (err) {
      console.log('[NCAA MBB] No cached picks found, generating fresh...');
    }
    
    // Generate fresh picks using live mode
    const command = `cd ${ncaaModelPath} && python3 scripts/ncaabb/run_daily_variant_b_live.py`;
    
    console.log(`[NCAA MBB] Running: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env,
        ODDS_API_KEY: process.env.ODDS_API_KEY || process.env.REACT_APP_ODDS_API_KEY,
        VARIANT_B_MIN_EDGE: '0.1',  // Lower threshold to 10% to get more games
        VARIANT_B_KELLY_FRACTION: '0.25',
        VARIANT_B_BANKROLL: '10000',
        VARIANT_B_MODE: 'live'
      }
    });
    
    if (stderr) {
      console.log(`[NCAA MBB] stderr: ${stderr}`);
    }
    
    console.log(`[NCAA MBB] stdout: ${stdout}`);
    
    // Read generated picks
    const picksData = await fs.readFile(outputPath, 'utf-8');
    const data = JSON.parse(picksData);
    
    console.log(`[NCAA MBB] ✅ Generated ${data.num_picks} picks`);
    
    // Transform to frontend format
    const transformed = transformPicks(data, today);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        ok: true,
        predictions: transformed.predictions,
        metadata: transformed.metadata,
        generated: new Date().toISOString(),
        cached: false
      })
    };
    
  } catch (error) {
    console.error('[NCAA MBB] Error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: error.message,
        error: error.stack
      })
    };
  }
}

/**
 * Transform NCAA MBB Model output to frontend format
 */
function transformPicks(data, date) {
  const predictions = (data.picks || []).map(pick => {
    const favorite = pick.side === 'home' ? pick.home_team : pick.away_team;
    const underdog = pick.side === 'home' ? pick.away_team : pick.home_team;
    
    return {
      game: `${pick.away_team} @ ${pick.home_team}`,
      awayTeam: pick.away_team,
      homeTeam: pick.home_team,
      prediction: {
        pick: favorite,
        side: pick.side,
        confidence: Math.round(pick.edge * 100), // Edge as confidence %
        winProbability: {
          favoriteTeam: favorite,
          favoritePercent: pick.model_win_prob * 100,
          underdogTeam: underdog,
          underdogPercent: (1 - pick.model_win_prob) * 100
        }
      },
      vegasLines: {
        moneyline: {
          favorite: pick.odds,
          favoriteTeam: favorite,
          underdog: pick.odds > 0 ? -Math.abs(pick.odds) : Math.abs(pick.odds),
          underdogTeam: underdog
        }
      },
      betting: {
        edge: pick.edge,
        recommendedStake: pick.bet_size_dollars,
        kellyFraction: 0.25,
        maxExposure: pick.bet_size_dollars
      },
      metadata: {
        date: date,
        model: 'NCAA Variant B',
        minEdge: 0.15
      }
    };
  });
  
  return {
    predictions,
    metadata: {
      totalPicks: data.num_picks || predictions.length,
      totalStake: data.total_bet_size || predictions.reduce((sum, p) => sum + p.betting.recommendedStake, 0),
      avgEdge: data.avg_edge || (predictions.reduce((sum, p) => sum + p.betting.edge, 0) / predictions.length),
      maxEdge: data.max_edge || Math.max(...predictions.map(p => p.betting.edge)),
      date: date,
      bankroll: 10000,
      model: 'NCAA Variant B'
    }
  };
}

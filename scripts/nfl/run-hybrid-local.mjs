#!/usr/bin/env node
/**
 * scripts/nfl/run-hybrid-local.mjs
 * 
 * NFL Hybrid Model Runner (V5 + V1 Lightweight)
 * 
 * ARCHITECTURE:
 * - Spreads: V5 as backbone, V1 as contextual overlay (alpha=0.4, clamped ±4pts)
 * - Totals: V5 p50 as canonical, V1 only for volatility detection
 * - Disagreement guardrails: Reduce/block bets when models diverge significantly
 * - Injury adjustments: YES (from V1)
 * - Depth charts: NO (disabled for speed)
 * 
 * USAGE:
 *   node scripts/nfl/run-hybrid-local.mjs 2025 14
 * 
 * OUTPUT:
 *   output/nfl_hybrid_2025_week14.json
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '../../.env.local') });

// ========================================
// CONFIGURATION
// ========================================

const ALPHA = 0.4;                    // V1 influence on V5 spread (40%)
const DISAGREEMENT_CLAMP = 4;         // Max ±4pts disagreement allowed
const SPREAD_EDGE_THRESHOLD = 1.5;    // Min edge for spread bet
const TOTAL_EDGE_THRESHOLD = 2.5;     // Min edge for total bet
const HIGH_VARIANCE_TOTAL_DELTA = 7;  // V1-V5 delta indicating volatility

// Odds API (check both ODDS_API_KEY and REACT_APP_ODDS_API_KEY)
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.REACT_APP_ODDS_API_KEY || '';
const ODDS_API_URL = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';

// ========================================
// HELPER: Generate V5 Predictions (if needed)
// ========================================

async function ensureV5Predictions(season, week) {
  const v5Path = join(__dirname, `../../nfl-model-v4.1/output/bundle_v5_${season}_week${week}.json`);
  
  try {
    // Check if V5 bundle exists
    const data = await readFile(v5Path, 'utf-8');
    const bundle = JSON.parse(data);
    console.log(`✅ Found existing V5 predictions: ${bundle.games?.length || 0} games`);
    return bundle.games || [];
  } catch (error) {
    // V5 bundle doesn't exist, generate it
    console.log(`🔄 V5 predictions not found, generating...`);
    
    const { spawn } = await import('child_process');
    const v5Script = join(__dirname, '../../nfl-model-v4.1/scripts/v5-ensemble.mjs');
    
    return new Promise((resolve, reject) => {
      // Use --season and --week flags (not positional args)
      const proc = spawn('node', [v5Script, '--season', season, '--week', week], {
        stdio: 'inherit',
        cwd: join(__dirname, '../..')
      });
      
      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`V5 generation failed with code ${code}`));
          return;
        }
        
        // Now load the generated bundle
        try {
          const data = await readFile(v5Path, 'utf-8');
          const bundle = JSON.parse(data);
          console.log(`✅ Generated V5 predictions: ${bundle.games?.length || 0} games`);
          resolve(bundle.games || []);
        } catch (err) {
          reject(new Error(`Failed to load generated V5 bundle: ${err.message}`));
        }
      });
    });
  }
}

// ========================================
// HELPER: Call V1 Model (via file or API)
// ========================================

async function getV1Predictions(season, week) {
  // OPTION 1: Try to load pre-generated V1 file (fastest)
  const v1FilePath = join(__dirname, `../../output/v1_for_hybrid_${season}_week${week}.json`);
  
  try {
    const data = await readFile(v1FilePath, 'utf-8');
    const v1Data = JSON.parse(data);
    console.log(`✅ V1 predictions loaded from file: ${v1Data.predictions?.length || 0} games`);
    return v1Data.predictions || [];
  } catch (fileError) {
    // File doesn't exist, try API
    console.log(`📋 V1 file not found, trying API...`);
  }
  
  // OPTION 2: Try localhost API (if Netlify dev server is running)
  const url = `http://localhost:8888/.netlify/functions/nfl-predictions-generate`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        season: season.toString(),
        week: week.toString(),
        disable_depth_charts: true,
        refresh: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`V1 API returned ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ V1 predictions from API: ${data.predictions?.length || 0} games`);
    return data.predictions || [];
  } catch (error) {
    console.warn(`⚠️  V1 not available via file or API`);
    console.warn(`\n📋 TO GET V1 DATA:`);
    console.warn(`   Run: node scripts/nfl/generate-v1-for-hybrid.mjs ${season} ${week}`);
    console.warn(`   Then re-run this hybrid script\n`);
    console.warn(`   Using V5-only mode for now...\n`);
    return null;
  }
}

// ========================================
// HELPER: Fetch Market Odds
// ========================================

async function fetchMarketOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  No ODDS_API_KEY, using placeholder odds');
    return [];
  }
  
  try {
    const url = `${ODDS_API_URL}?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Odds API returned ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Fetched odds for ${data.length} games`);
    return data;
  } catch (error) {
    console.warn(`⚠️  Odds fetch failed: ${error.message}`);
    return [];
  }
}

// ========================================
// HELPER: Normalize Team Code
// ========================================

function normalizeTeamCode(code) {
  const mapping = {
    'LA': 'LAR',
    'WSH': 'WAS',
    'JAX': 'JAC'
  };
  return mapping[code] || code;
}

// ========================================
// HELPER: Match Game with Odds
// ========================================

function findOddsForGame(game, oddsData) {
  const homeTeam = normalizeTeamCode(game.home_team);
  const awayTeam = normalizeTeamCode(game.away_team);
  
  for (const event of oddsData) {
    // Match by team names (odds API uses full names, we need fuzzy matching)
    const eventHome = event.home_team?.toUpperCase();
    const eventAway = event.away_team?.toUpperCase();
    
    // Simple check: if both teams appear in the event
    if ((eventHome?.includes(homeTeam) || eventHome?.includes(awayTeam)) &&
        (eventAway?.includes(homeTeam) || eventAway?.includes(awayTeam))) {
      
      // Extract best spread and total
      const bookmakers = event.bookmakers || [];
      let bestSpread = null;
      let bestTotal = null;
      
      for (const book of bookmakers) {
        for (const market of book.markets || []) {
          if (market.key === 'spreads') {
            const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
            if (homeOutcome) {
              bestSpread = homeOutcome.point; // Positive = home favored
            }
          }
          if (market.key === 'totals') {
            const overOutcome = market.outcomes.find(o => o.name === 'Over');
            if (overOutcome) {
              bestTotal = overOutcome.point;
            }
          }
        }
      }
      
      return { spread: bestSpread, total: bestTotal, bookmaker: bookmakers[0]?.title || 'DraftKings' };
    }
  }
  
  return { spread: null, total: null, bookmaker: null };
}

// ========================================
// HELPER: Compute Hybrid Spread
// ========================================

function computeHybridSpread(v5Margin, v1Margin) {
  if (v1Margin === null || v1Margin === undefined) {
    // V5-only mode
    return {
      hybridMargin: v5Margin,
      disagreement: 0,
      alpha: 0
    };
  }
  
  const disagreement = v1Margin - v5Margin;
  const disagreementClamped = Math.max(-DISAGREEMENT_CLAMP, Math.min(DISAGREEMENT_CLAMP, disagreement));
  const hybridMargin = v5Margin + (ALPHA * disagreementClamped);
  
  return {
    hybridMargin,
    disagreement,
    alpha: ALPHA
  };
}

// ========================================
// HELPER: Compute Stake Sizing for Spread
// ========================================

function computeSpreadStake(edgePts, disagreement) {
  const absEdge = Math.abs(edgePts);
  const absDisagree = Math.abs(disagreement);
  
  // Base units from edge
  let units = 0;
  if (absEdge < SPREAD_EDGE_THRESHOLD) {
    units = 0;
  } else if (absEdge < 3) {
    units = 1.0;
  } else if (absEdge < 4.5) {
    units = 2.0;
  } else {
    units = 3.0;
  }
  
  // Disagreement guardrails
  if (absDisagree > 5) {
    units = 0; // Track only
  } else if (absDisagree > 3) {
    units *= 0.5; // Cut stakes in half
  }
  
  // Assign category
  let category = 'TRACK';
  if (units >= 2.5) category = 'STRONG';
  else if (units > 0) category = 'CONSIDER';
  
  return { units: Math.round(units * 10) / 10, category };
}

// ========================================
// HELPER: Compute Total Pick & Stake
// ========================================

function computeTotalPick(v5Total, v1Total, marketTotal) {
  const diff = v5Total - marketTotal;
  const totalDisagreement = v1Total !== null ? Math.abs(v1Total - v5Total) : 0;
  const isHighVariance = totalDisagreement > HIGH_VARIANCE_TOTAL_DELTA;
  
  let side = 'no_bet';
  let edgePts = 0;
  let units = 0;
  
  if (diff > TOTAL_EDGE_THRESHOLD) {
    side = 'over';
    edgePts = diff;
  } else if (diff < -TOTAL_EDGE_THRESHOLD) {
    side = 'under';
    edgePts = -diff;
  }
  
  if (side !== 'no_bet') {
    if (edgePts < 3) {
      units = 0.5;
    } else if (edgePts < 5) {
      units = 1.0;
    } else {
      units = 2.0;
    }
    
    // Volatility haircut
    if (isHighVariance) {
      units *= 0.5;
    }
  }
  
  let category = 'TRACK';
  if (units >= 1.5) category = 'STRONG';
  else if (units > 0) category = 'CONSIDER';
  
  return {
    side,
    edgePts,
    units: Math.round(units * 10) / 10,
    highVariance: isHighVariance,
    category
  };
}

// ========================================
// HELPER: Convert Margin to Display Spread
// ========================================

function marginToDisplaySpread(margin, favoriteTeam, dogTeam) {
  if (margin > 0) {
    // Home favored
    return `${favoriteTeam} -${Math.abs(margin).toFixed(1)}`;
  } else {
    // Away favored
    return `${dogTeam} -${Math.abs(margin).toFixed(1)}`;
  }
}

// ========================================
// MAIN: Generate Hybrid Predictions
// ========================================

async function generateHybridPredictions(season, week) {
  console.log('\n' + '='.repeat(70));
  console.log(`🏈 NFL HYBRID MODEL RUNNER - ${season} Week ${week}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Step 1: Ensure V5 predictions exist (generate if needed)
  console.log('📊 Step 1: Ensuring V5 predictions exist...');
  const v5Games = await ensureV5Predictions(season, week);
  
  // Step 2: Get V1 predictions (optional, with depth charts disabled)
  console.log('\n📊 Step 2: Loading V1 predictions (lightweight mode)...');
  const v1Games = await getV1Predictions(season, week);
  
  // Step 3: Fetch market odds
  console.log('\n📊 Step 3: Fetching market odds...');
  const oddsData = await fetchMarketOdds();
  
  // Step 4: Process each game
  console.log('\n🔮 Step 4: Computing hybrid predictions...\n');
  const hybridGames = [];
  
  for (const v5Game of v5Games) {
    const gameId = v5Game.game_id;
    const homeTeam = v5Game.home_team;
    const awayTeam = v5Game.away_team;
    
    console.log(`  Processing: ${awayTeam} @ ${homeTeam}`);
    
    // Get V5 values
    const v5SpreadMargin = v5Game.spread_model?.predicted_spread || 0;
    const v5TotalP50 = v5Game.total_model?.p50 || 44;
    
    // Get V1 values (if available)
    let v1HomeMargin = null;
    let v1TotalEstimate = null;
    
    if (v1Games) {
      const v1Game = v1Games.find(g => 
        g.home_team === homeTeam && g.away_team === awayTeam
      );
      
      if (v1Game) {
        // Extract V1 margin from predictions
        const v1SpreadPredicted = v1Game.predictions?.spread?.predicted || 0;
        v1HomeMargin = v1SpreadPredicted;
        v1TotalEstimate = v1Game.predictions?.total?.predicted || 44;
      }
    }
    
    // Get market odds
    const odds = findOddsForGame(v5Game, oddsData);
    const marketSpreadMargin = odds.spread !== null ? odds.spread : 0;
    const marketTotal = odds.total !== null ? odds.total : 44;
    
    // Compute hybrid spread
    const spreadResult = computeHybridSpread(v5SpreadMargin, v1HomeMargin);
    const spreadEdgePts = spreadResult.hybridMargin - marketSpreadMargin;
    const spreadStake = computeSpreadStake(spreadEdgePts, spreadResult.disagreement);
    
    // Determine spread pick side
    let spreadPickSide = spreadEdgePts > 0 ? homeTeam : awayTeam;
    let spreadDisplay = marginToDisplaySpread(
      marketSpreadMargin,
      homeTeam,
      awayTeam
    );
    
    // Compute total pick
    const totalResult = computeTotalPick(v5TotalP50, v1TotalEstimate, marketTotal);
    
    // Build game entry
    const hybridGame = {
      game_id: gameId,
      season: parseInt(season),
      week: parseInt(week),
      home_team: homeTeam,
      away_team: awayTeam,
      matchup: `${awayTeam} @ ${homeTeam}`,
      
      model: {
        v5: {
          spread_home_margin: v5SpreadMargin,
          total_p50: v5TotalP50
        },
        v1: {
          home_margin: v1HomeMargin,
          total_estimate: v1TotalEstimate
        },
        hybrid: {
          spread_home_margin: spreadResult.hybridMargin,
          total_p50: v5TotalP50  // Always use V5 for totals
        }
      },
      
      market: {
        spread_home_margin: marketSpreadMargin,
        spread_display: spreadDisplay,
        total: marketTotal,
        bookmaker: odds.bookmaker
      },
      
      picks: {
        spread: {
          category: spreadStake.category,
          side: spreadPickSide,
          display: spreadDisplay,
          edge_pts: Math.round(Math.abs(spreadEdgePts) * 10) / 10,
          units: spreadStake.units
        },
        total: {
          category: totalResult.category,
          side: totalResult.side,
          line: marketTotal,
          predicted: v5TotalP50,
          edge_pts: Math.round(totalResult.edgePts * 10) / 10,
          units: totalResult.units,
          high_variance: totalResult.highVariance
        }
      },
      
      meta: {
        spread_disagreement: Math.round(spreadResult.disagreement * 10) / 10,
        total_disagreement: v1TotalEstimate !== null ? 
          Math.round((v1TotalEstimate - v5TotalP50) * 10) / 10 : null,
        alpha_used: spreadResult.alpha
      }
    };
    
    hybridGames.push(hybridGame);
    
    console.log(`    ✅ Spread: ${hybridGame.picks.spread.display} (${hybridGame.picks.spread.category}, ${hybridGame.picks.spread.units}U)`);
    console.log(`    ✅ Total: ${totalResult.side} ${marketTotal} (${hybridGame.picks.total.category}, ${hybridGame.picks.total.units}U)\n`);
  }
  
  // Step 5: Create output bundle
  const bundle = {
    meta: {
      model_version: 'NFL_Hybrid_V5+V1',
      season: `${season}-${parseInt(season) + 1}`,
      week: parseInt(week),
      generated_at: new Date().toISOString(),
      games_count: hybridGames.length,
      config: {
        alpha: ALPHA,
        disagreement_clamp: DISAGREEMENT_CLAMP,
        spread_edge_threshold: SPREAD_EDGE_THRESHOLD,
        total_edge_threshold: TOTAL_EDGE_THRESHOLD
      },
      notes: [
        'Hybrid model combines V5 (backbone) + V1 (context overlay)',
        'Spreads: V5 + (0.4 × V1_disagreement) clamped to ±4pts',
        'Totals: V5 p50 as canonical, V1 for volatility detection only',
        'Disagreement guardrails: Stakes reduced/blocked when models diverge',
        'Injury adjustments: YES (from V1)',
        'Depth charts: NO (disabled for speed)'
      ]
    },
    games: hybridGames
  };
  
  // Step 6: Write output
  const outputPath = join(__dirname, `../../output/nfl_hybrid_${season}_week${week}.json`);
  await writeFile(outputPath, JSON.stringify(bundle, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ HYBRID PREDICTIONS GENERATED');
  console.log('='.repeat(70));
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📊 Games: ${hybridGames.length}`);
  
  // Summary stats
  const spreadBets = hybridGames.filter(g => g.picks.spread.units > 0);
  const totalBets = hybridGames.filter(g => g.picks.total.units > 0);
  const totalUnits = hybridGames.reduce((sum, g) => 
    sum + g.picks.spread.units + g.picks.total.units, 0
  );
  
  console.log(`\n📈 Summary:`);
  console.log(`   Spread bets: ${spreadBets.length}`);
  console.log(`   Total bets: ${totalBets.length}`);
  console.log(`   Total units: ${totalUnits.toFixed(1)}U`);
  console.log('');
  
  return bundle;
}

// ========================================
// CLI ENTRY POINT
// ========================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node run-hybrid-local.mjs <season> <week>');
    console.error('Example: node run-hybrid-local.mjs 2025 14');
    process.exit(1);
  }
  
  const season = args[0];
  const week = args[1];
  
  try {
    await generateHybridPredictions(season, week);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateHybridPredictions };

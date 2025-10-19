/**
 * NFL RECEIVING PROPS - SSOT EDITION
 * 
 * Uses single-source-of-truth JSON with:
 * - Empirical Bayes smoothed priors
 * - ADOT-bucket opponent adjustments
 * - Multinomial injury redistribution
 * - Variance inflation for uncertainty
 * - Soft-clipped multipliers
 */

import fetch from 'node-fetch';
import {
  simulateReceptionsProbOver,
  simulateYardsProbOver,
  removeVig,
  kellyFraction,
  calibrateProb,
  DEFAULT_CALIBRATION,
  decimalToAmerican
} from './_lib/elite-pricing-engine.mjs';

import {
  loadSSOT,
  playerToParams
} from './_lib/ssot-loader.mjs';

const ODDS_API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const USE_SSOT = process.env.USE_SSOT !== 'false'; // Feature flag
const MIN_EDGE = 0.05; // 5% edge minimum for real odds

// ============================================================================
// ODDS FETCHING (from The Odds API)
// ============================================================================

async function fetchRealOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  No Odds API key found');
    return null;
  }

  try {
    // Step 1: Get upcoming NFL events (games)
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?regions=us&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
    console.log('📡 Fetching NFL events...');
    
    const eventsResponse = await fetch(eventsUrl);
    if (!eventsResponse.ok) {
      console.warn(`Events API error: ${eventsResponse.status}`);
      return null;
    }

    const events = await eventsResponse.json();
    console.log(`✅ Found ${events.length} upcoming NFL games`);
    
    if (events.length === 0) {
      console.warn('⚠️  No upcoming games found');
      return null;
    }

    // Step 2: For each event, fetch player props
    console.log('📡 Fetching player props for each game...');
    const oddsPromises = events.slice(0, 20).map(async (event) => {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?regions=us&markets=player_receptions,player_reception_yds&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
        
        const propsResponse = await fetch(propsUrl);
        if (!propsResponse.ok) return null;
        
        const propsData = await propsResponse.json();
        return { event, props: propsData };
      } catch (e) {
        return null;
      }
    });

    const oddsResults = await Promise.all(oddsPromises);
    const validOdds = oddsResults.filter(Boolean);
    
    console.log(`✅ Fetched odds for ${validOdds.length} games`);
    return processOdds(validOdds);
    
  } catch (error) {
    console.warn(`Odds fetch failed: ${error.message}`);
    return null;
  }
}

function processOdds(gamesDataWithProps) {
  const oddsMap = new Map();
  const PRIORITY_BOOKS = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'ESPN BET'];

  for (const gameData of gamesDataWithProps) {
    const { event, props } = gameData;
    
    if (!props.bookmakers) continue;
    
    for (const bookmaker of props.bookmakers || []) {
      const bookName = bookmaker.title || '';
      const isPriorityBook = PRIORITY_BOOKS.some(b => bookName.includes(b));
      
      for (const market of bookmaker.markets || []) {
        if (!['player_receptions', 'player_reception_yds'].includes(market.key)) continue;

        // Group by player + line to get both sides
        const lineGroups = {};
        for (const outcome of market.outcomes || []) {
          const player = outcome.description;
          const line = outcome.point;
          const key = `${player}_${line}`;
          
          if (!lineGroups[key]) {
            lineGroups[key] = { 
              player, 
              line, 
              market: market.key,
              event: event.home_team + ' vs ' + event.away_team,
              commence_time: event.commence_time
            };
          }
          
          if (outcome.name === 'Over') {
            lineGroups[key].overOdds = outcome.price;
            lineGroups[key].book = bookmaker.title;
          } else if (outcome.name === 'Under') {
            lineGroups[key].underOdds = outcome.price;
          }
        }

        // Store complete two-sided markets
        for (const [key, data] of Object.entries(lineGroups)) {
          if (data.overOdds && data.underOdds) {
            if (!oddsMap.has(key) || isPriorityBook) {
              oddsMap.set(key, data);
            }
          }
        }
      }
    }
  }

  console.log(`✅ Processed ${oddsMap.size} two-sided markets`);
  return oddsMap;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    console.log('🏈 NFL RECEIVING PROPS - SSOT EDITION');
    console.log('=' .repeat(60));
    
    // Determine current week (can be passed as query param)
    const week = parseInt(event.queryStringParameters?.week) || 8;
    const season = parseInt(event.queryStringParameters?.season) || 2025;
    
    // Load SSOT
    console.log(`📂 Loading SSOT for Week ${week}, ${season}...`);
    const ssot = await loadSSOT(week, season);
    
    if (!ssot && USE_SSOT) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: `SSOT not available for Week ${week}, ${season}`,
          message: 'Run SSOT generator first: Rscript scripts/nfl-receiving-props/generate-ssot.R',
          hint: 'Or set USE_SSOT=false to fall back to old PLAYER_DB'
        })
      };
    }
    
    // Fallback to old PLAYER_DB if SSOT not available
    if (!ssot) {
      console.warn('⚠️  SSOT not available, falling back to hardcoded PLAYER_DB');
      // TODO: Import old scanner logic or return error
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'SSOT not available and fallback not implemented',
          message: 'Please run generate-ssot.R first'
        })
      };
    }
    
    // Fetch real odds
    const realOdds = await fetchRealOdds();
    const opportunities = [];
    
    console.log(`\n🎲 Processing ${ssot.players.length} players from SSOT...`);
    
    // Process each player from SSOT
    for (const player of ssot.players) {
      // Convert SSOT to simulation parameters
      const params = playerToParams(player);
      
      // Receptions props
      const recLines = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5];
      for (const line of recLines) {
        const modelProbRaw = simulateReceptionsProbOver(params, line);
        const modelProb = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);
        
        // Check for real odds
        const oddsKey = `${player.player_id}_${line}`;
        const realMarket = realOdds?.get(oddsKey);
        
        if (realMarket && realMarket.market === 'player_receptions') {
          const { pOver, pUnder } = removeVig(realMarket.overOdds, realMarket.underOdds);
          
          // OVER
          const edgeOver = modelProb - pOver;
          if (edgeOver >= MIN_EDGE) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: realMarket.book,
              offered_odds: realMarket.overOdds,
              market_prob_fair: pOver,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: edgeOver,
              kelly: kellyFraction(modelProb, realMarket.overOdds),
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: true,
              // SSOT metadata for logging
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
          
          // UNDER
          const modelProbUnder = 1 - modelProb;
          const edgeUnder = modelProbUnder - pUnder;
          if (edgeUnder >= MIN_EDGE) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'UNDER',
              book: realMarket.book,
              offered_odds: realMarket.underOdds,
              market_prob_fair: pUnder,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: edgeUnder,
              kelly: kellyFraction(modelProbUnder, realMarket.underOdds),
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: true,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
        } else if (!realOdds) {
          // NO REAL ODDS: Synthetic mode (testing)
          const syntheticMarketProb = 0.5238; // -110 implied
          
          if (modelProb >= 0.55) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: 'Model Pricing (SSOT)',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: modelProb - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: false,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
          
          const modelProbUnder = 1 - modelProb;
          if (modelProbUnder >= 0.55) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'UNDER',
              book: 'Model Pricing (SSOT)',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: modelProbUnder - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: false,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
        }
      }
      
      // Yards props
      const yardLines = [35.5, 45.5, 55.5, 65.5, 75.5, 85.5];
      for (const line of yardLines) {
        const modelProbRaw = simulateYardsProbOver(params, line);
        const modelProb = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);
        
        const oddsKey = `${player.player_id}_${line}`;
        const realMarket = realOdds?.get(oddsKey);
        
        if (realMarket && realMarket.market === 'player_reception_yds') {
          const { pOver, pUnder } = removeVig(realMarket.overOdds, realMarket.underOdds);
          
          // OVER
          const edgeOver = modelProb - pOver;
          if (edgeOver >= MIN_EDGE) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'OVER',
              book: realMarket.book,
              offered_odds: realMarket.overOdds,
              market_prob_fair: pOver,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: edgeOver,
              kelly: kellyFraction(modelProb, realMarket.overOdds),
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: true,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
          
          // UNDER
          const modelProbUnder = 1 - modelProb;
          const edgeUnder = modelProbUnder - pUnder;
          if (edgeUnder >= MIN_EDGE) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'UNDER',
              book: realMarket.book,
              offered_odds: realMarket.underOdds,
              market_prob_fair: pUnder,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: edgeUnder,
              kelly: kellyFraction(modelProbUnder, realMarket.underOdds),
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: true,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
        } else if (!realOdds) {
          // Synthetic mode
          const syntheticMarketProb = 0.5238;
          
          if (modelProb >= 0.55) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'OVER',
              book: 'Model Pricing (SSOT)',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: modelProb - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: false,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
          
          const modelProbUnder = 1 - modelProb;
          if (modelProbUnder >= 0.55) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'UNDER',
              book: 'Model Pricing (SSOT)',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: modelProbUnder - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: false,
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                targets_delta: params.modifiers.targets_delta,
                catch_mult: params.modifiers.catch_mult,
                yac_mult: params.modifiers.yac_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
        }
      }
    }
    
    // Sort by edge
    opportunities.sort((a, b) => b.edge - a.edge);
    
    console.log(`\n✅ Generated ${opportunities.length} opportunities`);
    if (opportunities.length > 0) {
      console.log(`   Top edge: ${(opportunities[0].edge * 100).toFixed(1)}%`);
      console.log(`   Avg edge: ${(opportunities.reduce((sum, o) => sum + o.edge, 0) / opportunities.length * 100).toFixed(1)}%`);
    }
    console.log(`   Mode: ${realOdds ? 'REAL ODDS' : 'SYNTHETIC'}`);
    console.log(`   Players processed: ${ssot.players.length}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        generated_at: new Date().toISOString(),
        ssot_version: ssot.schema_version,
        ssot_generated: ssot.generated_at,
        total_predictions: opportunities.length,
        predictions: opportunities,
        metadata: {
          model: 'SSOT Elite (EB smoothed priors + capped multipliers)',
          week,
          season,
          data_quality: {
            eb_tau: ssot.metadata?.eb_tau || 'N/A',
            cap_settings: ssot.metadata?.cap_settings || {},
            total_players: ssot.players.length,
            data_sources: ssot.metadata?.data_sources || []
          },
          simulations: 20000,
          min_edge: realOdds ? MIN_EDGE : 0.025,
          calibration: 'Isotonic (default)',
          has_real_odds: !!realOdds
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
}

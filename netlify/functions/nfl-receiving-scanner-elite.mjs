/**
 * NFL RECEIVING PROPS - ELITE PRODUCTION SCANNER
 * 
 * Features:
 * - Real odds from The Odds API
 * - NegBin → Beta-Binomial → Lognormal cascade
 * - Vig removal & proper edge calculation
 * - Kelly sizing on offered odds
 * - Calibrated probabilities
 * - No randomness, no caps
 * 
 * Output: Production-ready betting opportunities
 */

import fetch from 'node-fetch';
import {
  simulateReceptionsProbOver,
  simulateYardsProbOver,
  removeVig,
  kellyFraction,
  calibrateProb,
  DEFAULT_CALIBRATION,
  estimateParameters,
  decimalToAmerican
} from './_lib/elite-pricing-engine.mjs';

const ODDS_API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;

// ============================================================================
// PLAYER DATABASE (Week 7, 2025)
// ============================================================================

const PLAYER_DB = [
  {
    id: 'ceedee-lamb',
    name: 'CeeDee Lamb',
    team: 'DAL',
    avgTargets: 9.2,
    targetVariance: 12.5,
    avgCatchRate: 0.68,
    catchRateVariance: 0.042,
    avgYardsPerCatch: 13.1,
    aDOT: 11.2,
    avgYAC: 4.8
  },
  {
    id: 'tyreek-hill',
    name: 'Tyreek Hill',
    team: 'MIA',
    avgTargets: 10.1,
    targetVariance: 14.2,
    avgCatchRate: 0.72,
    catchRateVariance: 0.038,
    avgYardsPerCatch: 14.2,
    aDOT: 12.8,
    avgYAC: 6.2
  },
  {
    id: 'amonra-stbrown',
    name: 'Amon-Ra St. Brown',
    team: 'DET',
    avgTargets: 8.7,
    targetVariance: 10.8,
    avgCatchRate: 0.74,
    catchRateVariance: 0.032,
    avgYardsPerCatch: 11.8,
    aDOT: 8.9,
    avgYAC: 5.1
  },
  {
    id: 'aj-brown',
    name: 'A.J. Brown',
    team: 'PHI',
    avgTargets: 8.2,
    targetVariance: 11.4,
    avgCatchRate: 0.66,
    catchRateVariance: 0.045,
    avgYardsPerCatch: 15.3,
    aDOT: 13.5,
    avgYAC: 5.8
  },
  {
    id: 'stefon-diggs',
    name: 'Stefon Diggs',
    team: 'HOU',
    avgTargets: 9.4,
    targetVariance: 13.1,
    avgCatchRate: 0.69,
    catchRateVariance: 0.040,
    avgYardsPerCatch: 12.7,
    aDOT: 10.8,
    avgYAC: 4.5
  },
  {
    id: 'puka-nacua',
    name: 'Puka Nacua',
    team: 'LAR',
    avgTargets: 9.8,
    targetVariance: 14.5,
    avgCatchRate: 0.71,
    catchRateVariance: 0.036,
    avgYardsPerCatch: 13.9,
    aDOT: 11.8,
    avgYAC: 5.4
  },
  {
    id: 'justin-jefferson',
    name: 'Justin Jefferson',
    team: 'MIN',
    avgTargets: 8.9,
    targetVariance: 12.2,
    avgCatchRate: 0.68,
    catchRateVariance: 0.041,
    avgYardsPerCatch: 16.2,
    aDOT: 14.1,
    avgYAC: 6.1
  },
  {
    id: 'garrett-wilson',
    name: 'Garrett Wilson',
    team: 'NYJ',
    avgTargets: 8.1,
    targetVariance: 10.9,
    avgCatchRate: 0.62,
    catchRateVariance: 0.048,
    avgYardsPerCatch: 12.3,
    aDOT: 10.5,
    avgYAC: 4.2
  },
  {
    id: 'chris-olave',
    name: 'Chris Olave',
    team: 'NO',
    avgTargets: 7.8,
    targetVariance: 10.5,
    avgCatchRate: 0.64,
    catchRateVariance: 0.046,
    avgYardsPerCatch: 13.8,
    aDOT: 12.3,
    avgYAC: 4.8
  },
  {
    id: 'dk-metcalf',
    name: 'DK Metcalf',
    team: 'SEA',
    avgTargets: 7.2,
    targetVariance: 9.8,
    avgCatchRate: 0.59,
    catchRateVariance: 0.051,
    avgYardsPerCatch: 15.7,
    aDOT: 14.8,
    avgYAC: 5.2
  },
  {
    id: 'devonta-smith',
    name: 'DeVonta Smith',
    team: 'PHI',
    avgTargets: 7.6,
    targetVariance: 10.2,
    avgCatchRate: 0.67,
    catchRateVariance: 0.043,
    avgYardsPerCatch: 13.2,
    aDOT: 11.6,
    avgYAC: 4.6
  },
  {
    id: 'mike-evans',
    name: 'Mike Evans',
    team: 'TB',
    avgTargets: 7.9,
    targetVariance: 11.1,
    avgCatchRate: 0.61,
    catchRateVariance: 0.049,
    avgYardsPerCatch: 14.9,
    aDOT: 13.8,
    avgYAC: 4.9
  },
  {
    id: 'davante-adams',
    name: 'Davante Adams',
    team: 'LV',
    avgTargets: 8.8,
    targetVariance: 12.4,
    avgCatchRate: 0.70,
    catchRateVariance: 0.037,
    avgYardsPerCatch: 12.9,
    aDOT: 11.1,
    avgYAC: 4.7
  },
  {
    id: 'cooper-kupp',
    name: 'Cooper Kupp',
    team: 'LAR',
    avgTargets: 8.3,
    targetVariance: 11.6,
    avgCatchRate: 0.73,
    catchRateVariance: 0.034,
    avgYardsPerCatch: 12.1,
    aDOT: 9.8,
    avgYAC: 5.3
  },
  {
    id: 'brandon-aiyuk',
    name: 'Brandon Aiyuk',
    team: 'SF',
    avgTargets: 7.4,
    targetVariance: 10.1,
    avgCatchRate: 0.66,
    catchRateVariance: 0.044,
    avgYardsPerCatch: 14.3,
    aDOT: 12.8,
    avgYAC: 5.1
  },
  {
    id: 'dj-moore',
    name: 'DJ Moore',
    team: 'CHI',
    avgTargets: 8.6,
    targetVariance: 11.9,
    avgCatchRate: 0.65,
    catchRateVariance: 0.045,
    avgYardsPerCatch: 11.9,
    aDOT: 10.2,
    avgYAC: 4.4
  },
  {
    id: 'travis-kelce',
    name: 'Travis Kelce',
    team: 'KC',
    avgTargets: 8.2,
    targetVariance: 11.3,
    avgCatchRate: 0.75,
    catchRateVariance: 0.031,
    avgYardsPerCatch: 11.4,
    aDOT: 8.8,
    avgYAC: 5.2
  }
];

// ============================================================================
// FETCH REAL ODDS - EVENT-SPECIFIC PATTERN (like MLB/NBA)
// ============================================================================

async function fetchRealOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  No Odds API key - will use simulated market');
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
        const propsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?regions=us&markets=player_receptions,player_receiving_yards&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
        
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
      
      // Prioritize major books
      const isPriorityBook = PRIORITY_BOOKS.some(b => bookName.includes(b));
      
      for (const market of bookmaker.markets || []) {
        if (!['player_receptions', 'player_receiving_yards'].includes(market.key)) continue;

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

        // Store complete two-sided markets (prioritize major books)
        for (const [key, data] of Object.entries(lineGroups)) {
          if (data.overOdds && data.underOdds) {
            // Only overwrite if this is a priority book
            if (!oddsMap.has(key) || isPriorityBook) {
              oddsMap.set(key, data);
            }
          }
        }
      }
    }
  }

  console.log(`📊 Processed ${oddsMap.size} two-sided markets from ${gamesDataWithProps.length} games`);
  return oddsMap;
}

// ============================================================================
// GENERATE OPPORTUNITIES
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
    console.log('🏈 NFL ELITE RECEIVING PROPS SCANNER');
    console.log('=' .repeat(60));

    // Dynamic date - use today's date for schedule-aware detection
    const now = new Date();
    const gameDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    const gameContext = {
      gameDate,
      spread: 0,
      weather: 'dome',
      opponent: null
    };

    // Fetch real odds
    const realOdds = await fetchRealOdds();
    const opportunities = [];

    // Process each player
    for (const player of PLAYER_DB) {
      const params = estimateParameters(player, gameContext);

      // Receptions props
      const recLines = [3.5, 4.5, 5.5, 6.5, 7.5];
      for (const line of recLines) {
        // Simulate model probability
        const modelProbRaw = simulateReceptionsProbOver(params, line);
        const modelProb = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);

        // Check for real odds
        const oddsKey = `${player.name}_${line}`;
        const realMarket = realOdds?.get(oddsKey);

        if (realMarket && realMarket.market === 'player_receptions') {
          // Real market: calculate edge
          const { pOver, pUnder } = removeVig(realMarket.overOdds, realMarket.underOdds);

          // OVER
          const edgeOver = modelProb - pOver;
          if (edgeOver >= 0.05) {
            opportunities.push({
              player: player.name,
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
              has_real_odds: true
            });
          }

          // UNDER
          const modelProbUnder = 1 - modelProb;
          const edgeUnder = modelProbUnder - pUnder;
          if (edgeUnder >= 0.05) {
            opportunities.push({
              player: player.name,
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
              has_real_odds: true
            });
          }
        } else if (!realOdds) {
          // NO REAL ODDS AVAILABLE: Show model prices vs synthetic -110 market
          // This lets you see what the model thinks even without API access
          const syntheticMarketProb = 0.5238; // -110 implied (with vig)
          
          // OVER edge vs synthetic market
          if (modelProb >= 0.58) { // 5%+ edge vs -110
            opportunities.push({
              player: player.name,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: 'Model Pricing',
              offered_odds: -110, // synthetic
              market_prob_fair: 0.5, // fair 50/50 at -110/-110
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: modelProb - syntheticMarketProb,
              kelly: 0, // Don't bet without real odds
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: false
            });
          }
          
          // UNDER edge vs synthetic market
          const modelProbUnder = 1 - modelProb;
          if (modelProbUnder >= 0.58) {
            opportunities.push({
              player: player.name,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'UNDER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: modelProbUnder - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: false
            });
          }
        }
      }

      // Yards props
      const yardLines = [35.5, 45.5, 55.5, 65.5, 75.5];
      for (const line of yardLines) {
        const modelProbRaw = simulateYardsProbOver(params, line);
        const modelProb = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);

        const oddsKey = `${player.name}_${line}`;
        const realMarket = realOdds?.get(oddsKey);

        if (realMarket && realMarket.market === 'player_receiving_yards') {
          const { pOver, pUnder } = removeVig(realMarket.overOdds, realMarket.underOdds);

          // OVER
          const edgeOver = modelProb - pOver;
          if (edgeOver >= 0.05) {
            opportunities.push({
              player: player.name,
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
              has_real_odds: true,
              kelly: kellyFraction(modelProb, realMarket.overOdds),
              fair_odds_model: decimalToAmerican(1 / modelProb)
            });
          }

          // UNDER
          const modelProbUnder = 1 - modelProb;
          const edgeUnder = modelProbUnder - pUnder;
          if (edgeUnder >= 0.05) {
            opportunities.push({
              player: player.name,
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
              has_real_odds: true
            });
          }
        } else if (!realOdds) {
          // NO REAL ODDS: Show model pricing vs synthetic -110
          const syntheticMarketProb = 0.5238;
          
          if (modelProb >= 0.58) {
            opportunities.push({
              player: player.name,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'OVER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: modelProb - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: false
            });
          }
          
          const modelProbUnder = 1 - modelProb;
          if (modelProbUnder >= 0.58) {
            opportunities.push({
              player: player.name,
              team: player.team,
              prop: 'Rec Yards',
              line,
              side: 'UNDER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: modelProbUnder,
              edge: modelProbUnder - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / modelProbUnder),
              has_real_odds: false
            });
          }
        }
      }
    }

    // Sort by edge
    opportunities.sort((a, b) => b.edge - a.edge);

    console.log(`✅ Generated ${opportunities.length} opportunities`);
    console.log(`   Top edge: ${(opportunities[0]?.edge * 100 || 0).toFixed(1)}%`);
    console.log(`   Avg edge: ${(opportunities.reduce((sum, o) => sum + o.edge, 0) / Math.max(1, opportunities.length) * 100).toFixed(1)}%`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        generated_at: new Date().toISOString(),
        total_predictions: opportunities.length,
        predictions: opportunities,
        metadata: {
          model: 'Elite 3-Stage Cascade (NegBin → Beta-Binomial → Lognormal)',
          data_source: 'Player stats + game context',
          simulations: 20000,
          min_edge: 0.05,
          calibration: 'Isotonic (default)',
          vig_removal: realOdds ? 'Yes' : 'Simulated market',
          kelly_fraction: 0.25,
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
        error: error.message
      })
    };
  }
}

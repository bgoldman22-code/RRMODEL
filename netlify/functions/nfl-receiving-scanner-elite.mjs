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

import { loadSSOT, playerToParams } from './_lib/ssot-loader.mjs';

const ODDS_API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const USE_SSOT = process.env.USE_SSOT === 'true'; // Feature flag for SSOT

// ============================================================================
// HELPERS
// ============================================================================

const MARKET_ALIASES = {
  receptions: new Set(['player_receptions', 'player_receptions_total']),
  recYards: new Set(['player_receiving_yards', 'player_reception_yds', 'receiving_yards'])
};

// Name aliases for player matching (handles "A.J." vs "AJ", etc.)
const NAME_ALIASES = new Map([
  ['AJBROWN', 'A.J. Brown'],
  ['AMONRASTBROWN', 'Amon-Ra St. Brown'],
  ['DJMOORE', 'D.J. Moore'],
  ['DKMETCALF', 'DK Metcalf']
]);

const americanToDecimal = a => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const norm = s => (s || '').normalize('NFKD').replace(/[^\w]+/g, '').toUpperCase();

// Canonical name normalization with alias resolution
const canon = s => {
  const k = norm(s);
  return NAME_ALIASES.has(k) ? norm(NAME_ALIASES.get(k)) : k;
};

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
// FETCH REAL ODDS - BEST PRICE ACROSS BOOKS
// ============================================================================

async function fetchRealOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  No Odds API key - will use simulated market');
    return null;
  }

  try {
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
    const oddsResults = await Promise.all(events.slice(0, 25).map(async (ev) => {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${ev.id}/odds?regions=us&markets=player_receptions,player_receiving_yards&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const data = await r.json();
        
        // Rate limit telemetry
        const remaining = r.headers.get('x-requests-remaining');
        const used = r.headers.get('x-requests-used');
        if (remaining !== null) {
          console.log(`   OddsAPI quota: remaining=${remaining}, used=${used}`);
        }
        
        return { ev, data };
      } catch (e) {
        return null;
      }
    }));

    const bestOver = new Map();   // Best Over odds across all books (for placement)
    const bestUnder = new Map();  // Best Under odds across all books (for placement)
    const pairs = new Map();      // Same-book pairs for fair pricing (anti-bias)
    const seenMarkets = new Set(); // Track unknown market keys

    for (const x of oddsResults.filter(Boolean)) {
      const { data } = x;
      for (const bm of data.bookmakers || []) {
        for (const m of bm.markets || []) {
          const isRec = MARKET_ALIASES.receptions.has(m.key);
          const isYds = MARKET_ALIASES.recYards.has(m.key);
          
          // Log unknown market keys once
          if (!isRec && !isYds && !seenMarkets.has(m.key)) {
            console.log(`   ℹ️  Unknown market key: ${m.key}`);
            seenMarkets.add(m.key);
          }
          
          if (!isRec && !isYds) continue;

          const groups = new Map(); // key: player_line -> {playerKey, lineStr, market, overOdds, underOdds, book}
          for (const o of m.outcomes || []) {
            const playerKey = canon(o.description);  // Use canonical name with alias resolution
            const lineStr = Number(o.point).toFixed(1);
            const key = `${playerKey}_${lineStr}`;
            if (!groups.has(key)) groups.set(key, { playerKey, lineStr, market: m.key, book: bm.title });
            const g = groups.get(key);
            if (o.name === 'Over') g.overOdds = o.price;
            if (o.name === 'Under') g.underOdds = o.price;
          }

          for (const [k, g] of groups) {
            if (!(g.overOdds && g.underOdds)) continue;
            
            // Store same-book pairs for fair pricing
            if (!pairs.has(k)) pairs.set(k, []);
            pairs.get(k).push({
              book: bm.title,
              market: m.key,
              overOdds: g.overOdds,
              underOdds: g.underOdds
            });
            
            // Still track best single-sided prices for placement
            const currO = bestOver.get(k);
            const currU = bestUnder.get(k);

            const betterOver = !currO || americanToDecimal(g.overOdds) > americanToDecimal(currO.overOdds);
            const betterUnder = !currU || americanToDecimal(g.underOdds) > americanToDecimal(currU.underOdds);

            if (betterOver) bestOver.set(k, { ...g });
            if (betterUnder) bestUnder.set(k, { ...g });
          }
        }
      }
    }

    // Pick best same-book pair for fair pricing (lowest true vig = tightest market)
    const pickPair = (arr) => {
      if (!arr || arr.length === 0) return null;
      const imp = a => 1 / americanToDecimal(a); // implied probability
      const vigWidth = a => (imp(a.overOdds) + imp(a.underOdds)) - 1; // true vig (smaller is tighter)
      return arr.reduce((best, x) => (best ? (vigWidth(x) < vigWidth(best) ? x : best) : x), null);
    };

    // Merge: require both best Over/Under exist, AND a same-book pair for fair pricing
    const merged = new Map();
    for (const [k, over] of bestOver) {
      const under = bestUnder.get(k);
      const pairOptions = pairs.get(k);
      if (!under || !pairOptions) continue;
      
      const fairPair = pickPair(pairOptions);
      if (!fairPair) continue;
      
      merged.set(k, {
        playerKey: over.playerKey,
        lineStr: over.lineStr,
        market: fairPair.market,
        // For fair pricing (same-book pair to avoid cross-book bias)
        fairOverOdds: fairPair.overOdds,
        fairUnderOdds: fairPair.underOdds,
        fairBook: fairPair.book,
        // For placement (best available prices)
        overOdds: over.overOdds,
        underOdds: under.underOdds,
        bookOver: over.book,
        bookUnder: under.book
      });
    }
    
    console.log(`📊 Processed ${merged.size} two-sided markets with best prices`);
    if (merged.size === 0 && oddsResults.filter(Boolean).length > 0) {
      console.warn('   ⚠️  API returned data but no props matched (check market keys)');
    }
    return merged;
    
  } catch (error) {
    console.warn(`Odds fetch failed: ${error.message}`);
    return null;
  }
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
    console.log('='.repeat(60));
    console.log('🔑 API Key Check:');
    console.log('   THEODDS_API_KEY exists?', !!process.env.THEODDS_API_KEY);
    console.log('   ODDS_API_KEY exists?', !!process.env.ODDS_API_KEY);
    console.log('   Final ODDS_API_KEY set?', !!ODDS_API_KEY);
    console.log('   Key length:', ODDS_API_KEY?.length || 0);

    // Dynamic date - use today's date for schedule-aware detection
    const now = new Date();
    const gameDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    const gameContext = {
      gameDate,
      spread: 0,
      weather: 'dome',
      opponent: null
    };

    // Load SSOT if enabled (feature flag)
    let ssot = null;
    if (USE_SSOT) {
      try {
        const WEEK = parseInt(process.env.NFL_WEEK || '8', 10);
        const SEASON = parseInt(process.env.NFL_SEASON || '2025', 10);
        ssot = await loadSSOT(WEEK, SEASON);
        if (ssot) {
          console.log(`✅ Loaded SSOT: Week ${ssot.week}, ${ssot.players?.length || 0} players, generated ${ssot.generated_at}`);
        } else {
          console.warn('⚠️  SSOT load failed, falling back to PLAYER_DB');
        }
      } catch (err) {
        console.warn(`⚠️  SSOT load error: ${err.message}, falling back to PLAYER_DB`);
      }
    }

    // Select player source: SSOT (production) or PLAYER_DB (legacy)
    const playerSource = USE_SSOT ? (ssot?.players || PLAYER_DB) : PLAYER_DB;
    console.log(`📋 Player source: ${USE_SSOT ? 'SSOT' : 'PLAYER_DB'} (${playerSource.length} players)`);

    // Fetch real odds
    const realOdds = await fetchRealOdds();
    const opportunities = [];
    const MIN_EDGE = realOdds ? 0.05 : 0.025;

    // Process each player
    for (const player of playerSource) {
      // Convert SSOT player to params, or estimate from PLAYER_DB
      const params = USE_SSOT && ssot ? playerToParams(player) : estimateParameters(player, gameContext);
      const playerName = player.name || player.player_name;
      const playerTeam = player.team || player.current_team;
      const playerMatchup = player.matchup || `${playerTeam} vs OPP`;
      const playerKey = canon(playerName);  // Use canonical name with alias resolution

      // Receptions props
      const recLines = [3.5, 4.5, 5.5, 6.5, 7.5];
      for (const line of recLines) {
        // Simulate model probability
        const modelProbRaw = simulateReceptionsProbOver(params, line);
        const pOverCal = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);
        const pUnderCal = calibrateProb(1 - modelProbRaw, DEFAULT_CALIBRATION);

        // Check for real odds (using canonical name)
        const oddsKey = `${playerKey}_${line.toFixed(1)}`;
        const realMarket = realOdds?.get(oddsKey);

        if (realMarket && MARKET_ALIASES.receptions.has(realMarket.market)) {
          // Real market: calculate edge using SAME-BOOK fair pricing (avoid cross-book bias)
          const { pOver, pUnder } = removeVig(realMarket.fairOverOdds, realMarket.fairUnderOdds);

          // Convert best available odds (may be different books) to decimal for Kelly
          const decOver = americanToDecimal(realMarket.overOdds);
          const decUnder = americanToDecimal(realMarket.underOdds);

          // OVER
          const edgeOver = pOverCal - pOver;
          if (edgeOver >= MIN_EDGE) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: realMarket.bookOver,
              offered_odds: realMarket.overOdds,
              market_prob_fair: pOver,
              model_prob_raw: modelProbRaw,
              model_prob: pOverCal,
              edge: edgeOver,
              kelly: kellyFraction(pOverCal, decOver),
              fair_odds_model: decimalToAmerican(1 / pOverCal),
              has_real_odds: true,
              fair_from_book: realMarket.fairBook,
              fair_over_odds: realMarket.fairOverOdds,
              fair_under_odds: realMarket.fairUnderOdds,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }

          // UNDER
          const edgeUnder = pUnderCal - pUnder;
          if (edgeUnder >= MIN_EDGE) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Receptions',
              line,
              side: 'UNDER',
              book: realMarket.bookUnder,
              offered_odds: realMarket.underOdds,
              market_prob_fair: pUnder,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: pUnderCal,
              edge: edgeUnder,
              kelly: kellyFraction(pUnderCal, decUnder),
              fair_odds_model: decimalToAmerican(1 / pUnderCal),
              has_real_odds: true,
              fair_from_book: realMarket.fairBook,
              fair_over_odds: realMarket.fairOverOdds,
              fair_under_odds: realMarket.fairUnderOdds,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
        } else if (!realOdds) {
          // NO REAL ODDS AVAILABLE: Show model prices vs synthetic -110 market
          const syntheticMarketProb = 0.5238; // -110 implied (with vig)
          
          // OVER edge vs synthetic market
          if (pOverCal >= 0.55) { // 2.5%+ edge vs -110 (synthetic mode)
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: modelProbRaw,
              model_prob: pOverCal,
              edge: pOverCal - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / pOverCal),
              has_real_odds: false,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
          
          // UNDER edge vs synthetic market
          if (pUnderCal >= 0.55) { // 2.5%+ edge vs -110 (synthetic mode)
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Receptions',
              line,
              side: 'UNDER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: pUnderCal,
              edge: pUnderCal - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / pUnderCal),
              has_real_odds: false,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
        }
      }

      // Yards props
      const yardLines = [35.5, 45.5, 55.5, 65.5, 75.5];
      for (const line of yardLines) {
        const modelProbRaw = simulateYardsProbOver(params, line);
        const pOverCal = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);
        const pUnderCal = calibrateProb(1 - modelProbRaw, DEFAULT_CALIBRATION);

        const oddsKey = `${playerKey}_${line.toFixed(1)}`;
        const realMarket = realOdds?.get(oddsKey);

        if (realMarket && MARKET_ALIASES.recYards.has(realMarket.market)) {
          // Real market: calculate edge using SAME-BOOK fair pricing (avoid cross-book bias)
          const { pOver, pUnder } = removeVig(realMarket.fairOverOdds, realMarket.fairUnderOdds);

          const decOver = americanToDecimal(realMarket.overOdds);
          const decUnder = americanToDecimal(realMarket.underOdds);

          // OVER
          const edgeOver = pOverCal - pOver;
          if (edgeOver >= MIN_EDGE) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Rec Yards',
              line,
              side: 'OVER',
              book: realMarket.bookOver,
              offered_odds: realMarket.overOdds,
              market_prob_fair: pOver,
              model_prob_raw: modelProbRaw,
              model_prob: pOverCal,
              edge: edgeOver,
              has_real_odds: true,
              kelly: kellyFraction(pOverCal, decOver),
              fair_odds_model: decimalToAmerican(1 / pOverCal),
              fair_from_book: realMarket.fairBook,
              fair_over_odds: realMarket.fairOverOdds,
              fair_under_odds: realMarket.fairUnderOdds,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }

          // UNDER
          const edgeUnder = pUnderCal - pUnder;
          if (edgeUnder >= MIN_EDGE) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Rec Yards',
              line,
              side: 'UNDER',
              book: realMarket.bookUnder,
              offered_odds: realMarket.underOdds,
              market_prob_fair: pUnder,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: pUnderCal,
              edge: edgeUnder,
              kelly: kellyFraction(pUnderCal, decUnder),
              fair_odds_model: decimalToAmerican(1 / pUnderCal),
              has_real_odds: true,
              fair_from_book: realMarket.fairBook,
              fair_over_odds: realMarket.fairOverOdds,
              fair_under_odds: realMarket.fairUnderOdds,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
        } else if (!realOdds) {
          // NO REAL ODDS: Show model pricing vs synthetic -110
          const syntheticMarketProb = 0.5238;
          
          if (pOverCal >= 0.55) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Rec Yards',
              line,
              side: 'OVER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: modelProbRaw,
              model_prob: pOverCal,
              edge: pOverCal - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / pOverCal),
              has_real_odds: false,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
          
          if (pUnderCal >= 0.55) {
            opportunities.push({
              player: playerName,
              team: playerTeam,
              matchup: playerMatchup,
              prop: 'Rec Yards',
              line,
              side: 'UNDER',
              book: 'Model Pricing',
              offered_odds: -110,
              market_prob_fair: 0.5,
              model_prob_raw: 1 - modelProbRaw,
              model_prob: pUnderCal,
              edge: pUnderCal - syntheticMarketProb,
              kelly: 0,
              fair_odds_model: decimalToAmerican(1 / pUnderCal),
              has_real_odds: false,
              data_source: USE_SSOT ? 'SSOT' : 'PLAYER_DB'
            });
          }
        }
      }
    }

    // Sort by edge
    opportunities.sort((a, b) => b.edge - a.edge);

    console.log(`✅ Generated ${opportunities.length} opportunities`);
    if (opportunities.length > 0) {
      console.log(`   Top edge: ${(opportunities[0].edge * 100).toFixed(1)}%`);
      console.log(`   Avg edge: ${(opportunities.reduce((sum, o) => sum + o.edge, 0) / opportunities.length * 100).toFixed(1)}%`);
    }
    console.log(`   Min edge threshold: ${(MIN_EDGE * 100).toFixed(1)}%`);
    console.log(`   Players processed: ${playerSource.length}`);
    console.log(`   Data source: ${USE_SSOT ? 'SSOT' : 'PLAYER_DB'}`);

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
          data_source: USE_SSOT ? 'SSOT (nflfastR + canonical rosters)' : 'PLAYER_DB (legacy)',
          ssot_week: ssot?.week,
          ssot_season: ssot?.season,
          ssot_generated_at: ssot?.generated_at,
          simulations: 20000,
          min_edge: MIN_EDGE,
          calibration: 'Isotonic (both sides calibrated independently)',
          vig_removal: realOdds ? 'Yes (same-book pairs for fair pricing)' : 'Simulated market',
          kelly_fraction: 0.25,
          has_real_odds: !!realOdds,
          lines_seen: realOdds ? Array.from(new Set(Array.from(realOdds.keys()).map(k => k.split('_').slice(1).join('_')))) : []
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

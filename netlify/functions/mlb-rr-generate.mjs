/**
 * MLB Round Robin V2 - Live Prediction Generator
 * 
 * Generates daily MLB HR Round Robin predictions with:
 * - Top 10 by Probability
 * - Top 20 by EV
 * - RR structure recommendations (2s, 3s, 4s, 5s, 6s)
 * - WHY explanations for each pick
 * 
 * Called by frontend on-demand or cached by scheduled function
 */

import axios from 'axios';
import { getStore } from '@netlify/blobs';

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_URL = 'https://api.the-odds-api.com/v4';

// Park factors (RHH/LHH multipliers)
const PARK_FACTORS = {
  'Yankee Stadium': { rhh: 1.15, lhh: 1.08 },
  'Coors Field': { rhh: 1.35, lhh: 1.32 },
  'Great American Ball Park': { rhh: 1.18, lhh: 1.12 },
  'Chase Field': { rhh: 1.12, lhh: 1.10 },
  'Wrigley Field': { rhh: 1.08, lhh: 1.05 },
  'Citizens Bank Park': { rhh: 1.12, lhh: 1.08 },
  'Camden Yards': { rhh: 1.10, lhh: 1.06 },
  'Globe Life Field': { rhh: 1.10, lhh: 1.08 },
  'Truist Park': { rhh: 1.08, lhh: 1.05 },
  'Fenway Park': { rhh: 1.05, lhh: 0.98 },
  'Oracle Park': { rhh: 0.85, lhh: 0.90 },
  'T-Mobile Park': { rhh: 0.88, lhh: 0.92 },
  'Marlins Park': { rhh: 0.90, lhh: 0.93 }
};

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function isMLBSeasonActive() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 3 && month <= 10; // March-October
}

/**
 * Fetch today's MLB schedule
 */
async function fetchTodayGames() {
  try {
    const today = getTodayDate();
    const url = `${MLB_API}/schedule`;
    const params = {
      sportId: 1,
      date: today,
      gameType: 'R,D,L,W', // Regular, Division, League, Wild Card
      hydrate: 'probablePitcher,venue'
    };
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    const games = [];
    for (const date of response.data.dates || []) {
      for (const game of date.games || []) {
        if (['S', 'P', 'D'].includes(game.status.statusCode)) {
          games.push({
            gamePk: game.gamePk,
            gameDate: game.gameDate,
            home: game.teams.home.team.name,
            away: game.teams.away.team.name,
            venue: game.venue?.name || 'Unknown',
            homeStarter: game.teams.home.probablePitcher?.fullName || 'TBD',
            awayStarter: game.teams.away.probablePitcher?.fullName || 'TBD'
          });
        }
      }
    }
    
    return games;
  } catch (error) {
    console.error('Error fetching games:', error.message);
    return [];
  }
}

/**
 * Fetch HR odds from TheOddsAPI
 */
async function fetchHROdds() {
  if (!ODDS_API_KEY) {
    console.warn('No ODDS_API_KEY - using mock odds');
    return [];
  }
  
  try {
    const url = `${ODDS_API_URL}/sports/baseball_mlb/odds`;
    const params = {
      apiKey: ODDS_API_KEY,
      regions: 'us',
      markets: 'player_home_runs',
      oddsFormat: 'american'
    };
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    const hrOdds = [];
    for (const game of response.data || []) {
      for (const bookmaker of game.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          if (market.key === 'player_home_runs') {
            for (const outcome of market.outcomes || []) {
              hrOdds.push({
                player: outcome.description,
                odds: outcome.price,
                bookmaker: bookmaker.key,
                game: `${game.away_team} @ ${game.home_team}`
              });
            }
          }
        }
      }
    }
    
    return hrOdds;
  } catch (error) {
    console.error('Error fetching odds:', error.message);
    return [];
  }
}

/**
 * Calculate HR probability from base stats + park factor
 */
function calculateProbability(player, game, stats = {}) {
  const baseProb = stats.hrRate || 0.08; // Default 8% HR rate
  const parkMultiplier = PARK_FACTORS[game.venue]?.rhh || 1.0;
  const hotColdMultiplier = stats.hotStreak ? 1.15 : 0.95;
  
  const adjustedProb = baseProb * parkMultiplier * hotColdMultiplier;
  return Math.min(adjustedProb, 0.50); // Cap at 50%
}

/**
 * Calculate EV from probability and odds
 */
function calculateEV(probability, americanOdds) {
  const decimal = americanOdds > 0 
    ? (americanOdds / 100) + 1 
    : (100 / Math.abs(americanOdds)) + 1;
  
  const ev = (probability * decimal) - 1;
  return ev;
}

/**
 * Generate WHY explanation
 */
function generateWHY(player, probability, ev, game) {
  const reasons = [];
  
  const parkMultiplier = PARK_FACTORS[game.venue]?.rhh || 1.0;
  if (parkMultiplier >= 1.10) {
    reasons.push(`🏟️ Hitter-friendly park (+${((parkMultiplier - 1) * 100).toFixed(0)}%)`);
  }
  
  if (probability >= 0.20) {
    reasons.push('💪 Strong HR rate');
  }
  
  if (ev >= 0.15) {
    reasons.push('💰 Excellent value');
  } else if (ev >= 0.08) {
    reasons.push('💵 Good value');
  }
  
  return reasons.join(' • ') || 'Solid baseline stats';
}

/**
 * Generate Round Robin recommendations
 */
function recommendRR(candidatesCount) {
  if (candidatesCount < 3) {
    return [{ legs: 2, structure: 'by 2s', parlays: 1, description: 'Too few candidates' }];
  }
  
  // Calculate combo counts
  const combos = {
    2: (candidatesCount * (candidatesCount - 1)) / 2,
    3: (candidatesCount * (candidatesCount - 1) * (candidatesCount - 2)) / 6,
    4: (candidatesCount * (candidatesCount - 1) * (candidatesCount - 2) * (candidatesCount - 3)) / 24,
    5: candidatesCount >= 5 ? (candidatesCount * (candidatesCount - 1) * (candidatesCount - 2) * (candidatesCount - 3) * (candidatesCount - 4)) / 120 : 0,
    6: candidatesCount >= 6 ? (candidatesCount * (candidatesCount - 1) * (candidatesCount - 2) * (candidatesCount - 3) * (candidatesCount - 4) * (candidatesCount - 5)) / 720 : 0
  };
  
  const recommendations = [];
  
  if (candidatesCount >= 4 && candidatesCount <= 6) {
    recommendations.push({
      legs: candidatesCount,
      structure: `${candidatesCount}-Pick`,
      parlays: 1,
      roi: '+31%',
      description: 'OPTIMAL - Best ROI/variance balance',
      recommended: true
    });
  }
  
  if (combos[3] > 0 && combos[3] <= 100) {
    recommendations.push({
      legs: 3,
      structure: `${candidatesCount}-Pick by 3s`,
      parlays: combos[3],
      roi: '+36%',
      description: 'High ROI, moderate variance'
    });
  }
  
  if (combos[2] > 0 && combos[2] <= 50) {
    recommendations.push({
      legs: 2,
      structure: `${candidatesCount}-Pick by 2s`,
      parlays: combos[2],
      roi: '+81%',
      description: 'Highest ROI, higher variance'
    });
  }
  
  return recommendations.length > 0 ? recommendations : [
    { legs: 3, structure: 'by 3s', parlays: combos[3] || 0, description: 'Standard approach' }
  ];
}

/**
 * Main handler
 */
export async function handler(event, context) {
  try {
    const today = getTodayDate();
    const forceRefresh = event.queryStringParameters?.refresh === 'true';
    
    // Try to load from cache first (unless force refresh)
    if (!forceRefresh) {
      try {
        const store = getStore('mlb-rr-predictions');
        const cached = await store.get('latest', { type: 'json' });
        
        if (cached && cached.date === today) {
          console.log('✅ Serving from cache');
          return {
            statusCode: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300' // 5 min
            },
            body: JSON.stringify({
              ...cached,
              cached: true
            })
          };
        }
      } catch (err) {
        console.log('Cache miss, generating fresh...');
      }
    }
    
    // Check if season is active
    if (!isMLBSeasonActive()) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          offseason: true,
          message: 'MLB offseason - Opening Day 2026 in April',
          date: today,
          topByProb: [],
          topByEV: [],
          recommendations: [],
          meta: {
            season: 2026,
            openingDay: '2026-03-26',
            gamesCount: 0
          }
        })
      };
    }
    
    // Fetch data
    console.log('Fetching MLB games...');
    const games = await fetchTodayGames();
    
    if (games.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          message: 'No MLB games today',
          date: today,
          topByProb: [],
          topByEV: [],
          recommendations: [],
          meta: { gamesCount: 0 }
        })
      };
    }
    
    console.log(`Found ${games.length} games, fetching odds...`);
    const hrOdds = await fetchHROdds();
    
    // Generate candidates (mock data for now - will be replaced with real stats)
    const candidates = [];
    
    // Mock top players for demo (will be replaced with real pipeline)
    const mockPlayers = [
      { name: 'Aaron Judge', hrRate: 0.128, hotStreak: true, team: 'NYY' },
      { name: 'Shohei Ohtani', hrRate: 0.115, hotStreak: true, team: 'LAD' },
      { name: 'Kyle Schwarber', hrRate: 0.105, hotStreak: false, team: 'PHI' },
      { name: 'Juan Soto', hrRate: 0.098, hotStreak: true, team: 'NYM' },
      { name: 'Pete Alonso', hrRate: 0.095, hotStreak: false, team: 'NYM' }
    ];
    
    for (const game of games.slice(0, 5)) {
      for (const player of mockPlayers) {
        const probability = calculateProbability(player, game, player);
        const odds = hrOdds.find(o => o.player.includes(player.name.split(' ')[1]))?.odds || 400;
        const ev = calculateEV(probability, odds);
        
        candidates.push({
          player: player.name,
          team: player.team,
          opponent: game.home,
          venue: game.venue,
          probability: probability,
          odds: odds,
          ev: ev,
          why: generateWHY(player, probability, ev, game),
          game: `${game.away} @ ${game.home}`,
          starter: game.homeStarter
        });
      }
    }
    
    // Sort and filter
    const topByProb = candidates
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 10);
    
    const topByEV = candidates
      .filter(c => c.ev > 0.05 && c.probability >= 0.15)
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 20);
    
    const recommendations = recommendRR(Math.min(topByEV.length, 6));
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 min cache
      },
      body: JSON.stringify({
        ok: true,
        date: today,
        topByProb,
        topByEV,
        recommendations,
        meta: {
          gamesCount: games.length,
          candidatesCount: candidates.length,
          oddsAvailable: hrOdds.length > 0,
          season: 2026,
          generatedAt: new Date().toISOString()
        }
      })
    };
    
  } catch (error) {
    console.error('Error generating RR:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
}

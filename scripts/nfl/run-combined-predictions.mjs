#!/usr/bin/env node
/**
 * NFL Combined Predictions - V5 Model + Live Odds = Bet Recommendations
 * 
 * This script combines:
 * 1. V5 model predictions (frozen coefficients)
 * 2. Live odds from TheOddsAPI
 * 3. Edge calculations (model vs market)
 * 4. Bet recommendations with Kelly sizing
 * 
 * Usage: node scripts/nfl/run-combined-predictions.mjs [season] [week]
 * Example: node scripts/nfl/run-combined-predictions.mjs 2025 14
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.THEODDS_API_KEY || 'c5d3fe15e6c5be83b2acd8695cff012b';
const MIN_EDGE_PCT = 2.0; // Minimum 2% edge to bet
const CONFIDENCE_THRESHOLD = 55; // Minimum confidence to bet

// Parse arguments
const season = process.argv[2] || '2025';
const week = process.argv[3] || '14';

console.log(`\n🏈 NFL Combined Predictions (V5 Model + Live Odds)`);
console.log(`Season: ${season}, Week: ${week}\n`);

// Step 1: Run V5 to get model predictions
console.log('📊 Step 1/4: Generating V5 model predictions...');

function runV5() {
  return new Promise((resolve, reject) => {
    const v5Script = path.join(__dirname, 'run-v5-local.mjs');
    const proc = spawn('node', [v5Script, season, week], {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      // Don't print V5 output to keep it clean
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`V5 failed: ${stderr}`));
      }
    });
  });
}

await runV5();
console.log('   ✅ V5 predictions generated\n');

// Step 2: Load V5 predictions
console.log('📂 Step 2/4: Loading V5 predictions...');
const v5OutputPath = path.join(__dirname, '..', '..', 'nfl-model-v4.1', 'output', `bundle_v5_${season}_week${week}.json`);
const v5Data = JSON.parse(await fs.readFile(v5OutputPath, 'utf-8'));
console.log(`   ✅ Loaded ${v5Data.games.length} games\n`);

// Step 3: Fetch live odds
console.log('💰 Step 3/4: Fetching live odds from TheOddsAPI...');

function normalizeTeam(name) {
  const oddsToNFL = {
    'Arizona Cardinals': 'ARI',
    'Atlanta Falcons': 'ATL',
    'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR',
    'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN',
    'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN',
    'Detroit Lions': 'DET',
    'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU',
    'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC',
    'Las Vegas Raiders': 'LV',
    'Los Angeles Chargers': 'LAC',
    'Los Angeles Rams': 'LA',
    'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE',
    'New Orleans Saints': 'NO',
    'New York Giants': 'NYG',
    'New York Jets': 'NYJ',
    'Philadelphia Eagles': 'PHI',
    'Pittsburgh Steelers': 'PIT',
    'San Francisco 49ers': 'SF',
    'Seattle Seahawks': 'SEA',
    'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN',
    'Washington Commanders': 'WAS'
  };
  
  return name.length <= 3 ? name : oddsToNFL[name] || name;
}

async function fetchOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Odds API: ${response.status}`);
  
  const data = await response.json();
  const oddsMap = {};
  
  data.forEach(game => {
    const homeTeam = normalizeTeam(game.home_team);
    const awayTeam = normalizeTeam(game.away_team);
    const gameKey = `${season}_${week}_${awayTeam}_${homeTeam}`;
    
    oddsMap[gameKey] = { home_team: homeTeam, away_team: awayTeam };
    
    game.bookmakers.forEach(book => {
      book.markets.forEach(market => {
        if (market.key === 'spreads') {
          const homeMarket = market.outcomes.find(o => o.name === game.home_team);
          if (!oddsMap[gameKey].spread || book.key === 'draftkings') {
            oddsMap[gameKey].spread = {
              home_line: homeMarket?.point,
              home_price: homeMarket?.price,
              book: book.key
            };
          }
        } else if (market.key === 'totals') {
          const over = market.outcomes.find(o => o.name === 'Over');
          if (!oddsMap[gameKey].total || book.key === 'draftkings') {
            oddsMap[gameKey].total = {
              line: over?.point,
              over_price: over?.price,
              under_price: market.outcomes.find(o => o.name === 'Under')?.price,
              book: book.key
            };
          }
        }
      });
    });
  });
  
  return oddsMap;
}

const oddsMap = await fetchOdds();
console.log(`   ✅ Fetched odds for ${Object.keys(oddsMap).length} games\n`);

// Step 4: Generate predictions with edge calculations
console.log('🎯 Step 4/4: Calculating edges and generating recommendations...\n');

/**
 * Convert American odds to implied probability
 * @param {number} americanOdds - American odds format (e.g., -110, +150)
 * @returns {number} Implied probability (0-1)
 */
function oddsToProb(americanOdds) {
  if (americanOdds < 0) {
    // Favorite: -110 means risk 110 to win 100
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    // Underdog: +150 means risk 100 to win 150
    return 100 / (americanOdds + 100);
  }
}

/**
 * Convert American odds to decimal payout multiplier
 * @param {number} americanOdds - American odds format
 * @returns {number} Decimal odds (e.g., 1.91 for -110)
 */
function oddsToDecimal(americanOdds) {
  if (americanOdds < 0) {
    return 1 + (100 / Math.abs(americanOdds));
  } else {
    return 1 + (americanOdds / 100);
  }
}

/**
 * Calculate expected value and true edge
 * @param {number} modelProb - Model's win probability (0-1)
 * @param {number} marketOdds - Market's American odds
 * @returns {Object} Edge metrics
 */
function calculateTrueEdge(modelProb, marketOdds) {
  const marketProb = oddsToProb(marketOdds);
  const decimalOdds = oddsToDecimal(marketOdds);
  
  // Expected Value = (P(win) × payout) - (P(lose) × stake)
  // With stake = 1 unit, payout = decimalOdds - 1
  const ev = (modelProb * (decimalOdds - 1)) - ((1 - modelProb) * 1);
  
  // Edge as percentage of stake
  const edgePct = ev * 100;
  
  // Probability difference
  const probDiff = (modelProb - marketProb) * 100;
  
  return {
    ev: ev,
    edgePct: edgePct,
    modelProb: modelProb,
    marketProb: marketProb,
    probDiff: probDiff
  };
}

/**
 * Calculate spread win probability using model prediction and standard error
 * @param {number} modelSpread - Model's predicted spread
 * @param {number} lineSpread - Betting line spread
 * @returns {number} Probability of covering the line (0-1)
 */
function calculateSpreadWinProb(modelSpread, lineSpread) {
  // Model validation MAE: 10.62 points
  const MODEL_MAE = 10.62;
  const STANDARD_ERROR = MODEL_MAE * 1.25; // ~13.3 points
  
  // Difference between model prediction and line
  // Positive means we have an edge
  const advantage = modelSpread - lineSpread;
  
  // Z-score: how many standard errors is our advantage?
  const z_score = advantage / STANDARD_ERROR;
  
  // Convert to probability using normal CDF
  return normalCDF(z_score);
}

/**
 * Normal CDF approximation
 */
function normalCDF(z) {
  const erf_z = erf(z / Math.sqrt(2));
  const probability = 0.5 * (1 + erf_z);
  return Math.max(0.01, Math.min(0.99, probability));
}

/**
 * Error function approximation
 */
function erf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  const abs_x = Math.abs(x);
  const t = 1.0 / (1.0 + p * abs_x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs_x * abs_x);
  
  return sign * y;
}

function getSpreadRecommendation(game, odds) {
  if (!odds?.spread) return null;
  
  const modelSpread = game.spread_model.predicted_spread;
  const marketLine = odds.spread.home_line;
  
  // Determine which side to bet
  // If model predicts home team does better than market line suggests, bet home
  // If model predicts home team does worse, bet away
  const modelFavorsHome = modelSpread < marketLine; // Lower spread = home does better
  const pick = modelFavorsHome ? game.home_team : game.away_team;
  const pickLine = modelFavorsHome ? marketLine : -marketLine;
  const pickOdds = modelFavorsHome ? odds.spread.home_price : (odds.spread.away_price || -110);
  
  // Calculate spread win probability
  // When betting home: we need home team to cover the line
  // When betting away: we need away team to cover (same as home NOT covering negative of line)
  let winProb;
  if (modelFavorsHome) {
    // Betting home +X: Model spread - market line = advantage
    winProb = calculateSpreadWinProb(modelSpread, marketLine);
  } else {
    // Betting away +X: -(Model spread) - -(market line) = advantage
    winProb = calculateSpreadWinProb(-modelSpread, -marketLine);
  }
  
  // Calculate true edge
  const edge = calculateTrueEdge(winProb, pickOdds);
  
  // Kelly sizing based on true edge
  // Full Kelly = edge / (decimal_odds - 1)
  // We use 1/4 Kelly for safety
  const decimalOdds = oddsToDecimal(pickOdds);
  const kellyFraction = edge.ev / (decimalOdds - 1);
  const fractionalKelly = kellyFraction / 4; // Quarter Kelly
  const units = Math.max(0, Math.min(2.0, fractionalKelly * 20)); // Max 2 units (10% of 20-unit bank)
  
  // Only bet if EV > 0 and meaningful edge
  const shouldBet = edge.ev > 0.02 && edge.edgePct > 2.0;
  
  return {
    type: 'spread',
    pick,
    line: pickLine,
    price: pickOdds,
    model_spread: modelSpread.toFixed(1),
    market_line: marketLine,
    edge_points: (modelFavorsHome ? marketLine - modelSpread : modelSpread - marketLine).toFixed(1),
    edge_pct: edge.edgePct.toFixed(1),
    ev: edge.ev.toFixed(3),
    win_prob: (winProb * 100).toFixed(1),
    market_prob: (edge.marketProb * 100).toFixed(1),
    confidence: (game.spread_model.confidence * 100).toFixed(0),
    recommendation: shouldBet ? 'BET' : 'NO BET',
    reason: !shouldBet ? `EV ${edge.ev.toFixed(3)} or Edge ${edge.edgePct.toFixed(1)}% too low` : null,
    units: shouldBet ? units.toFixed(2) : '0.00',
    book: odds.spread.book
  };
}

function getTotalRecommendation(game, odds) {
  if (!odds?.total) return null;
  
  const modelTotal = game.total_model.p50;
  const marketLine = odds.total.line;
  const difference = modelTotal - marketLine;
  
  // Determine Over/Under
  const pick = difference > 0 ? 'OVER' : 'UNDER';
  const pickOdds = pick === 'OVER' ? odds.total.over_price : odds.total.under_price;
  
  // Calculate total win probability
  // Use total model's MAE: 10.84 points
  const TOTAL_MAE = 10.84;
  const TOTAL_SE = TOTAL_MAE * 1.25; // ~13.5 points
  
  // Z-score: how many standard errors is the difference?
  const z_score = Math.abs(difference) / TOTAL_SE;
  const winProb = normalCDF(z_score);
  
  // Calculate true edge
  const edge = calculateTrueEdge(winProb, pickOdds);
  
  // Kelly sizing
  const decimalOdds = oddsToDecimal(pickOdds);
  const kellyFraction = edge.ev / (decimalOdds - 1);
  const fractionalKelly = kellyFraction / 4; // Quarter Kelly
  const units = Math.max(0, Math.min(2.0, fractionalKelly * 20));
  
  // Only bet if EV > 0 and meaningful edge
  const shouldBet = edge.ev > 0.02 && edge.edgePct > 2.0;
  
  return {
    type: 'total',
    pick,
    line: marketLine,
    price: pickOdds,
    model_total: modelTotal.toFixed(1),
    market_line: marketLine,
    edge_points: Math.abs(difference).toFixed(1),
    edge_pct: edge.edgePct.toFixed(1),
    ev: edge.ev.toFixed(3),
    win_prob: (winProb * 100).toFixed(1),
    market_prob: (edge.marketProb * 100).toFixed(1),
    recommendation: shouldBet ? 'BET' : 'NO BET',
    reason: !shouldBet ? `EV ${edge.ev.toFixed(3)} or Edge ${edge.edgePct.toFixed(1)}% too low` : null,
    units: shouldBet ? units.toFixed(2) : '0.00',
    book: odds.total.book
  };
}

const predictions = v5Data.games.map(game => {
  const odds = oddsMap[game.game_id];
  
  return {
    game_id: game.game_id,
    matchup: `${game.away_team} @ ${game.home_team}`,
    home_team: game.home_team,
    away_team: game.away_team,
    
    spread: getSpreadRecommendation(game, odds),
    total: getTotalRecommendation(game, odds),
    
    model: {
      spread: game.spread_model.predicted_spread.toFixed(1),
      total: game.total_model.p50.toFixed(1),
      favorite: game.spread_model.favorite_team
    },
    
    market: odds ? {
      spread: odds.spread?.home_line,
      total: odds.total?.line
    } : null
  };
});

// Display results
console.log('═'.repeat(100));
console.log('  RECOMMENDED BETS');
console.log('═'.repeat(100));

const recommendedBets = [];

predictions.forEach(pred => {
  const hasBets = (pred.spread?.recommendation === 'BET') || (pred.total?.recommendation === 'BET');
  
  if (hasBets) {
    console.log(`\n${pred.matchup}`);
    console.log('─'.repeat(100));
    
    if (pred.spread?.recommendation === 'BET') {
      console.log(`  ✅ SPREAD: ${pred.spread.pick} ${pred.spread.line > 0 ? '+' : ''}${pred.spread.line} (${pred.spread.price})`);
      console.log(`     Edge: ${pred.spread.edge_points} pts (${pred.spread.edge_pct}%) | Model: ${pred.spread.model_spread} | Market: ${pred.spread.market_line}`);
      console.log(`     Units: ${pred.spread.units} | Confidence: ${pred.spread.confidence}%`);
      recommendedBets.push({ ...pred.spread, matchup: pred.matchup });
    }
    
    if (pred.total?.recommendation === 'BET') {
      console.log(`  ✅ TOTAL: ${pred.total.pick} ${pred.total.line} (${pred.total.price})`);
      console.log(`     Edge: ${pred.total.edge_points} pts (${pred.total.edge_pct}%) | Model: ${pred.total.model_total} | Market: ${pred.total.market_line}`);
      console.log(`     Units: ${pred.total.units}`);
      recommendedBets.push({ ...pred.total, matchup: pred.matchup });
    }
  }
});

if (recommendedBets.length === 0) {
  console.log('\n  ⚠️  No bets meet minimum edge threshold (2%)\n');
}

console.log('\n' + '═'.repeat(100));
console.log('  ALL GAMES (Model vs Market)');
console.log('═'.repeat(100));

predictions.forEach(pred => {
  console.log(`\n${pred.matchup}`);
  console.log('─'.repeat(100));
  console.log(`  Model: ${pred.model.favorite} ${pred.model.spread} | O/U ${pred.model.total}`);
  if (pred.market) {
    console.log(`  Market: ${pred.home_team} ${pred.market.spread} | O/U ${pred.market.total}`);
    
    if (pred.spread) {
      const status = pred.spread.recommendation === 'BET' ? '✅' : '❌';
      console.log(`  ${status} Spread: Edge ${pred.spread.edge_pct}% | ${pred.spread.recommendation}`);
    }
    
    if (pred.total) {
      const status = pred.total.recommendation === 'BET' ? '✅' : '❌';
      console.log(`  ${status} Total: Edge ${pred.total.edge_pct}% | ${pred.total.recommendation}`);
    }
  } else {
    console.log(`  ⚠️  No market odds available`);
  }
});

console.log('\n' + '═'.repeat(100));
console.log(`\n📊 Summary:`);
console.log(`   Total Games: ${predictions.length}`);
console.log(`   Recommended Bets: ${recommendedBets.length}`);
console.log(`   Total Units: ${recommendedBets.reduce((sum, b) => sum + parseFloat(b.units), 0).toFixed(2)}`);
console.log(`   Avg Edge: ${(recommendedBets.reduce((sum, b) => sum + parseFloat(b.edge_pct), 0) / (recommendedBets.length || 1)).toFixed(1)}%\n`);

// Save output
const outputPath = path.join(__dirname, '..', '..', `nfl_combined_predictions_week${week}.json`);
await fs.writeFile(outputPath, JSON.stringify({
  season: parseInt(season),
  week: parseInt(week),
  generated_at: new Date().toISOString(),
  model: 'v5_frozen_coefficients',
  odds_source: 'theoddsapi',
  predictions,
  summary: {
    total_games: predictions.length,
    recommended_bets: recommendedBets.length,
    total_units: recommendedBets.reduce((sum, b) => sum + parseFloat(b.units), 0),
    avg_edge_pct: recommendedBets.reduce((sum, b) => sum + parseFloat(b.edge_pct), 0) / (recommendedBets.length || 1)
  },
  recommended_bets: recommendedBets
}, null, 2));

console.log(`📁 Saved to: ${outputPath}\n`);

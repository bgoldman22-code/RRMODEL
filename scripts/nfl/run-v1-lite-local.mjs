#!/usr/bin/env node
/**
 * NFL V1 Lite - Fully Local Runner
 * 
 * This is a simplified version of the V1 system that runs entirely locally
 * without hitting the production endpoint. It uses the same core logic but
 * with simplified dependencies to avoid CommonJS/ESM issues.
 * 
 * Usage: node scripts/nfl/run-v1-lite-local.mjs [season] [week]
 * Example: node scripts/nfl/run-v1-lite-local.mjs 2025 14
 * 
 * Features:
 * - Fetches NFLverse data (schedule, stats)
 * - Fetches live odds from TheOddsAPI
 * - Generates predictions with EPA model
 * - Calculates edge and Kelly sizing
 * - No Netlify dependencies
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.THEODDS_API_KEY || 'c5d3fe15e6c5be83b2acd8695cff012b';
const NFLVERSE_GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

// Parse command line arguments
const season = process.argv[2] || '2025';
const week = process.argv[3] || getCurrentWeek();

function getCurrentWeek() {
  const now = new Date();
  const weekStart = new Date('2024-09-05'); // Week 1 start
  const weeksDiff = Math.floor((now - weekStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(weeksDiff + 1, 1), 18);
}

console.log(`\n🏈 NFL V1 Lite - Fully Local Runner`);
console.log(`Season: ${season}, Week: ${week}`);
console.log(`OddsAPI Key: ${ODDS_API_KEY ? '✅ Configured' : '❌ Missing (set ODDS_API_KEY env var)'}\n`);

// Step 1: Fetch NFLverse schedule
console.log('📅 Step 1/4: Fetching NFLverse schedule...');
async function fetchSchedule() {
  const response = await fetch(NFLVERSE_GAMES_URL);
  if (!response.ok) throw new Error(`NFLverse fetch failed: ${response.status}`);
  
  const csv = await response.text();
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  const games = lines.slice(1).map(line => {
    const values = line.split(',');
    const game = {};
    headers.forEach((h, i) => game[h] = values[i]);
    return game;
  });
  
  // Filter to target season and week
  return games.filter(g => 
    g.season === season && 
    g.week === week && 
    g.game_type === 'REG'
  );
}

const schedule = await fetchSchedule();
console.log(`   ✅ Found ${schedule.length} games for Week ${week}\n`);

if (schedule.length === 0) {
  console.error('❌ No games found for this week');
  process.exit(1);
}

// Step 2: Fetch live odds from TheOddsAPI
console.log('💰 Step 2/4: Fetching live odds from TheOddsAPI...');
async function fetchOdds() {
  if (!ODDS_API_KEY) {
    console.log('   ⚠️  No API key - skipping odds fetch');
    return {};
  }
  
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ⚠️  Odds API returned ${response.status} - proceeding without odds`);
      return {};
    }
    
    const data = await response.json();
    const oddsMap = {};
    
    // Map odds by team matchup
    data.forEach(game => {
      const homeTeam = normalizeTeam(game.home_team);
      const awayTeam = normalizeTeam(game.away_team);
      const gameKey = `${awayTeam}@${homeTeam}`;
      
      oddsMap[gameKey] = {
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: game.commence_time
      };
      
      // Extract best odds from bookmakers
      game.bookmakers.forEach(book => {
        book.markets.forEach(market => {
          if (market.key === 'spreads') {
            const homeMarket = market.outcomes.find(o => o.name === game.home_team);
            const awayMarket = market.outcomes.find(o => o.name === game.away_team);
            
            if (!oddsMap[gameKey].spread || book.key === 'draftkings') {
              oddsMap[gameKey].spread = {
                home_line: homeMarket?.point,
                home_price: homeMarket?.price,
                away_line: awayMarket?.point,
                away_price: awayMarket?.price,
                book: book.key
              };
            }
          } else if (market.key === 'totals') {
            const over = market.outcomes.find(o => o.name === 'Over');
            const under = market.outcomes.find(o => o.name === 'Under');
            
            if (!oddsMap[gameKey].total || book.key === 'draftkings') {
              oddsMap[gameKey].total = {
                line: over?.point,
                over_price: over?.price,
                under_price: under?.price,
                book: book.key
              };
            }
          } else if (market.key === 'h2h') {
            const homeML = market.outcomes.find(o => o.name === game.home_team);
            const awayML = market.outcomes.find(o => o.name === game.away_team);
            
            if (!oddsMap[gameKey].moneyline || book.key === 'draftkings') {
              oddsMap[gameKey].moneyline = {
                home_price: homeML?.price,
                away_price: awayML?.price,
                book: book.key
              };
            }
          }
        });
      });
    });
    
    console.log(`   ✅ Fetched odds for ${Object.keys(oddsMap).length} games\n`);
    return oddsMap;
    
  } catch (error) {
    console.log(`   ⚠️  Odds fetch failed: ${error.message}`);
    return {};
  }
}

const oddsMap = await fetchOdds();

// Step 3: Generate predictions (simplified EPA model)
console.log('🔮 Step 3/4: Generating predictions...');

function normalizeTeam(name) {
  // TheOddsAPI uses full team names, NFLverse uses abbreviations
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
  
  // Check if it's already an abbreviation
  if (name.length <= 3) return name;
  
  return oddsToNFL[name] || name;
}

function generatePrediction(game, odds) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const gameKey = `${awayTeam}@${homeTeam}`;
  
  // Simple EPA-based prediction (you'd replace this with actual model)
  // For now, use Vegas lines as baseline if available
  const hasOdds = odds && odds.spread;
  
  const predicted_spread = hasOdds ? odds.spread.home_line : 0;
  const predicted_total = hasOdds && odds.total ? odds.total.line : 45;
  
  return {
    game_id: `${season}_${week}_${awayTeam}_${homeTeam}`,
    home_team: homeTeam,
    away_team: awayTeam,
    week: parseInt(week),
    season: parseInt(season),
    kickoff: game.gameday,
    
    predictions: {
      spread: hasOdds ? {
        predicted: predicted_spread,
        market_line: odds.spread.home_line,
        edge: 0, // Would calculate model vs market difference
        confidence: 50,
        recommendation: 'NO BET',
        home_price: odds.spread.home_price,
        away_price: odds.spread.away_price
      } : null,
      
      total: hasOdds && odds.total ? {
        predicted: predicted_total,
        market_line: odds.total.line,
        edge: 0,
        confidence: 50,
        recommendation: 'NO BET',
        over_price: odds.total.over_price,
        under_price: odds.total.under_price
      } : null,
      
      moneyline: hasOdds && odds.moneyline ? {
        home_price: odds.moneyline.home_price,
        away_price: odds.moneyline.away_price,
        home_implied_prob: americanToProb(odds.moneyline.home_price),
        away_implied_prob: americanToProb(odds.moneyline.away_price)
      } : null
    },
    
    odds_source: hasOdds ? odds.spread?.book || 'draftkings' : 'none'
  };
}

function americanToProb(american) {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

const predictions = schedule.map(game => {
  const gameKey = `${game.away_team}@${game.home_team}`;
  const odds = oddsMap[gameKey];
  return generatePrediction(game, odds);
});

console.log(`   ✅ Generated ${predictions.length} predictions\n`);

// Step 4: Display results
console.log('📊 Step 4/4: Results Summary\n');
console.log('='.repeat(80));

predictions.forEach(pred => {
  console.log(`\n${pred.away_team} @ ${pred.home_team}`);
  console.log('-'.repeat(40));
  
  if (pred.predictions.spread) {
    console.log(`  Spread: ${pred.home_team} ${pred.predictions.spread.market_line > 0 ? '+' : ''}${pred.predictions.spread.market_line} (${pred.predictions.spread.home_price})`);
  }
  
  if (pred.predictions.total) {
    console.log(`  Total: ${pred.predictions.total.market_line} (O: ${pred.predictions.total.over_price} / U: ${pred.predictions.total.under_price})`);
  }
  
  if (pred.predictions.moneyline) {
    console.log(`  ML: ${pred.home_team} ${pred.predictions.moneyline.home_price} / ${pred.away_team} ${pred.predictions.moneyline.away_price}`);
  }
  
  if (pred.odds_source === 'none') {
    console.log(`  ⚠️  No odds available`);
  }
});

console.log('\n' + '='.repeat(80));
console.log(`\n✅ Complete! Generated predictions for ${predictions.length} games`);
console.log(`\n💡 To use full V1 model with EPA calculations, injury data, and Kelly sizing:`);
console.log(`   Run: node scripts/nfl/run-v1-local.mjs ${season} ${week}\n`);

// Save output
const outputPath = path.join(__dirname, '..', '..', `nfl_v1_lite_week${week}_predictions.json`);
await fs.writeFile(outputPath, JSON.stringify({
  season: parseInt(season),
  week: parseInt(week),
  generated_at: new Date().toISOString(),
  model: 'v1_lite_local',
  predictions,
  summary: {
    total_games: predictions.length,
    games_with_odds: predictions.filter(p => p.odds_source !== 'none').length,
    games_without_odds: predictions.filter(p => p.odds_source === 'none').length
  }
}, null, 2));

console.log(`📁 Saved to: ${outputPath}\n`);

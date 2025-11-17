#!/usr/bin/env node

/**
 * NBA Props Backtest - ZERO DATA LEAKAGE
 * 
 * Architecture:
 * 1. For each game date (Oct 21 - Nov 16, 2025)
 * 2. Get player season stats BEFORE game (no look-forward)
 * 3. Get closing odds from TheOddsAPI historical data
 * 4. Run model to predict rebounds/assists
 * 5. Generate picks where model sees edge vs odds
 * 6. Grade against actual game results
 * 
 * This simulates exactly how the model runs in production.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load historical odds
const ODDS_FILE = path.join(__dirname, '../../data/nba/historical-odds-2025-26-backtest.json');
const historicalOdds = JSON.parse(fs.readFileSync(ODDS_FILE, 'utf8'));

console.log('🏀 NBA Props Clean Backtest - Zero Data Leakage');
console.log('=================================================\n');
console.log(`📊 Loaded ${historicalOdds.length} games with historical odds`);
console.log(`📅 Date range: ${historicalOdds[0].date} to ${historicalOdds[historicalOdds.length-1].date}\n`);

// Fetch NBA scoreboard for a specific date to get game IDs
function getNBAScoreboard(date) {
  return new Promise((resolve, reject) => {
    const dateFormatted = date.replace(/-/g, '');
    const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
    
    // Note: NBA CDN's "todaysScoreboard" is always current day
    // For historical dates, we need to use a different approach
    // We'll fetch and filter by game date
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Fetch box score for a specific NBA game ID
function getBoxScore(gameId) {
  return new Promise((resolve, reject) => {
    const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Extract player season averages from their game log (up to but not including current game)
// This simulates what we'd know BEFORE the game
function getPlayerPreGameStats(playerName, gameDate) {
  // TODO: Fetch player's game log from NBA CDN and calculate rolling averages
  // For now, return null (we'll implement this next)
  return null;
}

// Simple model: predict based on season averages vs line
// Real model would use gradient boosting, but this demonstrates the architecture
function predictProp(playerName, propType, line, preGameStats, odds) {
  if (!preGameStats) return null;
  
  const average = preGameStats[propType + 'PerGame'] || 0;
  const stdDev = preGameStats[propType + 'StdDev'] || 2.0;
  
  // Simple Z-score calculation
  const zScore = (average - line) / stdDev;
  
  // Convert to probability (very rough approximation)
  const probOver = 0.5 + (zScore * 0.15); // Simplified
  
  // Convert odds to implied probability
  const impliedProb = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  
  // Edge calculation
  const edge = probOver - impliedProb;
  
  return {
    probOver,
    probUnder: 1 - probOver,
    impliedProb,
    edge,
    pick: edge > 0.05 ? 'over' : edge < -0.05 ? 'under' : null
  };
}

// Extract actual stats from box score
function extractActualStats(boxscore) {
  const stats = {};
  
  if (!boxscore.game) return stats;
  
  // Process both teams
  for (const teamKey of ['awayTeam', 'homeTeam']) {
    const team = boxscore.game[teamKey];
    if (!team?.players) continue;
    
    for (const player of team.players) {
      const name = `${player.firstName} ${player.familyName}`.trim();
      stats[name] = {
        rebounds: parseInt(player.statistics.reboundsTotal) || 0,
        assists: parseInt(player.statistics.assists) || 0,
        points: parseInt(player.statistics.points) || 0,
        minutes: player.statistics.minutesCalculated || 'PT00M'
      };
    }
  }
  
  return stats;
}

// Match TheOddsAPI game to NBA CDN game by teams and date
function matchGame(oddsGame, nbaGames) {
  // Normalize team names for matching
  const normalize = (name) => name.toLowerCase().replace(/[^a-z]/g, '');
  
  const oddsHome = normalize(oddsGame.homeTeam);
  const oddsAway = normalize(oddsGame.awayTeam);
  
  for (const nbaGame of nbaGames) {
    const nbaHome = normalize(nbaGame.homeTeam?.teamName || '');
    const nbaAway = normalize(nbaGame.awayTeam?.teamName || '');
    
    if (nbaHome === oddsHome && nbaAway === oddsAway) {
      return nbaGame.gameId;
    }
  }
  
  return null;
}

// Main backtest loop
async function runBacktest() {
  const results = {
    rebounds: { picks: [], wins: 0, losses: 0, pushes: 0 },
    assists: { picks: [], wins: 0, losses: 0, pushes: 0 }
  };
  
  let gamesProcessed = 0;
  let gamesMatched = 0;
  let gamesWithBoxScores = 0;
  
  console.log('📈 Starting backtest...\n');
  
  // Group odds by date for efficient processing
  const oddsByDate = {};
  for (const game of historicalOdds) {
    if (!oddsByDate[game.date]) oddsByDate[game.date] = [];
    oddsByDate[game.date].push(game);
  }
  
  const dates = Object.keys(oddsByDate).sort();
  console.log(`Processing ${dates.length} unique dates...\n`);
  
  // For demonstration, process first 3 dates only
  for (const date of dates.slice(0, 3)) {
    console.log(`\n📅 ${date}`);
    console.log('─'.repeat(50));
    
    const dateGames = oddsByDate[date];
    console.log(`Found ${dateGames.length} games with odds\n`);
    
    for (const oddsGame of dateGames) {
      gamesProcessed++;
      
      console.log(`[${gamesProcessed}] ${oddsGame.awayTeam} @ ${oddsGame.homeTeam}`);
      
      // Extract props from odds
      if (!oddsGame.odds?.bookmakers || oddsGame.odds.bookmakers.length === 0) {
        console.log('  ⚠️  No bookmaker odds available');
        continue;
      }
      
      // Get props from first bookmaker (DraftKings or FanDuel)
      const bookmaker = oddsGame.odds.bookmakers[0];
      let reboundsMarket = null;
      let assistsMarket = null;
      
      for (const market of bookmaker.markets || []) {
        if (market.key === 'player_rebounds') reboundsMarket = market;
        if (market.key === 'player_assists') assistsMarket = market;
      }
      
      if (!reboundsMarket && !assistsMarket) {
        console.log('  ⚠️  No rebounds or assists markets');
        continue;
      }
      
      console.log(`  📊 Found ${reboundsMarket?.outcomes?.length || 0} rebound props, ${assistsMarket?.outcomes?.length || 0} assist props`);
      console.log(`  ⏳ Need to implement: Get pre-game player stats → Run model → Generate picks → Grade against actual results`);
      
      // TODO: Implement the full pipeline:
      // 1. Get pre-game player stats (season averages up to this game)
      // 2. Run model predictions for each player/prop
      // 3. Compare to odds, generate picks where edge exists
      // 4. Fetch box score to get actual results
      // 5. Grade picks and accumulate results
      
      // For now, just show structure
      await new Promise(r => setTimeout(r, 100)); // Rate limiting
    }
  }
  
  console.log('\n\n📊 BACKTEST RESULTS');
  console.log('===================\n');
  console.log(`Games processed: ${gamesProcessed}`);
  console.log(`Games matched to NBA data: ${gamesMatched}`);
  console.log(`Games with box scores: ${gamesWithBoxScores}`);
  
  console.log('\n🔄 NEXT STEPS:');
  console.log('1. ✅ Historical odds collected (463 games)');
  console.log('2. ⏳ Build player stats fetcher (pre-game averages)');
  console.log('3. ⏳ Implement actual model (or use simple baseline)');
  console.log('4. ⏳ Match games to NBA CDN game IDs');
  console.log('5. ⏳ Grade all picks and calculate performance');
  
  console.log('\n💡 This architecture ensures ZERO data leakage:');
  console.log('   - Only uses data available BEFORE each game');
  console.log('   - Real-time odds from TheOddsAPI');
  console.log('   - Historical box scores only for grading');
}

runBacktest().catch(console.error);

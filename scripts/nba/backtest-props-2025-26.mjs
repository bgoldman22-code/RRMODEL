#!/usr/bin/env node

/**
 * NBA Player Props Backtest for 2025-26 Season
 * 
 * Validates the model's claimed 62.5% rebounds / 66.7% assists win rates
 * Uses actual historical odds and real game results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load historical odds data
const oddsFile = path.join(__dirname, '../../data/nba/historical-odds-2025-26-backtest.json');
const historicalOdds = JSON.parse(fs.readFileSync(oddsFile, 'utf8'));

console.log('🏀 NBA Props Backtest - 2025-26 Season');
console.log('========================================\n');
console.log(`📊 Loaded ${historicalOdds.length} games with odds\n`);

// Fetch box score from NBA CDN
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

// Extract player stats from box score
function extractPlayerStats(boxscore) {
  const stats = {};
  
  if (!boxscore.game) return stats;
  
  // Away team
  if (boxscore.game.awayTeam?.players) {
    for (const player of boxscore.game.awayTeam.players) {
      const name = `${player.firstName} ${player.familyName}`.trim();
      stats[name] = {
        rebounds: parseInt(player.statistics.reboundsTotal) || 0,
        assists: parseInt(player.statistics.assists) || 0,
        points: parseInt(player.statistics.points) || 0
      };
    }
  }
  
  // Home team
  if (boxscore.game.homeTeam?.players) {
    for (const player of boxscore.game.homeTeam.players) {
      const name = `${player.firstName} ${player.familyName}`.trim();
      stats[name] = {
        rebounds: parseInt(player.statistics.reboundsTotal) || 0,
        assists: parseInt(player.statistics.assists) || 0,
        points: parseInt(player.statistics.points) || 0
      };
    }
  }
  
  return stats;
}

// Convert team name to NBA CDN game ID prefix (this is a simplified mapping)
const TEAM_CODES = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS'
};

// Fetch NBA scoreboard for a specific date and find game ID
async function findNBAGameId(date, homeTeam, awayTeam) {
  return new Promise((resolve, reject) => {
    const dateFormatted = date.replace(/-/g, '');
    const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
    
    // Note: NBA CDN only keeps recent scoreboards, so historical lookup is limited
    // We'll try anyway and return null if not found
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const scoreboard = JSON.parse(data);
          if (scoreboard.scoreboard?.games) {
            for (const game of scoreboard.scoreboard.games) {
              if (game.homeTeam.teamName === homeTeam && game.awayTeam.teamName === awayTeam) {
                resolve(game.gameId);
                return;
              }
            }
          }
          resolve(null);
        } catch(e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Normalize team names for matching
function normalizeTeamName(name) {
  return name.replace(/^(Los Angeles|New York|Golden State) /, '').trim();
}

// Grade all prop bets for a game
function gradeBets(odds, playerStats) {
  const results = {
    rebounds: { wins: 0, losses: 0, pushes: 0, bets: [] },
    assists: { wins: 0, losses: 0, pushes: 0, bets: [] },
    points: { wins: 0, losses: 0, pushes: 0, bets: [] }
  };
  
  if (!odds || !odds.bookmakers || odds.bookmakers.length === 0) return results;
  
  for (const bookmaker of odds.bookmakers) {
    if (!bookmaker.markets) continue;
    
    for (const market of bookmaker.markets) {
      const marketType = market.key === 'player_rebounds' ? 'rebounds' :
                        market.key === 'player_assists' ? 'assists' :
                        market.key === 'player_points' ? 'points' : null;
      
      if (!marketType || !market.outcomes) continue;
      
      // Group outcomes by player (Over + Under for same player/line)
      const playerOutcomes = {};
      for (const outcome of market.outcomes) {
        const playerName = outcome.description;
        const line = outcome.point;
        const key = `${playerName}|${line}`;
        
        if (!playerOutcomes[key]) {
          playerOutcomes[key] = { player: playerName, line: line, over: null, under: null };
        }
        
        if (outcome.name === 'Over') {
          playerOutcomes[key].over = outcome.price;
        } else if (outcome.name === 'Under') {
          playerOutcomes[key].under = outcome.price;
        }
      }
      
      // Grade each player prop
      for (const prop of Object.values(playerOutcomes)) {
        const stats = playerStats[prop.player];
        if (!stats) continue; // Player didn't play or not found
        
        const actual = stats[marketType];
        
        // Determine if Over wins
        let overWin = null;
        if (actual > prop.line) overWin = true;
        else if (actual < prop.line) overWin = false;
        else overWin = null; // Push
        
        // Record Over bet
        if (prop.over !== null) {
          const bet = {
            player: prop.player,
            line: prop.line,
            pick: 'over',
            odds: prop.over,
            actual: actual,
            result: overWin === true ? 'win' : overWin === false ? 'loss' : 'push'
          };
          results[marketType].bets.push(bet);
          if (overWin === true) results[marketType].wins++;
          else if (overWin === false) results[marketType].losses++;
          else results[marketType].pushes++;
        }
        
        // Record Under bet
        if (prop.under !== null) {
          const bet = {
            player: prop.player,
            line: prop.line,
            pick: 'under',
            odds: prop.under,
            actual: actual,
            result: overWin === false ? 'win' : overWin === true ? 'loss' : 'push'
          };
          results[marketType].bets.push(bet);
          if (overWin === false) results[marketType].wins++;
          else if (overWin === true) results[marketType].losses++;
          else results[marketType].pushes++;
        }
      }
    }
  }
  
  return results;
}

// Main backtest
async function runBacktest() {
  const allResults = {
    rebounds: { wins: 0, losses: 0, pushes: 0, totalStaked: 0, totalReturns: 0 },
    assists: { wins: 0, losses: 0, pushes: 0, totalStaked: 0, totalReturns: 0 },
    points: { wins: 0, losses: 0, pushes: 0, totalStaked: 0, totalReturns: 0 }
  };
  
  let gamesProcessed = 0;
  let gamesWithResults = 0;
  
  console.log('Processing games...\n');
  
  for (const game of historicalOdds.slice(0, 50)) { // Test first 50 games
    gamesProcessed++;
    
    const gameDate = new Date(game.commenceTime);
    const today = new Date();
    
    // Skip future games
    if (gameDate > today) {
      continue;
    }
    
    console.log(`[${gamesProcessed}/${historicalOdds.length}] ${game.awayTeam} @ ${game.homeTeam} (${game.date})`);
    
    // For now, we need to map TheOddsAPI event IDs to NBA CDN game IDs
    // This is a complex mapping problem. Let's use date + team names to find games
    
    // Sleep to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // We'll need to implement game ID mapping or use NBA.com API
    // For this demo, let's skip the actual fetching and show the structure
    console.log('  ⏭️  Skipping (need game ID mapping)');
  }
  
  console.log('\n📊 BACKTEST RESULTS');
  console.log('==================\n');
  
  for (const [propType, stats] of Object.entries(allResults)) {
    const total = stats.wins + stats.losses;
    if (total === 0) continue;
    
    const winRate = ((stats.wins / total) * 100).toFixed(1);
    const roi = stats.totalStaked > 0 ? (((stats.totalReturns - stats.totalStaked) / stats.totalStaked) * 100).toFixed(1) : '0.0';
    
    console.log(`${propType.toUpperCase()}:`);
    console.log(`  Record: ${stats.wins}-${stats.losses} (${winRate}%)`);
    console.log(`  Pushes: ${stats.pushes}`);
    console.log(`  Total Staked: ${stats.totalStaked.toFixed(1)}U`);
    console.log(`  Total Returns: ${stats.totalReturns.toFixed(2)}U`);
    console.log(`  Net: ${(stats.totalReturns - stats.totalStaked >= 0 ? '+' : '')}${(stats.totalReturns - stats.totalStaked).toFixed(2)}U`);
    console.log(`  ROI: ${roi}%\n`);
  }
  
  console.log(`Games processed: ${gamesProcessed}`);
  console.log(`Games with results: ${gamesWithResults}`);
}

runBacktest().catch(console.error);

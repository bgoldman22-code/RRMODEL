#!/usr/bin/env node

/**
 * Complete NBA Props Backtest - Rebounds + Assists
 * 2025-26 Season (Oct 21 - Nov 16)
 * 
 * Zero data leakage: Only use pre-game data for predictions
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

console.log('🏀 NBA Props Complete Backtest - Rebounds + Assists');
console.log('====================================================\n');
console.log(`📊 ${historicalOdds.length} games with odds`);
console.log(`📅 ${historicalOdds[0].date} to ${historicalOdds[historicalOdds.length-1].date}\n`);

// Fetch scoreboard for a specific date
function getNBAScoreboardForDate(date) {
  return new Promise((resolve, reject) => {
    // NBA CDN uses format: YYYYMMDD
    const dateFormatted = date.replace(/-/g, '');
    // Note: NBA CDN doesn't have historical scoreboard endpoint by date
    // We need to use a different approach - fetch schedule and find games
    const url = `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const schedule = JSON.parse(data);
          // Filter games by date
          const games = [];
          if (schedule.leagueSchedule?.gameDates) {
            for (const gameDate of schedule.leagueSchedule.gameDates) {
              if (gameDate.gameDate === date) {
                games.push(...(gameDate.games || []));
              }
            }
          }
          resolve(games);
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Fetch box score
function getBoxScore(gameId) {
  return new Promise((resolve, reject) => {
    https.get(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`, (res) => {
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

// Extract player stats
function extractPlayerStats(boxscore) {
  const stats = {};
  if (!boxscore.game) return stats;
  
  for (const teamKey of ['awayTeam', 'homeTeam']) {
    const team = boxscore.game[teamKey];
    if (!team?.players) continue;
    
    for (const player of team.players) {
      const name = `${player.firstName} ${player.familyName}`.trim();
      stats[name] = {
        rebounds: parseInt(player.statistics.reboundsTotal) || 0,
        assists: parseInt(player.statistics.assists) || 0,
        minutes: player.statistics.minutesCalculated || 'PT00M'
      };
    }
  }
  
  return stats;
}

// Normalize team names for matching
/**
 * Normalize team names for consistent matching
 * TheOddsAPI uses full names like "Oklahoma City Thunder"
 * NBA CDN uses nicknames like "Thunder"
 */
function normalizeTeam(name) {
  if (!name) return '';
  
  // Map full names to NBA CDN nicknames
  const teamMap = {
    'Oklahoma City Thunder': 'Thunder',
    'Los Angeles Lakers': 'Lakers',
    'Los Angeles Clippers': 'Clippers',
    'Golden State Warriors': 'Warriors',
    'Portland Trail Blazers': 'Trail Blazers',
    'New York Knicks': 'Knicks',
    'Brooklyn Nets': 'Nets',
    'Philadelphia 76ers': '76ers',
    'Boston Celtics': 'Celtics',
    'Toronto Raptors': 'Raptors',
    'Chicago Bulls': 'Bulls',
    'Cleveland Cavaliers': 'Cavaliers',
    'Detroit Pistons': 'Pistons',
    'Indiana Pacers': 'Pacers',
    'Milwaukee Bucks': 'Bucks',
    'Atlanta Hawks': 'Hawks',
    'Charlotte Hornets': 'Hornets',
    'Miami Heat': 'Heat',
    'Orlando Magic': 'Magic',
    'Washington Wizards': 'Wizards',
    'Dallas Mavericks': 'Mavericks',
    'Houston Rockets': 'Rockets',
    'Memphis Grizzlies': 'Grizzlies',
    'New Orleans Pelicans': 'Pelicans',
    'San Antonio Spurs': 'Spurs',
    'Denver Nuggets': 'Nuggets',
    'Minnesota Timberwolves': 'Timberwolves',
    'Utah Jazz': 'Jazz',
    'Phoenix Suns': 'Suns',
    'Sacramento Kings': 'Kings'
  };
  
  // Return mapped name or original if already in nickname format
  return teamMap[name] || name;
}

// Match game by teams and commence time (UTC)
function matchGame(oddsGame, nbaGames) {
  const oddsHome = normalizeTeam(oddsGame.homeTeam);
  const oddsAway = normalizeTeam(oddsGame.awayTeam);
  
  // Use commence time (UTC) instead of date field
  // TheOddsAPI commenceTime: "2025-10-22T02:00:00Z"
  // NBA gameDateTimeUTC: "2025-10-22T02:00:00Z"
  const oddsDate = oddsGame.commenceTime.split('T')[0];
  
  for (const game of nbaGames) {
    // NBA gameDateTimeUTC is like "2025-10-02T16:00:00Z"
    // Extract just the date part
    const nbaDate = game.gameDateTimeUTC?.split('T')[0]; // "2025-10-02"
    
    if (nbaDate !== oddsDate) {
      continue;
    }
    
    // NBA schedule format has homeTeam/awayTeam objects with teamName or teamTricode
    const nbaHome = normalizeTeam(game.homeTeam?.teamName || game.homeTeam?.teamTricode || '');
    const nbaAway = normalizeTeam(game.awayTeam?.teamName || game.awayTeam?.teamTricode || '');
    
    if (nbaHome === oddsHome && nbaAway === oddsAway) {
      return game.gameId;
    }
  }
  return null;
}

// Simple baseline model: season average vs line
function predictProp(playerAvg, line, odds) {
  if (!playerAvg || playerAvg <= 0) return null;
  
  // Assume stddev = 25% of average (rough estimate)
  const stdDev = Math.max(playerAvg * 0.25, 1.5);
  
  // Z-score
  const zScore = (playerAvg - line) / stdDev;
  
  // Convert to probability (simplified normal CDF approximation)
  const probOver = 0.5 + Math.min(Math.max(zScore * 0.2, -0.4), 0.4);
  
  // Odds to implied probability
  const impliedProb = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  
  // Edge
  const edge = probOver - impliedProb;
  
  return {
    probOver,
    impliedProb,
    edge,
    shouldBet: Math.abs(edge) > 0.05,
    pick: edge > 0.05 ? 'over' : edge < -0.05 ? 'under' : null
  };
}

// Grade a single bet
function gradeBet(pick, line, actual) {
  if (actual === line) return 'push';
  if (pick === 'over') return actual > line ? 'win' : 'loss';
  if (pick === 'under') return actual < line ? 'win' : 'loss';
  return null;
}

// Calculate returns (assuming -110 odds)
function calculateReturns(stake, result) {
  if (result === 'win') return stake * 1.91; // Get back stake + profit at -110
  if (result === 'loss') return 0;
  if (result === 'push') return stake;
  return 0;
}

// Main backtest
async function runBacktest() {
  console.log('� Processing games with historical odds...\n');
  
  // Build game ID lookup from all dates in our odds data
  const gameIdCache = {};
  const uniqueDates = [...new Set(historicalOdds.map(g => g.date))].sort();
  
  console.log(`� Fetching NBA schedule for ${uniqueDates.length} dates...\n`);
  
  console.log(`🔍 Fetching NBA schedule for ${uniqueDates.length} dates...\n`);
  
  // Fetch NBA schedule once
  let nbaSchedule;
  try {
    nbaSchedule = await getNBAScoreboardForDate(uniqueDates[0]); // This gets the full schedule
    console.log(`✅ Loaded NBA schedule\n`);
  } catch(e) {
    console.error('❌ Error fetching NBA schedule:', e.message);
    return;
  }
  
  const results = {
    rebounds: { picks: [], wins: 0, losses: 0, pushes: 0, totalStaked: 0, totalReturns: 0 },
    assists: { picks: [], wins: 0, losses: 0, pushes: 0, totalStaked: 0, totalReturns: 0 }
  };
  
  let gamesProcessed = 0;
  let gamesMatched = 0;
  let totalPicks = 0;
  
  // Process all games we have odds for (filter out future games)
  const completedGames = historicalOdds.filter(g => {
    const gameDate = new Date(g.commenceTime);
    return gameDate < new Date(); // Only completed games
  });
  
  console.log(`Found ${completedGames.length} completed games to backtest\n`);
  
  console.log(`Found ${completedGames.length} completed games to backtest\n`);
  
  // Fetch the full schedule to build game ID mapping
  console.log('🔍 Fetching full NBA schedule to map game IDs...\n');
  const scheduleUrl = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json';
  
  let allNBAGames = [];
  await new Promise((resolve, reject) => {
    https.get(scheduleUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const schedule = JSON.parse(data);
          if (schedule.leagueSchedule?.gameDates) {
            for (const dateEntry of schedule.leagueSchedule.gameDates) {
              allNBAGames.push(...(dateEntry.games || []));
            }
          }
          console.log(`✅ Loaded ${allNBAGames.length} NBA games from schedule\n`);
          resolve();
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
  
  for (const oddsGame of completedGames.slice(0, 100)) { // Process first 100 games
    gamesProcessed++;
    
    const gameDate = new Date(oddsGame.commenceTime);
    console.log(`\n[${gamesProcessed}] ${oddsGame.date} - ${oddsGame.awayTeam} @ ${oddsGame.homeTeam}`);
    
    // Try to find NBA game ID from schedule
    const gameId = matchGame(oddsGame, allNBAGames) || gameIdCache[`${oddsGame.date}|${oddsGame.awayTeam}|${oddsGame.homeTeam}`];
    
    if (!gameId) {
      console.log('  ⚠️  Could not match to NBA game ID');
      continue;
    }
    
    console.log(`  ✅ Matched to NBA game ${gameId}`);
    gamesMatched++;
    
    // Fetch box score
    let boxscore;
    try {
      boxscore = await getBoxScore(gameId);
    } catch(e) {
      console.log(`  ❌ Error fetching box score: ${e.message}`);
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    
    const actualStats = extractPlayerStats(boxscore);
    console.log(`  📊 Got stats for ${Object.keys(actualStats).length} players`);
    
    // Process props
    if (!oddsGame.odds?.bookmakers || oddsGame.odds.bookmakers.length === 0) {
      console.log('  ⚠️  No bookmaker odds');
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    
    const bookmaker = oddsGame.odds.bookmakers[0];
    let propCount = 0;
    
    for (const market of bookmaker.markets || []) {
      const propType = market.key === 'player_rebounds' ? 'rebounds' : 
                      market.key === 'player_assists' ? 'assists' : null;
      
      if (!propType || !market.outcomes) continue;
      
      // Group by player
      const playerProps = {};
      for (const outcome of market.outcomes) {
        const key = `${outcome.description}|${outcome.point}`;
        if (!playerProps[key]) {
          playerProps[key] = { player: outcome.description, line: outcome.point, over: null, under: null };
        }
        if (outcome.name === 'Over') playerProps[key].over = outcome.price;
        if (outcome.name === 'Under') playerProps[key].under = outcome.price;
      }
      
      // Make predictions and grade
      for (const prop of Object.values(playerProps)) {
        const actual = actualStats[prop.player]?.[propType];
        if (actual === undefined) continue;
        
        // For baseline: use simple league average (rebounds ~7, assists ~5)
        const leagueAvg = propType === 'rebounds' ? 7.0 : 5.0;
        
        // Check Over
        if (prop.over !== null) {
          const prediction = predictProp(leagueAvg, prop.line, prop.over);
          if (prediction && prediction.pick === 'over') {
            const result = gradeBet('over', prop.line, actual);
            const stake = 1.0;
            const returns = calculateReturns(stake, result);
            
            results[propType].picks.push({
              game: `${oddsGame.awayTeam} @ ${oddsGame.homeTeam}`,
              player: prop.player,
              pick: 'over',
              line: prop.line,
              actual,
              result,
              edge: prediction.edge
            });
            
            results[propType].totalStaked += stake;
            results[propType].totalReturns += returns;
            
            if (result === 'win') results[propType].wins++;
            else if (result === 'loss') results[propType].losses++;
            else results[propType].pushes++;
            
            propCount++;
            totalPicks++;
          }
        }
        
        // Check Under
        if (prop.under !== null) {
          const prediction = predictProp(leagueAvg, prop.line, prop.under);
          if (prediction && prediction.pick === 'under') {
            const result = gradeBet('under', prop.line, actual);
            const stake = 1.0;
            const returns = calculateReturns(stake, result);
            
            results[propType].picks.push({
              game: `${oddsGame.awayTeam} @ ${oddsGame.homeTeam}`,
              player: prop.player,
              pick: 'under',
              line: prop.line,
              actual,
              result,
              edge: prediction.edge
            });
            
            results[propType].totalStaked += stake;
            results[propType].totalReturns += returns;
            
            if (result === 'win') results[propType].wins++;
            else if (result === 'loss') results[propType].losses++;
            else results[propType].pushes++;
            
            propCount++;
            totalPicks++;
          }
        }
      }
    }
    
    console.log(`  📝 Generated ${propCount} picks`);
    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }
  
  // Print results
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 BACKTEST RESULTS');
  console.log('='.repeat(60) + '\n');
  
  console.log(`Games processed: ${gamesProcessed}`);
  console.log(`Games matched: ${gamesMatched}`);
  console.log(`Total picks: ${totalPicks}\n`);
  
  for (const [propType, stats] of Object.entries(results)) {
    if (stats.picks.length === 0) continue;
    
    const total = stats.wins + stats.losses;
    const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : '0.0';
    const netProfit = stats.totalReturns - stats.totalStaked;
    const roi = stats.totalStaked > 0 ? ((netProfit / stats.totalStaked) * 100).toFixed(1) : '0.0';
    
    const expected = propType === 'rebounds' ? 62.5 : 66.7;
    const diff = parseFloat(winRate) - expected;
    
    console.log(`${propType.toUpperCase()}:`);
    console.log(`  Record: ${stats.wins}-${stats.losses} (${winRate}%)`);
    console.log(`  Expected: ${expected}%`);
    console.log(`  Difference: ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`);
    console.log(`  Pushes: ${stats.pushes}`);
    console.log(`  Staked: ${stats.totalStaked.toFixed(1)}U`);
    console.log(`  Returns: ${stats.totalReturns.toFixed(2)}U`);
    console.log(`  Net: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}U`);
    console.log(`  ROI: ${roi}%`);
    console.log('');
  }
  
  console.log('\n💾 Saving detailed results...');
  const outputFile = path.join(__dirname, '../../data/nba/backtest-results-props.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`✅ Saved to ${outputFile}`);
}

runBacktest().catch(console.error);

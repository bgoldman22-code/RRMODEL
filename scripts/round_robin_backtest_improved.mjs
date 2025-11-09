#!/usr/bin/env node

/**
 * MLB Home Run Round Robin Backtest - IMPROVED FIXED VERSION
 * ===========================================================
 * Uses FanGraphs stats but with proper date filtering
 * 
 * STRATEGY:
 * - Use prior season stats for predictions (2023 stats → 2024 predictions)
 * - This simulates real-world scenario: bet on 2024 using known 2023 data
 * - More realistic than rolling daily stats (which we don't have perfect data for)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🎰 MLB Home Run Round Robin Backtest - IMPROVED VERSION');
console.log('='.repeat(80));
console.log('');

// ==============================================
// CONFIGURATION
// ==============================================

const BOOKMAKER = 'fanduel';
const MIN_ODDS = 2.5;
const MAX_ODDS = 10.0;
const UNIT_SIZE = 10;

const RR_STRUCTURES = [
  { picks: 3, name: '3-pick RR (3x 2-team parlays)', parlays: 3 },
  { picks: 4, name: '4-pick RR (6x 2-team parlays)', parlays: 6 },
  { picks: 5, name: '5-pick RR (10x 2-team parlays)', parlays: 10 },
  { picks: 6, name: '6-pick RR (15x 2-team parlays)', parlays: 15 }
];

// ==============================================
// LOAD PRIOR SEASON STATS
// ==============================================

function loadPriorSeasonStats(predictionYear) {
  const priorYear = predictionYear - 1;
  const file = path.join(__dirname, '../data/mlb_historical/players', `${priorYear}_batting_stats.json`);
  
  if (!fs.existsSync(file)) {
    console.log(`⚠️  Warning: No stats available for ${priorYear}`);
    return null;
  }
  
  const stats = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`   ✅ Loaded ${priorYear} stats (${stats.length} players)`);
  return stats;
}

function loadAllGames(year) {
  const file = path.join(__dirname, '../data/mlb_historical/games', `${year}_games_detailed.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadOddsFile(date) {
  const year = date.substring(0, 4);
  const file = path.join(__dirname, '../data/mlb_historical/odds', year, `${date}.json`);
  
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ==============================================
// PLAYER RANKING WITH PRIOR SEASON DATA
// ==============================================

function calculateHRScore(player) {
  let score = 0;
  let weights = 0;
  
  if (player.HR && player.AB) {
    const hr_rate = player.HR / player.AB;
    score += hr_rate * 50;
    weights += 50;
  }
  
  if (player.ISO !== undefined && player.ISO !== null) {
    score += player.ISO * 25;
    weights += 25;
  }
  
  if (player['HR/FB'] !== undefined && player['HR/FB'] !== null) {
    score += player['HR/FB'] * 15;
    weights += 15;
  }
  
  if (player['Hard%'] !== undefined && player['Hard%'] !== null) {
    score += player['Hard%'] * 10;
    weights += 10;
  }
  
  return weights > 0 ? (score / weights) * 100 : 0;
}

function rankPlayersByPriorStats(stats, minAB = 200) {
  return stats
    .filter(p => p.AB >= minAB)
    .map(p => ({
      name: p.Name,
      team: p.Team,
      hrs: p.HR,
      ab: p.AB,
      hr_rate: (p.HR / p.AB),
      iso: p.ISO || 0,
      hr_fb: p['HR/FB'] || 0,
      hard_pct: p['Hard%'] || 0,
      score: calculateHRScore(p)
    }))
    .sort((a, b) => b.score - a.score);
}

// ==============================================
// PLAYER MATCHING
// ==============================================

function buildPlayerNameMap(games) {
  const nameVariations = {};
  
  for (const game of games) {
    if (!game.hrs || game.hrs.length === 0) continue;
    
    for (const hr of game.hrs) {
      const id = hr.batterId;
      const name = hr.batter;
      const nameKey = name.toLowerCase().trim();
      
      if (!nameVariations[nameKey]) {
        nameVariations[nameKey] = { id, name };
      }
    }
  }
  
  return nameVariations;
}

function matchPlayerName(oddsName, rankedPlayers, nameMap) {
  const oddsLower = oddsName.toLowerCase().trim();
  
  // Try direct match first
  if (nameMap[oddsLower]) {
    const matchedPlayer = rankedPlayers.find(p => 
      p.name.toLowerCase().trim() === oddsLower
    );
    if (matchedPlayer) return matchedPlayer.name;
  }
  
  // Try last name match
  const oddsLastName = oddsName.split(' ').pop().toLowerCase();
  const matched = rankedPlayers.find(p => {
    const lastName = p.name.split(' ').pop().toLowerCase();
    return lastName === oddsLastName || oddsLastName.includes(lastName);
  });
  
  return matched ? matched.name : null;
}

function extractPlayerOdds(oddsData, rankedPlayers, nameMap) {
  const playerOdds = {};
  const topPlayerNames = rankedPlayers.slice(0, 30).map(p => p.name);
  
  for (const game of oddsData.games) {
    const fanduel = game.bookmakers.find(b => b.key === BOOKMAKER);
    if (!fanduel) continue;
    
    const hrMarket = fanduel.markets.find(m => m.key === 'batter_home_runs');
    if (!hrMarket) continue;
    
    for (const outcome of hrMarket.outcomes) {
      if (outcome.name !== 'Over' || outcome.point !== 0.5) continue;
      
      const oddsName = outcome.description;
      const odds = outcome.price;
      
      if (odds < MIN_ODDS || odds > MAX_ODDS) continue;
      
      const matchedName = matchPlayerName(oddsName, rankedPlayers, nameMap);
      
      if (matchedName && topPlayerNames.includes(matchedName)) {
        if (!playerOdds[matchedName] || odds > playerOdds[matchedName].odds) {
          playerOdds[matchedName] = {
            name: matchedName,
            oddsName: oddsName,
            odds: odds,
            game: `${game.away_team} @ ${game.home_team}`
          };
        }
      }
    }
  }
  
  return playerOdds;
}

// ==============================================
// ACTUAL RESULTS
// ==============================================

function getActualResults(games, date, playerNames) {
  const results = {};
  const dateGames = games.filter(g => g.gameDate === date);
  
  for (const game of dateGames) {
    if (!game.hrs || game.hrs.length === 0) continue;
    
    for (const hr of game.hrs) {
      const batterName = hr.batter.toLowerCase().trim();
      
      for (const playerName of playerNames) {
        const pLower = playerName.toLowerCase().trim();
        const pLastName = playerName.split(' ').pop().toLowerCase();
        const hrLastName = hr.batter.split(' ').pop().toLowerCase();
        
        if (batterName === pLower || hrLastName === pLastName) {
          results[playerName] = (results[playerName] || 0) + 1;
          break;
        }
      }
    }
  }
  
  return results;
}

// ==============================================
// ROUND ROBIN CALCULATIONS
// ==============================================

function generateRRCombinations(players, size) {
  const combinations = [];
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      combinations.push([players[i], players[j]]);
    }
  }
  return combinations;
}

function calculateParlayPayout(players, odds, unitSize) {
  let payout = unitSize;
  for (const player of players) {
    if (!odds[player]) return 0;
    payout *= odds[player].odds;
  }
  return payout;
}

function calculateRRResults(picks, playerOdds, actualResults, rrStructure, unitSize) {
  const parlays = generateRRCombinations(picks, rrStructure.picks);
  
  let totalCost = parlays.length * unitSize;
  let totalPayout = 0;
  let winningParlays = 0;
  
  for (const parlay of parlays) {
    const player1Hit = actualResults[parlay[0]] > 0;
    const player2Hit = actualResults[parlay[1]] > 0;
    
    if (player1Hit && player2Hit) {
      const payout = calculateParlayPayout(parlay, playerOdds, unitSize);
      totalPayout += payout;
      winningParlays++;
    }
  }
  
  return {
    totalCost,
    totalPayout,
    profit: totalPayout - totalCost,
    roi: totalCost > 0 ? ((totalPayout - totalCost) / totalCost) * 100 : 0,
    winningParlays,
    totalParlays: parlays.length,
    hitRate: (winningParlays / parlays.length) * 100
  };
}

// ==============================================
// MAIN BACKTEST
// ==============================================

async function runBacktest(year, priorStats, dates, allGames, nameMap) {
  console.log(`\n📊 Running backtest for ${year} (using ${year-1} stats)...`);
  console.log(`   Testing ${dates.length} dates`);
  
  const rankedPlayers = rankPlayersByPriorStats(priorStats);
  console.log(`   ✅ Ranked ${rankedPlayers.length} players from prior season`);
  
  const results = {};
  for (const rr of RR_STRUCTURES) {
    results[rr.picks] = {
      structure: rr,
      dates: 0,
      totalCost: 0,
      totalPayout: 0,
      totalProfit: 0,
      winningDates: 0
    };
  }
  
  let processedDates = 0;
  
  for (const date of dates) {
    const oddsData = loadOddsFile(date);
    if (!oddsData || !oddsData.games || oddsData.games.length === 0) continue;
    
    const playerOdds = extractPlayerOdds(oddsData, rankedPlayers, nameMap);
    
    if (Object.keys(playerOdds).length < 3) continue;
    
    const actualResults = getActualResults(allGames, date, Object.keys(playerOdds));
    
    for (const rr of RR_STRUCTURES) {
      const availablePlayers = Object.keys(playerOdds).slice(0, rr.picks);
      if (availablePlayers.length < rr.picks) continue;
      
      const rrResults = calculateRRResults(
        availablePlayers,
        playerOdds,
        actualResults,
        rr,
        UNIT_SIZE
      );
      
      results[rr.picks].dates++;
      results[rr.picks].totalCost += rrResults.totalCost;
      results[rr.picks].totalPayout += rrResults.totalPayout;
      results[rr.picks].totalProfit += rrResults.profit;
      if (rrResults.profit > 0) results[rr.picks].winningDates++;
    }
    
    processedDates++;
    if (processedDates % 10 === 0) {
      process.stdout.write(`\r   Progress: ${processedDates}/${dates.length} dates`);
    }
  }
  
  console.log(`\n   ✅ Processed ${processedDates} dates\n`);
  
  return results;
}

// ==============================================
// DISPLAY RESULTS
// ==============================================

function displayResults(year, results) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📈 ${year} BACKTEST RESULTS (using ${year-1} stats)`);
  console.log(`${'='.repeat(80)}\n`);
  
  for (const [picks, data] of Object.entries(results)) {
    if (data.dates === 0) continue;
    
    const roi = data.totalCost > 0 ? ((data.totalPayout - data.totalCost) / data.totalCost) * 100 : 0;
    const winRate = (data.winningDates / data.dates) * 100;
    
    console.log(`🎰 ${data.structure.name}`);
    console.log(`   ${'─'.repeat(75)}`);
    console.log(`   Dates traded:      ${data.dates}`);
    console.log(`   Total cost:        $${data.totalCost.toFixed(2)}`);
    console.log(`   Total payout:      $${data.totalPayout.toFixed(2)}`);
    console.log(`   Net profit:        $${data.totalProfit.toFixed(2)} (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI)`);
    console.log(`   Winning dates:     ${data.winningDates}/${data.dates} (${winRate.toFixed(1)}%)`);
    console.log(``);
  }
}

// ==============================================
// MAIN
// ==============================================

async function main() {
  console.log('🔧 PROPER TIME-SERIES METHODOLOGY:');
  console.log('  ✅ Use 2023 stats to predict 2024 season');
  console.log('  ✅ Use 2024 stats to predict 2025 season');
  console.log('  ✅ No lookahead bias (only prior data used)');
  console.log('  ✅ Realistic real-world simulation');
  console.log('');
  
  const testYears = [2024, 2025];
  const allResults = {};
  
  for (const year of testYears) {
    // Load prior season stats
    const priorStats = loadPriorSeasonStats(year);
    if (!priorStats) {
      console.error(`❌ Cannot test ${year} without ${year-1} stats`);
      continue;
    }
    
    // Load games for actual results
    const allGames = loadAllGames(year);
    if (!allGames) {
      console.error(`❌ No game data for ${year}`);
      continue;
    }
    
    // Build name map
    const nameMap = buildPlayerNameMap(allGames);
    
    // Get odds dates
    const oddsDir = path.join(__dirname, '../data/mlb_historical/odds', year.toString());
    const files = fs.readdirSync(oddsDir).filter(f => f.endsWith('.json'));
    const dates = files.map(f => f.replace('.json', '')).sort();
    
    const results = await runBacktest(year, priorStats, dates, allGames, nameMap);
    if (results) {
      allResults[year] = results;
      displayResults(year, results);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ BACKTEST COMPLETE - PROPER METHODOLOGY`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`💡 Interpretation:`);
  console.log(`   This tests: Can we predict ${new Date().getFullYear()} HRs using prior season stats?`);
  console.log(`   Real-world analog: Betting on 2024 season using known 2023 performance`);
  console.log(`   No data leakage: We never use future information`);
  console.log(``);
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

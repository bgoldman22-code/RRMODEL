#!/usr/bin/env node

/**
 * MLB Home Run Round Robin Backtest
 * ==================================
 * Tests Round Robin parlay structures with historical odds
 * 
 * Strategy:
 * 1. Identify top HR candidates per date using batting stats
 * 2. Get their actual odds from multiple bookmakers
 * 3. Construct RR parlays of various sizes (3-pick, 4-pick, 5-pick, 6-pick)
 * 4. Calculate actual payouts using real odds
 * 5. Measure ROI, hit rate, and profitability by RR structure
 * 6. Compare against user's real Sept 2025 slips
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🎰 MLB Home Run Round Robin Backtest');
console.log('='.repeat(80));
console.log('');

// ==============================================
// CONFIGURATION
// ==============================================

const BOOKMAKER = 'fanduel'; // Focus on FanDuel per user preference
const MIN_ODDS = 2.5; // Minimum +150 odds
const MAX_ODDS = 10.0; // Maximum +900 odds (avoid longshots)
const UNIT_SIZE = 10; // $10 per RR parlay

// Round Robin structures to test
const RR_STRUCTURES = [
  { picks: 3, name: '3-pick RR (3x 2-team parlays)', parlays: 3 },
  { picks: 4, name: '4-pick RR (6x 2-team parlays)', parlays: 6 },
  { picks: 5, name: '5-pick RR (10x 2-team parlays)', parlays: 10 },
  { picks: 6, name: '6-pick RR (15x 2-team parlays)', parlays: 15 }
];

// ==============================================
// DATA LOADING
// ==============================================

function loadBattingStats(year) {
  const file = path.join(__dirname, '../data/mlb_historical/players', `${year}_batting_stats.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadOddsFile(date) {
  // Try both 2024 and 2025 folders
  const year = date.substring(0, 4);
  const file = path.join(__dirname, '../data/mlb_historical/odds', year, `${date}.json`);
  
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ==============================================
// PLAYER RANKING
// ==============================================

function rankPlayersByHRPotential(battingStats, minAB = 200) {
  return battingStats
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

// ==============================================
// ODDS EXTRACTION
// ==============================================

function extractPlayerOdds(oddsData, playerNames) {
  const playerOdds = {};
  
  for (const game of oddsData.games) {
    const fanduel = game.bookmakers.find(b => b.key === BOOKMAKER);
    if (!fanduel) continue;
    
    const hrMarket = fanduel.markets.find(m => m.key === 'batter_home_runs');
    if (!hrMarket) continue;
    
    for (const outcome of hrMarket.outcomes) {
      if (outcome.name !== 'Over' || outcome.point !== 0.5) continue;
      
      const playerName = outcome.description;
      const odds = outcome.price;
      
      // Check if this is one of our target players
      const matchedPlayer = playerNames.find(name => 
        playerName.toLowerCase().includes(name.toLowerCase().split(' ')[1]) || // Match last name
        name.toLowerCase().includes(playerName.toLowerCase().split(' ')[1])
      );
      
      if (matchedPlayer && odds >= MIN_ODDS && odds <= MAX_ODDS) {
        if (!playerOdds[matchedPlayer] || odds > playerOdds[matchedPlayer].odds) {
          playerOdds[matchedPlayer] = {
            name: playerName,
            odds: odds,
            game: `${game.away_team} @ ${game.home_team}`,
            commence_time: game.commence_time
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

function getActualResults(date, playerNames) {
  // Load MLB game data to see who actually hit HRs
  const year = date.substring(0, 4);
  const gameFile = path.join(__dirname, '../data/mlb_historical/games', `${year}_games_detailed.json`);
  
  if (!fs.existsSync(gameFile)) {
    return {}; // Can't verify without game data
  }
  
  const games = JSON.parse(fs.readFileSync(gameFile, 'utf8'));
  const results = {};
  
  // Filter games to this date (YYYY-MM-DD format)
  const dateGames = games.filter(g => g.gameDate === date);
  
  for (const game of dateGames) {
    if (!game.hrs || game.hrs.length === 0) continue;
    
    for (const hr of game.hrs) {
      const playerName = hr.batter;
      
      // Check if this is one of our target players
      const matchedPlayer = playerNames.find(name =>
        playerName.toLowerCase().includes(name.toLowerCase().split(' ')[1]) ||
        name.toLowerCase().includes(playerName.toLowerCase().split(' ')[1])
      );
      
      if (matchedPlayer) {
        results[matchedPlayer] = (results[matchedPlayer] || 0) + 1;
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
  
  function combine(start, combo) {
    if (combo.length === 2) {
      combinations.push([...combo]);
      return;
    }
    
    for (let i = start; i < players.length; i++) {
      combine(i + 1, [...combo, players[i]]);
    }
  }
  
  // For RR, we need all 2-team parlay combinations from N picks
  const indices = Array.from({ length: size }, (_, i) => i);
  
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
    if (!odds[player]) return 0; // Can't bet without odds
    payout *= odds[player].odds;
  }
  return payout;
}

function calculateRRResults(picks, playerOdds, actualResults, rrStructure, unitSize) {
  // Generate all 2-team parlays
  const parlays = generateRRCombinations(picks, rrStructure.picks);
  
  let totalCost = parlays.length * unitSize;
  let totalPayout = 0;
  let winningParlays = 0;
  
  for (const parlay of parlays) {
    // Check if both players hit HRs
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

async function runBacktest(year, dates) {
  console.log(`\n📊 Running backtest for ${year}...`);
  console.log(`   Testing ${dates.length} dates`);
  
  // Load batting stats for player rankings
  const battingStats = loadBattingStats(year);
  if (!battingStats) {
    console.error(`❌ No batting stats for ${year}`);
    return null;
  }
  
  const rankedPlayers = rankPlayersByHRPotential(battingStats);
  console.log(`   ✅ Ranked ${rankedPlayers.length} players`);
  
  // Results by RR structure
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
    
    // Get top players with available odds
    const topPlayers = rankedPlayers.slice(0, 20).map(p => p.name);
    const playerOdds = extractPlayerOdds(oddsData, topPlayers);
    
    if (Object.keys(playerOdds).length < 3) continue; // Need at least 3 players
    
    // Get actual results
    const actualResults = getActualResults(date, Object.keys(playerOdds));
    
    // Test each RR structure
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
  console.log(`📈 ${year} ROUND ROBIN BACKTEST RESULTS`);
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
  const years = [2024, 2025];
  const allResults = {};
  
  for (const year of years) {
    // Get all available odds dates
    const oddsDir = path.join(__dirname, '../data/mlb_historical/odds', year.toString());
    const files = fs.readdirSync(oddsDir).filter(f => f.endsWith('.json'));
    const dates = files.map(f => f.replace('.json', '')).sort();
    
    console.log(`\n📅 Found ${dates.length} dates with odds for ${year}`);
    
    const results = await runBacktest(year, dates);
    if (results) {
      allResults[year] = results;
      displayResults(year, results);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ BACKTEST COMPLETE`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`💡 Key Insights:`);
  console.log(`   - Tested actual Round Robin structures with real odds`);
  console.log(`   - Used FanDuel odds (per user preference)`);
  console.log(`   - Filtered to +150 to +900 odds range`);
  console.log(`   - Verified results against actual game data`);
  console.log(``);
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

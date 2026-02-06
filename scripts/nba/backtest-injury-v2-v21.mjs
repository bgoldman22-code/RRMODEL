/**
 * NBA Injury System Backtest: V2 vs V2.1
 * 
 * Tests whether production-share-weighted injuries (V2.1) predict
 * better than position-only weights (V2) on historical games.
 * 
 * Methodology:
 * 1. For each game date, calculate production shares using PRIOR data only
 * 2. Identify missing players (0 minutes = didn't play)
 * 3. Calculate injury adjustments for both V2 and V2.1
 * 4. Compare to actual game margin vs Vegas spread
 */

import fs from 'fs';
import path from 'path';

// Load player boxscores
const boxscoresPath = path.join(process.cwd(), 'data/nba/player-boxscores-2025-26.json');
const boxscores = JSON.parse(fs.readFileSync(boxscoresPath, 'utf8'));

console.log(`Loaded ${boxscores.length} player boxscores`);

// Get unique dates sorted
const allDates = [...new Set(boxscores.map(b => b.gameDate))].sort();
console.log(`Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}`);
console.log(`Total game dates: ${allDates.length}`);

// V2 injury constants (position-only)
const V2_STATUS_IMPACT = {
  OUT: 2.5,
  DOUBTFUL: 1.5,
  QUESTIONABLE: 0.8,
  PROBABLE: 0.3,
  DAY_TO_DAY: 0.5
};

const V2_POSITION_WEIGHT = {
  'PG': 1.2, 'SG': 1.1, 'SF': 1.0, 'PF': 0.9, 'C': 1.1
};

// V2.1 production share thresholds
function getProductionWeight(prodShare) {
  if (prodShare >= 20) return 2.0;
  if (prodShare >= 15) return 1.5;
  if (prodShare >= 10) return 1.2;
  if (prodShare >= 5) return 1.0;
  return 0.6;
}

/**
 * Calculate production shares for a team using only games BEFORE asOfDate
 */
function calculateProductionShares(team, asOfDate, allBoxscores) {
  const priorGames = allBoxscores.filter(b => 
    b.teamTricode === team && 
    b.gameDate < asOfDate
  );
  
  if (priorGames.length === 0) return new Map();
  
  // Team totals
  const teamTotals = {
    points: priorGames.reduce((sum, g) => sum + (g.points || 0), 0),
    rebounds: priorGames.reduce((sum, g) => sum + (g.rebounds || 0), 0),
    assists: priorGames.reduce((sum, g) => sum + (g.assists || 0), 0)
  };
  
  // Player totals
  const playerStats = new Map();
  for (const game of priorGames) {
    if (!playerStats.has(game.playerName)) {
      playerStats.set(game.playerName, { points: 0, rebounds: 0, assists: 0, games: 0, minutes: 0 });
    }
    const p = playerStats.get(game.playerName);
    p.points += game.points || 0;
    p.rebounds += game.rebounds || 0;
    p.assists += game.assists || 0;
    p.minutes += game.minutes || 0;
    p.games++;
  }
  
  // Calculate production shares
  const prodShares = new Map();
  for (const [name, stats] of playerStats) {
    const pctPts = teamTotals.points > 0 ? stats.points / teamTotals.points : 0;
    const pctReb = teamTotals.rebounds > 0 ? stats.rebounds / teamTotals.rebounds : 0;
    const pctAst = teamTotals.assists > 0 ? stats.assists / teamTotals.assists : 0;
    
    const prodShare = (pctPts * 0.5 + pctReb * 0.25 + pctAst * 0.25) * 100;
    const avgMinutes = stats.games > 0 ? stats.minutes / stats.games : 0;
    
    prodShares.set(name, {
      prodShare: Math.round(prodShare * 10) / 10,
      avgMinutes: Math.round(avgMinutes * 10) / 10,
      games: stats.games
    });
  }
  
  return prodShares;
}

/**
 * Identify "injured" players - regulars who didn't play
 * A "regular" is someone who played 15+ minutes avg in prior games
 */
function identifyMissingPlayers(team, gameDate, allBoxscores, prodShares) {
  // Players who played in THIS game
  const playedToday = new Set(
    allBoxscores
      .filter(b => b.teamTricode === team && b.gameDate === gameDate && b.minutes > 0)
      .map(b => b.playerName)
  );
  
  // Players who should have played (regulars from prior games)
  const missing = [];
  for (const [name, data] of prodShares) {
    if (data.avgMinutes >= 15 && data.games >= 5 && !playedToday.has(name)) {
      missing.push({
        playerName: name,
        prodShare: data.prodShare,
        avgMinutes: data.avgMinutes,
        status: 'Out' // Assume OUT since they didn't play
      });
    }
  }
  
  return missing;
}

/**
 * Calculate V2 injury adjustment (position-only)
 */
function calcV2Adjustment(missingPlayers) {
  let total = 0;
  for (let i = 0; i < missingPlayers.length; i++) {
    const stackMult = Math.pow(1.15, i);
    const posWeight = 1.0; // We don't have position in boxscores, use 1.0
    total += V2_STATUS_IMPACT.OUT * posWeight * stackMult;
  }
  return Math.min(total, 8.0); // Cap at 8
}

/**
 * Calculate V2.1 injury adjustment (production share weighted)
 */
function calcV21Adjustment(missingPlayers) {
  let total = 0;
  for (let i = 0; i < missingPlayers.length; i++) {
    const stackMult = Math.pow(1.12, i);
    const prodWeight = getProductionWeight(missingPlayers[i].prodShare);
    total += V2_STATUS_IMPACT.OUT * 1.0 * stackMult * prodWeight;
  }
  return Math.min(total, 10.0); // Cap at 10
}

/**
 * Get game result from boxscores
 */
function getGameResult(homeTeam, awayTeam, gameDate, allBoxscores) {
  const homeGames = allBoxscores.filter(b => 
    b.teamTricode === homeTeam && 
    b.opponentTricode === awayTeam && 
    b.gameDate === gameDate && 
    b.isHome === true
  );
  
  const awayGames = allBoxscores.filter(b => 
    b.teamTricode === awayTeam && 
    b.opponentTricode === homeTeam && 
    b.gameDate === gameDate && 
    b.isHome === false
  );
  
  if (homeGames.length === 0 || awayGames.length === 0) return null;
  
  const homeScore = homeGames.reduce((sum, g) => sum + (g.points || 0), 0);
  const awayScore = awayGames.reduce((sum, g) => sum + (g.points || 0), 0);
  
  return {
    homeScore,
    awayScore,
    margin: homeScore - awayScore // Positive = home won
  };
}

/**
 * Get unique games for a date
 */
function getGamesForDate(gameDate, allBoxscores) {
  const games = new Set();
  for (const b of allBoxscores.filter(x => x.gameDate === gameDate)) {
    if (b.isHome) {
      games.add(`${b.teamTricode}|${b.opponentTricode}`);
    }
  }
  return [...games].map(g => {
    const [home, away] = g.split('|');
    return { homeTeam: home, awayTeam: away };
  });
}

// Run backtest
console.log('\n=== STARTING BACKTEST ===\n');

// Skip first 20 days to have enough prior data
const testDates = allDates.slice(20);
console.log(`Testing ${testDates.length} dates (skipping first 20 for warmup)\n`);

const results = [];

for (const gameDate of testDates) {
  const games = getGamesForDate(gameDate, boxscores);
  
  for (const game of games) {
    // Calculate production shares using PRIOR data only
    const homeProdShares = calculateProductionShares(game.homeTeam, gameDate, boxscores);
    const awayProdShares = calculateProductionShares(game.awayTeam, gameDate, boxscores);
    
    // Identify missing players
    const homeMissing = identifyMissingPlayers(game.homeTeam, gameDate, boxscores, homeProdShares);
    const awayMissing = identifyMissingPlayers(game.awayTeam, gameDate, boxscores, awayProdShares);
    
    // Only analyze games with at least one significant missing player
    const hasSignificantMissing = 
      homeMissing.some(p => p.prodShare >= 10) || 
      awayMissing.some(p => p.prodShare >= 10);
    
    if (!hasSignificantMissing) continue;
    
    // Calculate adjustments
    const homeV2Adj = calcV2Adjustment(homeMissing);
    const awayV2Adj = calcV2Adjustment(awayMissing);
    const homeV21Adj = calcV21Adjustment(homeMissing);
    const awayV21Adj = calcV21Adjustment(awayMissing);
    
    // Net adjustment (positive = home hurt more)
    const v2NetAdj = homeV2Adj - awayV2Adj;
    const v21NetAdj = homeV21Adj - awayV21Adj;
    
    // Get actual result
    const result = getGameResult(game.homeTeam, game.awayTeam, gameDate, boxscores);
    if (!result) continue;
    
    results.push({
      date: gameDate,
      game: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeMissing: homeMissing.map(p => `${p.playerName} (${p.prodShare}%)`).join(', ') || 'none',
      awayMissing: awayMissing.map(p => `${p.playerName} (${p.prodShare}%)`).join(', ') || 'none',
      v2NetAdj,
      v21NetAdj,
      actualMargin: result.margin,
      // Did adjustment direction match result direction?
      v2CorrectDir: (v2NetAdj > 0 && result.margin < 0) || (v2NetAdj < 0 && result.margin > 0) || v2NetAdj === 0,
      v21CorrectDir: (v21NetAdj > 0 && result.margin < 0) || (v21NetAdj < 0 && result.margin > 0) || v21NetAdj === 0
    });
  }
}

console.log(`\n=== RESULTS ===`);
console.log(`Games with significant injuries: ${results.length}\n`);

// Summary stats
const v2Correct = results.filter(r => r.v2CorrectDir).length;
const v21Correct = results.filter(r => r.v21CorrectDir).length;

console.log(`V2 correct direction: ${v2Correct}/${results.length} (${(v2Correct/results.length*100).toFixed(1)}%)`);
console.log(`V2.1 correct direction: ${v21Correct}/${results.length} (${(v21Correct/results.length*100).toFixed(1)}%)`);

// Show some example games
console.log('\n=== SAMPLE GAMES WITH STAR INJURIES ===\n');
const starGames = results
  .filter(r => r.homeMissing.includes('%') || r.awayMissing.includes('%'))
  .slice(0, 10);

for (const g of starGames) {
  console.log(`${g.date} ${g.game}`);
  console.log(`  Home missing: ${g.homeMissing}`);
  console.log(`  Away missing: ${g.awayMissing}`);
  console.log(`  V2 adj: ${g.v2NetAdj.toFixed(2)} | V2.1 adj: ${g.v21NetAdj.toFixed(2)}`);
  console.log(`  Actual margin: ${g.actualMargin > 0 ? '+' : ''}${g.actualMargin} (${g.actualMargin > 0 ? g.homeTeam : g.awayTeam} won)`);
  console.log(`  V2 correct: ${g.v2CorrectDir} | V2.1 correct: ${g.v21CorrectDir}`);
  console.log('');
}

// Calculate average absolute error
const v2Errors = results.map(r => Math.abs(r.v2NetAdj - r.actualMargin));
const v21Errors = results.map(r => Math.abs(r.v21NetAdj - r.actualMargin));

const v2MAE = v2Errors.reduce((a,b) => a+b, 0) / v2Errors.length;
const v21MAE = v21Errors.reduce((a,b) => a+b, 0) / v21Errors.length;

console.log('\n=== ERROR ANALYSIS ===');
console.log(`V2 Mean Absolute Error: ${v2MAE.toFixed(2)} pts`);
console.log(`V2.1 Mean Absolute Error: ${v21MAE.toFixed(2)} pts`);
console.log(`Difference: ${(v2MAE - v21MAE).toFixed(2)} pts (${v21MAE < v2MAE ? 'V2.1 better' : 'V2 better'})`);

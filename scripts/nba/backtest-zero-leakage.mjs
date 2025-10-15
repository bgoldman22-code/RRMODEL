#!/usr/bin/env node

/**
 * Zero-Leakage NBA Backtest
 * 
 * Measures:
 * 1. MAE (Mean Absolute Error) on spread predictions
 * 2. Moneyline win % (betting performance)
 * 3. Baseline vs RCI-adjusted comparison
 * 
 * Zero Leakage Design:
 * - Only uses games BEFORE target date
 * - RCI fixed at season start
 * - Chemistry decay based on actual games played
 * - No future data ever
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

import { applyRCIAdjustment, getRCISummary } from '../../netlify/functions/_lib/nba/rci-adjustments.mjs';

// Load models (same as production)
const MODELS_PATH = '../../netlify/functions/_lib/nba/models-inline.mjs';
const { SPREAD_MODEL, TOTAL_MODEL } = await import(MODELS_PATH);

console.log('🏀 NBA Zero-Leakage Backtest\n');
console.log('='.repeat(70));

// Load 2024-25 games
const gamesPath = join(projectRoot, 'data/nba/games/games_2024_25.json');
let allGames;

try {
  allGames = JSON.parse(readFileSync(gamesPath, 'utf-8'));
  console.log(`\n✅ Loaded ${allGames.length} games from 2024-25 season`);
} catch (error) {
  console.error('❌ Error loading games:', error.message);
  console.log('\n💡 Make sure data/nba/games/games_2024_25.json exists');
  console.log('   This should contain all 2024-25 games with final scores');
  process.exit(1);
}

// Load RCI data (season start values - fixed throughout season)
// For 2024-25 backtest, use PROPER 2024-25 RCI calculated from 2023-24 rosters
const rciPath = join(projectRoot, 'data/nba/rosters/archive/rosters_with_rci_2024_25.json');
let seasonStartRCI = {};

try {
  const rciDataRaw = JSON.parse(readFileSync(rciPath, 'utf-8'));
  const rciRosters = rciDataRaw.rosters || rciDataRaw.teams || rciDataRaw; // Handle archive format
  
  // Convert to lookup by team abbreviation
  rciRosters.forEach(team => {
    const abbr = team.abbreviation || team.team;
    seasonStartRCI[abbr] = team.rci;
  });
  
  console.log(`✅ Loaded RCI for ${Object.keys(seasonStartRCI).length} teams`);
  console.log(`✅ Using PROPER 2024-25 RCI calculated from 2023-24 rosters`);
  console.log(`   Season: ${rciDataRaw.season}, Previous: ${rciDataRaw.previous_season}`);
} catch (error) {
  console.log('⚠️  No RCI data found - running baseline only');
  console.error(error.message);
}

console.log('\n' + '='.repeat(70));

/**
 * Calculate advanced stats from games (same as production)
 */
function calculateAdvancedStats(games, teamId, lastN = 10) {
  const teamGames = games
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .slice(-lastN);
  
  if (teamGames.length === 0) {
    return {
      games: 0,
      offRtg: 110,
      defRtg: 110,
      netRtg: 0,
      pace: 98,
    };
  }
  
  let totalPoints = 0;
  let totalAllowed = 0;
  let totalPossessions = 0;
  
  teamGames.forEach(game => {
    const isHome = game.homeTeamId === teamId;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    
    // Estimate possessions from actual stats
    const teamStats = isHome ? game.homeStats : game.awayStats;
    const fga = teamStats.fga || 85;
    const fta = teamStats.fta || 20;
    const to = teamStats.turnovers || 14;
    const offReb = teamStats.offRebounds || 10;
    
    // More accurate possession estimate
    const possessions = fga - offReb + to + 0.44 * fta;
    
    totalPoints += teamScore;
    totalAllowed += oppScore;
    totalPossessions += possessions;
  });
  
  const avgPoints = totalPoints / teamGames.length;
  const avgAllowed = totalAllowed / teamGames.length;
  const avgPoss = totalPossessions / teamGames.length;
  
  return {
    games: teamGames.length,
    offRtg: (avgPoints / avgPoss) * 100,
    defRtg: (avgAllowed / avgPoss) * 100,
    netRtg: ((avgPoints - avgAllowed) / avgPoss) * 100,
    pace: avgPoss,
  };
}

/**
 * Build features (simplified for backtest)
 */
function buildFeatures(homeStats, awayStats) {
  return [
    homeStats.offRtg - awayStats.offRtg,
    homeStats.defRtg - awayStats.defRtg,
    homeStats.netRtg - awayStats.netRtg,
    homeStats.pace - awayStats.pace,
    homeStats.offRtg,
    awayStats.defRtg,
  ];
}

/**
 * Predict spread (simplified model)
 */
function predictSpread(homeStats, awayStats) {
  const netRtgDiff = homeStats.netRtg - awayStats.netRtg;
  const homeAdv = 3.5; // Home court advantage
  
  return netRtgDiff * 0.35 + homeAdv; // Simple conversion
}

/**
 * Zero-leakage backtest for single game
 */
function backtestGame(game, useRCI = false) {
  const targetDate = new Date(game.date);
  
  // CRITICAL: Only use games BEFORE target date
  const pastGames = allGames.filter(g => new Date(g.date) < targetDate);
  
  if (pastGames.length === 0) {
    return null; // Skip first games of season
  }
  
  // Get team IDs and abbreviations
  const homeId = game.homeTeamId;
  const awayId = game.awayTeamId;
  const homeTeam = game.homeTeam;
  const awayTeam = game.awayTeam;
  
  // Calculate stats from past games only
  const homeL10Raw = calculateAdvancedStats(pastGames, homeId, 10);
  const awayL10Raw = calculateAdvancedStats(pastGames, awayId, 10);
  
  // Need minimum games
  if (homeL10Raw.games < 3 || awayL10Raw.games < 3) {
    return null;
  }
  
  let homeL10 = homeL10Raw;
  let awayL10 = awayL10Raw;
  
  // Apply RCI if requested
  if (useRCI && seasonStartRCI[homeTeam] && seasonStartRCI[awayTeam]) {
    // Count games played BEFORE target date
    const homeGamesPlayed = pastGames.filter(g => 
      g.homeTeamId === homeId || g.awayTeamId === homeId
    ).length;
    
    const awayGamesPlayed = pastGames.filter(g => 
      g.homeTeamId === awayId || g.awayTeamId === awayId
    ).length;
    
    homeL10 = applyRCIAdjustment(homeL10Raw, homeTeam, homeGamesPlayed);
    awayL10 = applyRCIAdjustment(awayL10Raw, awayTeam, awayGamesPlayed);
  }
  
  // Predict spread
  const predictedSpread = predictSpread(homeL10, awayL10);
  
  // Get actual result
  const actualHomeScore = game.homeScore;
  const actualAwayScore = game.awayScore;
  const actualSpread = actualHomeScore - actualAwayScore;
  
  // Calculate error
  const error = Math.abs(predictedSpread - actualSpread);
  
  // Moneyline prediction (positive spread = home favored)
  const predictedWinner = predictedSpread > 0 ? 'home' : 'away';
  const actualWinner = actualSpread > 0 ? 'home' : 'away';
  const correct = predictedWinner === actualWinner;
  
  return {
    game: `${awayTeam} @ ${homeTeam}`,
    date: game.date,
    predicted: predictedSpread.toFixed(1),
    actual: actualSpread,
    error: error.toFixed(1),
    predictedWinner,
    actualWinner,
    correct,
    homeGames: homeL10.games,
    awayGames: awayL10.games,
  };
}

/**
 * Run full backtest
 */
async function runBacktest() {
  console.log('\n🔬 Running Backtest...\n');
  
  // Sort games by date
  const sortedGames = allGames.sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  console.log(`Testing on ${sortedGames.length} games from 2024-25 season`);
  console.log('Date range:', sortedGames[0]?.date, 'to', sortedGames[sortedGames.length - 1]?.date);
  
  // Test both baseline and RCI
  const baselineResults = [];
  const rciResults = [];
  
  for (const game of sortedGames) {
    // Baseline (no RCI)
    const baselineResult = backtestGame(game, false);
    if (baselineResult) baselineResults.push(baselineResult);
    
    // RCI-adjusted
    if (Object.keys(seasonStartRCI).length > 0) {
      const rciResult = backtestGame(game, true);
      if (rciResult) rciResults.push(rciResult);
    }
  }
  
  console.log(`\n✅ Completed ${baselineResults.length} predictions`);
  
  // Calculate metrics
  console.log('\n' + '='.repeat(70));
  console.log('📊 BASELINE MODEL (No RCI)\n');
  
  const baselineMAE = baselineResults.reduce((sum, r) => sum + parseFloat(r.error), 0) / baselineResults.length;
  const baselineCorrect = baselineResults.filter(r => r.correct).length;
  const baselineWinPct = (baselineCorrect / baselineResults.length) * 100;
  
  console.log(`MAE (Spread):        ${baselineMAE.toFixed(3)} points`);
  console.log(`Moneyline Accuracy:  ${baselineCorrect}/${baselineResults.length} (${baselineWinPct.toFixed(1)}%)`);
  
  if (rciResults.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 RCI-ADJUSTED MODEL\n');
    
    const rciMAE = rciResults.reduce((sum, r) => sum + parseFloat(r.error), 0) / rciResults.length;
    const rciCorrect = rciResults.filter(r => r.correct).length;
    const rciWinPct = (rciCorrect / rciResults.length) * 100;
    
    console.log(`MAE (Spread):        ${rciMAE.toFixed(3)} points`);
    console.log(`Moneyline Accuracy:  ${rciCorrect}/${rciResults.length} (${rciWinPct.toFixed(1)}%)`);
    
    console.log('\n' + '='.repeat(70));
    console.log('📈 IMPROVEMENT\n');
    
    const maeImprovement = baselineMAE - rciMAE;
    const maeImprovementPct = (maeImprovement / baselineMAE) * 100;
    const winPctImprovement = rciWinPct - baselineWinPct;
    
    console.log(`MAE Improvement:     ${maeImprovement.toFixed(3)} points (${maeImprovementPct.toFixed(1)}%)`);
    console.log(`Win% Improvement:    ${winPctImprovement.toFixed(1)} percentage points`);
    
    if (maeImprovement > 0) {
      console.log('\n✅ RCI system improves predictions!');
    } else {
      console.log('\n⚠️  RCI system does not improve predictions - may need parameter tuning');
    }
  }
  
  // Show sample predictions
  console.log('\n' + '='.repeat(70));
  console.log('📋 Sample Predictions (First 10 Games)\n');
  
  baselineResults.slice(0, 10).forEach((r, i) => {
    const rci = rciResults[i];
    const status = r.correct ? '✅' : '❌';
    
    console.log(`${i + 1}. ${r.game} (${r.date})`);
    console.log(`   Baseline: ${r.predicted} → Actual: ${r.actual} → Error: ${r.error} ${status}`);
    if (rci) {
      const rciStatus = rci.correct ? '✅' : '❌';
      console.log(`   RCI:      ${rci.predicted} → Actual: ${rci.actual} → Error: ${rci.error} ${rciStatus}`);
    }
  });
  
  // Early season vs late season breakdown
  if (baselineResults.length >= 40) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 Early Season (Games 1-20) vs Late Season (Games 21+)\n');
    
    const earlyBaseline = baselineResults.slice(0, 20);
    const lateBaseline = baselineResults.slice(20);
    
    const earlyMAE = earlyBaseline.reduce((sum, r) => sum + parseFloat(r.error), 0) / earlyBaseline.length;
    const lateMAE = lateBaseline.reduce((sum, r) => sum + parseFloat(r.error), 0) / lateBaseline.length;
    
    console.log('BASELINE:');
    console.log(`  Early MAE: ${earlyMAE.toFixed(3)}`);
    console.log(`  Late MAE:  ${lateMAE.toFixed(3)}`);
    
    if (rciResults.length >= 40) {
      const earlyRCI = rciResults.slice(0, 20);
      const lateRCI = rciResults.slice(20);
      
      const earlyRCIMAE = earlyRCI.reduce((sum, r) => sum + parseFloat(r.error), 0) / earlyRCI.length;
      const lateRCIMAE = lateRCI.reduce((sum, r) => sum + parseFloat(r.error), 0) / lateRCI.length;
      
      console.log('\nRCI-ADJUSTED:');
      console.log(`  Early MAE: ${earlyRCIMAE.toFixed(3)} (${((earlyMAE - earlyRCIMAE) / earlyMAE * 100).toFixed(1)}% better)`);
      console.log(`  Late MAE:  ${lateRCIMAE.toFixed(3)} (${((lateMAE - lateRCIMAE) / lateMAE * 100).toFixed(1)}% better)`);
      
      console.log('\n💡 RCI should have bigger impact early season (chemistry still forming)');
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Backtest Complete\n');
  
  console.log('🔍 Zero-Leakage Validation:');
  console.log('  ✅ Only used games before target date');
  console.log('  ✅ RCI fixed at season start');
  console.log('  ✅ Chemistry decay based on actual games played');
  console.log('  ✅ No future data leaked');
  
  console.log('\n📌 Next Steps:');
  console.log('  1. If MAE improved: RCI system validated ✅');
  console.log('  2. If MAE same/worse: Tune ALPHA parameters 🔧');
  console.log('  3. Run parameter grid search for optimization');
  console.log('  4. Add injury layer when historical data available');
}

// Run backtest
runBacktest().catch(console.error);

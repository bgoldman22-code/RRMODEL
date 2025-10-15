#!/usr/bin/env node

/**
 * RCI Parameter Grid Search
 * 
 * Tests aggressive parameter ranges to find optimal RCI coefficients:
 * - ALPHA_OFF: Impact of RCI on offensive rating
 * - ALPHA_DEF: Impact of RCI on defensive rating  
 * - HALF_LIFE: Games for chemistry decay to 50%
 * 
 * Current (too conservative):
 * - ALPHA_OFF = 4.0
 * - ALPHA_DEF = 3.5
 * - HALF_LIFE = 14
 * 
 * Testing (10-20x more aggressive):
 * - ALPHA_OFF: [6, 8, 10, 12, 15, 20]
 * - ALPHA_DEF: [5, 7, 9, 11, 13, 15]
 * - HALF_LIFE: [7, 10, 14, 20, 28]
 * 
 * Output:
 * - Grid search results sorted by MAE improvement
 * - Detailed logs per team/season (CSV)
 * - Top-3 configurations for visual inspection
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Grid search parameters
const ALPHA_OFF_RANGE = [6, 8, 10, 12, 15, 20];
const ALPHA_DEF_RANGE = [5, 7, 9, 11, 13, 15];
const HALF_LIFE_RANGE = [7, 10, 14, 20, 28];

const MAX_NET_EFFECT = 12; // Cap at ±12 pts/100 to prevent runaway

// RECENCY WEIGHTS (Half-life = 1 season approach)
// Recent seasons matter more - matches production model bias
const SEASON_WEIGHTS = {
  '2024-25': 0.50,  // Current meta - most important
  '2023-24': 0.33,  // Recent but not current
  '2022-23': 0.17,  // Historical - for robustness only
};

// Stability guardrail: Reject configs that hurt any season too much
const MAX_SEASON_DEGRADATION = 0.15; // Don't allow >0.15% worse in any season

const SEASONS = [
  {
    name: '2022-23',
    gamesFile: 'games_2022_23.json',
    rciFile: 'rosters_with_rci_2022_23.json',
  },
  {
    name: '2023-24',
    gamesFile: 'games_2023_24.json',
    rciFile: 'rosters_with_rci_2023_24.json',
  },
  {
    name: '2024-25',
    gamesFile: 'games_2024_25.json',
    rciFile: 'rosters_with_rci_2024_25.json',
  },
];

console.log('🔬 RCI Parameter Grid Search\n');
console.log('='.repeat(70));
console.log('\n📊 Testing Parameter Ranges:');
console.log(`  ALPHA_OFF: ${ALPHA_OFF_RANGE.join(', ')}`);
console.log(`  ALPHA_DEF: ${ALPHA_DEF_RANGE.join(', ')}`);
console.log(`  HALF_LIFE: ${HALF_LIFE_RANGE.join(', ')}`);
console.log(`\n  Total combinations: ${ALPHA_OFF_RANGE.length * ALPHA_DEF_RANGE.length * HALF_LIFE_RANGE.length}`);
console.log(`  Seasons: ${SEASONS.map(s => s.name).join(', ')}`);
console.log('\n' + '='.repeat(70) + '\n');

/**
 * Apply RCI adjustment with custom parameters
 */
function applyRCIAdjustmentCustom(stats, teamAbbr, gamesPlayed, rci, alphaOff, alphaDef, halfLife) {
  if (rci === undefined) return stats;
  
  const RCI_CENTER = 0.75;
  const LOSS_MULTIPLIER = 1.2;
  const GAIN_MULTIPLIER = 0.8;
  
  const rciDiff = rci - RCI_CENTER;
  const asymmetry = rciDiff < 0 ? LOSS_MULTIPLIER : GAIN_MULTIPLIER;
  
  // Chemistry decay: 2^(-t/HALF_LIFE)
  const chemistryFactor = Math.pow(2, -gamesPlayed / halfLife);
  
  // Calculate deltas with floor/ceiling
  let deltaOff = alphaOff * rciDiff * asymmetry * chemistryFactor;
  let deltaDef = -alphaDef * rciDiff * asymmetry * chemistryFactor; // Negative: low RCI = worse defense
  
  // Cap net effect at ±MAX_NET_EFFECT
  const netDelta = deltaOff + deltaDef;
  if (Math.abs(netDelta) > MAX_NET_EFFECT) {
    const scale = MAX_NET_EFFECT / Math.abs(netDelta);
    deltaOff *= scale;
    deltaDef *= scale;
  }
  
  return {
    offRtg: stats.offRtg + deltaOff,
    defRtg: stats.defRtg + deltaDef,
    netRtg: stats.netRtg + deltaOff + deltaDef,
    pace: stats.pace,
    games: stats.games,
    // Metadata for logging
    _rci: rci,
    _deltaOff: deltaOff,
    _deltaDef: deltaDef,
    _chemistryFactor: chemistryFactor,
  };
}

/**
 * Calculate advanced stats from games
 */
function calculateAdvancedStats(games, teamId, lastN = 10) {
  const teamGames = games
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .slice(-lastN);
  
  if (teamGames.length === 0) {
    return { offRtg: 105, defRtg: 105, netRtg: 0, pace: 100, games: 0 };
  }
  
  let totalPoss = 0;
  let totalPts = 0;
  let totalPtsAllowed = 0;
  
  for (const game of teamGames) {
    const isHome = game.homeTeamId === teamId;
    const teamStats = isHome ? game.homeStats : game.awayStats;
    const oppStats = isHome ? game.awayStats : game.homeStats;
    
    const fga = teamStats.fga || 0;
    const fta = teamStats.fta || 0;
    const to = teamStats.turnovers || 0;
    const orb = teamStats.offReb || 0;
    
    const poss = fga + 0.44 * fta - orb + to;
    
    totalPoss += poss;
    totalPts += (isHome ? game.homeScore : game.awayScore);
    totalPtsAllowed += (isHome ? game.awayScore : game.homeScore);
  }
  
  const avgPoss = totalPoss / teamGames.length;
  const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 105;
  const defRtg = totalPoss > 0 ? (totalPtsAllowed / totalPoss) * 100 : 105;
  
  return {
    offRtg,
    defRtg,
    netRtg: offRtg - defRtg,
    pace: avgPoss,
    games: teamGames.length,
  };
}

/**
 * Predict spread
 */
function predictSpread(homeStats, awayStats) {
  const netRtgDiff = homeStats.netRtg - awayStats.netRtg;
  const homeAdv = 3.5;
  return netRtgDiff * 0.35 + homeAdv;
}

/**
 * Backtest single game with custom parameters
 */
function backtestGame(game, allGames, seasonStartRCI, alphaOff, alphaDef, halfLife, useRCI = false) {
  const targetDate = new Date(game.date);
  const pastGames = allGames.filter(g => new Date(g.date) < targetDate);
  
  if (pastGames.length === 0) return null;
  
  const homeId = game.homeTeamId;
  const awayId = game.awayTeamId;
  const homeTeam = game.homeTeam;
  const awayTeam = game.awayTeam;
  
  const homeL10Raw = calculateAdvancedStats(pastGames, homeId, 10);
  const awayL10Raw = calculateAdvancedStats(pastGames, awayId, 10);
  
  if (homeL10Raw.games < 3 || awayL10Raw.games < 3) return null;
  
  let homeL10 = homeL10Raw;
  let awayL10 = awayL10Raw;
  
  if (useRCI && seasonStartRCI[homeTeam] !== undefined && seasonStartRCI[awayTeam] !== undefined) {
    const homeGamesPlayed = pastGames.filter(g => 
      g.homeTeamId === homeId || g.awayTeamId === homeId
    ).length;
    
    const awayGamesPlayed = pastGames.filter(g => 
      g.homeTeamId === awayId || g.awayTeamId === awayId
    ).length;
    
    homeL10 = applyRCIAdjustmentCustom(
      homeL10Raw, homeTeam, homeGamesPlayed, 
      seasonStartRCI[homeTeam], alphaOff, alphaDef, halfLife
    );
    awayL10 = applyRCIAdjustmentCustom(
      awayL10Raw, awayTeam, awayGamesPlayed,
      seasonStartRCI[awayTeam], alphaOff, alphaDef, halfLife
    );
  }
  
  const predictedSpread = predictSpread(homeL10, awayL10);
  const actualSpread = game.homeScore - game.awayScore;
  const error = Math.abs(predictedSpread - actualSpread);
  
  const predictedWinner = predictedSpread > 0 ? 'home' : 'away';
  const actualWinner = actualSpread > 0 ? 'home' : 'away';
  const correct = predictedWinner === actualWinner;
  
  return { 
    error, 
    correct,
    // Logging metadata
    homeTeam,
    awayTeam,
    homeRCI: seasonStartRCI[homeTeam],
    awayRCI: seasonStartRCI[awayTeam],
    homeDeltaOff: homeL10._deltaOff || 0,
    homeDeltaDef: homeL10._deltaDef || 0,
    awayDeltaOff: awayL10._deltaOff || 0,
    awayDeltaDef: awayL10._deltaDef || 0,
    predictedSpread,
    actualSpread,
  };
}

/**
 * Test single parameter configuration
 */
function testConfiguration(alphaOff, alphaDef, halfLife, seasonsData) {
  const results = [];
  
  for (const { name, games, rci } of seasonsData) {
    const sortedGames = games.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const baselineResults = [];
    const rciResults = [];
    
    for (const game of sortedGames) {
      const baselineResult = backtestGame(game, sortedGames, rci, alphaOff, alphaDef, halfLife, false);
      if (baselineResult) baselineResults.push(baselineResult);
      
      const rciResult = backtestGame(game, sortedGames, rci, alphaOff, alphaDef, halfLife, true);
      if (rciResult) rciResults.push(rciResult);
    }
    
    const baselineMAE = baselineResults.reduce((sum, r) => sum + r.error, 0) / baselineResults.length;
    const rciMAE = rciResults.reduce((sum, r) => sum + r.error, 0) / rciResults.length;
    const maeImprovement = ((baselineMAE - rciMAE) / baselineMAE) * 100;
    
    const baselineWins = baselineResults.filter(r => r.correct).length;
    const rciWins = rciResults.filter(r => r.correct).length;
    const baselinePct = (baselineWins / baselineResults.length) * 100;
    const rciPct = (rciWins / rciResults.length) * 100;
    
    results.push({
      season: name,
      gamesCount: baselineResults.length,
      baselineMAE,
      rciMAE,
      maeImprovement,
      baselinePct,
      rciPct,
      winPctImprovement: rciPct - baselinePct,
    });
  }
  
  // Calculate RECENCY-WEIGHTED average (not equal-weighted)
  // Recent seasons get more weight in optimization
  let weightedBaselineMAE = 0;
  let weightedRciMAE = 0;
  let weightedBaselineWins = 0;
  let weightedRciWins = 0;
  let totalWeight = 0;
  
  for (const r of results) {
    const weight = SEASON_WEIGHTS[r.season] || 0;
    weightedBaselineMAE += r.baselineMAE * weight;
    weightedRciMAE += r.rciMAE * weight;
    weightedBaselineWins += r.baselinePct * weight;
    weightedRciWins += r.rciPct * weight;
    totalWeight += weight;
  }
  
  // Normalize if weights don't sum to 1
  weightedBaselineMAE /= totalWeight;
  weightedRciMAE /= totalWeight;
  weightedBaselineWins /= totalWeight;
  weightedRciWins /= totalWeight;
  
  const weightedMaeImprovement = ((weightedBaselineMAE - weightedRciMAE) / weightedBaselineMAE) * 100;
  const weightedWinPctImprovement = weightedRciWins - weightedBaselineWins;
  
  // STABILITY CHECK: Fail if any season degrades too much
  const maxDegradation = Math.max(...results.map(r => -r.maeImprovement));
  const passesStabilityCheck = maxDegradation <= MAX_SEASON_DEGRADATION;
  
  // Also calculate equal-weighted for comparison
  const totalGames = results.reduce((sum, r) => sum + r.gamesCount, 0);
  const equalWeightedBaselineMAE = results.reduce((sum, r) => sum + (r.baselineMAE * r.gamesCount), 0) / totalGames;
  const equalWeightedRciMAE = results.reduce((sum, r) => sum + (r.rciMAE * r.gamesCount), 0) / totalGames;
  const equalWeightedMaeImprovement = ((equalWeightedBaselineMAE - equalWeightedRciMAE) / equalWeightedBaselineMAE) * 100;
  
  return {
    alphaOff,
    alphaDef,
    halfLife,
    // Recency-weighted (PRIMARY - used for ranking)
    weightedBaselineMAE,
    weightedRciMAE,
    weightedMaeImprovement,
    weightedBaselineWinPct: weightedBaselineWins,
    weightedRciWinPct: weightedRciWins,
    weightedWinPctImprovement,
    // Equal-weighted (REFERENCE - for comparison)
    equalWeightedBaselineMAE,
    equalWeightedRciMAE,
    equalWeightedMaeImprovement,
    // Stability
    passesStabilityCheck,
    maxDegradation,
    // Raw data
    totalGames,
    seasonResults: results,
  };
}

/**
 * Main grid search
 */
async function runGridSearch() {
  // Load all season data
  console.log('📂 Loading season data...\n');
  const seasonsData = [];
  
  for (const season of SEASONS) {
    const gamesPath = join(projectRoot, 'data/nba/games', season.gamesFile);
    const rciPath = join(projectRoot, 'data/nba/rosters/archive', season.rciFile);
    
    try {
      const games = JSON.parse(readFileSync(gamesPath, 'utf-8'));
      const rciDataRaw = JSON.parse(readFileSync(rciPath, 'utf-8'));
      const rciRosters = rciDataRaw.rosters || rciDataRaw.teams || rciDataRaw;
      
      const rci = {};
      rciRosters.forEach(team => {
        const abbr = team.abbreviation || team.team;
        rci[abbr] = team.rci;
      });
      
      seasonsData.push({ name: season.name, games, rci });
      console.log(`  ✅ ${season.name}: ${games.length} games, ${Object.keys(rci).length} teams`);
    } catch (error) {
      console.log(`  ⚠️  Skipping ${season.name}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🔄 Running grid search...\n');
  
  const totalCombinations = ALPHA_OFF_RANGE.length * ALPHA_DEF_RANGE.length * HALF_LIFE_RANGE.length;
  let completed = 0;
  const startTime = Date.now();
  
  const allResults = [];
  
  for (const alphaOff of ALPHA_OFF_RANGE) {
    for (const alphaDef of ALPHA_DEF_RANGE) {
      for (const halfLife of HALF_LIFE_RANGE) {
        const result = testConfiguration(alphaOff, alphaDef, halfLife, seasonsData);
        allResults.push(result);
        
        completed++;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = completed / elapsed;
        const remaining = (totalCombinations - completed) / rate;
        
        process.stdout.write(`\r  Progress: ${completed}/${totalCombinations} (${(completed/totalCombinations*100).toFixed(1)}%) - ETA: ${Math.ceil(remaining)}s `);
      }
    }
  }
  
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 GRID SEARCH RESULTS (Recency-Weighted)');
  console.log('='.repeat(70));
  console.log('\n⚙️  Season Weights:');
  for (const [season, weight] of Object.entries(SEASON_WEIGHTS)) {
    console.log(`   ${season}: ${(weight * 100).toFixed(0)}%`);
  }
  console.log(`   Stability guardrail: Max degradation ≤ ${MAX_SEASON_DEGRADATION}%\n`);
  
  // Sort by RECENCY-WEIGHTED MAE improvement (descending)
  allResults.sort((a, b) => b.weightedMaeImprovement - a.weightedMaeImprovement);
  
  // Filter for stability (optional - show all but mark unstable)
  const stableResults = allResults.filter(r => r.passesStabilityCheck);
  console.log(`   Tested: ${allResults.length} configs | Stable: ${stableResults.length}\n`);
  
  // Display top 10 STABLE configs
  console.log('🏆 Top 10 Configurations (by RECENCY-WEIGHTED MAE):\n');
  console.log('Rank | αOff | αDef | Half | Wtd MAE Δ | Wtd Win% | Eq MAE Δ | Stable | Games');
  console.log('-----|------|------|------|-----------|----------|----------|--------|-------');
  
  let displayed = 0;
  for (let i = 0; i < allResults.length && displayed < 10; i++) {
    const r = allResults[i];
    const rank = String(displayed + 1).padStart(4);
    const alphaOff = String(r.alphaOff).padStart(4);
    const alphaDef = String(r.alphaDef).padStart(4);
    const halfLife = String(r.halfLife).padStart(4);
    const wtdMae = (r.weightedMaeImprovement >= 0 ? '+' : '') + r.weightedMaeImprovement.toFixed(2);
    const wtdWin = (r.weightedWinPctImprovement >= 0 ? '+' : '') + r.weightedWinPctImprovement.toFixed(2);
    const eqMae = (r.equalWeightedMaeImprovement >= 0 ? '+' : '') + r.equalWeightedMaeImprovement.toFixed(2);
    const stable = r.passesStabilityCheck ? '✅' : '⚠️';
    
    console.log(`${rank} | ${alphaOff} | ${alphaDef} | ${halfLife} | ${wtdMae.padStart(9)} | ${wtdWin.padStart(8)} | ${eqMae.padStart(8)} | ${stable.padStart(6)} | ${r.totalGames}`);
    displayed++;
  }
  
  // Save full results to JSON
  const resultsPath = join(projectRoot, 'data/nba/grid_search_results.json');
  writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Full results saved to: data/nba/grid_search_results.json`);
  
  // Top 3 detailed breakdown
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Top 3 Configurations - Season Breakdown');
  console.log('='.repeat(70));
  
  for (let i = 0; i < Math.min(3, allResults.length); i++) {
    const r = allResults[i];
    console.log(`\n${i + 1}. αOff=${r.alphaOff}, αDef=${r.alphaDef}, Half-Life=${r.halfLife} ${r.passesStabilityCheck ? '✅' : '⚠️ UNSTABLE'}`);
    console.log(`   Recency-Weighted: MAE ${r.weightedMaeImprovement >= 0 ? '+' : ''}${r.weightedMaeImprovement.toFixed(2)}%, Win% ${r.weightedWinPctImprovement >= 0 ? '+' : ''}${r.weightedWinPctImprovement.toFixed(2)} pct pts`);
    console.log(`   Equal-Weighted:   MAE ${r.equalWeightedMaeImprovement >= 0 ? '+' : ''}${r.equalWeightedMaeImprovement.toFixed(2)}%\n`);
    
    console.log('   Season    | Weight | Games | Base MAE | RCI MAE | MAE Δ   | Win% Δ');
    console.log('   ----------|--------|-------|----------|---------|---------|--------');
    
    for (const season of r.seasonResults) {
      const name = season.season.padEnd(9);
      const weight = (SEASON_WEIGHTS[season.season] * 100).toFixed(0).padStart(6) + '%';
      const games = String(season.gamesCount).padStart(5);
      const baseMae = season.baselineMAE.toFixed(3).padStart(8);
      const rciMae = season.rciMAE.toFixed(3).padStart(7);
      const maeImp = (season.maeImprovement >= 0 ? '+' : '') + season.maeImprovement.toFixed(2);
      const winImp = (season.winPctImprovement >= 0 ? '+' : '') + season.winPctImprovement.toFixed(2);
      
      console.log(`   ${name} | ${weight} | ${games} | ${baseMae} | ${rciMae} | ${maeImp.padStart(7)} | ${winImp.padStart(6)}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Grid Search Complete!');
  console.log('='.repeat(70));
  
  const best = allResults[0];
  console.log('\n🎯 RECOMMENDED PARAMETERS (Recency-Weighted Optimization):');
  console.log(`  ALPHA_OFF = ${best.alphaOff}`);
  console.log(`  ALPHA_DEF = ${best.alphaDef}`);
  console.log(`  HALF_LIFE = ${best.halfLife}`);
  console.log(`  Stability: ${best.passesStabilityCheck ? '✅ PASS' : '⚠️ FAIL (degrades ' + best.maxDegradation.toFixed(2) + '% in one season)'}`);
  console.log(`\n  Expected improvement (RECENCY-WEIGHTED):`);
  console.log(`    MAE: ${best.weightedMaeImprovement >= 0 ? '+' : ''}${best.weightedMaeImprovement.toFixed(2)}%`);
  console.log(`    Win%: ${best.weightedWinPctImprovement >= 0 ? '+' : ''}${best.weightedWinPctImprovement.toFixed(2)} pct pts`);
  console.log(`    New Win%: ${best.weightedRciWinPct.toFixed(1)}%`);
  console.log(`    Edge over breakeven (52.4%): ${(best.weightedRciWinPct - 52.4).toFixed(1)} pct pts`);
  console.log(`\n  For comparison (EQUAL-WEIGHTED):`);
  console.log(`    MAE: ${best.equalWeightedMaeImprovement >= 0 ? '+' : ''}${best.equalWeightedMaeImprovement.toFixed(2)}%`);
  console.log(`\n💡 Recency weighting emphasizes 2024-25 (50%), 2023-24 (33%), 2022-23 (17%)\n`);
}

// Run it
runGridSearch().catch(console.error);

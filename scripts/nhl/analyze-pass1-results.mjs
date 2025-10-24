#!/usr/bin/env node

/**
 * PASS 1 QUICK ANALYSIS
 * 
 * Purpose: Evaluate 170 games from Pass 1 to decide if Pass 2 is worth it
 * 
 * Analyzes:
 * - Basic profitability (flat betting ROI)
 * - EV by confidence bucket
 * - Edge frequency (how often we beat the market)
 * - Line value (are we finding +EV opportunities?)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// ODDS CONVERSION
// ============================================================================

function americanToDecimal(americanOdds) {
  if (americanOdds >= 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

function oddsToImpliedProb(americanOdds) {
  if (americanOdds >= 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

function removeVig(overPrice, underPrice) {
  // Prices are in decimal format (e.g., 1.57, 2.35)
  const overImplied = 1 / overPrice;
  const underImplied = 1 / underPrice;
  const total = overImplied + underImplied;
  
  return {
    overProb: overImplied / total,
    underProb: underImplied / total,
    vigPct: ((total - 1.0) * 100)
  };
}

// ============================================================================
// ZINB PROBABILITY
// ============================================================================

function gammaLn(x) {
  const cof = [
    76.18009172947146, -86.50532032941677,
    24.01409824083091, -1.231739572450155,
    0.001208650973866179, -0.000005395239384953
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += cof[j] / ++y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function zinbPmf(k, mu, alpha, zi) {
  if (k === 0) {
    const nbProb = Math.pow(1 + alpha * mu, -1 / alpha);
    return zi + (1 - zi) * nbProb;
  }
  
  const r = 1 / alpha;
  const p = r / (r + mu);
  
  const logBinom = gammaLn(k + r) - gammaLn(k + 1) - gammaLn(r);
  const logProb = logBinom + r * Math.log(p) + k * Math.log(1 - p);
  
  return (1 - zi) * Math.exp(logProb);
}

function zinbCdf(k, mu, alpha, zi) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += zinbPmf(i, mu, alpha, zi);
  }
  return sum;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       📊 PASS 1 QUICK ANALYSIS                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Load Pass 1 odds data
  const oddsPath = path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json');
  console.log('📂 Loading Pass 1 odds data...');
  const oddsData = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
  console.log(`   ✓ Loaded ${oddsData.data.length} player-games`);
  
  // Filter to games with odds
  const gamesWithOdds = oddsData.data.filter(g => g.oddsAvailable && g.odds.length > 0);
  console.log(`   ✓ ${gamesWithOdds.length} games with odds (${(gamesWithOdds.length / oddsData.data.length * 100).toFixed(1)}%)\n`);

  // Try both prediction files (baseline vs improved)
  const predsPathImproved = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_improved_results.json');
  const predsPathBaseline = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_results.json');
  
  let predsData, predsPath, modelType;
  
  // Check which file to use based on command line arg
  if (process.argv.includes('--baseline')) {
    console.log('📂 Loading BASELINE model predictions...');
    predsPath = predsPathBaseline;
    modelType = 'baseline';
  } else {
    console.log('📂 Loading IMPROVED model predictions...');
    predsPath = predsPathImproved;
    modelType = 'improved';
  }
  
  predsData = JSON.parse(fs.readFileSync(predsPath, 'utf8'));
  console.log(`   ✓ Loaded ${predsData.predictions?.length || 0} predictions (${modelType})\n`);

  // Load learned parameters
  const paramsPath = path.join(REPO_ROOT, 'data/nhl/learned_parameters.json');
  const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
  console.log('📂 Model parameters loaded\n');

  // Match predictions to odds
  console.log('🔗 Matching predictions to odds...');
  const matched = [];
  
  for (const game of gamesWithOdds) {
    // Find prediction for this player-game
    const pred = predsData.predictions?.find(p => 
      p.playerId === game.playerId && 
      p.gameDate === game.gameDate
    );
    
    if (!pred) continue;

    // Get best line (highest overPrice = best odds)
    const bestOdds = game.odds.reduce((best, curr) => 
      curr.overPrice > best.overPrice ? curr : best
    );

    // Calculate model probabilities using ZINB
    const mu = pred.predicted || 0;
    const alpha = params.alpha || 0.5;
    const zi = params.zi || 0.1;
    
    // P(shots > line)
    const line = bestOdds.line;
    const pOver = 1 - zinbCdf(Math.floor(line), mu, alpha, zi);
    const pUnder = 1 - pOver;

    // Market probabilities (vig-removed)
    const market = removeVig(bestOdds.overPrice, bestOdds.underPrice);

    // Edge = model prob - market prob
    const edgeOver = pOver - market.overProb;
    const edgeUnder = pUnder - market.underProb;

    // Actual outcome
    const actualShots = game.actualShots;
    const outcome = actualShots > line ? 'over' : 'under';

    matched.push({
      playerId: game.playerId,
      playerName: game.playerName,
      gameDate: game.gameDate,
      team: game.team,
      opponent: game.opponent,
      actualShots,
      predicted: mu,
      line,
      pOver,
      pUnder,
      marketOverProb: market.overProb,
      marketUnderProb: market.underProb,
      edgeOver,
      edgeUnder,
      bestOverPrice: bestOdds.overPrice,
      bestUnderPrice: bestOdds.underPrice,
      outcome,
      bookmaker: bestOdds.bookmaker,
      vigPct: market.vigPct
    });
  }

  console.log(`   ✓ Matched ${matched.length} games with predictions and odds\n`);

  // ============================================================================
  // ANALYSIS
  // ============================================================================

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 EDGE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Find +EV opportunities (where we have edge)
  const overBets = matched.filter(g => g.edgeOver > 0.02); // >2% edge
  const underBets = matched.filter(g => g.edgeUnder > 0.02);
  const totalPlusEV = overBets.length + underBets.length;

  console.log(`+EV Opportunities (>2% edge):`);
  console.log(`  Over bets:  ${overBets.length} games`);
  console.log(`  Under bets: ${underBets.length} games`);
  console.log(`  Total:      ${totalPlusEV} / ${matched.length} (${(totalPlusEV / matched.length * 100).toFixed(1)}%)\n`);

  // ============================================================================
  // FLAT BETTING SIMULATION
  // ============================================================================

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💰 FLAT BETTING SIMULATION (1 unit per bet)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let totalStaked = 0;
  let totalProfit = 0;
  let wins = 0;
  let losses = 0;

  // Simulate betting on all +EV opportunities
  for (const game of overBets) {
    totalStaked += 1;
    if (game.outcome === 'over') {
      totalProfit += (game.bestOverPrice - 1); // Profit = (decimal odds - 1)
      wins++;
    } else {
      totalProfit -= 1;
      losses++;
    }
  }

  for (const game of underBets) {
    totalStaked += 1;
    if (game.outcome === 'under') {
      totalProfit += (game.bestUnderPrice - 1);
      wins++;
    } else {
      totalProfit -= 1;
      losses++;
    }
  }

  const roi = totalStaked > 0 ? (totalProfit / totalStaked * 100) : 0;
  const winRate = (wins / (wins + losses) * 100);

  console.log(`Total Bets:    ${wins + losses}`);
  console.log(`Wins:          ${wins}`);
  console.log(`Losses:        ${losses}`);
  console.log(`Win Rate:      ${winRate.toFixed(1)}%`);
  console.log(`Total Staked:  ${totalStaked.toFixed(2)} units`);
  console.log(`Total Profit:  ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} units`);
  console.log(`ROI:           ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%\n`);

  // ============================================================================
  // EDGE DISTRIBUTION
  // ============================================================================

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📈 EDGE DISTRIBUTION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const edges = matched.map(g => Math.max(g.edgeOver, g.edgeUnder));
  edges.sort((a, b) => b - a);

  console.log('Top 10 Edges:');
  edges.slice(0, 10).forEach((edge, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${(edge * 100).toFixed(2)}%`);
  });

  const avgEdge = edges.reduce((sum, e) => sum + e, 0) / edges.length;
  const posEdges = edges.filter(e => e > 0).length;

  console.log(`\nAverage edge:     ${(avgEdge * 100).toFixed(2)}%`);
  console.log(`Positive edges:   ${posEdges} / ${edges.length} (${(posEdges / edges.length * 100).toFixed(1)}%)\n`);

  // ============================================================================
  // RECOMMENDATION
  // ============================================================================

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🎯 RECOMMENDATION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (roi > 5) {
    console.log('✅ STRONG SIGNAL - Proceed with Pass 2!');
    console.log(`   ROI of ${roi.toFixed(1)}% is excellent for sports betting.`);
    console.log(`   Model appears to find genuine market inefficiencies.\n`);
  } else if (roi > 2) {
    console.log('✅ PROMISING - Proceed with Pass 2');
    console.log(`   ROI of ${roi.toFixed(1)}% is profitable but modest.`);
    console.log(`   More data from Pass 2 will improve statistical confidence.\n`);
  } else if (roi > 0) {
    console.log('⚠️  MARGINAL - Consider Pass 2 cautiously');
    console.log(`   ROI of ${roi.toFixed(1)}% is barely profitable.`);
    console.log(`   May not cover transaction costs and variance.\n`);
  } else {
    console.log('❌ UNPROFITABLE - Skip Pass 2');
    console.log(`   ROI of ${roi.toFixed(1)}% indicates model is not finding edge.`);
    console.log(`   Focus on model improvements before burning more API credits.\n`);
  }

  // Save detailed results
  const resultsPath = path.join(REPO_ROOT, `data/nhl/pass1_analysis_${modelType}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({
    modelType,
    summary: {
      totalGames: matched.length,
      plusEvOpportunities: totalPlusEV,
      totalBets: wins + losses,
      wins,
      losses,
      winRate,
      totalStaked,
      totalProfit,
      roi,
      avgEdge,
      posEdges
    },
    bets: [...overBets, ...underBets].map(g => ({
      playerName: g.playerName,
      gameDate: g.gameDate,
      team: g.team,
      opponent: g.opponent,
      betType: g.edgeOver > g.edgeUnder ? 'over' : 'under',
      line: g.line,
      edge: Math.max(g.edgeOver, g.edgeUnder),
      odds: g.edgeOver > g.edgeUnder ? g.bestOverPrice : g.bestUnderPrice,
      actualShots: g.actualShots,
      result: g.outcome === (g.edgeOver > g.edgeUnder ? 'over' : 'under') ? 'WIN' : 'LOSS'
    }))
  }, null, 2));

  console.log(`💾 Detailed results saved to: data/nhl/pass1_analysis_${modelType}.json\n`);
}

main().catch(console.error);

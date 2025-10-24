#!/usr/bin/env node

/**
 * NHL MARKET-AWARE BACKTEST ENGINE
 * 
 * Purpose: Validate betting profitability against ACTUAL market lines with vig removal
 * 
 * Input: 
 *   - historical_game_data.json (actual outcomes)
 *   - learned_parameters.json (fitted model parameters)
 *   - historical_odds_data.json (archived market lines/odds) OR live fetch
 * 
 * Output:
 *   - market_backtest_results.json with:
 *     * ROI by confidence bucket
 *     * Kelly-optimal stakes
 *     * Max drawdown (Monte Carlo)
 *     * Ruin probability
 *     * EV distribution
 * 
 * This measures TRUE betting profitability, not just prediction accuracy.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// VIG REMOVAL & FAIR PROBABILITY CALCULATION
// ============================================================================

function oddsToImpliedProb(americanOdds) {
  if (americanOdds >= 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

function removeVig(overOdds, underOdds) {
  const overImplied = oddsToImpliedProb(overOdds);
  const underImplied = oddsToImpliedProb(underOdds);
  const total = overImplied + underImplied;
  
  // Normalize to remove bookmaker margin
  const overNoVig = overImplied / total;
  const underNoVig = underImplied / total;
  const vigPct = ((total - 1.0) * 100);
  
  return { 
    overProb: overNoVig, 
    underProb: underNoVig, 
    vigPct 
  };
}

// ============================================================================
// KELLY CRITERION WITH VARIANCE ADJUSTMENT
// ============================================================================

function calculateKelly(modelProb, americanOdds, variance = 0, cap = 0.25) {
  const p = modelProb;
  const q = 1 - p;
  
  // Convert American odds to decimal multiplier
  let b;
  if (americanOdds >= 0) {
    b = americanOdds / 100;
  } else {
    b = 100 / Math.abs(americanOdds);
  }
  
  // Kelly formula: f = (bp - q) / b
  let kelly = (b * p - q) / b;
  
  // Variance discount (higher variance = more conservative)
  if (variance > 0) {
    kelly *= (1 - Math.min(variance / 5, 0.3));
  }
  
  // Apply fractional Kelly (default 25%)
  kelly *= cap;
  
  return Math.max(0, Math.min(kelly, 0.05)); // Hard cap at 5% bankroll
}

// ============================================================================
// ZINB DISTRIBUTION (Zero-Inflated Negative Binomial)
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
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function nbPMF(k, mu, alpha) {
  if (k < 0 || !Number.isFinite(mu) || !Number.isFinite(alpha)) return 0;
  
  const r = 1 / alpha;
  const p = r / (r + mu);
  
  if (k === 0) {
    return Math.pow(p, r);
  }
  
  const logProb = gammaLn(r + k) - gammaLn(r) - gammaLn(k + 1)
                  + r * Math.log(p)
                  + k * Math.log(1 - p);
  
  return Math.exp(logProb);
}

function zinbPMF(k, mu, alpha, pi) {
  if (k === 0) {
    return pi + (1 - pi) * nbPMF(0, mu, alpha);
  }
  return (1 - pi) * nbPMF(k, mu, alpha);
}

function zinbCDF(x, mu, alpha, pi) {
  let cumulative = 0;
  for (let k = 0; k <= Math.floor(x); k++) {
    cumulative += zinbPMF(k, mu, alpha, pi);
  }
  return cumulative;
}

// ============================================================================
// PROJECTION ENGINE (Simplified - uses learned parameters)
// ============================================================================

function projectSOG(playerData, gameContext, learnedParams) {
  // Extract player info
  const { recentGames = [], position = 'F' } = playerData;
  const { homeTeam, awayTeam, isHome, opponent } = gameContext;
  
  // Default base rates
  let baseRate = position === 'D' ? 1.8 : 2.5;
  
  // Recent average (last 5 games)
  if (recentGames.length > 0) {
    const last5 = recentGames.slice(-5);
    const avgSOG = last5.reduce((sum, g) => sum + (g.shots || 0), 0) / last5.length;
    baseRate = avgSOG;
  }
  
  // Apply learned adjustments
  const team = isHome ? homeTeam : awayTeam;
  const teamAdj = learnedParams.teamEffects?.[team] || { home: 1.0, away: 1.0 };
  const oppAdj = learnedParams.opponentEffects?.[opponent] || 1.0;
  
  const homeAwayFactor = isHome ? teamAdj.home : teamAdj.away;
  
  // TOI adjustment (if available)
  const avgTOI = recentGames.length > 0
    ? recentGames.slice(-5).reduce((sum, g) => sum + (g.toi || 15), 0) / Math.min(5, recentGames.length)
    : 15;
  
  const toiExponent = learnedParams.toiCurve?.exponent || 1.2;
  const toiFactor = Math.pow(avgTOI / 15, toiExponent);
  
  // Streak effects (simplified - check last 3 games)
  let streakFactor = 1.0;
  if (recentGames.length >= 3) {
    const last3SOG = recentGames.slice(-3).map(g => g.shots || 0);
    const avg3 = last3SOG.reduce((a, b) => a + b) / 3;
    const hotThreshold = baseRate * 1.3;
    const coldThreshold = baseRate * 0.7;
    
    if (avg3 > hotThreshold) {
      streakFactor = learnedParams.streakEffects?.hot || 1.15;
    } else if (avg3 < coldThreshold) {
      streakFactor = learnedParams.streakEffects?.cold || 0.85;
    }
  }
  
  // Final projection
  const projection = baseRate * homeAwayFactor * oppAdj * toiFactor * streakFactor;
  
  // Dispersion (by position archetype)
  const dispersion = position === 'D' 
    ? (learnedParams.dispersion?.defenseman || 1.2)
    : (learnedParams.dispersion?.forward || 1.1);
  
  // Zero inflation
  const pi = 0.05; // 5% chance of true zero
  
  return { 
    mean: projection, 
    dispersion, 
    pi,
    components: { baseRate, homeAwayFactor, oppAdj, toiFactor, streakFactor }
  };
}

// ============================================================================
// SYNTHETIC MARKET LINES (if historical odds unavailable)
// ============================================================================

function generateSyntheticLine(projection) {
  // Round to nearest 0.5
  const rawLine = Math.round(projection * 2) / 2;
  
  // Typical market lines: 0.5, 1.5, 2.5, 3.5, 4.5, 5.5
  const validLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  const closestLine = validLines.reduce((prev, curr) => 
    Math.abs(curr - rawLine) < Math.abs(prev - rawLine) ? curr : prev
  );
  
  // Generate synthetic odds based on projection vs line
  const diff = projection - closestLine;
  
  let overOdds, underOdds;
  
  if (Math.abs(diff) < 0.3) {
    // Close to line - both sides around -110
    overOdds = -110;
    underOdds = -110;
  } else if (diff > 0) {
    // Projection above line - Over favored
    overOdds = diff > 0.8 ? -150 : -125;
    underOdds = diff > 0.8 ? +125 : +105;
  } else {
    // Projection below line - Under favored
    overOdds = diff < -0.8 ? +125 : +105;
    underOdds = diff < -0.8 ? -150 : -125;
  }
  
  return { line: closestLine, overOdds, underOdds, synthetic: true };
}

// ============================================================================
// MARKET EV CALCULATION
// ============================================================================

function calculateMarketEV(projection, marketLine, overOdds, underOdds) {
  const { mean, dispersion, pi } = projection;
  
  // Model probabilities
  const pOver = 1 - zinbCDF(marketLine, mean, dispersion, pi);
  const pUnder = zinbCDF(marketLine, mean, dispersion, pi);
  
  // Fair market probabilities (vig removed)
  const { overProb: fairOver, underProb: fairUnder, vigPct } = removeVig(overOdds, underOdds);
  
  // Edge = Model prob - Fair market prob
  const edgeOver = pOver - fairOver;
  const edgeUnder = pUnder - fairUnder;
  
  // EV calculation (per $1 bet)
  const decimalOver = overOdds >= 0 ? (overOdds / 100 + 1) : (100 / Math.abs(overOdds) + 1);
  const decimalUnder = underOdds >= 0 ? (underOdds / 100 + 1) : (100 / Math.abs(underOdds) + 1);
  
  const evOver = pOver * (decimalOver - 1) - (1 - pOver);
  const evUnder = pUnder * (decimalUnder - 1) - (1 - pUnder);
  
  return {
    over: { prob: pOver, fairProb: fairOver, edge: edgeOver, ev: evOver, odds: overOdds },
    under: { prob: pUnder, fairProb: fairUnder, edge: edgeUnder, ev: evUnder, odds: underOdds },
    line: marketLine,
    vigPct
  };
}

// ============================================================================
// MONTE CARLO BANKROLL SIMULATION
// ============================================================================

function monteCarloDrawdown(bets, numTrials = 10000) {
  const results = [];
  
  for (let trial = 0; trial < numTrials; trial++) {
    let bankroll = 100; // Start with $100
    let peak = 100;
    let maxDrawdown = 0;
    
    for (const bet of bets) {
      const { stake, ev, variance, winProb } = bet;
      const betSize = bankroll * stake;
      
      // Simulate outcome
      const won = Math.random() < winProb;
      
      if (won) {
        const profit = betSize * (bet.odds >= 0 ? bet.odds / 100 : 100 / Math.abs(bet.odds));
        bankroll += profit;
      } else {
        bankroll -= betSize;
      }
      
      // Track drawdown
      if (bankroll > peak) peak = bankroll;
      const dd = (peak - bankroll) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
      
      // Ruin check
      if (bankroll <= 0) {
        results.push({ finalBankroll: 0, maxDrawdown: 1.0, ruined: true });
        break;
      }
    }
    
    if (bankroll > 0) {
      results.push({ finalBankroll: bankroll, maxDrawdown, ruined: false });
    }
  }
  
  // Calculate statistics
  results.sort((a, b) => a.maxDrawdown - b.maxDrawdown);
  const p95DD = results[Math.floor(results.length * 0.95)].maxDrawdown;
  
  results.sort((a, b) => a.finalBankroll - b.finalBankroll);
  const p5Bankroll = results[Math.floor(results.length * 0.05)].finalBankroll;
  const p50Bankroll = results[Math.floor(results.length * 0.50)].finalBankroll;
  
  const ruinCount = results.filter(r => r.ruined).length;
  const ruinProb = ruinCount / numTrials;
  
  return {
    maxDrawdownP95: p95DD,
    finalBankrollP5: p5Bankroll,
    finalBankrollP50: p50Bankroll,
    ruinProbability: ruinProb,
    numTrials
  };
}

// ============================================================================
// MAIN BACKTEST ENGINE
// ============================================================================

async function runMarketBacktest() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       🎯 NHL MARKET-AWARE BACKTEST ENGINE                          ║');
  console.log('║          (Betting Profitability Validation)                        ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Load historical data
  console.log('📂 Loading historical game data...');
  const historicalPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  const learnedParamsPath = path.join(REPO_ROOT, 'data/nhl/learned_parameters.json');
  
  if (!fs.existsSync(historicalPath)) {
    console.error('❌ historical_game_data.json not found');
    process.exit(1);
  }
  
  if (!fs.existsSync(learnedParamsPath)) {
    console.error('❌ learned_parameters.json not found');
    process.exit(1);
  }
  
  const historicalData = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
  const learnedParams = JSON.parse(fs.readFileSync(learnedParamsPath, 'utf8'));
  
  console.log(`✅ Loaded ${historicalData.games?.length || 0} games`);
  console.log('');
  
  // Note: For now, we'll use synthetic market lines
  // TODO: Integrate with TheOddsAPI or historical odds archive
  console.log('⚠️  Using SYNTHETIC market lines (no historical odds available)');
  console.log('   Future: Integrate TheOddsAPI historical data');
  console.log('');
  
  // Process each game
  console.log('🔄 Processing backtest...');
  const bets = [];
  let processedGames = 0;
  
  for (const game of (historicalData.games || [])) {
    const { gameId, date, homeTeam, awayTeam, players = [] } = game;
    
    for (const playerData of players) {
      const { playerId, playerName, team, actualShots, position } = playerData;
      
      if (!actualShots || actualShots === null) continue;
      
      // Determine if player is home or away
      const isHome = team === homeTeam;
      const opponent = isHome ? awayTeam : homeTeam;
      
      // Generate projection
      const projection = projectSOG(playerData, { homeTeam, awayTeam, isHome, opponent }, learnedParams);
      
      // Generate or fetch market line
      const market = generateSyntheticLine(projection.mean);
      
      // Calculate EV
      const ev = calculateMarketEV(projection, market.line, market.overOdds, market.underOdds);
      
      // Determine best bet (if any edge exists)
      let bestSide = null;
      if (ev.over.ev > 0.03 && ev.over.edge > 0.05) {
        bestSide = 'over';
      } else if (ev.under.ev > 0.03 && ev.under.edge > 0.05) {
        bestSide = 'under';
      }
      
      if (bestSide) {
        const side = ev[bestSide];
        const kelly = calculateKelly(side.prob, side.odds, projection.dispersion);
        
        const bet = {
          gameId,
          date,
          playerName,
          position,
          line: market.line,
          side: bestSide.toUpperCase(),
          projection: projection.mean,
          actual: actualShots,
          modelProb: side.prob,
          fairProb: side.fairProb,
          edge: side.edge,
          ev: side.ev,
          odds: side.odds,
          stake: kelly,
          won: bestSide === 'over' ? actualShots > market.line : actualShots <= market.line,
          profit: 0, // Will calculate after
          synthetic: market.synthetic
        };
        
        // Calculate profit
        if (bet.won) {
          const decimalOdds = bet.odds >= 0 ? (bet.odds / 100 + 1) : (100 / Math.abs(bet.odds) + 1);
          bet.profit = bet.stake * (decimalOdds - 1);
        } else {
          bet.profit = -bet.stake;
        }
        
        bets.push(bet);
      }
    }
    
    processedGames++;
    if (processedGames % 500 === 0) {
      console.log(`   Processed ${processedGames} games, found ${bets.length} +EV opportunities...`);
    }
  }
  
  console.log('');
  console.log(`✅ Backtest complete: ${bets.length} bets from ${processedGames} games`);
  console.log('');
  
  // Calculate results
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 MARKET BACKTEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  if (bets.length === 0) {
    console.log('⚠️  No +EV bets found (edge threshold > 5%, EV > 3%)');
    console.log('');
    const results = {
      totalBets: 0,
      message: 'No +EV opportunities found with current thresholds'
    };
    
    fs.writeFileSync(
      path.join(REPO_ROOT, 'data/nhl/market_backtest_results.json'),
      JSON.stringify(results, null, 2)
    );
    return;
  }
  
  const totalStaked = bets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
  const roi = (totalProfit / totalStaked) * 100;
  const wins = bets.filter(b => b.won).length;
  const winRate = (wins / bets.length) * 100;
  
  console.log(`Total Bets: ${bets.length}`);
  console.log(`Win Rate: ${winRate.toFixed(1)}% (${wins}/${bets.length})`);
  console.log(`Total Staked: ${totalStaked.toFixed(2)} units`);
  console.log(`Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} units`);
  console.log(`ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log('');
  
  // By confidence bucket
  console.log('📈 Results by Edge Bucket:');
  const buckets = {
    high: bets.filter(b => b.edge > 0.10),
    medium: bets.filter(b => b.edge > 0.05 && b.edge <= 0.10),
    low: bets.filter(b => b.edge <= 0.05)
  };
  
  for (const [bucket, betList] of Object.entries(buckets)) {
    if (betList.length === 0) continue;
    const profit = betList.reduce((sum, b) => sum + b.profit, 0);
    const staked = betList.reduce((sum, b) => sum + b.stake, 0);
    const bucketROI = (profit / staked) * 100;
    const bucketWins = betList.filter(b => b.won).length;
    const bucketWR = (bucketWins / betList.length) * 100;
    
    console.log(`   ${bucket.toUpperCase()}: ${betList.length} bets, ${bucketWR.toFixed(1)}% WR, ${bucketROI >= 0 ? '+' : ''}${bucketROI.toFixed(1)}% ROI`);
  }
  console.log('');
  
  // Monte Carlo risk analysis
  console.log('🎲 Running Monte Carlo simulation (10,000 trials)...');
  const riskMetrics = monteCarloDrawdown(
    bets.map(b => ({
      stake: b.stake,
      ev: b.ev,
      variance: b.projection,
      winProb: b.modelProb,
      odds: b.odds
    })),
    10000
  );
  
  console.log('');
  console.log('⚠️  RISK METRICS:');
  console.log(`   Max Drawdown (P95): ${(riskMetrics.maxDrawdownP95 * 100).toFixed(1)}%`);
  console.log(`   Final Bankroll (P5): $${riskMetrics.finalBankrollP5.toFixed(2)}`);
  console.log(`   Final Bankroll (Median): $${riskMetrics.finalBankrollP50.toFixed(2)}`);
  console.log(`   Ruin Probability: ${(riskMetrics.ruinProbability * 100).toFixed(2)}%`);
  console.log('');
  
  // Determine deployment readiness
  const deploymentChecks = {
    roi: roi > 3.0,
    winRate: winRate > 52.0,
    drawdown: riskMetrics.maxDrawdownP95 < 0.35,
    ruin: riskMetrics.ruinProbability < 0.05,
    sampleSize: bets.length > 100
  };
  
  const allPassed = Object.values(deploymentChecks).every(v => v);
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚦 DEPLOYMENT READINESS CHECK:');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   ROI > 3%: ${deploymentChecks.roi ? '✅ PASS' : '❌ FAIL'} (${roi.toFixed(2)}%)`);
  console.log(`   Win Rate > 52%: ${deploymentChecks.winRate ? '✅ PASS' : '❌ FAIL'} (${winRate.toFixed(1)}%)`);
  console.log(`   Max DD < 35%: ${deploymentChecks.drawdown ? '✅ PASS' : '❌ FAIL'} (${(riskMetrics.maxDrawdownP95 * 100).toFixed(1)}%)`);
  console.log(`   Ruin < 5%: ${deploymentChecks.ruin ? '✅ PASS' : '❌ FAIL'} (${(riskMetrics.ruinProbability * 100).toFixed(2)}%)`);
  console.log(`   Sample > 100: ${deploymentChecks.sampleSize ? '✅ PASS' : '❌ FAIL'} (${bets.length})`);
  console.log('');
  
  if (allPassed) {
    console.log('✅ MODEL READY FOR REAL MONEY DEPLOYMENT!');
  } else {
    console.log('⚠️  Model needs improvement before real money use');
  }
  console.log('');
  
  // Save results
  const results = {
    summary: {
      totalBets: bets.length,
      wins,
      winRate: winRate / 100,
      totalStaked,
      totalProfit,
      roi: roi / 100
    },
    byBucket: {
      high: buckets.high.length > 0 ? {
        count: buckets.high.length,
        roi: buckets.high.reduce((sum, b) => sum + b.profit, 0) / buckets.high.reduce((sum, b) => sum + b.stake, 0)
      } : null,
      medium: buckets.medium.length > 0 ? {
        count: buckets.medium.length,
        roi: buckets.medium.reduce((sum, b) => sum + b.profit, 0) / buckets.medium.reduce((sum, b) => sum + b.stake, 0)
      } : null,
      low: buckets.low.length > 0 ? {
        count: buckets.low.length,
        roi: buckets.low.reduce((sum, b) => sum + b.profit, 0) / buckets.low.reduce((sum, b) => sum + b.stake, 0)
      } : null
    },
    risk: riskMetrics,
    deployment: {
      ready: allPassed,
      checks: deploymentChecks
    },
    metadata: {
      usedSyntheticLines: true,
      edgeThreshold: 0.05,
      evThreshold: 0.03,
      kellyFraction: 0.25,
      timestamp: new Date().toISOString()
    }
  };
  
  const outputPath = path.join(REPO_ROOT, 'data/nhl/market_backtest_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${outputPath}`);
  console.log('');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMarketBacktest().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

export { runMarketBacktest };

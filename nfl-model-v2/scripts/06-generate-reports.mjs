#!/usr/bin/env node
/**
 * NFL Model V2 - Report Generator
 * 
 * Generates final backtest reports:
 * - performance_by_season.json
 * - edge_bucket_table.json
 * - monotonicity_score.txt
 * 
 * Run: node nfl-model-v2/scripts/06-generate-reports.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const OUTPUT_DIR = path.join(__dirname, '../output');

/**
 * Load all edges data
 */
async function loadEdges() {
  const filename = path.join(OUTPUT_DIR, 'all_edges.json');
  const data = await fs.readFile(filename, 'utf-8');
  return JSON.parse(data);
}

/**
 * Calculate performance metrics for a set of bets
 */
function calculatePerformance(bets) {
  if (bets.length === 0) {
    return {
      games: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      accuracy: 0,
      roi: 0,
      units_won: 0
    };
  }
  
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let totalUnits = 0;
  
  for (const bet of bets) {
    if (bet.result === 'win') wins++;
    else if (bet.result === 'loss') losses++;
    else pushes++;
    
    totalUnits += bet.profit || 0;
  }
  
  const games = bets.length;
  const accuracy = games > 0 ? wins / games : 0;
  const roi = games > 0 ? totalUnits / games : 0;
  
  return {
    games,
    wins,
    losses,
    pushes,
    accuracy: Math.round(accuracy * 1000) / 1000,
    roi: Math.round(roi * 1000) / 1000,
    units_won: Math.round(totalUnits * 100) / 100
  };
}

/**
 * Evaluate spread bet
 */
function evaluateSpreadBet(edge) {
  if (!edge.spread_edge?.has_edge || !edge.actual_result) return null;
  
  const modelLine = edge.spread_edge.model_line;
  const marketLine = edge.spread_edge.market_line;
  const actualMargin = edge.actual_result.margin;
  
  // Determine which side we bet (model vs market difference)
  const betHome = modelLine > marketLine;
  const coverMargin = betHome ? actualMargin : -actualMargin;
  
  // Did we beat the market line?
  let result;
  if (Math.abs(coverMargin - marketLine) < 0.5) {
    result = 'push';
  } else if (coverMargin > marketLine) {
    result = betHome ? 'win' : 'loss';
  } else {
    result = betHome ? 'loss' : 'win';
  }
  
  // Standard pricing: -110 both sides
  const profit = result === 'win' ? 0.91 : result === 'loss' ? -1 : 0;
  
  return {
    market: 'spread',
    edge: edge.spread_edge.probability_edge,
    result,
    profit
  };
}

/**
 * Evaluate total bet
 */
function evaluateTotalBet(edge) {
  if (!edge.total_edge?.has_edge || !edge.actual_result) return null;
  
  const modelTotal = edge.total_edge.model_total;
  const marketTotal = edge.total_edge.market_total;
  const actualTotal = edge.actual_result.total_points;
  
  // Determine which side we bet
  const betOver = modelTotal > marketTotal;
  
  let result;
  if (Math.abs(actualTotal - marketTotal) < 0.5) {
    result = 'push';
  } else if (actualTotal > marketTotal) {
    result = betOver ? 'win' : 'loss';
  } else {
    result = betOver ? 'loss' : 'win';
  }
  
  const profit = result === 'win' ? 0.91 : result === 'loss' ? -1 : 0;
  
  return {
    market: 'total',
    edge: edge.total_edge.probability_edge,
    result,
    profit
  };
}

/**
 * Evaluate moneyline bet
 */
function evaluateMoneylineBet(edge) {
  if (!edge.moneyline_edge?.has_edge || !edge.actual_result) return null;
  
  const betHome = edge.moneyline_edge.best_side === 'home';
  const homeWon = edge.actual_result.home_won;
  
  const result = (betHome && homeWon) || (!betHome && !homeWon) ? 'win' : 'loss';
  
  // Simplified: assume -110 pricing (in reality would use actual odds)
  const profit = result === 'win' ? 0.91 : -1;
  
  return {
    market: 'moneyline',
    edge: edge.moneyline_edge.probability_edge,
    result,
    profit
  };
}

/**
 * Generate performance by season report
 */
function generateSeasonPerformance(edges) {
  const bySeason = {};
  
  for (const season of config.seasons) {
    const seasonEdges = edges.filter(e => e.season === season);
    
    const spreadBets = seasonEdges.map(e => evaluateSpreadBet(e)).filter(b => b !== null);
    const totalBets = seasonEdges.map(e => evaluateTotalBet(e)).filter(b => b !== null);
    const mlBets = seasonEdges.map(e => evaluateMoneylineBet(e)).filter(b => b !== null);
    
    bySeason[season] = {
      total_games: seasonEdges.length,
      games_with_results: seasonEdges.filter(e => e.actual_result).length,
      spread: calculatePerformance(spreadBets),
      total: calculatePerformance(totalBets),
      moneyline: calculatePerformance(mlBets),
      combined: calculatePerformance([...spreadBets, ...totalBets, ...mlBets])
    };
  }
  
  return bySeason;
}

/**
 * Generate edge bucket table
 */
function generateEdgeBuckets(edges) {
  const buckets = {};
  
  for (const market of ['spread', 'total', 'moneyline']) {
    buckets[market] = {};
    
    for (const bucket of config.edge_calculation.edge_buckets) {
      buckets[market][bucket.label] = {
        min_edge: bucket.min,
        max_edge: bucket.max,
        games: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        win_rate: 0,
        avg_edge: 0,
        roi: 0
      };
    }
  }
  
  // Categorize each bet
  const allBets = {
    spread: edges.map(e => ({ edge: e.spread_edge?.probability_edge, bet: evaluateSpreadBet(e) })).filter(b => b.bet),
    total: edges.map(e => ({ edge: e.total_edge?.probability_edge, bet: evaluateTotalBet(e) })).filter(b => b.bet),
    moneyline: edges.map(e => ({ edge: e.moneyline_edge?.probability_edge, bet: evaluateMoneylineBet(e) })).filter(b => b.bet)
  };
  
  for (const [market, bets] of Object.entries(allBets)) {
    for (const { edge, bet } of bets) {
      if (!edge || !bet) continue;
      
      // Find bucket
      const bucket = config.edge_calculation.edge_buckets.find(b => 
        edge >= b.min && edge < b.max
      );
      
      if (bucket) {
        const stats = buckets[market][bucket.label];
        stats.games++;
        if (bet.result === 'win') stats.wins++;
        else if (bet.result === 'loss') stats.losses++;
        else stats.pushes++;
        stats.avg_edge += edge;
      }
    }
    
    // Calculate final stats
    for (const label in buckets[market]) {
      const stats = buckets[market][label];
      if (stats.games > 0) {
        stats.win_rate = Math.round((stats.wins / stats.games) * 1000) / 1000;
        stats.avg_edge = Math.round((stats.avg_edge / stats.games) * 1000) / 1000;
        const totalProfit = (stats.wins * 0.91) - stats.losses;
        stats.roi = Math.round((totalProfit / stats.games) * 1000) / 1000;
      }
    }
  }
  
  return buckets;
}

/**
 * Calculate monotonicity score
 */
function calculateMonotonicity(edgeBuckets) {
  const scores = {};
  
  for (const [market, buckets] of Object.entries(edgeBuckets)) {
    const sorted = Object.entries(buckets)
      .filter(([_, stats]) => stats.games >= 5) // Minimum sample size
      .sort((a, b) => a[1].avg_edge - b[1].avg_edge);
    
    if (sorted.length < 2) {
      scores[market] = { score: 0, rating: 'Insufficient Data' };
      continue;
    }
    
    // Count how many times win rate increases with edge
    let increases = 0;
    let total = sorted.length - 1;
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][1].win_rate > sorted[i - 1][1].win_rate) {
        increases++;
      }
    }
    
    const score = increases / total;
    
    let rating;
    if (score >= 0.9) rating = 'Excellent';
    else if (score >= 0.75) rating = 'Good';
    else if (score >= 0.6) rating = 'Fair';
    else rating = 'Poor';
    
    scores[market] = {
      score: Math.round(score * 100) / 100,
      rating,
      buckets_analyzed: sorted.length
    };
  }
  
  return scores;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - Report Generator');
  console.log('='.repeat(60));
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Load edges
  console.log('\n📥 Loading edge calculations...');
  const edges = await loadEdges();
  console.log(`   ✅ Loaded ${edges.length} games with edge calculations`);
  
  // Generate reports
  console.log('\n📊 Generating performance by season...');
  const seasonPerformance = generateSeasonPerformance(edges);
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'performance_by_season.json'),
    JSON.stringify(seasonPerformance, null, 2)
  );
  console.log('   ✅ Saved performance_by_season.json');
  
  console.log('\n📊 Generating edge bucket analysis...');
  const edgeBuckets = generateEdgeBuckets(edges);
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'edge_bucket_table.json'),
    JSON.stringify(edgeBuckets, null, 2)
  );
  console.log('   ✅ Saved edge_bucket_table.json');
  
  console.log('\n📊 Calculating monotonicity scores...');
  const monotonicity = calculateMonotonicity(edgeBuckets);
  
  // Generate text report
  let report = 'NFL Model V2 - Monotonicity Analysis\n';
  report += '='.repeat(60) + '\n\n';
  
  for (const [market, scores] of Object.entries(monotonicity)) {
    report += `${market.toUpperCase()} Market:\n`;
    report += `  Monotonicity Score: ${scores.score} (${scores.rating})\n`;
    report += `  Buckets Analyzed: ${scores.buckets_analyzed}\n\n`;
  }
  
  report += '\nInterpretation:\n';
  report += '- Score close to 1.0 = Perfect monotonic relationship\n';
  report += '- Higher edge consistently leads to higher win rates\n';
  report += '- Excellent (0.9+): Strong predictive signal\n';
  report += '- Good (0.75-0.9): Reliable but some noise\n';
  report += '- Fair (0.6-0.75): Weak signal, needs improvement\n';
  report += '- Poor (<0.6): Little to no predictive value\n\n';
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'monotonicity_score.txt'),
    report
  );
  console.log('   ✅ Saved monotonicity_score.txt');
  
  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('✅ Report Generation Complete!');
  console.log('='.repeat(60));
  console.log('\n📈 Overall Summary:');
  
  const allSeasons = Object.values(seasonPerformance);
  const totalGames = allSeasons.reduce((sum, s) => sum + s.combined.games, 0);
  const totalWins = allSeasons.reduce((sum, s) => sum + s.combined.wins, 0);
  const totalROI = allSeasons.reduce((sum, s) => sum + s.combined.roi * s.combined.games, 0) / totalGames;
  
  console.log(`   Total Bets: ${totalGames}`);
  console.log(`   Win Rate: ${((totalWins / totalGames) * 100).toFixed(1)}%`);
  console.log(`   Average ROI: ${(totalROI * 100).toFixed(2)}%`);
  console.log('\n📊 Monotonicity Scores:');
  for (const [market, scores] of Object.entries(monotonicity)) {
    console.log(`   ${market}: ${scores.score} (${scores.rating})`);
  }
  
  console.log('\n📁 Output Files:');
  console.log(`   ${OUTPUT_DIR}/performance_by_season.json`);
  console.log(`   ${OUTPUT_DIR}/edge_bucket_table.json`);
  console.log(`   ${OUTPUT_DIR}/monotonicity_score.txt`);
  console.log(`   ${OUTPUT_DIR}/all_edges.json`);
  console.log('\n' + '='.repeat(60));
  console.log('✅ NFL Model V2 Backtest Complete!');
  console.log('='.repeat(60) + '\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * NHL SOG Model - Calibration Audit
 * 
 * Analyzes model predictions vs actual outcomes to identify overconfidence.
 * Generates calibration curves and Brier scores by edge tier.
 * 
 * This tool helps answer:
 * - Is the model overconfident or underconfident?
 * - Which edge tiers are well-calibrated?
 * - What adjustment factors should we apply?
 * 
 * Usage:
 *   node scripts/nhl/calibration-audit.mjs
 *   
 *   # Analyze specific date
 *   node scripts/nhl/calibration-audit.mjs 2025-11-13
 *   
 *   # Analyze date range
 *   node scripts/nhl/calibration-audit.mjs 2025-11-01 2025-11-13
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Edge tiers for analysis
const EDGE_TIERS = [
  { name: 'Elite', min: 20, max: 100, color: '🟢' },
  { name: 'Strong', min: 15, max: 20, color: '🔵' },
  { name: 'Solid', min: 10, max: 15, color: '🟡' },
  { name: 'Marginal', min: 5, max: 10, color: '🟠' },
  { name: 'Weak', min: 0, max: 5, color: '🔴' }
];

// Calibration buckets (for calibration curve)
const PROB_BUCKETS = [
  { min: 0.0, max: 0.5 },
  { min: 0.5, max: 0.55 },
  { min: 0.55, max: 0.6 },
  { min: 0.6, max: 0.65 },
  { min: 0.65, max: 0.7 },
  { min: 0.7, max: 0.75 },
  { min: 0.75, max: 0.8 },
  { min: 0.8, max: 0.85 },
  { min: 0.85, max: 0.9 },
  { min: 0.9, max: 1.0 }
];

/**
 * Fetch data from NHL API
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Calculate Brier Score
 * Brier Score = mean((predicted - actual)^2)
 * 0 = perfect, 1 = terrible
 * <0.20 = good calibration
 */
function calculateBrierScore(predictions) {
  const sum = predictions.reduce((acc, pred) => {
    const actual = pred.won ? 1 : 0;
    const predicted = pred.modelProb;
    return acc + Math.pow(predicted - actual, 2);
  }, 0);
  
  return sum / predictions.length;
}

/**
 * Calculate calibration error
 * Positive = overconfident (model too high)
 * Negative = underconfident (model too low)
 */
function calculateCalibrationError(predictions) {
  const avgModelProb = predictions.reduce((sum, p) => sum + p.modelProb, 0) / predictions.length;
  const actualHitRate = predictions.filter(p => p.won).length / predictions.length;
  
  return avgModelProb - actualHitRate;
}

/**
 * Get actual SOG results for a date
 */
async function getActualResults(date) {
  const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;
  const scoreData = await fetchUrl(scoreUrl);
  const games = scoreData.games || [];
  
  const playerSOG = {};
  
  for (const game of games) {
    const gameId = game.id;
    const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    
    try {
      const box = await fetchUrl(boxUrl);
      
      const processPlayers = (players) => {
        if (!players) return;
        players.forEach(player => {
          const sog = player.sog || 0;
          const abbrevName = player.name.default;
          const playerId = player.playerId;
          
          // Store both name formats
          playerSOG[abbrevName] = sog;
          playerSOG[playerId] = sog;
        });
      };
      
      if (box.playerByGameStats?.awayTeam) {
        processPlayers(box.playerByGameStats.awayTeam.forwards);
        processPlayers(box.playerByGameStats.awayTeam.defense);
      }
      
      if (box.playerByGameStats?.homeTeam) {
        processPlayers(box.playerByGameStats.homeTeam.forwards);
        processPlayers(box.playerByGameStats.homeTeam.defense);
      }
    } catch (e) {
      console.error(`Error fetching boxscore for game ${gameId}:`, e.message);
    }
  }
  
  return playerSOG;
}

/**
 * Match player names (fuzzy matching)
 */
function matchPlayerSOG(playerName, playerSOG) {
  // Try abbreviated name format
  const nameParts = playerName.split(' ');
  const lastName = nameParts[nameParts.length - 1];
  const firstInitial = nameParts[0][0];
  const abbrevName = `${firstInitial}. ${lastName}`;
  
  if (playerSOG[abbrevName] !== undefined) {
    return playerSOG[abbrevName];
  }
  
  // Try fuzzy match on last name
  const matches = Object.keys(playerSOG).filter(name => 
    name.toLowerCase().includes(lastName.toLowerCase())
  );
  
  if (matches.length === 1) {
    return playerSOG[matches[0]];
  }
  
  return null;
}

/**
 * Analyze picks for calibration
 */
async function analyzeDate(date) {
  console.log(`\n📅 Analyzing ${date}...\n`);
  
  // Load picks for this date (you'll need to save picks with dates)
  const picksFile = path.join(__dirname, `../../data/nhl/picks_${date}.json`);
  
  if (!fs.existsSync(picksFile)) {
    console.log(`⚠️  No picks file found for ${date}`);
    console.log(`   Looking for: ${picksFile}`);
    return null;
  }
  
  const picksData = JSON.parse(fs.readFileSync(picksFile, 'utf8'));
  const picks = picksData.picks || picksData;
  
  // Get actual results
  const playerSOG = await getActualResults(date);
  
  // Match picks to results
  const results = picks.map(pick => {
    const actualSOG = matchPlayerSOG(pick.playerName, playerSOG);
    
    if (actualSOG === null) {
      return null;
    }
    
    const won = pick.direction === 'Over' 
      ? actualSOG > pick.line 
      : actualSOG <= pick.line;
    
    // Extract model probability from pick data
    // This should be stored in the picks file
    const modelProb = pick.modelProbability || pick.probability || 0.5;
    
    return {
      playerName: pick.playerName,
      line: pick.line,
      direction: pick.direction,
      actualSOG,
      won,
      modelProb,
      edge: parseFloat(pick.edge) || 0,
      odds: pick.odds
    };
  }).filter(r => r !== null);
  
  return results;
}

/**
 * Generate calibration report
 */
function generateReport(allResults) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 NHL SOG MODEL - CALIBRATION AUDIT REPORT');
  console.log('='.repeat(80));
  console.log('');
  
  // Overall metrics
  const totalPicks = allResults.length;
  const totalWins = allResults.filter(r => r.won).length;
  const overallWinRate = (totalWins / totalPicks * 100).toFixed(1);
  const overallBrier = calculateBrierScore(allResults).toFixed(4);
  const overallCalibError = (calculateCalibrationError(allResults) * 100).toFixed(2);
  
  console.log('📈 OVERALL PERFORMANCE');
  console.log('-'.repeat(80));
  console.log(`Total Picks: ${totalPicks}`);
  console.log(`Win Rate: ${overallWinRate}%`);
  console.log(`Brier Score: ${overallBrier} ${parseFloat(overallBrier) < 0.20 ? '✅' : '⚠️'}`);
  console.log(`Calibration Error: ${overallCalibError > 0 ? '+' : ''}${overallCalibError}% ${Math.abs(parseFloat(overallCalibError)) < 5 ? '✅' : '⚠️'}`);
  console.log('');
  
  if (parseFloat(overallCalibError) > 8) {
    console.log('🚨 MODEL IS OVERCONFIDENT - PREDICTIONS TOO HIGH');
  } else if (parseFloat(overallCalibError) < -8) {
    console.log('🚨 MODEL IS UNDERCONFIDENT - PREDICTIONS TOO LOW');
  } else {
    console.log('✅ MODEL CALIBRATION IS ACCEPTABLE');
  }
  console.log('');
  
  // Analyze by edge tier
  console.log('🎯 PERFORMANCE BY EDGE TIER');
  console.log('-'.repeat(80));
  console.log('');
  
  for (const tier of EDGE_TIERS) {
    const tierPicks = allResults.filter(r => r.edge >= tier.min && r.edge < tier.max);
    
    if (tierPicks.length === 0) continue;
    
    const tierWins = tierPicks.filter(r => r.won).length;
    const tierWinRate = (tierWins / tierPicks.length * 100).toFixed(1);
    const tierBrier = calculateBrierScore(tierPicks).toFixed(4);
    const tierCalibError = (calculateCalibrationError(tierPicks) * 100).toFixed(2);
    const avgModelProb = (tierPicks.reduce((sum, p) => sum + p.modelProb, 0) / tierPicks.length * 100).toFixed(1);
    
    console.log(`${tier.color} ${tier.name} (${tier.min}-${tier.max}% edge)`);
    console.log(`   Sample Size: ${tierPicks.length}`);
    console.log(`   Avg Model Prob: ${avgModelProb}%`);
    console.log(`   Actual Win Rate: ${tierWinRate}%`);
    console.log(`   Calibration Error: ${tierCalibError > 0 ? '+' : ''}${tierCalibError}%`);
    console.log(`   Brier Score: ${tierBrier}`);
    
    // Recommendation
    if (Math.abs(parseFloat(tierCalibError)) > 10) {
      const direction = parseFloat(tierCalibError) > 0 ? 'DOWN' : 'UP';
      const adjustment = Math.abs(parseFloat(tierCalibError));
      console.log(`   ⚠️  RECOMMENDATION: Adjust model probs ${direction} by ~${adjustment.toFixed(0)}%`);
    } else {
      console.log(`   ✅ Well calibrated`);
    }
    console.log('');
  }
  
  // Calibration curve
  console.log('📉 CALIBRATION CURVE');
  console.log('-'.repeat(80));
  console.log('Model Prob | Actual Rate | Difference | Count | Status');
  console.log('-'.repeat(80));
  
  for (const bucket of PROB_BUCKETS) {
    const bucketPicks = allResults.filter(r => 
      r.modelProb >= bucket.min && r.modelProb < bucket.max
    );
    
    if (bucketPicks.length === 0) continue;
    
    const bucketWins = bucketPicks.filter(r => r.won).length;
    const actualRate = (bucketWins / bucketPicks.length * 100).toFixed(1);
    const avgProb = ((bucket.min + bucket.max) / 2 * 100).toFixed(1);
    const diff = (actualRate - avgProb).toFixed(1);
    const status = Math.abs(diff) < 5 ? '✅' : Math.abs(diff) < 10 ? '⚠️' : '🔴';
    
    console.log(
      `${avgProb.padStart(6)}%    | ` +
      `${actualRate.padStart(6)}%     | ` +
      `${(diff > 0 ? '+' : '') + diff.padStart(6)}%   | ` +
      `${String(bucketPicks.length).padStart(5)} | ` +
      `${status}`
    );
  }
  console.log('');
  
  // Recommendations
  console.log('💡 RECOMMENDED ACTIONS');
  console.log('-'.repeat(80));
  
  if (parseFloat(overallCalibError) > 8) {
    console.log('1. 🔴 CRITICAL: Model is significantly overconfident');
    console.log('   → Apply calibration adjustment: multiply all probabilities by 0.90');
    console.log('   → Increase MIN_EDGE threshold from 5% to 10%+');
    console.log('   → Re-fit ZINB parameters on recent data');
    console.log('');
  } else if (parseFloat(overallCalibError) > 5) {
    console.log('1. ⚠️  WARNING: Model is moderately overconfident');
    console.log('   → Apply calibration adjustment: multiply all probabilities by 0.95');
    console.log('   → Increase MIN_EDGE threshold from 5% to 7.5%+');
    console.log('');
  } else {
    console.log('1. ✅ Model calibration is within acceptable range');
    console.log('   → Continue monitoring daily');
    console.log('');
  }
  
  if (parseFloat(overallBrier) > 0.25) {
    console.log('2. 🔴 Brier score is poor (>0.25)');
    console.log('   → Model predictions are inaccurate');
    console.log('   → Consider retraining with more recent data');
    console.log('   → Review ZINB parameter assumptions');
    console.log('');
  } else if (parseFloat(overallBrier) > 0.20) {
    console.log('2. ⚠️  Brier score is marginal (0.20-0.25)');
    console.log('   → Room for improvement in prediction accuracy');
    console.log('   → Test alternative modeling approaches');
    console.log('');
  } else {
    console.log('2. ✅ Brier score indicates good prediction accuracy');
    console.log('');
  }
  
  // Plus odds analysis
  const plusOdds = allResults.filter(r => r.odds > 0);
  const minusOdds = allResults.filter(r => r.odds <= 0);
  
  if (plusOdds.length > 0 && minusOdds.length > 0) {
    const plusWR = (plusOdds.filter(r => r.won).length / plusOdds.length * 100).toFixed(1);
    const minusWR = (minusOdds.filter(r => r.won).length / minusOdds.length * 100).toFixed(1);
    
    console.log('3. ODDS ANALYSIS');
    console.log(`   Plus Odds: ${plusWR}% win rate (${plusOdds.length} picks)`);
    console.log(`   Minus Odds: ${minusWR}% win rate (${minusOdds.length} picks)`);
    
    if (parseFloat(plusWR) > parseFloat(minusWR) + 5) {
      console.log('   ✅ Plus odds are outperforming - excellent strategy');
    } else {
      console.log('   ⚠️  Plus odds not showing edge - review pricing');
    }
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🔍 NHL SOG MODEL - CALIBRATION AUDIT');
  console.log('='.repeat(80));
  
  // Get date(s) from command line or use default
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('⚠️  No date specified. Usage:');
    console.log('   node calibration-audit.mjs 2025-11-13');
    console.log('   node calibration-audit.mjs 2025-11-01 2025-11-13');
    console.log('');
    console.log('💡 TIP: First run analyze-top25-plus.mjs to grade Nov 13 picks');
    return;
  }
  
  const dates = args.length === 1 ? [args[0]] : generateDateRange(args[0], args[1]);
  
  console.log(`Analyzing ${dates.length} date(s)...\n`);
  
  let allResults = [];
  
  for (const date of dates) {
    const results = await analyzeDate(date);
    if (results) {
      allResults = allResults.concat(results);
    }
  }
  
  if (allResults.length === 0) {
    console.log('\n❌ No results to analyze. Make sure picks files exist.');
    return;
  }
  
  // Generate comprehensive report
  generateReport(allResults);
  
  // Save detailed results to file
  const outputFile = path.join(__dirname, '../../data/nhl/calibration_audit_results.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dates: dates,
    totalPicks: allResults.length,
    overallMetrics: {
      winRate: (allResults.filter(r => r.won).length / allResults.length * 100).toFixed(2),
      brierScore: calculateBrierScore(allResults).toFixed(4),
      calibrationError: (calculateCalibrationError(allResults) * 100).toFixed(2)
    },
    detailedResults: allResults
  }, null, 2));
  
  console.log(`📁 Detailed results saved to: ${outputFile}`);
  console.log('');
}

/**
 * Generate date range (helper function)
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  
  return dates;
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

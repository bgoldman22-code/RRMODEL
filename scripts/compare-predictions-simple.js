#!/usr/bin/env node
/**
 * Compare Model Predictions to Actual 2024 NFL Results
 * Simple version that loads actual results from JSON
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Team name mapping for consistency - abbreviations to full names
const teamNameMap = {
  // Full names (pass through)
  'Kansas City': 'Kansas City',
  'Baltimore': 'Baltimore',
  'Philadelphia': 'Philadelphia',
  'Green Bay': 'Green Bay',
  'Pittsburgh': 'Pittsburgh',
  'Atlanta': 'Atlanta',
  'Buffalo': 'Buffalo',
  'Arizona': 'Arizona',
  'Cincinnati': 'Cincinnati',
  'New England': 'New England',
  'New Orleans': 'New Orleans',
  'Carolina': 'Carolina',
  'Houston': 'Houston',
  'Indianapolis': 'Indianapolis',
  'Jacksonville': 'Jacksonville',
  'Miami': 'Miami',
  'Chicago': 'Chicago',
  'Tennessee': 'Tennessee',
  'Minnesota': 'Minnesota',
  'NY Giants': 'NY Giants',
  'LA Chargers': 'LA Chargers',
  'Las Vegas': 'Las Vegas',
  'Cleveland': 'Cleveland',
  'Dallas': 'Dallas',
  'Seattle': 'Seattle',
  'Denver': 'Denver',
  'Tampa Bay': 'Tampa Bay',
  'Washington': 'Washington',
  'Detroit': 'Detroit',
  'LA Rams': 'LA Rams',
  'NY Jets': 'NY Jets',
  'San Francisco': 'San Francisco',
  
  // Abbreviations to full names
  'KC': 'Kansas City',
  'BAL': 'Baltimore',
  'PHI': 'Philadelphia',
  'GB': 'Green Bay',
  'PIT': 'Pittsburgh',
  'ATL': 'Atlanta',
  'BUF': 'Buffalo',
  'ARI': 'Arizona',
  'CIN': 'Cincinnati',
  'NE': 'New England',
  'NO': 'New Orleans',
  'CAR': 'Carolina',
  'HOU': 'Houston',
  'IND': 'Indianapolis',
  'JAX': 'Jacksonville',
  'MIA': 'Miami',
  'CHI': 'Chicago',
  'TEN': 'Tennessee',
  'MIN': 'Minnesota',
  'NYG': 'NY Giants',
  'LAC': 'LA Chargers',
  'LV': 'Las Vegas',
  'CLE': 'Cleveland',
  'DAL': 'Dallas',
  'SEA': 'Seattle',
  'DEN': 'Denver',
  'TB': 'Tampa Bay',
  'WAS': 'Washington',
  'DET': 'Detroit',
  'LAR': 'LA Rams',
  'NYJ': 'NY Jets',
  'SF': 'San Francisco',
};

function normalizeTeamName(name) {
  if (!name) return '';
  const normalized = name.trim();
  return teamNameMap[normalized] || normalized;
}

function createMatchKey(week, home, away) {
  return `${week}_${normalizeTeamName(home)}_${normalizeTeamName(away)}`;
}

async function main() {
  console.log('🏈 NFL 2024 Prediction Validation\n');

  // Load actual results
  const actualResultsPath = path.join(__dirname, '..', 'data', 'nfl', '2024_actual_results.json');
  const actualResultsData = await fs.readFile(actualResultsPath, 'utf8');
  const actualResults = JSON.parse(actualResultsData);
  
  console.log(`✅ Loaded ${actualResults.length} actual game results`);

  // Load predictions
  const predictionsPath = path.join(__dirname, '..', 'backtest-results', 'nfl-2024-model-predictions.csv');
  const predictionsData = await fs.readFile(predictionsPath, 'utf8');
  const predictionLines = predictionsData.trim().split('\n');
  
  // Parse predictions (skip header)
  const predictions = [];
  for (let i = 1; i < predictionLines.length; i++) {
    const parts = predictionLines[i].split(',');
    if (parts.length < 4) continue;
    
    predictions.push({
      week: parts[0],
      date: parts[1],
      homeTeam: parts[2],
      awayTeam: parts[3],
      predictedWinner: parts[4] || '',
      confidence: parts[5] || '',
      edge: parts[6] || '',
      betRecommendation: parts[7] || '',
    });
  }
  
  console.log(`✅ Loaded ${predictions.length} predictions\n`);

  // Create lookup map for actual results
  const resultsMap = new Map();
  for (const result of actualResults) {
    const key = createMatchKey(result.week, result.home, result.away);
    resultsMap.set(key, result);
  }

  // Match predictions with actual results
  let matched = 0;
  let correct = 0;
  let incorrect = 0;
  let betsCorrect = 0;
  let betsIncorrect = 0;
  
  const weeklyStats = new Map();
  const confidenceStats = { high: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, low: { correct: 0, total: 0 } };

  for (const pred of predictions) {
    const key = createMatchKey(pred.week, pred.homeTeam, pred.awayTeam);
    const actual = resultsMap.get(key);
    
    if (!actual) continue;
    
    matched++;
    const isCorrect = normalizeTeamName(pred.predictedWinner) === normalizeTeamName(actual.winner);
    
    if (isCorrect) {
      correct++;
    } else {
      incorrect++;
    }
    
    // Track betting performance
    if (pred.betRecommendation === 'BET') {
      if (isCorrect) {
        betsCorrect++;
      } else {
        betsIncorrect++;
      }
    }
    
    // Weekly stats
    const weekNum = typeof pred.week === 'string' && isNaN(pred.week) ? pred.week : parseInt(pred.week);
    if (!weeklyStats.has(weekNum)) {
      weeklyStats.set(weekNum, { correct: 0, total: 0 });
    }
    const weekStat = weeklyStats.get(weekNum);
    weekStat.total++;
    if (isCorrect) weekStat.correct++;
    
    // Confidence stats
    const conf = parseFloat(pred.confidence);
    if (conf >= 70) {
      confidenceStats.high.total++;
      if (isCorrect) confidenceStats.high.correct++;
    } else if (conf >= 55) {
      confidenceStats.medium.total++;
      if (isCorrect) confidenceStats.medium.correct++;
    } else {
      confidenceStats.low.total++;
      if (isCorrect) confidenceStats.low.correct++;
    }
  }

  // Display results
  console.log('═'.repeat(80));
  console.log('📊 PREDICTION VALIDATION RESULTS');
  console.log('═'.repeat(80));
  console.log();
  console.log(`✅ Matched Games: ${matched}`);
  console.log(`   Correct Predictions: ${correct}`);
  console.log(`   Incorrect Predictions: ${incorrect}`);
  console.log(`   Overall Accuracy: ${(correct / matched * 100).toFixed(1)}%`);
  console.log(`   Unmatched: ${predictions.length - matched}`);
  console.log();
  
  // Weekly breakdown
  console.log('📈 ACCURACY BY WEEK:');
  const sortedWeeks = Array.from(weeklyStats.keys()).sort((a, b) => {
    if (typeof a === 'string') return 1;
    if (typeof b === 'string') return -1;
    return a - b;
  });
  
  for (const week of sortedWeeks) {
    const stat = weeklyStats.get(week);
    const pct = (stat.correct / stat.total * 100).toFixed(1);
    console.log(`   Week ${week}: ${pct}% (${stat.correct}-${stat.total - stat.correct})`);
  }
  console.log();
  
  // Confidence breakdown
  console.log('🎯 ACCURACY BY CONFIDENCE:');
  if (confidenceStats.high.total > 0) {
    console.log(`   High (70%+): ${(confidenceStats.high.correct / confidenceStats.high.total * 100).toFixed(1)}% (${confidenceStats.high.correct}/${confidenceStats.high.total})`);
  }
  if (confidenceStats.medium.total > 0) {
    console.log(`   Medium (55-70%): ${(confidenceStats.medium.correct / confidenceStats.medium.total * 100).toFixed(1)}% (${confidenceStats.medium.correct}/${confidenceStats.medium.total})`);
  }
  if (confidenceStats.low.total > 0) {
    console.log(`   Low (<55%): ${(confidenceStats.low.correct / confidenceStats.low.total * 100).toFixed(1)}% (${confidenceStats.low.correct}/${confidenceStats.low.total})`);
  }
  console.log();
  
  // Betting performance
  const totalBets = betsCorrect + betsIncorrect;
  if (totalBets > 0) {
    const roi = ((betsCorrect * 0.909 - betsIncorrect) / totalBets * 100);
    console.log('💰 BETTING PERFORMANCE (BET recommendations only):');
    console.log(`   Total Bets: ${totalBets}`);
    console.log(`   Won: ${betsCorrect}`);
    console.log(`   Lost: ${betsIncorrect}`);
    console.log(`   Record: ${betsCorrect}-${betsIncorrect}`);
    console.log(`   ROI (assuming -110 odds): ${roi.toFixed(2)}%`);
  }
  
  console.log();
  console.log('═'.repeat(80));
  console.log();
  console.log('✅ Validation complete!');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Phase 3 Individual Market Backtest
 * 
 * Runs separate backtests for Points, Rebounds, and Assists markets
 * to identify which markets have the best predictive power.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const TRAINING_DIR = join(REPO_ROOT, 'data/nba/training');
const MODELS_DIR = join(REPO_ROOT, 'data/nba/models/phase3');
const OUTPUT_DIR = join(REPO_ROOT, 'data/nba/backtests');

console.log('🎯 Phase 3 Individual Market Backtest');
console.log('Testing Points, Rebounds, Assists separately\n');

// Load models
function loadModels() {
  const files = readdirSync(MODELS_DIR);
  const overFile = files.filter(f => f.includes('pra_over') && f.endsWith('.json')).sort().reverse()[0];
  const underFile = files.filter(f => f.includes('pra_under') && f.endsWith('.json')).sort().reverse()[0];
  
  const overModel = JSON.parse(readFileSync(join(MODELS_DIR, overFile), 'utf-8'));
  const underModel = JSON.parse(readFileSync(join(MODELS_DIR, underFile), 'utf-8'));
  
  return { overModel, underModel };
}

// Load training data
function loadTrainingData() {
  const files = readdirSync(TRAINING_DIR).filter(f => f.startsWith('phase3_training_v1_') && f.endsWith('.jsonl'));
  const file = files.sort().reverse()[0];
  const filepath = join(TRAINING_DIR, file);
  
  const examples = [];
  const lines = readFileSync(filepath, 'utf-8').split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    examples.push(JSON.parse(line));
  }
  
  return examples;
}

// Sigmoid
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Scale features
function scaleFeatures(features, mean, scale) {
  return features.map((val, i) => (val - mean[i]) / scale[i]);
}

// Predict probability
function predictProbability(example, model) {
  const { feature_columns, coefficients, intercept, scaler_mean, scaler_scale } = model;
  
  const features = feature_columns.map(col => example[col] || 0);
  const scaledFeatures = scaleFeatures(features, scaler_mean, scaler_scale);
  
  let z = intercept;
  for (let i = 0; i < scaledFeatures.length; i++) {
    z += coefficients[feature_columns[i]] * scaledFeatures[i];
  }
  
  return sigmoid(z);
}

// Convert odds
function oddsToDecimal(americanOdds) {
  if (americanOdds > 0) {
    return 1 + (americanOdds / 100);
  } else {
    return 1 + (100 / Math.abs(americanOdds));
  }
}

function calculatePayout(americanOdds, stake = 1.0) {
  return stake * oddsToDecimal(americanOdds);
}

// Backtest single market
function backtestMarket(examples, market, models, confidenceThreshold = 0.55) {
  const { overModel, underModel } = models;
  
  // Filter to this market
  const marketExamples = examples.filter(ex => ex.market === market);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${market.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Examples: ${marketExamples.length}`);
  console.log(`Confidence threshold: ${confidenceThreshold}\n`);
  
  const results = [];
  let totalBets = 0;
  let wins = 0;
  let losses = 0;
  let totalStaked = 0;
  let totalReturned = 0;
  
  for (const example of marketExamples) {
    // Get probability
    let probability;
    if (example.side === 'Over') {
      probability = predictProbability(example, overModel);
    } else if (example.side === 'Under') {
      probability = predictProbability(example, underModel);
    } else {
      continue;
    }
    
    // Filter by confidence
    if (probability < confidenceThreshold) continue;
    
    totalBets++;
    totalStaked += 1.0;
    
    const won = example.result === 1;
    
    if (won) {
      wins++;
      totalReturned += calculatePayout(example.odds, 1.0);
    } else {
      losses++;
    }
    
    results.push({
      date: example.date,
      player: example.player,
      side: example.side,
      line: example.line,
      odds: example.odds,
      actual_value: example.actual_value,
      probability,
      won
    });
  }
  
  const winRate = totalBets > 0 ? wins / totalBets : 0;
  const roi = totalStaked > 0 ? ((totalReturned - totalStaked) / totalStaked) * 100 : 0;
  
  console.log(`Results:`);
  console.log(`  Total bets: ${totalBets}`);
  console.log(`  Wins: ${wins} | Losses: ${losses}`);
  console.log(`  Win rate: ${(winRate * 100).toFixed(2)}%`);
  console.log(`  Total staked: $${totalStaked.toFixed(2)}`);
  console.log(`  Total returned: $${totalReturned.toFixed(2)}`);
  console.log(`  ROI: ${roi.toFixed(2)}%`);
  
  // Analyze by confidence bucket
  console.log(`\nBy Confidence Bucket:`);
  const buckets = {
    '0.50-0.55': [],
    '0.55-0.60': [],
    '0.60-0.65': [],
    '0.65-0.70': [],
    '0.70+': []
  };
  
  for (const result of results) {
    const prob = result.probability;
    if (prob < 0.55) buckets['0.50-0.55'].push(result);
    else if (prob < 0.60) buckets['0.55-0.60'].push(result);
    else if (prob < 0.65) buckets['0.60-0.65'].push(result);
    else if (prob < 0.70) buckets['0.65-0.70'].push(result);
    else buckets['0.70+'].push(result);
  }
  
  for (const [bucket, bets] of Object.entries(buckets)) {
    if (bets.length === 0) continue;
    const bucketWins = bets.filter(b => b.won).length;
    const bucketWinRate = bucketWins / bets.length;
    console.log(`  ${bucket}: ${bets.length} bets, ${(bucketWinRate * 100).toFixed(1)}% win rate`);
  }
  
  // Analyze by side
  console.log(`\nBy Side:`);
  const overBets = results.filter(r => r.side === 'Over');
  const underBets = results.filter(r => r.side === 'Under');
  
  if (overBets.length > 0) {
    const overWins = overBets.filter(b => b.won).length;
    const overWinRate = overWins / overBets.length;
    console.log(`  Over: ${overBets.length} bets, ${(overWinRate * 100).toFixed(1)}% win rate`);
  }
  
  if (underBets.length > 0) {
    const underWins = underBets.filter(b => b.won).length;
    const underWinRate = underWins / underBets.length;
    console.log(`  Under: ${underBets.length} bets, ${(underWinRate * 100).toFixed(1)}% win rate`);
  }
  
  return {
    market,
    total_bets: totalBets,
    wins,
    losses,
    win_rate: winRate,
    total_staked: totalStaked,
    total_returned: totalReturned,
    roi,
    confidence_threshold: confidenceThreshold,
    results
  };
}

// Main
async function main() {
  console.log('Loading data...\n');
  
  const examples = loadTrainingData();
  const models = loadModels();
  
  console.log(`Loaded ${examples.length} examples`);
  
  // Run backtests for each market at different thresholds
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 THRESHOLD: 0.50 (ALL BETS)`);
  console.log(`${'='.repeat(60)}\n`);
  
  const pointsResults50 = backtestMarket(examples, 'player_points', models, 0.50);
  const reboundsResults50 = backtestMarket(examples, 'player_rebounds', models, 0.50);
  const assistsResults50 = backtestMarket(examples, 'player_assists', models, 0.50);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 THRESHOLD: 0.52`);
  console.log(`${'='.repeat(60)}\n`);
  
  const pointsResults52 = backtestMarket(examples, 'player_points', models, 0.52);
  const reboundsResults52 = backtestMarket(examples, 'player_rebounds', models, 0.52);
  const assistsResults52 = backtestMarket(examples, 'player_assists', models, 0.52);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 THRESHOLD: 0.54`);
  console.log(`${'='.repeat(60)}\n`);
  
  const pointsResults54 = backtestMarket(examples, 'player_points', models, 0.54);
  const reboundsResults54 = backtestMarket(examples, 'player_rebounds', models, 0.54);
  const assistsResults54 = backtestMarket(examples, 'player_assists', models, 0.54);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 THRESHOLD: 0.55`);
  console.log(`${'='.repeat(60)}\n`);
  
  const pointsResults55 = backtestMarket(examples, 'player_points', models, 0.55);
  const reboundsResults55 = backtestMarket(examples, 'player_rebounds', models, 0.55);
  const assistsResults55 = backtestMarket(examples, 'player_assists', models, 0.55);
  
  // Summary comparison
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 COMPREHENSIVE THRESHOLD COMPARISON`);
  console.log(`${'='.repeat(60)}\n`);
  
  const thresholds = [
    { name: '0.50', points: pointsResults50, rebounds: reboundsResults50, assists: assistsResults50 },
    { name: '0.52', points: pointsResults52, rebounds: reboundsResults52, assists: assistsResults52 },
    { name: '0.54', points: pointsResults54, rebounds: reboundsResults54, assists: assistsResults54 },
    { name: '0.55', points: pointsResults55, rebounds: reboundsResults55, assists: assistsResults55 }
  ];
  
  for (const threshold of thresholds) {
    console.log(`\nThreshold ${threshold.name}:`);
    
    const markets = [
      { name: 'Points', results: threshold.points },
      { name: 'Rebounds', results: threshold.rebounds },
      { name: 'Assists', results: threshold.assists }
    ];
    
    markets.sort((a, b) => b.results.roi - a.results.roi);
    
    for (const { name, results } of markets) {
      console.log(`  ${name.padEnd(10)} | ${results.total_bets.toString().padStart(5)} bets | ${(results.win_rate * 100).toFixed(1).padStart(5)}% WR | ${results.roi.toFixed(1).padStart(6)}% ROI`);
    }
  }
  
  // Find best combination
  let bestMarket = null;
  let bestROI = -Infinity;
  
  for (const threshold of thresholds) {
    for (const [marketName, results] of Object.entries({ Points: threshold.points, Rebounds: threshold.rebounds, Assists: threshold.assists })) {
      if (results.total_bets >= 100 && results.roi > bestROI) {
        bestROI = results.roi;
        bestMarket = `${marketName} at ${threshold.name} (${results.total_bets} bets, ${(results.win_rate * 100).toFixed(1)}% WR)`;
      }
    }
  }
  
  // Save results
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const summaryFile = join(OUTPUT_DIR, `phase3_individual_markets_v1_${dateStr}.json`);
  
  writeFileSync(summaryFile, JSON.stringify({
    version: 'v1',
    created: new Date().toISOString(),
    threshold_050: {
      points: pointsResults50,
      rebounds: reboundsResults50,
      assists: assistsResults50
    },
    threshold_052: {
      points: pointsResults52,
      rebounds: reboundsResults52,
      assists: assistsResults52
    },
    threshold_054: {
      points: pointsResults54,
      rebounds: reboundsResults54,
      assists: assistsResults54
    },
    threshold_055: {
      points: pointsResults55,
      rebounds: reboundsResults55,
      assists: assistsResults55
    }
  }, null, 2));
  
  console.log(`\n✅ Results saved: ${summaryFile}`);
  console.log(`\n🎯 Best combination: ${bestMarket} with ${bestROI.toFixed(1)}% ROI`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

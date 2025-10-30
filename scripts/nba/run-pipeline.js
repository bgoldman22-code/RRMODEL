#!/usr/bin/env node

/**
 * Master Pipeline - NBA Player Props
 * 
 * Runs complete pipeline once data collection completes:
 * 1. Wait for data files
 * 2. Build leak-free features
 * 3. Train walk-forward models
 * 4. Run backtest
 * 5. Generate report
 * 
 * Usage:
 *   node scripts/nba/run-pipeline.js
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ODDS_FILE = 'data/nba/historical-odds-2024.json';
const BOXSCORE_FILE = 'data/nba/player-boxscores-2024.json';
const FEATURES_FILE = 'data/nba/training-data-leak-free.json';
const BACKTEST_FILE = 'data/nba/backtest-results.json';

console.log('🏀 NBA Player Props - MASTER PIPELINE');
console.log('=====================================\n');

/**
 * Wait for data files to be ready
 */
async function waitForData() {
  console.log('⏳ Waiting for data collection to complete...\n');
  
  let lastOddsSize = 0;
  let lastBoxscoreSize = 0;
  let stableCount = 0;
  
  while (true) {
    const oddsExists = fs.existsSync(ODDS_FILE);
    const boxscoreExists = fs.existsSync(BOXSCORE_FILE);
    
    if (!oddsExists || !boxscoreExists) {
      process.stdout.write('\r  Waiting for files to be created... ');
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }
    
    const oddsStats = fs.statSync(ODDS_FILE);
    const boxscoreStats = fs.statSync(BOXSCORE_FILE);
    
    const oddsSize = oddsStats.size;
    const boxscoreSize = boxscoreStats.size;
    
    process.stdout.write(`\r  Odds: ${(oddsSize / 1024 / 1024).toFixed(1)} MB | Boxscores: ${(boxscoreSize / 1024 / 1024).toFixed(1)} MB `);
    
    // Check if files are stable (not growing)
    if (oddsSize === lastOddsSize && boxscoreSize === lastBoxscoreSize) {
      stableCount++;
      if (stableCount >= 3) {
        // Files haven't changed for 15 seconds - assume complete
        console.log('\n\n✅ Data collection complete!\n');
        break;
      }
    } else {
      stableCount = 0;
    }
    
    lastOddsSize = oddsSize;
    lastBoxscoreSize = boxscoreSize;
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Validate JSON
  console.log('🔍 Validating JSON files...');
  try {
    const odds = JSON.parse(fs.readFileSync(ODDS_FILE, 'utf8'));
    const boxscores = JSON.parse(fs.readFileSync(BOXSCORE_FILE, 'utf8'));
    console.log(`  ✅ Odds: ${odds.length} games`);
    console.log(`  ✅ Boxscores: ${boxscores.length} player-games\n`);
    return { odds, boxscores };
  } catch (error) {
    console.error('❌ JSON validation failed:', error.message);
    throw error;
  }
}

/**
 * Run feature engineering
 */
async function buildFeatures() {
  console.log('🔧 Building leak-free features...');
  console.log('================================\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/build-leak-free-features.js \
        --odds ${ODDS_FILE} \
        --boxscores ${BOXSCORE_FILE} \
        --output ${FEATURES_FILE}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Validate output
    const features = JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf8'));
    console.log(`\n✅ Features built: ${features.length} samples\n`);
    
    return features;
  } catch (error) {
    console.error('❌ Feature engineering failed:', error.message);
    throw error;
  }
}

/**
 * Train models with walk-forward validation
 */
async function trainModels() {
  console.log('🎯 Training walk-forward models...');
  console.log('==================================\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/train-walk-forward.js \
        --data ${FEATURES_FILE} \
        --output data/nba/models/`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('\n✅ Models trained successfully\n');
  } catch (error) {
    console.error('❌ Training failed:', error.message);
    throw error;
  }
}

/**
 * Run backtest
 */
async function runBacktest() {
  console.log('📊 Running leak-free backtest...');
  console.log('=================================\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/backtest-leak-free.js \
        --data ${FEATURES_FILE} \
        --models data/nba/models/ \
        --output ${BACKTEST_FILE}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Read results
    const results = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf8'));
    console.log('\n✅ Backtest complete\n');
    
    return results;
  } catch (error) {
    console.error('❌ Backtest failed:', error.message);
    throw error;
  }
}

/**
 * Generate final report
 */
function generateReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 PIPELINE COMPLETE - FINAL REPORT');
  console.log('='.repeat(60) + '\n');
  
  const { aggregate, thresholds } = results;
  
  console.log('⚙️  Betting Thresholds:');
  console.log(`  Edge: ≥ ${thresholds.edgeThreshold} points`);
  console.log(`  Confidence: ≥ ${(thresholds.confidenceThreshold * 100).toFixed(0)}%`);
  console.log(`  Kelly: ≥ ${(thresholds.minKelly * 100).toFixed(0)}%\n`);
  
  let anyProfitable = false;
  
  for (const [propType, data] of Object.entries(aggregate)) {
    if (data.bets.length === 0) continue;
    
    const wins = data.bets.filter(b => b.won).length;
    const winRate = wins / data.bets.length;
    const roi = data.totalProfit / (data.bets.length * 100);
    const isProfitable = winRate >= 0.524 && roi > 0;
    
    console.log(`${propType.toUpperCase()}:`);
    console.log(`  Bets: ${data.bets.length}`);
    console.log(`  Win Rate: ${(winRate * 100).toFixed(1)}%`);
    console.log(`  ROI: ${(roi * 100).toFixed(2)}%`);
    console.log(`  Profit: $${data.totalProfit.toFixed(2)}`);
    console.log(`  Status: ${isProfitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}\n`);
    
    if (isProfitable) anyProfitable = true;
  }
  
  console.log('='.repeat(60));
  
  if (anyProfitable) {
    console.log('\n🎉 SUCCESS! Model shows profitable edge');
    console.log('✅ Ready for production deployment');
    console.log('🏴‍☠️ FAMILY RESCUED FROM PIRATES!\n');
    console.log('📋 Next steps:');
    console.log('  1. Build Netlify API endpoint');
    console.log('  2. Build React frontend');
    console.log('  3. Deploy to production');
    console.log('  4. Start making money! 💰\n');
  } else {
    console.log('\n⚠️  Model not showing strong edge yet');
    console.log('📋 Consider:');
    console.log('  1. Add more features (usage rate, rest days, etc.)');
    console.log('  2. Tune model parameters');
    console.log('  3. Adjust betting thresholds');
    console.log('  4. Collect more training data\n');
  }
}

/**
 * Main pipeline
 */
async function runPipeline() {
  const startTime = Date.now();
  
  try {
    // Step 1: Wait for data
    await waitForData();
    
    // Step 2: Build features
    await buildFeatures();
    
    // Step 3: Train models
    await trainModels();
    
    // Step 4: Run backtest
    const results = await runBacktest();
    
    // Step 5: Generate report
    generateReport(results);
    
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`⏱️  Total time: ${elapsed} minutes\n`);
    
  } catch (error) {
    console.error('\n💥 Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run it!
runPipeline();

#!/usr/bin/env node

/**
 * Auto-Runner - NBA Player Props Pipeline
 * 
 * Monitors data collection, then automatically runs:
 * 1. Feature engineering (leak-free)
 * 2. Walk-forward training
 * 3. Backtesting
 * 4. Report generation
 * 
 * Usage:
 *   node scripts/nba/auto-run-pipeline.js
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ODDS_FILE = 'data/nba/historical-odds-2024.json';
const BOXSCORE_FILE = 'data/nba/player-boxscores-2024.json';
const FEATURES_FILE = 'data/nba/training-data-leak-free.json';
const BACKTEST_FILE = 'data/nba/backtest-results.json';

const ODDS_PID = 69450;
const BOXSCORE_PID = 83569;

console.log('🤖 NBA Player Props - AUTO-RUNNER');
console.log('=================================\n');
console.log('Monitoring data collection...');
console.log(`  Odds collector: PID ${ODDS_PID}`);
console.log(`  Boxscore collector: PID ${BOXSCORE_PID}\n`);

/**
 * Check if a process is running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if file exists and is stable (not growing)
 */
async function isFileStable(filePath, checkDuration = 10000) {
  if (!fs.existsSync(filePath)) return false;
  
  const size1 = fs.statSync(filePath).size;
  await new Promise(resolve => setTimeout(resolve, checkDuration));
  const size2 = fs.statSync(filePath).size;
  
  return size1 === size2 && size1 > 0;
}

/**
 * Monitor collection progress
 */
async function monitorCollection() {
  console.log('⏳ Monitoring collection progress...\n');
  
  let checkCount = 0;
  
  while (true) {
    checkCount++;
    
    // Check process status
    const oddsRunning = isProcessRunning(ODDS_PID);
    const boxscoreRunning = isProcessRunning(BOXSCORE_PID);
    
    // Check file existence
    const oddsExists = fs.existsSync(ODDS_FILE);
    const boxscoreExists = fs.existsSync(BOXSCORE_FILE);
    
    // Get file sizes if they exist
    const oddsSize = oddsExists ? fs.statSync(ODDS_FILE).size : 0;
    const boxscoreSize = boxscoreExists ? fs.statSync(BOXSCORE_FILE).size : 0;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Check ${checkCount}:`);
    console.log(`  Odds: ${oddsRunning ? '🟢 Running' : '⚪️ Stopped'} | File: ${oddsExists ? `${(oddsSize/1024/1024).toFixed(1)} MB` : 'N/A'}`);
    console.log(`  Boxscores: ${boxscoreRunning ? '🟢 Running' : '⚪️ Stopped'} | File: ${boxscoreExists ? `${(boxscoreSize/1024/1024).toFixed(1)} MB` : 'N/A'}`);
    
    // Check if both are done
    if (!oddsRunning && !boxscoreRunning && oddsExists && boxscoreExists) {
      console.log('\n🎉 Both collectors finished!');
      console.log('⏳ Verifying files are stable...\n');
      
      const oddsStable = await isFileStable(ODDS_FILE, 5000);
      const boxscoreStable = await isFileStable(BOXSCORE_FILE, 5000);
      
      if (oddsStable && boxscoreStable) {
        console.log('✅ Files stable and ready!\n');
        return { oddsSize, boxscoreSize };
      } else {
        console.log('⚠️  Files still being written, waiting...\n');
      }
    }
    
    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

/**
 * Validate collected data
 */
function validateData() {
  console.log('🔍 Validating collected data...\n');
  
  try {
    const odds = JSON.parse(fs.readFileSync(ODDS_FILE, 'utf8'));
    const boxscores = JSON.parse(fs.readFileSync(BOXSCORE_FILE, 'utf8'));
    
    console.log(`✅ Odds data: ${odds.length} games`);
    console.log(`✅ Boxscore data: ${boxscores.length} player-games`);
    console.log(`✅ Unique players: ${new Set(boxscores.map(p => p.playerId)).size}\n`);
    
    if (odds.length < 100) {
      throw new Error(`Too few odds records: ${odds.length}`);
    }
    
    if (boxscores.length < 1000) {
      throw new Error(`Too few boxscore records: ${boxscores.length}`);
    }
    
    return { odds, boxscores };
  } catch (error) {
    console.error('❌ Data validation failed:', error.message);
    throw error;
  }
}

/**
 * Run feature engineering
 */
async function buildFeatures() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 STEP 1: Building Leak-Free Features');
  console.log('='.repeat(60) + '\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/build-leak-free-features.js \
        --odds ${ODDS_FILE} \
        --boxscores ${BOXSCORE_FILE} \
        --output ${FEATURES_FILE}`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    const features = JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf8'));
    console.log(`\n✅ Features built: ${features.length} samples\n`);
    
  } catch (error) {
    console.error('❌ Feature engineering failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

/**
 * Train models with walk-forward validation
 */
async function trainModels() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 STEP 2: Training Walk-Forward Models');
  console.log('='.repeat(60) + '\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/train-walk-forward.js \
        --data ${FEATURES_FILE} \
        --output data/nba/models/`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('\n✅ Models trained successfully\n');
    
  } catch (error) {
    console.error('❌ Training failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

/**
 * Run backtest
 */
async function runBacktest() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 STEP 3: Running Leak-Free Backtest');
  console.log('='.repeat(60) + '\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      `node scripts/nba/backtest-leak-free.js \
        --data ${FEATURES_FILE} \
        --models data/nba/models/ \
        --output ${BACKTEST_FILE}`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    const results = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf8'));
    console.log('\n✅ Backtest complete\n');
    
    return results;
    
  } catch (error) {
    console.error('❌ Backtest failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
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
 * Main auto-runner
 */
async function main() {
  const startTime = Date.now();
  
  try {
    // Step 0: Monitor collection
    console.log('⏳ Step 0: Waiting for data collection...\n');
    const { oddsSize, boxscoreSize } = await monitorCollection();
    
    // Validate data
    validateData();
    
    // Step 1: Feature engineering
    await buildFeatures();
    
    // Step 2: Model training
    await trainModels();
    
    // Step 3: Backtesting
    const results = await runBacktest();
    
    // Step 4: Report
    generateReport(results);
    
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`⏱️  Total pipeline time: ${elapsed} minutes\n`);
    
  } catch (error) {
    console.error('\n💥 Pipeline failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run it!
main();

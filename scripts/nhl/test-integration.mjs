#!/usr/bin/env node

/**
 * NHL LOGGING INTEGRATION TEST
 * 
 * Tests the complete pipeline:
 * 1. Simulates opportunities from scanner
 * 2. Logs to CSV
 * 3. Simulates game completion
 * 4. Updates results
 * 5. Displays dashboard
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Import the logger
const loggerPath = join(ROOT, 'scripts/nhl/log-prediction.mjs');
const NHLPredictionLogger = (await import(loggerPath)).default;

console.log('🧪 NHL LOGGING INTEGRATION TEST\n');
console.log('='.repeat(70));

// Create test logger
const logger = new NHLPredictionLogger('2024-25-test');
const logFile = join(ROOT, 'data/nhl/logs/predictions_2024-25-test.csv');

// Test data
const testPredictions = [
  {
    player: 'Connor McDavid',
    team: 'EDM',
    opponent: 'CGY',
    position: 'C',
    line: 3.5,
    direction: 'OVER',
    predictedSOG: 4.2,
    edge: 0.7,
    edgePercent: 16.7,
    odds: -110,
    book: 'FanDuel',
    modelProb: 0.58,
    impliedProb: 0.524,
    gameStartTime: '2024-10-15T02:00:00Z',
    isHome: true,
    ppUnit: 1,
    iceTimeL5: 22.5,
    date: '2024-10-15',
    gameId: '2024020001'
  },
  {
    player: 'Auston Matthews',
    team: 'TOR',
    opponent: 'MTL',
    position: 'C',
    line: 4.5,
    direction: 'OVER',
    predictedSOG: 5.1,
    edge: 0.6,
    edgePercent: 13.3,
    odds: -115,
    book: 'DraftKings',
    modelProb: 0.56,
    impliedProb: 0.535,
    gameStartTime: '2024-10-15T23:00:00Z',
    isHome: false,
    ppUnit: 1,
    iceTimeL5: 21.8,
    date: '2024-10-15',
    gameId: '2024020002'
  },
  {
    player: 'Nathan MacKinnon',
    team: 'COL',
    opponent: 'DAL',
    position: 'C',
    line: 3.5,
    direction: 'UNDER',
    predictedSOG: 3.0,
    edge: 0.5,
    edgePercent: 14.3,
    odds: +120,
    book: 'BetMGM',
    modelProb: 0.55,
    impliedProb: 0.455,
    gameStartTime: '2024-10-15T01:00:00Z',
    isHome: true,
    ppUnit: 1,
    iceTimeL5: 23.2,
    date: '2024-10-15',
    gameId: '2024020003'
  }
];

console.log('\n📝 Step 1: Log Test Predictions');
console.log('-'.repeat(70));

try {
  logger.logPredictions(testPredictions);
  console.log(`✅ Logged ${testPredictions.length} predictions to CSV`);
  console.log(`   File: ${logFile}`);
} catch (error) {
  console.error('❌ Failed to log predictions:', error.message);
  process.exit(1);
}

console.log('\n📊 Step 2: View Logged Data');
console.log('-'.repeat(70));

const allPredictions = logger.getAllPredictions();
console.log(`✅ Retrieved ${allPredictions.length} predictions from CSV`);
console.log('\nFirst prediction:');
console.log(JSON.stringify(allPredictions[0], null, 2));

console.log('\n🎯 Step 3: Simulate Game Completion');
console.log('-'.repeat(70));

// Simulate actual SOG results
const results = [
  { gameId: '2024020001', player: 'Connor McDavid', actualSOG: 5 },  // HIT (predicted OVER 3.5)
  { gameId: '2024020002', player: 'Auston Matthews', actualSOG: 3 }, // MISS (predicted OVER 4.5)
  { gameId: '2024020003', player: 'Nathan MacKinnon', actualSOG: 2 } // HIT (predicted UNDER 3.5)
];

for (const result of results) {
  logger.updateResult(result.gameId, result.player, result.actualSOG);
  console.log(`✅ Updated ${result.player}: ${result.actualSOG} SOG`);
}

console.log('\n📈 Step 4: Calculate Metrics');
console.log('-'.repeat(70));

const metrics = logger.calculateRollingMetrics();

console.log(`Total Predictions: ${metrics.count}`);
console.log(`Win Rate: ${metrics.winRate}`);
console.log(`Mean Absolute Error: ${metrics.mae}`);
console.log(`Total ROI: ${metrics.roi}`);
console.log(`\nBy Direction:`);
console.log(`  Overs: ${metrics.overs.winRate} (${metrics.overs.count} picks)`);
console.log(`  Unders: ${metrics.unders.winRate} (${metrics.unders.count} picks)`);

console.log('\n🎯 Step 5: Verify Results');
console.log('-'.repeat(70));

const updatedPredictions = logger.getAllPredictions().filter(p => p.actualSOG !== null);

console.log(`✅ ${updatedPredictions.length} predictions have results\n`);

updatedPredictions.forEach(p => {
  const hitIcon = p.hit === 1 ? '✅' : '❌';
  const roi = p.roi !== null ? `ROI: ${(p.roi * 100).toFixed(1)}%` : 'ROI: N/A';
  console.log(`${hitIcon} ${p.player} ${p.direction} ${p.line} → ${p.actualSOG} SOG (${roi})`);
});

console.log('\n✅ INTEGRATION TEST COMPLETE');
console.log('='.repeat(70));
console.log(`\nTest file created: ${logFile}`);
console.log(`You can delete it with: rm ${logFile}`);

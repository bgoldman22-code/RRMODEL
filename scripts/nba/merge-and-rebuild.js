#!/usr/bin/env node

/**
 * Merge historical odds files and rebuild training data
 * 
 * This merges the original odds (Oct 2024 - Feb 18, 2025) with
 * the completion odds (Feb 19 - Apr 13, 2025) to create a full season dataset.
 * 
 * Usage:
 *   node scripts/nba/merge-and-rebuild.js
 */

import fs from 'fs';
import path from 'path';

console.log('🔧 NBA Odds Merge & Training Data Rebuild');
console.log('=' .repeat(60));

// File paths
const originalOdds = 'data/nba/historical-odds-2024.json';
const completionOdds = 'data/nba/historical-odds-2024-completion.json';
const mergedOdds = 'data/nba/historical-odds-2024-full.json';
const boxscores = 'data/nba/player-boxscores-2024.json';
const outputTraining = 'data/nba/training-data-leak-free-full.json';

console.log('\n📂 Loading data files...');

// Load original odds
if (!fs.existsSync(originalOdds)) {
  console.error(`❌ Original odds file not found: ${originalOdds}`);
  process.exit(1);
}
const original = JSON.parse(fs.readFileSync(originalOdds, 'utf8'));
console.log(`✅ Original odds: ${original.length} games`);

// Load completion odds
if (!fs.existsSync(completionOdds)) {
  console.error(`❌ Completion odds file not found: ${completionOdds}`);
  console.error('   Make sure odds collection has finished!');
  process.exit(1);
}
const completion = JSON.parse(fs.readFileSync(completionOdds, 'utf8'));
console.log(`✅ Completion odds: ${completion.length} games`);

// Merge (deduplicate by event_id + commence_time)
console.log('\n🔗 Merging odds...');
const seenGames = new Set();
const merged = [];

for (const game of [...original, ...completion]) {
  const key = `${game.event_id}||${game.commence_time}`;
  if (!seenGames.has(key)) {
    seenGames.add(key);
    merged.push(game);
  }
}

console.log(`✅ Merged: ${merged.length} unique games`);
console.log(`   Removed ${(original.length + completion.length) - merged.length} duplicates`);

// Save merged odds
fs.writeFileSync(mergedOdds, JSON.stringify(merged, null, 2));
console.log(`💾 Saved merged odds to ${mergedOdds}`);

// Rebuild training data
console.log('\n🏗️  Rebuilding training data...');
console.log('   This will take a few minutes...\n');

import { execSync } from 'child_process';

try {
  execSync(
    `node scripts/nba/build-leak-free-features.js --boxscores ${boxscores} --odds ${mergedOdds} --output ${outputTraining}`,
    { stdio: 'inherit' }
  );
  
  console.log('\n✅ Training data rebuilt successfully!');
  console.log(`💾 Saved to ${outputTraining}`);
  
  // Show stats
  const trainingData = JSON.parse(fs.readFileSync(outputTraining, 'utf8'));
  console.log(`\n📊 New training data stats:`);
  console.log(`   Total samples: ${trainingData.length}`);
  
  // Count by month
  const byMonth = {};
  for (const sample of trainingData) {
    const month = sample.gameDate.substring(0, 7); // YYYY-MM
    byMonth[month] = (byMonth[month] || 0) + 1;
  }
  
  console.log(`\n📅 Samples by month:`);
  Object.entries(byMonth).sort().forEach(([month, count]) => {
    console.log(`   ${month}: ${count} samples`);
  });
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎉 MERGE & REBUILD COMPLETE!');
  console.log('=' .repeat(60));
  console.log('\nNEXT STEPS:');
  console.log('1. Re-train models on full dataset');
  console.log('2. Run backtests on all 3 windows (Feb, Mar, Apr)');
  console.log('3. Validate Rebounds/Assists stay profitable');
  console.log('4. Check if Points improves with more data');
  
} catch (error) {
  console.error('\n❌ Error rebuilding training data:', error.message);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Local runner for NFL V5 Predictions
 * Usage: node scripts/nfl/run-v5-local.mjs [season] [week]
 * Example: node scripts/nfl/run-v5-local.mjs 2025 14
 * 
 * This runs the V5 prediction generation script directly without Netlify
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Parse command line args
const season = process.argv[2] || '2025';
const week = process.argv[3] || getCurrentWeek();

function getCurrentWeek() {
  const now = new Date();
  const weekStart = new Date('2024-09-05'); // Week 1 start (adjust as needed)
  const weeksDiff = Math.floor((now - weekStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(weeksDiff + 1, 1), 18);
}

if (!week) {
  console.error('❌ Week parameter is required');
  console.log('Usage: node scripts/nfl/run-v5-local.mjs [season] [week]');
  process.exit(1);
}

console.log(`\n🏈 Running NFL V5 Predictions Locally`);
console.log(`Season: ${season}, Week: ${week}\n`);

// Path to the V5 generation script
const scriptPath = join(ROOT, 'nfl-model-v4.1/scripts/generate-v5-week.mjs');
const outputPath = join(ROOT, `nfl-model-v4.1/output/bundle_v5_${season}_week${week}.json`);

console.log(`📂 Script: ${scriptPath}`);
console.log(`📂 Output: ${outputPath}\n`);

// Spawn the generation script
const child = spawn('node', [scriptPath, '--season', season, '--week', week], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

child.on('error', (error) => {
  console.error('\n❌ Failed to start V5 generation script:');
  console.error(error);
  process.exit(1);
});

child.on('close', async (code) => {
  if (code !== 0) {
    console.error(`\n❌ V5 generation script exited with code ${code}`);
    process.exit(code);
  }
  
  try {
    // Read the generated output
    console.log(`\n📖 Reading generated predictions...`);
    const bundleContent = await readFile(outputPath, 'utf-8');
    const bundle = JSON.parse(bundleContent);
    
    console.log('\n✅ V5 Predictions Generated!\n');
    console.log(`📊 Summary:`);
    console.log(`  - Season: ${bundle.season}`);
    console.log(`  - Week: ${bundle.week}`);
    console.log(`  - Total Games: ${bundle.games?.length || 0}`);
    console.log(`  - Generated At: ${bundle.generated_at}`);
    
    if (bundle.games) {
      console.log(`\n🎯 Games:`);
      bundle.games.forEach(game => {
        const spread = game.spread?.prediction || game.predicted_spread || 0;
        const total = game.total?.prediction || game.predicted_total || 0;
        console.log(`  - ${game.away_team} @ ${game.home_team}`);
        console.log(`    Spread: ${game.home_team} ${spread > 0 ? '+' : ''}${spread.toFixed(1)}`);
        console.log(`    Total: ${total.toFixed(1)}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error reading generated predictions:');
    console.error(error);
    process.exit(1);
  }
});

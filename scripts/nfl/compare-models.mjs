#!/usr/bin/env node
/**
 * Compare NFL V1 Lite (Market Odds) vs V5 (Model Predictions)
 * Usage: node scripts/nfl/compare-models.mjs [season] [week]
 * Example: node scripts/nfl/compare-models.mjs 2025 14
 * 
 * This script:
 * 1. Runs V1 Lite to get current market odds
 * 2. Runs V5 to get model predictions
 * 3. Compares them side-by-side to find edges
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Parse command line args
const season = process.argv[2] || '2025';
const week = process.argv[3] || '14';

console.log(`\n🏈 NFL Model Comparison`);
console.log(`Season: ${season}, Week: ${week}`);
console.log('='.repeat(80));
console.log('');

// Step 1: Run V1 Full (with EPA, injuries, Kelly sizing)
console.log('📊 Step 1: Running V1 Full Model...');
await runScript('scripts/nfl/run-v1-local.mjs', [season, week]);

// Step 2: Run V5 (model predictions)
console.log('\n🤖 Step 2: Generating model predictions (V5)...');
await runScript('scripts/nfl/run-v5-local.mjs', [season, week]);

// Step 3: Load both outputs
console.log('\n📖 Step 3: Loading results...');
const v1Path = join(ROOT, `nfl_v1_week${week}_predictions.json`);
const v5Path = join(ROOT, `nfl-model-v4.1/output/bundle_v5_${season}_week${week}.json`);

const v1Data = JSON.parse(await readFile(v1Path, 'utf-8'));
const v5Data = JSON.parse(await readFile(v5Path, 'utf-8'));

console.log(`✅ Loaded ${v1Data.predictions.length} market lines`);
console.log(`✅ Loaded ${v5Data.games.length} model predictions`);

// Step 4: Compare and find edges
console.log('\n🎯 Step 4: Finding edges...\n');
console.log('='.repeat(80));

const comparisons = [];

for (const v1Game of v1Data.predictions) {
  // Find matching V5 game
  const v5Game = v5Data.games.find(g => 
    (g.home_team === v1Game.home_team && g.away_team === v1Game.away_team) ||
    (g.home_team === v1Game.away_team && g.away_team === v1Game.home_team)
  );

  if (!v5Game) continue;

  // V1 predictions
  const v1Spread = v1Game.predictions?.spread?.predicted || 0;
  const v1Total = v1Game.predictions?.total?.predicted || 0;
  const v1SpreadPick = v1Game.predictions?.spread?.pick || 'unknown';
  
  // V5 predictions
  const v5Spread = v5Game.spread_model.predicted_spread;
  const v5Total = v5Game.total_model.p50;
  const v5Favorite = v5Game.spread_model.favorite_team;
  
  // Calculate edges
  const spreadEdge = Math.abs(v1Spread - v5Spread);
  const totalEdge = Math.abs(v1Total - v5Total);
  
  comparisons.push({
    matchup: `${v1Game.away_team} @ ${v1Game.home_team}`,
    v1: {
      spread: v1Spread,
      total: v1Total,
      spreadPick: v1SpreadPick,
      spreadBet: v1Game.predictions?.spread?.bet || false,
      totalBet: v1Game.predictions?.total?.bet || false
    },
    v5: {
      spread: v5Spread,
      total: v5Total,
      favorite: v5Favorite
    },
    edge: {
      spread: spreadEdge,
      total: totalEdge
    }
  });
}

// Sort by total edge (largest disagreements first)
comparisons.sort((a, b) => (b.edge.spread + b.edge.total) - (a.edge.spread + a.edge.total));

// Display results
for (const comp of comparisons) {
  console.log(`\n${comp.matchup}`);
  console.log('-'.repeat(80));
  
  // Spread comparison
  console.log(`  SPREAD:`);
  console.log(`    V1: ${comp.v1.spreadPick} (${comp.v1.spread.toFixed(1)} pts) ${comp.v1.spreadBet ? '✅ BET' : ''}`);
  console.log(`    V5: ${comp.v5.favorite} (${comp.v5.spread.toFixed(1)} pts)`);
  console.log(`    Disagreement: ${comp.edge.spread.toFixed(1)} pts ${comp.edge.spread > 3 ? '🔥' : ''}`);
  
  // Total comparison
  console.log(`  TOTAL:`);
  console.log(`    V1: ${comp.v1.total.toFixed(1)} ${comp.v1.totalBet ? '✅ BET' : ''}`);
  console.log(`    V5: ${comp.v5.total.toFixed(1)}`);
  console.log(`    Disagreement: ${comp.edge.total.toFixed(1)} pts ${comp.edge.total > 3 ? '🔥' : ''}`);
}

console.log('\n' + '='.repeat(80));
console.log(`\n✅ Analysis complete!`);
console.log(`\n💡 Legend:`);
console.log(`   ✅ BET = V1 recommends betting this line`);
console.log(`   🔥 = Models disagree by >3 points\n`);

// Helper function to run a script and wait for completion
function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const fullPath = join(ROOT, scriptPath);
    const child = spawn('node', [fullPath, ...args], {
      cwd: ROOT,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

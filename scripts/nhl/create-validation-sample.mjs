#!/usr/bin/env node

/**
 * CREATE VALIDATION SAMPLE - Last 50% of Pass 2 dates
 * 
 * This represents the most recent ~30% of all dates to validate
 * if profitable segments hold on fresh, unseen data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       📊 CREATE VALIDATION SAMPLE (Last 50% Pass 2)               ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Load Pass 2 sample
const pass2Path = path.join(REPO_ROOT, 'data/nhl/smart_player_sample_pass2.json');
const pass2Data = JSON.parse(fs.readFileSync(pass2Path, 'utf8'));

console.log(`📂 Loaded Pass 2 sample:`);
console.log(`   Total games: ${pass2Data.games.length}`);
console.log(`   Dates: ${pass2Data.dates.length}`);
console.log(`   Date range: ${pass2Data.dates[0].date} to ${pass2Data.dates[pass2Data.dates.length - 1].date}\n`);

// Sort dates chronologically
const sortedDates = pass2Data.dates.sort((a, b) => new Date(a.date) - new Date(b.date));

// Take last 50% of dates
const splitPoint = Math.floor(sortedDates.length / 2);
const validationDates = sortedDates.slice(splitPoint);

console.log(`📊 Split strategy:`);
console.log(`   Pass 2 total dates: ${sortedDates.length}`);
console.log(`   Validation dates (last 50%): ${validationDates.length}`);
console.log(`   Date range: ${validationDates[0].date} to ${validationDates[validationDates.length - 1].date}\n`);

// Extract games for validation dates
const validationDateSet = new Set(validationDates.map(d => d.date));
const validationGames = pass2Data.games.filter(g => validationDateSet.has(g.gameDate));

console.log(`📊 Validation sample:`);
console.log(`   Games: ${validationGames.length}`);
console.log(`   Dates: ${validationDates.length}\n`);

// Calculate cost estimate
const datesCost = validationDates.length * 1; // 1 credit per date
const gamesCost = validationGames.length * 10; // 10 credits per game
const totalCost = datesCost + gamesCost;

console.log(`💰 Cost estimate:`);
console.log(`   Dates: ${validationDates.length} × 1 = ${datesCost} credits`);
console.log(`   Games: ${validationGames.length} × 10 = ${gamesCost} credits`);
console.log(`   Total: ${totalCost} credits\n`);

const budget = 14060;
const percentOfBudget = (totalCost / budget * 100).toFixed(1);
console.log(`   Percentage of budget: ${percentOfBudget}%\n`);

// Create validation sample file
const validationSample = {
  strategy: 'validation_sample',
  description: 'Last 50% of Pass 2 dates (most recent ~30% of all dates)',
  generatedAt: new Date().toISOString(),
  budget: {
    available: budget,
    estimatedCost: totalCost,
    percentOfBudget: parseFloat(percentOfBudget)
  },
  sampling: {
    totalDates: validationDates.length,
    totalGames: validationGames.length,
    dateRange: {
      start: validationDates[0].date,
      end: validationDates[validationDates.length - 1].date
    }
  },
  dates: validationDates,
  games: validationGames
};

// Save validation sample
const outputPath = path.join(REPO_ROOT, 'data/nhl/validation_sample.json');
fs.writeFileSync(outputPath, JSON.stringify(validationSample, null, 2));

console.log(`✅ Validation sample created: ${outputPath}\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 CHRONOLOGICAL BREAKDOWN');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Calculate what percentage of all dates this represents
const pass1Path = path.join(REPO_ROOT, 'data/nhl/smart_player_sample_pass1.json');
const pass1Data = JSON.parse(fs.readFileSync(pass1Path, 'utf8'));

const totalAllDates = pass1Data.dates.length + pass2Data.dates.length;
const totalAllGames = pass1Data.games.length + pass2Data.games.length;

console.log(`Pass 1 (COMPLETED):`);
console.log(`   Dates: ${pass1Data.dates.length}`);
console.log(`   Games: ${pass1Data.games.length}`);
console.log(`   Date range: ${pass1Data.dates[0].date} to ${pass1Data.dates[pass1Data.dates.length - 1].date}\n`);

console.log(`Pass 2 - First Half (SKIPPED):`);
console.log(`   Dates: ${splitPoint}`);
console.log(`   Games: ${pass2Data.games.length - validationGames.length}`);
console.log(`   Date range: ${sortedDates[0].date} to ${sortedDates[splitPoint - 1].date}\n`);

console.log(`Validation Sample (WILL FETCH):`);
console.log(`   Dates: ${validationDates.length}`);
console.log(`   Games: ${validationGames.length}`);
console.log(`   Date range: ${validationDates[0].date} to ${validationDates[validationDates.length - 1].date}\n`);

console.log(`TOTAL COVERAGE:`);
console.log(`   Pass 1 + Validation = ${pass1Data.dates.length + validationDates.length} / ${totalAllDates} dates (${((pass1Data.dates.length + validationDates.length) / totalAllDates * 100).toFixed(1)}%)`);
console.log(`   Pass 1 + Validation = ${pass1Data.games.length + validationGames.length} / ${totalAllGames} games (${((pass1Data.games.length + validationGames.length) / totalAllGames * 100).toFixed(1)}%)\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 NEXT STEP');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('Execute validation sample fetch:');
console.log(`  THEODDS_API_KEY=c5d3fe15e6c5be83b2acd8695cff012b \\`);
console.log(`    node scripts/nhl/fetch-historical-odds-v2.mjs \\`);
console.log(`    --sample=validation_sample.json \\`);
console.log(`    --execute\n`);

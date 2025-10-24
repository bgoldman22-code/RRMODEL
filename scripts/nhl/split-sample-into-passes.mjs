#!/usr/bin/env node

/**
 * SPLIT SMART PLAYER SAMPLE INTO TWO PASSES
 * 
 * Pass 1 (30%): ~210 games across ~80 dates
 * - Quick validation (30-45 mins, ~2,100 credits)
 * - See results and decide whether to continue
 * 
 * Pass 2 (70%): ~490 games across ~194 dates
 * - Full validation (1.5-2 hours, ~5,000 credits)
 * - Only run if Pass 1 shows promise
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const PASS1_PERCENTAGE = 0.30;
const PASS2_PERCENTAGE = 0.70;

function main() {
  console.log('📊 Splitting smart player sample into two passes...\n');
  
  // Load the full sample
  const samplePath = path.join(REPO_ROOT, 'data/nhl/smart_player_sample.json');
  const fullSample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  
  console.log(`Full sample: ${fullSample.games.length} games across ${fullSample.dates.length} dates`);
  console.log('');
  
  // Sort games by date to ensure temporal distribution
  const sortedGames = fullSample.games.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  
  // Split into passes
  const pass1Count = Math.floor(sortedGames.length * PASS1_PERCENTAGE);
  const pass1Games = sortedGames.slice(0, pass1Count);
  const pass2Games = sortedGames.slice(pass1Count);
  
  // Get unique dates for each pass
  const pass1Dates = [...new Set(pass1Games.map(g => g.gameDate))].sort();
  const pass2Dates = [...new Set(pass2Games.map(g => g.gameDate))].sort();
  
  // Calculate costs
  const pass1Cost = pass1Dates.length * 1 + pass1Games.length * 10;
  const pass2Cost = pass2Dates.length * 1 + pass2Games.length * 10;
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('PASS 1 (30% - Quick Validation)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Games:           ${pass1Games.length}`);
  console.log(`Unique dates:    ${pass1Dates.length}`);
  console.log(`Date range:      ${pass1Dates[0]} to ${pass1Dates[pass1Dates.length - 1]}`);
  console.log(`Estimated cost:  ${pass1Cost.toLocaleString()} credits`);
  console.log(`Time estimate:   30-45 minutes`);
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('PASS 2 (70% - Full Validation)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Games:           ${pass2Games.length}`);
  console.log(`Unique dates:    ${pass2Dates.length}`);
  console.log(`Date range:      ${pass2Dates[0]} to ${pass2Dates[pass2Dates.length - 1]}`);
  console.log(`Estimated cost:  ${pass2Cost.toLocaleString()} credits`);
  console.log(`Time estimate:   1.5-2 hours`);
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('TOTAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Games:           ${pass1Games.length + pass2Games.length}`);
  console.log(`Unique dates:    ${pass1Dates.length + pass2Dates.length}`);
  console.log(`Total cost:      ${(pass1Cost + pass2Cost).toLocaleString()} credits`);
  console.log('');
  
  // Create Pass 1 sample
  const pass1Sample = {
    ...fullSample,
    strategy: "smart_player_sampling_pass1",
    pass: 1,
    totalPasses: 2,
    percentage: "30%",
    note: "First 30% of games - quick validation before committing to full run",
    games: pass1Games,
    dates: pass1Dates.map(date => ({
      date: date,
      games: pass1Games.filter(g => g.gameDate === date).length
    })),
    budget: {
      ...fullSample.budget,
      estimatedCost: pass1Cost,
      percentUsed: (pass1Cost / fullSample.budget.available * 100).toFixed(1) + "%"
    },
    sampling: {
      ...fullSample.sampling,
      totalGames: pass1Games.length,
      uniqueDates: pass1Dates.length
    }
  };
  
  // Create Pass 2 sample
  const pass2Sample = {
    ...fullSample,
    strategy: "smart_player_sampling_pass2",
    pass: 2,
    totalPasses: 2,
    percentage: "70%",
    note: "Remaining 70% of games - only run if Pass 1 shows promise (ROI > 0%)",
    games: pass2Games,
    dates: pass2Dates.map(date => ({
      date: date,
      games: pass2Games.filter(g => g.gameDate === date).length
    })),
    budget: {
      ...fullSample.budget,
      estimatedCost: pass2Cost,
      percentUsed: (pass2Cost / fullSample.budget.available * 100).toFixed(1) + "%"
    },
    sampling: {
      ...fullSample.sampling,
      totalGames: pass2Games.length,
      uniqueDates: pass2Dates.length
    }
  };
  
  // Save both passes
  const pass1Path = path.join(REPO_ROOT, 'data/nhl/smart_player_sample_pass1.json');
  const pass2Path = path.join(REPO_ROOT, 'data/nhl/smart_player_sample_pass2.json');
  
  fs.writeFileSync(pass1Path, JSON.stringify(pass1Sample, null, 2));
  fs.writeFileSync(pass2Path, JSON.stringify(pass2Sample, null, 2));
  
  console.log('💾 Saved:');
  console.log(`   Pass 1: ${pass1Path}`);
  console.log(`   Pass 2: ${pass2Path}`);
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 EXECUTION PLAN');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('1. Run Pass 1 (30%, quick validation):');
  console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs \\');
  console.log('     --sample=smart_player_sample_pass1.json --execute');
  console.log('');
  console.log('2. Analyze Pass 1 results:');
  console.log('   node scripts/nhl/market-backtest.mjs \\');
  console.log('     --odds=data/nhl/historical_odds_data_v2.json');
  console.log('');
  console.log('3. Decision gate:');
  console.log('   - If ROI < 0%: STOP (model unprofitable)');
  console.log('   - If ROI > 0%: Continue to Pass 2');
  console.log('');
  console.log('4. Run Pass 2 (70%, full validation):');
  console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs \\');
  console.log('     --sample=smart_player_sample_pass2.json --execute');
  console.log('');
  console.log('Benefits:');
  console.log('   ✓ Get results in 30-45 mins instead of 2-3 hours');
  console.log('   ✓ Stop early if model unprofitable (save 70% of credits)');
  console.log('   ✓ Make informed decision before full commitment');
  console.log('');
}

main();

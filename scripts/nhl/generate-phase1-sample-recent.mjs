#!/usr/bin/env node

/**
 * Generate Phase 1 Sample for Historical Odds Fetching (Post-May 2023 Only)
 * 
 * Strategy: Use 15% of remaining credits (14,060 credits = 1,406 games)
 * Target: ~50 dates strategically sampled from post-May 2023 period
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Configuration
const PLAYER_PROPS_START = '2023-05-03'; // When player props became available
const AVAILABLE_CREDITS = 14060; // 15% of 93,739 remaining credits
const COST_PER_GAME = 10;
const TARGET_GAMES = Math.floor(AVAILABLE_CREDITS / COST_PER_GAME); // 1,406 games
const TARGET_DATES = 6; // ~216 games/date × 6 = ~1,296 games (92% of budget)

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 PHASE 1 SAMPLE GENERATOR (POST-MAY 2023)');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('Configuration:');
console.log(`  Available credits: ${AVAILABLE_CREDITS.toLocaleString()}`);
console.log(`  Target games: ${TARGET_GAMES.toLocaleString()}`);
console.log(`  Target dates: ${TARGET_DATES}`);
console.log(`  Player props available from: ${PLAYER_PROPS_START}`);
console.log('');

// Load historical games
console.log('📂 Loading historical game data...');
const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const allGames = data.games || [];

// Filter to post-May 2023 only
const recentGames = allGames.filter(g => g.gameDate >= PLAYER_PROPS_START);
console.log(`   ✅ Loaded: ${allGames.length.toLocaleString()} total games`);
console.log(`   ✅ Post-${PLAYER_PROPS_START}: ${recentGames.length.toLocaleString()} games`);
console.log('');

// Group by date
const gamesByDate = {};
recentGames.forEach(g => {
  if (!gamesByDate[g.gameDate]) {
    gamesByDate[g.gameDate] = {
      date: g.gameDate,
      games: [],
      gameCount: 0
    };
  }
  gamesByDate[g.gameDate].games.push(g);
  gamesByDate[g.gameDate].gameCount++;
});

const allDates = Object.keys(gamesByDate).sort();
console.log(`   Unique dates: ${allDates.length}`);
console.log(`   Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}`);
console.log(`   Avg games/date: ${(recentGames.length / allDates.length).toFixed(1)}`);
console.log('');

// Stratified sampling strategy
// Group dates by season and period
const seasons = {
  '2022-2023': [],  // May-June 2023 only (playoffs)
  '2023-2024': [],  // Full season
  '2024-2025': []   // Current season
};

allDates.forEach(date => {
  const year = parseInt(date.split('-')[0]);
  const month = parseInt(date.split('-')[1]);
  
  if (date < '2023-07-01') {
    seasons['2022-2023'].push(date);
  } else if (date < '2024-07-01') {
    seasons['2023-2024'].push(date);
  } else {
    seasons['2024-2025'].push(date);
  }
});

console.log('Dates by season:');
Object.entries(seasons).forEach(([season, dates]) => {
  console.log(`  ${season}: ${dates.length} dates`);
});
console.log('');

// Allocate dates proportionally by season
const totalDatesAvailable = allDates.length;
const datesPerSeason = {};
Object.entries(seasons).forEach(([season, dates]) => {
  const proportion = dates.length / totalDatesAvailable;
  datesPerSeason[season] = Math.max(1, Math.round(TARGET_DATES * proportion));
});

console.log('Target dates per season:');
Object.entries(datesPerSeason).forEach(([season, count]) => {
  console.log(`  ${season}: ${count} dates`);
});
console.log('');

// Sample dates from each season
function sampleDatesFromSeason(dates, targetCount) {
  if (dates.length <= targetCount) {
    return dates;
  }
  
  // Stratified sampling: divide into early/mid/late periods
  const third = Math.floor(dates.length / 3);
  const earlyDates = dates.slice(0, third);
  const midDates = dates.slice(third, third * 2);
  const lateDates = dates.slice(third * 2);
  
  const sample = [];
  const perPeriod = Math.floor(targetCount / 3);
  const remainder = targetCount % 3;
  
  // Sample evenly from each period
  const earlyStep = Math.max(1, Math.floor(earlyDates.length / (perPeriod + (remainder > 0 ? 1 : 0))));
  const midStep = Math.max(1, Math.floor(midDates.length / (perPeriod + (remainder > 1 ? 1 : 0))));
  const lateStep = Math.max(1, Math.floor(lateDates.length / perPeriod));
  
  for (let i = 0; i < earlyDates.length && sample.length < perPeriod + (remainder > 0 ? 1 : 0); i += earlyStep) {
    sample.push(earlyDates[i]);
  }
  for (let i = 0; i < midDates.length && sample.length < (perPeriod * 2) + (remainder > 1 ? 2 : remainder > 0 ? 1 : 0); i += midStep) {
    sample.push(midDates[i]);
  }
  for (let i = 0; i < lateDates.length && sample.length < targetCount; i += lateStep) {
    sample.push(lateDates[i]);
  }
  
  return sample.sort();
}

const selectedDates = [];
Object.entries(seasons).forEach(([season, dates]) => {
  if (dates.length === 0) return;
  const target = datesPerSeason[season];
  const sampled = sampleDatesFromSeason(dates, target);
  selectedDates.push(...sampled);
});

selectedDates.sort();

// Calculate total games and cost
let totalGames = 0;
const dateDetails = selectedDates.map(date => {
  const info = gamesByDate[date];
  totalGames += info.gameCount;
  return {
    date: date,
    games: info.gameCount,
    season: date < '2023-07-01' ? '2022-2023' : date < '2024-07-01' ? '2023-2024' : '2024-2025'
  };
});

const totalCost = totalGames * COST_PER_GAME;
const percentOfBudget = (totalCost / AVAILABLE_CREDITS * 100).toFixed(1);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📋 PHASE 1 SAMPLE SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log(`Selected dates: ${selectedDates.length}`);
console.log(`Total games: ${totalGames.toLocaleString()}`);
console.log(`Estimated cost: ${totalCost.toLocaleString()} credits`);
console.log(`Percentage of budget: ${percentOfBudget}%`);
console.log(`Credits remaining after: ${(AVAILABLE_CREDITS - totalCost).toLocaleString()}`);
console.log('');
console.log('Games by season:');
const bySeason = {};
dateDetails.forEach(d => {
  if (!bySeason[d.season]) bySeason[d.season] = 0;
  bySeason[d.season] += d.games;
});
Object.entries(bySeason).forEach(([season, games]) => {
  console.log(`  ${season}: ${games.toLocaleString()} games`);
});
console.log('');

// Save sample
const outputPath = path.join(REPO_ROOT, 'data/nhl/phase1_sample_recent.json');
const output = {
  generated: new Date().toISOString(),
  strategy: 'stratified_sampling_post_may_2023',
  playerPropsAvailableFrom: PLAYER_PROPS_START,
  budgetCredits: AVAILABLE_CREDITS,
  costPerGame: COST_PER_GAME,
  totalDates: selectedDates.length,
  totalGames: totalGames,
  estimatedCost: totalCost,
  percentOfBudget: parseFloat(percentOfBudget),
  dates: dateDetails
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`💾 Sample saved to: ${outputPath}`);
console.log('');
console.log('First 10 dates:');
dateDetails.slice(0, 10).forEach(d => {
  console.log(`  ${d.date}: ${d.games} games (${d.season})`);
});
console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('🚀 NEXT STEPS');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('1. Test with 2 dates first:');
console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs \\');
console.log('     --sample=phase1_sample_recent.json --limit-dates=2 --execute');
console.log('');
console.log('2. Run full Phase 1 sample:');
console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs \\');
console.log('     --sample=phase1_sample_recent.json --execute');
console.log('');

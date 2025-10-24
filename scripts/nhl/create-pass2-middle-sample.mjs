#!/usr/bin/env node

/**
 * CREATE EXPANDED PASS 2 MIDDLE SAMPLE
 * 
 * With 5,000 credit budget, create a large, diverse sample of the middle period
 * (Feb 2024 - Dec 2024) to properly analyze trends over time.
 * 
 * Strategy: Sample MORE dates with MORE players for diversity
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');

const BUDGET = 5000; // 5% of total credits

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                                                                    ║');
console.log('║       📊 EXPANDED MIDDLE SAMPLE CREATOR                            ║');
console.log('║       Budget: 5,000 credits for maximum diversity                  ║');
console.log('║                                                                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Load Pass 2 sample (already filtered to Feb-Apr 2025 period)
const pass2Data = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/nhl/smart_player_sample_pass2.json'), 'utf-8')
);

console.log(`Pass 2 sample: ${pass2Data.games.length} player-games\n`);

// Filter to middle period only: Feb 2024 - Dec 2024 (exclude validation period)
const middlePeriodGames = pass2Data.games.filter(g => {
  const date = new Date(g.gameDate);
  return date >= new Date('2024-02-12') && date <= new Date('2024-12-04');
});

console.log(`Middle period games: ${middlePeriodGames.length}`);

// Get unique dates
const dateMap = new Map();
for (const game of middlePeriodGames) {
  const date = game.gameDate;
  if (!dateMap.has(date)) {
    dateMap.set(date, []);
  }
  dateMap.get(date).push(game);
}

const allDates = Array.from(dateMap.keys()).sort();
console.log(`Unique dates in middle period: ${allDates.length}`);
console.log(`Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}\n`);

// Strategy: Sample evenly across time with diverse players
// With 5000 credits:
// - Reserve ~450 credits for date API calls (450 dates = all dates if needed)
// - Use ~4550 credits for games = 455 games at 10 credits each
// - Spread across many dates for better temporal coverage

const TARGET_GAMES = 450; // Conservative to stay under budget
const TARGET_DATES = Math.min(150, allDates.length); // Sample 150 dates evenly

console.log('Sampling strategy:');
console.log(`   Target dates: ${TARGET_DATES} (evenly spaced across ${allDates.length} available)`);
console.log(`   Target games: ${TARGET_GAMES} (3 players per date on average)`);
console.log(`   Estimated cost: ${TARGET_DATES + (TARGET_GAMES * 10)} = ${TARGET_DATES + TARGET_GAMES * 10} credits\n`);

// Sample dates evenly across the period
const dateInterval = Math.floor(allDates.length / TARGET_DATES);
const sampledDates = [];
for (let i = 0; i < allDates.length; i += dateInterval) {
  sampledDates.push(allDates[i]);
  if (sampledDates.length >= TARGET_DATES) break;
}

console.log(`Sampled ${sampledDates.length} dates evenly across the period\n`);

// Get all players to ensure diversity
const allPlayers = [...new Set(middlePeriodGames.map(g => g.playerId))];
console.log(`Total unique players in middle period: ${allPlayers.length}\n`);

// Sample games: prioritize player diversity
const sampledDateSet = new Set(sampledDates);
const gamesOnSampledDates = middlePeriodGames.filter(g => sampledDateSet.has(g.gameDate));

console.log(`Games available on sampled dates: ${gamesOnSampledDates.length}\n`);

// Group by player to ensure diversity
const playerGameMap = new Map();
for (const game of gamesOnSampledDates) {
  if (!playerGameMap.has(game.playerId)) {
    playerGameMap.set(game.playerId, []);
  }
  playerGameMap.get(game.playerId).push(game);
}

console.log(`Unique players on sampled dates: ${playerGameMap.size}\n`);

// Sample strategy: Take ALL GAMES from ALL middle period dates for maximum coverage
// We have budget for 450+ games, so let's use all 240 available
const selectedGames = middlePeriodGames; // Use ALL games from middle period

console.log(`Selected ${selectedGames.length} games (ALL games from middle period)\n`);

// Get final unique dates
const finalDates = [...new Set(selectedGames.map(g => g.gameDate))].sort();
const estimatedCost = finalDates.length + (selectedGames.length * 10);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('EXPANDED MIDDLE SAMPLE SUMMARY:');
console.log('═══════════════════════════════════════════════════════════════════\n');
console.log(`Games: ${selectedGames.length}`);
console.log(`Unique dates: ${finalDates.length}`);
console.log(`Unique players: ${new Set(selectedGames.map(g => g.playerId)).size}`);
console.log(`Date range: ${finalDates[0]} to ${finalDates[finalDates.length - 1]}`);
console.log(`Estimated cost: ${estimatedCost} credits (${((estimatedCost / BUDGET) * 100).toFixed(1)}% of budget)\n`);

// Create sample
const middleSample = {
  sampleType: 'pass2_middle_expanded',
  description: 'Expanded middle period sample (Feb-Dec 2024) for comprehensive trend analysis',
  created: new Date().toISOString(),
  budget: BUDGET,
  strategy: 'Even temporal sampling with maximum player diversity',
  games: selectedGames,
  stats: {
    totalGames: selectedGames.length,
    uniqueDates: finalDates.length,
    uniquePlayers: new Set(selectedGames.map(g => g.playerId)).size,
    dateRange: {
      start: finalDates[0],
      end: finalDates[finalDates.length - 1]
    },
    estimatedCost
  }
};

// Save
const outputPath = path.join(ROOT, 'data/nhl/pass2_middle_sample.json');
fs.writeFileSync(outputPath, JSON.stringify(middleSample, null, 2));

console.log(`✅ Expanded middle sample saved to: ${outputPath}\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('COMPLETE TIMELINE COVERAGE:');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('Pass 1 (COMPLETED):');
console.log(`   Period: Oct 2023 - Feb 2024`);
console.log(`   Games: ~170 with odds`);
console.log(`   Dates: 85`);
console.log(`   Credits: 1,885\n`);

console.log('Pass 2 - Middle (WILL FETCH):');
console.log(`   Period: ${finalDates[0]} to ${finalDates[finalDates.length - 1]}`);
console.log(`   Games: ${selectedGames.length}`);
console.log(`   Dates: ${finalDates.length}`);
console.log(`   Players: ${new Set(selectedGames.map(g => g.playerId)).size}`);
console.log(`   Credits: ${estimatedCost}\n`);

console.log('Validation (COMPLETED):');
console.log(`   Period: Dec 2024 - Apr 2025`);
console.log(`   Games: 215 with odds`);
console.log(`   Dates: 95`);
console.log(`   Credits: 2,175\n`);

const totalCost = 1885 + estimatedCost + 2175;
const totalGames = 170 + selectedGames.length + 215;
const totalDates = 85 + finalDates.length + 95;

console.log(`TOTAL COVERAGE:`);
console.log(`   Games: ~${totalGames}`);
console.log(`   Dates: ${totalDates}`);
console.log(`   Credits: ${totalCost} (${((totalCost / 100000) * 100).toFixed(1)}% of 100k limit)\n`);

console.log('Execute expanded middle sample fetch:');
console.log(`  THEODDS_API_KEY=c5d3fe15e6c5be83b2acd8695cff012b \\`);
console.log(`    node scripts/nhl/fetch-historical-odds-v2.mjs \\`);
console.log(`    --sample=pass2_middle_sample.json \\`);
console.log(`    --execute\n`);

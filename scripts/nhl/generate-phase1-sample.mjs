#!/usr/bin/env node

/**
 * PHASE 1 SAMPLE GENERATOR
 * 
 * Generates stratified random sample of 30 dates for minimal-cost validation
 * 
 * Strategy:
 * - 6 dates per season (2021-2025)
 * - Stratified by time of season (early/mid/late)
 * - Excludes All-Star weekend, playoffs
 * - Prefers dates with 8+ games (more data per API call)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load historical games
const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const allGames = data.games || [];

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                                                                    ║');
console.log('║       📊 PHASE 1 SAMPLE GENERATOR (30 Dates)                      ║');
console.log('║                                                                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log('');

// Group games by date
const gamesByDate = {};
allGames.forEach(g => {
  if (!gamesByDate[g.gameDate]) {
    gamesByDate[g.gameDate] = [];
  }
  gamesByDate[g.gameDate].push(g);
});

const allDates = Object.keys(gamesByDate).sort();
console.log(`Total dates available: ${allDates.length}`);
console.log(`Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}`);
console.log('');

// Define season boundaries (regular season only, no playoffs)
const seasonBoundaries = {
  '2021': { start: '2021-10-12', end: '2022-04-29', asg: '2022-02-05' },
  '2022': { start: '2022-10-07', end: '2023-04-13', asg: '2023-02-04' },
  '2023': { start: '2023-10-10', end: '2024-04-18', asg: '2024-02-03' },
  '2024': { start: '2024-10-04', end: '2025-04-17', asg: '2025-02-01' },
};

// Categorize dates by season and period
function getSeason(date) {
  const year = date.substring(0, 4);
  if (seasonBoundaries[year]) {
    const bounds = seasonBoundaries[year];
    if (date >= bounds.start && date <= bounds.end) {
      return year;
    }
  }
  return null;
}

function getSeasonPeriod(date, season) {
  const bounds = seasonBoundaries[season];
  const start = new Date(bounds.start);
  const end = new Date(bounds.end);
  const current = new Date(date);
  
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysSinceStart = (current - start) / (1000 * 60 * 60 * 24);
  const progress = daysSinceStart / totalDays;
  
  if (progress < 0.33) return 'early';
  if (progress < 0.67) return 'mid';
  return 'late';
}

function isValidDate(date, season) {
  const bounds = seasonBoundaries[season];
  if (!bounds) return false;
  
  // Exclude All-Star weekend (±2 days)
  const asg = new Date(bounds.asg);
  const dateObj = new Date(date);
  const daysDiff = Math.abs((dateObj - asg) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 2) return false;
  
  // Exclude Mondays (low game volume)
  if (dateObj.getDay() === 1) return false;
  
  // Prefer dates with 8+ games
  const gamesOnDate = gamesByDate[date].length;
  if (gamesOnDate < 5) return false;
  
  return true;
}

// Organize dates by season and period
const datesBySeasonPeriod = {};
allDates.forEach(date => {
  const season = getSeason(date);
  if (!season) return;
  
  if (!isValidDate(date, season)) return;
  
  const period = getSeasonPeriod(date, season);
  const key = `${season}-${period}`;
  
  if (!datesBySeasonPeriod[key]) {
    datesBySeasonPeriod[key] = [];
  }
  
  datesBySeasonPeriod[key].push({
    date,
    games: gamesByDate[date].length,
    season,
    period
  });
});

console.log('Valid dates by season and period:');
Object.keys(datesBySeasonPeriod).sort().forEach(key => {
  console.log(`   ${key}: ${datesBySeasonPeriod[key].length} dates`);
});
console.log('');

// Sample 2 dates from each season-period combination
const selectedDates = [];
const seasons = Object.keys(seasonBoundaries);

seasons.forEach(season => {
  console.log(`Sampling Season ${season}:`);
  
  ['early', 'mid', 'late'].forEach(period => {
    const key = `${season}-${period}`;
    const candidates = datesBySeasonPeriod[key] || [];
    
    if (candidates.length === 0) {
      console.log(`   ${period}: No valid dates`);
      return;
    }
    
    // Sort by number of games (prefer high-volume dates)
    candidates.sort((a, b) => b.games - a.games);
    
    // Sample 2 random dates from top 50% by volume
    const topHalf = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.5)));
    const sample = [];
    
    for (let i = 0; i < 2 && i < topHalf.length; i++) {
      const randomIdx = Math.floor(Math.random() * topHalf.length);
      const selected = topHalf.splice(randomIdx, 1)[0];
      sample.push(selected);
      selectedDates.push(selected);
    }
    
    console.log(`   ${period}: ${sample.map(d => `${d.date} (${d.games} games)`).join(', ')}`);
  });
  
  console.log('');
});

// Sort by date
selectedDates.sort((a, b) => a.date.localeCompare(b.date));

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 PHASE 1 SAMPLE SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log(`Total dates selected: ${selectedDates.length}`);
console.log(`Total games: ${selectedDates.reduce((sum, d) => sum + d.games, 0)}`);
console.log(`Date range: ${selectedDates[0].date} to ${selectedDates[selectedDates.length - 1].date}`);
console.log('');

// Calculate expected predictions
const totalPlayers = selectedDates.reduce((sum, d) => sum + d.games, 0);
const avgPlayersPerGame = 40; // ~20 per team
const expectedPredictions = totalPlayers * avgPlayersPerGame;

console.log('Expected API usage:');
console.log(`   API calls: ${selectedDates.length} (1 per date)`);
console.log(`   Expected predictions: ~${expectedPredictions.toLocaleString()}`);
console.log(`   Credits (estimate): ${selectedDates.length * 50} - ${selectedDates.length * 100}`);
console.log('');

// Save to file
const outputPath = path.join(REPO_ROOT, 'data/nhl/phase1_sample_dates.json');
const output = {
  phase: 1,
  strategy: 'stratified_random',
  generatedAt: new Date().toISOString(),
  totalDates: selectedDates.length,
  expectedPredictions: expectedPredictions,
  estimatedCredits: { min: selectedDates.length * 50, max: selectedDates.length * 100 },
  dates: selectedDates.map(d => ({
    date: d.date,
    games: d.games,
    season: d.season,
    period: d.period
  }))
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`💾 Sample saved to: ${outputPath}`);
console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('🚀 NEXT STEP:');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('Fetch historical odds for these dates:');
console.log('');
console.log('  THEODDS_API_KEY=your-key node scripts/nhl/fetch-historical-odds.mjs \\');
console.log('    --sample=phase1_sample_dates.json');
console.log('');

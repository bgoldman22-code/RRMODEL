#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load historical game data
const gameDataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
const gameData = JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));
const allGames = gameData.games || [];

// Filter to test period
const testGames = allGames.filter(g => 
  g.gameDate >= '2025-10-15' && g.gameDate <= '2025-11-13'
);

console.log('📊 Historical Game Data Check');
console.log('═'.repeat(60));
console.log(`Total games in dataset: ${allGames.length.toLocaleString()}`);
console.log(`Games in Oct 15 - Nov 13, 2025: ${testGames.length.toLocaleString()}`);
console.log('');

if (testGames.length > 0) {
  // Group by date
  const byDate = {};
  testGames.forEach(g => {
    if (!byDate[g.gameDate]) byDate[g.gameDate] = [];
    byDate[g.gameDate].push(g);
  });
  
  const dates = Object.keys(byDate).sort();
  console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`Unique dates: ${dates.length}`);
  console.log(`Avg games per date: ${Math.round(testGames.length / dates.length)}`);
  console.log('');
  
  console.log('Sample game:');
  const sample = testGames[0];
  console.log(`  Date: ${sample.gameDate}`);
  console.log(`  Player: ${sample.playerName} (${sample.team})`);
  console.log(`  Opponent: ${sample.opponent} ${sample.isHome ? '(Home)' : '(Away)'}`);
  console.log(`  Actual SOG: ${sample.shots}`);
  console.log('');
  
  // Check if we have stats
  const withStats = testGames.filter(g => g.L10_avg_sog && g.L10_toi);
  console.log(`Games with L10 stats: ${withStats.length} (${(withStats.length/testGames.length*100).toFixed(1)}%)`);
} else {
  console.log('⚠️  No games found in this date range!');
  console.log('');
  
  // Check what's the latest date we have
  const latestDate = Math.max(...allGames.map(g => new Date(g.gameDate)));
  console.log(`Latest game in dataset: ${new Date(latestDate).toISOString().split('T')[0]}`);
}

// Load odds data
const oddsDataPath = path.join(REPO_ROOT, 'data/nhl/odds_2025-26_oct-nov.json');
if (fs.existsSync(oddsDataPath)) {
  const oddsData = JSON.parse(fs.readFileSync(oddsDataPath, 'utf8'));
  console.log('');
  console.log('📈 Odds Data Check');
  console.log('═'.repeat(60));
  console.log(`Total games with odds: ${oddsData.data.length}`);
  console.log(`Games with bookmakers: ${oddsData.gamesWithOdds}`);
  console.log(`Credits used: ${oddsData.creditsUsed}`);
}

#!/usr/bin/env node

/**
 * NBA Historical Data Collector
 * 
 * Fetches historical game results for training
 * Stores in data/nba/games/
 */

import { promises as fs } from 'fs';
import { join } from 'path';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

/**
 * Fetch games for a specific date
 */
async function fetchGamesForDate(date) {
  const dateStr = date.replace(/-/g, ''); // YYYYMMDD
  const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const games = (data.events || []).map(event => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      // Only include completed games
      if (competition.status.type.completed) {
        return {
          gameId: event.id,
          date: event.date.split('T')[0],
          homeTeamId: parseInt(homeTeam.team.id),
          awayTeamId: parseInt(awayTeam.team.id),
          homeScore: parseInt(homeTeam.score),
          awayScore: parseInt(awayTeam.score),
          season: getSeason(event.date),
          homeTeam: homeTeam.team.abbreviation,
          awayTeam: awayTeam.team.abbreviation
        };
      }
      
      return null;
    }).filter(g => g !== null);
    
    return games;
    
  } catch (error) {
    console.error(`Error fetching games for ${date}:`, error.message);
    return [];
  }
}

/**
 * Determine season from date
 */
function getSeason(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  // NBA season runs Oct-June
  // Oct-Dec = current year season (2024-25)
  // Jan-June = previous year season (2024-25)
  if (month >= 10) {
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Generate date range
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Main collection function
 */
async function collectHistoricalData(startDate, endDate) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📊  NBA HISTORICAL DATA COLLECTOR                          ║
║                                                               ║
║   Fetching games from ${startDate} to ${endDate}           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  // Generate date range
  const dates = generateDateRange(startDate, endDate);
  console.log(`\n📅 Collecting ${dates.length} days of data...\n`);
  
  const allGames = [];
  let processed = 0;
  
  // Fetch in batches to avoid rate limiting
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    
    // Show progress
    if (i % 10 === 0 || i === dates.length - 1) {
      const percent = ((i + 1) / dates.length * 100).toFixed(1);
      process.stdout.write(`\rProgress: ${i + 1}/${dates.length} (${percent}%) - ${allGames.length} games found`);
    }
    
    const games = await fetchGamesForDate(date);
    allGames.push(...games);
    processed++;
    
    // Rate limiting: wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n\n✅ Collection complete: ${allGames.length} games\n`);
  
  // Group by season
  const bySeason = {};
  for (const game of allGames) {
    if (!bySeason[game.season]) {
      bySeason[game.season] = [];
    }
    bySeason[game.season].push(game);
  }
  
  // Save to files
  console.log('💾 Saving to files...\n');
  
  const dataDir = join(process.cwd(), 'data', 'nba', 'games');
  await fs.mkdir(dataDir, { recursive: true });
  
  for (const [season, games] of Object.entries(bySeason)) {
    const filename = `games_${season.replace('-', '_')}.json`;
    const filepath = join(dataDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(games, null, 2));
    
    console.log(`   ✓ ${filename}: ${games.length} games`);
  }
  
  // Save summary
  const summary = {
    collected: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    totalGames: allGames.length,
    seasons: Object.entries(bySeason).map(([season, games]) => ({
      season,
      games: games.length
    }))
  };
  
  await fs.writeFile(
    join(dataDir, 'collection_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total Games: ${allGames.length}`);
  console.log(`   Seasons: ${Object.keys(bySeason).length}`);
  console.log(`   Date Range: ${startDate} to ${endDate}`);
  console.log(`\n✅ Data saved to: data/nba/games/\n`);
  
  return summary;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
Usage: node scripts/collect-nba-data.js <start-date> <end-date>

Examples:
  # Collect 2023-24 season (Oct 2023 - Apr 2024)
  node scripts/collect-nba-data.js 2023-10-01 2024-04-30
  
  # Collect 2024-25 season so far
  node scripts/collect-nba-data.js 2024-10-01 2025-01-01
  
  # Collect both seasons
  node scripts/collect-nba-data.js 2023-10-01 2025-01-01

Date format: YYYY-MM-DD
`);
  process.exit(1);
}

const startDate = args[0];
const endDate = args[1];

// Validate dates
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
  console.error('❌ Invalid date format. Use YYYY-MM-DD');
  process.exit(1);
}

// Run collection
collectHistoricalData(startDate, endDate)
  .then(() => {
    console.log('🎉 Collection complete! Ready to train models.\n');
    console.log('Next step: node scripts/train-nba-models.js\n');
  })
  .catch(error => {
    console.error('❌ Collection failed:', error);
    process.exit(1);
  });

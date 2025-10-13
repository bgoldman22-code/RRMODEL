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
 * Fetch detailed stats for a single game
 */
async function fetchGameDetails(gameId) {
  const url = `${ESPN_BASE}/summary?event=${gameId}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const boxscore = data.boxscore;
    if (!boxscore || !boxscore.teams) {
      return null;
    }
    
    // Extract team stats
    const teams = boxscore.teams;
    const stats = {};
    
    for (const team of teams) {
      const teamStats = {};
      const homeAway = team.homeAway;
      
      // Get team statistics
      if (team.statistics) {
        for (const stat of team.statistics) {
          const name = stat.name;
          const value = parseFloat(stat.displayValue) || 0;
          
          // Map to our feature names
          if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
            const [made, attempted] = stat.displayValue.split('-').map(Number);
            teamStats.fgm = made;
            teamStats.fga = attempted;
            teamStats.fgPct = attempted > 0 ? made / attempted : 0;
          } else if (name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
            const [made, attempted] = stat.displayValue.split('-').map(Number);
            teamStats.fg3m = made;
            teamStats.fg3a = attempted;
            teamStats.fg3Pct = attempted > 0 ? made / attempted : 0;
          } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
            const [made, attempted] = stat.displayValue.split('-').map(Number);
            teamStats.ftm = made;
            teamStats.fta = attempted;
            teamStats.ftPct = attempted > 0 ? made / attempted : 0;
          } else if (name === 'totalRebounds') {
            teamStats.rebounds = value;
          } else if (name === 'offensiveRebounds') {
            teamStats.offRebounds = value;
          } else if (name === 'defensiveRebounds') {
            teamStats.defRebounds = value;
          } else if (name === 'assists') {
            teamStats.assists = value;
          } else if (name === 'steals') {
            teamStats.steals = value;
          } else if (name === 'blocks') {
            teamStats.blocks = value;
          } else if (name === 'turnovers') {
            teamStats.turnovers = value;
          } else if (name === 'fouls') {
            teamStats.fouls = value;
          }
        }
      }
      
      stats[homeAway] = teamStats;
    }
    
    return stats;
    
  } catch (error) {
    console.error(`Error fetching details for game ${gameId}:`, error.message);
    return null;
  }
}

/**
 * Fetch games for a specific date with detailed stats
 */
async function fetchGamesForDate(date) {
  const dateStr = date.replace(/-/g, ''); // YYYYMMDD
  const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const games = [];
    
    for (const event of (data.events || [])) {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      // Only include completed games
      if (competition.status.type.completed) {
        // Fetch detailed stats
        const details = await fetchGameDetails(event.id);
        
        const game = {
          gameId: event.id,
          date: event.date.split('T')[0],
          season: getSeason(event.date),
          homeTeamId: parseInt(homeTeam.team.id),
          homeTeam: homeTeam.team.abbreviation,
          homeTeamName: homeTeam.team.displayName,
          awayTeamId: parseInt(awayTeam.team.id),
          awayTeam: awayTeam.team.abbreviation,
          awayTeamName: awayTeam.team.displayName,
          homeScore: parseInt(homeTeam.score),
          awayScore: parseInt(awayTeam.score),
          homeStats: details?.home || {},
          awayStats: details?.away || {},
          venue: competition.venue?.fullName,
          attendance: competition.attendance
        };
        
        games.push(game);
        
        // Rate limit for detail fetches
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
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
    const percent = ((i + 1) / dates.length * 100).toFixed(1);
    process.stdout.write(`\rProgress: ${i + 1}/${dates.length} (${percent}%) - ${allGames.length} games found (fetching detailed stats...)`);
    
    const games = await fetchGamesForDate(date);
    allGames.push(...games);
    processed++;
    
    // Rate limiting: wait 500ms between date requests (already waiting 300ms per game detail)
    await new Promise(resolve => setTimeout(resolve, 500));
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

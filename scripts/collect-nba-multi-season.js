#!/usr/bin/env node

/**
 * NBA Multi-Season Data Collector
 * 
 * Collects 3 seasons of historical data for temporal weighting
 * Includes detailed game logs for opponent-adjusted statistics
 * 
 * Data collected:
 * - Game results (scores, dates, teams)
 * - Box scores (basic and advanced stats)
 * - Team stats per game (for opponent adjustments)
 * - Season summaries
 */

import { promises as fs } from 'fs';
import { join } from 'path';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const NBA_STATS_BASE = 'https://stats.nba.com/stats';

// NBA Stats API headers
const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com'
};

/**
 * Fetch games for a specific date with detailed stats
 */
async function fetchGamesForDate(date) {
  const dateStr = date.replace(/-/g, '');
  const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const games = [];
    
    for (const event of data.events || []) {
      const competition = event.competitions[0];
      
      // Only include completed games
      if (!competition.status.type.completed) continue;
      
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      // Extract detailed stats if available
      const homeStats = homeTeam.statistics || [];
      const awayStats = awayTeam.statistics || [];
      
      const game = {
        gameId: event.id,
        date: event.date.split('T')[0],
        season: getSeason(event.date),
        
        // Teams
        homeTeamId: parseInt(homeTeam.team.id),
        homeTeam: homeTeam.team.abbreviation,
        homeTeamName: homeTeam.team.displayName,
        awayTeamId: parseInt(awayTeam.team.id),
        awayTeam: awayTeam.team.abbreviation,
        awayTeamName: awayTeam.team.displayName,
        
        // Scores
        homeScore: parseInt(homeTeam.score),
        awayScore: parseInt(awayTeam.score),
        
        // Stats for opponent adjustments
        homeStats: parseTeamStats(homeStats),
        awayStats: parseTeamStats(awayStats),
        
        // Metadata
        venue: competition.venue?.fullName || 'Unknown',
        attendance: competition.attendance || null
      };
      
      games.push(game);
    }
    
    return games;
    
  } catch (error) {
    console.error(`Error fetching ${date}:`, error.message);
    return [];
  }
}

/**
 * Parse team statistics from ESPN data
 */
function parseTeamStats(statsArray) {
  const stats = {};
  
  for (const stat of statsArray) {
    const name = stat.name;
    const value = parseFloat(stat.displayValue);
    
    // Map ESPN stat names to our naming convention
    if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fgm = made;
      stats.fga = attempted;
      stats.fgPct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fg3m = made;
      stats.fg3a = attempted;
      stats.fg3Pct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.ftm = made;
      stats.fta = attempted;
      stats.ftPct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'totalRebounds') {
      stats.rebounds = value;
    } else if (name === 'offensiveRebounds') {
      stats.offRebounds = value;
    } else if (name === 'defensiveRebounds') {
      stats.defRebounds = value;
    } else if (name === 'assists') {
      stats.assists = value;
    } else if (name === 'steals') {
      stats.steals = value;
    } else if (name === 'blocks') {
      stats.blocks = value;
    } else if (name === 'turnovers') {
      stats.turnovers = value;
    } else if (name === 'totalTurnovers') {
      stats.turnovers = value;
    }
  }
  
  return stats;
}

/**
 * Determine season from date
 */
function getSeason(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  // NBA season runs Oct-June
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
 * Calculate aggregated stats per season
 */
function calculateSeasonAggregates(games) {
  const aggregates = {
    totalGames: games.length,
    teams: {}
  };
  
  // Aggregate by team
  for (const game of games) {
    // Home team
    if (!aggregates.teams[game.homeTeamId]) {
      aggregates.teams[game.homeTeamId] = {
        teamId: game.homeTeamId,
        abbreviation: game.homeTeam,
        name: game.homeTeamName,
        games: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        stats: initializeTeamStats()
      };
    }
    
    const homeTeam = aggregates.teams[game.homeTeamId];
    homeTeam.games++;
    homeTeam.wins += game.homeScore > game.awayScore ? 1 : 0;
    homeTeam.losses += game.homeScore < game.awayScore ? 1 : 0;
    homeTeam.pointsFor += game.homeScore;
    homeTeam.pointsAgainst += game.awayScore;
    
    // Add game stats
    for (const [key, value] of Object.entries(game.homeStats)) {
      if (typeof value === 'number') {
        homeTeam.stats[key] = (homeTeam.stats[key] || 0) + value;
      }
    }
    
    // Away team
    if (!aggregates.teams[game.awayTeamId]) {
      aggregates.teams[game.awayTeamId] = {
        teamId: game.awayTeamId,
        abbreviation: game.awayTeam,
        name: game.awayTeamName,
        games: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        stats: initializeTeamStats()
      };
    }
    
    const awayTeam = aggregates.teams[game.awayTeamId];
    awayTeam.games++;
    awayTeam.wins += game.awayScore > game.homeScore ? 1 : 0;
    awayTeam.losses += game.awayScore < game.homeScore ? 1 : 0;
    awayTeam.pointsFor += game.awayScore;
    awayTeam.pointsAgainst += game.homeScore;
    
    // Add game stats
    for (const [key, value] of Object.entries(game.awayStats)) {
      if (typeof value === 'number') {
        awayTeam.stats[key] = (awayTeam.stats[key] || 0) + value;
      }
    }
  }
  
  // Calculate per-game averages
  for (const team of Object.values(aggregates.teams)) {
    team.ppg = team.pointsFor / team.games;
    team.oppPpg = team.pointsAgainst / team.games;
    team.winPct = team.wins / team.games;
    
    for (const [key, value] of Object.entries(team.stats)) {
      team.stats[key] = value / team.games;
    }
  }
  
  return aggregates;
}

/**
 * Initialize team stats object
 */
function initializeTeamStats() {
  return {
    fgm: 0,
    fga: 0,
    fgPct: 0,
    fg3m: 0,
    fg3a: 0,
    fg3Pct: 0,
    ftm: 0,
    fta: 0,
    ftPct: 0,
    rebounds: 0,
    offRebounds: 0,
    defRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0
  };
}

/**
 * Main collection function
 */
async function collectMultiSeasonData() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📊  NBA MULTI-SEASON DATA COLLECTOR                        ║
║                                                               ║
║   Collecting 3 Seasons for Temporal Weighting                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  // Define 3 seasons to collect
  const seasons = [
    { name: '2022-23', start: '2022-10-18', end: '2023-04-09' },
    { name: '2023-24', start: '2023-10-24', end: '2024-04-14' },
    { name: '2024-25', start: '2024-10-22', end: '2025-04-13' } // Current season
  ];
  
  const dataDir = join(process.cwd(), 'data', 'nba', 'games');
  await fs.mkdir(dataDir, { recursive: true });
  
  const allSeasonSummaries = [];
  
  for (const season of seasons) {
    console.log(`\n📅 Collecting ${season.name} season...`);
    console.log(`   Date range: ${season.start} to ${season.end}`);
    
    const dates = generateDateRange(season.start, season.end);
    console.log(`   ${dates.length} days to check\n`);
    
    const games = [];
    let processed = 0;
    
    // Fetch in batches
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      
      // Show progress every 10 days
      if (i % 10 === 0 || i === dates.length - 1) {
        const percent = ((i + 1) / dates.length * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${i + 1}/${dates.length} (${percent}%) - ${games.length} games found`);
      }
      
      const dayGames = await fetchGamesForDate(date);
      games.push(...dayGames);
      processed++;
      
      // Rate limiting: 250ms between requests
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    console.log(`\n   ✅ ${games.length} games collected\n`);
    
    // Calculate aggregates
    console.log('   📊 Calculating season aggregates...');
    const aggregates = calculateSeasonAggregates(games);
    
    // Save games
    const gamesFile = `games_${season.name.replace('-', '_')}.json`;
    const gamesPath = join(dataDir, gamesFile);
    await fs.writeFile(gamesPath, JSON.stringify(games, null, 2));
    console.log(`   ✓ Saved: ${gamesFile}`);
    
    // Save aggregates
    const aggFile = `aggregates_${season.name.replace('-', '_')}.json`;
    const aggPath = join(dataDir, aggFile);
    await fs.writeFile(aggPath, JSON.stringify(aggregates, null, 2));
    console.log(`   ✓ Saved: ${aggFile}`);
    
    allSeasonSummaries.push({
      season: season.name,
      games: games.length,
      teams: Object.keys(aggregates.teams).length,
      dateRange: { start: season.start, end: season.end }
    });
  }
  
  // Save overall summary
  const summary = {
    collected: new Date().toISOString(),
    seasons: allSeasonSummaries,
    totalGames: allSeasonSummaries.reduce((sum, s) => sum + s.games, 0),
    purpose: 'Multi-season data for temporal weighting and opponent adjustments'
  };
  
  await fs.writeFile(
    join(dataDir, 'multi_season_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log(`\n
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ✅  MULTI-SEASON COLLECTION COMPLETE                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📊 Summary:
`);
  
  for (const season of allSeasonSummaries) {
    console.log(`   ${season.season}: ${season.games} games`);
  }
  
  console.log(`\n   Total: ${summary.totalGames} games across 3 seasons`);
  console.log(`   Saved to: data/nba/games/\n`);
  
  return summary;
}

// Run collection
collectMultiSeasonData()
  .then(() => {
    console.log('🎉 Ready for training with temporal weighting!\n');
    console.log('Next: node scripts/train-nba-models.js\n');
  })
  .catch(error => {
    console.error('❌ Collection failed:', error);
    process.exit(1);
  });

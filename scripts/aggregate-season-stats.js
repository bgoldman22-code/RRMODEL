#!/usr/bin/env node

/**
 * Aggregate Season Statistics
 * 
 * Processes all collected games and calculates:
 * - Season totals and averages per team
 * - League-wide averages (for opponent adjustments)
 * - Strength of schedule
 * - Team rankings
 */

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Load all games for a season
 */
async function loadSeasonGames(season) {
  const filename = `games_${season.replace('-', '_')}.json`;
  const filepath = join(process.cwd(), 'data', 'nba', 'games', filename);
  
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.log(`   ℹ️ No data for ${season}: ${error.message}`);
    return [];
  }
}

/**
 * Calculate team statistics from games
 */
function calculateTeamStats(games, teamId) {
  const teamGames = games.filter(g => 
    g.homeTeamId === teamId || g.awayTeamId === teamId
  );
  
  if (teamGames.length === 0) return null;
  
  const stats = {
    games: teamGames.length,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    homeGames: 0,
    awayGames: 0,
    
    // Shooting
    fgm: 0, fga: 0,
    fg3m: 0, fg3a: 0,
    ftm: 0, fta: 0,
    
    // Other stats
    rebounds: 0,
    offRebounds: 0,
    defRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    
    // Opponent stats (for defensive metrics)
    opp_fgm: 0, opp_fga: 0,
    opp_fg3m: 0, opp_fg3a: 0,
    opp_pointsFor: 0,
    opp_rebounds: 0,
    opp_assists: 0,
    opp_turnovers: 0
  };
  
  for (const game of teamGames) {
    const isHome = game.homeTeamId === teamId;
    
    if (isHome) {
      stats.homeGames++;
      stats.pointsFor += game.homeScore;
      stats.pointsAgainst += game.awayScore;
      stats.wins += game.homeScore > game.awayScore ? 1 : 0;
      stats.losses += game.homeScore < game.awayScore ? 1 : 0;
      
      // Team stats
      const s = game.homeStats;
      stats.fgm += s.fgm || 0;
      stats.fga += s.fga || 0;
      stats.fg3m += s.fg3m || 0;
      stats.fg3a += s.fg3a || 0;
      stats.ftm += s.ftm || 0;
      stats.fta += s.fta || 0;
      stats.rebounds += s.rebounds || 0;
      stats.offRebounds += s.offRebounds || 0;
      stats.defRebounds += s.defRebounds || 0;
      stats.assists += s.assists || 0;
      stats.steals += s.steals || 0;
      stats.blocks += s.blocks || 0;
      stats.turnovers += s.turnovers || 0;
      
      // Opponent stats
      const opp = game.awayStats;
      stats.opp_fgm += opp.fgm || 0;
      stats.opp_fga += opp.fga || 0;
      stats.opp_fg3m += opp.fg3m || 0;
      stats.opp_fg3a += opp.fg3a || 0;
      stats.opp_pointsFor += game.awayScore;
      stats.opp_rebounds += opp.rebounds || 0;
      stats.opp_assists += opp.assists || 0;
      stats.opp_turnovers += opp.turnovers || 0;
      
    } else {
      stats.awayGames++;
      stats.pointsFor += game.awayScore;
      stats.pointsAgainst += game.homeScore;
      stats.wins += game.awayScore > game.homeScore ? 1 : 0;
      stats.losses += game.awayScore < game.homeScore ? 1 : 0;
      
      // Team stats
      const s = game.awayStats;
      stats.fgm += s.fgm || 0;
      stats.fga += s.fga || 0;
      stats.fg3m += s.fg3m || 0;
      stats.fg3a += s.fg3a || 0;
      stats.ftm += s.ftm || 0;
      stats.fta += s.fta || 0;
      stats.rebounds += s.rebounds || 0;
      stats.offRebounds += s.offRebounds || 0;
      stats.defRebounds += s.defRebounds || 0;
      stats.assists += s.assists || 0;
      stats.steals += s.steals || 0;
      stats.blocks += s.blocks || 0;
      stats.turnovers += s.turnovers || 0;
      
      // Opponent stats
      const opp = game.homeStats;
      stats.opp_fgm += opp.fgm || 0;
      stats.opp_fga += opp.fga || 0;
      stats.opp_fg3m += opp.fg3m || 0;
      stats.opp_fg3a += opp.fg3a || 0;
      stats.opp_pointsFor += game.homeScore;
      stats.opp_rebounds += opp.rebounds || 0;
      stats.opp_assists += opp.assists || 0;
      stats.opp_turnovers += opp.turnovers || 0;
    }
  }
  
  // Calculate per-game averages
  const g = stats.games;
  
  return {
    games: g,
    record: `${stats.wins}-${stats.losses}`,
    winPct: stats.wins / g,
    
    // Per game averages
    ppg: stats.pointsFor / g,
    oppPpg: stats.pointsAgainst / g,
    
    fgPct: stats.fga > 0 ? stats.fgm / stats.fga : 0,
    fg3Pct: stats.fg3a > 0 ? stats.fg3m / stats.fg3a : 0,
    ftPct: stats.fta > 0 ? stats.ftm / stats.fta : 0,
    
    fgmPG: stats.fgm / g,
    fgaPG: stats.fga / g,
    fg3mPG: stats.fg3m / g,
    fg3aPG: stats.fg3a / g,
    ftmPG: stats.ftm / g,
    ftaPG: stats.fta / g,
    
    rebPG: stats.rebounds / g,
    offRebPG: stats.offRebounds / g,
    defRebPG: stats.defRebounds / g,
    astPG: stats.assists / g,
    stlPG: stats.steals / g,
    blkPG: stats.blocks / g,
    tovPG: stats.turnovers / g,
    
    // Defensive stats (opponent averages)
    oppFgPct: stats.opp_fga > 0 ? stats.opp_fgm / stats.opp_fga : 0,
    oppFg3Pct: stats.opp_fg3a > 0 ? stats.opp_fg3m / stats.opp_fg3a : 0,
    oppRebPG: stats.opp_rebounds / g,
    oppAstPG: stats.opp_assists / g,
    oppTovPG: stats.opp_turnovers / g,
    
    // Ratings (simplified - actual calculation needs possessions)
    offRating: (stats.pointsFor / g) * 100 / 100, // Placeholder
    defRating: (stats.pointsAgainst / g) * 100 / 100, // Placeholder
    netRating: (stats.pointsFor - stats.pointsAgainst) / g,
    
    // Home/Away splits
    homePct: stats.homeGames / g,
    awayPct: stats.awayGames / g
  };
}

/**
 * Calculate league averages
 */
function calculateLeagueAverages(teamStats) {
  const teams = Object.values(teamStats);
  const n = teams.length;
  
  if (n === 0) return {};
  
  const avg = {
    ppg: 0,
    fgPct: 0,
    fg3Pct: 0,
    ftPct: 0,
    rebPG: 0,
    astPG: 0,
    tovPG: 0,
    offRating: 0,
    defRating: 0
  };
  
  for (const team of teams) {
    avg.ppg += team.ppg;
    avg.fgPct += team.fgPct;
    avg.fg3Pct += team.fg3Pct;
    avg.ftPct += team.ftPct;
    avg.rebPG += team.rebPG;
    avg.astPG += team.astPG;
    avg.tovPG += team.tovPG;
    avg.offRating += team.offRating;
    avg.defRating += team.defRating;
  }
  
  for (const key in avg) {
    avg[key] /= n;
  }
  
  return avg;
}

/**
 * Main aggregation
 */
async function aggregateSeasonStats() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📊  NBA SEASON AGGREGATION                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  const seasons = ['2022-23', '2023-24', '2024-25'];
  const dataDir = join(process.cwd(), 'data', 'nba', 'games');
  
  for (const season of seasons) {
    console.log(`\n📅 Processing ${season}...`);
    
    const games = await loadSeasonGames(season);
    
    if (games.length === 0) {
      console.log(`   ⏭️  Skipping (no games found)\n`);
      continue;
    }
    
    console.log(`   Games: ${games.length}`);
    
    // Get unique team IDs
    const teamIds = new Set();
    for (const game of games) {
      teamIds.add(game.homeTeamId);
      teamIds.add(game.awayTeamId);
    }
    
    console.log(`   Teams: ${teamIds.size}`);
    
    // Calculate stats for each team
    const teamStats = {};
    for (const teamId of teamIds) {
      const stats = calculateTeamStats(games, teamId);
      if (stats) {
        teamStats[teamId] = stats;
      }
    }
    
    // Calculate league averages
    const leagueAvg = calculateLeagueAverages(teamStats);
    
    // Save aggregates
    const aggregates = {
      season,
      updated: new Date().toISOString(),
      games: games.length,
      teams: teamStats,
      leagueAverages: leagueAvg
    };
    
    const filename = `aggregates_${season.replace('-', '_')}.json`;
    const filepath = join(dataDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(aggregates, null, 2));
    console.log(`   ✅ Saved: ${filename}`);
  }
  
  console.log(`\n✅ Aggregation complete!\n`);
}

// Run
aggregateSeasonStats()
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

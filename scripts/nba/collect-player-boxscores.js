/**
 * NBA Player Boxscore Collector
 * 
 * Fetches player-level game logs from NBA CDN for model training
 * 
 * Usage:
 *   node scripts/nba/collect-player-boxscores.js --season 2024 --output data/nba/player-boxscores-2024.json
 * 
 * Output: JSON array of player game logs with stats + context
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const season = args[args.indexOf('--season') + 1] || '2024'; // 2024 = 2024-25 season
const outputPath = args[args.indexOf('--output') + 1] || 
  path.join(__dirname, `../../data/nba/player-boxscores-${season}.json`);

const RATE_LIMIT_MS = 500; // 2 requests/second to be nice to NBA CDN
const MAX_RETRIES = 3;

/**
 * Fetch boxscore for a single game
 */
async function fetchBoxscore(gameId, retries = 0) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Game doesn't exist (future game or wrong ID)
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.game;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.log(`[Retry ${retries + 1}/${MAX_RETRIES}] ${gameId}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
      return fetchBoxscore(gameId, retries + 1);
    }
    console.error(`[FAILED] ${gameId}: ${error.message}`);
    return null;
  }
}

/**
 * Extract player stats from boxscore
 */
function extractPlayerStats(game) {
  const players = [];
  const gameDate = game.gameTimeUTC.split('T')[0];
  const homeTeamId = game.homeTeam.teamId;
  const awayTeamId = game.awayTeam.teamId;
  const homeScore = game.homeTeam.score;
  const awayScore = game.awayTeam.score;
  
  // Process home team players
  for (const player of game.homeTeam.players) {
    if (player.played === '1') {
      players.push({
        gameId: game.gameId,
        gameDate,
        playerId: player.personId,
        playerName: player.name,
        teamId: homeTeamId,
        teamTricode: game.homeTeam.teamTricode,
        opponentId: awayTeamId,
        opponentTricode: game.awayTeam.teamTricode,
        homeAway: 'home',
        position: player.position,
        starter: player.starter === '1',
        teamScore: homeScore,
        opponentScore: awayScore,
        won: homeScore > awayScore,
        
        // Key stats for props
        minutes: parseMinutes(player.statistics.minutesCalculated),
        points: player.statistics.points,
        rebounds: player.statistics.reboundsTotal,
        reboundsOff: player.statistics.reboundsOffensive,
        reboundsDef: player.statistics.reboundsDefensive,
        assists: player.statistics.assists,
        steals: player.statistics.steals,
        blocks: player.statistics.blocks,
        turnovers: player.statistics.turnovers,
        threePointersMade: player.statistics.threePointersMade,
        
        // Usage indicators
        fga: player.statistics.fieldGoalsAttempted,
        fgm: player.statistics.fieldGoalsMade,
        fta: player.statistics.freeThrowsAttempted,
        ftm: player.statistics.freeThrowsMade,
        threepa: player.statistics.threePointersAttempted,
        
        // Efficiency
        fgPct: player.statistics.fieldGoalsPercentage,
        threePct: player.statistics.threePointersPercentage,
        ftPct: player.statistics.freeThrowsPercentage,
        
        // Advanced
        plusMinus: player.statistics.plusMinusPoints
      });
    }
  }
  
  // Process away team players
  for (const player of game.awayTeam.players) {
    if (player.played === '1') {
      players.push({
        gameId: game.gameId,
        gameDate,
        playerId: player.personId,
        playerName: player.name,
        teamId: awayTeamId,
        teamTricode: game.awayTeam.teamTricode,
        opponentId: homeTeamId,
        opponentTricode: game.homeTeam.teamTricode,
        homeAway: 'away',
        position: player.position,
        starter: player.starter === '1',
        teamScore: awayScore,
        opponentScore: homeScore,
        won: awayScore > homeScore,
        
        minutes: parseMinutes(player.statistics.minutesCalculated),
        points: player.statistics.points,
        rebounds: player.statistics.reboundsTotal,
        reboundsOff: player.statistics.reboundsOffensive,
        reboundsDef: player.statistics.reboundsDefensive,
        assists: player.statistics.assists,
        steals: player.statistics.steals,
        blocks: player.statistics.blocks,
        turnovers: player.statistics.turnovers,
        threePointersMade: player.statistics.threePointersMade,
        
        fga: player.statistics.fieldGoalsAttempted,
        fgm: player.statistics.fieldGoalsMade,
        fta: player.statistics.freeThrowsAttempted,
        ftm: player.statistics.freeThrowsMade,
        threepa: player.statistics.threePointersAttempted,
        
        fgPct: player.statistics.fieldGoalsPercentage,
        threePct: player.statistics.threePointersPercentage,
        ftPct: player.statistics.freeThrowsPercentage,
        
        plusMinus: player.statistics.plusMinusPoints
      });
    }
  }
  
  return players;
}

/**
 * Parse ISO 8601 duration to minutes
 */
function parseMinutes(duration) {
  if (!duration || duration === 'PT0M') return 0;
  const match = duration.match(/PT(\d+)M/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Generate game IDs for a season
 */
function generateGameIds(season) {
  const seasonCode = season.toString().slice(-2); // '2024' → '24'
  const gameIds = [];
  
  // Regular season: ~1,230 games
  // Game IDs: 002{season}00001 to 002{season}01230
  for (let i = 1; i <= 1230; i++) {
    const gameNum = i.toString().padStart(5, '0');
    gameIds.push(`002${seasonCode}${gameNum}`);
  }
  
  return gameIds;
}

/**
 * Main execution
 */
async function main() {
  console.log(`[NBA Player Boxscores] Collecting ${season}-${parseInt(season)+1} season...`);
  console.log(`[NBA Player Boxscores] Output: ${outputPath}`);
  
  const gameIds = generateGameIds(season);
  const allPlayerGames = [];
  let gamesProcessed = 0;
  let gamesFailed = 0;
  
  console.log(`[NBA Player Boxscores] Generated ${gameIds.length} game IDs to check`);
  
  for (const gameId of gameIds) {
    const game = await fetchBoxscore(gameId);
    
    if (game) {
      const players = extractPlayerStats(game);
      allPlayerGames.push(...players);
      gamesProcessed++;
      
      if (gamesProcessed % 50 === 0) {
        console.log(`[Progress] ${gamesProcessed} games | ${allPlayerGames.length} player-games | ${gamesFailed} failed`);
      }
    } else {
      gamesFailed++;
      
      // If we hit 10 consecutive 404s, assume we've reached end of season
      if (gamesFailed >= 10) {
        console.log(`[NBA Player Boxscores] Hit 10 consecutive failures - assuming end of available games`);
        break;
      }
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
  }
  
  console.log(`\n[NBA Player Boxscores] Collection complete!`);
  console.log(`  Games processed: ${gamesProcessed}`);
  console.log(`  Player-games: ${allPlayerGames.length}`);
  console.log(`  Unique players: ${new Set(allPlayerGames.map(p => p.playerId)).size}`);
  
  // Save to file
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(allPlayerGames, null, 2));
  console.log(`\n✅ Saved to: ${outputPath}`);
  console.log(`📊 File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);

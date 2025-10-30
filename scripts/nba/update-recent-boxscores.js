/**
 * Update Recent Boxscores
 * 
 * Fetches boxscores for the last N days from NBA CDN and updates the data file
 * 
 * Usage:
 *   node scripts/nba/update-recent-boxscores.js --days 30 --output data/nba/player-boxscores-2024.json
 * 
 * This runs daily via GitHub Actions to keep boxscores fresh without huge file commits
 */

import fetch from 'node-fetch';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// Parse CLI args
const args = process.argv.slice(2);
const daysBack = parseInt(args[args.indexOf('--days') + 1] || '30');
const outputPath = args[args.indexOf('--output') + 1] || 'data/nba/player-boxscores-2024.json';

const RATE_LIMIT_MS = 500; // Be nice to NBA CDN
const MAX_RETRIES = 3;

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse minutes string (MM:SS) to decimal
 */
function parseMinutes(minutesStr) {
  if (!minutesStr || minutesStr === 'PT00M00.00S') return 0;
  const match = minutesStr.match(/PT(\d+)M([\d.]+)S/);
  if (!match) return 0;
  return parseInt(match[1]) + parseFloat(match[2]) / 60;
}

/**
 * Fetch boxscore for a single game
 */
async function fetchBoxscore(gameId, retries = 0) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Game doesn't exist
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.game;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      await sleep(2000 * (retries + 1));
      return fetchBoxscore(gameId, retries + 1);
    }
    return null;
  }
}

/**
 * Fetch scoreboard for a specific date to get game IDs
 */
async function fetchScoreboard(dateStr) {
  // Format: YYYYMMDD
  const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.scoreboard.games.map(g => g.gameId);
  } catch (error) {
    console.error(`Failed to fetch scoreboard for ${dateStr}: ${error.message}`);
    return [];
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
        date: gameDate,
        player: player.name,
        team: game.homeTeam.teamTricode,
        opponent: game.awayTeam.teamTricode,
        home: true,
        minutes: parseMinutes(player.statistics.minutesCalculated),
        points: player.statistics.points,
        rebounds: player.statistics.reboundsTotal,
        assists: player.statistics.assists,
        steals: player.statistics.steals,
        blocks: player.statistics.blocks,
        turnovers: player.statistics.turnovers
      });
    }
  }
  
  // Process away team players
  for (const player of game.awayTeam.players) {
    if (player.played === '1') {
      players.push({
        date: gameDate,
        player: player.name,
        team: game.awayTeam.teamTricode,
        opponent: game.homeTeam.teamTricode,
        home: false,
        minutes: parseMinutes(player.statistics.minutesCalculated),
        points: player.statistics.points,
        rebounds: player.statistics.reboundsTotal,
        assists: player.statistics.assists,
        steals: player.statistics.steals,
        blocks: player.statistics.blocks,
        turnovers: player.statistics.turnovers
      });
    }
  }
  
  return players;
}

/**
 * Main update function
 */
async function updateRecentBoxscores() {
  console.log(`🏀 Updating Boxscores (last ${daysBack} days)`);
  console.log('='.repeat(60));
  
  // Load existing boxscores
  let existingBoxscores = [];
  if (existsSync(outputPath)) {
    existingBoxscores = JSON.parse(await readFile(outputPath, 'utf-8'));
    console.log(`📁 Loaded ${existingBoxscores.length} existing entries`);
  }
  
  // Create a map of existing games by date+player
  const existingMap = new Map();
  for (const entry of existingBoxscores) {
    const key = `${entry.date}_${entry.player}`;
    existingMap.set(key, entry);
  }
  
  // Fetch recent games
  const newEntries = [];
  const today = new Date();
  
  console.log('\n📥 Fetching recent games from NBA CDN...');
  
  // For simplicity, we'll generate game IDs based on date patterns
  // NBA game IDs follow format: 00YYMMDD{gameNum} where gameNum is 001-015
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '').substring(2); // YYMMDD
    
    // Try up to 15 games per day
    for (let gameNum = 1; gameNum <= 15; gameNum++) {
      const gameId = `00${dateStr}${String(gameNum).padStart(3, '0')}`;
      
      const game = await fetchBoxscore(gameId);
      if (game && game.gameStatus === 3) { // Status 3 = Final
        const playerStats = extractPlayerStats(game);
        
        for (const stat of playerStats) {
          const key = `${stat.date}_${stat.player}`;
          if (!existingMap.has(key)) {
            newEntries.push(stat);
            existingMap.set(key, stat);
          }
        }
        
        console.log(`  ✅ ${gameId}: ${playerStats.length} players`);
      }
      
      await sleep(RATE_LIMIT_MS);
    }
  }
  
  console.log(`\n📊 Found ${newEntries.length} new entries`);
  
  if (newEntries.length === 0) {
    console.log('✅ No new games to add. Boxscores are up to date!');
    return;
  }
  
  // Merge and sort
  const allBoxscores = [...existingBoxscores, ...newEntries].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  // Keep only current season (remove very old data)
  const seasonStart = new Date('2024-10-01'); // Adjust per season
  const filteredBoxscores = allBoxscores.filter(b => new Date(b.date) >= seasonStart);
  
  // Save
  await writeFile(outputPath, JSON.stringify(filteredBoxscores, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ UPDATE COMPLETE');
  console.log('='.repeat(60));
  console.log(`📊 Total entries: ${filteredBoxscores.length}`);
  console.log(`📊 New entries added: ${newEntries.length}`);
  console.log(`📊 Old entries removed: ${allBoxscores.length - filteredBoxscores.length}`);
}

// Run
updateRecentBoxscores().catch(error => {
  console.error('❌ Update failed:', error);
  process.exit(1);
});

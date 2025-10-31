/**
 * Fetch October 2025 NBA games from NBA CDN API
 * Merge with existing historical data
 */

import { readFile, writeFile } from 'fs/promises';
import fetch from 'node-fetch';

const EXISTING_DATA_PATH = '/tmp/player-boxscores-2024.json';
const OUTPUT_PATH = '/tmp/player-boxscores-2024.json';

async function fetchScoreboard(date) {
  const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    
    if (data.scoreboard.gameDate === date) {
      return data.scoreboard.games.map(g => g.gameId);
    }
    return [];
  } catch (error) {
    console.error('Error fetching scoreboard:', error.message);
    return [];
  }
}

async function fetchBoxscore(gameId) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    return null;
  }
}

function extractPlayerStats(boxscoreData) {
  const players = [];
  const game = boxscoreData.game;
  
  if (!game || game.gameStatus !== 3) return []; // Only completed games
  
  const gameDate = game.gameTimeUTC.split('T')[0];
  const gameId = game.gameId;
  
  const processTeam = (team, homeAway) => {
    if (!team.players) return;
    
    for (const player of team.players) {
      // Include all players who played (status field check removed for flexibility)
      if (!player.played || player.played === '0') continue;
      
      const stats = player.statistics || {};
      const mins = stats.minutesCalculated || stats.minutes || '0:00';
      
      // Convert PT30M33.00S to minutes
      let minutes = 0;
      if (typeof mins === 'string') {
        if (mins.startsWith('PT')) {
          const match = mins.match(/PT(\d+)M([\d.]+)?S?/);
          if (match) {
            minutes = parseInt(match[1] || 0) + parseFloat(match[2] || 0) / 60;
          }
        } else if (mins.includes(':')) {
          const [m, s] = mins.split(':').map(Number);
          minutes = m + (s || 0) / 60;
        } else {
          minutes = parseFloat(mins) || 0;
        }
      } else {
        minutes = parseFloat(mins) || 0;
      }
      
      // Round to 1 decimal place
      minutes = Math.round(minutes * 10) / 10;
      
      players.push({
        gameId: gameId,
        gameDate: gameDate,
        playerId: parseInt(player.personId) || 0,
        playerName: player.name || `${player.firstName} ${player.familyName}`,
        teamId: parseInt(team.teamId) || 0,
        teamTricode: team.teamTricode,
        opponentId: homeAway === 'home' ? parseInt(boxscoreData.game.awayTeam.teamId) : parseInt(boxscoreData.game.homeTeam.teamId),
        opponentTricode: homeAway === 'home' ? boxscoreData.game.awayTeam.teamTricode : boxscoreData.game.homeTeam.teamTricode,
        homeAway: homeAway,
        position: player.position || '',
        starter: player.starter === '1',
        teamScore: parseInt(team.score) || 0,
        opponentScore: homeAway === 'home' ? (parseInt(boxscoreData.game.awayTeam.score) || 0) : (parseInt(boxscoreData.game.homeTeam.score) || 0),
        won: homeAway === 'home' ? 
          (parseInt(team.score) > parseInt(boxscoreData.game.awayTeam.score)) : 
          (parseInt(team.score) > parseInt(boxscoreData.game.homeTeam.score)),
        minutes: Math.round(minutes * 10) / 10,
        points: parseInt(stats.points) || 0,
        rebounds: parseInt(stats.reboundsTotal) || 0,
        reboundsOff: parseInt(stats.reboundsOffensive) || 0,
        reboundsDef: parseInt(stats.reboundsDefensive) || 0,
        assists: parseInt(stats.assists) || 0,
        steals: parseInt(stats.steals) || 0,
        blocks: parseInt(stats.blocks) || 0,
        turnovers: parseInt(stats.turnovers) || 0,
        threePointersMade: parseInt(stats.threePointersMade) || 0,
        fga: parseInt(stats.fieldGoalsAttempted) || 0,
        fgm: parseInt(stats.fieldGoalsMade) || 0,
        fta: parseInt(stats.freeThrowsAttempted) || 0,
        ftm: parseInt(stats.freeThrowsMade) || 0,
        threepa: parseInt(stats.threePointersAttempted) || 0,
        fgPct: parseFloat(stats.fieldGoalsPercentage) || 0,
        threePct: parseFloat(stats.threePointersPercentage) || 0,
        ftPct: parseFloat(stats.freeThrowsPercentage) || 0,
        plusMinus: parseInt(stats.plusMinusPoints) || 0
      });
    }
  };
  
  processTeam(game.homeTeam, 'home');
  processTeam(game.awayTeam, 'away');
  
  return players;
}

async function fetchGamesForDateRange(startDate, endDate) {
  console.log(`\n🔍 Fetching games from ${startDate} to ${endDate}...`);
  
  const allPlayers = [];
  
  // NBA uses sequential game IDs for the season
  // 2024-25 season format: 0022500XXX where XXX is sequential (001-1230+)
  // Oct 22 opening night would be around game 001-010
  // Oct 30 would be around game 100-150 (roughly 10 days * 10-15 games/day)
  
  console.log('🔍 Fetching 2024-25 season games (Oct 21-30, 2025)...');
  const gameIdsToTry = [];
  
  // Try sequential game IDs from 001 to 200 (covers first ~20 days of season)
  for (let gameNum = 1; gameNum <= 200; gameNum++) {
    gameIdsToTry.push(`00225${String(gameNum).padStart(5, '0')}`);
  }
  
  console.log(`   Trying ${gameIdsToTry.length} potential game IDs...`);
  
  let gamesFound = 0;
  const targetStart = new Date('2025-10-21');
  const targetEnd = new Date('2025-10-30');
  
  for (const gameId of gameIdsToTry) {
    const boxscore = await fetchBoxscore(gameId);
    
    if (boxscore && boxscore.game?.gameStatus === 3) {
      const gameDate = new Date(boxscore.game.gameTimeUTC.split('T')[0]);
      
      // Only include games in our target date range
      if (gameDate >= targetStart && gameDate <= targetEnd) {
        const players = extractPlayerStats(boxscore);
        if (players.length > 0) {
          allPlayers.push(...players);
          gamesFound++;
          const game = boxscore.game;
          console.log(`   ✅ ${game.gameTimeUTC.split('T')[0]}: ${game.awayTeam.teamTricode} @ ${game.homeTeam.teamTricode} (${players.length} players)`);
        }
      } else if (gameDate > targetEnd) {
        // Past our range, can stop searching
        console.log(`   ℹ️  Reached games beyond Oct 30, stopping search...`);
        break;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 150)); // Rate limit
  }
  
  console.log(`\n✅ Found ${gamesFound} completed games with ${allPlayers.length} player stats`);
  
  return allPlayers;
}

async function main() {
  console.log('🏀 NBA October 2025 Data Fetcher\n');
  
  // Load existing data
  console.log('📂 Loading existing historical data...');
  const existingData = JSON.parse(await readFile(EXISTING_DATA_PATH, 'utf-8'));
  console.log(`✅ Loaded ${existingData.length} existing records`);
  
  // Fetch October 2025 games
  const newData = await fetchGamesForDateRange('2025-10-21', '2025-10-30');
  
  if (newData.length === 0) {
    console.log('\n⚠️  No new data found. Keeping existing data unchanged.');
    return;
  }
  
  // Remove any existing Oct 2025 data (in case of re-run)
  const filteredExisting = existingData.filter(b => {
    const date = new Date(b.gameDate);
    return !(date >= new Date('2025-10-21') && date <= new Date('2025-10-30'));
  });
  console.log(`\n🗑️  Removed ${existingData.length - filteredExisting.length} old Oct 21-30, 2025 records`);
  
  // Merge
  const merged = [...filteredExisting, ...newData];
  
  // Sort by date
  merged.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  
  // Save
  await writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  
  console.log(`\n✅ Saved ${merged.length} total records to ${OUTPUT_PATH}`);
  console.log(`   - Historical: ${filteredExisting.length}`);
  console.log(`   - October 2025: ${newData.length}`);
  
  // Show date range
  const dates = [...new Set(merged.map(b => b.gameDate))].sort();
  console.log(`\n📅 Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`   Total game dates: ${dates.length}`);
}

main().catch(console.error);

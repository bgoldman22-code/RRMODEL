#!/usr/bin/env node
/**
 * Fetch NBA Player Boxscores for 2025-26 Season
 * 
 * Fetches recent games from ESPN/NBA API and updates player-boxscores-2025-26.json
 * Automatically triggers opponent defense collection after completion
 * 
 * Usage:
 *   --daily: Fetch last 3 days (for GitHub Actions)
 *   --backfill --through=YYYY-MM-DD: Backfill specific date range
 * 
 * Example:
 *   node scripts/nba/fetch-player-boxscores-2025-26.mjs --daily
 *   node scripts/nba/fetch-player-boxscores-2025-26.mjs --backfill --through=2025-11-20
 */

import fetch from 'node-fetch';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../../data/nba/player-boxscores-2025-26.json');
const SEASON_START = new Date('2025-10-01');
const SEASON_END = new Date('2026-06-30');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert UTC date to America/New_York date
 * This fixes the date overlap issue where games played late at night
 * show up as the next day in UTC
 */
function utcToET(utcDateStr) {
  const utcDate = new Date(utcDateStr);
  const etString = utcDate.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // Parse MM/DD/YYYY to YYYY-MM-DD
  const [month, day, year] = etString.split(',')[0].split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function fetchGamesForDate(dateStr) {
  const formattedDate = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${formattedDate}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ⚠️  ${dateStr}: No games or API error (${response.status})`);
      return [];
    }
    
    const data = await response.json();
    if (!data.events || data.events.length === 0) {
      console.log(`   ℹ️  ${dateStr}: No games scheduled`);
      return [];
    }
    
    console.log(`   ✓ ${dateStr}: Found ${data.events.length} games`);
    return data.events.filter(e => e.competitions?.[0]?.status?.type?.state === 'post');
  } catch (error) {
    console.error(`   ❌ ${dateStr}: Fetch error - ${error.message}`);
    return [];
  }
}

async function fetchBoxscoreForGame(gameId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
  
  await sleep(500); // Rate limiting
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`      ⚠️  Error fetching boxscore for game ${gameId}: ${error.message}`);
    return null;
  }
}

function extractPlayerBoxscores(summary) {
  const boxscores = [];
  
  if (!summary || !summary.boxscore?.players) {
    return boxscores;
  }
  
  // Get game date (use UTC -> ET conversion)
  const gameTimeUTC = summary.header?.competitions?.[0]?.date;
  if (!gameTimeUTC) {
    console.error('      ⚠️  No game date found in summary');
    return boxscores;
  }
  
  const gameDate = utcToET(gameTimeUTC);
  const homeTeamId = summary.boxscore.teams.find(t => t.homeAway === 'home')?.team?.id;
  const awayTeamId = summary.boxscore.teams.find(t => t.homeAway === 'away')?.team?.id;
  
  // Process each team's players
  for (const teamData of summary.boxscore.players) {
    const teamAbbr = teamData.team.abbreviation;
    const teamId = teamData.team.id;
    const isHome = teamId === homeTeamId;
    const opponentId = isHome ? awayTeamId : homeTeamId;
    
    // Get opponent abbreviation
    const opponentTeam = summary.boxscore.players.find(t => t.team.id === opponentId);
    const opponentAbbr = opponentTeam?.team?.abbreviation || 'UNK';
    
    for (const player of teamData.statistics?.[0]?.athletes || []) {
      const stats = player.stats || [];
      
      // ESPN API stats order: [MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-]
      // FG/3PT/FT are strings like "3-6" (made-attempted)
      const minutes = parseFloat(stats[0]) || 0;
      const points = parseInt(stats[1]) || 0;
      
      // Parse FG (made-attempted)
      const fgParts = (stats[2] || '0-0').split('-');
      const fgMade = parseInt(fgParts[0]) || 0;
      const fgAtt = parseInt(fgParts[1]) || 0;
      
      // Parse 3PT (made-attempted)
      const fg3Parts = (stats[3] || '0-0').split('-');
      const fg3Made = parseInt(fg3Parts[0]) || 0;
      const fg3Att = parseInt(fg3Parts[1]) || 0;
      
      // Parse FT (made-attempted)
      const ftParts = (stats[4] || '0-0').split('-');
      const ftMade = parseInt(ftParts[0]) || 0;
      const ftAtt = parseInt(ftParts[1]) || 0;
      
      const rebounds = parseInt(stats[5]) || 0;
      const assists = parseInt(stats[6]) || 0;
      const turnovers = parseInt(stats[7]) || 0;
      const steals = parseInt(stats[8]) || 0;
      const blocks = parseInt(stats[9]) || 0;
      const oreb = parseInt(stats[10]) || 0;
      const dreb = parseInt(stats[11]) || 0;
      const fouls = parseInt(stats[12]) || 0;
      const plusMinus = stats[13] || null;
      
      boxscores.push({
        gameDate,
        playerName: player.athlete.displayName,
        playerId: player.athlete.id,
        teamTricode: teamAbbr,
        teamId,
        opponentTricode: opponentAbbr,
        opponentId,
        isHome,
        minutes,
        points,
        rebounds,
        assists,
        steals,
        blocks,
        turnovers,
        fgMade,
        fgAtt,
        fg3Made,
        fg3Att,
        ftMade,
        ftAtt,
        oreb,
        dreb,
        fouls,
        plusMinus
      });
    }
  }
  
  return boxscores;
}

async function loadExistingBoxscores() {
  if (!existsSync(DATA_FILE)) {
    console.log('📝 No existing boxscores file, starting fresh');
    return [];
  }
  
  try {
    const content = await readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content);
    console.log(`✅ Loaded ${data.length} existing boxscore entries`);
    return data;
  } catch (error) {
    console.error(`❌ Error loading existing boxscores: ${error.message}`);
    return [];
  }
}

async function saveBoxscores(boxscores) {
  // Ensure directory exists
  await mkdir(dirname(DATA_FILE), { recursive: true });
  
  // Sort by date desc, then player name
  const sorted = boxscores.sort((a, b) => {
    const dateCompare = b.gameDate.localeCompare(a.gameDate);
    if (dateCompare !== 0) return dateCompare;
    return a.playerName.localeCompare(b.playerName);
  });
  
  await writeFile(DATA_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`💾 Saved ${sorted.length} boxscore entries to ${DATA_FILE}`);
}

async function main() {
  const args = process.argv.slice(2);
  const isDailyMode = args.includes('--daily');
  const isBackfill = args.includes('--backfill');
  const throughArg = args.find(a => a.startsWith('--through='));
  const throughDate = throughArg ? throughArg.split('=')[1] : null;
  
  console.log('🏀 NBA Boxscore Fetcher - 2025-26 Season');
  console.log('==========================================\n');
  
  // Load existing boxscores
  const existingBoxscores = await loadExistingBoxscores();
  const existingMap = new Map();
  existingBoxscores.forEach(bs => {
    const key = `${bs.gameDate}|${bs.playerId}`;
    existingMap.set(key, bs);
  });
  
  // Determine date range
  let startDate, endDate;
  
  if (isDailyMode) {
    // Fetch last 3 days
    endDate = new Date();
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 3);
    console.log(`📅 Daily mode: Fetching last 3 days`);
  } else if (isBackfill && throughDate) {
    startDate = SEASON_START;
    endDate = new Date(throughDate);
    console.log(`📅 Backfill mode: ${startDate.toISOString().split('T')[0]} to ${throughDate}`);
  } else {
    startDate = SEASON_START;
    endDate = new Date();
    console.log(`📅 Full season: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  }
  
  // Generate date list
  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  
  console.log(`\n📊 Checking ${dates.length} dates...\n`);
  
  // Fetch games for each date
  let newEntries = 0;
  let gamesProcessed = 0;
  
  for (const dateStr of dates) {
    const completedGames = await fetchGamesForDate(dateStr);
    
    for (const game of completedGames) {
      const gameId = game.id;
      gamesProcessed++;
      
      console.log(`      Fetching game ${gameId}...`);
      const summary = await fetchBoxscoreForGame(gameId);
      
      if (!summary) continue;
      
      const gameBoxscores = extractPlayerBoxscores(summary);
      console.log(`      ✓ Extracted ${gameBoxscores.length} player boxscores`);
      
      // Merge/update boxscores (overwrites existing to fix corrupted data)
      for (const bs of gameBoxscores) {
        const key = `${bs.gameDate}|${bs.playerId}`;
        const isNew = !existingMap.has(key);
        existingMap.set(key, bs); // Always set (updates if exists, inserts if new)
        if (isNew) {
          newEntries++;
        }
      }
    }
  }
  
  // Convert map back to array and save
  const allBoxscores = Array.from(existingMap.values());
  await saveBoxscores(allBoxscores);
  
  console.log(`\n✅ Complete!`);
  console.log(`   Games processed: ${gamesProcessed}`);
  console.log(`   New entries: ${newEntries}`);
  console.log(`   Total entries: ${allBoxscores.length}`);
  
  // Automatically update opponent defense stats
  console.log(`\n🔄 Updating opponent defense stats...`);
  try {
    execSync('node scripts/nba/collect-opponent-defense.mjs', { stdio: 'inherit' });
  } catch (error) {
    console.error(`⚠️  Failed to update opponent defense: ${error.message}`);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

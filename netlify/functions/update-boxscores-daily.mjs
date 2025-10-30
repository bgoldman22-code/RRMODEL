/**
 * Netlify Scheduled Function - Daily Boxscores Updater
 * 
 * Runs daily at 10:00 AM UTC (6am EDT / 5am EST after Nov 3)
 * Schedule: 0 10 * * *
 * 
 * Updates 1 hour BEFORE predictions run (11am UTC = 7am EDT)
 * 
 * Fetches last 30 days of boxscores from NBA CDN and stores in Netlify Blob
 * This keeps data fresh WITHOUT triggering Git commits or Netlify rebuilds!
 * 
 * Blob Storage:
 * - Key: "nba/player-boxscores-current.json"
 * - Updates: Daily (adds new games, removes old games)
 * - Size: ~18-20MB
 * - Cost: FREE (within Netlify Blobs free tier)
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';

const DAYS_TO_FETCH = 30;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;
const HISTORICAL_START = new Date('2024-10-01'); // Early season
const CURRENT_START = new Date('2025-01-01'); // Recent games split

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
 * Fetch boxscore for a single game from NBA CDN
 */
async function fetchBoxscore(gameId, retries = 0) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) return null;
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
 * Extract player stats from boxscore
 */
function extractPlayerStats(game) {
  const players = [];
  const gameDate = game.gameTimeUTC.split('T')[0];
  
  // Helper to process team players
  const processTeamPlayers = (teamPlayers, team, opponent, isHome) => {
    for (const player of teamPlayers) {
      if (player.played === '1') {
        players.push({
          date: gameDate,
          player: player.name,
          team: team.teamTricode,
          opponent: opponent.teamTricode,
          home: isHome,
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
  };
  
  processTeamPlayers(game.homeTeam.players, game.homeTeam, game.awayTeam, true);
  processTeamPlayers(game.awayTeam.players, game.awayTeam, game.homeTeam, false);
  
  return players;
}

/**
 * Main handler
 */
export default async (req, context) => {
  console.log('🏀 NBA Boxscores Daily Update - Starting...');
  console.log(`Fetching last ${DAYS_TO_FETCH} days from NBA CDN`);
  
  try {
    // Get Netlify Blobs store
    const store = getStore('nba-data');
    
    // Load existing boxscores from both Blobs (no decompression needed)
    let existingBoxscores = [];
    try {
      const [historicalData, currentData] = await Promise.all([
        store.get('player-boxscores-historical', { type: 'json' }),
        store.get('player-boxscores-current', { type: 'json' })
      ]);
      
      if (historicalData) existingBoxscores.push(...historicalData);
      if (currentData) existingBoxscores.push(...currentData);
      
      console.log(`📁 Loaded ${existingBoxscores.length} existing entries from Blobs`);
    } catch (error) {
      console.log('📁 No existing data in Blobs (first run)');
    }
    
    // Create map of existing games
    const existingMap = new Map();
    for (const entry of existingBoxscores) {
      const key = `${entry.date}_${entry.player}`;
      existingMap.set(key, entry);
    }
    
    // Fetch recent games
    const newEntries = [];
    const today = new Date();
    let gamesChecked = 0;
    let gamesFound = 0;
    
    console.log('\n📥 Fetching recent games...');
    
    // Generate game IDs for last N days
    // Format: 00YYMMDD{001-015}
    for (let i = 0; i < DAYS_TO_FETCH; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '').substring(2); // YYMMDD
      
      // Try up to 15 games per day
      for (let gameNum = 1; gameNum <= 15; gameNum++) {
        const gameId = `00${dateStr}${String(gameNum).padStart(3, '0')}`;
        gamesChecked++;
        
        const game = await fetchBoxscore(gameId);
        
        if (game && game.gameStatus === 3) { // Status 3 = Final
          gamesFound++;
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
    
    console.log(`\n📊 Checked ${gamesChecked} game IDs, found ${gamesFound} completed games`);
    console.log(`📊 New entries: ${newEntries.length}`);
    
    // Merge and filter
    const allBoxscores = [...existingBoxscores, ...newEntries];
    
    // Split into historical and current based on date
    const historicalBoxscores = allBoxscores.filter(b => {
      const date = new Date(b.date);
      return date >= HISTORICAL_START && date < CURRENT_START;
    });
    
    const currentBoxscores = allBoxscores.filter(b => {
      const date = new Date(b.date);
      return date >= CURRENT_START;
    });
    
    // Sort by date (newest first)
    historicalBoxscores.sort((a, b) => new Date(b.date) - new Date(a.date));
    currentBoxscores.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Save both blobs (Netlify handles compression automatically)
    console.log(`\n📤 Saving to Blobs...`);
    console.log(`   Historical (Oct-Dec 2024): ${historicalBoxscores.length} entries`);
    console.log(`   Current (Jan 2025+): ${currentBoxscores.length} entries`);
    
    await Promise.all([
      store.set('player-boxscores-historical', JSON.stringify(historicalBoxscores)),
      store.set('player-boxscores-current', JSON.stringify(currentBoxscores))
    ]);
    
    console.log('\n✅ UPDATE COMPLETE');
    console.log(`📊 Total entries in Blobs: ${historicalBoxscores.length + currentBoxscores.length}`);
    console.log(`📊 New entries added: ${newEntries.length}`);
    
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        gamesChecked,
        gamesFound,
        totalEntries: filteredBoxscores.length,
        newEntries: newEntries.length,
        oldEntriesRemoved: allBoxscores.length - filteredBoxscores.length
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Update failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 10 * * *" // Daily at 10:00 AM UTC (6am EDT / 5am EST)
};

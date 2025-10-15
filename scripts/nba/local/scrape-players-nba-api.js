#!/usr/bin/env node

/**
 * NBA Player Historical Data Scraper (NBA Stats API)
 * 
 * Uses official NBA Stats API instead of scraping HTML
 * Much more reliable and faster than Basketball-Reference scraping
 * 
 * Scrapes 5 seasons (2020-21 through 2024-25) of player data
 * 
 * Usage:
 *   node scripts/nba/local/scrape-players-nba-api.js
 * 
 * Runtime: ~5-10 minutes
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Seasons to scrape
const SEASONS = [
  { label: '2020-21', api: '2020-21' },
  { label: '2021-22', api: '2021-22' },
  { label: '2022-23', api: '2022-23' },
  { label: '2023-24', api: '2023-24' },
  { label: '2024-25', api: '2024-25' }
];

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second
const DELAY_BETWEEN_SEASONS = 2000;  // 2 seconds

// NBA Stats API headers (required!)
const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Connection': 'keep-alive',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers: NBA_HEADERS });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`  ⚠️  Attempt ${i + 1}/${retries} failed: ${error.message}`);
      
      if (i < retries - 1) {
        await delay(3000); // Wait 3 seconds before retry
      } else {
        throw error;
      }
    }
  }
}

/**
 * Scrape player stats for a season
 */
async function scrapeSeasonPlayers(season) {
  console.log(`\n🏀 Scraping ${season.label}...`);
  
  // Fetch traditional stats
  const tradUrl = `https://stats.nba.com/stats/leaguedashplayerstats?` + new URLSearchParams({
    Season: season.api,
    SeasonType: 'Regular Season',
    PerMode: 'Totals',
    MeasureType: 'Base'
  });
  
  console.log(`  📥 Fetching traditional stats...`);
  const tradData = await fetchWithRetry(tradUrl);
  
  await delay(DELAY_BETWEEN_REQUESTS);
  
  // Fetch advanced stats
  const advUrl = `https://stats.nba.com/stats/leaguedashplayerstats?` + new URLSearchParams({
    Season: season.api,
    SeasonType: 'Regular Season',
    PerMode: 'Totals',
    MeasureType: 'Advanced'
  });
  
  console.log(`  📥 Fetching advanced stats...`);
  const advData = await fetchWithRetry(advUrl);
  
  // Parse traditional stats
  const tradHeaders = tradData.resultSets[0].headers;
  const tradRows = tradData.resultSets[0].rowSet;
  
  const players = {};
  
  for (const row of tradRows) {
    const playerData = {};
    tradHeaders.forEach((header, i) => {
      playerData[header] = row[i];
    });
    
    const playerId = playerData.PLAYER_ID;
    const playerName = playerData.PLAYER_NAME;
    const team = playerData.TEAM_ABBREVIATION;
    
    players[playerId] = {
      player: playerName,
      team: team,
      season: season.label,
      
      // Games
      games_played: playerData.GP || 0,
      games_started: playerData.GS || 0,
      minutes_played: playerData.MIN || 0,
      
      // Shooting
      fgm: playerData.FGM || 0,
      fga: playerData.FGA || 0,
      fg_pct: playerData.FG_PCT || 0,
      fg3m: playerData.FG3M || 0,
      fg3a: playerData.FG3A || 0,
      fg3_pct: playerData.FG3_PCT || 0,
      ftm: playerData.FTM || 0,
      fta: playerData.FTA || 0,
      ft_pct: playerData.FT_PCT || 0,
      
      // Rebounds
      oreb: playerData.OREB || 0,
      dreb: playerData.DREB || 0,
      reb: playerData.REB || 0,
      
      // Other stats
      ast: playerData.AST || 0,
      stl: playerData.STL || 0,
      blk: playerData.BLK || 0,
      tov: playerData.TOV || 0,
      pf: playerData.PF || 0,
      pts: playerData.PTS || 0,
      
      // Plus/Minus
      plus_minus: playerData.PLUS_MINUS || 0
    };
  }
  
  // Merge advanced stats
  const advHeaders = advData.resultSets[0].headers;
  const advRows = advData.resultSets[0].rowSet;
  
  let advMerged = 0;
  for (const row of advRows) {
    const playerData = {};
    advHeaders.forEach((header, i) => {
      playerData[header] = row[i];
    });
    
    const playerId = playerData.PLAYER_ID;
    
    if (players[playerId]) {
      // Advanced metrics
      players[playerId].off_rating = playerData.OFF_RATING || null;
      players[playerId].def_rating = playerData.DEF_RATING || null;
      players[playerId].net_rating = playerData.NET_RATING || null;
      players[playerId].ast_pct = playerData.AST_PCT || null;
      players[playerId].ast_ratio = playerData.AST_RATIO || null;
      players[playerId].oreb_pct = playerData.OREB_PCT || null;
      players[playerId].dreb_pct = playerData.DREB_PCT || null;
      players[playerId].reb_pct = playerData.REB_PCT || null;
      players[playerId].tov_pct = playerData.TOV_PCT || null;
      players[playerId].efg_pct = playerData.EFG_PCT || null;
      players[playerId].ts_pct = playerData.TS_PCT || null;
      players[playerId].usg_pct = playerData.USG_PCT || null;
      players[playerId].pace = playerData.PACE || null;
      players[playerId].pie = playerData.PIE || null;
      
      advMerged++;
    }
  }
  
  console.log(`  ✅ Scraped ${Object.keys(players).length} players`);
  console.log(`  ✅ Merged ${advMerged} advanced stats`);
  
  // Filter to significant players (at least 5 games or 50 minutes)
  const filteredPlayers = Object.values(players).filter(p => 
    p.games_played >= 5 || p.minutes_played >= 50
  );
  
  console.log(`  ✅ Filtered to ${filteredPlayers.length} significant players`);
  
  return filteredPlayers;
}

/**
 * Main scraper
 */
async function scrapeAllSeasons() {
  console.log('🏀 NBA Player Historical Data Scraper (NBA Stats API)');
  console.log('='.repeat(60));
  console.log(`Seasons: ${SEASONS.map(s => s.label).join(', ')}`);
  console.log('='.repeat(60));
  
  const allPlayers = [];
  
  for (let i = 0; i < SEASONS.length; i++) {
    const season = SEASONS[i];
    
    try {
      const players = await scrapeSeasonPlayers(season);
      allPlayers.push(...players);
      
      // Save individual season file
      const seasonFile = path.join(
        __dirname,
        '../../../data/nba/players/archive',
        `player_seasons_${season.label.replace('-', '_')}.json`
      );
      
      await fs.mkdir(path.dirname(seasonFile), { recursive: true });
      await fs.writeFile(seasonFile, JSON.stringify({
        schema_version: 1,
        scraped_at: new Date().toISOString(),
        season: season.label,
        source: 'nba-stats-api',
        player_count: players.length,
        players
      }, null, 2));
      
      console.log(`  💾 Saved: ${seasonFile}\n`);
      
      // Delay before next season
      if (i < SEASONS.length - 1) {
        console.log(`  ⏱️  Waiting ${DELAY_BETWEEN_SEASONS}ms...\n`);
        await delay(DELAY_BETWEEN_SEASONS);
      }
    } catch (error) {
      console.error(`  ❌ Failed to scrape ${season.label}: ${error.message}\n`);
    }
  }
  
  // Save combined archive
  const combinedFile = path.join(
    __dirname,
    '../../../data/nba/players/archive',
    'player_seasons_combined.json'
  );
  
  await fs.writeFile(combinedFile, JSON.stringify({
    schema_version: 1,
    scraped_at: new Date().toISOString(),
    seasons: SEASONS.map(s => s.label),
    source: 'nba-stats-api',
    total_player_seasons: allPlayers.length,
    players: allPlayers
  }, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ SCRAPING COMPLETE');
  console.log('='.repeat(60));
  console.log(`📁 Combined file: ${combinedFile}`);
  console.log(`📊 Total player-seasons: ${allPlayers.length}`);
  console.log(`🏀 Average per season: ${Math.round(allPlayers.length / SEASONS.length)}`);
  console.log('\n💡 Next steps:');
  console.log('  1. Run team scraper: node scripts/nba/local/scrape-teams-nba-api.js');
  console.log('  2. Calculate RCI: node scripts/nba/local/build-rosters-with-rci.js');
  console.log('  3. Validate: node scripts/nba/local/validate-data.js');
}

// Run scraper
scrapeAllSeasons().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

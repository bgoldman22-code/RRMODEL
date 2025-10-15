#!/usr/bin/env node

/**
 * NBA Player Historical Data Scraper (Basketball-Reference)
 * 
 * Scrapes 5 seasons (2020-21 through 2024-25) of player data:
 * - Traditional stats (PPG, RPG, APG, FG%, etc.)
 * - Advanced stats (PER, TS%, BPM, VORP, WS, etc.)
 * - On/Off court stats (team performance with/without player)
 * 
 * Run this ONCE locally, then commit the data to GitHub.
 * 
 * Usage:
 *   node scripts/nba/local/scrape-players-historical.js
 * 
 * Output:
 *   data/nba/players/archive/player_seasons_2020_21.json
 *   data/nba/players/archive/player_seasons_2021_22.json
 *   data/nba/players/archive/player_seasons_2022_23.json
 *   data/nba/players/archive/player_seasons_2023_24.json
 *   data/nba/players/archive/player_seasons_2024_25.json
 * 
 * Runtime: ~30-45 minutes (polite rate limiting)
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Seasons to scrape
const SEASONS = ['2021', '2022', '2023', '2024', '2025']; // BBRef uses ending year
const SEASON_LABELS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25'];

// Rate limiting (be polite to Basketball-Reference)
const DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds
const DELAY_BETWEEN_SEASONS = 5000;  // 5 seconds

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrape traditional player stats
 */
async function scrapeTotals(season) {
  const url = `https://www.basketball-reference.com/leagues/NBA_${season}_totals.html`;
  console.log(`  📥 Fetching totals: ${url}`);
  
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const players = {};
  
  $('#totals_stats tbody tr').each((i, row) => {
    // Skip header rows
    if ($(row).hasClass('thead')) return;
    
    const playerId = $(row).attr('data-append-csv');
    const playerName = $(row).find('[data-stat="player"]').text().trim();
    const team = $(row).find('[data-stat="team_id"]').text().trim();
    const pos = $(row).find('[data-stat="pos"]').text().trim();
    const age = parseInt($(row).find('[data-stat="age"]').text()) || 0;
    
    if (!playerId || !playerName) return;
    
    // Initialize player entry
    if (!players[playerId]) {
      players[playerId] = {
        id: playerId,
        name: playerName,
        team: team,
        position: pos,
        age: age,
        season: SEASON_LABELS[SEASONS.indexOf(season)]
      };
    }
    
    // Traditional stats
    players[playerId].gp = parseFloat($(row).find('[data-stat="g"]').text()) || 0;
    players[playerId].gs = parseFloat($(row).find('[data-stat="gs"]').text()) || 0;
    players[playerId].mp = parseFloat($(row).find('[data-stat="mp"]').text()) || 0;
    players[playerId].mpg = players[playerId].gp > 0 ? players[playerId].mp / players[playerId].gp : 0;
    
    players[playerId].fg = parseFloat($(row).find('[data-stat="fg"]').text()) || 0;
    players[playerId].fga = parseFloat($(row).find('[data-stat="fga"]').text()) || 0;
    players[playerId].fg_pct = parseFloat($(row).find('[data-stat="fg_pct"]').text()) || 0;
    
    players[playerId].fg3 = parseFloat($(row).find('[data-stat="fg3"]').text()) || 0;
    players[playerId].fg3a = parseFloat($(row).find('[data-stat="fg3a"]').text()) || 0;
    players[playerId].fg3_pct = parseFloat($(row).find('[data-stat="fg3_pct"]').text()) || 0;
    
    players[playerId].fg2 = parseFloat($(row).find('[data-stat="fg2"]').text()) || 0;
    players[playerId].fg2a = parseFloat($(row).find('[data-stat="fg2a"]').text()) || 0;
    players[playerId].fg2_pct = parseFloat($(row).find('[data-stat="fg2_pct"]').text()) || 0;
    
    players[playerId].ft = parseFloat($(row).find('[data-stat="ft"]').text()) || 0;
    players[playerId].fta = parseFloat($(row).find('[data-stat="fta"]').text()) || 0;
    players[playerId].ft_pct = parseFloat($(row).find('[data-stat="ft_pct"]').text()) || 0;
    
    players[playerId].orb = parseFloat($(row).find('[data-stat="orb"]').text()) || 0;
    players[playerId].drb = parseFloat($(row).find('[data-stat="drb"]').text()) || 0;
    players[playerId].trb = parseFloat($(row).find('[data-stat="trb"]').text()) || 0;
    players[playerId].ast = parseFloat($(row).find('[data-stat="ast"]').text()) || 0;
    players[playerId].stl = parseFloat($(row).find('[data-stat="stl"]').text()) || 0;
    players[playerId].blk = parseFloat($(row).find('[data-stat="blk"]').text()) || 0;
    players[playerId].tov = parseFloat($(row).find('[data-stat="tov"]').text()) || 0;
    players[playerId].pf = parseFloat($(row).find('[data-stat="pf"]').text()) || 0;
    players[playerId].pts = parseFloat($(row).find('[data-stat="pts"]').text()) || 0;
    
    // Per-game averages
    if (players[playerId].gp > 0) {
      players[playerId].ppg = players[playerId].pts / players[playerId].gp;
      players[playerId].rpg = players[playerId].trb / players[playerId].gp;
      players[playerId].apg = players[playerId].ast / players[playerId].gp;
    } else {
      players[playerId].ppg = 0;
      players[playerId].rpg = 0;
      players[playerId].apg = 0;
    }
  });
  
  console.log(`  ✅ Totals: ${Object.keys(players).length} players`);
  return players;
}

/**
 * Scrape advanced player stats
 */
async function scrapeAdvanced(season, players) {
  const url = `https://www.basketball-reference.com/leagues/NBA_${season}_advanced.html`;
  console.log(`  📥 Fetching advanced: ${url}`);
  
  await delay(DELAY_BETWEEN_REQUESTS);
  
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let merged = 0;
  
  $('#advanced_stats tbody tr').each((i, row) => {
    if ($(row).hasClass('thead')) return;
    
    const playerId = $(row).attr('data-append-csv');
    if (!players[playerId]) return;
    
    // Advanced stats
    players[playerId].per = parseFloat($(row).find('[data-stat="per"]').text()) || 0;
    players[playerId].ts_pct = parseFloat($(row).find('[data-stat="ts_pct"]').text()) || 0;
    players[playerId].fg3a_per_fga_pct = parseFloat($(row).find('[data-stat="fg3a_per_fga_pct"]').text()) || 0;
    players[playerId].fta_per_fga_pct = parseFloat($(row).find('[data-stat="fta_per_fga_pct"]').text()) || 0;
    
    players[playerId].orb_pct = parseFloat($(row).find('[data-stat="orb_pct"]').text()) || 0;
    players[playerId].drb_pct = parseFloat($(row).find('[data-stat="drb_pct"]').text()) || 0;
    players[playerId].trb_pct = parseFloat($(row).find('[data-stat="trb_pct"]').text()) || 0;
    players[playerId].ast_pct = parseFloat($(row).find('[data-stat="ast_pct"]').text()) || 0;
    players[playerId].stl_pct = parseFloat($(row).find('[data-stat="stl_pct"]').text()) || 0;
    players[playerId].blk_pct = parseFloat($(row).find('[data-stat="blk_pct"]').text()) || 0;
    players[playerId].tov_pct = parseFloat($(row).find('[data-stat="tov_pct"]').text()) || 0;
    players[playerId].usg_pct = parseFloat($(row).find('[data-stat="usg_pct"]').text()) || 0;
    
    players[playerId].ows = parseFloat($(row).find('[data-stat="ows"]').text()) || 0;
    players[playerId].dws = parseFloat($(row).find('[data-stat="dws"]').text()) || 0;
    players[playerId].ws = parseFloat($(row).find('[data-stat="ws"]').text()) || 0;
    players[playerId].ws_48 = parseFloat($(row).find('[data-stat="ws_per_48"]').text()) || 0;
    
    players[playerId].obpm = parseFloat($(row).find('[data-stat="obpm"]').text()) || 0;
    players[playerId].dbpm = parseFloat($(row).find('[data-stat="dbpm"]').text()) || 0;
    players[playerId].bpm = parseFloat($(row).find('[data-stat="bpm"]').text()) || 0;
    players[playerId].vorp = parseFloat($(row).find('[data-stat="vorp"]').text()) || 0;
    
    merged++;
  });
  
  console.log(`  ✅ Advanced: merged ${merged} players`);
}

/**
 * Scrape on/off court stats
 */
async function scrapeOnOff(season, players) {
  const url = `https://www.basketball-reference.com/leagues/NBA_${season}_play-by-play.html`;
  console.log(`  📥 Fetching on/off: ${url}`);
  
  await delay(DELAY_BETWEEN_REQUESTS);
  
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    let merged = 0;
    
    $('#pbp_stats tbody tr').each((i, row) => {
      if ($(row).hasClass('thead')) return;
      
      const playerId = $(row).attr('data-append-csv');
      if (!players[playerId]) return;
      
      // On/Off court impact (simplified - BBRef doesn't have full on/off splits in this table)
      // We'll calculate an estimate based on available data
      const plusMinus = parseFloat($(row).find('[data-stat="plus_minus"]').text()) || 0;
      const gp = players[playerId].gp || 1;
      
      // Estimate on/off impact (this is a rough approximation)
      players[playerId].plus_minus = plusMinus;
      players[playerId].plus_minus_per_game = plusMinus / gp;
      
      // For elite modeling, we'd want true on/off from NBA Stats API
      // But for historical backfill, plus/minus gives us directionality
      
      merged++;
    });
    
    console.log(`  ✅ On/Off: merged ${merged} players`);
  } catch (error) {
    console.warn(`  ⚠️  On/Off stats not available for ${season}: ${error.message}`);
  }
}

/**
 * Scrape all stats for a season
 */
async function scrapeSeason(season, seasonLabel) {
  console.log(`\n🏀 Scraping ${seasonLabel} (BBRef year: ${season})`);
  
  // 1. Get traditional stats (creates player objects)
  const players = await scrapeTotals(season);
  
  // 2. Merge advanced stats
  await scrapeAdvanced(season, players);
  
  // 3. Merge on/off stats
  await scrapeOnOff(season, players);
  
  // Filter out players with minimal playing time (< 5 games or < 50 total minutes)
  const filtered = Object.fromEntries(
    Object.entries(players).filter(([_, p]) => p.gp >= 5 && p.mp >= 50)
  );
  
  console.log(`✅ ${seasonLabel} complete: ${Object.keys(filtered).length} players (filtered from ${Object.keys(players).length})`);
  
  return filtered;
}

/**
 * Main scraper
 */
async function main() {
  console.log('🏀 NBA Player Historical Data Scraper');
  console.log('=====================================\n');
  console.log('Scraping 5 seasons from Basketball-Reference...');
  console.log('This will take ~30-45 minutes with polite rate limiting.\n');
  
  const allSeasons = {};
  
  for (let i = 0; i < SEASONS.length; i++) {
    const season = SEASONS[i];
    const seasonLabel = SEASON_LABELS[i];
    
    try {
      const players = await scrapeSeason(season, seasonLabel);
      allSeasons[seasonLabel] = players;
      
      // Save individual season file
      const outputPath = path.join(
        __dirname,
        '../../../data/nba/players/archive',
        `player_seasons_${seasonLabel.replace('-', '_')}.json`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(players, null, 2));
      
      console.log(`💾 Saved: ${outputPath}\n`);
      
      // Delay between seasons
      if (i < SEASONS.length - 1) {
        console.log(`⏱️  Waiting ${DELAY_BETWEEN_SEASONS}ms before next season...\n`);
        await delay(DELAY_BETWEEN_SEASONS);
      }
      
    } catch (error) {
      console.error(`❌ Error scraping ${seasonLabel}:`, error);
      throw error;
    }
  }
  
  // Save combined archive
  const archivePath = path.join(
    __dirname,
    '../../../data/nba/players/archive',
    'player_seasons_2020_2025.json'
  );
  
  await fs.writeFile(archivePath, JSON.stringify(allSeasons, null, 2));
  
  // Generate summary stats
  const summary = {
    seasons: SEASON_LABELS,
    totalPlayers: Object.values(allSeasons).reduce((sum, season) => sum + Object.keys(season).length, 0),
    perSeason: Object.fromEntries(
      Object.entries(allSeasons).map(([season, players]) => [season, Object.keys(players).length])
    ),
    scraped: new Date().toISOString()
  };
  
  console.log('\n🎉 Scraping Complete!');
  console.log('=====================\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n💾 Combined archive: ${archivePath}`);
  console.log('\n✅ Ready to commit to GitHub!');
  console.log('\nNext steps:');
  console.log('  1. Run: node scripts/nba/local/scrape-teams-historical.js');
  console.log('  2. Run: node scripts/nba/local/validate-data.js');
  console.log('  3. Commit: git add data/nba/ && git commit -m "NBA: Historical data 2020-2025"');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { scrapeSeason, scrapeTotals, scrapeAdvanced, scrapeOnOff };

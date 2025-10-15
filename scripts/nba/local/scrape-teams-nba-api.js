#!/usr/bin/env node

/**
 * NBA Team Historical Data Scraper (NBA Stats API)
 * 
 * Uses official NBA Stats API for team advanced stats
 * Scrapes 5 seasons (2020-21 through 2024-25)
 * 
 * Usage:
 *   node scripts/nba/local/scrape-teams-nba-api.js
 * 
 * Runtime: ~2-3 minutes
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

// NBA Stats API headers
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
        await delay(3000);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Scrape team stats for a season
 */
async function scrapeSeasonTeams(season) {
  console.log(`\n🏀 Scraping ${season.label}...`);
  
  // Fetch advanced team stats
  const url = `https://stats.nba.com/stats/leaguedashteamstats?` + new URLSearchParams({
    Season: season.api,
    SeasonType: 'Regular Season',
    PerMode: 'PerGame',
    MeasureType: 'Advanced'
  });
  
  console.log(`  📥 Fetching advanced team stats...`);
  const data = await fetchWithRetry(url);
  
  // Parse data
  const headers = data.resultSets[0].headers;
  const rows = data.resultSets[0].rowSet;
  
  const teams = [];
  
  for (const row of rows) {
    const teamData = {};
    headers.forEach((header, i) => {
      teamData[header] = row[i];
    });
    
    teams.push({
      team: teamData.TEAM_NAME,
      season: season.label,
      
      // Record
      wins: teamData.W || 0,
      losses: teamData.L || 0,
      win_pct: teamData.W_PCT || 0,
      
      // Team ratings
      off_rtg: teamData.OFF_RATING || null,
      def_rtg: teamData.DEF_RATING || null,
      net_rtg: teamData.NET_RATING || null,
      pace: teamData.PACE || null,
      
      // Four Factors - Offense
      efg_pct: teamData.EFG_PCT || null,
      tov_pct: teamData.TM_TOV_PCT || null,
      orb_pct: teamData.OREB_PCT || null,
      ft_rate: teamData.FTA_RATE || null,
      
      // Four Factors - Defense  
      opp_efg_pct: teamData.OPP_EFG_PCT || null,
      opp_tov_pct: teamData.OPP_TOV_PCT || null,
      drb_pct: teamData.DREB_PCT || null,
      opp_ft_rate: teamData.OPP_FTA_RATE || null,
      
      // Additional metrics
      ast_pct: teamData.AST_PCT || null,
      ast_ratio: teamData.AST_RATIO || null,
      pie: teamData.PIE || null
    });
  }
  
  console.log(`  ✅ Scraped ${teams.length} teams`);
  
  return teams;
}

/**
 * Main scraper
 */
async function scrapeAllSeasons() {
  console.log('🏀 NBA Team Historical Data Scraper (NBA Stats API)');
  console.log('='.repeat(60));
  console.log(`Seasons: ${SEASONS.map(s => s.label).join(', ')}`);
  console.log('='.repeat(60));
  
  const allTeams = [];
  
  for (let i = 0; i < SEASONS.length; i++) {
    const season = SEASONS[i];
    
    try {
      const teams = await scrapeSeasonTeams(season);
      allTeams.push(...teams);
      
      // Save individual season file
      const seasonFile = path.join(
        __dirname,
        '../../../data/nba/aggregates/archive',
        `team_seasons_${season.label.replace('-', '_')}.json`
      );
      
      await fs.mkdir(path.dirname(seasonFile), { recursive: true });
      await fs.writeFile(seasonFile, JSON.stringify({
        schema_version: 1,
        scraped_at: new Date().toISOString(),
        season: season.label,
        source: 'nba-stats-api',
        team_count: teams.length,
        teams
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
    '../../../data/nba/aggregates/archive',
    'team_seasons_combined.json'
  );
  
  await fs.writeFile(combinedFile, JSON.stringify({
    schema_version: 1,
    scraped_at: new Date().toISOString(),
    seasons: SEASONS.map(s => s.label),
    source: 'nba-stats-api',
    total_team_seasons: allTeams.length,
    teams: allTeams
  }, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ SCRAPING COMPLETE');
  console.log('='.repeat(60));
  console.log(`📁 Combined file: ${combinedFile}`);
  console.log(`📊 Total team-seasons: ${allTeams.length}`);
  console.log(`🏀 Average per season: ${Math.round(allTeams.length / SEASONS.length)}`);
  console.log('\n💡 Next steps:');
  console.log('  1. Calculate RCI: node scripts/nba/local/build-rosters-with-rci.js');
  console.log('  2. Validate: node scripts/nba/local/validate-data.js');
}

// Run scraper
scrapeAllSeasons().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

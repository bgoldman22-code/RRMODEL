/**
 * Historical Team Stats Scraper
 * 
 * Scrapes Basketball-Reference for team-level advanced stats (2020-2025 seasons)
 * Collects: pace, offensive rating, defensive rating, net rating, Four Factors
 * 
 * Data Storage:
 * - data/nba/aggregates/archive/team_seasons_YYYY_YY.json (per season)
 * - data/nba/aggregates/archive/team_seasons_combined.json (all seasons)
 * 
 * Usage: node scripts/nba/local/scrape-teams-historical.js
 * Runtime: ~10-15 minutes (polite 3-second delays between requests)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Seasons to scrape (BBRef uses end year, e.g., 2021 = 2020-21 season)
const SEASONS = [2021, 2022, 2023, 2024, 2025];

// Polite scraping: 3 seconds between requests
const DELAY_MS = 3000;

// Basketball-Reference endpoints
const BASE_URL = 'https://www.basketball-reference.com';

// Team name standardization (BBRef → ESPN naming)
const TEAM_NAME_MAP = {
  'Atlanta Hawks': 'Atlanta Hawks',
  'Boston Celtics': 'Boston Celtics',
  'Brooklyn Nets': 'Brooklyn Nets',
  'Charlotte Hornets': 'Charlotte Hornets',
  'Chicago Bulls': 'Chicago Bulls',
  'Cleveland Cavaliers': 'Cleveland Cavaliers',
  'Dallas Mavericks': 'Dallas Mavericks',
  'Denver Nuggets': 'Denver Nuggets',
  'Detroit Pistons': 'Detroit Pistons',
  'Golden State Warriors': 'Golden State Warriors',
  'Houston Rockets': 'Houston Rockets',
  'Indiana Pacers': 'Indiana Pacers',
  'LA Clippers': 'Los Angeles Clippers',
  'Los Angeles Lakers': 'Los Angeles Lakers',
  'Memphis Grizzlies': 'Memphis Grizzlies',
  'Miami Heat': 'Miami Heat',
  'Milwaukee Bucks': 'Milwaukee Bucks',
  'Minnesota Timberwolves': 'Minnesota Timberwolves',
  'New Orleans Pelicans': 'New Orleans Pelicans',
  'New York Knicks': 'New York Knicks',
  'Oklahoma City Thunder': 'Oklahoma City Thunder',
  'Orlando Magic': 'Orlando Magic',
  'Philadelphia 76ers': 'Philadelphia 76ers',
  'Phoenix Suns': 'Phoenix Suns',
  'Portland Trail Blazers': 'Portland Trail Blazers',
  'Sacramento Kings': 'Sacramento Kings',
  'San Antonio Spurs': 'San Antonio Spurs',
  'Toronto Raptors': 'Toronto Raptors',
  'Utah Jazz': 'Utah Jazz',
  'Washington Wizards': 'Washington Wizards'
};

/**
 * Delays execution for polite scraping
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches HTML from URL with retry logic
 */
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      console.error(`  ❌ Attempt ${i + 1}/${retries} failed: ${error.message}`);
      if (i < retries - 1) {
        await delay(5000); // 5-second delay before retry
      } else {
        throw error;
      }
    }
  }
}

/**
 * Parses HTML table to extract team stats
 * BBRef structure: <table id="misc_stats"> or <table id="advanced-team">
 */
function parseTeamStatsTable(html, season) {
  const teams = [];
  
  // Extract team rows from table (simplified parsing - in production use cheerio/jsdom)
  // This regex finds table rows with team data
  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowPattern) || [];
  
  for (const row of rows) {
    // Skip header rows
    if (row.includes('<th') && !row.includes('data-row')) continue;
    
    // Extract team name
    const teamMatch = row.match(/data-stat="team_name"[^>]*>(?:<a[^>]*>)?([^<]+)(?:<\/a>)?</i);
    if (!teamMatch) continue;
    
    const teamName = teamMatch[1].trim();
    if (teamName === 'League Average') continue; // Skip league average row
    
    // Standardize team name
    const standardizedName = TEAM_NAME_MAP[teamName] || teamName;
    
    // Extract advanced stats (data-stat attributes)
    const statsMap = {};
    const statPattern = /data-stat="([^"]+)"[^>]*>([^<]+)</gi;
    let statMatch;
    
    while ((statMatch = statPattern.exec(row)) !== null) {
      const [, statName, value] = statMatch;
      statsMap[statName] = value.trim();
    }
    
    // Parse numeric values
    const parseFloat = (val) => {
      const num = Number(val);
      return isNaN(num) ? null : num;
    };
    
    teams.push({
      team: standardizedName,
      season: `${season - 1}-${String(season).slice(2)}`, // 2021 → "2020-21"
      
      // Team Ratings
      pace: parseFloat(statsMap.pace),
      off_rtg: parseFloat(statsMap.off_rtg),
      def_rtg: parseFloat(statsMap.def_rtg),
      net_rtg: parseFloat(statsMap.net_rtg),
      
      // Four Factors - Offense
      efg_pct: parseFloat(statsMap.efg_pct),
      tov_pct: parseFloat(statsMap.tov_pct),
      orb_pct: parseFloat(statsMap.orb_pct),
      ft_rate: parseFloat(statsMap.ft_rate),
      
      // Four Factors - Defense
      opp_efg_pct: parseFloat(statsMap.opp_efg_pct),
      opp_tov_pct: parseFloat(statsMap.opp_tov_pct),
      drb_pct: parseFloat(statsMap.drb_pct),
      opp_ft_rate: parseFloat(statsMap.opp_ft_rate),
      
      // Win/Loss Record
      wins: parseInt(statsMap.wins) || null,
      losses: parseInt(statsMap.losses) || null,
      win_pct: parseFloat(statsMap.win_loss_pct)
    });
  }
  
  return teams;
}

/**
 * Scrapes team advanced stats for a single season
 */
async function scrapeSeasonTeamStats(season) {
  console.log(`\n📊 Scraping ${season - 1}-${String(season).slice(2)} team stats...`);
  
  const url = `${BASE_URL}/leagues/NBA_${season}.html`;
  console.log(`  🌐 URL: ${url}`);
  
  try {
    const html = await fetchWithRetry(url);
    const teams = parseTeamStatsTable(html, season);
    
    console.log(`  ✅ Scraped ${teams.length} teams`);
    
    // Validate data quality
    const validTeams = teams.filter(t => 
      t.pace !== null && 
      t.off_rtg !== null && 
      t.def_rtg !== null
    );
    
    if (validTeams.length < 28) {
      console.warn(`  ⚠️  Warning: Only ${validTeams.length}/30 teams have complete data`);
    }
    
    return validTeams;
  } catch (error) {
    console.error(`  ❌ Failed to scrape ${season}: ${error.message}`);
    return [];
  }
}

/**
 * Main scraping orchestrator
 */
async function scrapeAllSeasons() {
  console.log('🏀 NBA Historical Team Stats Scraper');
  console.log('=' .repeat(50));
  console.log(`Seasons: ${SEASONS.map(s => `${s-1}-${String(s).slice(2)}`).join(', ')}`);
  console.log(`Delay: ${DELAY_MS}ms between requests`);
  console.log('=' .repeat(50));
  
  const allTeams = [];
  
  for (let i = 0; i < SEASONS.length; i++) {
    const season = SEASONS[i];
    
    // Scrape season
    const teams = await scrapeSeasonTeamStats(season);
    allTeams.push(...teams);
    
    // Save individual season file
    const seasonFile = path.join(
      __dirname,
      '../../../data/nba/aggregates/archive',
      `team_seasons_${season - 1}_${String(season).slice(2)}.json`
    );
    
    fs.mkdirSync(path.dirname(seasonFile), { recursive: true });
    fs.writeFileSync(seasonFile, JSON.stringify({
      schema_version: 1,
      scraped_at: new Date().toISOString(),
      season: `${season - 1}-${String(season).slice(2)}`,
      source: 'basketball-reference.com',
      team_count: teams.length,
      teams
    }, null, 2));
    
    console.log(`  💾 Saved: ${seasonFile}`);
    
    // Polite delay before next request (except after last season)
    if (i < SEASONS.length - 1) {
      console.log(`  ⏳ Waiting ${DELAY_MS}ms...`);
      await delay(DELAY_MS);
    }
  }
  
  // Save combined archive
  const combinedFile = path.join(
    __dirname,
    '../../../data/nba/aggregates/archive',
    'team_seasons_combined.json'
  );
  
  fs.writeFileSync(combinedFile, JSON.stringify({
    schema_version: 1,
    scraped_at: new Date().toISOString(),
    seasons: SEASONS.map(s => `${s-1}-${String(s).slice(2)}`),
    source: 'basketball-reference.com',
    total_team_seasons: allTeams.length,
    teams: allTeams
  }, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ SCRAPING COMPLETE');
  console.log('='.repeat(50));
  console.log(`📁 Combined file: ${combinedFile}`);
  console.log(`📊 Total team-seasons: ${allTeams.length}`);
  console.log(`🏀 Teams per season: ${Math.round(allTeams.length / SEASONS.length)}`);
  console.log('\n💡 Next steps:');
  console.log('  1. Validate data: node scripts/nba/local/validate-data.js');
  console.log('  2. Build RCI: node scripts/nba/local/build-rosters-with-rci.js');
  console.log('  3. Commit to GitHub');
}

// Run scraper
scrapeAllSeasons().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

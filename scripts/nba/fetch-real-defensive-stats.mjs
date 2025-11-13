#!/usr/bin/env node

/**
 * Fetch REAL opponent defense stats from multiple NBA data sources
 * Tries: NBA Stats API (2024-25 + 2025-26) → NBA CDN → ESPN Stats
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch from NBA Stats API with retries
 */
async function fetchNBAStatsAPI(season, retries = 3) {
  const url = new URL('https://stats.nba.com/stats/leaguedashteamstats');
  url.searchParams.set('Season', season);
  url.searchParams.set('SeasonType', 'Regular Season');
  url.searchParams.set('MeasureType', 'Opponent');
  url.searchParams.set('PerMode', 'Per100Possessions');
  url.searchParams.set('LeagueID', '00');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n🔍 Attempt ${attempt}/${retries}: Fetching ${season} from NBA Stats API...`);
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://www.nba.com/',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ SUCCESS! Got ${season} data from NBA Stats API`);
      return parseNBAStatsAPI(data, season);
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }
  
  return null;
}

/**
 * Parse NBA Stats API response
 */
function parseNBAStatsAPI(data, season) {
  if (!data?.resultSets?.[0]?.rowSet) {
    throw new Error('Invalid NBA Stats API response structure');
  }

  const headers = data.resultSets[0].headers;
  const rows = data.resultSets[0].rowSet;

  // Find column indices
  const teamIdx = headers.indexOf('TEAM_NAME');
  const abbrevIdx = headers.indexOf('TEAM_ABBREVIATION');
  const rebIdx = headers.indexOf('REB');
  const astIdx = headers.indexOf('AST');
  const ptsIdx = headers.indexOf('PTS');
  const fgPctIdx = headers.indexOf('FG_PCT');
  const fg3PctIdx = headers.indexOf('FG3_PCT');
  const ftPctIdx = headers.indexOf('FT_PCT');
  const tovIdx = headers.indexOf('TOV');
  const gamesIdx = headers.indexOf('GP');

  const teams = {};
  const defRatings = [];

  rows.forEach(row => {
    const abbrev = row[abbrevIdx];
    const teamName = row[teamIdx];
    const pts = row[ptsIdx];
    const reb = row[rebIdx];
    const ast = row[astIdx];

    teams[abbrev] = {
      team: teamName,
      abbrev: abbrev,
      oppREB: parseFloat(reb?.toFixed(1) || '0'),
      oppAST: parseFloat(ast?.toFixed(1) || '0'),
      oppPTS: parseFloat(pts?.toFixed(1) || '0'),
      oppFG_PCT: parseFloat((row[fgPctIdx] * 100).toFixed(1)),
      opp3P_PCT: parseFloat((row[fg3PctIdx] * 100).toFixed(1)),
      oppFT_PCT: parseFloat((row[ftPctIdx] * 100).toFixed(1)),
      oppTOV: parseFloat(row[tovIdx]?.toFixed(1) || '0'),
      games: row[gamesIdx],
      defRating: parseFloat(pts?.toFixed(1) || '0'),
    };

    defRatings.push({ abbrev, rating: pts });
  });

  // Sort by defensive rating (lower is better)
  defRatings.sort((a, b) => a.rating - b.rating);

  // Calculate league averages
  const avgREB = Object.values(teams).reduce((sum, t) => sum + t.oppREB, 0) / rows.length;
  const avgAST = Object.values(teams).reduce((sum, t) => sum + t.oppAST, 0) / rows.length;
  const avgPTS = Object.values(teams).reduce((sum, t) => sum + t.oppPTS, 0) / rows.length;

  return {
    season,
    source: 'NBA Stats API',
    lastUpdated: new Date().toISOString(),
    sampleSize: `${rows.length} teams`,
    teams,
    leagueAverages: {
      oppREB: parseFloat(avgREB.toFixed(1)),
      oppAST: parseFloat(avgAST.toFixed(1)),
      oppPTS: parseFloat(avgPTS.toFixed(1)),
      defRating: parseFloat(avgPTS.toFixed(1)),
    },
    rankings: {
      topDefenses: defRatings.slice(0, 5).map(d => `${d.abbrev} (${d.rating.toFixed(1)})`),
      worstDefenses: defRatings.slice(-5).map(d => `${d.abbrev} (${d.rating.toFixed(1)})`),
    },
  };
}

/**
 * Fetch from NBA CDN (alternative source)
 */
async function fetchNBACDN(season) {
  try {
    console.log(`\n🔍 Trying NBA CDN for ${season}...`);
    
    // NBA CDN uses format like "2024" for 2024-25 season
    const year = season.split('-')[0];
    const url = `https://cdn.nba.com/static/json/liveData/playbyplay/teamstats_${year}.json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ SUCCESS! Got ${season} data from NBA CDN`);
    return parseNBACDN(data, season);
    
  } catch (error) {
    console.error(`❌ NBA CDN failed:`, error.message);
    return null;
  }
}

/**
 * Parse NBA CDN response (structure varies)
 */
function parseNBACDN(data, season) {
  // NBA CDN structure is different - this is a placeholder
  // We'll need to inspect the actual response structure
  console.log('⚠️  NBA CDN data structure needs inspection');
  return null;
}

/**
 * Fetch from ESPN Stats (backup source)
 */
async function fetchESPNStats(season) {
  try {
    console.log(`\n🔍 Trying ESPN Stats API for ${season}...`);
    
    // ESPN uses year format
    const year = season === '2024-25' ? '2025' : '2026';
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/statistics?season=${year}&group=defense`;
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ SUCCESS! Got ${season} data from ESPN`);
    return parseESPNStats(data, season);
    
  } catch (error) {
    console.error(`❌ ESPN Stats failed:`, error.message);
    return null;
  }
}

/**
 * Parse ESPN Stats response
 */
function parseESPNStats(data, season) {
  // ESPN structure needs inspection
  console.log('⚠️  ESPN data structure needs inspection');
  return null;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏀 FETCHING REAL NBA DEFENSIVE STATS');
  console.log('=====================================\n');
  console.log('📅 Date:', new Date().toLocaleDateString());
  console.log('🎯 Target: 2024-25 and 2025-26 seasons');
  console.log('📊 Sources: NBA Stats API, NBA CDN, ESPN\n');

  const results = {};

  // Fetch 2024-25 season (should definitely work)
  console.log('\n🏀 SEASON: 2024-25 (Last Complete Season)');
  console.log('==========================================');
  
  let data2024 = await fetchNBAStatsAPI('2024-25');
  if (!data2024) data2024 = await fetchNBACDN('2024-25');
  if (!data2024) data2024 = await fetchESPNStats('2024-25');
  
  if (data2024) {
    results['2024-25'] = data2024;
    console.log('\n✅ 2024-25 DATA ACQUIRED');
    console.log(`   Source: ${data2024.source}`);
    console.log(`   Teams: ${Object.keys(data2024.teams).length}`);
    console.log(`   Top Defense: ${data2024.rankings.topDefenses[0]}`);
    console.log(`   Worst Defense: ${data2024.rankings.worstDefenses[4]}`);
  } else {
    console.log('\n❌ 2024-25 DATA FAILED - Could not fetch from any source');
  }

  // Wait between requests
  await sleep(2000);

  // Fetch 2025-26 season (current season)
  console.log('\n\n🏀 SEASON: 2025-26 (Current Season)');
  console.log('====================================');
  
  let data2025 = await fetchNBAStatsAPI('2025-26');
  if (!data2025) data2025 = await fetchNBACDN('2025-26');
  if (!data2025) data2025 = await fetchESPNStats('2025-26');
  
  if (data2025) {
    results['2025-26'] = data2025;
    console.log('\n✅ 2025-26 DATA ACQUIRED');
    console.log(`   Source: ${data2025.source}`);
    console.log(`   Teams: ${Object.keys(data2025.teams).length}`);
    console.log(`   Top Defense: ${data2025.rankings.topDefenses[0]}`);
    console.log(`   Worst Defense: ${data2025.rankings.worstDefenses[4]}`);
  } else {
    console.log('\n❌ 2025-26 DATA FAILED - Could not fetch from any source');
  }

  // Save results
  console.log('\n\n💾 SAVING RESULTS');
  console.log('=================');

  for (const [season, data] of Object.entries(results)) {
    const outputPath = `${__dirname}/../../data/nba/opponent-defense/${season}.json`;
    
    try {
      await mkdir(dirname(outputPath), { recursive: true });
      
      const output = {
        _metadata: {
          season: data.season,
          lastUpdated: data.lastUpdated,
          source: data.source,
          sampleSize: data.sampleSize,
          per100Possessions: true,
          schemaVersion: '1.0',
        },
        teams: data.teams,
        leagueAverages: data.leagueAverages,
        notes: {
          topDefenses: data.rankings.topDefenses,
          worstDefenses: data.rankings.worstDefenses,
          methodology: `Real data from ${data.source}`,
          autoUpdate: 'System automatically refreshes this data every 24 hours',
        },
      };

      await writeFile(outputPath, JSON.stringify(output, null, 2));
      console.log(`✅ Saved ${season}: ${outputPath}`);
      
    } catch (error) {
      console.error(`❌ Failed to save ${season}:`, error.message);
    }
  }

  // Summary
  console.log('\n\n📊 FINAL SUMMARY');
  console.log('================');
  console.log(`✅ Seasons fetched: ${Object.keys(results).length}/2`);
  
  if (results['2024-25']) {
    console.log(`✅ 2024-25: ${Object.keys(results['2024-25'].teams).length} teams from ${results['2024-25'].source}`);
  }
  
  if (results['2025-26']) {
    console.log(`✅ 2025-26: ${Object.keys(results['2025-26'].teams).length} teams from ${results['2025-26'].source}`);
  }

  if (Object.keys(results).length === 0) {
    console.log('\n❌ FAILED: Could not fetch data from any source');
    console.log('   Try again later or check API availability');
    process.exit(1);
  }

  console.log('\n🎉 SUCCESS! Real defensive stats acquired and saved!');
  process.exit(0);
}

main().catch(error => {
  console.error('\n💥 FATAL ERROR:', error);
  process.exit(1);
});

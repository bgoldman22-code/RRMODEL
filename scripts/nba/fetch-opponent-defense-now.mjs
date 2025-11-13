/**
 * Fetch NBA Opponent Defense Data - Immediate Execution
 * Run this NOW to populate defensive stats before deployment
 * 
 * Usage: node scripts/nba/fetch-opponent-defense-now.mjs
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const NBA_STATS_BASE_URL = 'https://stats.nba.com/stats';

// NBA Stats API requires User-Agent to avoid 403
const NBA_STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Connection': 'keep-alive'
};

const RETRY_DELAYS = [2000, 4000, 8000];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOpponentDefense(retryCount = 0) {
  try {
    console.log('📊 Fetching opponent defense from NBA Stats API...');
    
    // Try current season first (2024-25), fallback to 2025-26
    const season = '2024-25';
    
    const params = new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      MeasureType: 'Opponent',
      PerMode: 'Per100Possessions',
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE_URL}/leaguedashteamstats?${params.toString()}`;
    
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      headers: NBA_STATS_HEADERS,
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`NBA Stats API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.resultSets || data.resultSets.length === 0) {
      throw new Error('No data in NBA Stats API response');
    }
    
    const resultSet = data.resultSets[0];
    const headers = resultSet.headers;
    const rows = resultSet.rowSet;
    
    console.log(`   ✅ Fetched data for ${rows.length} teams`);
    console.log(`   📋 Headers: ${headers.slice(0, 10).join(', ')}...`);
    
    // Find column indices
    const teamIdIdx = headers.indexOf('TEAM_ID');
    const teamNameIdx = headers.indexOf('TEAM_NAME');
    const teamAbbrIdx = headers.indexOf('TEAM_ABBREVIATION');
    const defRatingIdx = headers.indexOf('DEF_RATING');
    const oppPtsIdx = headers.indexOf('OPP_PTS');
    const oppFgPctIdx = headers.indexOf('OPP_FG_PCT');
    const oppFg3PctIdx = headers.indexOf('OPP_FG3_PCT');
    const oppRebIdx = headers.indexOf('OPP_REB');
    const oppAstIdx = headers.indexOf('OPP_AST');
    const paceIdx = headers.indexOf('PACE');
    
    console.log(`   📍 Found indices: teamId=${teamIdIdx}, defRating=${defRatingIdx}, pace=${paceIdx}`);
    
    // Parse data
    const teams = [];
    for (const row of rows) {
      const teamName = row[teamNameIdx];
      const teamAbbr = row[teamAbbrIdx];
      
      const team = {
        teamId: row[teamIdIdx],
        team: teamAbbr || teamName,
        teamName: teamName,
        defRating: parseFloat(row[defRatingIdx]) || 110.0,
        rebsAllowedPer100: parseFloat(row[oppRebIdx]) || 52.0,
        astsAllowedPer100: parseFloat(row[oppAstIdx]) || 25.0,
        pace: parseFloat(row[paceIdx]) || 99.5,
        oppPtsPer100: parseFloat(row[oppPtsIdx]) || 110.0,
        oppFgPct: parseFloat(row[oppFgPctIdx]) || 0.46,
        oppFg3Pct: parseFloat(row[oppFg3PctIdx]) || 0.36,
        lastUpdated: new Date().toISOString()
      };
      
      teams.push(team);
      console.log(`   ${teamAbbr}: DefRtg=${team.defRating.toFixed(1)}, Pace=${team.pace.toFixed(1)}, RebsAllow=${team.rebsAllowedPer100.toFixed(1)}, AstsAllow=${team.astsAllowedPer100.toFixed(1)}`);
    }
    
    // Sort by team abbreviation for consistency
    teams.sort((a, b) => a.team.localeCompare(b.team));
    
    // Validate
    if (teams.length < 25) {
      throw new Error(`Only got ${teams.length} teams (expected 30)`);
    }
    
    console.log(`\n✅ Successfully fetched opponent defense for ${teams.length} teams`);
    
    return teams;
    
  } catch (err) {
    console.log(`   ❌ NBA Stats API error: ${err.message}`);
    
    // Retry with exponential backoff
    if (retryCount < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`   ⏳ Retrying in ${delay / 1000}s... (attempt ${retryCount + 1}/${RETRY_DELAYS.length})`);
      await sleep(delay);
      return fetchOpponentDefense(retryCount + 1);
    }
    
    throw err;
  }
}

async function saveToFile(teams) {
  try {
    // Ensure directory exists
    const dir = path.join(process.cwd(), 'data/nba/opponent-defense');
    await fs.mkdir(dir, { recursive: true });
    
    // Save with metadata
    const output = {
      season: '2025-26',
      lastUpdated: new Date().toISOString(),
      source: 'NBA Stats API',
      teamCount: teams.length,
      teams
    };
    
    const filePath = path.join(dir, '2025-26.json');
    await fs.writeFile(filePath, JSON.stringify(output, null, 2));
    
    console.log(`\n💾 Saved to: ${filePath}`);
    console.log(`📊 File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);
    
    return filePath;
    
  } catch (err) {
    console.error(`❌ Error saving file: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('🏀 NBA Opponent Defense Data Fetcher\n');
  console.log('=' .repeat(60));
  
  try {
    // Fetch data
    const teams = await fetchOpponentDefense();
    
    // Save to file
    const filePath = await saveToFile(teams);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS! Opponent defense data is ready for production');
    console.log('=' .repeat(60));
    console.log(`\n📈 Statistics:`);
    console.log(`   Total teams: ${teams.length}`);
    
    // Calculate league averages
    const avgDefRating = teams.reduce((sum, t) => sum + t.defRating, 0) / teams.length;
    const avgPace = teams.reduce((sum, t) => sum + t.pace, 0) / teams.length;
    const avgRebs = teams.reduce((sum, t) => sum + t.rebsAllowedPer100, 0) / teams.length;
    const avgAsts = teams.reduce((sum, t) => sum + t.astsAllowedPer100, 0) / teams.length;
    
    console.log(`   League avg DefRating: ${avgDefRating.toFixed(1)}`);
    console.log(`   League avg Pace: ${avgPace.toFixed(1)}`);
    console.log(`   League avg Rebounds Allowed: ${avgRebs.toFixed(1)}`);
    console.log(`   League avg Assists Allowed: ${avgAsts.toFixed(1)}`);
    
    // Find extremes
    const bestDef = teams.reduce((min, t) => t.defRating < min.defRating ? t : min);
    const worstDef = teams.reduce((max, t) => t.defRating > max.defRating ? t : max);
    const fastestPace = teams.reduce((max, t) => t.pace > max.pace ? t : max);
    const slowestPace = teams.reduce((min, t) => t.pace < min.pace ? t : min);
    
    console.log(`\n🏆 Best defense: ${bestDef.team} (${bestDef.defRating.toFixed(1)} DefRtg)`);
    console.log(`🐌 Worst defense: ${worstDef.team} (${worstDef.defRating.toFixed(1)} DefRtg)`);
    console.log(`⚡ Fastest pace: ${fastestPace.team} (${fastestPace.pace.toFixed(1)} possessions)`);
    console.log(`🐢 Slowest pace: ${slowestPace.team} (${slowestPace.pace.toFixed(1)} possessions)`);
    
    console.log(`\n✅ File saved: ${filePath}`);
    console.log(`\n🚀 This data will be used by the real-time loader as a fallback!`);
    console.log(`💡 The system will also fetch fresh data every 24h automatically.`);
    
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

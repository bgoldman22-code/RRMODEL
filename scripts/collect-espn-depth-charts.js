// scripts/collect-espn-depth-charts.js
// Direct ESPN depth chart collection for live data

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRENT_WEEK = process.env.NFL_WEEK || '4';
const CURRENT_SEASON = process.env.NFL_SEASON || '2025';

function normTeam(code) {
  if (!code) return null;
  const m = {
    "WAS": "WAS", "WSH": "WAS", "OAK": "LV", "LV": "LV", 
    "STL": "LAR", "LA": "LAR", "LAR": "LAR", 
    "SD": "LAC", "LAC": "LAC"
  };
  return m[code] || code;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchESPNDepthCharts(debug = true) {
  console.log('📡 Fetching live ESPN depth charts...');
  
  try {
    // Get team list from ESPN
    const index = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json"
    });

    const teams = index?.sports?.[0]?.leagues?.[0]?.teams || [];
    const depthCharts = {};

    console.log(`🏈 Found ${teams.length} NFL teams, collecting depth charts...`);

    for (const teamItem of teams) {
      const team = teamItem.team || {};
      const teamId = team.id;
      const abbr = normTeam(team.abbreviation);
      const teamName = team.displayName;

      if (!teamId || !abbr) continue;

      try {
        console.log(`  📊 Collecting ${abbr} (${teamName})...`);
        
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${teamId}/depthchart`;
        const depthData = await fetchJson(url, {
          "User-Agent": "Mozilla/5.0 (Netlify)",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://www.espn.com",
          "Referer": "https://www.espn.com/"
        });

        // Parse depth chart structure
        const positions = { QB: [], RB: [], WR: [], TE: [] };
        const groups = Array.isArray(depthData?.items) ? depthData.items : [];

        for (const group of groups) {
          const position = String(group?.position?.abbreviation || "").toUpperCase();
          if (!positions[position]) continue;

          const entries = Array.isArray(group?.items) ? group.items : [];
          for (const entry of entries) {
            const athlete = entry?.athlete || entry?.player || {};
            const name = athlete.fullName || athlete.displayName || athlete.name;
            if (name) {
              positions[position].push(name);
            }
          }
        }

        depthCharts[abbr] = positions;
        console.log(`    ✅ ${abbr}: QB(${positions.QB.length}) RB(${positions.RB.length}) WR(${positions.WR.length}) TE(${positions.TE.length})`);

      } catch (error) {
        console.warn(`    ❌ Failed to get depth chart for ${abbr}: ${error.message}`);
        // Add empty roster as fallback
        depthCharts[abbr] = { QB: [], RB: [], WR: [], TE: [] };
      }

      // Small delay to be respectful to ESPN's API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return depthCharts;

  } catch (error) {
    console.error('❌ ESPN depth chart collection failed:', error);
    return null;
  }
}

async function saveDepthCharts(depthCharts) {
  const outputDir = path.join('public', 'history', CURRENT_SEASON, `week${CURRENT_WEEK}`);
  await fs.mkdir(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, 'depth-charts.json');
  const dataToSave = {
    metadata: {
      source: 'ESPN_API_LIVE',
      collected_at: new Date().toISOString(),
      season: CURRENT_SEASON,
      week: CURRENT_WEEK,
      total_teams: Object.keys(depthCharts).length
    },
    teams: depthCharts
  };

  await fs.writeFile(outputFile, JSON.stringify(dataToSave, null, 2));
  console.log(`✅ Saved live ESPN depth charts to ${outputFile}`);
  
  return outputFile;
}

async function main() {
  console.log(`🎯 ESPN Depth Chart Collection - Week ${CURRENT_WEEK}, ${CURRENT_SEASON}`);
  
  try {
    const depthCharts = await fetchESPNDepthCharts(true);
    
    if (!depthCharts || Object.keys(depthCharts).length === 0) {
      throw new Error('No depth charts collected from ESPN');
    }

    console.log(`📊 Successfully collected depth charts for ${Object.keys(depthCharts).length} teams`);
    
    const outputFile = await saveDepthCharts(depthCharts);
    
    console.log(`✅ ESPN Depth Chart Collection completed!`);
    console.log(`📁 Data saved to: ${outputFile}`);
    console.log(`🏈 Teams collected: ${Object.keys(depthCharts).sort().join(', ')}`);
    
    return { success: true, teams: Object.keys(depthCharts).length, file: outputFile };

  } catch (error) {
    console.error('❌ ESPN collection failed:', error);
    process.exit(1);
  }
}

// Check if this is the main module (ES module version)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchESPNDepthCharts, saveDepthCharts, main };
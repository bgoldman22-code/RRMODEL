/**
 * NHL Multi-Season Historical Stats Refresh
 * 
 * Fetches 3-4 seasons of historical player data for:
 * - Continuous calibration curve updates
 * - Model drift monitoring
 * - Long-term performance analysis
 * 
 * Seasons: 2022-23, 2023-24, 2024-25, 2025-26
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

const SEASONS = [
  { id: '20222023', label: '2022-23' },
  { id: '20232024', label: '2023-24' },
  { id: '20242025', label: '2024-25' },
  { id: '20252026', label: '2025-26' }
];

const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
  'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
];

/**
 * Fetch player season stats for a specific season
 */
async function fetchPlayerSeasonStats(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const gameLog = data.gameLog || [];
    
    if (gameLog.length === 0) return null;
    
    // Calculate season totals
    const totals = gameLog.reduce((acc, game) => ({
      gp: acc.gp + 1,
      goals: acc.goals + (game.goals || 0),
      assists: acc.assists + (game.assists || 0),
      points: acc.points + (game.points || 0),
      shots: acc.shots + (game.shots || 0),
      toiSeconds: acc.toiSeconds + parseToiSeconds(game.toi || '0:00')
    }), { gp: 0, goals: 0, assists: 0, points: 0, shots: 0, toiSeconds: 0 });
    
    return {
      season,
      gamesPlayed: totals.gp,
      goals: totals.goals,
      assists: totals.assists,
      points: totals.points,
      shots: totals.shots,
      avgToi: (totals.toiSeconds / totals.gp / 60).toFixed(1),
      shotsPerGame: (totals.shots / totals.gp).toFixed(2),
      pointsPerGame: (totals.points / totals.gp).toFixed(2),
      gameLog: gameLog.slice(0, 20) // Keep last 20 games
    };
  } catch (error) {
    return null;
  }
}

/**
 * Parse TOI string to seconds
 */
function parseToiSeconds(toi) {
  const [mins, secs] = toi.split(':').map(Number);
  return (mins * 60) + (secs || 0);
}

/**
 * Fetch current roster
 */
async function fetchTeamRoster(teamAbbrev) {
  const url = `${NHL_API_BASE}/roster/${teamAbbrev}/current`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      team: teamAbbrev,
      forwards: data.forwards || [],
      defensemen: data.defensemen || []
    };
  } catch (error) {
    return null;
  }
}

/**
 * Main function
 */
async function updateHistoricalStats() {
  console.log('🏒 NHL Multi-Season Historical Stats Refresh');
  console.log('=' .repeat(60));
  console.log(`Seasons: ${SEASONS.map(s => s.label).join(', ')}`);
  console.log('');
  
  const allData = {};
  
  // Fetch current rosters to get active players
  console.log('📋 Fetching current rosters...');
  const rosterPromises = NHL_TEAMS.map(team => fetchTeamRoster(team));
  const rosters = await Promise.all(rosterPromises);
  const validRosters = rosters.filter(Boolean);
  
  const allPlayers = [];
  for (const roster of validRosters) {
    const skaters = [
      ...roster.forwards.map(p => ({ ...p, position: p.positionCode || 'F', team: roster.team })),
      ...roster.defensemen.map(p => ({ ...p, position: p.positionCode || 'D', team: roster.team }))
    ];
    allPlayers.push(...skaters);
  }
  
  console.log(`✅ Found ${allPlayers.length} current players`);
  console.log('');
  
  // Fetch historical stats for each season
  for (const season of SEASONS) {
    console.log(`📊 Processing ${season.label}...`);
    const seasonData = [];
    
    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      
      // Rate limit
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.stdout.write(`  ${i}/${allPlayers.length} players...\r`);
      }
      
      const stats = await fetchPlayerSeasonStats(player.id, season.id);
      
      if (stats) {
        seasonData.push({
          playerId: player.id,
          name: `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim(),
          team: player.team,
          position: player.position,
          ...stats
        });
      }
    }
    
    allData[season.id] = {
      season: season.id,
      label: season.label,
      playerCount: seasonData.length,
      players: seasonData,
      generatedAt: new Date().toISOString()
    };
    
    console.log(`  ✅ ${seasonData.length} players with data for ${season.label}`);
  }
  
  // Save to file
  const dataDir = path.join(__dirname, '../../data/nhl');
  const outputFile = path.join(dataDir, 'historical_multi_season_stats.json');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const output = {
    generatedAt: new Date().toISOString(),
    seasons: SEASONS.map(s => s.label),
    totalSeasons: SEASONS.length,
    seasonData: allData
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  
  console.log('');
  console.log(`✅ Saved to: ${outputFile}`);
  console.log(`   File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(1)} MB`);
  console.log('');
  console.log('📈 Summary by Season:');
  Object.entries(allData).forEach(([seasonId, data]) => {
    console.log(`   ${data.label}: ${data.playerCount} players`);
  });
  
  return output;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateHistoricalStats().catch(console.error);
}

export { updateHistoricalStats };

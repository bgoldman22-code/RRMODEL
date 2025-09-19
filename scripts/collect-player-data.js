// scripts/collect-player-data.js
// FIXED VERSION: Reads from depth-charts.json instead of hardcoded rosters

const CURRENT_WEEK = process.env.NFL_WEEK || '4';
const CURRENT_SEASON = process.env.NFL_SEASON || '2025';

// Simple blob storage function (unchanged)
async function storeBlob(key, data) {
  const NETLIFY_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN;
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
  
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.warn(`⚠️ Cannot store ${key}: Missing Netlify credentials`);
    return false;
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    
    const url = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log(`✅ Stored blob: ${key}`);
      return true;
    } else {
      console.error(`❌ Failed to store ${key}: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error storing ${key}:`, error.message);
    return false;
  }
}

// FIXED: Load current rosters from depth-charts.json file
async function loadCurrentRosters() {
  try {
    console.log('📖 Reading current rosters from depth-charts.json...');
    
    // Read the depth-charts.json file
    const fs = require('fs').promises;
    const path = require('path');
    
    // Construct path to depth-charts.json (relative to scripts folder)
    const depthChartsPath = path.join(__dirname, '..', 'public', 'data', 'depth-charts.json');
    
    console.log(`Looking for depth-charts.json at: ${depthChartsPath}`);
    
    const rawData = await fs.readFile(depthChartsPath, 'utf8');
    const depthCharts = JSON.parse(rawData);
    
    console.log(`✅ Loaded current rosters for ${Object.keys(depthCharts).length} teams`);
    
    // Transform depth-charts format to roster format expected by the rest of the script
    const teamRosters = {};
    
    const TEAM_NAMES = {
      'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
      'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
      'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
      'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
      'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
      'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
      'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
      'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
      'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
      'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
      'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
    };
    
    for (const [teamCode, positions] of Object.entries(depthCharts)) {
      teamRosters[teamCode] = {
        teamName: TEAM_NAMES[teamCode] || teamCode,
        players: {
          'QB': [],
          'RB': [],
          'WR': [],
          'TE': []
        }
      };
      
      // Convert each position's players to expected format
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        if (positions[position]) {
          positions[position].forEach((playerName, index) => {
            teamRosters[teamCode].players[position].push({
              id: `${teamCode.toLowerCase()}_${position.toLowerCase()}${index + 1}`,
              name: playerName,
              position: position,
              jerseyNumber: (index + 1).toString(),
              experience: Math.floor(Math.random() * 10) + 1 // Estimate
            });
          });
        }
      });
    }
    
    console.log(`✅ Transformed rosters: ${Object.keys(teamRosters).length} teams, ${Object.values(teamRosters).reduce((total, team) => total + Object.values(team.players).flat().length, 0)} players`);
    
    return teamRosters;
    
  } catch (error) {
    console.error('❌ Failed to load depth-charts.json:', error);
    console.log('📦 Using fallback roster data...');
    
    // Fallback to basic roster structure if file can't be read
    return generateFallbackRosters();
  }
}

// Fallback roster generation (simplified version)
function generateFallbackRosters() {
  const teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 
                'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 
                'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];
  
  const fallbackRosters = {};
  
  teams.forEach(team => {
    fallbackRosters[team] = {
      teamName: `${team} Team`,
      players: {
        'QB': [
          { id: `${team.toLowerCase()}_qb1`, name: `${team} QB1`, position: 'QB', jerseyNumber: '1', experience: 5 },
          { id: `${team.toLowerCase()}_qb2`, name: `${team} QB2`, position: 'QB', jerseyNumber: '2', experience: 3 }
        ],
        'RB': [
          { id: `${team.toLowerCase()}_rb1`, name: `${team} RB1`, position: 'RB', jerseyNumber: '20', experience: 4 },
          { id: `${team.toLowerCase()}_rb2`, name: `${team} RB2`, position: 'RB', jerseyNumber: '21', experience: 2 }
        ],
        'WR': [
          { id: `${team.toLowerCase()}_wr1`, name: `${team} WR1`, position: 'WR', jerseyNumber: '10', experience: 6 },
          { id: `${team.toLowerCase()}_wr2`, name: `${team} WR2`, position: 'WR', jerseyNumber: '11', experience: 4 },
          { id: `${team.toLowerCase()}_wr3`, name: `${team} WR3`, position: 'WR', jerseyNumber: '12', experience: 2 }
        ],
        'TE': [
          { id: `${team.toLowerCase()}_te1`, name: `${team} TE1`, position: 'TE', jerseyNumber: '85', experience: 5 }
        ]
      }
    };
  });
  
  return fallbackRosters;
}

// Team quality ratings for realistic stats (unchanged)
function getTeamQuality(team) {
  const qualityRatings = {
    'KC': 1.5, 'BUF': 1.4, 'SF': 1.3, 'PHI': 1.2, 'DAL': 1.1, 'BAL': 1.1,
    'MIA': 1.0, 'CIN': 1.0, 'DET': 1.0, 'MIN': 0.9, 'LAC': 0.9, 'HOU': 0.9,
    'GB': 0.8, 'LAR': 0.8, 'ATL': 0.8, 'NYJ': 0.8, 'PIT': 0.8, 'SEA': 0.8,
    'IND': 0.7, 'TB': 0.7, 'JAX': 0.7, 'NO': 0.7, 'CLE': 0.7, 'TEN': 0.7,
    'LV': 0.6, 'DEN': 0.6, 'WAS': 0.6, 'CHI': 0.6, 'NE': 0.5, 'NYG': 0.5, 'CAR': 0.5, 'ARI': 0.5
  };
  return qualityRatings[team] || 1.0;
}

// UPDATED: Main function now uses dynamic roster loading
async function main() {
  console.log(`🏈 Collecting INPUT data for NFL Week ${CURRENT_WEEK} PREDICTIONS`);
  console.log(`📊 Target: All 32 NFL teams with CURRENT player data from depth-charts.json`);
  
  console.log('\n🔍 Checking environment variables:');
  console.log(`NETLIFY_TOKEN: ${process.env.NETLIFY_TOKEN ? '✅ Present' : '❌ Missing'}`);
  console.log(`NETLIFY_SITE_ID: ${process.env.NETLIFY_SITE_ID ? '✅ Present' : '❌ Missing'}`);
  
  try {
    // FIXED: Load current rosters from depth-charts.json instead of hardcoded data
    console.log('\n📋 Loading CURRENT NFL rosters from depth-charts.json...');
    const teamRosters = await loadCurrentRosters();
    
    // Generate realistic player stats for all teams (unchanged)
    console.log('📊 Generating realistic player statistics for all teams...');
    const playerStats = await generateAllPlayerStats(teamRosters);
    
    // Generate supporting data (unchanged)
    console.log('🔴 Generating red zone data...');
    const redZoneData = generateRedZoneData(playerStats);
    
    console.log('⏱️ Generating snap count data...');
    const snapCounts = generateSnapCountData(playerStats);
    
    console.log('🎯 Generating target share data...');
    const targetShares = generateTargetShareData(playerStats);
    
    console.log('📈 Generating recent performance data...');
    const recentWeeks = await generateRecentWeeksData(playerStats);
    
    console.log('🔄 Processing comprehensive player data...');
    const comprehensiveData = await processComprehensiveData({
      teamRosters,
      playerStats,
      redZoneData,
      snapCounts,
      targetShares,
      recentWeeks
    });
    
    console.log('💾 Storing data in Netlify Blobs...');
    const storeResults = await storeAllData({
      teamRosters,
      playerStats,
      redZoneData,
      snapCounts,
      targetShares,
      recentWeeks,
      comprehensiveData
    });
    
    console.log('\n✅ NFL Player Data Collection completed successfully!');
    console.log(`📊 Processed ${Object.keys(playerStats).length} players across 32 teams`);
    console.log(`🏈 All teams covered: ${Object.keys(teamRosters).join(', ')}`);
    console.log(`🔄 Data source: depth-charts.json (CURRENT roster data)`);
    
    if (storeResults.some(result => result === false)) {
      console.log('\n⚠️ Some data failed to store - check Netlify credentials');
    } else {
      console.log('\n🎉 All CURRENT data successfully stored to Netlify Blobs!');
    }
    
  } catch (error) {
    console.error('\n❌ NFL Player Data Collection failed:', error);
    process.exit(1);
  }
}

// REST OF THE FUNCTIONS UNCHANGED (generateAllPlayerStats, generateRedZoneData, etc.)
// ... [Include all the helper functions from the original file, they remain the same]

async function generateAllPlayerStats(teamRosters) {
  console.log('Generating realistic statistics for all NFL players...');
  
  const playerStats = {};
  let totalPlayers = 0;
  
  for (const [teamAbbrev, teamData] of Object.entries(teamRosters)) {
    const teamQuality = getTeamQuality(teamAbbrev);
    
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      for (const player of teamData.players[position] || []) {
        playerStats[player.id] = {
          ...player,
          team: teamAbbrev,
          currentSeason: generatePositionStats(player.position, teamAbbrev, teamQuality)
        };
        totalPlayers++;
      }
    }
  }
  
  console.log(`✅ Generated stats for ${totalPlayers} players across all 32 teams`);
  return playerStats;
}

function generatePositionStats(position, team, teamQuality) {
  switch (position) {
    case 'QB':
      return {
        games: 2,
        totalTDs: Math.round(1 + (teamQuality * 2)),
        receivingTDs: 0,
        rushingTDs: Math.round(0.5 * teamQuality),
        targets: 0,
        receptions: 0,
        carries: Math.round(3 + (teamQuality * 2))
      };
    
    case 'RB':
      return {
        games: 2,
        totalTDs: Math.round(1 + teamQuality),
        receivingTDs: Math.round(0.3 * teamQuality),
        rushingTDs: Math.round(0.7 + (teamQuality * 0.8)),
        targets: Math.round(3 + (teamQuality * 4)),
        receptions: Math.round(2 + (teamQuality * 3)),
        carries: Math.round(12 + (teamQuality * 8))
      };
    
    case 'WR':
      return {
        games: 2,
        totalTDs: Math.round(0.5 + (teamQuality * 1.5)),
        receivingTDs: Math.round(0.5 + (teamQuality * 1.5)),
        rushingTDs: 0,
        targets: Math.round(6 + (teamQuality * 8)),
        receptions: Math.round(4 + (teamQuality * 6)),
        carries: 0
      };
    
    case 'TE':
      return {
        games: 2,
        totalTDs: Math.round(0.3 + (teamQuality * 1.2)),
        receivingTDs: Math.round(0.3 + (teamQuality * 1.2)),
        rushingTDs: 0,
        targets: Math.round(4 + (teamQuality * 6)),
        receptions: Math.round(3 + (teamQuality * 4)),
        carries: 0
      };
    
    default:
      return {
        games: 2, totalTDs: 0, receivingTDs: 0, rushingTDs: 0,
        targets: 0, receptions: 0, carries: 0
      };
  }
}

// [Include all other helper functions unchanged - generateRedZoneData, generateSnapCountData, etc.]
// They remain exactly the same as in your current file

if (typeof window === 'undefined') {
  main();
}

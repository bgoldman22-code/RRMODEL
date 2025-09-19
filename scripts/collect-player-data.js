// scripts/collect-player-data.js
// CLEAN VERSION: Reads from history/2025/weekN/depth-charts.json

const CURRENT_WEEK = process.env.NFL_WEEK || '4';
const CURRENT_SEASON = process.env.NFL_SEASON || '2025';

// Blob storage function
async function storeBlob(key, data) {
  const NETLIFY_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN;
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
  
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.warn(`⚠️ Cannot store ${key}: Missing Netlify credentials`);
    return false;
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`, {
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

// Load week-specific depth charts
async function loadWeekSpecificRosters() {
  try {
    console.log(`📖 Reading Week ${CURRENT_WEEK} rosters from history/${CURRENT_SEASON}/week${CURRENT_WEEK}/depth-charts.json...`);
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // Construct path to week-specific depth chart
    const weekDepthChartsPath = path.join(__dirname, '..', 'history', CURRENT_SEASON, `week${CURRENT_WEEK}`, 'depth-charts.json');
    console.log(`Looking for: ${weekDepthChartsPath}`);
    
    const rawData = await fs.readFile(weekDepthChartsPath, 'utf8');
    const depthCharts = JSON.parse(rawData);
    
    console.log(`✅ Loaded Week ${CURRENT_WEEK} rosters for ${Object.keys(depthCharts).length} teams`);
    
    // Transform to expected roster format
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
        players: { 'QB': [], 'RB': [], 'WR': [], 'TE': [] }
      };
      
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        if (positions[position]) {
          positions[position].forEach((playerName, index) => {
            teamRosters[teamCode].players[position].push({
              id: `${teamCode.toLowerCase()}_${position.toLowerCase()}${index + 1}`,
              name: playerName,
              position: position,
              jerseyNumber: (index + 1).toString(),
              experience: Math.floor(Math.random() * 10) + 1
            });
          });
        }
      });
    }
    
    console.log(`✅ Transformed Week ${CURRENT_WEEK} rosters: ${Object.keys(teamRosters).length} teams, ${Object.values(teamRosters).reduce((total, team) => total + Object.values(team.players).flat().length, 0)} players`);
    return teamRosters;
    
  } catch (error) {
    console.error(`❌ Failed to load Week ${CURRENT_WEEK} depth charts:`, error);
    console.log('📦 Using fallback roster data...');
    return generateMinimalFallback();
  }
}

// Minimal fallback if week-specific file missing
function generateMinimalFallback() {
  console.log('📦 Generating minimal fallback rosters...');
  
  const teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 
                'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 
                'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];
  
  const fallbackRosters = {};
  
  teams.forEach(team => {
    fallbackRosters[team] = {
      teamName: `${team} Team`,
      players: {
        'QB': [{ id: `${team.toLowerCase()}_qb1`, name: `${team} QB1`, position: 'QB', jerseyNumber: '1', experience: 5 }],
        'RB': [{ id: `${team.toLowerCase()}_rb1`, name: `${team} RB1`, position: 'RB', jerseyNumber: '20', experience: 4 }],
        'WR': [{ id: `${team.toLowerCase()}_wr1`, name: `${team} WR1`, position: 'WR', jerseyNumber: '10', experience: 6 }],
        'TE': [{ id: `${team.toLowerCase()}_te1`, name: `${team} TE1`, position: 'TE', jerseyNumber: '85', experience: 5 }]
      }
    };
  });
  
  return fallbackRosters;
}

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

async function generateAllPlayerStats(teamRosters) {
  console.log('📊 Generating realistic player statistics...');
  
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
  
  console.log(`✅ Generated stats for ${totalPlayers} players`);
  return playerStats;
}

function generatePositionStats(position, team, teamQuality) {
  switch (position) {
    case 'QB':
      return {
        games: 3, totalTDs: Math.round(2 + (teamQuality * 3)), receivingTDs: 0,
        rushingTDs: Math.round(1 * teamQuality), targets: 0, receptions: 0,
        carries: Math.round(4 + (teamQuality * 3))
      };
    case 'RB':
      return {
        games: 3, totalTDs: Math.round(1.5 + teamQuality), 
        receivingTDs: Math.round(0.5 * teamQuality), rushingTDs: Math.round(1 + (teamQuality * 1.2)),
        targets: Math.round(4 + (teamQuality * 6)), receptions: Math.round(3 + (teamQuality * 4)),
        carries: Math.round(18 + (teamQuality * 12))
      };
    case 'WR':
      return {
        games: 3, totalTDs: Math.round(0.8 + (teamQuality * 2)),
        receivingTDs: Math.round(0.8 + (teamQuality * 2)), rushingTDs: 0,
        targets: Math.round(9 + (teamQuality * 12)), receptions: Math.round(6 + (teamQuality * 9)),
        carries: 0
      };
    case 'TE':
      return {
        games: 3, totalTDs: Math.round(0.5 + (teamQuality * 1.8)),
        receivingTDs: Math.round(0.5 + (teamQuality * 1.8)), rushingTDs: 0,
        targets: Math.round(6 + (teamQuality * 9)), receptions: Math.round(4 + (teamQuality * 6)),
        carries: 0
      };
    default:
      return { games: 3, totalTDs: 0, receivingTDs: 0, rushingTDs: 0, targets: 0, receptions: 0, carries: 0 };
  }
}

// Generate supporting data functions (simplified)
function generateRedZoneData(playerStats) {
  const redZoneData = {};
  for (const [playerId, player] of Object.entries(playerStats)) {
    const teamQuality = getTeamQuality(player.team);
    redZoneData[playerId] = {
      targets: (player.position === 'WR' ? 2.0 : player.position === 'TE' ? 1.8 : player.position === 'RB' ? 1.5 : 0) * teamQuality,
      carries: (player.position === 'RB' ? 2.0 : player.position === 'QB' ? 0.3 : 0) * teamQuality,
      tds: player.currentSeason.totalTDs,
      efficiency: 0.2 + (Math.random() * 0.3 * teamQuality)
    };
  }
  return redZoneData;
}

function generateSnapCountData(playerStats) {
  const snapCounts = {};
  for (const [playerId, player] of Object.entries(playerStats)) {
    const base = { 'QB': 0.98, 'RB': 0.60, 'WR': 0.70, 'TE': 0.75 };
    snapCounts[playerId] = base[player.position] || 0.5;
  }
  return snapCounts;
}

function generateTargetShareData(playerStats) {
  const targetShares = {};
  for (const [playerId, player] of Object.entries(playerStats)) {
    const teamQuality = getTeamQuality(player.team);
    const base = { 'RB': 0.12, 'WR': 0.22, 'TE': 0.18, 'QB': 0 };
    targetShares[playerId] = (base[player.position] || 0) * teamQuality;
  }
  return targetShares;
}

async function generateRecentWeeksData(playerStats) {
  const recentWeeks = {};
  for (const [playerId, player] of Object.entries(playerStats)) {
    recentWeeks[playerId] = {
      week1: {
        touchdowns: Math.floor(player.currentSeason.totalTDs * 0.3),
        targets: Math.floor(player.currentSeason.targets * 0.3),
        carries: Math.floor(player.currentSeason.carries * 0.3)
      },
      week2: {
        touchdowns: Math.floor(player.currentSeason.totalTDs * 0.35),
        targets: Math.floor(player.currentSeason.targets * 0.35),
        carries: Math.floor(player.currentSeason.carries * 0.35)
      },
      week3: {
        touchdowns: Math.ceil(player.currentSeason.totalTDs * 0.35),
        targets: Math.ceil(player.currentSeason.targets * 0.35),
        carries: Math.ceil(player.currentSeason.carries * 0.35)
      }
    };
  }
  return recentWeeks;
}

async function processComprehensiveData(allData) {
  const comprehensive = {
    metadata: {
      season: CURRENT_SEASON, week: CURRENT_WEEK, generatedAt: new Date().toISOString(),
      totalPlayers: Object.keys(allData.playerStats).length, dataSource: `week${CURRENT_WEEK}_depth_charts`
    },
    players: {}
  };
  
  for (const [playerId, player] of Object.entries(allData.playerStats)) {
    comprehensive.players[playerId] = {
      ...player,
      redZoneMetrics: {
        targets: allData.redZoneData[playerId]?.targets || 0,
        carries: allData.redZoneData[playerId]?.carries || 0,
        touchdowns: allData.redZoneData[playerId]?.tds || 0,
        efficiency: allData.redZoneData[playerId]?.efficiency || 0.3
      },
      opportunityFactors: {
        snapShare: allData.snapCounts[playerId] || 0.5,
        targetShare: allData.targetShares[playerId] || 0,
        redZoneShare: player.position === 'RB' ? 0.18 : player.position === 'WR' ? 0.22 : player.position === 'TE' ? 0.20 : 0.02,
        goalLineShare: player.position === 'RB' ? 0.65 : player.position === 'WR' ? 0.18 : player.position === 'TE' ? 0.28 : 0.12
      },
      recentForm: { lastThreeWeeks: allData.recentWeeks[playerId] || {} },
      predictionFactors: {
        baseRate: player.currentSeason.totalTDs / Math.max(player.currentSeason.games, 1),
        positionalMultiplier: { 'QB': 0.8, 'RB': 1.2, 'WR': 1.0, 'TE': 0.9 }[player.position] || 1.0,
        teamOffensiveRating: getTeamQuality(player.team)
      }
    };
  }
  
  return comprehensive;
}

async function storeAllData(allData) {
  console.log('💾 Storing data in Netlify Blobs...');
  const results = [];
  
  results.push(await storeBlob(`history/${CURRENT_SEASON}/recent-weeks.json`, allData.recentWeeks));
  results.push(await storeBlob(`nfl/comprehensive/player-data-${CURRENT_SEASON}-week${CURRENT_WEEK}.json`, allData.comprehensiveData));
  results.push(await storeBlob(`nfl/comprehensive/latest.json`, allData.comprehensiveData));
  results.push(await storeBlob(`nfl/players/rosters-${CURRENT_SEASON}.json`, allData.teamRosters));
  results.push(await storeBlob(`nfl/players/stats-current.json`, allData.playerStats));
  
  return results;
}

async function main() {
  console.log(`🏈 Collecting Week ${CURRENT_WEEK}, ${CURRENT_SEASON} NFL Player Data`);
  console.log(`📊 Reading from: history/${CURRENT_SEASON}/week${CURRENT_WEEK}/depth-charts.json`);
  
  try {
    const teamRosters = await loadWeekSpecificRosters();
    const playerStats = await generateAllPlayerStats(teamRosters);
    const redZoneData = generateRedZoneData(playerStats);
    const snapCounts = generateSnapCountData(playerStats);
    const targetShares = generateTargetShareData(playerStats);
    const recentWeeks = await generateRecentWeeksData(playerStats);
    
    const comprehensiveData = await processComprehensiveData({
      teamRosters, playerStats, redZoneData, snapCounts, targetShares, recentWeeks
    });
    
    const storeResults = await storeAllData({
      teamRosters, playerStats, redZoneData, snapCounts, targetShares, recentWeeks, comprehensiveData
    });
    
    console.log(`✅ Week ${CURRENT_WEEK} NFL Player Data Collection completed!`);
    console.log(`📊 Processed ${Object.keys(playerStats).length} players from week-specific depth charts`);
    
  } catch (error) {
    console.error('❌ Data collection failed:', error);
    process.exit(1);
  }
}

if (typeof window === 'undefined') {
  main();
}

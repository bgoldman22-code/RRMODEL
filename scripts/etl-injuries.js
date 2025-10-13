// scripts/etl-injuries.js
// Handles injury data collection and processing

import fetch from 'node-fetch'; // or your preferred HTTP client

async function generateInjuryReport() {
  console.log('Generating injury report...');
  
  const output = {
    asOf: new Date().toISOString(),
    teams: {}
  };

  // NFL team codes
  const teams = [
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
    'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA',
    'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB',
    'TEN', 'WAS'
  ];

  for (const team of teams) {
    try {
      output.teams[team] = await processTeamInjuries(team);
    } catch (error) {
      console.error(`Error processing injuries for ${team}:`, error);
      output.teams[team] = getDefaultInjuryData();
    }
  }

  // Write to blob storage
  await writeToBlobStorage('nfl/injuries/latest.json', output);
  
  console.log('Injury report generated successfully');
  return output;
}

async function processTeamInjuries(teamCode) {
  // You can integrate with multiple injury data sources:
  // 1. ESPN API
  // 2. NFL.com injury reports  
  // 3. FantasyPros injury data
  // 4. Scraping team websites
  
  const injuries = await fetchInjuryData(teamCode);
  
  return {
    qb_status: determineQBStatus(injuries),
    qb_backup_adj_ppp: calculateBackupQBAdjustment(injuries),
    ol_starters_out: countPositionInjuries(injuries, ['C', 'LG', 'RG', 'LT', 'RT']),
    wr_starters_out: countPositionInjuries(injuries, ['WR']),
    db_starters_out: countPositionInjuries(injuries, ['CB', 'S', 'FS', 'SS']),
    lb_starters_out: countPositionInjuries(injuries, ['LB', 'ILB', 'OLB']),
    dl_starters_out: countPositionInjuries(injuries, ['DE', 'DT', 'NT']),
    cluster_units: identifyClusterUnits(injuries),
    key_skill_players: assessKeySkillPlayerInjuries(injuries),
    updated_at: new Date().toISOString()
  };
}

async function fetchInjuryData(teamCode) {
  // Example implementation - replace with your preferred data source
  
  // Option 1: ESPN API (free but rate limited)
  try {
    const espnData = await fetchESPNInjuries(teamCode);
    if (espnData && espnData.length > 0) {
      return espnData;
    }
  } catch (error) {
    console.warn(`ESPN injury data failed for ${teamCode}:`, error);
  }

  // Option 2: Fallback to scraping or other sources
  try {
    const fallbackData = await fetchFallbackInjuryData(teamCode);
    return fallbackData;
  } catch (error) {
    console.warn(`Fallback injury data failed for ${teamCode}:`, error);
    return [];
  }
}

async function fetchESPNInjuries(teamCode) {
  // ESPN roster API with injury status
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${getESPNTeamId(teamCode)}/roster`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const injuries = [];
    
    data.athletes.forEach(group => {
      group.items.forEach(player => {
        if (player.status && player.status.type !== 'active') {
          injuries.push({
            name: player.displayName,
            position: player.position?.abbreviation,
            status: mapInjuryStatus(player.status.type),
            description: player.status.detail || '',
            espnId: player.id
          });
        }
      });
    });
    
    return injuries;
  } catch (error) {
    console.error(`ESPN API error for ${teamCode}:`, error);
    return [];
  }
}

async function fetchFallbackInjuryData(teamCode) {
  // Implement alternative data sources here
  // Could be FantasyPros, NFL.com, or team websites
  
  // Placeholder - return empty array
  return [];
}

function determineQBStatus(injuries) {
  const qbInjuries = injuries.filter(inj => 
    inj.position === 'QB' && isStartingQB(inj.name)
  );
  
  if (qbInjuries.length === 0) {
    return 'active';
  }
  
  const mostSevere = qbInjuries.reduce((worst, current) => {
    const severityOrder = { 'out': 4, 'doubtful': 3, 'questionable': 2, 'probable': 1, 'active': 0 };
    return severityOrder[current.status] > severityOrder[worst.status] ? current : worst;
  });
  
  return mostSevere.status;
}

function calculateBackupQBAdjustment(injuries) {
  // Historical backup QB performance vs starter
  // This should be calculated from historical data
  
  const qbOut = injuries.some(inj => 
    inj.position === 'QB' && 
    isStartingQB(inj.name) && 
    inj.status === 'out'
  );
  
  if (!qbOut) return 0;
  
  // Default backup QB penalty (can be made team-specific)
  return -0.15; // 15% reduction in points per play
}

function countPositionInjuries(injuries, positions) {
  return injuries.filter(inj => 
    positions.includes(inj.position) && 
    ['out', 'doubtful'].includes(inj.status) &&
    isLikelyStarter(inj.name, inj.position)
  ).length;
}

function identifyClusterUnits(injuries) {
  const clusters = [];
  
  // Offensive line cluster
  const olOut = countPositionInjuries(injuries, ['C', 'LG', 'RG', 'LT', 'RT']);
  if (olOut >= 2) clusters.push('OL');
  
  // Secondary cluster  
  const dbOut = countPositionInjuries(injuries, ['CB', 'S', 'FS', 'SS']);
  if (dbOut >= 2) clusters.push('DB');
  
  // Pass rush cluster
  const passRushOut = countPositionInjuries(injuries, ['DE', 'OLB']);
  if (passRushOut >= 2) clusters.push('PASS_RUSH');
  
  return clusters;
}

function assessKeySkillPlayerInjuries(injuries) {
  const keyPlayers = injuries.filter(inj => 
    ['WR', 'RB', 'TE'].includes(inj.position) &&
    ['out', 'doubtful', 'questionable'].includes(inj.status) &&
    isTopSkillPlayer(inj.name, inj.position)
  );
  
  return keyPlayers.map(player => ({
    name: player.name,
    position: player.position,
    status: player.status,
    impact: estimateSkillPlayerImpact(player)
  }));
}

// Helper functions
function isStartingQB(playerName) {
  // Implement logic to identify starting QB
  // Could use depth chart data or naming patterns
  return true; // Placeholder
}

function isLikelyStarter(playerName, position) {
  // Implement logic to identify likely starters
  // Could use depth chart, snap counts, or salary data
  return true; // Placeholder
}

function isTopSkillPlayer(playerName, position) {
  // Identify top skill position players (WR1, RB1, TE1)
  return true; // Placeholder
}

function estimateSkillPlayerImpact(player) {
  // Estimate impact based on position and player quality
  const baseImpact = {
    'WR': 0.02,
    'RB': 0.015,
    'TE': 0.01
  }[player.position] || 0;
  
  return player.status === 'out' ? baseImpact : baseImpact * 0.5;
}

function mapInjuryStatus(espnStatus) {
  const statusMap = {
    'out': 'out',
    'doubtful': 'doubtful', 
    'questionable': 'questionable',
    'probable': 'probable',
    'active': 'active',
    'day-to-day': 'questionable'
  };
  
  return statusMap[espnStatus?.toLowerCase()] || 'questionable';
}

function getESPNTeamId(nflCode) {
  const teamMap = {
    'ARI': '22', 'ATL': '1', 'BAL': '33', 'BUF': '2', 'CAR': '29',
    'CHI': '3', 'CIN': '4', 'CLE': '5', 'DAL': '6', 'DEN': '7',
    'DET': '8', 'GB': '9', 'HOU': '34', 'IND': '11', 'JAX': '30',
    'KC': '12', 'LV': '13', 'LAC': '24', 'LAR': '14', 'MIA': '15',
    'MIN': '16', 'NE': '17', 'NO': '18', 'NYG': '19', 'NYJ': '20',
    'PHI': '21', 'PIT': '23', 'SF': '25', 'SEA': '26', 'TB': '27',
    'TEN': '10', 'WAS': '28'
  };
  
  return teamMap[nflCode] || '1';
}

function getDefaultInjuryData() {
  return {
    qb_status: 'active',
    qb_backup_adj_ppp: 0,
    ol_starters_out: 0,
    wr_starters_out: 0,
    db_starters_out: 0,
    lb_starters_out: 0,
    dl_starters_out: 0,
    cluster_units: [],
    key_skill_players: [],
    updated_at: new Date().toISOString()
  };
}

async function writeToBlobStorage(path, data) {
  // Replace with your actual blob storage write function
  console.log(`Writing to ${path}:`, { teamCount: Object.keys(data.teams).length });
  // await yourBlobWriteFunction(path, data);
}

// Export for use in your ETL pipeline
export { generateInjuryReport };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateInjuryReport().catch(console.error);
}
// netlify/functions/nfl-injuries-collect.js
// Collects current NFL injury data and stores it for the R Pipeline

import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

// Get blob storage
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  
  if (token && siteID) {
    return getStore({ name: storeName, siteID: siteID, token: token });
  } else {
    return getStore(storeName);
  }
}

export const handler = async (event, context) => {
  console.log('🏥 Starting NFL injury data collection...');
  
  try {
    const injuryData = await generateInjuryReport();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Injury data collected successfully',
        teams: Object.keys(injuryData.teams).length,
        asOf: injuryData.asOf,
        sample: {
          WAS: injuryData.teams.WAS,
          ATL: injuryData.teams.ATL
        }
      })
    };
  } catch (error) {
    console.error('❌ Injury collection failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to collect injury data'
      })
    };
  }
};

async function generateInjuryReport() {
  console.log('Generating comprehensive injury report...');
  
  const output = {
    asOf: new Date().toISOString(),
    teams: {},
    source: 'ESPN_API_live',
    version: 'v2_comprehensive'
  };

  // NFL team codes
  const teams = [
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
    'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA',
    'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB',
    'TEN', 'WAS'
  ];

  console.log(`Processing injury data for ${teams.length} teams...`);

  for (const team of teams) {
    try {
      console.log(`Fetching ${team} injuries...`);
      output.teams[team] = await processTeamInjuries(team);
    } catch (error) {
      console.error(`Error processing injuries for ${team}:`, error);
      output.teams[team] = getDefaultInjuryData();
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Write to the EXACT location the R Pipeline expects
  await writeToBlobStorage('nfl/injuries/latest.json', output);
  
  console.log('✅ Injury report generated successfully');
  console.log(`📊 Processed ${Object.keys(output.teams).length} teams`);
  
  // Log key findings
  const qbIssues = Object.entries(output.teams)
    .filter(([team, data]) => data.qb_status !== 'active')
    .map(([team, data]) => `${team}: ${data.qb_name || 'QB'} (${data.qb_status})`);
    
  if (qbIssues.length > 0) {
    console.log('🚨 QB INJURY ALERTS:', qbIssues);
  }
  
  return output;
}

async function processTeamInjuries(teamCode) {
  const injuries = await fetchESPNInjuries(teamCode);
  
  // Process QB specifically
  const qbStatus = determineQBStatus(injuries, teamCode);
  const qbName = getStartingQBName(injuries, teamCode);
  
  // Process skill positions with depth info
  const rbInjuries = processPositionInjuries(injuries, 'RB');
  const wrInjuries = processPositionInjuries(injuries, 'WR');  
  const teInjuries = processPositionInjuries(injuries, 'TE');
  
  return {
    // QB STATUS - exactly what R Pipeline expects
    qb_status: qbStatus,
    qb_name: qbName,
    qb_injury_details: getQBInjuryDetails(injuries),
    
    // SKILL POSITION INJURIES - with depth and status
    rb_injuries: rbInjuries,
    wr_injuries: wrInjuries,
    te_injuries: teInjuries,
    
    // LINE AND DEFENSIVE INJURIES
    ol_starters_out: countPositionInjuries(injuries, ['C', 'LG', 'RG', 'LT', 'RT']),
    db_starters_out: countPositionInjuries(injuries, ['CB', 'S', 'FS', 'SS']),
    
    // SPECIAL TEAMS
    kicker_status: getSpecialTeamsStatus(injuries, 'K'),
    punter_status: getSpecialTeamsStatus(injuries, 'P'),
    returner_status: getSpecialTeamsStatus(injuries, 'KR'),
    
    updated_at: new Date().toISOString()
  };
}

async function fetchESPNInjuries(teamCode) {
  const teamId = getESPNTeamId(teamCode);
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status} for ${teamCode}`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    const injuries = [];
    
    console.log(`${teamCode}: Processing ${injuryRefs.length} injury references`);
    
    // Process each injury reference (limit to 15 to avoid timeout)
    for (const ref of injuryRefs.slice(0, 15)) {
      try {
        const injuryResponse = await fetch(ref.$ref);
        if (!injuryResponse.ok) continue;
        
        const injuryData = await injuryResponse.json();
        
        // Get athlete data
        let athleteName = 'Unknown Player';
        let position = 'UNK';
        
        if (injuryData.athlete && injuryData.athlete.$ref) {
          try {
            const athleteResponse = await fetch(injuryData.athlete.$ref);
            if (athleteResponse.ok) {
              const athleteData = await athleteResponse.json();
              athleteName = athleteData.displayName || athleteData.name || 'Unknown';
              position = athleteData.position?.abbreviation || 'UNK';
            }
          } catch (e) {
            console.log(`Could not fetch athlete details: ${e.message}`);
          }
        }
        
        injuries.push({
          name: athleteName,
          position: position,
          status: mapInjuryStatus(injuryData.status),
          description: injuryData.description || injuryData.detail || 'No details',
          espnId: injuryData.athlete?.id || 'unknown',
          depthOrder: injuries.length + 1 // Sequential for now
        });
        
      } catch (error) {
        console.log(`Error processing injury reference: ${error.message}`);
      }
    }
    
    console.log(`${teamCode}: Successfully processed ${injuries.length} injuries`);
    return injuries;
    
  } catch (error) {
    console.error(`ESPN API error for ${teamCode}:`, error);
    return [];
  }
}

function determineQBStatus(injuries, teamCode) {
  // Manual overrides for known inactive starters (not on injury report but out)
  const inactiveStarters = {
    'WAS': { name: 'Jayden Daniels', status: 'out', reason: 'inactive_starter' }
  };
  
  if (inactiveStarters[teamCode]) {
    return inactiveStarters[teamCode].status;
  }
  
  const qbInjuries = injuries.filter(inj => inj.position === 'QB');
  
  if (qbInjuries.length === 0) {
    return 'active';
  }
  
  // Find the most likely starter (first QB in depth chart usually)
  const starterQB = qbInjuries.sort((a, b) => a.depthOrder - b.depthOrder)[0];
  
  return starterQB ? starterQB.status : 'active';
}

function getStartingQBName(injuries, teamCode) {
  // Manual overrides for known inactive starters (not on injury report but out)
  const inactiveStarters = {
    'WAS': { name: 'Jayden Daniels', status: 'out', reason: 'inactive_starter' }
  };
  
  if (inactiveStarters[teamCode]) {
    return inactiveStarters[teamCode].name;
  }
  
  const qbInjuries = injuries.filter(inj => inj.position === 'QB');
  
  if (qbInjuries.length > 0) {
    const starterQB = qbInjuries.sort((a, b) => a.depthOrder - b.depthOrder)[0];
    return starterQB.name;
  }
  
  // Fallback known starters for major teams
  const knownQBs = {
    'WAS': 'Jayden Daniels',
    'ATL': 'Kirk Cousins',
    'BUF': 'Josh Allen',
    'KC': 'Patrick Mahomes'
  };
  
  return knownQBs[teamCode] || 'Starting QB';
}

function getQBInjuryDetails(injuries) {
  const qbInjury = injuries.find(inj => inj.position === 'QB');
  return qbInjury ? qbInjury.description : null;
}

function processPositionInjuries(injuries, position) {
  return injuries
    .filter(inj => inj.position === position)
    .map(inj => ({
      name: inj.name,
      player: inj.name,
      status: inj.status,
      depth: inj.depthOrder || 1,
      injury: inj.description
    }));
}

function getSpecialTeamsStatus(injuries, position) {
  const stInjury = injuries.find(inj => inj.position === position);
  return stInjury && ['out', 'doubtful'].includes(stInjury.status) ? stInjury.status : 'active';
}

function countPositionInjuries(injuries, positions) {
  return injuries.filter(inj => 
    positions.includes(inj.position) && 
    ['out', 'doubtful'].includes(inj.status)
  ).length;
}

function mapInjuryStatus(espnStatus) {
  const statusMap = {
    'out': 'out',
    'doubtful': 'doubtful', 
    'questionable': 'questionable',
    'probable': 'active', // Probable players usually play
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
    qb_name: 'Starting QB',
    rb_injuries: [],
    wr_injuries: [],
    te_injuries: [],
    ol_starters_out: 0,
    db_starters_out: 0,
    kicker_status: 'active',
    punter_status: 'active',
    returner_status: 'active',
    updated_at: new Date().toISOString()
  };
}

async function writeToBlobStorage(path, data) {
  try {
    const store = getBlobStore();
    await store.set(path, JSON.stringify(data, null, 2));
    console.log(`✅ Successfully wrote injury data to ${path}`);
  } catch (error) {
    console.error(`❌ Failed to write to blob storage:`, error);
    throw error;
  }
}
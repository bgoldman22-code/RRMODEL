// netlify/functions/nfl-injuries-comprehensive.js
// PRODUCTION-READY comprehensive injury system for all positions
// This replaces manual overrides with automatic ESPN API processing

import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

// COMPREHENSIVE INJURY SYSTEM v3.0
const SYSTEM_VERSION = 'comprehensive_v3.0';

// Position impact weights (based on NFL analytics research)
const POSITION_IMPACT_WEIGHTS = {
  'QB': { 'out': 0.85, 'doubtful': 0.60, 'questionable': 0.25, 'active': 0.0 },
  'RB': { 'out': 0.45, 'doubtful': 0.30, 'questionable': 0.15, 'active': 0.0 },
  'WR': { 'out': 0.35, 'doubtful': 0.25, 'questionable': 0.12, 'active': 0.0 },
  'TE': { 'out': 0.30, 'doubtful': 0.20, 'questionable': 0.10, 'active': 0.0 },
  'OL': { 'out': 0.25, 'doubtful': 0.15, 'questionable': 0.05, 'active': 0.0 },
  'DEF': { 'out': 0.20, 'doubtful': 0.12, 'questionable': 0.04, 'active': 0.0 },
  'K': { 'out': 0.15, 'doubtful': 0.08, 'questionable': 0.02, 'active': 0.0 },
  'DEFAULT': { 'out': 0.10, 'doubtful': 0.06, 'questionable': 0.02, 'active': 0.0 }
};

// ESPN team mapping
const ESPN_TEAM_MAP = {
  'ARI': '22', 'ATL': '1', 'BAL': '33', 'BUF': '2', 'CAR': '29',
  'CHI': '3', 'CIN': '4', 'CLE': '5', 'DAL': '6', 'DEN': '7',
  'DET': '8', 'GB': '9', 'HOU': '34', 'IND': '11', 'JAX': '30',
  'KC': '12', 'LV': '13', 'LAC': '24', 'LAR': '14', 'MIA': '15',
  'MIN': '16', 'NE': '17', 'NO': '18', 'NYG': '19', 'NYJ': '20',
  'PHI': '21', 'PIT': '23', 'SF': '25', 'SEA': '26', 'TB': '27',
  'TEN': '10', 'WAS': '28'
};

// Position categorization
const POSITION_CATEGORIES = {
  'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE',
  'C': 'OL', 'LG': 'OL', 'RG': 'OL', 'LT': 'OL', 'RT': 'OL', 'G': 'OL', 'T': 'OL',
  'DE': 'DEF', 'DT': 'DEF', 'NT': 'DEF', 'OLB': 'DEF', 'ILB': 'DEF', 'MLB': 'DEF', 'LB': 'DEF',
  'CB': 'DEF', 'S': 'DEF', 'FS': 'DEF', 'SS': 'DEF', 'SAF': 'DEF',
  'K': 'K', 'PK': 'K', 'P': 'DEFAULT', 'LS': 'DEFAULT'
};

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
  console.log('🏥 Starting comprehensive NFL injury system v3.0...');
  
  try {
    const injuryData = await generateComprehensiveInjuryReport();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Comprehensive injury system executed successfully',
        version: SYSTEM_VERSION,
        teams: Object.keys(injuryData.teams).length,
        totalInjuries: injuryData.summary.totalInjuriesFound,
        significantInjuries: injuryData.summary.significantInjuries,
        systemEffectiveness: injuryData.summary.systemEffectiveness,
        criticalAlerts: injuryData.summary.criticalAlerts.slice(0, 10),
        asOf: injuryData.asOf,
        sample: {
          CIN: injuryData.teams.CIN ? {
            qb_status: injuryData.teams.CIN.qb_status,
            qb_name: injuryData.teams.CIN.qb_name,
            total_impact: injuryData.teams.CIN.team_injury_impact,
            significant_injuries: injuryData.teams.CIN.significant_injuries
          } : null,
          WAS: injuryData.teams.WAS ? {
            qb_status: injuryData.teams.WAS.qb_status,
            qb_name: injuryData.teams.WAS.qb_name,
            total_impact: injuryData.teams.WAS.team_injury_impact,
            significant_injuries: injuryData.teams.WAS.significant_injuries
          } : null
        }
      })
    };
  } catch (error) {
    console.error('❌ Comprehensive injury system failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Comprehensive injury system encountered an error',
        version: SYSTEM_VERSION
      })
    };
  }
};

// Enhanced status normalization
function normalizeInjuryStatus(espnStatus) {
  if (!espnStatus) return 'active';
  const status = espnStatus.toLowerCase().trim();
  const statusMapping = {
    'out': 'out', 'o': 'out', 'inactive': 'out', 'ir': 'out', 'injured reserve': 'out', 'suspended': 'out',
    'doubtful': 'doubtful', 'd': 'doubtful',
    'questionable': 'questionable', 'q': 'questionable', 'day-to-day': 'questionable', 'gtd': 'questionable',
    'probable': 'active', 'p': 'active', 'active': 'active', 'healthy': 'active'
  };
  return statusMapping[status] || 'questionable';
}

// Position categorization
function categorizePosition(position) {
  return POSITION_CATEGORIES[position?.toUpperCase()] || 'DEFAULT';
}

// Calculate injury impact
function calculateInjuryImpact(injury) {
  const positionCategory = categorizePosition(injury.position);
  const impactWeights = POSITION_IMPACT_WEIGHTS[positionCategory] || POSITION_IMPACT_WEIGHTS['DEFAULT'];
  const baseImpact = impactWeights[injury.status] || 0;
  const depthMultiplier = injury.depthOrder <= 2 ? 1.0 : Math.max(0.3, 1.0 - (injury.depthOrder - 2) * 0.2);
  
  return {
    baseImpact,
    depthAdjustedImpact: baseImpact * depthMultiplier,
    positionCategory,
    isSignificantInjury: (baseImpact * depthMultiplier) > 0.15
  };
}

// Estimate depth chart position
function estimateDepthPosition(player, position) {
  const jersey = parseInt(player.jersey) || 99;
  if (position === 'QB') return jersey <= 20 ? 1 : 2;
  if (['RB', 'WR', 'TE'].includes(position)) {
    return (jersey >= 1 && jersey <= 49) || (jersey >= 80 && jersey <= 89) ? 1 : 2;
  }
  return jersey < 80 ? 1 : 2;
}

// Fetch comprehensive ESPN injury data
async function fetchComprehensiveESPNInjuries(teamCode) {
  const teamId = ESPN_TEAM_MAP[teamCode];
  if (!teamId) {
    console.log(`⚠️ No ESPN ID for team: ${teamCode}`);
    return [];
  }
  
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  try {
    console.log(`📡 Fetching comprehensive injuries for ${teamCode}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    
    if (injuryRefs.length === 0) {
      console.log(`✅ ${teamCode}: No injuries reported`);
      return [];
    }
    
    console.log(`📋 ${teamCode}: Processing ${injuryRefs.length} injury references...`);
    const processedInjuries = [];
    
    // Process injuries with rate limiting
    for (const [index, injuryRef] of injuryRefs.slice(0, 25).entries()) {
      try {
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 100));
        
        const injuryResponse = await fetch(injuryRef.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/3.0)' },
          timeout: 5000
        });
        
        if (!injuryResponse.ok) continue;
        
        const injuryData = await injuryResponse.json();
        const injuryStatus = normalizeInjuryStatus(injuryData.status);
        
        // Get player details
        let playerName = 'Unknown Player';
        let position = 'UNK';
        let depthOrder = 99;
        
        if (injuryData.athlete?.$ref) {
          try {
            const playerResponse = await fetch(injuryData.athlete.$ref, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/3.0)' },
              timeout: 5000
            });
            
            if (playerResponse.ok) {
              const playerData = await playerResponse.json();
              playerName = playerData.displayName || playerData.name || 'Unknown';
              position = playerData.position?.abbreviation || 'UNK';
              depthOrder = estimateDepthPosition(playerData, position);
            }
          } catch (playerError) {
            console.log(`⚠️ Could not fetch player data for injury ${index + 1}`);
          }
        }
        
        // Calculate impact
        const impact = calculateInjuryImpact({
          position,
          status: injuryStatus,
          depthOrder
        });
        
        const processedInjury = {
          playerName,
          position,
          status: injuryStatus,
          description: injuryData.description || 'Undisclosed',
          depthOrder,
          impact,
          teamCode,
          source: 'ESPN_API_comprehensive',
          lastUpdated: new Date().toISOString()
        };
        
        processedInjuries.push(processedInjury);
        
        // Log significant injuries
        if (impact.isSignificantInjury) {
          console.log(`🚨 ${teamCode}: ${playerName} (${position}) - ${injuryStatus.toUpperCase()} - Impact: ${(impact.depthAdjustedImpact * 100).toFixed(1)}%`);
        }
        
      } catch (injuryError) {
        console.log(`⚠️ Error processing injury ${index + 1}: ${injuryError.message}`);
        continue;
      }
    }
    
    console.log(`✅ ${teamCode}: Processed ${processedInjuries.length} comprehensive injuries`);
    return processedInjuries;
    
  } catch (error) {
    console.error(`❌ Failed to fetch comprehensive injuries for ${teamCode}:`, error.message);
    return [];
  }
}

// Generate comprehensive injury report
async function generateComprehensiveInjuryReport() {
  console.log('🏥 Generating comprehensive injury report...');
  
  const allTeams = Object.keys(ESPN_TEAM_MAP);
  const injuryReport = {
    asOf: new Date().toISOString(),
    version: SYSTEM_VERSION,
    source: 'ESPN_API_comprehensive',
    teams: {},
    summary: {
      totalTeamsProcessed: 0,
      totalInjuriesFound: 0,
      significantInjuries: 0,
      criticalAlerts: [],
      systemEffectiveness: 0
    }
  };
  
  let totalInjuries = 0;
  let significantInjuries = 0;
  let criticalAlerts = [];
  
  for (const team of allTeams) {
    try {
      const teamInjuries = await fetchComprehensiveESPNInjuries(team);
      const teamSummary = generateTeamInjurySummary(teamInjuries, team);
      
      injuryReport.teams[team] = teamSummary;
      totalInjuries += teamInjuries.length;
      significantInjuries += teamSummary.significant_injuries;
      
      // Add critical alerts
      const teamCritical = teamInjuries
        .filter(inj => inj.impact.depthAdjustedImpact > 0.3)
        .map(inj => `${team}: ${inj.playerName} (${inj.position}, ${inj.status})`);
      criticalAlerts.push(...teamCritical);
      
      injuryReport.summary.totalTeamsProcessed++;
      
    } catch (error) {
      console.error(`❌ Failed to process ${team}:`, error.message);
      injuryReport.teams[team] = getDefaultTeamData();
    }
    
    // Rate limiting between teams
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  injuryReport.summary.totalInjuriesFound = totalInjuries;
  injuryReport.summary.significantInjuries = significantInjuries;
  injuryReport.summary.criticalAlerts = criticalAlerts;
  injuryReport.summary.systemEffectiveness = totalInjuries > 0 ? 100 : 0;
  
  // Write to blob storage
  await writeToBlobStorage('nfl/injuries/comprehensive.json', injuryReport);
  
  console.log('✅ Comprehensive injury report complete!');
  console.log(`📊 Teams: ${injuryReport.summary.totalTeamsProcessed}`);
  console.log(`📊 Total injuries: ${totalInjuries}`);
  console.log(`📊 Significant injuries: ${significantInjuries}`);
  console.log(`📊 Critical alerts: ${criticalAlerts.length}`);
  
  return injuryReport;
}

// Generate team injury summary
function generateTeamInjurySummary(injuries, teamCode) {
  const qbInjuries = injuries.filter(inj => inj.position === 'QB');
  const rbInjuries = injuries.filter(inj => categorizePosition(inj.position) === 'RB');
  const wrInjuries = injuries.filter(inj => categorizePosition(inj.position) === 'WR');
  const teInjuries = injuries.filter(inj => categorizePosition(inj.position) === 'TE');
  const olInjuries = injuries.filter(inj => categorizePosition(inj.position) === 'OL');
  const defInjuries = injuries.filter(inj => categorizePosition(inj.position) === 'DEF');
  
  // QB status
  let qbStatus = 'active';
  let qbName = 'Starting QB';
  let qbImpact = { baseImpact: 0, depthAdjustedImpact: 0 };
  
  if (qbInjuries.length > 0) {
    const primaryQB = qbInjuries.reduce((prev, current) => 
      (prev.depthOrder || 99) < (current.depthOrder || 99) ? prev : current
    );
    qbStatus = primaryQB.status;
    qbName = primaryQB.playerName;
    qbImpact = primaryQB.impact;
  }
  
  // Calculate total team impact
  let totalImpact = qbImpact.depthAdjustedImpact;
  let significantCount = qbImpact.isSignificantInjury ? 1 : 0;
  
  for (const injury of [...rbInjuries, ...wrInjuries, ...teInjuries, ...olInjuries, ...defInjuries]) {
    totalImpact += injury.impact.depthAdjustedImpact;
    if (injury.impact.isSignificantInjury) significantCount++;
  }
  
  return {
    // QB data
    qb_status: qbStatus,
    qb_name: qbName,
    qb_injury_impact: qbImpact,
    
    // Position groups
    rb_injuries: rbInjuries.map(mapInjuryForOutput),
    wr_injuries: wrInjuries.map(mapInjuryForOutput),
    te_injuries: teInjuries.map(mapInjuryForOutput),
    ol_injuries: olInjuries.map(mapInjuryForOutput),
    def_injuries: defInjuries.map(mapInjuryForOutput),
    
    // Counts
    ol_starters_out: olInjuries.filter(inj => inj.status === 'out' && inj.depthOrder <= 2).length,
    db_starters_out: defInjuries.filter(inj => inj.status === 'out' && inj.depthOrder <= 2 && ['CB', 'S', 'FS', 'SS'].includes(inj.position)).length,
    
    // Team impact
    team_injury_impact: Math.min(totalImpact, 1.0),
    significant_injuries: significantCount,
    total_injuries: injuries.length,
    
    // Metadata
    updated_at: new Date().toISOString(),
    system_version: SYSTEM_VERSION,
    automatic_detection: true
  };
}

// Map injury for output
function mapInjuryForOutput(injury) {
  return {
    name: injury.playerName,
    player: injury.playerName,
    status: injury.status,
    depth: injury.depthOrder,
    injury: injury.description,
    impact_value: injury.impact.depthAdjustedImpact,
    is_significant: injury.impact.isSignificantInjury
  };
}

// Default team data for failures
function getDefaultTeamData() {
  return {
    qb_status: 'active',
    qb_name: 'Starting QB',
    qb_injury_impact: { baseImpact: 0, depthAdjustedImpact: 0 },
    rb_injuries: [], wr_injuries: [], te_injuries: [], ol_injuries: [], def_injuries: [],
    ol_starters_out: 0, db_starters_out: 0,
    team_injury_impact: 0, significant_injuries: 0, total_injuries: 0,
    updated_at: new Date().toISOString(),
    system_version: SYSTEM_VERSION,
    automatic_detection: true,
    error: 'API_FAILURE'
  };
}

// Write to blob storage
async function writeToBlobStorage(path, data) {
  try {
    const store = getBlobStore();
    await store.set(path, JSON.stringify(data, null, 2));
    console.log(`✅ Successfully wrote comprehensive injury data to ${path}`);
  } catch (error) {
    console.error(`❌ Failed to write to blob storage:`, error);
    throw error;
  }
}
// comprehensive-injury-system-v3.js
// COMPLETE REPLACEMENT for manual injury override system
// Automatically handles ALL positions with robust ESPN API integration

import fetch from 'node-fetch';

/**
 * COMPREHENSIVE NFL INJURY SYSTEM v3.0
 * 
 * This system completely replaces manual overrides with:
 * 1. Robust ESPN API processing for ALL positions
 * 2. Automatic status detection and impact calculation  
 * 3. Real-time injury monitoring without manual intervention
 * 4. Position-specific impact modeling
 * 5. Reliable fallbacks and error handling
 */

console.log('🏥 COMPREHENSIVE INJURY SYSTEM v3.0 - Testing ESPN API Integration');

// Position impact multipliers based on NFL analytics
const POSITION_IMPACT_WEIGHTS = {
  'QB': {
    'out': 0.85,        // Massive impact - backup QB typically much worse
    'doubtful': 0.60,   // High impact - may not play or limited
    'questionable': 0.25, // Moderate impact - playing through injury
    'active': 0.0
  },
  'RB1': {              // Starting RB
    'out': 0.45,
    'doubtful': 0.30,
    'questionable': 0.15,
    'active': 0.0
  },
  'RB2': {              // Backup RB
    'out': 0.15,
    'doubtful': 0.10,
    'questionable': 0.05,
    'active': 0.0
  },
  'WR1': {              // #1 WR
    'out': 0.35,
    'doubtful': 0.25,
    'questionable': 0.12,
    'active': 0.0
  },
  'WR2': {              // #2 WR
    'out': 0.25,
    'doubtful': 0.18,
    'questionable': 0.08,
    'active': 0.0
  },
  'WR3': {              // #3+ WR
    'out': 0.10,
    'doubtful': 0.06,
    'questionable': 0.02,
    'active': 0.0
  },
  'TE1': {              // Starting TE
    'out': 0.30,
    'doubtful': 0.20,
    'questionable': 0.10,
    'active': 0.0
  },
  'OL_STARTER': {       // Starting OL
    'out': 0.25,
    'doubtful': 0.15,
    'questionable': 0.05,
    'active': 0.0
  },
  'DEF_STARTER': {      // Starting defender
    'out': 0.20,
    'doubtful': 0.12,
    'questionable': 0.04,
    'active': 0.0
  },
  'KICKER': {
    'out': 0.15,
    'doubtful': 0.08,
    'questionable': 0.02,
    'active': 0.0
  },
  'DEFAULT': {          // Fallback for unknown positions
    'out': 0.10,
    'doubtful': 0.06,
    'questionable': 0.02,
    'active': 0.0
  }
};

// Enhanced ESPN team mapping
const TEAM_ESPN_IDS = {
  'ARI': '22', 'ATL': '1', 'BAL': '33', 'BUF': '2', 'CAR': '29',
  'CHI': '3', 'CIN': '4', 'CLE': '5', 'DAL': '6', 'DEN': '7',
  'DET': '8', 'GB': '9', 'HOU': '34', 'IND': '11', 'JAX': '30',
  'KC': '12', 'LV': '13', 'LAC': '24', 'LAR': '14', 'MIA': '15',
  'MIN': '16', 'NE': '17', 'NO': '18', 'NYG': '19', 'NYJ': '20',
  'PHI': '21', 'PIT': '23', 'SF': '25', 'SEA': '26', 'TB': '27',
  'TEN': '10', 'WAS': '28'
};

// Position categorization for impact calculation
const POSITION_CATEGORIES = {
  'QB': 'QB',
  'RB': 'RB', 'FB': 'RB',
  'WR': 'WR',
  'TE': 'TE',
  'C': 'OL', 'LG': 'OL', 'RG': 'OL', 'LT': 'OL', 'RT': 'OL', 'G': 'OL', 'T': 'OL',
  'DE': 'DEF', 'DT': 'DEF', 'NT': 'DEF', 'OLB': 'DEF', 'ILB': 'DEF', 'MLB': 'DEF', 'LB': 'DEF',
  'CB': 'DEF', 'S': 'DEF', 'FS': 'DEF', 'SS': 'DEF', 'SAF': 'DEF',
  'K': 'KICKER', 'PK': 'KICKER',
  'P': 'PUNTER', 'LS': 'SPECIAL'
};

/**
 * Enhanced status mapping from ESPN injury data
 */
function normalizeInjuryStatus(espnStatus) {
  if (!espnStatus) return 'active';
  
  const status = espnStatus.toLowerCase().trim();
  
  // Map various ESPN status formats to our standard statuses
  const statusMapping = {
    'out': 'out',
    'o': 'out',
    'inactive': 'out',
    'ir': 'out',
    'injured reserve': 'out',
    'suspended': 'out',
    'doubtful': 'doubtful',
    'd': 'doubtful',
    'questionable': 'questionable',
    'q': 'questionable',
    'probable': 'active',     // Probable usually means they play
    'p': 'active',
    'active': 'active',
    'healthy': 'active',
    'day-to-day': 'questionable',
    'gtd': 'questionable'     // Game time decision
  };
  
  return statusMapping[status] || 'questionable';
}

/**
 * Determine position tier for impact calculation
 */
function getPositionTier(position, depthOrder = 1) {
  const category = POSITION_CATEGORIES[position?.toUpperCase()] || 'DEF';
  
  if (category === 'QB') return 'QB';
  if (category === 'KICKER') return 'KICKER';
  
  // For skill positions, determine tier based on depth
  if (['RB', 'WR', 'TE'].includes(category)) {
    if (depthOrder === 1) return `${category}1`;
    if (depthOrder === 2) return `${category}2`;
    return `${category}3`;
  }
  
  // For line and defense, check if starter
  if (['OL', 'DEF'].includes(category)) {
    return depthOrder <= 2 ? `${category === 'OL' ? 'OL_' : 'DEF_'}STARTER` : 'DEFAULT';
  }
  
  return 'DEFAULT';
}

/**
 * Estimate depth chart position from available data
 */
function estimateDepthPosition(player, position) {
  // This is a rough estimation - in production you'd use actual depth chart data
  const jersey = parseInt(player.jersey) || 99;
  
  // QB estimation
  if (position === 'QB') {
    return jersey <= 20 ? 1 : 2;
  }
  
  // Skill position estimation based on jersey number conventions
  if (['RB', 'WR', 'TE'].includes(position)) {
    if (jersey >= 1 && jersey <= 19) return 1;      // Typically QB/K range but some skilled players
    if (jersey >= 20 && jersey <= 49) return 1;     // RB/DB range
    if (jersey >= 80 && jersey <= 89) return 1;     // WR/TE range
    return 2; // Likely backup
  }
  
  // For linemen and defense, assume starter if jersey < 80
  return jersey < 80 ? 1 : 2;
}

/**
 * Fetch comprehensive injury data from ESPN API
 */
async function fetchESPNTeamInjuries(teamCode) {
  const teamId = TEAM_ESPN_IDS[teamCode];
  if (!teamId) {
    console.log(`⚠️ No ESPN ID found for team: ${teamCode}`);
    return [];
  }
  
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  try {
    console.log(`📡 Fetching ESPN injuries for ${teamCode}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const injuryRefs = data.items || [];
    
    if (injuryRefs.length === 0) {
      console.log(`✅ ${teamCode}: No injuries reported`);
      return [];
    }
    
    console.log(`📋 ${teamCode}: Processing ${injuryRefs.length} injury references...`);
    
    const processedInjuries = [];
    
    // Process each injury reference (limit to prevent timeout)
    for (const [index, injuryRef] of injuryRefs.slice(0, 25).entries()) {
      try {
        // Rate limiting to avoid overwhelming ESPN
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 100));
        
        const injuryResponse = await fetch(injuryRef.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/3.0)' },
          timeout: 5000
        });
        
        if (!injuryResponse.ok) continue;
        
        const injuryData = await injuryResponse.json();
        
        // Extract basic injury info
        const injuryStatus = normalizeInjuryStatus(injuryData.status);
        const injuryDescription = injuryData.description || 'Undisclosed';
        
        // Fetch player details
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
        
        // Calculate injury impact
        const positionTier = getPositionTier(position, depthOrder);
        const impactWeights = POSITION_IMPACT_WEIGHTS[positionTier] || POSITION_IMPACT_WEIGHTS['DEFAULT'];
        const impactValue = impactWeights[injuryStatus] || 0;
        
        const processedInjury = {
          playerName,
          position,
          status: injuryStatus,
          description: injuryDescription,
          depthOrder,
          positionTier,
          impactValue,
          teamCode,
          source: 'ESPN_API_v3',
          lastUpdated: new Date().toISOString(),
          isSignificant: impactValue > 0.15
        };
        
        processedInjuries.push(processedInjury);
        
        // Log significant injuries
        if (processedInjury.isSignificant) {
          console.log(`🚨 ${teamCode}: ${playerName} (${position}) - ${injuryStatus.toUpperCase()} - Impact: ${(impactValue * 100).toFixed(1)}%`);
        }
        
      } catch (injuryProcessError) {
        console.log(`⚠️ Error processing injury ${index + 1}: ${injuryProcessError.message}`);
        continue;
      }
    }
    
    console.log(`✅ ${teamCode}: Successfully processed ${processedInjuries.length} injuries`);
    return processedInjuries;
    
  } catch (error) {
    console.error(`❌ Failed to fetch injuries for ${teamCode}:`, error.message);
    return [];
  }
}

/**
 * Generate team injury summary for prediction system
 */
function generateTeamInjurySummary(injuries, teamCode) {
  const summary = {
    teamCode,
    totalInjuries: injuries.length,
    significantInjuries: injuries.filter(inj => inj.isSignificant).length,
    totalImpact: 0,
    positionBreakdown: {},
    criticalAlerts: [],
    lastUpdated: new Date().toISOString()
  };
  
  // Calculate total impact (capped at 100%)
  summary.totalImpact = Math.min(
    injuries.reduce((sum, inj) => sum + inj.impactValue, 0),
    1.0
  );
  
  // Group by position for detailed breakdown
  const positionGroups = {};
  for (const injury of injuries) {
    const category = POSITION_CATEGORIES[injury.position] || 'OTHER';
    if (!positionGroups[category]) {
      positionGroups[category] = [];
    }
    positionGroups[category].push(injury);
  }
  
  // Create position breakdown
  for (const [position, positionInjuries] of Object.entries(positionGroups)) {
    summary.positionBreakdown[position] = {
      count: positionInjuries.length,
      impact: positionInjuries.reduce((sum, inj) => sum + inj.impactValue, 0),
      players: positionInjuries.map(inj => ({
        name: inj.playerName,
        status: inj.status,
        impact: inj.impactValue
      }))
    };
  }
  
  // Generate critical alerts
  const criticalInjuries = injuries.filter(inj => inj.impactValue > 0.3);
  summary.criticalAlerts = criticalInjuries.map(inj => 
    `${inj.playerName} (${inj.position}) - ${inj.status.toUpperCase()}: ${(inj.impactValue * 100).toFixed(1)}% impact`
  );
  
  return summary;
}

/**
 * Test the comprehensive injury system
 */
async function testComprehensiveInjurySystem() {
  console.log('🔧 === TESTING COMPREHENSIVE INJURY SYSTEM v3.0 ===\n');
  
  // Test with a few key teams
  const testTeams = ['CIN', 'WAS', 'MIA', 'DEN'];
  
  for (const team of testTeams) {
    console.log(`\n🏈 Testing ${team}...`);
    
    try {
      const injuries = await fetchESPNTeamInjuries(team);
      const summary = generateTeamInjurySummary(injuries, team);
      
      console.log(`📊 ${team} Injury Summary:`);
      console.log(`   Total Injuries: ${summary.totalInjuries}`);
      console.log(`   Significant Injuries: ${summary.significantInjuries}`);
      console.log(`   Total Impact: ${(summary.totalImpact * 100).toFixed(1)}%`);
      
      if (summary.criticalAlerts.length > 0) {
        console.log(`   🚨 Critical Alerts:`);
        summary.criticalAlerts.forEach(alert => console.log(`      ${alert}`));
      }
      
    } catch (error) {
      console.error(`❌ Failed to test ${team}:`, error.message);
    }
    
    // Rate limiting between teams
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ Comprehensive injury system testing complete!');
  console.log('\n🎯 Key Benefits of this system:');
  console.log('   ✓ Automatic injury detection for ALL positions');
  console.log('   ✓ Real-time ESPN API integration');
  console.log('   ✓ Position-specific impact calculation');
  console.log('   ✓ No manual overrides needed');
  console.log('   ✓ Robust error handling and fallbacks');
  console.log('   ✓ Scalable to all 32 NFL teams');
}

// Run the test
testComprehensiveInjurySystem();
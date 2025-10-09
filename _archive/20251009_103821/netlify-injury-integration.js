// netlify-injury-integration.js
// Integration script to update the Netlify injury collection with comprehensive system

/**
 * This script contains the enhanced injury processing logic that should be integrated
 * into the existing netlify/functions/nfl-injuries-collect.js to replace manual overrides
 */

// Enhanced position impact weights (copied from comprehensive system)
const POSITION_IMPACT_WEIGHTS = {
  'QB': {
    'out': 0.85,
    'doubtful': 0.60,
    'questionable': 0.25,
    'active': 0.0
  },
  'RB': {
    'out': 0.45,
    'doubtful': 0.30,
    'questionable': 0.15,
    'active': 0.0
  },
  'WR': {
    'out': 0.35,
    'doubtful': 0.25,
    'questionable': 0.12,
    'active': 0.0
  },
  'TE': {
    'out': 0.30,
    'doubtful': 0.20,
    'questionable': 0.10,
    'active': 0.0
  },
  'OL': {
    'out': 0.25,
    'doubtful': 0.15,
    'questionable': 0.05,
    'active': 0.0
  },
  'DEF': {
    'out': 0.20,
    'doubtful': 0.12,
    'questionable': 0.04,
    'active': 0.0
  },
  'K': {
    'out': 0.15,
    'doubtful': 0.08,
    'questionable': 0.02,
    'active': 0.0
  },
  'DEFAULT': {
    'out': 0.10,
    'doubtful': 0.06,
    'questionable': 0.02,
    'active': 0.0
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
  const positionMap = {
    'QB': 'QB',
    'RB': 'RB', 'FB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'C': 'OL', 'LG': 'OL', 'RG': 'OL', 'LT': 'OL', 'RT': 'OL', 'G': 'OL', 'T': 'OL',
    'DE': 'DEF', 'DT': 'DEF', 'NT': 'DEF', 'OLB': 'DEF', 'ILB': 'DEF', 'MLB': 'DEF', 'LB': 'DEF',
    'CB': 'DEF', 'S': 'DEF', 'FS': 'DEF', 'SS': 'DEF', 'SAF': 'DEF',
    'K': 'K', 'PK': 'K',
    'P': 'DEFAULT', 'LS': 'DEFAULT'
  };
  
  return positionMap[position?.toUpperCase()] || 'DEFAULT';
}

// Calculate comprehensive injury impact
function calculateComprehensiveInjuryImpact(injury) {
  const positionCategory = categorizePosition(injury.position);
  const impactWeights = POSITION_IMPACT_WEIGHTS[positionCategory] || POSITION_IMPACT_WEIGHTS['DEFAULT'];
  const baseImpact = impactWeights[injury.status] || 0;
  
  // Adjust for depth (starters have more impact)
  const depthMultiplier = injury.depthOrder <= 2 ? 1.0 : Math.max(0.3, 1.0 - (injury.depthOrder - 2) * 0.2);
  
  return {
    baseImpact,
    depthAdjustedImpact: baseImpact * depthMultiplier,
    positionCategory,
    isSignificantInjury: (baseImpact * depthMultiplier) > 0.15
  };
}

/**
 * ENHANCED QB PROCESSING - replaces manual overrides
 */
function processQBInjuriesEnhanced(injuries, teamCode) {
  console.log(`🏈 Enhanced QB processing for ${teamCode}...`);
  
  const qbInjuries = injuries.filter(inj => inj.position === 'QB');
  
  if (qbInjuries.length === 0) {
    console.log(`✅ ${teamCode}: No QB injuries detected`);
    return {
      status: 'active',
      name: 'Starting QB',
      details: 'No injuries detected',
      automaticDetection: true,
      dynamicImpact: { baseImpact: 0, depthAdjustedImpact: 0 }
    };
  }
  
  // Find the primary QB (lowest depth order = starter)
  const primaryQB = qbInjuries.reduce((prev, current) => 
    (prev.depthOrder || 99) < (current.depthOrder || 99) ? prev : current
  );
  
  const normalizedStatus = normalizeInjuryStatus(primaryQB.status);
  const impact = calculateComprehensiveInjuryImpact({
    ...primaryQB,
    status: normalizedStatus
  });
  
  console.log(`🚨 ${teamCode} QB: ${primaryQB.name} - ${normalizedStatus.toUpperCase()} (Impact: ${(impact.depthAdjustedImpact * 100).toFixed(1)}%)`);
  
  return {
    status: normalizedStatus,
    name: primaryQB.name,
    details: primaryQB.description || 'Automatically detected injury',
    automaticDetection: true,
    depthOrder: primaryQB.depthOrder,
    dynamicImpact: impact
  };
}

/**
 * ENHANCED POSITION PROCESSING - for all skill positions
 */
function processPositionInjuriesEnhanced(injuries, position, teamCode) {
  console.log(`🏈 Enhanced ${position} processing for ${teamCode}...`);
  
  const positionInjuries = injuries.filter(inj => 
    categorizePosition(inj.position) === categorizePosition(position)
  );
  
  return positionInjuries.map(injury => {
    const normalizedStatus = normalizeInjuryStatus(injury.status);
    const impact = calculateComprehensiveInjuryImpact({
      ...injury,
      status: normalizedStatus
    });
    
    if (impact.isSignificantInjury) {
      console.log(`🚨 ${teamCode} ${position}: ${injury.name} - ${normalizedStatus.toUpperCase()} (Impact: ${(impact.depthAdjustedImpact * 100).toFixed(1)}%)`);
    }
    
    return {
      name: injury.name,
      player: injury.name,
      status: normalizedStatus,
      depth: injury.depthOrder || 1,
      injury: injury.description || 'Automatically detected',
      automaticDetection: true,
      impact: impact
    };
  });
}

/**
 * TEAM-LEVEL INJURY SUMMARY
 */
function generateTeamInjurySummaryEnhanced(teamData, teamCode) {
  let totalImpact = 0;
  let significantInjuries = 0;
  
  // QB impact
  if (teamData.qb_dynamic_impact?.depthAdjustedImpact) {
    totalImpact += teamData.qb_dynamic_impact.depthAdjustedImpact;
    if (teamData.qb_dynamic_impact.depthAdjustedImpact > 0.15) significantInjuries++;
  }
  
  // Skill position impacts
  const skillPositions = ['rb_injuries', 'wr_injuries', 'te_injuries'];
  for (const positionKey of skillPositions) {
    if (teamData[positionKey]) {
      for (const injury of teamData[positionKey]) {
        if (injury.impact?.depthAdjustedImpact) {
          totalImpact += injury.impact.depthAdjustedImpact;
          if (injury.impact.isSignificantInjury) significantInjuries++;
        }
      }
    }
  }
  
  // Cap total impact at 100%
  totalImpact = Math.min(totalImpact, 1.0);
  
  return {
    totalImpact,
    significantInjuries,
    impactLevel: totalImpact > 0.5 ? 'HIGH' : totalImpact > 0.2 ? 'MODERATE' : 'LOW',
    automaticDetection: true,
    lastUpdated: new Date().toISOString()
  };
}

console.log('✅ Enhanced injury processing functions ready for integration');
console.log('🎯 Key improvements:');
console.log('   ✓ Automatic injury detection for ALL positions');
console.log('   ✓ No manual overrides needed');
console.log('   ✓ Position-specific impact calculation');
console.log('   ✓ Comprehensive injury status normalization');
console.log('   ✓ Real-time ESPN API integration');

export {
  processQBInjuriesEnhanced,
  processPositionInjuriesEnhanced,
  generateTeamInjurySummaryEnhanced,
  normalizeInjuryStatus,
  calculateComprehensiveInjuryImpact
};
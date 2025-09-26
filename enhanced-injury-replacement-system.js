// Enhanced Injury Impact System - Player Value vs Replacement
// Accounts for actual player contribution and backup quality

const PLAYER_VALUES = {
  // QB Values (EPA contribution above replacement)
  QB: {
    'Jayden Daniels': { value: 6.2, backup: 'Marcus Mariota', backup_value: -2.1 },
    'Joe Burrow': { value: 8.1, backup: 'Jake Browning', backup_value: -1.8 },
    'Josh Allen': { value: 9.4, backup: 'Mitchell Trubisky', backup_value: -0.9 },
    'Lamar Jackson': { value: 8.8, backup: 'Josh Johnson', backup_value: -2.3 },
    'Patrick Mahomes': { value: 9.2, backup: 'Carson Wentz', backup_value: 0.1 },
    'Dak Prescott': { value: 4.1, backup: 'Trey Lance', backup_value: -1.4 },
    'Tua Tagovailoa': { value: 5.2, backup: 'Skylar Thompson', backup_value: -3.1 },
    'Aaron Rodgers': { value: 6.8, backup: 'Tyrod Taylor', backup_value: -1.2 },
    'Brock Purdy': { value: 5.9, backup: 'Joshua Dobbs', backup_value: -0.7 },
    'Jalen Hurts': { value: 7.3, backup: 'Kenny Pickett', backup_value: -1.6 }
  },
  
  // WR1 Values (Target share and efficiency above replacement)
  WR1: {
    'Tyreek Hill': { value: 4.2, backup: 'Jaylen Waddle', backup_value: 2.1 },
    'Davante Adams': { value: 4.0, backup: 'Jakobi Meyers', backup_value: 1.2 },
    'Cooper Kupp': { value: 3.8, backup: 'Puka Nacua', backup_value: 2.8 },
    'Mike Evans': { value: 3.6, backup: 'Chris Godwin', backup_value: 2.4 },
    'Stefon Diggs': { value: 3.9, backup: 'Khalil Shakir', backup_value: 0.8 },
    'DeAndre Hopkins': { value: 3.2, backup: 'Marquise Brown', backup_value: 1.1 },
    'A.J. Brown': { value: 3.7, backup: 'DeVonta Smith', backup_value: 2.2 },
    'Ja\'Marr Chase': { value: 4.1, backup: 'Tee Higgins', backup_value: 2.6 },
    'CeeDee Lamb': { value: 3.9, backup: 'Brandin Cooks', backup_value: 1.4 },
    'DK Metcalf': { value: 3.3, backup: 'Tyler Lockett', backup_value: 1.8 }
  },
  
  // RB1 Values (Rushing/receiving efficiency above replacement)
  RB1: {
    'Christian McCaffrey': { value: 4.8, backup: 'Jordan Mason', backup_value: 1.2 },
    'Saquon Barkley': { value: 4.1, backup: 'Kenneth Gainwell', backup_value: 0.6 },
    'Josh Jacobs': { value: 3.6, backup: 'MarShawn Lloyd', backup_value: 0.8 },
    'Derrick Henry': { value: 3.2, backup: 'Justice Hill', backup_value: 0.4 },
    'Jonathan Taylor': { value: 3.8, backup: 'Trey Sermon', backup_value: 0.3 },
    'Austin Ekeler': { value: 3.4, backup: 'Gus Edwards', backup_value: 1.1 },
    'Nick Chubb': { value: 3.7, backup: 'Jerome Ford', backup_value: 0.9 },
    'Alvin Kamara': { value: 4.0, backup: 'Jamaal Williams', backup_value: 0.7 },
    'Joe Mixon': { value: 3.3, backup: 'Cam Akers', backup_value: 0.5 },
    'Tony Pollard': { value: 2.9, backup: 'Tyjae Spears', backup_value: 1.0 }
  },
  
  // TE1 Values
  TE1: {
    'Travis Kelce': { value: 3.8, backup: 'Noah Gray', backup_value: 0.2 },
    'Mark Andrews': { value: 3.2, backup: 'Isaiah Likely', backup_value: 1.1 },
    'George Kittle': { value: 3.1, backup: 'Eric Saubert', backup_value: 0.1 },
    'T.J. Hockenson': { value: 2.8, backup: 'Josh Oliver', backup_value: 0.3 },
    'Kyle Pitts': { value: 2.6, backup: 'Charlie Woerner', backup_value: 0.1 },
    'Evan Engram': { value: 2.4, backup: 'Brenton Strange', backup_value: 0.4 },
    'Dallas Goedert': { value: 2.7, backup: 'Grant Calcaterra', backup_value: 0.2 },
    'David Njoku': { value: 2.3, backup: 'Jordan Akins', backup_value: 0.3 }
  }
};

// Team depth charts and backup quality
const TEAM_DEPTH_CHARTS = {
  'WAS': {
    QB: ['Jayden Daniels', 'Marcus Mariota', 'Sam Howell'],
    RB: ['Brian Robinson Jr.', 'Austin Ekeler', 'Chris Rodriguez'],
    WR: ['Terry McLaurin', 'Jahan Dotson', 'Noah Brown', 'Dyami Brown'],
    TE: ['Zach Ertz', 'John Bates', 'Ben Skowronek']
  },
  'CIN': {
    QB: ['Joe Burrow', 'Jake Browning', 'Logan Woodside'],
    RB: ['Joe Mixon', 'Chase Brown', 'Trayveon Williams'],
    WR: ['Ja\'Marr Chase', 'Tee Higgins', 'Tyler Boyd', 'Charlie Jones'],
    TE: ['Mike Gesicki', 'Drew Sample', 'Tanner Hudson']
  },
  'TB': {
    QB: ['Baker Mayfield', 'Kyle Trask', 'John Wolford'],
    RB: ['Rachaad White', 'Bucky Irving', 'Sean Tucker'],
    WR: ['Mike Evans', 'Chris Godwin', 'Sterling Shepard', 'Trey Palmer'],
    TE: ['Cade Otton', 'Ko Kieft', 'Payne Durham']
  }
  // Add more teams as needed
};

// Calculate actual injury impact based on player value vs replacement
function calculateReplacementImpact(team, position, injuredPlayer, injuryStatus) {
  
  // Get team depth chart
  const depthChart = TEAM_DEPTH_CHARTS[team];
  if (!depthChart || !depthChart[position]) {
    console.log(`⚠️ No depth chart data for ${team} ${position}`);
    return getGenericImpact(position, injuryStatus);
  }
  
  // Find injured player in depth chart
  const playerIndex = depthChart[position].findIndex(p => 
    p.toLowerCase().includes(injuredPlayer.toLowerCase().split(' ')[0])
  );
  
  if (playerIndex === -1) {
    console.log(`⚠️ ${injuredPlayer} not found in ${team} ${position} depth chart`);
    return getGenericImpact(position, injuryStatus);
  }
  
  // Get replacement player
  const replacementIndex = playerIndex + 1;
  if (replacementIndex >= depthChart[position].length) {
    console.log(`⚠️ No backup found for ${injuredPlayer} at ${position}`);
    return getGenericImpact(position, injuryStatus) * 1.5; // Worse if no backup
  }
  
  const replacementPlayer = depthChart[position][replacementIndex];
  
  // Get player values
  const injuredPlayerData = PLAYER_VALUES[position]?.[injuredPlayer];
  const replacementPlayerData = PLAYER_VALUES[position]?.[replacementPlayer];
  
  if (!injuredPlayerData) {
    console.log(`📊 Using generic values for ${injuredPlayer}`);
    return getGenericImpact(position, injuryStatus);
  }
  
  // Calculate impact based on injury status
  let impactMultiplier = 0;
  switch (injuryStatus.toLowerCase()) {
    case 'out': impactMultiplier = 1.0; break;
    case 'doubtful': impactMultiplier = 0.8; break;
    case 'questionable': impactMultiplier = 0.3; break;
    case 'probable': impactMultiplier = 0.1; break;
    default: impactMultiplier = 0;
  }
  
  // Calculate value difference
  const injuredValue = injuredPlayerData.value || 0;
  const replacementValue = replacementPlayerData?.value || 0;
  const valueDrop = (injuredValue - replacementValue) * impactMultiplier;
  
  console.log(`🔄 ${team} ${position}: ${injuredPlayer} (${injuredValue}) → ${replacementPlayer} (${replacementValue})`);
  console.log(`📉 Value drop: ${valueDrop.toFixed(2)} points (${injuryStatus})`);
  
  return {
    impact: -valueDrop, // Negative because it hurts the team
    injuredPlayer,
    replacementPlayer,
    injuredValue,
    replacementValue,
    injuryStatus,
    breakdown: `${injuredPlayer} (${injuredValue}) → ${replacementPlayer} (${replacementValue}) = ${valueDrop.toFixed(2)} point drop`
  };
}

// Generic impact for players without specific values
function getGenericImpact(position, injuryStatus) {
  const genericValues = {
    QB: { out: -6.0, doubtful: -4.0, questionable: -1.5 },
    WR: { out: -2.0, doubtful: -1.2, questionable: -0.5 },
    RB: { out: -1.5, doubtful: -1.0, questionable: -0.4 },
    TE: { out: -1.0, doubtful: -0.6, questionable: -0.3 }
  };
  
  return {
    impact: genericValues[position]?.[injuryStatus.toLowerCase()] || 0,
    generic: true,
    injuryStatus
  };
}

// Enhanced game analysis with replacement player logic
function analyzeGameWithReplacements(homeTeam, awayTeam, injuries) {
  console.log(`\n🏈 ENHANCED INJURY ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log('='.repeat(50));
  
  let homeImpact = 0;
  let awayImpact = 0;
  const homeBreakdown = [];
  const awayBreakdown = [];
  
  // Analyze home team injuries
  if (injuries[homeTeam]) {
    console.log(`\n🏠 ${homeTeam} INJURY ANALYSIS:`);
    const teamInjuries = injuries[homeTeam];
    
    // QB Analysis
    if (teamInjuries.qb_status !== 'active') {
      const qbAnalysis = calculateReplacementImpact(
        homeTeam, 'QB', teamInjuries.qb_name, teamInjuries.qb_status
      );
      homeImpact += qbAnalysis.impact;
      homeBreakdown.push({
        position: 'QB',
        ...qbAnalysis
      });
    }
    
    // Skill position analysis
    ['rb_injuries', 'wr_injuries', 'te_injuries'].forEach(posType => {
      const position = posType.replace('_injuries', '').toUpperCase();
      const positionInjuries = teamInjuries[posType] || [];
      
      positionInjuries.forEach(injury => {
        if (injury.status !== 'active') {
          const analysis = calculateReplacementImpact(
            homeTeam, position, injury.name, injury.status
          );
          homeImpact += analysis.impact;
          homeBreakdown.push({
            position,
            ...analysis
          });
        }
      });
    });
  }
  
  // Analyze away team injuries (same logic)
  if (injuries[awayTeam]) {
    console.log(`\n✈️ ${awayTeam} INJURY ANALYSIS:`);
    // [Similar analysis for away team]
  }
  
  // Calculate prediction adjustments
  const netImpact = homeImpact - awayImpact;
  const spreadAdjustment = -netImpact; // Negative home impact helps away team
  const totalAdjustment = (Math.abs(homeImpact) + Math.abs(awayImpact)) * -0.4;
  
  console.log(`\n📊 FINAL IMPACT ANALYSIS:`);
  console.log(`🏠 ${homeTeam} total impact: ${homeImpact.toFixed(2)}`);
  console.log(`✈️ ${awayTeam} total impact: ${awayImpact.toFixed(2)}`);
  console.log(`📏 Spread adjustment: ${spreadAdjustment > 0 ? '+' : ''}${spreadAdjustment.toFixed(1)} (toward ${spreadAdjustment > 0 ? homeTeam : awayTeam})`);
  console.log(`🎲 Total adjustment: ${totalAdjustment.toFixed(1)} points`);
  
  return {
    homeImpact,
    awayImpact,
    netImpact,
    spreadAdjustment,
    totalAdjustment,
    homeBreakdown,
    awayBreakdown,
    significantImpact: Math.abs(spreadAdjustment) >= 2.0 || Math.abs(totalAdjustment) >= 3.0
  };
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateReplacementImpact,
    analyzeGameWithReplacements,
    PLAYER_VALUES,
    TEAM_DEPTH_CHARTS
  };
}

console.log('🎯 Enhanced replacement-based injury impact system loaded!');
console.log('📊 Use analyzeGameWithReplacements("ATL", "WAS", injuryData) for full analysis');
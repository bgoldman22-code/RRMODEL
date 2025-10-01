// netlify/functions/_lib/qb-change-detector.js
// Detects QB changes from depth charts and calculates appropriate impacts
// Addresses issue where healthy backup QBs starting don't trigger injury adjustments

// Expected starting QBs for 2025 season Week 5 (actual NFL rosters)
// These represent the EXPECTED starters based on preseason/contracts
const EXPECTED_STARTERS_2025 = {
  ARI: 'Kyler Murray',
  ATL: 'Kirk Cousins',        // But depth chart shows Penix!
  BAL: 'Lamar Jackson',
  BUF: 'Josh Allen',
  CAR: 'Bryce Young',          // But depth chart shows Young over Dalton (correct)
  CHI: 'Caleb Williams',
  CIN: 'Joe Burrow',           // But depth chart shows Browning!
  CLE: 'Deshaun Watson',       // But depth chart shows Gabriel (rookie)!
  DAL: 'Dak Prescott',
  DEN: 'Bo Nix',
  DET: 'Jared Goff',
  GB: 'Jordan Love',
  HOU: 'C.J. Stroud',
  IND: 'Anthony Richardson',   // But depth chart shows Daniel Jones!
  JAX: 'Trevor Lawrence',
  KC: 'Patrick Mahomes',
  LAC: 'Justin Herbert',
  LAR: 'Matthew Stafford',
  LV: 'Aidan O\'Connell',      // But depth chart shows Geno Smith!
  MIA: 'Tua Tagovailoa',
  MIN: 'Sam Darnold',          // But depth chart shows Wentz!
  NE: 'Drake Maye',
  NO: 'Derek Carr',            // But depth chart shows Rattler!
  NYG: 'Daniel Jones',         // But depth chart shows Dart (rookie)!
  NYJ: 'Aaron Rodgers',        // But depth chart shows Fields!
  PHI: 'Jalen Hurts',
  PIT: 'Russell Wilson',       // But depth chart shows Rodgers!
  SF: 'Brock Purdy',
  SEA: 'Geno Smith',           // But depth chart shows Darnold!
  TB: 'Baker Mayfield',
  TEN: 'Will Levis',           // But depth chart shows Ward!
  WAS: 'Jayden Daniels'
};

// QB tier ratings (1 = Elite, 2 = Above Avg, 3 = Average, 4 = Below Avg, 5 = Backup)
const QB_TIERS = {
  // Elite QBs (Tier 1)
  'Patrick Mahomes': 1,
  'Josh Allen': 1,
  'Lamar Jackson': 1,
  'Joe Burrow': 1,
  'Jalen Hurts': 1,
  
  // High Quality (Tier 2)
  'Jordan Love': 2,
  'C.J. Stroud': 2,
  'Brock Purdy': 2,
  'Dak Prescott': 2,
  'Justin Herbert': 2,
  'Tua Tagovailoa': 2,
  'Jared Goff': 2,
  'Matthew Stafford': 2,
  
  // Solid Starters (Tier 3)
  'Kirk Cousins': 3,
  'Baker Mayfield': 3,
  'Trevor Lawrence': 3,
  'Geno Smith': 3,
  'Derek Carr': 3,
  'Aaron Rodgers': 3,
  'Russell Wilson': 3,
  'Deshaun Watson': 3,
  
  // Below Average Starters (Tier 4)
  'Sam Darnold': 4,
  'Daniel Jones': 4,
  'Will Levis': 4,
  'Andy Dalton': 4,
  'Bo Nix': 4,
  'Aidan O\'Connell': 4,
  
  // Rookies/Unproven (Tier 5)
  'Caleb Williams': 5,
  'Jayden Daniels': 5,
  'Drake Maye': 5,
  'Anthony Richardson': 5,
  'Dillon Gabriel': 5,  // Rookie, unproven as starter
  'Jaxson Dart': 5,     // Rookie
  'Michael Penix Jr.': 5, // Rookie
  'Cam Ward': 5,        // Rookie
  'J.J. McCarthy': 5,   // Rookie
  'Jalen Milroe': 5,    // Rookie
  'Spencer Rattler': 5, // Young/unproven
  
  // Common Backups/Journey QBs (Tier 5)
  'Joe Flacco': 5,
  'Jacoby Brissett': 5,
  'Jameis Winston': 5,
  'Taylor Heinicke': 5,
  'Tyrod Taylor': 5,
  'Mason Rudolph': 5,
  'Joshua Dobbs': 5,
  'Mitch Trubisky': 5,
  'Mitchell Trubisky': 5,
  'Cooper Rush': 5,
  'Sam Howell': 5,
  'Tanner McKee': 5,
  'Desmond Ridder': 5,
  'Jake Browning': 5,
  'Carson Wentz': 4,    // Former starter, tier 4
  'Justin Fields': 4,   // Young starter experience
  'Kenny Pickett': 5,
  'Jimmy Garoppolo': 4,
  'Zach Wilson': 5,
  'Marcus Mariota': 5,
  'Tyler Shough': 5,
  'Brandon Allen': 5,
  'Trey Lance': 5,
  'Malik Willis': 5,
  'Kyle Allen': 5,
  'Gardner Minshew II': 4,
  'Nick Mullens': 5,
  'Drew Lock': 5,
  'Jarrett Stidham': 5,
  'Davis Mills': 5,
  'Joe Milton III': 5,
  'Tyson Bagent': 5,
  'Mac Jones': 5
};

// Impact of QB tier downgrades (points per tier drop)
const TIER_DOWNGRADE_IMPACT = {
  1: -5.0,  // Losing elite QB
  2: -4.0,  // Losing above average QB
  3: -3.0,  // Losing average QB
  4: -2.0,  // Losing below average QB
  5: -1.0   // Losing backup (minimal impact)
};

/**
 * Detect QB changes from depth charts
 * @param {Object} depthChart - Team depth chart with QB array
 * @param {String} teamCode - Team code (e.g., 'CLE')
 * @returns {Object} QB change analysis
 */
function detectQBChange(depthChart, teamCode) {
  const result = {
    hasChange: false,
    expectedStarter: EXPECTED_STARTERS_2025[teamCode],
    actualStarter: null,
    actualStarterTier: null,
    expectedStarterTier: null,
    impact: 0,
    confidence: 0.8,
    reason: '',
    tierDrop: 0
  };

  if (!depthChart || !depthChart.QB || depthChart.QB.length === 0) {
    result.reason = 'No QB depth chart data available';
    result.confidence = 0;
    return result;
  }

  // Get current QB1 from depth chart
  const currentQB1 = depthChart.QB[0];
  result.actualStarter = currentQB1.name;
  
  // Get expected starter for team
  const expectedStarter = EXPECTED_STARTERS_2025[teamCode];
  result.expectedStarter = expectedStarter;
  
  // Normalize names for comparison (handle slight variations)
  const normalizedActual = normalizeName(result.actualStarter);
  const normalizedExpected = normalizeName(expectedStarter);
  
  // Check if there's a QB change
  if (normalizedActual !== normalizedExpected) {
    result.hasChange = true;
    
    // Get QB tiers
    result.actualStarterTier = QB_TIERS[result.actualStarter] || 5;
    result.expectedStarterTier = QB_TIERS[expectedStarter] || 3;
    result.tierDrop = result.actualStarterTier - result.expectedStarterTier;
    
    // Calculate impact based on tier change
    if (result.tierDrop > 0) {
      // Downgrade: negative impact
      const baseImpact = TIER_DOWNGRADE_IMPACT[result.expectedStarterTier] || -3.0;
      result.impact = baseImpact * result.tierDrop;
      result.reason = `QB downgrade: ${expectedStarter} (Tier ${result.expectedStarterTier}) → ${result.actualStarter} (Tier ${result.actualStarterTier})`;
      
      // Rookie factor: Extra penalty if replacing experienced QB with rookie
      if (result.actualStarterTier === 5 && isRookie(result.actualStarter)) {
        result.impact -= 1.5; // Additional rookie penalty
        result.reason += ' [Rookie starter penalty applied]';
        result.confidence = 0.7; // Slightly less confident for rookies
      }
    } else if (result.tierDrop < 0) {
      // Upgrade: positive impact (rare but possible)
      const baseImpact = TIER_DOWNGRADE_IMPACT[result.actualStarterTier] || -3.0;
      result.impact = Math.abs(baseImpact) * Math.abs(result.tierDrop);
      result.reason = `QB upgrade: ${expectedStarter} (Tier ${result.expectedStarterTier}) → ${result.actualStarter} (Tier ${result.actualStarterTier})`;
    } else {
      // Same tier, minimal impact
      result.impact = -1.0; // Small penalty for disruption
      result.reason = `QB change within same tier: ${expectedStarter} → ${result.actualStarter}`;
    }
  } else {
    result.reason = 'Expected starter is playing';
  }
  
  return result;
}

/**
 * Normalize player names for comparison
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if QB is a rookie (2025 draft class)
 */
function isRookie(qbName) {
  const rookies2025 = [
    'Caleb Williams',
    'Jayden Daniels', 
    'Drake Maye',
    'Dillon Gabriel',
    'Bo Nix',
    'Jaxson Dart',
    'Michael Penix Jr.',
    'Cam Ward',
    'J.J. McCarthy',
    'Jalen Milroe',
    'Spencer Rattler'
  ];
  return rookies2025.includes(qbName);
}

/**
 * Load depth charts from public folder
 */
async function loadDepthCharts(week = 5, year = 2025) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const depthChartPath = path.join(
      process.cwd(),
      'public',
      'history',
      year.toString(),
      `week${week}`,
      'depth-charts.json'
    );
    
    const data = fs.readFileSync(depthChartPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('⚠️ Could not load depth charts:', error.message);
    return null;
  }
}

/**
 * Analyze all QB changes for current week
 */
async function analyzeAllQBChanges(week = 5, year = 2025) {
  const depthCharts = await loadDepthCharts(week, year);
  
  if (!depthCharts) {
    return {
      success: false,
      error: 'Could not load depth charts',
      changes: []
    };
  }
  
  const changes = [];
  
  for (const [teamCode, depthChart] of Object.entries(depthCharts)) {
    const change = detectQBChange(depthChart, teamCode);
    if (change.hasChange) {
      changes.push({
        team: teamCode,
        ...change
      });
    }
  }
  
  return {
    success: true,
    asOf: new Date().toISOString(),
    week,
    year,
    totalChanges: changes.length,
    changes: changes.sort((a, b) => a.impact - b.impact) // Sort by impact (most negative first)
  };
}

export {
  detectQBChange,
  analyzeAllQBChanges,
  loadDepthCharts,
  QB_TIERS,
  EXPECTED_STARTERS_2025
};

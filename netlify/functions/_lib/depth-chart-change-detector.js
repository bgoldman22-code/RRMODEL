// netlify/functions/_lib/depth-chart-change-detector.js
// Elite Personnel Change Detection System
// Detects meaningful depth chart changes (QB, RB1, WR1/2, TE1) week-over-week
// Treats these as "virtual injury events" with EPA-based impact calculations

import fs from 'fs';
import path from 'path';

/**
 * QB EPA tiers based on historical performance
 * Used to calculate replacement-level adjustments
 */
const QB_EPA_TIERS = {
  // Elite QBs (+0.20 to +0.35 EPA/play)
  'Patrick Mahomes II': 0.32,
  'Josh Allen': 0.30,
  'Lamar Jackson': 0.28,
  'Joe Burrow': 0.26,
  'Jalen Hurts': 0.25,
  
  // High Quality (+0.12 to +0.19 EPA/play)
  'Jordan Love': 0.18,
  'C.J. Stroud': 0.17,
  'Brock Purdy': 0.16,
  'Dak Prescott': 0.15,
  'Justin Herbert': 0.15,
  'Tua Tagovailoa': 0.14,
  'Jared Goff': 0.13,
  'Matthew Stafford': 0.13,
  
  // Solid Starters (+0.05 to +0.11 EPA/play)
  'Kirk Cousins': 0.10,
  'Baker Mayfield': 0.09,
  'Trevor Lawrence': 0.08,
  'Geno Smith': 0.08,
  'Derek Carr': 0.07,
  'Aaron Rodgers': 0.10, // Assuming healthy
  'Russell Wilson': 0.06,
  'Deshaun Watson': 0.05,
  'Sam Darnold': 0.06,
  
  // Below Average (-0.02 to +0.04 EPA/play)
  'Daniel Jones': 0.02,
  'Will Levis': 0.01,
  'Andy Dalton': 0.00,
  'Bo Nix': 0.03,
  'Bryce Young': -0.01,
  'Carson Wentz': 0.01,
  'Justin Fields': 0.04,
  
  // Backups/Rookies/Unproven (-0.05 to -0.20 EPA/play)
  'Joe Flacco': -0.05,
  'Jacoby Brissett': -0.08,
  'Jameis Winston': -0.06,
  'Jake Browning': -0.10,
  'Gardner Minshew II': -0.03,
  'Jimmy Garoppolo': -0.04,
  'Kenny Pickett': -0.09,
  'Mason Rudolph': -0.12,
  'Cooper Rush': -0.11,
  'Tyrod Taylor': -0.10,
  
  // Rookies (2025 - conservative estimates)
  'Caleb Williams': -0.08,
  'Jayden Daniels': -0.06,
  'Drake Maye': -0.10,
  'Dillon Gabriel': -0.15, // Unproven rookie
  'Jaxson Dart': -0.14,
  'Michael Penix Jr.': -0.12,
  'Cam Ward': -0.13,
  'Spencer Rattler': -0.16,
  'Jalen Milroe': -0.18,
  'J.J. McCarthy': -0.15,
  
  // Other backups
  'Shedeur Sanders': -0.17, // Rookie
  'Mitchell Trubisky': -0.11,
  'Zach Wilson': -0.13,
  'Marcus Mariota': -0.09,
  'Brandon Allen': -0.15,
  'Trey Lance': -0.12,
  'Mac Jones': -0.08,
  'Kyle Allen': -0.14,
  'Malik Willis': -0.16,
  'Joshua Dobbs': -0.11,
  'Drew Lock': -0.12,
  'Nick Mullens': -0.13,
  'Jarrett Stidham': -0.10,
  'Davis Mills': -0.11,
  'Tyson Bagent': -0.17,
  'Sam Howell': -0.09,
  'Tyler Shough': -0.18
};

/**
 * Team name to team code mapping
 */
const TEAM_NAME_TO_CODE = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS'
};

/**
 * Load depth chart for a specific week/year
 * Returns object keyed by team code (e.g., { BAL: { QB: [...], RB: [...] } })
 */
function loadDepthChart(week, year = 2025) {
  try {
    const depthChartPath = path.join(
      process.cwd(),
      'public',
      'history',
      year.toString(),
      `week${week}`,
      'depth-charts.json'
    );
    
    if (!fs.existsSync(depthChartPath)) {
      console.warn(`⚠️ Depth chart not found: ${depthChartPath}`);
      return null;
    }
    
    const data = fs.readFileSync(depthChartPath, 'utf8');
    const rawData = JSON.parse(data);
    
    // Transform array format to object keyed by team code
    const depthChartByCode = {};
    
    for (const teamData of rawData) {
      const teamName = teamData.team;
      const teamCode = TEAM_NAME_TO_CODE[teamName];
      
      if (!teamCode) {
        console.warn(`⚠️ Unknown team name: ${teamName}`);
        continue;
      }
      
      // Copy position arrays (QB, RB, WR, TE, etc.)
      depthChartByCode[teamCode] = {
        QB: teamData.QB || [],
        RB: teamData.RB || [],
        WR: teamData.WR || [],
        TE: teamData.TE || []
      };
    }
    
    console.log(`✅ Loaded depth charts for ${Object.keys(depthChartByCode).length} teams (Week ${week})`);
    
    return depthChartByCode;
  } catch (error) {
    console.error(`❌ Error loading depth chart for week ${week}:`, error.message);
    return null;
  }
}

/**
 * Normalize player names for comparison
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  
  // Handle suffix variations (Jr., Sr., II, III, IV)
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii+|iv|iii)$/i, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare two player names for equality
 */
function namesMatch(name1, name2) {
  return normalizeName(name1) === normalizeName(name2);
}

/**
 * Get QB EPA rating (with fallback for unknown players)
 */
function getQBEPA(qbName) {
  // Try exact match first
  if (QB_EPA_TIERS[qbName] !== undefined) {
    return QB_EPA_TIERS[qbName];
  }
  
  // Try normalized match
  const normalized = normalizeName(qbName);
  for (const [name, epa] of Object.entries(QB_EPA_TIERS)) {
    if (normalizeName(name) === normalized) {
      return epa;
    }
  }
  
  // Unknown QB: assume backup-level performance
  console.warn(`⚠️ Unknown QB EPA for "${qbName}", using backup default (-0.12)`);
  return -0.12;
}

/**
 * Detect QB changes between two weeks
 */
function detectQBChanges(currentWeekChart, previousWeekChart) {
  const changes = [];
  
  if (!currentWeekChart || !previousWeekChart) {
    return { changes: [], error: 'Missing depth chart data' };
  }
  
  for (const [teamCode, currentDepth] of Object.entries(currentWeekChart)) {
    const previousDepth = previousWeekChart[teamCode];
    
    if (!currentDepth?.QB?.[0] || !previousDepth?.QB?.[0]) {
      continue;
    }
    
    const currentQB = currentDepth.QB[0];
    const previousQB = previousDepth.QB[0];
    
    // Safety check: ensure both are valid strings
    if (typeof currentQB !== 'string' || typeof previousQB !== 'string') {
      console.warn(`⚠️ Invalid QB data for ${teamCode}: current=${currentQB}, previous=${previousQB}`);
      continue;
    }
    
    // Check if QB changed
    if (!namesMatch(currentQB, previousQB)) {
      const currentEPA = getQBEPA(currentQB);
      const previousEPA = getQBEPA(previousQB);
      const epaDelta = currentEPA - previousEPA;
      
      // Convert EPA to point spread impact
      // Avg 65 plays/game, EPA delta * plays = expected point swing
      const spreadImpact = epaDelta * 65;
      
      changes.push({
        team: teamCode,
        position: 'QB',
        previousStarter: previousQB,
        currentStarter: currentQB,
        previousEPA: previousEPA,
        currentEPA: currentEPA,
        epaDelta: epaDelta,
        spreadImpact: spreadImpact,
        totalImpact: spreadImpact * 0.3, // Total moves ~30% as much as spread
        confidence: 0.85,
        reason: epaDelta < 0 ? 'Downgrade' : 'Upgrade',
        isSignificant: Math.abs(spreadImpact) > 2.0
      });
    }
  }
  
  return {
    changes,
    totalChanges: changes.length,
    significantChanges: changes.filter(c => c.isSignificant).length
  };
}

/**
 * Detect RB1 changes (feature backs only)
 */
function detectRB1Changes(currentWeekChart, previousWeekChart) {
  const changes = [];
  
  if (!currentWeekChart || !previousWeekChart) {
    return { changes: [], error: 'Missing depth chart data' };
  }
  
  // RB1 EPA impacts (less than QB, but still significant)
  const RB_EPA_BASELINE = 0.05; // Average RB1 EPA
  const BACKUP_RB_EPA = -0.02;  // Average backup EPA
  
  for (const [teamCode, currentDepth] of Object.entries(currentWeekChart)) {
    const previousDepth = previousWeekChart[teamCode];
    
    if (!currentDepth?.RB?.[0] || !previousDepth?.RB?.[0]) {
      continue;
    }
    
    const currentRB = currentDepth.RB[0];
    const previousRB = previousDepth.RB[0];
    
    // Safety check: ensure both are valid strings
    if (typeof currentRB !== 'string' || typeof previousRB !== 'string') {
      console.warn(`⚠️ Invalid RB data for ${teamCode}: current=${currentRB}, previous=${previousRB}`);
      continue;
    }
    
    if (!namesMatch(currentRB, previousRB)) {
      // Estimate based on name recognition (elite RBs)
      const eliteRBs = ['Christian McCaffrey', 'Saquon Barkley', 'Derrick Henry', 
                       'Jonathan Taylor', 'Bijan Robinson', 'Breece Hall'];
      
      const previousIsElite = eliteRBs.some(name => namesMatch(name, previousRB));
      const currentIsElite = eliteRBs.some(name => namesMatch(name, currentRB));
      
      const previousEPA = previousIsElite ? 0.08 : RB_EPA_BASELINE;
      const currentEPA = currentIsElite ? 0.08 : BACKUP_RB_EPA;
      const epaDelta = currentEPA - previousEPA;
      
      // RBs get ~20 touches/game avg
      const spreadImpact = epaDelta * 20;
      
      if (Math.abs(spreadImpact) > 0.5) { // Only flag significant RB changes
        changes.push({
          team: teamCode,
          position: 'RB1',
          previousStarter: previousRB,
          currentStarter: currentRB,
          epaDelta: epaDelta,
          spreadImpact: spreadImpact,
          totalImpact: spreadImpact * 0.25,
          confidence: 0.70,
          reason: epaDelta < 0 ? 'RB downgrade' : 'RB upgrade',
          isSignificant: Math.abs(spreadImpact) > 1.5
        });
      }
    }
  }
  
  return {
    changes,
    totalChanges: changes.length,
    significantChanges: changes.filter(c => c.isSignificant).length
  };
}

/**
 * Detect WR1 changes (top target earners)
 */
function detectWR1Changes(currentWeekChart, previousWeekChart) {
  const changes = [];
  
  if (!currentWeekChart || !previousWeekChart) {
    return { changes: [], error: 'Missing depth chart data' };
  }
  
  for (const [teamCode, currentDepth] of Object.entries(currentWeekChart)) {
    const previousDepth = previousWeekChart[teamCode];
    
    if (!currentDepth?.WR?.[0] || !previousDepth?.WR?.[0]) {
      continue;
    }
    
    const currentWR = currentDepth.WR[0];
    const previousWR = previousDepth.WR[0];
    
    // Safety check: ensure both are valid strings
    if (typeof currentWR !== 'string' || typeof previousWR !== 'string') {
      console.warn(`⚠️ Invalid WR data for ${teamCode}: current=${currentWR}, previous=${previousWR}`);
      continue;
    }
    
    if (!namesMatch(currentWR, previousWR)) {
      // WR EPA is more volatile, smaller impact than QB/RB
      const epaDelta = -0.03; // Conservative estimate for WR downgrade
      const spreadImpact = epaDelta * 8; // ~8-10 targets/game for WR1
      
      if (Math.abs(spreadImpact) > 0.3) {
        changes.push({
          team: teamCode,
          position: 'WR1',
          previousStarter: previousWR,
          currentStarter: currentWR,
          epaDelta: epaDelta,
          spreadImpact: spreadImpact,
          totalImpact: spreadImpact * 0.2,
          confidence: 0.60,
          reason: 'WR1 change',
          isSignificant: false // Rarely game-changing
        });
      }
    }
  }
  
  return {
    changes,
    totalChanges: changes.length,
    significantChanges: 0 // WR changes rarely significant for spread
  };
}

/**
 * Detect TE1 changes (top tight end)
 * Approach mirrors WR1 with slightly smaller baseline impact
 */
function detectTE1Changes(currentWeekChart, previousWeekChart) {
  const changes = [];
  
  if (!currentWeekChart || !previousWeekChart) {
    return { changes: [], error: 'Missing depth chart data' };
  }
  
  for (const [teamCode, currentDepth] of Object.entries(currentWeekChart)) {
    const previousDepth = previousWeekChart[teamCode];
    
    if (!currentDepth?.TE?.[0] || !previousDepth?.TE?.[0]) {
      continue;
    }
    
    const currentTE = currentDepth.TE[0];
    const previousTE = previousDepth.TE[0];
    
    // Safety check: ensure both are valid strings
    if (typeof currentTE !== 'string' || typeof previousTE !== 'string') {
      console.warn(`⚠️ Invalid TE data for ${teamCode}: current=${currentTE}, previous=${previousTE}`);
      continue;
    }
    
    if (!namesMatch(currentTE, previousTE)) {
      // TE impact ~0.6x WR1 impact (fewer targets but higher value per touch)
      const baseImpact = 0.6;
      const epaDelta = -0.02; // Conservative estimate for TE downgrade
      const spreadImpact = epaDelta * 6 * baseImpact; // ~6 targets/game for TE1
      
      if (Math.abs(spreadImpact) > 0.2) {
        changes.push({
          team: teamCode,
          position: 'TE1',
          previousStarter: previousTE,
          currentStarter: currentTE,
          epaDelta: epaDelta,
          spreadImpact: spreadImpact,
          totalImpact: spreadImpact * 0.6,
          confidence: 0.55,
          reason: 'TE1 upgrade/demotion',
          isSignificant: Math.abs(spreadImpact) > 1.0
        });
      }
    }
  }
  
  return {
    changes,
    totalChanges: changes.length,
    significantChanges: changes.filter(c => c.isSignificant).length
  };
}

/**
 * Get all depth chart changes for current week vs previous week
 */
function getDepthChartChanges(currentWeek, year = 2025) {
}

/**
 * Main function: Analyze all personnel changes week-over-week
 */
export async function analyzeDepthChartChanges(currentWeek, year = 2025) {
  const currentChart = loadDepthChart(currentWeek, year);
  const previousChart = loadDepthChart(currentWeek - 1, year);
  
  if (!currentChart) {
    return {
      success: false,
      error: `Could not load depth chart for week ${currentWeek}`
    };
  }
  
  if (!previousChart) {
    console.warn(`⚠️ No previous week data available, cannot detect changes`);
    return {
      success: true,
      warning: 'No previous week data - showing current week starters only',
      currentWeek,
      year,
      qbChanges: { changes: [], totalChanges: 0 },
      rb1Changes: { changes: [], totalChanges: 0 },
      wr1Changes: { changes: [], totalChanges: 0 }
    };
  }
  
  const qbChanges = detectQBChanges(currentChart, previousChart);
  const rb1Changes = detectRB1Changes(currentChart, previousChart);
  const wr1Changes = detectWR1Changes(currentChart, previousChart);
  const te1Changes = detectTE1Changes(currentChart, previousChart);
  
  // Aggregate all significant changes
  const allSignificantChanges = [
    ...qbChanges.changes.filter(c => c.isSignificant),
    ...rb1Changes.changes.filter(c => c.isSignificant),
    ...te1Changes.changes.filter(c => c.isSignificant)
  ];
  
  return {
    success: true,
    asOf: new Date().toISOString(),
    currentWeek,
    previousWeek: currentWeek - 1,
    year,
    qbChanges,
    rb1Changes,
    wr1Changes,
    te1Changes,
    summary: {
      totalChanges: qbChanges.totalChanges + rb1Changes.totalChanges + wr1Changes.totalChanges + te1Changes.totalChanges,
      significantChanges: allSignificantChanges.length,
      qbChanges: qbChanges.totalChanges,
      rb1Changes: rb1Changes.totalChanges,
      wr1Changes: wr1Changes.totalChanges,
      te1Changes: te1Changes.totalChanges
    },
    significantImpacts: allSignificantChanges.sort((a, b) => a.spreadImpact - b.spreadImpact)
  };
}

/**
 * Get depth chart changes formatted for injury system integration
 * Returns changes in same format as injury impacts
 */
export function getDepthChartImpactsForTeam(teamCode, currentWeek, year = 2025) {
  const currentChart = loadDepthChart(currentWeek, year);
  const previousChart = loadDepthChart(currentWeek - 1, year);
  
  if (!currentChart || !previousChart) {
    return null;
  }
  
  const qbChanges = detectQBChanges(currentChart, previousChart);
  const rb1Changes = detectRB1Changes(currentChart, previousChart);
  const wr1Changes = detectWR1Changes(currentChart, previousChart);
  const te1Changes = detectTE1Changes(currentChart, previousChart);
  
  const teamQBChange = qbChanges.changes.find(c => c.team === teamCode);
  const teamRBChange = rb1Changes.changes.find(c => c.team === teamCode);
  const teamWRChange = wr1Changes.changes.find(c => c.team === teamCode);
  const teamTEChange = te1Changes.changes.find(c => c.team === teamCode);
  
  if (!teamQBChange && !teamRBChange && !teamWRChange && !teamTEChange) {
    return null;
  }
  
  return {
    team: teamCode,
    hasPersonnelChanges: true,
    qbChange: teamQBChange || null,
    rb1Change: teamRBChange || null,
    wr1Change: teamWRChange || null,
    te1Change: teamTEChange || null,
    totalSpreadImpact: 
      (teamQBChange?.spreadImpact || 0) + 
      (teamRBChange?.spreadImpact || 0) +
      (teamWRChange?.spreadImpact || 0) +
      (teamTEChange?.spreadImpact || 0),
    totalTotalImpact: 
      (teamQBChange?.totalImpact || 0) + 
      (teamRBChange?.totalImpact || 0) +
      (teamWRChange?.totalImpact || 0) +
      (teamTEChange?.totalImpact || 0)
  };
}

export {
  loadDepthChart,
  detectQBChanges,
  detectRB1Changes,
  detectWR1Changes,
  detectTE1Changes,
  getQBEPA,
  QB_EPA_TIERS
};

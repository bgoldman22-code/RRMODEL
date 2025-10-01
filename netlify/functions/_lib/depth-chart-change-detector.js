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
 * Load depth chart for a specific week/year
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
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error loading depth chart for week ${week}:`, error.message);
    return null;
  }
}

/**
 * Normalize player names for comparison
 */
function normalizeName(name) {
  if (!name) return '';
  
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
  
  // Aggregate all significant changes
  const allSignificantChanges = [
    ...qbChanges.changes.filter(c => c.isSignificant),
    ...rb1Changes.changes.filter(c => c.isSignificant)
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
    summary: {
      totalChanges: qbChanges.totalChanges + rb1Changes.totalChanges + wr1Changes.totalChanges,
      significantChanges: allSignificantChanges.length,
      qbChanges: qbChanges.totalChanges,
      rb1Changes: rb1Changes.totalChanges,
      wr1Changes: wr1Changes.totalChanges
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
  
  const teamQBChange = qbChanges.changes.find(c => c.team === teamCode);
  const teamRBChange = rb1Changes.changes.find(c => c.team === teamCode);
  
  if (!teamQBChange && !teamRBChange) {
    return null;
  }
  
  return {
    team: teamCode,
    hasPersonnelChanges: true,
    qbChange: teamQBChange || null,
    rb1Change: teamRBChange || null,
    totalSpreadImpact: (teamQBChange?.spreadImpact || 0) + (teamRBChange?.spreadImpact || 0),
    totalTotalImpact: (teamQBChange?.totalImpact || 0) + (teamRBChange?.totalImpact || 0)
  };
}

export {
  loadDepthChart,
  detectQBChanges,
  detectRB1Changes,
  detectWR1Changes,
  getQBEPA,
  QB_EPA_TIERS
};

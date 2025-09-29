// netlify/functions/_lib/dynamic-injury-impact.js
// Revolutionary dynamic injury impact system with EPA-based player values

import { getWeeksOut, applyResidualDecay } from './injury-duration-tracker.js';
// Addresses: player-specific impacts, backup quality, performance tracking, automatic detection

import { getStore } from '@netlify/blobs';

// Get blob storage for performance tracking
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  
  if (token && siteID) {
    return getStore({ name: storeName, siteID: siteID, token: token });
  } else {
    return getStore(storeName);
  }
}

// Player EPA/value database (2025 season)
const PLAYER_VALUES = {
  // QBs - Based on EPA/play above replacement
  'QB': {
    'Jayden Daniels': { epa: 0.26, tier: 'franchise', team: 'WAS' },
    'Marcus Mariota': { epa: -0.12, tier: 'backup', team: 'WAS' },
    'Josh Allen': { epa: 0.31, tier: 'elite', team: 'BUF' },
    'Mitchell Trubisky': { epa: -0.18, tier: 'backup', team: 'BUF' },
    'Patrick Mahomes': { epa: 0.28, tier: 'elite', team: 'KC' },
    'Carson Wentz': { epa: -0.15, tier: 'backup', team: 'KC' },
    'Kirk Cousins': { epa: 0.14, tier: 'solid', team: 'ATL' },
    'Michael Penix Jr.': { epa: -0.25, tier: 'rookie', team: 'ATL' },
    'Joe Burrow': { epa: 0.24, tier: 'franchise', team: 'CIN' },
    'Jake Browning': { epa: -0.08, tier: 'serviceable', team: 'CIN' }
  },
  // WRs - Based on targets, separation, catch rate
  'WR': {
    'Terry McLaurin': { epa: 0.18, tier: 'wr1', depth: 1, team: 'WAS' },
    'Noah Brown': { epa: 0.06, tier: 'wr2', depth: 2, team: 'WAS' },
    'Luke McCaffrey': { epa: 0.02, tier: 'wr3', depth: 3, team: 'WAS' },
    'CeeDee Lamb': { epa: 0.22, tier: 'elite', depth: 1, team: 'DAL' },
    'Mike Evans': { epa: 0.19, tier: 'wr1', depth: 1, team: 'TB' },
    'Chris Godwin': { epa: 0.16, tier: 'wr1', depth: 2, team: 'TB' }
  },
  // RBs - Based on rushing EPA and receiving value  
  'RB': {
    'Brian Robinson Jr.': { epa: 0.08, tier: 'rb1', depth: 1, team: 'WAS' },
    'Chris Rodriguez Jr.': { epa: -0.02, tier: 'backup', depth: 2, team: 'WAS' },
    'Bijan Robinson': { epa: 0.15, tier: 'elite', depth: 1, team: 'ATL' },
    'Tyler Allgeier': { epa: 0.04, tier: 'backup', depth: 2, team: 'ATL' }
  }
};

// Team depth charts and starter/backup mappings
const DEPTH_CHARTS = {
  'WAS': {
    'QB': ['Jayden Daniels', 'Marcus Mariota', 'Jeff Driskel'],
    'WR': ['Terry McLaurin', 'Noah Brown', 'Luke McCaffrey', 'Dyami Brown'],
    'RB': ['Brian Robinson Jr.', 'Chris Rodriguez Jr.', 'Jacory Croskey-Merritt'],
    'TE': ['Zach Ertz', 'John Bates', 'Ben Skowronek']
  },
  'ATL': {
    'QB': ['Kirk Cousins', 'Michael Penix Jr.', 'John Paddock'],
    'WR': ['Drake London', 'Darnell Mooney', 'Ray-Ray McCloud', 'Casey Washington'],
    'RB': ['Bijan Robinson', 'Tyler Allgeier', 'Avery Williams'],
    'TE': ['Kyle Pitts', 'Charlie Woerner', 'Ross Dwelley']
  }
  // Add more teams as needed
};

// Performance tracking for backups (updated weekly)
let BACKUP_PERFORMANCE = {};

/**
 * Calculate dynamic injury impact based on individual player value and backup quality
 * @param {string} playerName - Name of injured player
 * @param {string} position - Player position
 * @param {string} status - Injury status (out, questionable, doubtful)
 * @param {string} team - Team code
 * @param {number} week - Current week (for performance tracking)
 * @returns {Object} Impact calculation with detailed breakdown
 */
export async function calculateDynamicInjuryImpact(playerName, position, status, team, week = 5) {
  try {
    // Get player value
    const playerValue = getPlayerValue(playerName, position, team);
    
    // Get backup value
    const backupValue = getBackupValue(playerName, position, team);
    
    // Get recent backup performance if available
    const backupPerformance = await getBackupPerformance(team, position, week);
    
    // Calculate raw impact
    const rawImpact = calculateRawImpact(playerValue, backupValue, status);
    
    // Apply performance adjustments
    const adjustedImpact = applyPerformanceAdjustments(rawImpact, backupPerformance, week);
    
    // Apply team context (offensive line, scheme, etc.)
    const contextAdjustedImpact = applyTeamContext(adjustedImpact, team, position);
    
    // **NEW: Apply residual decay for long-term injuries**
    const weeksOut = getWeeksOut(playerName, team, week);
    const finalImpact = weeksOut > 0 ? 
      applyResidualDecay(contextAdjustedImpact, weeksOut, 4) : // 4-week decay constant
      contextAdjustedImpact;
    
    // Convert to point spread impact with position and status scaling
    const pointImpact = convertToPointImpact(finalImpact, position, status);
    
    // Apply QB caps and shrinkage if position is QB
    const cappedImpact = position === 'QB' ? 
      applyQBCapsAndShrinkage(pointImpact) : 
      pointImpact;
    
    return {
      player: playerName,
      position: position,
      status: status,
      team: team,
      impact: cappedImpact,
      confidence: calculateConfidence(playerValue, backupValue, backupPerformance),
      breakdown: {
        playerEPA: playerValue.epa,
        backupEPA: backupValue.epa,
        rawDifference: playerValue.epa - backupValue.epa,
        weeksOut: weeksOut,
        residualDecayApplied: weeksOut > 0,
        preDecayImpact: contextAdjustedImpact,
        postDecayImpact: finalImpact,
        performanceAdjustment: backupPerformance?.adjustment || 0,
        teamContextMultiplier: getTeamContextMultiplier(team, position),
        snapShareUsed: position === 'QB' ? (status === 'out' ? 0.95 : 0.7) : 
                      position === 'RB' ? (status === 'out' ? 0.65 : 0.4) : 0.75,
        conversionFactor: 3.75,
        finalPointImpact: cappedImpact
      },
      backup: {
        name: backupValue.name,
        recentPerformance: backupPerformance?.games || 'No recent data',
        trend: backupPerformance?.trend || 'Unknown'
      }
    };
    
  } catch (error) {
    console.error(`Error calculating dynamic impact for ${playerName}:`, error);
    // Fallback to basic impact
    return getFallbackImpact(position, status);
  }
}

/**
 * Automatically detect inactive starters not on injury report
 * @param {Array} espnInjuries - Injuries from ESPN API
 * @param {string} team - Team code
 * @returns {Array} Enhanced injuries including inactive starters
 */
export function detectInactiveStarters(espnInjuries, team) {
  const enhancedInjuries = [...espnInjuries];
  
  if (!DEPTH_CHARTS[team]) {
    return enhancedInjuries;
  }
  
  // Check each position for missing starters
  Object.entries(DEPTH_CHARTS[team]).forEach(([position, depthChart]) => {
    const starter = depthChart[0];
    
    // Check if starter is in ESPN injury data
    const starterInReport = espnInjuries.find(inj => 
      inj.name.toLowerCase().includes(starter.toLowerCase().split(' ')[1]) || // Last name match
      starter.toLowerCase().includes(inj.name.toLowerCase().split(' ')[1])
    );
    
    if (!starterInReport && shouldCheckForInactiveStarter(starter, team, position)) {
      // Add as inactive starter
      enhancedInjuries.push({
        name: starter,
        position: position,
        status: 'out',
        depthOrder: 1,
        description: 'Inactive starter (not on injury report)',
        source: 'auto_detected'
      });
      
      console.log(`🔍 Auto-detected inactive starter: ${starter} (${team} ${position})`);
    }
  });
  
  return enhancedInjuries;
}

/**
 * Check if we should look for inactive starter (based on news, reports, etc.)
 */
function shouldCheckForInactiveStarter(playerName, team, position) {
  // Known inactive starters (this could be enhanced with news API integration)
  const knownInactive = [
    { name: 'Jayden Daniels', team: 'WAS', position: 'QB', reason: 'injury_not_reported' },
    // Add more as discovered
  ];
  
  return knownInactive.some(inactive => 
    inactive.name === playerName && 
    inactive.team === team && 
    inactive.position === position
  );
}

/**
 * Get player value from database
 */
function getPlayerValue(playerName, position, team) {
  const positionPlayers = PLAYER_VALUES[position] || {};
  
  if (positionPlayers[playerName]) {
    return positionPlayers[playerName];
  }
  
  // Fallback: estimate based on position and team context
  return estimatePlayerValue(playerName, position, team);
}

/**
 * Get backup player value with improved unknown player handling
 */
function getBackupValue(starterName, position, team) {
  const depthChart = DEPTH_CHARTS[team]?.[position] || [];
  const starterIndex = depthChart.findIndex(name => name === starterName);
  
  if (starterIndex >= 0 && starterIndex < depthChart.length - 1) {
    const backupName = depthChart[starterIndex + 1];
    const backupValue = getPlayerValue(backupName, position, team);
    return { ...backupValue, name: backupName };
  }
  
  // Improved fallback: position-specific backup estimates based on league averages
  return getPositionalBackupEstimate(position, team);
}

/**
 * Get position-specific backup estimates (replaces generic -1.5 fallback)
 */
function getPositionalBackupEstimate(position, team) {
  // League average backup EPA by position (more systematic than flat -1.5)
  const backupAverages = {
    'QB': { epa: -0.15, tier: 'backup', confidence: 0.6 },
    'RB': { epa: -0.08, tier: 'backup', confidence: 0.7 }, 
    'WR': { epa: -0.05, tier: 'backup', confidence: 0.5 },
    'TE': { epa: -0.06, tier: 'backup', confidence: 0.6 },
    'DB': { epa: -0.03, tier: 'backup', confidence: 0.4 } // DBs hardest to estimate
  };
  
  const baseEstimate = backupAverages[position] || { epa: -0.10, tier: 'backup', confidence: 0.3 };
  
  return {
    name: `Unknown ${position} Backup`,
    epa: baseEstimate.epa,
    tier: baseEstimate.tier,
    confidence: baseEstimate.confidence
  };
}

/**
 * Get recent backup performance data
 */
async function getBackupPerformance(team, position, week) {
  try {
    const store = getBlobStore();
    const performanceKey = `backup_performance/${team}_${position}_${week}`;
    const data = await store.get(performanceKey);
    
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.log(`No backup performance data for ${team} ${position}`);
  }
  
  return null;
}

/**
 * Calculate raw impact based on player vs backup EPA
 */
function calculateRawImpact(playerValue, backupValue, status) {
  const epaDifference = playerValue.epa - backupValue.epa;
  
  // Status multipliers
  const statusMultipliers = {
    'out': 1.0,
    'doubtful': 0.8,
    'questionable': 0.5,
    'active': 0.0
  };
  
  return epaDifference * (statusMultipliers[status] || 1.0);
}

/**
 * Apply QB caps and shrinkage to prevent unrealistic impacts
 * @param {number} impact - Raw QB impact
 * @returns {number} Capped and shrunk impact
 */
function applyQBCapsAndShrinkage(impact) {
  // Apply shrinkage factor for QB injuries (reduce extreme values)
  const shrinkageFactor = 0.65; // Reduce impact by 35%
  const shrunkImpact = impact * shrinkageFactor;
  
  // Apply maximum cap to prevent unrealistic impacts
  const maxImpact = -8.5; // Maximum 8.5 point negative impact
  const cappedImpact = Math.max(shrunkImpact, maxImpact);
  
  if (cappedImpact !== impact) {
    console.log(`🧢 QB impact adjusted: ${impact.toFixed(2)} → ${cappedImpact.toFixed(2)} (shrinkage: ${shrinkageFactor}, cap: ${maxImpact})`);
  }
  
  return cappedImpact;
}

/**
 * Apply performance adjustments based on recent backup play
 */
function applyPerformanceAdjustments(rawImpact, backupPerformance, week) {
  if (!backupPerformance || week <= 1) {
    return rawImpact; // No adjustments for first week or no data
  }
  
  // If backup played well recently, reduce the impact
  const performanceMultiplier = 1 - (backupPerformance.adjustment || 0);
  return rawImpact * performanceMultiplier;
}

/**
 * Apply team context (scheme fit, supporting cast, etc.)
 */
function applyTeamContext(impact, team, position) {
  const contextMultiplier = getTeamContextMultiplier(team, position);
  return impact * contextMultiplier;
}

/**
 * Get team context multiplier
 */
function getTeamContextMultiplier(team, position) {
  // Team-specific scheme dependencies
  const teamContext = {
    'WAS': {
      'QB': 1.2, // Jayden Daniels is crucial to their scheme
      'WR': 1.1,
      'RB': 0.9
    },
    'ATL': {
      'QB': 1.0,
      'WR': 1.0,
      'RB': 0.8 // Bijan is special but good depth
    }
  };
  
  return teamContext[team]?.[position] || 1.0;
}

/**
 * Convert EPA impact to point spread impact with snap share scaling
 */
function convertToPointImpact(epaImpact, position, status = 'out') {
  // More conservative EPA to points conversion
  const basePlaysPerGame = 65;
  const pointsPerEPA = 3.75; // Reduced from 4.5 to be more realistic
  
  // Expected snap share for backup players (not 100% usage)
  const snapShareByPosition = {
    'QB': status === 'out' ? 0.95 : 0.7, // QBs get most snaps when starting
    'RB': status === 'out' ? 0.65 : 0.4, // RBs share more with committees  
    'WR': status === 'out' ? 0.75 : 0.5, // WRs depend on role/depth
    'TE': status === 'out' ? 0.80 : 0.6, // TEs often every-down players
    'DB': status === 'out' ? 0.85 : 0.6  // DBs usually full-time when healthy
  };
  
  const snapShare = snapShareByPosition[position] || 0.7;
  const effectivePlays = basePlaysPerGame * snapShare;
  
  return epaImpact * effectivePlays * pointsPerEPA;
}

/**
 * Calculate confidence in the impact estimate
 */
function calculateConfidence(playerValue, backupValue, backupPerformance) {
  let confidence = 0.7; // Base confidence
  
  // Higher confidence if we have good data on both players
  if (playerValue.tier !== 'unknown') confidence += 0.1;
  if (backupValue.tier !== 'unknown') confidence += 0.1;
  
  // Higher confidence if we have recent backup performance data
  if (backupPerformance && backupPerformance.games >= 2) confidence += 0.1;
  
  return Math.min(confidence, 0.95);
}

/**
 * Estimate player value if not in database
 */
function estimatePlayerValue(playerName, position, team) {
  // Basic estimation based on position averages
  const positionAverages = {
    'QB': { starter: 0.15, backup: -0.15 },
    'WR': { starter: 0.10, backup: -0.05 },
    'RB': { starter: 0.08, backup: -0.02 },
    'TE': { starter: 0.06, backup: -0.02 }
  };
  
  const avg = positionAverages[position] || { starter: 0.05, backup: -0.05 };
  
  return {
    epa: avg.starter,
    tier: 'estimated',
    team: team
  };
}

// Removed getGenericBackupEPA - replaced with getPositionalBackupEstimate

/**
 * Fallback impact calculation
 */
function getFallbackImpact(position, status) {
  const fallbackImpacts = {
    'QB': { out: -8.5, doubtful: -6.8, questionable: -4.25 },
    'WR': { out: -2.5, doubtful: -2.0, questionable: -1.25 },
    'RB': { out: -1.8, doubtful: -1.4, questionable: -0.9 },
    'TE': { out: -1.2, doubtful: -1.0, questionable: -0.6 }
  };
  
  const positionImpacts = fallbackImpacts[position] || fallbackImpacts['WR'];
  
  return {
    player: 'Unknown',
    position: position,
    status: status,
    impact: positionImpacts[status] || 0,
    confidence: 0.6,
    source: 'fallback'
  };
}

/**
 * Update backup performance after games (called weekly)
 * @param {string} team - Team code
 * @param {string} position - Position
 * @param {Object} gameData - Performance data from the game
 */
export async function updateBackupPerformance(team, position, gameData) {
  try {
    const store = getBlobStore();
    const performanceKey = `backup_performance/${team}_${position}_${gameData.week}`;
    
    const performanceData = {
      week: gameData.week,
      games: gameData.games || 1,
      epaPerPlay: gameData.epaPerPlay || 0,
      adjustment: calculatePerformanceAdjustment(gameData),
      trend: calculateTrend(gameData),
      lastUpdated: new Date().toISOString()
    };
    
    await store.set(performanceKey, JSON.stringify(performanceData));
    console.log(`Updated backup performance for ${team} ${position}: ${performanceData.adjustment}`);
    
  } catch (error) {
    console.error(`Failed to update backup performance:`, error);
  }
}

/**
 * Calculate performance adjustment based on game data
 */
function calculatePerformanceAdjustment(gameData) {
  if (!gameData.epaPerPlay) return 0;
  
  // If backup performed much better than expected, reduce future impact
  // If backup performed worse, increase future impact
  const expectedBackupEPA = -0.1; // Average backup performance
  const difference = gameData.epaPerPlay - expectedBackupEPA;
  
  // Cap adjustments at ±30%
  return Math.max(-0.3, Math.min(0.3, difference * 2));
}

/**
 * Calculate performance trend
 */
function calculateTrend(gameData) {
  if (gameData.epaPerPlay > 0) return 'improving';
  if (gameData.epaPerPlay < -0.2) return 'struggling';
  return 'stable';
}
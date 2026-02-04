/**
 * NBA Injury Impact Adjustments V2
 * 
 * Enhanced version that uses PRODUCTION SHARE to weight player importance.
 * 
 * Key improvements over V1:
 * - Uses actual player stats (pts/reb/ast contribution) instead of just position
 * - Star players weighted 2x+ vs bench players
 * - Production share calculated from player-boxscores data
 * 
 * Applied AFTER RCI adjustments (separate concerns).
 */

import { getInjuryWeightMultiplier, getPlayerImpact } from './player-impact.mjs';

// Impact constants (conservative priors)
const INJURY_IMPACT = {
  // Base impact per injury status (pts/100 possession)
  OUT: 2.5,           // Player definitely out
  DOUBTFUL: 1.5,      // 75% chance out
  QUESTIONABLE: 0.8,  // 50% chance out
  PROBABLE: 0.3,      // 25% chance out
  DAY_TO_DAY: 0.5,    // Uncertain
  
  // Position multipliers (secondary to production share)
  POSITION_WEIGHT: {
    'PG': 1.1,  // Slightly higher for primary ball handlers
    'SG': 1.0,  
    'SF': 1.0,  // Baseline
    'PF': 0.95,
    'C': 1.05,  // Rim protection important
  },
  
  // Position cluster capacity caps
  POSITION_CLUSTER_CAPS: {
    'GUARDS': 6.0,    // PG + SG combined max impact (raised for star guards)
    'WINGS': 5.5,     // SF max impact
    'BIGS': 5.5       // PF + C combined max impact
  },
  
  // Stacking penalty (multiple injuries hurt more than linear)
  STACKING_MULTIPLIER: 1.12, // Each additional injury is 12% worse
  
  // Max impact cap (prevent extreme adjustments)
  MAX_IMPACT: 10.0, // Raised to 10 pts/100 (star + starters out scenario)
  
  // Multi-injury uncertainty multiplier
  UNCERTAINTY_ESCALATION: {
    1: 1.0,
    2: 1.15,
    3: 1.35,
    4: 1.6
  }
};

// Position cluster mapping
function getPositionCluster(position) {
  if (!position) return null;
  const pos = position.toUpperCase();
  if (pos === 'PG' || pos === 'SG' || pos === 'G') return 'GUARDS';
  if (pos === 'SF' || pos === 'F') return 'WINGS';
  if (pos === 'PF' || pos === 'C') return 'BIGS';
  return 'WINGS';
}

/**
 * Calculate injury adjustment for a team (V2 with production share)
 * 
 * @param {Array} injuries - List of team injuries from injuries.mjs
 * @param {string} teamAbbr - Team abbreviation for production share lookup
 * @returns {Object} { deltaOff, deltaDef, severity, details, uncertaintyMultiplier }
 */
export function calculateInjuryAdjustment(injuries, teamAbbr) {
  if (!injuries || injuries.length === 0) {
    return {
      deltaOff: 0,
      deltaDef: 0,
      severity: 'NONE',
      count: 0,
      details: [],
      rawImpact: 0,
      uncertaintyMultiplier: 1.0,
      version: 'v2.1'
    };
  }
  
  let totalImpact = 0;
  const details = [];
  
  // Track impact by position cluster
  const clusterImpact = {
    'GUARDS': 0,
    'WINGS': 0,
    'BIGS': 0
  };
  
  // Calculate impact for each injury
  injuries.forEach((injury, index) => {
    const statusImpact = getStatusImpact(injury.status);
    const positionWeight = getPositionWeight(injury.position);
    const stackingPenalty = Math.pow(INJURY_IMPACT.STACKING_MULTIPLIER, index);
    
    // NEW V2: Get production share-based weight
    const productionWeight = getInjuryWeightMultiplier(teamAbbr, injury.playerName);
    const playerImpactData = getPlayerImpact(teamAbbr, injury.playerName);
    
    // V2 formula: Status × Position × Stacking × ProductionShare
    const injuryImpact = statusImpact * positionWeight * stackingPenalty * productionWeight;
    
    // Track by cluster
    const cluster = getPositionCluster(injury.position);
    if (cluster) {
      clusterImpact[cluster] += injuryImpact;
    }
    
    totalImpact += injuryImpact;
    
    details.push({
      player: injury.playerName,
      position: injury.position,
      cluster: cluster,
      status: injury.status,
      impact: injuryImpact.toFixed(2),
      // V2 additions
      productionShare: playerImpactData?.productionShare || 'N/A',
      productionWeight: productionWeight.toFixed(2),
      tier: playerImpactData?.tier || 'UNKNOWN'
    });
    
    console.log(`[InjuryV2] ${injury.playerName} (${injury.status}): ` +
      `base=${statusImpact} × pos=${positionWeight.toFixed(2)} × stack=${stackingPenalty.toFixed(2)} × prod=${productionWeight.toFixed(2)} = ${injuryImpact.toFixed(2)}`);
  });
  
  // Apply position cluster caps
  let cappedImpact = 0;
  let capApplied = false;
  
  Object.keys(clusterImpact).forEach(cluster => {
    const clusterMax = INJURY_IMPACT.POSITION_CLUSTER_CAPS[cluster];
    if (clusterImpact[cluster] > clusterMax) {
      cappedImpact += clusterMax;
      capApplied = true;
      console.log(`[InjuryV2] ${cluster} cluster cap applied: ${clusterImpact[cluster].toFixed(2)} → ${clusterMax}`);
    } else {
      cappedImpact += clusterImpact[cluster];
    }
  });
  
  // Use the lower of total or capped
  totalImpact = Math.min(totalImpact, cappedImpact);
  
  // Cap at max impact
  totalImpact = Math.min(totalImpact, INJURY_IMPACT.MAX_IMPACT);
  
  // Calculate uncertainty multiplier
  const uncertaintyMultiplier = INJURY_IMPACT.UNCERTAINTY_ESCALATION[Math.min(injuries.length, 4)] || 1.6;
  
  // Split impact between offense and defense (60/40 split)
  const deltaOff = -totalImpact * 0.6;
  const deltaDef = -totalImpact * 0.4;
  
  // Categorize severity
  const severity = categorizeSeverity(totalImpact);
  
  return {
    deltaOff,
    deltaDef,
    severity,
    count: injuries.length,
    details,
    rawImpact: totalImpact,
    clusterImpact,
    capApplied,
    uncertaintyMultiplier,
    version: 'v2.1'
  };
}

/**
 * Get impact value for injury status
 */
function getStatusImpact(status) {
  const normalized = status?.toUpperCase() || '';
  
  if (normalized.includes('OUT')) return INJURY_IMPACT.OUT;
  if (normalized.includes('DOUBTFUL')) return INJURY_IMPACT.DOUBTFUL;
  if (normalized.includes('QUESTIONABLE')) return INJURY_IMPACT.QUESTIONABLE;
  if (normalized.includes('PROBABLE')) return INJURY_IMPACT.PROBABLE;
  if (normalized.includes('DAY')) return INJURY_IMPACT.DAY_TO_DAY;
  
  return 0.5; // Default for unknown status
}

/**
 * Get position weight multiplier (secondary to production share in V2)
 */
function getPositionWeight(position) {
  return INJURY_IMPACT.POSITION_WEIGHT[position] || 1.0;
}

/**
 * Categorize injury severity
 */
function categorizeSeverity(impact) {
  if (impact >= 7.0) return 'SEVERE';
  if (impact >= 4.0) return 'HIGH';
  if (impact >= 2.0) return 'MODERATE';
  if (impact >= 0.8) return 'LOW';
  return 'MINIMAL';
}

/**
 * Apply injury adjustments to team stats (V2)
 * 
 * @param {Object} stats - Team stats object { offRtg, defRtg, netRtg, ... }
 * @param {Array} injuries - Team injuries
 * @param {string} teamAbbr - Team abbreviation
 * @returns {Object} Adjusted stats
 */
export function applyInjuryAdjustment(stats, injuries, teamAbbr) {
  const adjustment = calculateInjuryAdjustment(injuries, teamAbbr);
  
  return {
    ...stats,
    offRtg: stats.offRtg + adjustment.deltaOff,
    defRtg: stats.defRtg - adjustment.deltaDef,
    netRtg: (stats.offRtg + adjustment.deltaOff) - (stats.defRtg - adjustment.deltaDef),
    
    // Preserve original values
    offRtg_preInjury: stats.offRtg,
    defRtg_preInjury: stats.defRtg,
    
    // Include adjustment info
    injuryAdjustment: adjustment
  };
}

/**
 * Get injury summary for logging
 */
export function getInjurySummary(injuries, teamAbbr) {
  const adjustment = calculateInjuryAdjustment(injuries, teamAbbr);
  
  return {
    count: adjustment.count,
    severity: adjustment.severity,
    deltaOff: adjustment.deltaOff,
    deltaDef: adjustment.deltaDef,
    impact: adjustment.count === 0 ? 'HEALTHY' : `${adjustment.severity} (${adjustment.count} injured)`,
    players: adjustment.details.map(d => `${d.player} (${d.status}, ${d.tier})`).join(', '),
    version: 'v2.1'
  };
}

/**
 * Get comparative injury advantage (V2)
 * 
 * @param {Array} homeInjuries
 * @param {Array} awayInjuries
 * @param {string} homeTeam
 * @param {string} awayTeam
 * @returns {Object} Which team has health advantage
 */
export function getInjuryAdvantage(homeInjuries, awayInjuries, homeTeam, awayTeam) {
  const homeAdj = calculateInjuryAdjustment(homeInjuries, homeTeam);
  const awayAdj = calculateInjuryAdjustment(awayInjuries, awayTeam);
  
  const differential = Math.abs(homeAdj.rawImpact) - Math.abs(awayAdj.rawImpact);
  
  let advantage = 'EVEN';
  if (differential < -1.5) advantage = 'HOME';
  if (differential > 1.5) advantage = 'AWAY';
  
  return {
    advantage,
    differential: differential.toFixed(2),
    home: {
      severity: homeAdj.severity,
      count: homeAdj.count,
      impact: homeAdj.rawImpact.toFixed(2),
      details: homeAdj.details
    },
    away: {
      severity: awayAdj.severity,
      count: awayAdj.count,
      impact: awayAdj.rawImpact.toFixed(2),
      details: awayAdj.details
    },
    version: 'v2.1'
  };
}

export default {
  calculateInjuryAdjustment,
  applyInjuryAdjustment,
  getInjurySummary,
  getInjuryAdvantage,
  INJURY_IMPACT,
};

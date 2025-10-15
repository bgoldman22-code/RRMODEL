/**
 * NBA Injury Impact Adjustments
 * 
 * Calculates rating adjustments based on current injuries.
 * Applied AFTER RCI adjustments (separate concerns).
 * 
 * Philosophy:
 * - Conservative priors (start small, validate empirically)
 * - Position-weighted impact
 * - Stacking penalties for multiple injuries
 * - Status-based severity (Out > Doubtful > Questionable)
 */

// Impact constants (conservative priors - Phase 2 optimization)
const INJURY_IMPACT = {
  // Base impact per injury status (pts/100 possession)
  OUT: 2.5,           // Player definitely out
  DOUBTFUL: 1.5,      // 75% chance out
  QUESTIONABLE: 0.8,  // 50% chance out
  PROBABLE: 0.3,      // 25% chance out
  DAY_TO_DAY: 0.5,    // Uncertain
  
  // Position multipliers (some positions matter more)
  POSITION_WEIGHT: {
    'PG': 1.2,  // Primary ball handlers matter most
    'SG': 1.1,  
    'SF': 1.0,  // Baseline
    'PF': 0.9,
    'C': 1.1,   // Rim protection + rebounding important
  },
  
  // Stacking penalty (multiple injuries hurt more than linear)
  STACKING_MULTIPLIER: 1.15, // Each additional injury is 15% worse
  
  // Max impact cap (prevent extreme adjustments)
  MAX_IMPACT: 8.0, // Max 8 pts/100 for catastrophic injury situation
};

/**
 * Calculate injury adjustment for a team
 * 
 * @param {Array} injuries - List of team injuries from injuries.mjs
 * @returns {Object} { deltaOff, deltaDef, severity, details }
 */
export function calculateInjuryAdjustment(injuries) {
  if (!injuries || injuries.length === 0) {
    return {
      deltaOff: 0,
      deltaDef: 0,
      severity: 'NONE',
      count: 0,
      details: []
    };
  }
  
  let totalImpact = 0;
  const details = [];
  
  // Calculate base impact for each injury
  injuries.forEach((injury, index) => {
    const statusImpact = getStatusImpact(injury.status);
    const positionWeight = getPositionWeight(injury.position);
    const stackingPenalty = Math.pow(INJURY_IMPACT.STACKING_MULTIPLIER, index);
    
    const injuryImpact = statusImpact * positionWeight * stackingPenalty;
    totalImpact += injuryImpact;
    
    details.push({
      player: injury.playerName,
      position: injury.position,
      status: injury.status,
      impact: injuryImpact.toFixed(2)
    });
  });
  
  // Cap at max impact
  totalImpact = Math.min(totalImpact, INJURY_IMPACT.MAX_IMPACT);
  
  // Split impact between offense and defense (60/40 split typical)
  // Injuries hurt offense more (lost scoring/playmaking)
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
    rawImpact: totalImpact
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
 * Get position weight multiplier
 */
function getPositionWeight(position) {
  return INJURY_IMPACT.POSITION_WEIGHT[position] || 1.0;
}

/**
 * Categorize injury severity
 */
function categorizeSeverity(impact) {
  if (impact >= 6.0) return 'SEVERE';
  if (impact >= 3.0) return 'HIGH';
  if (impact >= 1.5) return 'MODERATE';
  if (impact >= 0.5) return 'LOW';
  return 'MINIMAL';
}

/**
 * Apply injury adjustments to team stats
 * 
 * @param {Object} stats - Team stats object { offRtg, defRtg, netRtg, ... }
 * @param {Array} injuries - Team injuries
 * @returns {Object} Adjusted stats
 */
export function applyInjuryAdjustment(stats, injuries) {
  const adjustment = calculateInjuryAdjustment(injuries);
  
  return {
    ...stats,
    offRtg: stats.offRtg + adjustment.deltaOff,
    defRtg: stats.defRtg - adjustment.deltaDef, // Lower is better, so subtract negative = worse
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
export function getInjurySummary(injuries) {
  const adjustment = calculateInjuryAdjustment(injuries);
  
  return {
    count: adjustment.count,
    severity: adjustment.severity,
    deltaOff: adjustment.deltaOff.toFixed(2),
    deltaDef: adjustment.deltaDef.toFixed(2),
    impact: adjustment.count === 0 ? 'HEALTHY' : `${adjustment.severity} (${adjustment.count} injured)`,
    players: adjustment.details.map(d => `${d.player} (${d.status})`).join(', ')
  };
}

/**
 * Get comparative injury advantage
 * 
 * @param {Array} homeInjuries
 * @param {Array} awayInjuries  
 * @returns {Object} Which team has health advantage
 */
export function getInjuryAdvantage(homeInjuries, awayInjuries) {
  const homeAdj = calculateInjuryAdjustment(homeInjuries);
  const awayAdj = calculateInjuryAdjustment(awayInjuries);
  
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
      impact: homeAdj.rawImpact.toFixed(2)
    },
    away: {
      severity: awayAdj.severity,
      count: awayAdj.count,
      impact: awayAdj.rawImpact.toFixed(2)
    }
  };
}

export default {
  calculateInjuryAdjustment,
  applyInjuryAdjustment,
  getInjurySummary,
  getInjuryAdvantage,
  INJURY_IMPACT, // Export constants for tuning
};

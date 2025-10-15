/**
 * NBA Roster Continuity Index (RCI) Adjustments
 * 
 * Adjusts team ratings based on roster turnover between seasons.
 * Uses additive deltas (not multipliers) for proper scaling.
 * 
 * Theory:
 * - Teams with low RCI (lost key players) get negative adjustments
 * - Teams with high RCI (kept core) get positive adjustments
 * - Chemistry improves over season via exponential decay
 */

// RCI data (2025-26 season)
const RCI_DATA = {
  "ATL": 0.627, "BOS": 0.670, "BKN": 0.548, "CHA": 0.562, "CHI": 0.924,
  "CLE": 0.736, "DAL": 0.817, "DEN": 0.762, "DET": 0.602, "GS": 0.933,
  "HOU": 0.657, "IND": 0.839, "LAC": 0.699, "LAL": 0.747, "MEM": 0.809,
  "MIA": 0.721, "MIL": 0.705, "MIN": 0.871, "NO": 0.533, "NY": 0.849,
  "OKC": 0.961, "ORL": 0.862, "PHI": 0.683, "PHX": 0.498, "POR": 0.700,
  "SAC": 0.777, "SA": 0.745, "TOR": 0.883, "UTA": 0.624, "WSH": 0.729
};

// Constants (calibrated for NBA team ratings)
const RCI_CENTER = 0.75;        // League median RCI
const ALPHA_OFF = 4.0;          // Pts/100 per 1.0 RCI delta (offense)
const ALPHA_DEF = 3.5;          // Pts/100 per 1.0 RCI delta (defense)
const HALF_LIFE = 14;           // Games until chemistry penalty halves
const ASYMMETRY_LOSS = 1.2;     // Losses hurt 20% more
const ASYMMETRY_GAIN = 0.8;     // Gains help 20% less

/**
 * Get RCI adjustment for a team
 * 
 * @param {string} teamAbbr - Team abbreviation (e.g., 'BOS', 'GS')
 * @param {number} gamesPlayed - Games played this season (0-82)
 * @returns {Object} - { deltaOff, deltaDef, debug }
 */
export function getRCIAdjustment(teamAbbr, gamesPlayed = 0) {
  // Handle Golden State Warriors abbreviation
  const abbr = teamAbbr === 'GS' ? 'GS' : teamAbbr;
  
  const rci = RCI_DATA[abbr];
  
  // If no RCI data, return neutral adjustment
  if (rci == null) {
    console.log(`[RCI] No data for ${teamAbbr} - using neutral adjustment`);
    return { deltaOff: 0, deltaDef: 0, rci: null, rciDelta: 0, decay: 1.0 };
  }
  
  // Calculate RCI delta from league median
  const rciDelta = rci - RCI_CENTER;
  
  // Asymmetry: losses hurt more than gains help
  const asymmetry = rciDelta < 0 ? ASYMMETRY_LOSS : ASYMMETRY_GAIN;
  
  // Chemistry decay (exponential with half-life)
  // Game 0: 100% penalty, Game 14: 50% penalty, Game 28: 25%, etc.
  const decay = Math.pow(2, -gamesPlayed / HALF_LIFE);
  
  // Calculate deltas (points per 100 possessions)
  const deltaOff = ALPHA_OFF * rciDelta * asymmetry * decay;
  const deltaDef = ALPHA_DEF * rciDelta * asymmetry * decay;
  
  return {
    deltaOff,      // Add to offensive rating
    deltaDef,      // Subtract from defensive rating (lower DefRtg is better)
    rci,           // Raw RCI value (0-1)
    rciDelta,      // Delta from league median (-0.25 to +0.25)
    decay,         // Chemistry decay factor (1.0 → 0)
    asymmetry,     // Loss/gain asymmetry multiplier
    gamesPlayed
  };
}

/**
 * Apply RCI adjustments to team stats
 * 
 * @param {Object} stats - Team stats object with offRtg, defRtg
 * @param {string} teamAbbr - Team abbreviation
 * @param {number} gamesPlayed - Games played this season
 * @returns {Object} - Adjusted stats
 */
export function applyRCIAdjustment(stats, teamAbbr, gamesPlayed = 0) {
  const adjustment = getRCIAdjustment(teamAbbr, gamesPlayed);
  
  return {
    ...stats,
    offRtg: stats.offRtg + adjustment.deltaOff,
    defRtg: stats.defRtg - adjustment.deltaDef,  // Subtract because lower is better
    netRtg: (stats.offRtg + adjustment.deltaOff) - (stats.defRtg - adjustment.deltaDef),
    rciAdjustment: adjustment
  };
}

/**
 * Get RCI summary for logging/debugging
 */
export function getRCISummary(teamAbbr, gamesPlayed = 0) {
  const adj = getRCIAdjustment(teamAbbr, gamesPlayed);
  
  return {
    team: teamAbbr,
    rci: adj.rci?.toFixed(3),
    rciDelta: adj.rciDelta?.toFixed(3),
    impact: adj.rciDelta < 0 ? 'NEGATIVE (lost players)' : 'POSITIVE (kept core)',
    deltaOff: adj.deltaOff.toFixed(2),
    deltaDef: adj.deltaDef.toFixed(2),
    decay: (adj.decay * 100).toFixed(1) + '%',
    gamesPlayed,
    halfLife: HALF_LIFE
  };
}

// Export constants for reference
export const RCI_CONSTANTS = {
  RCI_CENTER,
  ALPHA_OFF,
  ALPHA_DEF,
  HALF_LIFE,
  ASYMMETRY_LOSS,
  ASYMMETRY_GAIN
};

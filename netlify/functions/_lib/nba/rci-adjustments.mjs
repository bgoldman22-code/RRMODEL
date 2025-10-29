/**
 * NBA Roster Continuity Index (RCI) Adjustments
 * 
 * Adjusts team ratings based on roster turnover between seasons.
 * Uses the canonical rci-core.mjs implementation for consistency.
 * 
 * Theory:
 * - Teams with low RCI (lost key players) get negative adjustments
 * - Teams with high RCI (kept core) get positive adjustments
 * - Chemistry improves over season via exponential decay
 */

import { 
  calculateRCIDeltas, 
  applyRCIToStats, 
  RCI_CONSTANTS,
  formatRCILog 
} from './rci-core.mjs';

// RCI data (2025-26 season)
const RCI_DATA = {
  "ATL": 0.627, "BOS": 0.670, "BKN": 0.548, "CHA": 0.562, "CHI": 0.924,
  "CLE": 0.736, "DAL": 0.817, "DEN": 0.762, "DET": 0.602, "GS": 0.933,
  "HOU": 0.657, "IND": 0.839, "LAC": 0.699, "LAL": 0.747, "MEM": 0.809,
  "MIA": 0.721, "MIL": 0.705, "MIN": 0.871, "NO": 0.533, "NY": 0.849,
  "OKC": 0.961, "ORL": 0.862, "PHI": 0.683, "PHX": 0.498, "POR": 0.700,
  "SAC": 0.777, "SA": 0.745, "TOR": 0.883, "UTA": 0.624, "WSH": 0.729
};

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
  
  // Use core implementation for consistency with grid search
  const result = calculateRCIDeltas(rci, gamesPlayed);
  
  return {
    deltaOff: result.deltaOff,
    deltaDef: result.deltaDef,
    rci: result.metadata.rci,
    rciDelta: result.metadata.rciDelta,
    decay: result.metadata.decay,
    asymmetry: result.metadata.asymmetry,
    gamesPlayed: result.metadata.gamesPlayed,
    capHit: result.metadata.capHit
  };
}

/**
 * Apply RCI adjustments to team stats
 * 
 * @param {Object} stats - Team stats object with offRtg, defRtg
 * @param {string} teamAbbr - Team abbreviation
 * @param {number} gamesPlayed - Games played this season
 * @returns {Object} - Adjusted stats (preserves all original fields)
 */
export function applyRCIAdjustment(stats, teamAbbr, gamesPlayed = 0) {
  const abbr = teamAbbr === 'GS' ? 'GS' : teamAbbr;
  const rci = RCI_DATA[abbr];
  
  // Use core implementation
  const adjusted = applyRCIToStats(stats, rci, gamesPlayed);
  
  // Return ALL original stats plus RCI adjustments
  return {
    ...stats, // Preserve all original fields (efg, ts, tovPct, winPct, etc.)
    offRtg: adjusted.offRtg,  // Override with RCI-adjusted values
    defRtg: adjusted.defRtg,
    netRtg: adjusted.netRtg,
    rciAdjustment: {
      deltaOff: adjusted._rciDeltaOff,
      deltaDef: adjusted._rciDeltaDef,
      rci: adjusted._rciMetadata.rci,
      capHit: adjusted._rciMetadata.capHit
    }
  };
}

/**
 * Get RCI summary for logging/debugging
 */
export function getRCISummary(teamAbbr, gamesPlayed = 0) {
  const abbr = teamAbbr === 'GS' ? 'GS' : teamAbbr;
  const rci = RCI_DATA[abbr];
  
  return formatRCILog(abbr, rci, gamesPlayed);
}

// Export constants for reference
export { RCI_CONSTANTS };

/**
 * Fantasy Scoring Logic (Serverless)
 * 
 * Calculates Expected Fantasy Points (EFP), sit/start scores, tiers, and reasons.
 * 
 * Key Algorithms:
 * 1. EFP Calculation: Convert player props to fantasy points using league scoring
 * 2. Multi-TD Ceiling Bonus: Extra value for 2+ TD probability (position-weighted)
 * 3. Sit/Start Score: Z-score + context modifiers (script, IT, injury)
 * 4. Tiers: S/A/B/C/D based on z-score thresholds within position
 * 5. Reasons: 2-4 positives/negatives per player
 * 6. FLEX Swaps: Suggest bench players >1.0 pt better than starters
 */

import { calculateScriptLean } from './ff-odds.mjs';

// Tier thresholds (z-scores)
const TIER_THRESHOLDS = {
  S: 1.2,   // Elite
  A: 0.6,   // Good start
  B: -0.2,  // Solid
  C: -0.8,  // Risky
  D: -999   // Sit
};

// 2+ TD ceiling bonus weights by position
const CEILING_WEIGHTS = {
  RB: 0.8,
  TE: 0.6,
  WR: 0.35,
  QB: 0,
  K: 0,
  DEF: 0
};

// Fallback EFP baselines when props missing
const FALLBACK_BASELINES = {
  QB: 15,
  RB: 10,
  WR: 8,
  TE: 6,
  K: 8,
  DEF: 8
};

/**
 * Calculate Expected Fantasy Points from player props
 * @param {Object} props - Player props (pass_yds, rush_yds, rec_yds, etc.)
 * @param {Object} scoringRules - League scoring settings
 * @param {string} position - Player position (QB, RB, WR, TE, K, DEF)
 * @param {Object} teamContext - Game context (spread, impliedTotal, etc.)
 * @returns {number} Expected fantasy points
 */
export function expectedFantasyPoints(props, scoringRules, position, teamContext) {
  if (!props || Object.keys(props).length === 0) {
    // No props available - use fallback
    return applyFallback(position, teamContext, scoringRules);
  }

  let efp = 0;

  // Passing stats
  if (props.pass_yds) {
    efp += props.pass_yds * scoringRules.passYards;
  }
  if (props.pass_tds) {
    efp += props.pass_tds * scoringRules.passTD;
  }
  if (props.interceptions) {
    efp += props.interceptions * scoringRules.passInt; // Usually negative
  }

  // Rushing stats
  if (props.rush_yds) {
    efp += props.rush_yds * scoringRules.rushYards;
  }

  // Receiving stats
  if (props.rec_yds) {
    efp += props.rec_yds * scoringRules.recYards;
  }
  if (props.receptions) {
    efp += props.receptions * scoringRules.reception; // PPR
  }

  // Touchdown probability (all positions can score TDs)
  if (props.anytime_td_prob) {
    // Use reception TD value for pass-catchers, rush TD for RBs
    const tdValue = (position === 'WR' || position === 'TE') 
      ? scoringRules.recTD 
      : scoringRules.rushTD;
    efp += props.anytime_td_prob * tdValue;
  }

  return efp;
}

/**
 * Apply 2+ TD ceiling bonus to EFP
 * @param {number} baseEFP - Base EFP before ceiling bonus
 * @param {Object} props - Player props with two_plus_td_prob
 * @param {Object} scoringRules - League scoring settings
 * @param {string} position - Player position
 * @returns {number} Ceiling bonus points
 */
export function applyMultiTDBonus(baseEFP, props, scoringRules, position) {
  const weight = CEILING_WEIGHTS[position] || 0;
  
  if (weight === 0 || !props.two_plus_td_prob) {
    return 0;
  }

  const tdValue = (position === 'WR' || position === 'TE') 
    ? scoringRules.recTD 
    : scoringRules.rushTD;

  const bonus = props.two_plus_td_prob * tdValue * weight;
  return bonus;
}

/**
 * Apply fallback EFP when props are missing
 * @param {string} position - Player position
 * @param {Object} teamContext - Game context
 * @param {Object} scoringRules - League scoring settings
 * @returns {number} Fallback EFP estimate
 */
function applyFallback(position, teamContext, scoringRules) {
  const baseline = FALLBACK_BASELINES[position] || 5;
  
  if (!teamContext || !teamContext.implied_totals) {
    return baseline;
  }

  const { implied_totals, spread, home_team, away_team } = teamContext;
  const it = implied_totals.homeIT; // Assume home for now, caller should pass correct IT
  
  // Bonus for high implied total (>21)
  const itBonus = Math.max(0, (it - 21) / 3);
  
  // Bonus for favorable script
  let scriptBonus = 0;
  if (position === 'QB') {
    // QB gets bonus if team is favorite
    scriptBonus = spread < 0 ? 1 : 0;
  } else if (position === 'RB') {
    // RB gets bonus if team is big favorite (run-heavy script)
    scriptBonus = spread <= -4.5 ? 1.5 : 0;
  } else if (position === 'WR' || position === 'TE') {
    // WR/TE get bonus if team is underdog (pass-heavy script)
    scriptBonus = spread >= 4.5 ? 1 : 0;
  }

  return baseline + itBonus + scriptBonus;
}

/**
 * Calculate sit/start score with context modifiers
 * @param {number} efp - Expected fantasy points
 * @param {Object} context - Game context (script, IT, etc.)
 * @param {Object} player - Player info (position, status, bye)
 * @param {Object} scoringRules - League scoring settings
 * @param {Array} allPlayers - All players at same position (for z-score)
 * @returns {number} Sit/start score
 */
export function calculateSitStartScore(efp, context, player, scoringRules, allPlayers) {
  // If no game context (bye week, game not scheduled, etc.), return 0
  if (!context) {
    return 0; // Player is unplayable (bye week or no game)
  }

  // Calculate z-score within position group
  const positionPlayers = allPlayers.filter(p => p.position === player.position);
  const zScore = calculateZScore(efp, positionPlayers.map(p => p.efp));

  // Context modifiers
  const scriptBonus = calculateScriptBonus(player.position, context);
  const itBonus = calculateITBonus(context);
  const injuryPenalty = calculateInjuryPenalty(player.status);
  const byePenalty = player.bye_week === context.week ? 0 : 0; // Handled earlier now

  // Formula: zEFP + 0.35*script + 0.25*IT + 0.20*injury
  const score = zScore + (0.35 * scriptBonus) + (0.25 * itBonus) + (0.20 * injuryPenalty) + byePenalty;

  return score;
}

/**
 * Calculate z-score for a value within a dataset
 * @param {number} value - Value to score
 * @param {Array} dataset - All values in dataset
 * @returns {number} Z-score
 */
function calculateZScore(value, dataset) {
  if (dataset.length === 0) return 0;
  
  const mean = dataset.reduce((sum, v) => sum + v, 0) / dataset.length;
  const variance = dataset.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dataset.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  
  return (value - mean) / stdDev;
}

/**
 * Calculate script bonus based on position and game context
 * @param {string} position - Player position
 * @param {Object} context - Game context with spread
 * @returns {number} Script bonus
 */
function calculateScriptBonus(position, context) {
  if (!context || !context.spread) return 0;

  const { spread } = context;
  const { passLean, runLean } = calculateScriptLean(context, context.home_team, 4.5);

  if (position === 'RB') {
    return 0.6 * runLean; // RBs benefit from run-heavy (big favorite)
  }
  if (position === 'WR' || position === 'TE') {
    return 0.6 * passLean; // Pass-catchers benefit from pass-heavy (underdog)
  }
  if (position === 'QB') {
    // QB gets small bonus if team is favorite
    return spread < 0 ? 0.4 : 0;
  }

  return 0;
}

/**
 * Calculate implied total bonus
 * @param {Object} context - Game context with implied_totals
 * @returns {number} IT bonus
 */
function calculateITBonus(context) {
  if (!context || !context.implied_totals) return 0;

  const it = context.implied_totals.homeIT; // Caller should pass correct IT
  
  // Scale: IT of 21 is neutral, +1 bonus per 7 points above
  return (it - 21) / 7;
}

/**
 * Calculate injury penalty based on player status
 * @param {string} status - Player status (Q, D, O, IR, etc.)
 * @returns {number} Injury penalty
 */
function calculateInjuryPenalty(status) {
  if (!status) return 0;

  const s = status.toUpperCase();
  
  if (s === 'Q') return -0.3;   // Questionable
  if (s === 'D') return -0.8;   // Doubtful
  if (s === 'O' || s === 'IR' || s === 'PUP' || s === 'SUSP') return -999; // Out

  return 0;
}

/**
 * Assign tiers to players based on sit/start scores
 * @param {Array} players - Array of player objects with scores
 * @returns {Array} Players with tier property added
 */
export function assignTiers(players) {
  return players.map(player => {
    const { score } = player;
    
    let tier = 'D';
    if (score >= TIER_THRESHOLDS.S) tier = 'S';
    else if (score >= TIER_THRESHOLDS.A) tier = 'A';
    else if (score >= TIER_THRESHOLDS.B) tier = 'B';
    else if (score >= TIER_THRESHOLDS.C) tier = 'C';

    return { ...player, tier };
  });
}

/**
 * Generate 2-4 reasons for sit/start recommendation
 * @param {Object} player - Player object with props, efp, context
 * @param {Object} scoringRules - League scoring settings
 * @returns {Array} Array of reason strings
 */
export function generateReasons(player, scoringRules) {
  const reasons = [];

  // Props-based reason (if props available)
  if (player.props && Object.keys(player.props).length > 0) {
    const propParts = [];
    if (player.props.pass_yds) propParts.push(`${player.props.pass_yds} pass yds`);
    if (player.props.rush_yds) propParts.push(`${player.props.rush_yds} rush yds`);
    if (player.props.rec_yds) propParts.push(`${player.props.rec_yds} rec yds`);
    if (player.props.receptions) propParts.push(`${player.props.receptions} rec`);
    if (player.props.anytime_td_prob) propParts.push(`${(player.props.anytime_td_prob * 100).toFixed(0)}% TD`);
    if (player.props.two_plus_td_prob) propParts.push(`${(player.props.two_plus_td_prob * 100).toFixed(0)}% 2+ TD`);
    
    if (propParts.length > 0) {
      reasons.push(`Props: ${propParts.join(', ')}`);
    }
  }

  // Implied total reason
  if (player.context && player.context.implied_totals) {
    const it = player.context.implied_totals.homeIT;
    if (it >= 24) {
      reasons.push(`High implied total (${it.toFixed(1)})`);
    } else if (it <= 18) {
      reasons.push(`Low implied total (${it.toFixed(1)})`);
    }
  }

  // Script reason
  if (player.context && player.context.spread) {
    const { passLean, runLean } = calculateScriptLean(player.context, player.team, 4.5);
    if (passLean && (player.position === 'WR' || player.position === 'TE' || player.position === 'QB')) {
      reasons.push('Pass-heavy game script (underdog)');
    }
    if (runLean && player.position === 'RB') {
      reasons.push('Run-heavy game script (favorite)');
    }
  }

  // Ceiling reason
  if (player.props && player.props.two_plus_td_prob && player.props.two_plus_td_prob > 0.15) {
    reasons.push(`High ceiling (${(player.props.two_plus_td_prob * 100).toFixed(0)}% 2+ TD)`);
  }

  // Injury reason
  if (player.status) {
    const s = player.status.toUpperCase();
    if (s === 'Q') reasons.push('Injury concern (Questionable)');
    if (s === 'D') reasons.push('Injury concern (Doubtful)');
    if (s === 'O') reasons.push('OUT for this game');
  }

  // Bye week reason
  if (player.bye_week === player.context?.week) {
    reasons.push('BYE WEEK - DO NOT START');
  }

  // Missing props reason
  if (!player.props || Object.keys(player.props).length === 0) {
    reasons.push('No props available (using fallback estimate)');
  }

  // Trim to 2-4 reasons (prioritize positives, then negatives)
  return reasons.slice(0, 4);
}

/**
 * Fill lineup with starters based on position counts
 * @param {Array} scoredPlayers - All players with scores and tiers
 * @param {Object} positionCounts - Roster slot requirements
 * @returns {Object} { starters, bench }
 */
/**
 * Fill lineup with starters vs bench based on ACTUAL Yahoo lineup
 * (respects user's actual starting positions)
 * @param {Array} scoredPlayers - All players with scores
 * @returns {Object} { starters, bench }
 */
export function fillLineupFromActual(scoredPlayers) {
  const starters = [];
  const bench = [];

  for (const player of scoredPlayers) {
    // Use the 'slot' from Yahoo API to determine actual lineup
    if (player.slot === 'BN' || player.slot === 'IR') {
      bench.push({ ...player });
    } else {
      // QB, RB, WR, TE, FLEX, K, DEF, etc.
      starters.push({ ...player });
    }
  }

  return { starters, bench };
}

/**
 * Fill lineup with optimal starters (highest scoring players)
 * (ignores user's actual lineup, calculates best possible)
 * @param {Array} scoredPlayers - All players with scores
 * @param {Object} positionCounts - Required positions (QB: 1, RB: 2, etc.)
 * @returns {Object} { starters, bench }
 */
export function fillLineup(scoredPlayers, positionCounts) {
  const starters = [];
  const bench = [];

  // Sort players by score (descending)
  const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score);

  // Track filled slots
  const filled = {};
  for (const pos in positionCounts) {
    filled[pos] = 0;
  }

  for (const player of sorted) {
    const pos = player.position;
    const needed = positionCounts[pos] || 0;

    if (filled[pos] < needed) {
      starters.push({ ...player, slot: pos });
      filled[pos]++;
    } else {
      bench.push({ ...player, slot: 'BN' });
    }
  }

  return { starters, bench };
}

/**
 * Suggest FLEX swaps (bench players better than starters)
 * @param {Array} starters - Current starting lineup
 * @param {Array} bench - Current bench players
 * @returns {Array} Suggested swaps (up to 3)
 */
export function tryFlexSwaps(starters, bench) {
  const swaps = [];

  // Find FLEX starters (RB, WR, TE in FLEX slot)
  const flexStarters = starters.filter(p => 
    (p.position === 'RB' || p.position === 'WR' || p.position === 'TE') && p.slot === 'FLEX'
  );

  // Find bench players eligible for FLEX
  const flexBench = bench.filter(p => 
    p.position === 'RB' || p.position === 'WR' || p.position === 'TE'
  );

  // Sort by score
  flexStarters.sort((a, b) => a.score - b.score); // Lowest first
  flexBench.sort((a, b) => b.score - a.score);     // Highest first

  // Suggest swaps if bench player is >1.0 pt better
  for (const benchPlayer of flexBench) {
    for (const starterPlayer of flexStarters) {
      if (benchPlayer.score - starterPlayer.score > 1.0) {
        swaps.push({
          action: 'swap',
          out: starterPlayer.name,
          in: benchPlayer.name,
          improvement: (benchPlayer.score - starterPlayer.score).toFixed(1)
        });
      }
    }
  }

  // Return up to 3 swaps
  return swaps.slice(0, 3);
}

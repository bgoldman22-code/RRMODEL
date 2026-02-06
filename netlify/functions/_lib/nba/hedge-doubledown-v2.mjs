/**
 * NBA Elite V2 - Advanced Hedge & Double Down System (V2)
 * 
 * Intelligent hedge and double-down generation with EV-awareness.
 * Only applies to Spread + Moneyline markets (NOT team totals).
 * 
 * HEDGE: Opposite outcome insurance (only when EV-justified)
 * DOUBLE DOWN: Same outcome kicker (only when high confidence + edge)
 * 
 * Key Improvements (V2):
 * - EV-aware hedging (hedges must be +EV OR small stake tail risk reduction)
 * - Market-specific double-down mapping (underdog spread → dog ML, etc.)
 * - Proper juice constraints (no ML worse than -220 for double downs)
 * - Gating matrix with confidence + edge + market buckets
 * - Stake sizing scales with odds (15-30% sprinkle)
 */

// =============================================================================
// CONSTANTS & GATING LOGIC
// =============================================================================

export const HEDGE_GATES = {
  // Edge requirements
  MIN_PRIMARY_EDGE: 3,          // Don't hedge if primary edge < 3%
  MAX_PRIMARY_EDGE: 7,          // Don't hedge if primary edge > 7% (too strong = no hedge needed)
  
  // EV constraints
  MIN_HEDGE_EV: -0.15,          // Hedge can be slightly -EV if small stake
  MAX_HEDGE_JUICE: -240,        // Never hedge with ML worse than -240
  
  // Stake constraints
  MAX_HEDGE_STAKE_PCT: 0.25,    // Hedge stake max 25% of primary
  MIN_HEDGE_STAKE_PCT: 0.10,    // Hedge stake min 10% of primary
  
  // Confidence requirements
  CONFIDENCE_REQUIRED: ['LOW', 'MEDIUM']  // Only hedge low/medium confidence
};

export const DOUBLEDOWN_GATES = {
  // Edge requirements
  MIN_PRIMARY_EDGE: 8,          // Need 8%+ edge for double down
  
  // Juice constraints for ML double downs
  MAX_FAV_ML_JUICE: -220,       // Don't double down fav ML if worse than -220
  MAX_FAV_ML_JUICE_STRICT: -200, // For favorite spread → ML double down
  
  // Sprinkle sizing
  MIN_SPRINKLE_PCT: 0.15,       // Sprinkle at least 15% of primary
  MAX_SPRINKLE_PCT: 0.30,       // Sprinkle at most 30% of primary
  LONG_ODDS_THRESHOLD: 250,     // Allow higher sprinkle for +250 or better
  
  // Confidence requirements  
  CONFIDENCE_REQUIRED: ['HIGH'] // Only double down on high confidence
};

// Total exposure cap per game
export const MAX_TOTAL_EXPOSURE_MULTIPLIER = 1.6; // Total stake per game max 1.6x primary

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate expected value of a bet
 * @param {number} winProb - Win probability (0-1)
 * @param {number} odds - American odds
 * @param {number} stake - Bet stake in units
 * @returns {number} Expected value in units
 */
export function calculateEV(winProb, odds, stake = 1) {
  const decimal = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  const profit = (decimal - 1) * stake;
  return (winProb * profit) - ((1 - winProb) * stake);
}

/**
 * Convert American odds to implied probability
 */
export function oddsToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Convert implied probability to American odds
 */
export function probToOdds(prob) {
  if (prob >= 0.5) {
    return Math.round(-100 * prob / (1 - prob));
  } else {
    return Math.round(100 * (1 - prob) / prob);
  }
}

/**
 * Check if odds are too juiced (expensive)
 * @param {number} odds - American odds
 * @param {number} threshold - Threshold (default -220)
 * @returns {boolean} True if too juiced
 */
export function isTooJuiced(odds, threshold = -220) {
  return odds < 0 && odds <= threshold;
}

/**
 * Parse spread value from pick string
 * @param {string} pick - Pick string like "LAL -5.5" or "BOS +3"
 * @returns {number|null} Spread value or null
 */
export function parseSpreadFromPick(pick) {
  const match = pick.match(/([-+]?\d+\.?\d*)\s*$/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract team abbreviation from pick
 */
export function parseTeamFromPick(pick) {
  const parts = pick.split(' ');
  return parts[0];
}

/**
 * Determine if a bet is on the favorite or underdog
 */
export function isFavorite(opportunity) {
  const market = opportunity.market?.toLowerCase();
  
  if (market === 'spread') {
    const spreadValue = parseSpreadFromPick(opportunity.pick);
    return spreadValue !== null && spreadValue < 0;
  } else if (market === 'moneyline') {
    return opportunity.odds < 0;
  }
  return false;
}

/**
 * Get the opposing team from game context
 */
export function getOpposingTeam(pickTeam, gameContext) {
  const { home, away } = gameContext;
  const homeAbbr = home?.abbreviation || home?.team?.abbreviation;
  const awayAbbr = away?.abbreviation || away?.team?.abbreviation;
  
  return pickTeam === homeAbbr ? awayAbbr : homeAbbr;
}

/**
 * Check if pick team is home team
 */
export function isHomeTeam(pickTeam, gameContext) {
  const { home } = gameContext;
  const homeAbbr = home?.abbreviation || home?.team?.abbreviation;
  return pickTeam === homeAbbr;
}

// =============================================================================
// HEDGE LOGIC
// =============================================================================

/**
 * Check if hedge should be offered based on gating rules
 */
function shouldOfferHedge(primary, hedgeCandidate) {
  const debug = [];
  
  // Gate 1: Primary must have right confidence level
  const confidence = primary.confidence?.toUpperCase() || '';
  if (!HEDGE_GATES.CONFIDENCE_REQUIRED.includes(confidence)) {
    return { offer: false, reason: 'primary_confidence_too_high', debug };
  }
  debug.push(`✓ Confidence ${confidence} in allowed range`);
  
  // Gate 2: Primary edge must be in acceptable range (3-7%)
  const primaryEdge = parseFloat(primary.edgePercent) || 0;
  if (primaryEdge < HEDGE_GATES.MIN_PRIMARY_EDGE) {
    return { offer: false, reason: 'primary_edge_too_low', debug };
  }
  if (primaryEdge > HEDGE_GATES.MAX_PRIMARY_EDGE) {
    return { offer: false, reason: 'primary_edge_too_high_no_hedge_needed', debug };
  }
  debug.push(`✓ Primary edge ${primaryEdge.toFixed(1)}% in hedge range`);
  
  // Gate 3: Hedge juice must not be too extreme
  if (isTooJuiced(hedgeCandidate.odds, HEDGE_GATES.MAX_HEDGE_JUICE)) {
    return { offer: false, reason: 'hedge_juice_too_high', debug };
  }
  debug.push(`✓ Hedge odds ${hedgeCandidate.odds} acceptable`);
  
  // Gate 4: Calculate hedge stake and EV
  const hedgeStakePct = HEDGE_GATES.MAX_HEDGE_STAKE_PCT;
  const hedgeStake = (primary.units || 1) * hedgeStakePct;
  const hedgeWinProb = hedgeCandidate.winProb || oddsToProb(hedgeCandidate.odds);
  const hedgeEV = calculateEV(hedgeWinProb, hedgeCandidate.odds, hedgeStake);
  
  // Hedge must be either:
  // 1. Positive EV, OR
  // 2. Small stake (≤25%) with minimal EV cost (> -0.15U per unit staked)
  const hedgeEVPerUnit = hedgeEV / hedgeStake;
  const isPositiveEV = hedgeEV > 0;
  const isAcceptableNegativeEV = hedgeEVPerUnit >= HEDGE_GATES.MIN_HEDGE_EV;
  
  if (!isPositiveEV && !isAcceptableNegativeEV) {
    return { 
      offer: false, 
      reason: 'hedge_too_negative_ev', 
      hedgeEV,
      hedgeEVPerUnit,
      debug 
    };
  }
  debug.push(`✓ Hedge EV ${hedgeEV.toFixed(2)}U (${(hedgeEVPerUnit * 100).toFixed(1)}% per unit)`);
  
  return { 
    offer: true, 
    hedgeEV,
    hedgeEVPerUnit,
    hedgeStake: Math.round(hedgeStake * 10) / 10,
    hedgeWinProb,
    isPositiveEV,
    reason: isPositiveEV ? 'hedge_is_positive_ev' : 'small_stake_tail_risk_reduction',
    debug
  };
}

/**
 * Find available hedge market for a primary bet
 * 
 * Hedge Logic:
 * - Primary favorite spread → hedge with underdog spread (opposite team, same market)
 * - Primary underdog spread → hedge with favorite ML (opposite team wins outright)
 * - Primary favorite ML → hedge with underdog spread (protects against close loss)
 * - Primary underdog ML → NO HEDGE (already max risk, hedge doesn't help)
 */
function findHedgeMarket(primary, allOpportunities, gameContext) {
  const primaryMarket = primary.market?.toLowerCase();
  const primaryIsFav = isFavorite(primary);
  const pickTeam = parseTeamFromPick(primary.pick);
  const opposingTeam = getOpposingTeam(pickTeam, gameContext);
  
  // Underdog ML has no good hedge (you're already betting on the upset)
  if (primaryMarket === 'moneyline' && !primaryIsFav) {
    return { hedgeCandidate: null, reason: 'underdog_ml_no_hedge' };
  }
  
  let hedgeMarket, hedgeTeam;
  
  if (primaryMarket === 'spread') {
    if (primaryIsFav) {
      // Favorite spread → hedge with opposite team's spread (underdog)
      hedgeMarket = 'spread';
      hedgeTeam = opposingTeam;
    } else {
      // Underdog spread → hedge with favorite ML (they win outright, you lose spread)
      hedgeMarket = 'moneyline';
      hedgeTeam = opposingTeam;
    }
  } else if (primaryMarket === 'moneyline') {
    // Favorite ML → hedge with underdog spread
    hedgeMarket = 'spread';
    hedgeTeam = opposingTeam;
  }
  
  // Find matching opportunity
  const hedgeCandidate = allOpportunities.find(opp => {
    const oppMarket = opp.market?.toLowerCase();
    const oppTeam = parseTeamFromPick(opp.pick);
    return oppMarket === hedgeMarket && oppTeam === hedgeTeam;
  });
  
  if (!hedgeCandidate) {
    // Create synthetic hedge from vegas lines if available
    return { hedgeCandidate: null, reason: 'no_matching_opportunity' };
  }
  
  return { hedgeCandidate, hedgeMarket, hedgeTeam };
}

/**
 * Generate hedge bet for a primary bet
 */
export function generateHedge(primary, allOpportunities, gameContext, vegasLines = {}) {
  // Only apply to spread and moneyline
  const primaryMarket = primary.market?.toLowerCase();
  if (primaryMarket !== 'spread' && primaryMarket !== 'moneyline') {
    return null;
  }
  
  // Find hedge market
  const { hedgeCandidate, reason } = findHedgeMarket(primary, allOpportunities, gameContext);
  
  if (!hedgeCandidate) {
    // Try to create hedge from vegas lines
    const syntheticHedge = createSyntheticHedge(primary, gameContext, vegasLines);
    if (!syntheticHedge) {
      return null;
    }
    
    const hedgeCheck = shouldOfferHedge(primary, syntheticHedge);
    if (!hedgeCheck.offer) {
      console.log(`[Hedge] Skipped for ${primary.pick}: ${hedgeCheck.reason}`);
      return null;
    }
    
    return {
      ...syntheticHedge,
      betType: 'HEDGE',
      units: hedgeCheck.hedgeStake,
      expectedValue: hedgeCheck.hedgeEV,
      reason: hedgeCheck.reason,
      notes: hedgeCheck.isPositiveEV 
        ? `Hedge is +EV (${hedgeCheck.hedgeEV.toFixed(2)}U)` 
        : `Small stake hedge reduces tail risk`,
      primaryUnits: primary.units,
      hedgeStakePct: (hedgeCheck.hedgeStake / primary.units * 100).toFixed(0) + '%'
    };
  }
  
  // Check if hedge should be offered
  const hedgeCheck = shouldOfferHedge(primary, hedgeCandidate);
  
  if (!hedgeCheck.offer) {
    console.log(`[Hedge] Skipped for ${primary.pick}: ${hedgeCheck.reason}`);
    return null;
  }
  
  return {
    market: hedgeCandidate.market,
    pick: hedgeCandidate.pick,
    odds: hedgeCandidate.odds,
    book: hedgeCandidate.book || 'consensus',
    units: hedgeCheck.hedgeStake,
    edgePercent: hedgeCandidate.edgePercent,
    winProb: hedgeCheck.hedgeWinProb,
    expectedValue: hedgeCheck.hedgeEV,
    betType: 'HEDGE',
    reason: hedgeCheck.reason,
    notes: hedgeCheck.isPositiveEV 
      ? `Hedge is +EV (${hedgeCheck.hedgeEV.toFixed(2)}U)` 
      : `Small stake hedge reduces tail risk`,
    primaryUnits: primary.units,
    hedgeStakePct: (hedgeCheck.hedgeStake / primary.units * 100).toFixed(0) + '%'
  };
}

/**
 * Create synthetic hedge from vegas lines when no matching opportunity exists
 */
function createSyntheticHedge(primary, gameContext, vegasLines) {
  const primaryMarket = primary.market?.toLowerCase();
  const primaryIsFav = isFavorite(primary);
  const pickTeam = parseTeamFromPick(primary.pick);
  const isHome = isHomeTeam(pickTeam, gameContext);
  
  if (primaryMarket === 'spread' && !primaryIsFav) {
    // Underdog spread → hedge with favorite ML
    const hedgeOdds = isHome ? vegasLines.moneyline?.away : vegasLines.moneyline?.home;
    const hedgeTeam = getOpposingTeam(pickTeam, gameContext);
    
    if (!hedgeOdds) return null;
    
    return {
      market: 'Moneyline',
      pick: `${hedgeTeam} ML`,
      odds: hedgeOdds,
      winProb: oddsToProb(hedgeOdds) * 0.95, // Slight discount for vig
      book: vegasLines.moneyline?.book || 'consensus'
    };
  }
  
  if (primaryMarket === 'moneyline' && primaryIsFav) {
    // Favorite ML → hedge with underdog spread
    const hedgeSpread = isHome ? vegasLines.spread?.away : vegasLines.spread?.home;
    const hedgeOdds = isHome ? vegasLines.spread?.awayOdds : vegasLines.spread?.homeOdds;
    const hedgeTeam = getOpposingTeam(pickTeam, gameContext);
    
    if (!hedgeSpread || !hedgeOdds) return null;
    
    return {
      market: 'Spread',
      pick: `${hedgeTeam} ${hedgeSpread >= 0 ? '+' : ''}${hedgeSpread}`,
      odds: hedgeOdds,
      winProb: 0.5, // Spreads are ~50/50
      book: vegasLines.spread?.book || 'consensus'
    };
  }
  
  return null;
}

// =============================================================================
// DOUBLE DOWN LOGIC
// =============================================================================

/**
 * Check if double down should be offered based on gating rules
 */
function shouldOfferDoubleDown(primary, doubleDownCandidate) {
  const debug = [];
  
  // Gate 1: Primary must be HIGH confidence
  const confidence = primary.confidence?.toUpperCase() || '';
  if (!DOUBLEDOWN_GATES.CONFIDENCE_REQUIRED.includes(confidence)) {
    return { offer: false, reason: 'confidence_not_high', debug };
  }
  debug.push(`✓ Confidence ${confidence} = HIGH`);
  
  // Gate 2: Primary edge must meet threshold (≥8%)
  const primaryEdge = parseFloat(primary.edgePercent) || 0;
  if (primaryEdge < DOUBLEDOWN_GATES.MIN_PRIMARY_EDGE) {
    return { offer: false, reason: 'edge_too_low', debug };
  }
  debug.push(`✓ Primary edge ${primaryEdge.toFixed(1)}% ≥ 8%`);
  
  // Gate 3: If double down is favorite ML, check juice limit
  const ddMarket = doubleDownCandidate.market?.toLowerCase();
  const ddIsFavML = ddMarket === 'moneyline' && doubleDownCandidate.odds < 0;
  
  if (ddIsFavML && isTooJuiced(doubleDownCandidate.odds, DOUBLEDOWN_GATES.MAX_FAV_ML_JUICE)) {
    return { offer: false, reason: 'ml_too_juiced', debug };
  }
  if (ddIsFavML) {
    debug.push(`✓ Fav ML odds ${doubleDownCandidate.odds} > -220`);
  }
  
  // Gate 4: Calculate sprinkle amount based on odds
  const isLongOdds = doubleDownCandidate.odds >= DOUBLEDOWN_GATES.LONG_ODDS_THRESHOLD;
  const sprinklePct = isLongOdds 
    ? DOUBLEDOWN_GATES.MAX_SPRINKLE_PCT    // 30% for +250 or better
    : doubleDownCandidate.odds > 150
      ? 0.25                                // 25% for +150 to +249
      : doubleDownCandidate.odds > 0
        ? 0.20                              // 20% for +100 to +149
        : DOUBLEDOWN_GATES.MIN_SPRINKLE_PCT; // 15% for favorites
  
  const sprinkleStake = Math.round((primary.units || 1) * sprinklePct * 10) / 10;
  
  debug.push(`✓ Sprinkle: ${(sprinklePct * 100).toFixed(0)}% = ${sprinkleStake}U`);
  
  // Calculate EV of double down
  const ddWinProb = doubleDownCandidate.winProb || 
    (doubleDownCandidate.p_model) ||
    oddsToProb(doubleDownCandidate.odds) * 1.05; // Slight boost if we're betting it
  const ddEV = calculateEV(ddWinProb, doubleDownCandidate.odds, sprinkleStake);
  
  return {
    offer: true,
    sprinkleStake,
    sprinklePct,
    doubleDownEV: ddEV,
    reason: 'convex_upside',
    debug
  };
}

/**
 * Find appropriate double down market for a primary bet
 * 
 * Double Down Logic (same outcome, different market):
 * - Underdog spread → underdog ML (BEST: classic kicker for big upside)
 * - Favorite spread → favorite ML (only if not too juiced <-220)
 * - Favorite ML → favorite spread (same outcome, better payout)
 * - Underdog ML → underdog spread (safer companion)
 */
function findDoubleDownMarket(primary, allOpportunities, gameContext) {
  const primaryMarket = primary.market?.toLowerCase();
  const primaryIsFav = isFavorite(primary);
  const pickTeam = parseTeamFromPick(primary.pick);
  
  let ddMarket, ddTeam;
  
  if (primaryMarket === 'spread') {
    // Spread → ML double down (same team)
    ddMarket = 'moneyline';
    ddTeam = pickTeam;
  } else if (primaryMarket === 'moneyline') {
    // ML → Spread double down (same team)
    ddMarket = 'spread';
    ddTeam = pickTeam;
  }
  
  // Find matching opportunity
  const ddCandidate = allOpportunities.find(opp => {
    const oppMarket = opp.market?.toLowerCase();
    const oppTeam = parseTeamFromPick(opp.pick);
    return oppMarket === ddMarket && oppTeam === ddTeam;
  });
  
  if (!ddCandidate) {
    return { ddCandidate: null, reason: 'no_matching_opportunity' };
  }
  
  // Additional validation for favorite spread → ML
  if (primaryMarket === 'spread' && primaryIsFav) {
    // Check if ML is too juiced for favorite spread → ML double down
    if (ddCandidate.odds < 0 && isTooJuiced(ddCandidate.odds, DOUBLEDOWN_GATES.MAX_FAV_ML_JUICE_STRICT)) {
      return { ddCandidate: null, reason: 'fav_ml_too_juiced_for_dd' };
    }
  }
  
  return { ddCandidate, ddMarket, ddTeam };
}

/**
 * Generate double-down bet for a primary bet
 */
export function generateDoubleDown(primary, allOpportunities, gameContext, vegasLines = {}) {
  // Only apply to spread and moneyline
  const primaryMarket = primary.market?.toLowerCase();
  if (primaryMarket !== 'spread' && primaryMarket !== 'moneyline') {
    return null;
  }
  
  // Find double down market
  const { ddCandidate, reason } = findDoubleDownMarket(primary, allOpportunities, gameContext);
  
  if (!ddCandidate) {
    // Try to create synthetic double down from vegas lines
    const syntheticDD = createSyntheticDoubleDown(primary, gameContext, vegasLines);
    if (!syntheticDD) {
      return null;
    }
    
    const ddCheck = shouldOfferDoubleDown(primary, syntheticDD);
    if (!ddCheck.offer) {
      console.log(`[DoubleDown] Skipped for ${primary.pick}: ${ddCheck.reason}`);
      return null;
    }
    
    return {
      ...syntheticDD,
      betType: 'DOUBLE_DOWN',
      units: ddCheck.sprinkleStake,
      expectedValue: ddCheck.doubleDownEV,
      reason: ddCheck.reason,
      notes: `${(ddCheck.sprinklePct * 100).toFixed(0)}% sprinkle for convex upside`,
      primaryUnits: primary.units,
      sprinklePct: (ddCheck.sprinklePct * 100).toFixed(0) + '%'
    };
  }
  
  // Check if double down should be offered
  const ddCheck = shouldOfferDoubleDown(primary, ddCandidate);
  
  if (!ddCheck.offer) {
    console.log(`[DoubleDown] Skipped for ${primary.pick}: ${ddCheck.reason}`);
    return null;
  }
  
  return {
    market: ddCandidate.market,
    pick: ddCandidate.pick,
    odds: ddCandidate.odds,
    book: ddCandidate.book || 'consensus',
    units: ddCheck.sprinkleStake,
    edgePercent: ddCandidate.edgePercent,
    winProb: ddCandidate.winProb || ddCandidate.p_model,
    expectedValue: ddCheck.doubleDownEV,
    betType: 'DOUBLE_DOWN',
    reason: ddCheck.reason,
    notes: `${(ddCheck.sprinklePct * 100).toFixed(0)}% sprinkle for convex upside`,
    primaryUnits: primary.units,
    sprinklePct: (ddCheck.sprinklePct * 100).toFixed(0) + '%'
  };
}

/**
 * Create synthetic double down from vegas lines when no matching opportunity exists
 */
function createSyntheticDoubleDown(primary, gameContext, vegasLines) {
  const primaryMarket = primary.market?.toLowerCase();
  const primaryIsFav = isFavorite(primary);
  const pickTeam = parseTeamFromPick(primary.pick);
  const isHome = isHomeTeam(pickTeam, gameContext);
  
  if (primaryMarket === 'spread') {
    // Spread → ML double down
    const ddOdds = isHome ? vegasLines.moneyline?.home : vegasLines.moneyline?.away;
    
    if (!ddOdds) return null;
    
    // Check juice for favorite spread → ML
    if (primaryIsFav && ddOdds < 0 && isTooJuiced(ddOdds, DOUBLEDOWN_GATES.MAX_FAV_ML_JUICE_STRICT)) {
      return null;
    }
    
    return {
      market: 'Moneyline',
      pick: `${pickTeam} ML`,
      odds: ddOdds,
      winProb: primary.p_model || oddsToProb(ddOdds) * 1.05,
      book: vegasLines.moneyline?.book || 'consensus'
    };
  }
  
  if (primaryMarket === 'moneyline') {
    // ML → Spread double down
    const ddSpread = isHome ? vegasLines.spread?.home : vegasLines.spread?.away;
    const ddOdds = isHome ? vegasLines.spread?.homeOdds : vegasLines.spread?.awayOdds;
    
    if (!ddSpread || !ddOdds) return null;
    
    return {
      market: 'Spread',
      pick: `${pickTeam} ${ddSpread >= 0 ? '+' : ''}${ddSpread}`,
      odds: ddOdds,
      winProb: 0.5, // Spreads are ~50/50
      book: vegasLines.spread?.book || 'consensus'
    };
  }
  
  return null;
}

// =============================================================================
// MAIN ENTRY POINTS
// =============================================================================

/**
 * Generate hedge and double-down bets for a primary opportunity
 * 
 * @param {Object} primary - Primary bet opportunity
 * @param {Array} allOpportunities - All opportunities for this game
 * @param {Object} gameContext - Game context { home, away }
 * @param {Object} vegasLines - Vegas lines for fallback
 * @returns {Object} { hedge, doubleDown, totalExposure, notes, stakeGuidance }
 */
export function generateHedgeAndDoubleDown(primary, allOpportunities, gameContext, vegasLines = {}) {
  const hedge = generateHedge(primary, allOpportunities, gameContext, vegasLines);
  const doubleDown = generateDoubleDown(primary, allOpportunities, gameContext, vegasLines);
  
  // Calculate total exposure
  const primaryUnits = primary.units || 0;
  const hedgeUnits = hedge?.units || 0;
  const ddUnits = doubleDown?.units || 0;
  let totalExposure = primaryUnits + hedgeUnits + ddUnits;
  
  // Check total exposure cap
  const maxAllowed = primaryUnits * MAX_TOTAL_EXPOSURE_MULTIPLIER;
  let cappedHedge = hedge;
  let cappedDD = doubleDown;
  
  if (totalExposure > maxAllowed && primaryUnits > 0) {
    // Scale down hedge and DD proportionally
    const overage = totalExposure - maxAllowed;
    const secondaryTotal = hedgeUnits + ddUnits;
    const scale = Math.max(0, 1 - (overage / secondaryTotal));
    
    console.log(`[Hedge/DD] Exposure ${totalExposure.toFixed(1)}U > max ${maxAllowed.toFixed(1)}U, scaling by ${(scale * 100).toFixed(0)}%`);
    
    if (scale <= 0) {
      cappedHedge = null;
      cappedDD = null;
    } else {
      if (cappedHedge) cappedHedge.units = Math.round(hedgeUnits * scale * 10) / 10;
      if (cappedDD) cappedDD.units = Math.round(ddUnits * scale * 10) / 10;
    }
    
    totalExposure = primaryUnits + (cappedHedge?.units || 0) + (cappedDD?.units || 0);
  }
  
  // Generate notes
  const notes = [];
  if (cappedHedge) notes.push(`Hedge: ${cappedHedge.reason}`);
  if (cappedDD) notes.push(`Double Down: ${cappedDD.reason}`);
  
  // Generate stake guidance
  const stakeGuidance = [
    `Primary ${primaryUnits.toFixed(1)}U`,
    cappedHedge ? `Hedge ${cappedHedge.units.toFixed(1)}U` : null,
    cappedDD ? `DD ${cappedDD.units.toFixed(1)}U` : null
  ].filter(Boolean).join(', ');
  
  return {
    hedge: cappedHedge,
    doubleDown: cappedDD,
    totalExposure,
    notes: notes.join('; ') || null,
    stakeGuidance
  };
}

/**
 * Apply hedge/double-down logic to all opportunities for a game
 * 
 * @param {Array} opportunities - All betting opportunities for a game
 * @param {Object} gameContext - Game context { home, away }
 * @param {Object} vegasLines - Vegas lines for fallback
 * @returns {Array} Enhanced opportunities with hedgeBet/doubleDownBet fields
 */
export function applyHedgingSystem(opportunities, gameContext, vegasLines = {}) {
  if (!opportunities || opportunities.length === 0) {
    return opportunities;
  }
  
  return opportunities.map(opp => {
    // Only apply to spread and moneyline
    const market = opp.market?.toLowerCase();
    if (market !== 'spread' && market !== 'moneyline') {
      return opp;
    }
    
    // Skip track-only bets
    if (opp.isTrackOnly || opp.units === 0) {
      return opp;
    }
    
    // Generate hedge/double-down
    const hedging = generateHedgeAndDoubleDown(opp, opportunities, gameContext, vegasLines);
    
    return {
      ...opp,
      primaryBet: {
        market: opp.market,
        pick: opp.pick,
        odds: opp.odds,
        units: opp.units,
        edgePercent: opp.edgePercent,
        confidence: opp.confidence
      },
      hedgeBet: hedging.hedge,
      doubleDownBet: hedging.doubleDown,
      totalExposure: hedging.totalExposure,
      hedgingNotes: hedging.notes,
      stakeGuidance: hedging.stakeGuidance
    };
  });
}

export default {
  generateHedge,
  generateDoubleDown,
  generateHedgeAndDoubleDown,
  applyHedgingSystem,
  calculateEV,
  oddsToProb,
  probToOdds,
  isTooJuiced,
  isFavorite,
  HEDGE_GATES,
  DOUBLEDOWN_GATES
};

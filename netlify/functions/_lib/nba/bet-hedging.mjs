/**
 * NBA Elite V2 - Bet Hedging & Double Down System
 * 
 * Intelligent hedge and double-down generation with EV-awareness.
 * Only applies to Spread + Moneyline markets.
 * 
 * HEDGE: Opposite outcome insurance (only when EV-justified)
 * DOUBLE DOWN: Same outcome different market (only when high confidence + edge)
 */

// Constants for gating logic
const HEDGE_GATES = {
  MIN_PRIMARY_EDGE: 3,        // Don't hedge if primary edge < 3%
  MAX_PRIMARY_EDGE: 7,        // Don't hedge if primary edge > 7% (too strong)
  MIN_HEDGE_EV: -0.2,         // Hedge must not be worse than -0.2U EV
  MAX_HEDGE_JUICE: -240,      // Don't hedge if juice worse than -240
  MAX_HEDGE_STAKE_PCT: 0.25,  // Hedge stake max 25% of primary
  CONFIDENCE_REQUIRED: ['LOW', 'MEDIUM']  // Only hedge low/medium confidence
};

const DOUBLEDOWN_GATES = {
  MIN_PRIMARY_EDGE: 8,        // Need 8%+ edge for double down
  MAX_FAV_ML_JUICE: -220,     // Don't double down fav ML if worse than -220
  MIN_SPRINKLE_PCT: 0.15,     // Sprinkle at least 15% of primary
  MAX_SPRINKLE_PCT: 0.30,     // Sprinkle at most 30% of primary
  LONG_ODDS_THRESHOLD: 250,   // Allow higher sprinkle for +250 or better
  CONFIDENCE_REQUIRED: ['HIGH'] // Only double down on high confidence
};

const MAX_TOTAL_EXPOSURE_MULTIPLIER = 1.6; // Total stake per game max 1.6x primary

/**
 * Calculate expected value of a bet
 * @param {number} winProb - Win probability (0-1)
 * @param {number} odds - American odds
 * @param {number} stake - Bet stake in units
 * @returns {number} Expected value in units
 */
function calculateEV(winProb, odds, stake) {
  const decimal = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  const profit = (decimal - 1) * stake;
  return (winProb * profit) - ((1 - winProb) * stake);
}

/**
 * Convert American odds to implied probability
 */
function oddsToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Determine if an opportunity is favorite or underdog
 */
function isFavorite(opportunity) {
  if (opportunity.market === 'spread') {
    // Negative spread = favorite
    const spreadValue = parseFloat(opportunity.pick.match(/-?\d+\.?\d*/)?.[0] || '0');
    return spreadValue < 0;
  } else if (opportunity.market === 'moneyline') {
    // Negative odds = favorite
    return opportunity.odds < 0;
  }
  return false;
}

/**
 * Check if hedge should be offered
 */
function shouldOfferHedge(primary, hedgeCandidate, game) {
  // Gate 1: Primary must have right confidence level
  if (!HEDGE_GATES.CONFIDENCE_REQUIRED.includes(primary.confidence)) {
    return { offer: false, reason: 'primary_confidence_too_high' };
  }
  
  // Gate 2: Primary edge must be in acceptable range
  const primaryEdge = parseFloat(primary.edgePercent) || 0;
  if (primaryEdge < HEDGE_GATES.MIN_PRIMARY_EDGE) {
    return { offer: false, reason: 'primary_edge_too_low' };
  }
  if (primaryEdge > HEDGE_GATES.MAX_PRIMARY_EDGE) {
    return { offer: false, reason: 'primary_edge_too_high' };
  }
  
  // Gate 3: Hedge juice must not be too extreme
  if (hedgeCandidate.odds < HEDGE_GATES.MAX_HEDGE_JUICE) {
    return { offer: false, reason: 'hedge_juice_too_high' };
  }
  
  // Gate 4: Hedge EV check (must not be heavily -EV)
  const hedgeWinProb = parseFloat(hedgeCandidate.winProb) || oddsToProb(hedgeCandidate.odds);
  const hedgeStake = primary.units * HEDGE_GATES.MAX_HEDGE_STAKE_PCT;
  const hedgeEV = calculateEV(hedgeWinProb, hedgeCandidate.odds, hedgeStake);
  
  if (hedgeEV < HEDGE_GATES.MIN_HEDGE_EV) {
    return { offer: false, reason: 'hedge_too_negative_ev', hedgeEV };
  }
  
  return { 
    offer: true, 
    hedgeEV,
    hedgeStake,
    reason: 'tail_risk_reduction'
  };
}

/**
 * Check if double down should be offered
 */
function shouldOfferDoubleDown(primary, doubleDownCandidate) {
  // Gate 1: Primary must be HIGH confidence
  if (!DOUBLEDOWN_GATES.CONFIDENCE_REQUIRED.includes(primary.confidence)) {
    return { offer: false, reason: 'confidence_not_high' };
  }
  
  // Gate 2: Primary edge must meet threshold
  const primaryEdge = parseFloat(primary.edgePercent) || 0;
  if (primaryEdge < DOUBLEDOWN_GATES.MIN_PRIMARY_EDGE) {
    return { offer: false, reason: 'edge_too_low' };
  }
  
  // Gate 3: If double down is favorite ML, check juice limit
  if (doubleDownCandidate.market === 'moneyline' && 
      doubleDownCandidate.odds < 0 && 
      doubleDownCandidate.odds < DOUBLEDOWN_GATES.MAX_FAV_ML_JUICE) {
    return { offer: false, reason: 'ml_too_juiced' };
  }
  
  // Gate 4: Calculate sprinkle amount
  const isLongOdds = doubleDownCandidate.odds >= DOUBLEDOWN_GATES.LONG_ODDS_THRESHOLD;
  const sprinklePct = isLongOdds 
    ? DOUBLEDOWN_GATES.MAX_SPRINKLE_PCT 
    : (DOUBLEDOWN_GATES.MIN_SPRINKLE_PCT + DOUBLEDOWN_GATES.MAX_SPRINKLE_PCT) / 2; // ~22.5%
  
  const sprinkleStake = primary.units * sprinklePct;
  
  return {
    offer: true,
    sprinkleStake,
    sprinklePct,
    reason: 'convex_upside'
  };
}

/**
 * Find the appropriate hedge for a primary bet
 * 
 * Hedge Logic:
 * - Primary is favorite spread → hedge is underdog ML
 * - Primary is favorite ML → hedge is underdog spread
 * - Primary is underdog spread → hedge is favorite ML
 * - Primary is underdog ML → no hedge (already max risk)
 */
function findHedge(primary, allOpportunities, game) {
  const primaryIsFav = isFavorite(primary);
  const primaryMarket = primary.market;
  
  // Underdog ML has no good hedge (you're already on the upset)
  if (primaryMarket === 'moneyline' && !primaryIsFav) {
    return null;
  }
  
  // Determine what to look for
  let hedgeMarket, hedgeShouldBeFav;
  
  if (primaryMarket === 'spread') {
    // Spread bet → hedge with ML
    hedgeMarket = 'moneyline';
    hedgeShouldBeFav = !primaryIsFav; // Opposite team
  } else {
    // ML bet → hedge with spread
    hedgeMarket = 'spread';
    hedgeShouldBeFav = !primaryIsFav; // Opposite team
  }
  
  // Find matching opportunity
  const hedgeCandidate = allOpportunities.find(opp => {
    if (opp.market !== hedgeMarket) return false;
    const oppIsFav = isFavorite(opp);
    return oppIsFav === hedgeShouldBeFav;
  });
  
  if (!hedgeCandidate) return null;
  
  // Check if hedge should be offered
  const hedgeCheck = shouldOfferHedge(primary, hedgeCandidate, game);
  
  if (!hedgeCheck.offer) {
    console.log(`[Hedge] Not offering hedge for ${primary.pick}: ${hedgeCheck.reason}`);
    return null;
  }
  
  return {
    market: hedgeCandidate.market,
    pick: hedgeCandidate.pick,
    odds: hedgeCandidate.odds,
    units: hedgeCheck.hedgeStake,
    edgePercent: hedgeCandidate.edgePercent,
    expectedValue: hedgeCheck.hedgeEV,
    reason: hedgeCheck.reason,
    type: 'HEDGE'
  };
}

/**
 * Find the appropriate double down for a primary bet
 * 
 * Double Down Logic:
 * - Primary is underdog spread → double down is underdog ML (kicker)
 * - Primary is favorite spread → double down is favorite ML (if not too juiced) OR alt spread
 * - Primary is favorite ML → double down is favorite spread (better payout)
 * - Primary is underdog ML → double down is underdog spread (safer companion)
 */
function findDoubleDown(primary, allOpportunities) {
  const primaryIsFav = isFavorite(primary);
  const primaryMarket = primary.market;
  
  // Determine what to look for
  let doubleDownMarket, doubleDownShouldBeFav;
  
  if (primaryMarket === 'spread') {
    // Spread bet → double down with ML (same team)
    doubleDownMarket = 'moneyline';
    doubleDownShouldBeFav = primaryIsFav;
  } else {
    // ML bet → double down with spread (same team)
    doubleDownMarket = 'spread';
    doubleDownShouldBeFav = primaryIsFav;
  }
  
  // Find matching opportunity
  const doubleDownCandidate = allOpportunities.find(opp => {
    if (opp.market !== doubleDownMarket) return false;
    const oppIsFav = isFavorite(opp);
    return oppIsFav === doubleDownShouldBeFav;
  });
  
  if (!doubleDownCandidate) return null;
  
  // Check if double down should be offered
  const ddCheck = shouldOfferDoubleDown(primary, doubleDownCandidate);
  
  if (!ddCheck.offer) {
    console.log(`[DoubleDown] Not offering for ${primary.pick}: ${ddCheck.reason}`);
    return null;
  }
  
  return {
    market: doubleDownCandidate.market,
    pick: doubleDownCandidate.pick,
    odds: doubleDownCandidate.odds,
    units: ddCheck.sprinkleStake,
    edgePercent: doubleDownCandidate.edgePercent,
    sprinklePct: (ddCheck.sprinklePct * 100).toFixed(0) + '%',
    reason: ddCheck.reason,
    type: 'DOUBLE_DOWN'
  };
}

/**
 * Generate hedge and double-down bets for a primary opportunity
 * 
 * @param {Object} primary - Primary bet opportunity
 * @param {Array} allOpportunities - All opportunities for this game
 * @param {Object} game - Game data
 * @returns {Object} { hedge: {...} | null, doubleDown: {...} | null, totalExposure, notes }
 */
export function generateHedgeAndDoubleDown(primary, allOpportunities, game) {
  const hedge = findHedge(primary, allOpportunities, game);
  const doubleDown = findDoubleDown(primary, allOpportunities);
  
  // Calculate total exposure
  let totalExposure = primary.units;
  if (hedge) totalExposure += hedge.units;
  if (doubleDown) totalExposure += doubleDown.units;
  
  // Check total exposure cap
  const maxAllowed = primary.units * MAX_TOTAL_EXPOSURE_MULTIPLIER;
  if (totalExposure > maxAllowed) {
    console.warn(`[Hedge/DD] Total exposure ${totalExposure.toFixed(1)}U exceeds max ${maxAllowed.toFixed(1)}U, suppressing`);
    return {
      hedge: null,
      doubleDown: null,
      totalExposure: primary.units,
      notes: 'Hedge/double-down suppressed: exposure cap'
    };
  }
  
  // Generate notes
  const notes = [];
  if (hedge) notes.push(`Hedge: ${hedge.reason}`);
  if (doubleDown) notes.push(`Double down: ${doubleDown.reason}`);
  
  return {
    hedge,
    doubleDown,
    totalExposure,
    notes: notes.join('; ') || null
  };
}

/**
 * Apply hedge/double-down logic to all opportunities for a game
 * 
 * @param {Array} opportunities - All betting opportunities for a game
 * @param {Object} game - Game data
 * @returns {Array} Enhanced opportunities with hedge/doubleDown fields
 */
export function applyHedgingSystem(opportunities, game) {
  if (!opportunities || opportunities.length === 0) {
    return opportunities;
  }
  
  return opportunities.map(opp => {
    // Only apply to spread and moneyline
    if (opp.market !== 'spread' && opp.market !== 'moneyline') {
      return opp;
    }
    
    // Generate hedge/double-down
    const hedging = generateHedgeAndDoubleDown(opp, opportunities, game);
    
    return {
      ...opp,
      hedgeBet: hedging.hedge,
      doubleDownBet: hedging.doubleDown,
      totalExposure: hedging.totalExposure,
      hedgingNotes: hedging.notes
    };
  });
}

export default {
  generateHedgeAndDoubleDown,
  applyHedgingSystem,
  HEDGE_GATES,
  DOUBLEDOWN_GATES
};

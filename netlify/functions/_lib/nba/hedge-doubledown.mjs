/**
 * NBA Elite V2 - Hedge & Double Down System
 * 
 * Generates smart hedge and double-down bets for spread/ML markets.
 * 
 * HEDGE: Insurance bet (opposite outcome) for LOW/MED confidence situations
 * DOUBLE DOWN: Upside kicker (same outcome, different market) for HIGH confidence
 * 
 * Key principles:
 * - Hedges must be EV-aware (not blindly -EV)
 * - Double downs must add convex upside, not redundant juice
 * - Market-specific mapping (spread→ML, ML→spread logic)
 * - Stake sizing: 15-30% sprinkle for double downs, ≤25% for hedges
 */

/**
 * Calculate expected value for a bet
 * @param {number} winProb - Win probability (0-1)
 * @param {number} odds - American odds
 * @param {number} stake - Bet stake
 * @returns {number} Expected value in units
 */
function calculateEV(winProb, odds, stake = 1) {
  const payout = odds > 0 
    ? stake * (odds / 100)
    : stake * (100 / Math.abs(odds));
  
  return (winProb * payout) - ((1 - winProb) * stake);
}

/**
 * Check if odds are too juiced (expensive)
 * @param {number} odds - American odds
 * @param {number} threshold - Threshold (default -220)
 * @returns {boolean}
 */
function isTooJuiced(odds, threshold = -220) {
  return odds < threshold && odds < 0;
}

/**
 * Generate hedge bet for a primary bet
 * 
 * @param {Object} primaryBet - The primary bet opportunity
 * @param {Object} availableMarkets - All available markets for this game
 * @param {Object} gameContext - Game context (home/away teams, winProb, etc.)
 * @returns {Object|null} Hedge bet or null
 */
export function generateHedge(primaryBet, availableMarkets, gameContext) {
  const { confidence, edgePercent, units } = primaryBet;
  
  // RULE 1: Only hedge for LOW or MEDIUM confidence
  if (confidence === 'HIGH') {
    return null;
  }
  
  // RULE 2: Only hedge if edge is in hedge-worthy range (3-7%)
  if (edgePercent < 3 || edgePercent > 7) {
    return null;
  }
  
  // RULE 3: Never hedge if primary edge is too low (avoid betting both sides on weak signals)
  if (edgePercent < 3) {
    return null;
  }
  
  // RULE 4: Determine hedge market based on primary market
  let hedgeBet = null;
  
  if (primaryBet.market === 'Spread') {
    // Primary is spread → hedge is ML (opposite team if underdog, same team if favorite)
    hedgeBet = generateSpreadToMLHedge(primaryBet, availableMarkets, gameContext);
  } else if (primaryBet.market === 'Moneyline') {
    // Primary is ML → hedge is spread (opposite team if favorite, same team if underdog)
    hedgeBet = generateMLToSpreadHedge(primaryBet, availableMarkets, gameContext);
  }
  
  if (!hedgeBet) {
    return null;
  }
  
  // RULE 5: Check if hedge itself is +EV or at least reduces tail risk
  const hedgeEV = calculateEV(hedgeBet.winProb, hedgeBet.odds, hedgeBet.units);
  const isHedgePositiveEV = hedgeEV > 0;
  const hedgeStakeRatio = hedgeBet.units / units;
  
  // Hedge must be either:
  // - Positive EV itself, OR
  // - Small stake (≤25%) that meaningfully reduces tail risk
  if (!isHedgePositiveEV && hedgeStakeRatio > 0.25) {
    return null;
  }
  
  // RULE 6: Never hedge if hedge market is extremely juiced
  if (isTooJuiced(hedgeBet.odds, -240)) {
    return null;
  }
  
  return {
    ...hedgeBet,
    betType: 'HEDGE',
    reason: isHedgePositiveEV 
      ? 'Hedge is +EV and reduces risk'
      : 'Small stake hedge reduces tail risk',
    primaryUnits: units,
    hedgeStakeRatio: hedgeStakeRatio.toFixed(2)
  };
}

/**
 * Generate hedge: Spread primary → ML hedge
 */
function generateSpreadToMLHedge(primaryBet, availableMarkets, gameContext) {
  const { pick } = primaryBet;
  const { homeTeam, awayTeam, homeWinProb, awayWinProb } = gameContext;
  
  // Parse primary pick to determine if favorite or underdog
  const isFavorite = pick.includes('-');
  const pickTeam = pick.split(' ')[0];
  const isHome = pickTeam === homeTeam;
  
  // Hedge logic:
  // - If PRIMARY is underdog spread → hedge with favorite ML (protects against blowout)
  // - If PRIMARY is favorite spread → hedge with favorite ML (protects against win but no cover)
  
  if (!isFavorite) {
    // Underdog spread → hedge with favorite ML
    const hedgeTeam = isHome ? awayTeam : homeTeam;
    const hedgeOdds = isHome ? availableMarkets.awayML : availableMarkets.homeML;
    const hedgeWinProb = isHome ? awayWinProb : homeWinProb;
    
    if (!hedgeOdds) return null;
    
    return {
      market: 'Moneyline',
      pick: `${hedgeTeam} ML`,
      odds: hedgeOdds,
      units: Math.min(primaryBet.units * 0.25, 2), // Max 25% of primary or 2U
      winProb: hedgeWinProb,
      expectedValue: calculateEV(hedgeWinProb, hedgeOdds, 1)
    };
  } else {
    // Favorite spread → hedge with favorite ML
    const hedgeTeam = pickTeam;
    const hedgeOdds = isHome ? availableMarkets.homeML : availableMarkets.awayML;
    const hedgeWinProb = isHome ? homeWinProb : awayWinProb;
    
    if (!hedgeOdds || isTooJuiced(hedgeOdds, -240)) return null;
    
    return {
      market: 'Moneyline',
      pick: `${hedgeTeam} ML`,
      odds: hedgeOdds,
      units: Math.min(primaryBet.units * 0.20, 1.5), // Max 20% of primary or 1.5U
      winProb: hedgeWinProb,
      expectedValue: calculateEV(hedgeWinProb, hedgeOdds, 1)
    };
  }
}

/**
 * Generate hedge: ML primary → Spread hedge
 */
function generateMLToSpreadHedge(primaryBet, availableMarkets, gameContext) {
  const { pick } = primaryBet;
  const { homeTeam, awayTeam, homeWinProb, awayWinProb } = gameContext;
  
  const pickTeam = pick.split(' ')[0];
  const isHome = pickTeam === homeTeam;
  const pickWinProb = isHome ? homeWinProb : awayWinProb;
  
  // Is this a favorite or underdog ML?
  const isFavorite = pickWinProb > 0.5;
  
  // Hedge logic:
  // - If PRIMARY is favorite ML → hedge with underdog spread (protects against close game)
  // - If PRIMARY is underdog ML → hedge with underdog spread (safer companion if they lose)
  
  if (isFavorite) {
    // Favorite ML → hedge with underdog spread
    const hedgeTeam = isHome ? awayTeam : homeTeam;
    const hedgeSpread = isHome ? availableMarkets.awaySpread : availableMarkets.homeSpread;
    const hedgeOdds = isHome ? availableMarkets.awaySpreadOdds : availableMarkets.homeSpreadOdds;
    
    if (!hedgeSpread || !hedgeOdds) return null;
    
    // Estimate spread cover probability (simplified)
    const hedgeWinProb = isHome ? (1 - awayWinProb) * 0.7 : (1 - homeWinProb) * 0.7;
    
    return {
      market: 'Spread',
      pick: `${hedgeTeam} ${hedgeSpread >= 0 ? '+' : ''}${hedgeSpread}`,
      odds: hedgeOdds,
      units: Math.min(primaryBet.units * 0.25, 2),
      winProb: hedgeWinProb,
      expectedValue: calculateEV(hedgeWinProb, hedgeOdds, 1)
    };
  } else {
    // Underdog ML → hedge with underdog spread (same team, safer)
    const hedgeTeam = pickTeam;
    const hedgeSpread = isHome ? availableMarkets.homeSpread : availableMarkets.awaySpread;
    const hedgeOdds = isHome ? availableMarkets.homeSpreadOdds : availableMarkets.awaySpreadOdds;
    
    if (!hedgeSpread || !hedgeOdds) return null;
    
    // Underdog spread has higher win prob than ML
    const hedgeWinProb = pickWinProb + 0.15; // Rough estimate
    
    return {
      market: 'Spread',
      pick: `${hedgeTeam} ${hedgeSpread >= 0 ? '+' : ''}${hedgeSpread}`,
      odds: hedgeOdds,
      units: Math.min(primaryBet.units * 0.20, 1.5),
      winProb: hedgeWinProb,
      expectedValue: calculateEV(hedgeWinProb, hedgeOdds, 1)
    };
  }
}

/**
 * Generate double-down bet for a primary bet
 * 
 * @param {Object} primaryBet - The primary bet opportunity
 * @param {Object} availableMarkets - All available markets for this game
 * @param {Object} gameContext - Game context
 * @returns {Object|null} Double-down bet or null
 */
export function generateDoubleDown(primaryBet, availableMarkets, gameContext) {
  const { confidence, edgePercent, units } = primaryBet;
  
  // RULE 1: Only double-down for HIGH confidence
  if (confidence !== 'HIGH') {
    return null;
  }
  
  // RULE 2: Only double-down if edge is strong (≥8%)
  if (edgePercent < 8) {
    return null;
  }
  
  // RULE 3: Determine double-down market based on primary market
  let doubleDownBet = null;
  
  if (primaryBet.market === 'Spread') {
    doubleDownBet = generateSpreadToMLDoubleDown(primaryBet, availableMarkets, gameContext);
  } else if (primaryBet.market === 'Moneyline') {
    doubleDownBet = generateMLToSpreadDoubleDown(primaryBet, availableMarkets, gameContext);
  }
  
  if (!doubleDownBet) {
    return null;
  }
  
  // RULE 4: Check if double-down adds convex upside (not just redundant juice)
  if (primaryBet.market === 'Spread' && isTooJuiced(doubleDownBet.odds, -220)) {
    return null; // Favorite ML too juiced, skip
  }
  
  return {
    ...doubleDownBet,
    betType: 'DOUBLE_DOWN',
    reason: 'High confidence kicker for additional upside',
    primaryUnits: units
  };
}

/**
 * Generate double-down: Spread primary → ML double-down
 */
function generateSpreadToMLDoubleDown(primaryBet, availableMarkets, gameContext) {
  const { pick } = primaryBet;
  const { homeTeam, awayTeam, homeWinProb, awayWinProb } = gameContext;
  
  const isFavorite = pick.includes('-');
  const pickTeam = pick.split(' ')[0];
  const isHome = pickTeam === homeTeam;
  
  // Double-down logic:
  // - If PRIMARY is underdog spread → double-down with underdog ML (classic kicker)
  // - If PRIMARY is favorite spread → double-down with favorite ML (only if not too juiced <-220)
  
  if (!isFavorite) {
    // Underdog spread → underdog ML double-down (BEST scenario)
    const ddOdds = isHome ? availableMarkets.homeML : availableMarkets.awayML;
    const ddWinProb = isHome ? homeWinProb : awayWinProb;
    
    if (!ddOdds) return null;
    
    // Sprinkle stake: 15-30% based on odds
    const sprinklePercent = ddOdds > 250 ? 0.30 : ddOdds > 150 ? 0.25 : 0.20;
    
    return {
      market: 'Moneyline',
      pick: `${pickTeam} ML`,
      odds: ddOdds,
      units: Math.min(primaryBet.units * sprinklePercent, 2),
      winProb: ddWinProb,
      expectedValue: calculateEV(ddWinProb, ddOdds, 1)
    };
  } else {
    // Favorite spread → favorite ML double-down (only if not too juiced)
    const ddOdds = isHome ? availableMarkets.homeML : availableMarkets.awayML;
    const ddWinProb = isHome ? homeWinProb : awayWinProb;
    
    if (!ddOdds || isTooJuiced(ddOdds, -220)) return null;
    
    return {
      market: 'Moneyline',
      pick: `${pickTeam} ML`,
      odds: ddOdds,
      units: Math.min(primaryBet.units * 0.15, 1.5),
      winProb: ddWinProb,
      expectedValue: calculateEV(ddWinProb, ddOdds, 1)
    };
  }
}

/**
 * Generate double-down: ML primary → Spread double-down
 */
function generateMLToSpreadDoubleDown(primaryBet, availableMarkets, gameContext) {
  const { pick } = primaryBet;
  const { homeTeam, awayTeam, homeWinProb, awayWinProb } = gameContext;
  
  const pickTeam = pick.split(' ')[0];
  const isHome = pickTeam === homeTeam;
  const pickWinProb = isHome ? homeWinProb : awayWinProb;
  
  const isFavorite = pickWinProb > 0.5;
  
  // Double-down logic:
  // - If PRIMARY is favorite ML → double-down with favorite spread (same outcome, better payout)
  // - If PRIMARY is underdog ML → double-down with underdog spread (safer companion)
  
  if (isFavorite) {
    // Favorite ML → favorite spread double-down
    const ddSpread = isHome ? availableMarkets.homeSpread : availableMarkets.awaySpread;
    const ddOdds = isHome ? availableMarkets.homeSpreadOdds : availableMarkets.awaySpreadOdds;
    
    if (!ddSpread || !ddOdds) return null;
    
    // Estimate spread cover probability
    const ddWinProb = pickWinProb * 0.75; // Rough: 75% of win prob covers spread
    
    return {
      market: 'Spread',
      pick: `${pickTeam} ${ddSpread >= 0 ? '+' : ''}${ddSpread}`,
      odds: ddOdds,
      units: Math.min(primaryBet.units * 0.20, 2),
      winProb: ddWinProb,
      expectedValue: calculateEV(ddWinProb, ddOdds, 1)
    };
  } else {
    // Underdog ML → underdog spread double-down
    const ddSpread = isHome ? availableMarkets.homeSpread : availableMarkets.awaySpread;
    const ddOdds = isHome ? availableMarkets.homeSpreadOdds : availableMarkets.awaySpreadOdds;
    
    if (!ddSpread || !ddOdds) return null;
    
    const ddWinProb = pickWinProb + 0.15; // Spread easier than ML for dogs
    
    return {
      market: 'Spread',
      pick: `${pickTeam} ${ddSpread >= 0 ? '+' : ''}${ddSpread}`,
      odds: ddOdds,
      units: Math.min(primaryBet.units * 0.25, 2),
      winProb: ddWinProb,
      expectedValue: calculateEV(ddWinProb, ddOdds, 1)
    };
  }
}

export default {
  generateHedge,
  generateDoubleDown,
  calculateEV,
  isTooJuiced
};

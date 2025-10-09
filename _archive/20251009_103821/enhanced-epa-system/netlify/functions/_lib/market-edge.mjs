// netlify/functions/_lib/market-edge.mjs  
// Enhanced market analysis combining our approach with GPT's precision

// GPT's precise American odds conversion
export function americanToImplied(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

// GPT's vig-free calculation (cleaner than ours)
export function vigFree(homeOdds, awayOdds) {
  const ph = americanToImplied(homeOdds);
  const pa = americanToImplied(awayOdds);
  if (ph == null || pa == null) return { home: null, away: null };
  const s = ph + pa;
  if (s === 0) return { home: null, away: null };
  return { home: ph / s, away: pa / s };
}

// Enhanced true edge calculation
export function calculateEnhancedTrueEdge(modelHomeProb, marketOdds, gameContext = {}) {
  if (!marketOdds || !marketOdds.home || !marketOdds.away) {
    return { edge: 0, hasMinimumEdge: false, vigRemoved: false };
  }
  
  // GPT's clean vig removal
  const vigFreeProbs = vigFree(marketOdds.home, marketOdds.away);
  if (vigFreeProbs.home == null) {
    return { edge: 0, hasMinimumEdge: false, vigRemoved: false };
  }
  
  const trueEdge = Math.abs(modelHomeProb - vigFreeProbs.home);
  
  // Our enhanced edge thresholds based on game context
  let minEdgeThreshold = 0.02; // GPT's base 2%
  
  // Adjust threshold based on game context (our addition)
  if (gameContext.isCloseGame) minEdgeThreshold = 0.025; // Need more edge for close games
  if (gameContext.highVariance) minEdgeThreshold = 0.03; // Need more edge for volatile games
  if (gameContext.isPlayoff) minEdgeThreshold = 0.015; // Can take smaller edges in playoffs
  
  return {
    edge: trueEdge,
    modelProb: modelHomeProb,
    marketProb: vigFreeProbs.home,
    vigRemoved: true,
    hasMinimumEdge: trueEdge >= minEdgeThreshold,
    edgePercent: Math.round(trueEdge * 100 * 10) / 10,
    threshold: minEdgeThreshold,
    vigAmount: (americanToImplied(marketOdds.home) + americanToImplied(marketOdds.away)) - 1
  };
}

// GPT's approach to bet decision with our enhancements
export function shouldTakeBet(modelProb, predictedSpread, marketOdds, marketSpread, gameContext = {}) {
  const edgeCalc = calculateEnhancedTrueEdge(modelProb, marketOdds, gameContext);
  const marginGap = Math.abs(predictedSpread - (marketSpread || 0));
  
  // GPT's conditions enhanced with our game context
  const hasEdge = edgeCalc.hasMinimumEdge;
  const hasMarginEdge = marginGap >= (gameContext.isCloseGame ? 3.5 : 3.0);
  
  // Our additional no-bet conditions
  const tooVolatile = gameContext.gameVariance > 0.15;
  const badWeather = gameContext.weather?.wind_mph > 25;
  const keyInjuries = gameContext.qbOut || gameContext.keyPlayersOut > 2;
  
  const takeBet = hasEdge && hasMarginEdge && !tooVolatile && !badWeather && !keyInjuries;
  
  let skipReason = null;
  if (!hasEdge) skipReason = `edge<${(edgeCalc.threshold * 100).toFixed(1)}%`;
  else if (!hasMarginEdge) skipReason = 'margin<3pts';
  else if (tooVolatile) skipReason = 'high-variance';
  else if (badWeather) skipReason = 'weather';
  else if (keyInjuries) skipReason = 'injuries';
  
  return {
    takeBet,
    skipReason,
    edgeInfo: edgeCalc,
    marginGap,
    contextFlags: {
      tooVolatile,
      badWeather, 
      keyInjuries
    }
  };
}
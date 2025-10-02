// netlify/functions/_lib/nhl-elite-line-scanner-v2.mjs
// ELITE UPGRADES: Push handling, CLV tracking, Hybrid Kelly with uncertainty penalties

import { calculateLineProbabilityZINB } from './nhl-advanced-projection-v2.mjs';

/**
 * ELITE UPGRADE 8: MARKET INTEGRATION & CLV TRACKING
 * Closing Line Value - track how our picks perform vs closing lines
 */

const CLV_TRACKER = new Map(); // In production, use database

/**
 * Convert American odds to decimal
 */
function americanToDecimal(odds) {
  if (odds > 0) {
    return (odds / 100) + 1;
  } else {
    return (100 / Math.abs(odds)) + 1;
  }
}

/**
 * Convert American odds to probability
 */
function americanOddsToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * ELITE UPGRADE: Remove vig with proportional method
 */
export function removeVig(overOdds, underOdds, pushOdds = null) {
  const overProb = americanOddsToProb(overOdds);
  const underProb = americanOddsToProb(underOdds);
  const pushProb = pushOdds ? americanOddsToProb(pushOdds) : 0;
  
  const totalProb = overProb + underProb + pushProb;
  const vig = totalProb - 1.0;
  
  // Proportional vig removal
  const fairOverProb = overProb / totalProb;
  const fairUnderProb = underProb / totalProb;
  const fairPushProb = pushProb / totalProb;
  
  return {
    fairOverProb,
    fairUnderProb,
    fairPushProb,
    vig,
    vigPct: (vig * 100).toFixed(2)
  };
}

/**
 * ELITE UPGRADE 9: PROPER EV CALCULATION WITH PUSH HANDLING
 */
export function calculateEVWithPush(trueProbs, bookOdds, side) {
  const { over: trueOver, under: trueUnder, push: truePush } = trueProbs;
  
  // Convert to decimals
  const trueOverDec = trueOver / 100;
  const trueUnderDec = trueUnder / 100;
  const truePushDec = truePush / 100;
  
  const odds = side === 'over' ? bookOdds.over : bookOdds.under;
  const decimalOdds = americanToDecimal(odds);
  
  // Win amount per $1 wagered
  const winAmount = decimalOdds - 1;
  
  // Calculate EV based on side
  let ev;
  if (side === 'over') {
    // EV = P(win) × winAmount + P(push) × 0 + P(lose) × (-1)
    ev = (trueOverDec * winAmount) + (truePushDec * 0) + (trueUnderDec * -1);
  } else {
    // Under side
    ev = (trueUnderDec * winAmount) + (truePushDec * 0) + (trueOverDec * -1);
  }
  
  const evPct = ev * 100;
  
  // Calculate edge (true prob vs book prob after vig removal)
  const vigRemoved = removeVig(bookOdds.over, bookOdds.under);
  const bookProb = side === 'over' ? vigRemoved.fairOverProb : vigRemoved.fairUnderProb;
  const trueProb = side === 'over' ? trueOverDec : trueUnderDec;
  const edge = (trueProb - bookProb) * 100;
  
  return {
    ev,
    evPct: Math.round(evPct * 100) / 100,
    edge: Math.round(edge * 100) / 100,
    trueProb: Math.round(trueProb * 10000) / 100,
    bookProb: Math.round(bookProb * 10000) / 100,
    truePushProb: Math.round(truePushDec * 10000) / 100
  };
}

/**
 * ELITE UPGRADE: HYBRID KELLY WITH UNCERTAINTY PENALTIES
 * Based on your existing Kelly-Hybrid staking system
 */
export function calculateHybridKelly(edge, odds, bankroll, uncertaintyFactors = {}) {
  const {
    scratchRisk = 0,      // 0-1 probability of scratch
    roleVolatility = 0,    // 0-1 measure of TOI volatility
    lineChange = false,    // Boolean: recent line change detected
    minGames = 10          // Sample size threshold
  } = uncertaintyFactors;
  
  // Base Kelly calculation
  const edgeDecimal = edge / 100;
  const decimalOdds = americanToDecimal(odds);
  const b = decimalOdds - 1;
  const p = edgeDecimal + americanOddsToProb(odds);
  const q = 1 - p;
  
  const kellyPct = (b * p - q) / b;
  
  // UNCERTAINTY PENALTIES (reduce Kelly % for risk factors)
  let kellyMultiplier = 1.0;
  
  // Scratch risk: high risk = reduce stake
  if (scratchRisk > 0.10) {
    kellyMultiplier *= (1 - scratchRisk * 0.5); // 20% scratch risk → -10% stake
  }
  
  // Role volatility: high variance in TOI = reduce stake
  if (roleVolatility > 0.15) {
    kellyMultiplier *= 0.90; // -10% for volatile role
  }
  
  // Recent line change: uncertainty about deployment
  if (lineChange) {
    kellyMultiplier *= 0.85; // -15% for line change
  }
  
  // Small sample penalty
  if (minGames < 10) {
    kellyMultiplier *= Math.max(0.5, minGames / 10); // Scale down for <10 games
  }
  
  // Fractional Kelly (conservative 0.25x default)
  const baseFraction = 0.25;
  const adjustedKelly = kellyPct * baseFraction * kellyMultiplier;
  
  // Calculate stake
  const stake = bankroll * adjustedKelly;
  
  // Hard cap at 5% bankroll
  const maxStake = bankroll * 0.05;
  const recommendedStake = Math.max(0, Math.min(stake, maxStake));
  
  return {
    kellyPct: Math.round(kellyPct * 10000) / 100,
    adjustedKellyPct: Math.round(adjustedKelly * 10000) / 100,
    kellyMultiplier: Math.round(kellyMultiplier * 100) / 100,
    recommendedStake: Math.round(recommendedStake * 100) / 100,
    maxStake: Math.round(maxStake * 100) / 100,
    uncertaintyFactors: {
      scratchRisk: Math.round(scratchRisk * 100) / 100,
      roleVolatility: Math.round(roleVolatility * 100) / 100,
      lineChange,
      minGames
    }
  };
}

/**
 * ELITE UPGRADE: SCAN PLAYER LINES WITH ALL IMPROVEMENTS
 */
export function scanPlayerLinesElite(projection, bookLines, filters = {}) {
  const {
    minEdge = 5,
    minConfidence = 60,
    minTOI = 10,          // Minimum TOI (minutes)
    maxScratchRisk = 0.20, // Max 20% scratch risk
    requirePP1 = false     // For PP-heavy props
  } = filters;
  
  const { params, playerName, team, opponent, position, metadata } = projection;
  
  // Pre-filters
  if (metadata.scratchRisk > maxScratchRisk) {
    return []; // Too risky
  }
  
  const opportunities = [];
  
  for (const bookLine of bookLines) {
    const { book, line, overOdds, underOdds } = bookLine;
    
    // Calculate true probabilities (ZINB with push handling)
    const trueProbs = calculateLineProbabilityZINB(params, line);
    
    // Evaluate both sides
    const sides = [
      { side: 'over', odds: overOdds },
      { side: 'under', odds: underOdds }
    ];
    
    for (const { side, odds } of sides) {
      const ev = calculateEVWithPush(
        trueProbs, 
        { over: overOdds, under: underOdds }, 
        side
      );
      
      // Filter by minimum edge
      if (ev.edge < minEdge) continue;
      
      // Calculate confidence
      const confidence = calculateConfidenceScore(ev.edge, projection, trueProbs);
      
      if (confidence < minConfidence) continue;
      
      // Calculate uncertainty factors
      const uncertaintyFactors = {
        scratchRisk: metadata.scratchRisk,
        roleVolatility: calculateRoleVolatility(projection),
        lineChange: false, // Would come from lineup API
        minGames: projection.seasonStats?.gamesPlayed || 0
      };
      
      opportunities.push({
        player: playerName,
        team,
        opponent,
        position,
        book,
        market: 'Player Shots on Goal',
        bet: `${side === 'over' ? 'Over' : 'Under'} ${line}`,
        line,
        side,
        odds,
        
        // Projection
        projectedSOG: params.mu,
        
        // Probabilities
        trueProb: ev.trueProb,
        bookProb: ev.bookProb,
        truePushProb: ev.truePushProb,
        
        // Value
        edge: ev.edge,
        ev: ev.evPct,
        
        // Quality
        confidence,
        
        // Metadata
        metadata: {
          scratchRisk: Math.round(metadata.scratchRisk * 10000) / 100,
          rinkEffect: metadata.rinkEffect,
          restDays: metadata.restDays,
          uncertaintyFactors
        }
      });
    }
  }
  
  return opportunities;
}

/**
 * Calculate confidence score (0-100)
 */
function calculateConfidenceScore(edge, projection, trueProbs) {
  // Edge component (0-10)
  const edgeScore = Math.min(edge / 2, 10); // 20% edge = max
  
  // Sample size component (0-10)
  const gamesPlayed = projection.seasonStats?.gamesPlayed || 0;
  const sampleScore = Math.min(gamesPlayed / 5, 10); // 50 games = max
  
  // Distribution sharpness (how concentrated is the probability?)
  // Sharp distributions (high P at one outcome) = higher confidence
  const maxProb = Math.max(trueProbs.over, trueProbs.under, trueProbs.push);
  const sharpnessScore = Math.min((maxProb - 33.3) / 3, 10); // >63.3% = max
  
  // Combined confidence
  const confidence = ((edgeScore + sampleScore + sharpnessScore) / 30) * 100;
  
  return Math.round(Math.min(100, Math.max(0, confidence)));
}

/**
 * Calculate role volatility
 */
function calculateRoleVolatility(projection) {
  // Measure of TOI variance across recent games
  // High variance = uncertain role
  
  const recentGames = projection.recentForm?.last10Games || [];
  if (recentGames.length < 5) return 0.5; // High volatility for small samples
  
  const toiValues = recentGames.slice(0, 5).map(g => {
    const [min, sec] = g.toi.split(':');
    return parseInt(min) + parseInt(sec) / 60;
  });
  
  const mean = toiValues.reduce((a, b) => a + b, 0) / toiValues.length;
  const variance = toiValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / toiValues.length;
  const stdDev = Math.sqrt(variance);
  
  // Coefficient of variation
  const cv = stdDev / mean;
  
  return Math.min(1, cv); // Cap at 1.0
}

/**
 * ELITE UPGRADE 8: CLV (Closing Line Value) Tracking
 */
export function trackCLV(betId, openingOdds, closingOdds, result) {
  const openingProb = americanOddsToProb(openingOdds);
  const closingProb = americanOddsToProb(closingOdds);
  
  const clv = closingProb - openingProb;
  const clvPct = clv * 100;
  
  CLV_TRACKER.set(betId, {
    openingOdds,
    closingOdds,
    clv: clvPct,
    result,
    timestamp: new Date().toISOString()
  });
  
  return {
    clv: Math.round(clvPct * 100) / 100,
    verdict: clvPct > 0 ? 'BEAT_CLOSING' : 'MISSED_CLOSING'
  };
}

/**
 * Get CLV statistics
 */
export function getCLVStats() {
  const bets = Array.from(CLV_TRACKER.values());
  
  if (bets.length === 0) return null;
  
  const avgCLV = bets.reduce((sum, b) => sum + b.clv, 0) / bets.length;
  const winners = bets.filter(b => b.result === 'WIN');
  const losers = bets.filter(b => b.result === 'LOSS');
  
  return {
    totalBets: bets.length,
    avgCLV: Math.round(avgCLV * 100) / 100,
    winnerCLV: winners.length > 0 ? 
      Math.round((winners.reduce((sum, b) => sum + b.clv, 0) / winners.length) * 100) / 100 : 0,
    loserCLV: losers.length > 0 ?
      Math.round((losers.reduce((sum, b) => sum + b.clv, 0) / losers.length) * 100) / 100 : 0
  };
}

/**
 * ELITE UPGRADE 12: MODEL MONITORING - RESIDUAL TRACKING
 */
const RESIDUAL_TRACKER = new Map();

export function logPropResult(betId, projection, line, side, actualResult) {
  const trueProbs = calculateLineProbabilityZINB(projection.params, line);
  const predictedProb = side === 'over' ? trueProbs.over : trueProbs.under;
  
  // Actual result: 1 if bet won, 0 if lost
  const actualOutcome = actualResult === 'WIN' ? 1 : 0;
  
  // Residual: actual - predicted
  const residual = actualOutcome - (predictedProb / 100);
  
  RESIDUAL_TRACKER.set(betId, {
    playerId: projection.playerId,
    position: projection.position,
    venue: projection.metadata.venue,
    line,
    side,
    predictedProb,
    actualOutcome,
    residual,
    timestamp: new Date().toISOString()
  });
  
  return {
    residual: Math.round(residual * 10000) / 100,
    calibration: Math.abs(residual) < 0.15 ? 'GOOD' : 'POOR'
  };
}

/**
 * Get residual statistics (for model calibration)
 */
export function getResidualStats(filters = {}) {
  const { position, venue, archetype } = filters;
  
  let residuals = Array.from(RESIDUAL_TRACKER.values());
  
  // Apply filters
  if (position) {
    residuals = residuals.filter(r => r.position === position);
  }
  if (venue) {
    residuals = residuals.filter(r => r.venue === venue);
  }
  
  if (residuals.length === 0) return null;
  
  const avgResidual = residuals.reduce((sum, r) => sum + r.residual, 0) / residuals.length;
  const absResiduals = residuals.map(r => Math.abs(r.residual));
  const mae = absResiduals.reduce((sum, r) => sum + r, 0) / absResiduals.length;
  
  return {
    count: residuals.length,
    avgResidual: Math.round(avgResidual * 10000) / 100,
    mae: Math.round(mae * 10000) / 100,
    calibration: mae < 0.10 ? 'EXCELLENT' : mae < 0.15 ? 'GOOD' : 'NEEDS_TUNING'
  };
}

export default {
  removeVig,
  calculateEVWithPush,
  calculateHybridKelly,
  scanPlayerLinesElite,
  trackCLV,
  getCLVStats,
  logPropResult,
  getResidualStats
};

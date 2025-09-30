// netlify/functions/_lib/calibration-v4.mjs
// Elite Injury System v4.1 - Production Calibration Layer
// Implements conservative safety rails based on GPT feedback

import { getStore } from '@netlify/blobs';

// CONSERVATIVE PRODUCTION SETTINGS
const PRODUCTION_LIMITS = {
  MAX_EDGE_DISPLAY: 0.08,        // 8% max edge display (GPT feedback)
  MIN_MARKET_ANCHOR: 0.30,       // Minimum 30% market weight (GPT feedback)
  MAX_SPREAD_DIVERGENCE: 6.0,    // Max 6 point spread divergence from market
  MAX_ML_ODDS_DIVERGENCE: 150,   // Max 150 odds divergence between spread/ML
  MIN_CONFIDENCE_FLOOR: 0.52,    // Minimum 52% confidence for any bet
  DEPTH_PENALTY_THRESHOLD: 2     // Scale down impacts for depth > 2
};

// Historical calibration mapping storage
let calibrationMapping = null;
let lastCalibrationUpdate = null;

/**
 * Load calibration mapping from blob storage
 * Maps raw model probabilities to calibrated probabilities
 */
async function loadCalibrationMapping() {
  try {
    if (calibrationMapping && lastCalibrationUpdate && 
        (Date.now() - lastCalibrationUpdate) < 6 * 60 * 60 * 1000) { // 6 hour cache
      return calibrationMapping;
    }

    const store = getStore({ name: 'nfl-calibration' });
    const mappingData = await store.get('current-mapping.json');
    
    if (mappingData) {
      calibrationMapping = JSON.parse(mappingData);
      lastCalibrationUpdate = Date.now();
      console.log('📊 Loaded calibration mapping with', Object.keys(calibrationMapping.points || {}).length, 'calibration points');
    } else {
      // Fallback conservative calibration
      calibrationMapping = generateConservativeMapping();
      console.warn('📊 Using conservative fallback calibration mapping');
    }
    
    return calibrationMapping;
  } catch (error) {
    console.error('❌ Failed to load calibration mapping:', error);
    return generateConservativeMapping();
  }
}

/**
 * Generate conservative fallback calibration mapping
 * Reduces overconfident predictions based on GPT feedback
 */
function generateConservativeMapping() {
  const points = {};
  
  // Conservative calibration: pull extreme probabilities toward 50%
  for (let i = 0; i <= 100; i += 5) {
    const rawProb = i / 100;
    let calibratedProb;
    
    if (rawProb < 0.52) {
      // Below 52% gets pulled up slightly (reduce underdog overconfidence)
      calibratedProb = Math.max(0.48, 0.50 + (rawProb - 0.50) * 0.8);
    } else if (rawProb > 0.68) {
      // Above 68% gets pulled down (reduce favorite overconfidence) 
      calibratedProb = Math.min(0.70, 0.50 + (rawProb - 0.50) * 0.7);
    } else {
      // 52-68% range gets light adjustment
      calibratedProb = 0.50 + (rawProb - 0.50) * 0.9;
    }
    
    points[rawProb.toFixed(2)] = Number(calibratedProb.toFixed(3));
  }
  
  return {
    type: 'conservative_fallback',
    lastUpdated: new Date().toISOString(),
    points: points,
    version: '4.1'
  };
}

/**
 * Apply isotonic calibration to raw model probability
 * Uses piecewise linear interpolation between calibration points
 */
function applyCalibratedProbability(rawProbability, betType = 'spread') {
  if (!calibrationMapping || !calibrationMapping.points) {
    return rawProbability; // No calibration available
  }
  
  const points = calibrationMapping.points;
  const rawProb = Math.max(0.01, Math.min(0.99, rawProbability));
  
  // Find bracketing points for interpolation
  const keys = Object.keys(points).map(k => parseFloat(k)).sort((a, b) => a - b);
  
  // Exact match
  const exactKey = rawProb.toFixed(2);
  if (points[exactKey] !== undefined) {
    return points[exactKey];
  }
  
  // Find interpolation points
  let lowerKey = null, upperKey = null;
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= rawProb && keys[i + 1] >= rawProb) {
      lowerKey = keys[i];
      upperKey = keys[i + 1];
      break;
    }
  }
  
  // Fallback to nearest point
  if (lowerKey === null || upperKey === null) {
    const nearest = keys.reduce((prev, curr) => 
      Math.abs(curr - rawProb) < Math.abs(prev - rawProb) ? curr : prev
    );
    return points[nearest.toFixed(2)] || rawProb;
  }
  
  // Linear interpolation
  const lowerProb = points[lowerKey.toFixed(2)];
  const upperProb = points[upperKey.toFixed(2)];
  const ratio = (rawProb - lowerKey) / (upperKey - lowerKey);
  const calibratedProb = lowerProb + ratio * (upperProb - lowerProb);
  
  return Number(calibratedProb.toFixed(3));
}

/**
 * Remove vig from market odds to get true market probability
 * Essential for proper anchoring
 */
function removeVigFromOdds(homeOdds, awayOdds) {
  if (!homeOdds || !awayOdds) return null;
  
  const homeImplied = homeOdds > 0 ? 100 / (homeOdds + 100) : Math.abs(homeOdds) / (Math.abs(homeOdds) + 100);
  const awayImplied = awayOdds > 0 ? 100 / (awayOdds + 100) : Math.abs(awayOdds) / (Math.abs(awayOdds) + 100);
  
  const totalImplied = homeImplied + awayImplied;
  if (totalImplied <= 1.0) return { homeProb: homeImplied, awayProb: awayImplied }; // Already fair
  
  return {
    homeProb: homeImplied / totalImplied,
    awayProb: awayImplied / totalImplied,
    vigRemoved: totalImplied - 1.0
  };
}

/**
 * Apply market anchoring to model prediction
 * Conservative approach per GPT feedback
 */
function applyMarketAnchoring(modelPrediction, marketOdds, gameContext = {}) {
  if (!marketOdds || !marketOdds.ml_home || !marketOdds.ml_away) {
    console.warn('⚠️ No market odds available for anchoring');
    return {
      anchoredPrediction: modelPrediction,
      anchorWeight: 0,
      marketProb: null,
      vigFreeMarket: null
    };
  }
  
  // Remove vig from market odds
  const vigFreeMarket = removeVigFromOdds(marketOdds.ml_home, marketOdds.ml_away);
  if (!vigFreeMarket) {
    return { anchoredPrediction: modelPrediction, anchorWeight: 0 };
  }
  
  // Dynamic anchor weight based on data quality and time
  let baseAnchorWeight = PRODUCTION_LIMITS.MIN_MARKET_ANCHOR; // Start with 30% minimum
  
  // Increase anchor weight for low confidence or stale data
  if (gameContext.modelConfidence < 0.6) baseAnchorWeight += 0.15;
  if (gameContext.dataAge > 60) baseAnchorWeight += 0.1; // Minutes since last update
  if (gameContext.injuryUncertainty) baseAnchorWeight += 0.1;
  
  // Decrease anchor weight for high-confidence, fresh data
  if (gameContext.modelConfidence > 0.7 && gameContext.dataAge < 15) {
    baseAnchorWeight = Math.max(0.15, baseAnchorWeight - 0.1);
  }
  
  const finalAnchorWeight = Math.min(0.60, baseAnchorWeight); // Cap at 60%
  
  // Blend model prediction with vig-free market
  const marketProb = vigFreeMarket.homeProb;
  const anchoredPrediction = {
    homeWinProb: (modelPrediction.homeWinProb * (1 - finalAnchorWeight)) + (marketProb * finalAnchorWeight),
    awayWinProb: (modelPrediction.awayWinProb * (1 - finalAnchorWeight)) + (vigFreeMarket.awayProb * finalAnchorWeight)
  };
  
  return {
    anchoredPrediction,
    anchorWeight: finalAnchorWeight,
    marketProb: marketProb,
    vigFreeMarket: vigFreeMarket,
    divergence: Math.abs(modelPrediction.homeWinProb - marketProb)
  };
}

/**
 * Apply conservative edge capping and consistency checks
 * Implements GPT's safety recommendations
 */
function applyProductionSafetyLimits(prediction, marketData, gameContext = {}) {
  const result = { ...prediction };
  const warnings = [];
  
  // 1. Edge Capping (8% max per GPT feedback)
  ['moneyline', 'spread', 'total'].forEach(betType => {
    if (result[betType] && result[betType].edge > PRODUCTION_LIMITS.MAX_EDGE_DISPLAY * 100) {
      warnings.push(`${betType}_edge_capped`);
      result[betType].edge = PRODUCTION_LIMITS.MAX_EDGE_DISPLAY * 100;
      result[betType].edgeCapped = true;
      result[betType].originalEdge = prediction[betType].edge;
    }
  });
  
  // 2. Spread vs ML Consistency Check
  if (result.spread && result.moneyline && marketData) {
    const spreadImpliedML = convertSpreadToMLOdds(result.spread.predicted);
    const actualML = result.moneyline.pick === 'home' ? marketData.ml_home : marketData.ml_away;
    
    if (Math.abs(spreadImpliedML - actualML) > PRODUCTION_LIMITS.MAX_ML_ODDS_DIVERGENCE) {
      warnings.push('spread_ml_inconsistency');
      // Reduce confidence for both
      result.spread.confidence = Math.max(52, result.spread.confidence * 0.85);
      result.moneyline.confidence = Math.max(52, result.moneyline.confidence * 0.85);
    }
  }
  
  // 3. Minimum Confidence Floor
  ['moneyline', 'spread', 'total'].forEach(betType => {
    if (result[betType] && result[betType].confidence < PRODUCTION_LIMITS.MIN_CONFIDENCE_FLOOR * 100) {
      result[betType].bet = false;
      result[betType].betRecommendation = "NO BET";
      result[betType].skipReason = "confidence_below_threshold";
      warnings.push(`${betType}_confidence_too_low`);
    }
  });
  
  // 4. Extreme Divergence Check
  if (gameContext.marketDivergence > 0.15) { // 15% probability divergence
    warnings.push('extreme_market_divergence');
    // Scale down all edges by 50%
    ['moneyline', 'spread', 'total'].forEach(betType => {
      if (result[betType] && result[betType].edge) {
        result[betType].edge *= 0.5;
        result[betType].extremeDivergenceReduction = true;
      }
    });
  }
  
  return {
    ...result,
    safetyLimits: {
      applied: warnings,
      version: '4.1',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Helper function to convert spread to moneyline odds
 */
function convertSpreadToMLOdds(spreadPoints) {
  // Rough conversion: spread to moneyline
  const absSpread = Math.abs(spreadPoints);
  if (absSpread < 1) return -110; // Pick'em
  if (absSpread < 3) return spreadPoints > 0 ? 130 : -150;
  if (absSpread < 7) return spreadPoints > 0 ? 200 : -240;
  if (absSpread < 14) return spreadPoints > 0 ? 400 : -500;
  return spreadPoints > 0 ? 800 : -1000;
}

/**
 * Build calibration mapping from historical data
 * Should be run nightly as a background job
 */
async function buildCalibrationMapping(historicalResults) {
  // Group results by predicted probability ranges
  const buckets = {};
  
  historicalResults.forEach(result => {
    const predProb = Math.round(result.predictedProbability * 20) / 20; // 5% buckets
    if (!buckets[predProb]) buckets[predProb] = { correct: 0, total: 0 };
    buckets[predProb].total++;
    if (result.actualOutcome) buckets[predProb].correct++;
  });
  
  // Create isotonic calibration mapping
  const calibrationPoints = {};
  Object.keys(buckets).forEach(predProb => {
    const bucket = buckets[predProb];
    if (bucket.total >= 5) { // Minimum sample size
      const calibratedProb = bucket.correct / bucket.total;
      calibrationPoints[predProb] = calibratedProb;
    }
  });
  
  // Save to blob storage
  const mapping = {
    type: 'isotonic_calibration',
    lastUpdated: new Date().toISOString(),
    points: calibrationPoints,
    version: '4.1',
    sampleSize: historicalResults.length
  };
  
  try {
    const store = getStore({ name: 'nfl-calibration' });
    await store.set('current-mapping.json', JSON.stringify(mapping));
    console.log('💾 Saved calibration mapping with', Object.keys(calibrationPoints).length, 'points');
  } catch (error) {
    console.error('❌ Failed to save calibration mapping:', error);
  }
  
  return mapping;
}

export {
  loadCalibrationMapping,
  applyCalibratedProbability,
  applyMarketAnchoring,
  applyProductionSafetyLimits,
  removeVigFromOdds,
  buildCalibrationMapping,
  PRODUCTION_LIMITS
};
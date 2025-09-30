// Integration patch for netlify/functions/nfl-predictions-generate/index.mjs
// Add these imports at the top of the file after existing imports

import { 
  loadCalibrationMapping, 
  applyCalibratedProbability, 
  applyMarketAnchoring, 
  applyProductionSafetyLimits,
  PRODUCTION_LIMITS 
} from '../_lib/calibration-v4.mjs';

import { 
  applyDepthChartSafeguards, 
  validateDepthChartConsistency,
  DEPTH_SAFEGUARDS 
} from '../_lib/depth-chart-safeguards-v4.mjs';

import { 
  filterSituationalEPA, 
  calculateSituationalBaseline,
  detectDataQualityIssues,
  SITUATIONAL_THRESHOLDS 
} from '../_lib/situational-epa-filters-v4.mjs';

// Add this enhanced prediction scoring function after the existing helper functions
// This replaces/enhances the existing prediction generation with production safeguards

async function generateSafeguardedPrediction(game, advancedMetrics, injuries, season, currentWeek) {
  console.log(`🛡️ Generating safeguarded prediction for ${game.away_team} @ ${game.home_team}`);
  
  // 1. LOAD CALIBRATION MAPPING
  let calibrationMapping;
  try {
    calibrationMapping = await loadCalibrationMapping();
    console.log('📊 Loaded calibration mapping');
  } catch (error) {
    console.warn('⚠️ Failed to load calibration mapping, using conservative fallback');
    calibrationMapping = null;
  }
  
  // 2. GET MARKET DATA FOR ANCHORING
  let marketOdds = null;
  try {
    marketOdds = await fetchMarketOdds(game.game_id);
    console.log('💰 Loaded market odds for anchoring');
  } catch (error) {
    console.warn('⚠️ Failed to load market odds, proceeding without anchoring');
  }
  
  // 3. FILTER EPA DATA FOR SITUATIONAL BIAS
  let filteredMetrics = advancedMetrics;
  if (advancedMetrics?.teams) {
    const homeEPA = advancedMetrics.teams[game.home_team]?.epa_data || [];
    const awayEPA = advancedMetrics.teams[game.away_team]?.epa_data || [];
    
    const homeFiltered = filterSituationalEPA(homeEPA);
    const awayFiltered = filterSituationalEPA(awayEPA);
    
    filteredMetrics = {
      ...advancedMetrics,
      teams: {
        ...advancedMetrics.teams,
        [game.home_team]: {
          ...advancedMetrics.teams[game.home_team],
          epa_data: homeFiltered.filteredData,
          epa_filter_stats: homeFiltered.filterStats
        },
        [game.away_team]: {
          ...advancedMetrics.teams[game.away_team],
          epa_data: awayFiltered.filteredData,
          epa_filter_stats: awayFiltered.filterStats
        }
      }
    };
    
    console.log(`📈 EPA filtering: Home ${homeFiltered.filterStats.filterRate.toFixed(1)}%, Away ${awayFiltered.filterStats.filterRate.toFixed(1)}%`);
  }
  
  // 4. VALIDATE AND SAFEGUARD DEPTH CHART DATA
  let safeguardedInjuries = injuries;
  if (injuries?.teams) {
    const homeDepthValidation = validateDepthChartConsistency(injuries, game.home_team);
    const awayDepthValidation = validateDepthChartConsistency(injuries, game.away_team);
    
    if (!homeDepthValidation.valid || !awayDepthValidation.valid) {
      console.warn(`⚠️ Depth chart quality issues: Home ${homeDepthValidation.warnings.length}, Away ${awayDepthValidation.warnings.length}`);
    }
  }
  
  // 5. GENERATE CORE PREDICTION (using existing logic but with filtered data)
  const coreScoreData = await generateCoreScore(game, filteredMetrics, safeguardedInjuries, season, currentWeek);
  
  if (!coreScoreData.home || !coreScoreData.away) {
    console.error('❌ Failed to generate core prediction scores');
    return generateFallbackPrediction(game);
  }
  
  // 6. APPLY INJURY SAFEGUARDS TO IMPACTS
  let safeguardedInjuryImpacts = coreScoreData.injuryImpacts;
  if (coreScoreData.injuryImpacts?.length > 0 && injuries) {
    const safeguardResult = applyDepthChartSafeguards(
      coreScoreData.injuryImpacts,
      injuries,
      { gameId: game.game_id, dataAge: getDataAge(injuries) }
    );
    
    safeguardedInjuryImpacts = safeguardResult.safeguardedImpacts;
    console.log(`🛡️ Applied depth safeguards: ${safeguardResult.warnings.length} warnings, ${safeguardResult.summary.totalImpactReduction.toFixed(1)}% impact reduction`);
  }
  
  // 7. CALCULATE RAW PROBABILITIES
  const homeScore = coreScoreData.home.score;
  const awayScore = coreScoreData.away.score;
  const totalScore = homeScore + awayScore;
  const rawHomeWinProb = homeScore / (homeScore + awayScore);
  const rawAwayWinProb = 1 - rawHomeWinProb;
  
  // 8. APPLY CALIBRATION TO RAW PROBABILITIES
  const calibratedHomeWinProb = calibrationMapping ? 
    applyCalibratedProbability(rawHomeWinProb, 'moneyline') : rawHomeWinProb;
  const calibratedAwayWinProb = 1 - calibratedHomeWinProb;
  
  console.log(`📊 Calibration: ${(rawHomeWinProb * 100).toFixed(1)}% → ${(calibratedHomeWinProb * 100).toFixed(1)}%`);
  
  // 9. APPLY MARKET ANCHORING
  let anchoredPrediction = {
    homeWinProb: calibratedHomeWinProb,
    awayWinProb: calibratedAwayWinProb
  };
  
  let anchoringData = null;
  if (marketOdds) {
    const gameContext = {
      modelConfidence: Math.max(coreScoreData.home.confidence, coreScoreData.away.confidence),
      dataAge: getDataAge(filteredMetrics),
      injuryUncertainty: safeguardedInjuryImpacts?.some(impact => impact.confidencePenalty > 0.1)
    };
    
    anchoringData = applyMarketAnchoring(anchoredPrediction, marketOdds, gameContext);
    anchoredPrediction = anchoringData.anchoredPrediction;
    
    console.log(`⚓ Market anchoring: ${(anchoringData.anchorWeight * 100).toFixed(1)}% weight, ${(anchoringData.divergence * 100).toFixed(1)}% divergence`);
  }
  
  // 10. GENERATE BET PREDICTIONS WITH ANCHORED PROBABILITIES
  const betPredictions = await generateBetPredictions(
    game,
    anchoredPrediction,
    totalScore,
    marketOdds,
    {
      homeConfidence: coreScoreData.home.confidence,
      awayConfidence: coreScoreData.away.confidence,
      injuryImpacts: safeguardedInjuryImpacts,
      anchoringData: anchoringData
    }
  );
  
  // 11. APPLY FINAL PRODUCTION SAFETY LIMITS
  const safeGuardedBets = applyProductionSafetyLimits(
    betPredictions,
    marketOdds,
    {
      modelConfidence: Math.max(coreScoreData.home.confidence, coreScoreData.away.confidence),
      marketDivergence: anchoringData?.divergence || 0,
      dataQuality: getDataQualityScore(filteredMetrics, injuries)
    }
  );
  
  console.log(`🛡️ Safety limits applied: ${safeGuardedBets.safetyLimits?.applied?.length || 0} adjustments`);
  
  // 12. COMPILE FINAL PREDICTION
  return {
    game_id: game.game_id,
    home_team: game.home_team,
    away_team: game.away_team,
    start: game.start,
    
    // Core predictions with all safeguards applied
    predictions: {
      home_win_prob: Math.round(anchoredPrediction.homeWinProb * 100) / 100,
      away_win_prob: Math.round(anchoredPrediction.awayWinProb * 100) / 100,
      total_predicted: totalScore,
      
      // Safeguarded bet recommendations
      moneyline: safeGuardedBets.moneyline || generateNoConfidenceBet('moneyline'),
      spread: safeGuardedBets.spread || generateNoConfidenceBet('spread'), 
      total: safeGuardedBets.total || generateNoConfidenceBet('total')
    },
    
    // Enhanced metadata for transparency and debugging
    metadata: {
      version: 'v4.1-safeguarded',
      timestamp: new Date().toISOString(),
      
      calibration: {
        applied: !!calibrationMapping,
        rawHomeWinProb: Math.round(rawHomeWinProb * 1000) / 1000,
        calibratedHomeWinProb: Math.round(calibratedHomeWinProb * 1000) / 1000,
        adjustmentMagnitude: Math.round(Math.abs(rawHomeWinProb - calibratedHomeWinProb) * 1000) / 1000
      },
      
      marketAnchoring: anchoringData ? {
        anchorWeight: Math.round(anchoringData.anchorWeight * 100) / 100,
        marketProb: Math.round(anchoringData.marketProb * 1000) / 1000,
        divergence: Math.round(anchoringData.divergence * 1000) / 1000,
        vigRemoved: anchoringData.vigFreeMarket?.vigRemoved || 0
      } : null,
      
      depthChartSafeguards: {
        appliedToInjuries: safeguardedInjuryImpacts?.length || 0,
        totalImpactReduction: coreScoreData.injuryImpacts?.length > 0 ? 
          calculateImpactReduction(coreScoreData.injuryImpacts, safeguardedInjuryImpacts) : 0,
        dataQualityIssues: []
      },
      
      epaFiltering: {
        homeFilterRate: filteredMetrics?.teams?.[game.home_team]?.epa_filter_stats?.filterRate || 0,
        awayFilterRate: filteredMetrics?.teams?.[game.away_team]?.epa_filter_stats?.filterRate || 0,
        situationalBiasDetected: (filteredMetrics?.teams?.[game.home_team]?.epa_filter_stats?.filterRate || 0) > 20
      },
      
      safetyLimits: safeGuardedBets.safetyLimits || { applied: [], version: 'v4.1' },
      
      dataQuality: {
        overall: getDataQualityScore(filteredMetrics, injuries),
        metricsAge: getDataAge(filteredMetrics),
        injuriesAge: getDataAge(injuries),
        marketDataAvailable: !!marketOdds
      }
    },
    
    // Team-specific data with safeguards applied
    teamStats: {
      home: {
        ...coreScoreData.home,
        safeguardedInjuryImpact: safeguardedInjuryImpacts?.filter(i => i.team === game.home_team) || []
      },
      away: {
        ...coreScoreData.away,
        safeguardedInjuryImpact: safeguardedInjuryImpacts?.filter(i => i.team === game.away_team) || []
      }
    }
  };
}

// Helper functions for the safeguarded prediction system

function getDataAge(data) {
  if (!data || !data.lastUpdated) return 999; // Very old if no timestamp
  return (Date.now() - new Date(data.lastUpdated).getTime()) / (1000 * 60); // Minutes
}

function getDataQualityScore(metrics, injuries) {
  let score = 1.0;
  
  // Penalize old data
  const metricsAge = getDataAge(metrics);
  const injuriesAge = getDataAge(injuries);
  
  if (metricsAge > 60) score -= 0.2; // 1 hour old
  if (metricsAge > 360) score -= 0.3; // 6 hours old
  if (injuriesAge > 120) score -= 0.1; // 2 hours old
  
  // Penalize missing data
  if (!metrics?.teams) score -= 0.3;
  if (!injuries?.teams) score -= 0.2;
  
  return Math.max(0.1, score);
}

function calculateImpactReduction(originalImpacts, safeguardedImpacts) {
  if (!originalImpacts?.length || !safeguardedImpacts?.length) return 0;
  
  const originalTotal = originalImpacts.reduce((sum, impact) => sum + Math.abs(impact.epaImpact || 0), 0);
  const safeguardedTotal = safeguardedImpacts.reduce((sum, impact) => sum + Math.abs(impact.epaImpact || 0), 0);
  
  if (originalTotal === 0) return 0;
  return ((originalTotal - safeguardedTotal) / originalTotal) * 100;
}

function generateNoConfidenceBet(betType) {
  return {
    bet: false,
    pick: null,
    confidence: 50,
    edge: 0,
    betRecommendation: "NO BET",
    skipReason: "insufficient_confidence_safeguarded",
    recommended_unit: 0
  };
}

function generateFallbackPrediction(game) {
  return {
    game_id: game.game_id,
    home_team: game.home_team,
    away_team: game.away_team,
    start: game.start,
    predictions: {
      home_win_prob: 0.5,
      away_win_prob: 0.5,
      total_predicted: 45,
      moneyline: generateNoConfidenceBet('moneyline'),
      spread: generateNoConfidenceBet('spread'),
      total: generateNoConfidenceBet('total')
    },
    metadata: {
      version: 'v4.1-safeguarded-fallback',
      error: 'Failed to generate core prediction'
    }
  };
}

// This function needs to be implemented to work with the existing prediction engine
// It should call the existing score generation logic but with the filtered data
async function generateCoreScore(game, filteredMetrics, safeguardedInjuries, season, currentWeek) {
  // This would integrate with the existing prediction logic in the main file
  // For now, return a placeholder that matches the expected structure
  return {
    home: {
      score: 24.5,
      confidence: 0.72
    },
    away: {
      score: 21.2, 
      confidence: 0.68
    },
    injuryImpacts: []
  };
}

async function generateBetPredictions(game, probabilities, totalScore, marketOdds, context) {
  // This would integrate with the existing bet generation logic
  // For now, return placeholder structure
  return {
    moneyline: {
      bet: probabilities.homeWinProb > 0.58,
      pick: probabilities.homeWinProb > 0.5 ? 'home' : 'away',
      confidence: Math.round(Math.max(probabilities.homeWinProb, probabilities.awayWinProb) * 100),
      edge: Math.abs(probabilities.homeWinProb - 0.5) * 100
    },
    spread: {
      bet: false,
      pick: null,
      confidence: 50,
      edge: 0
    },
    total: {
      bet: false,
      pick: null, 
      confidence: 50,
      edge: 0
    }
  };
}

async function fetchMarketOdds(gameId) {
  // This would integrate with the existing odds fetching logic
  // For now, return null to indicate no market data
  return null;
}

export { generateSafeguardedPrediction };
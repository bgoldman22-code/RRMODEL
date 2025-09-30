// netlify/functions/_lib/situational-epa-filters-v4.mjs
// Elite Injury System v4.1 - Situational EPA Filtering
// Filters out garbage time and skewed situational data per GPT feedback

// SITUATIONAL FILTER CONSTANTS
const SITUATIONAL_THRESHOLDS = {
  GARBAGE_TIME: {
    SCORE_DIFF_THRESHOLD: 17,        // 17+ point difference
    TIME_REMAINING_THRESHOLD: 8,     // 8 minutes or less in 4th quarter
    WIN_PROB_THRESHOLD: 0.95         // 95%+ win probability
  },
  PREVENT_DEFENSE: {
    SCORE_DIFF_THRESHOLD: 10,        // 10+ point lead
    DOWN_AND_DISTANCE: [3, 4],       // 3rd and 4th down
    TIME_REMAINING: 5                // 5 minutes or less
  },
  KNEEL_DOWN: {
    PLAY_TYPES: ['kneel', 'qb_kneel', 'victory_formation'],
    TIME_REMAINING: 2                // 2 minutes or less
  },
  BLOWOUT_FILTER: {
    FINAL_MARGIN_THRESHOLD: 21,      // 21+ point final margin
    FOURTH_QUARTER_ONLY: true        // Only filter 4th quarter of blowouts
  }
};

// EPA FILTERING WEIGHTS
const FILTER_WEIGHTS = {
  GARBAGE_TIME: 0.15,     // Weight garbage time plays at 15%
  PREVENT_DEFENSE: 0.25,  // Weight prevent defense at 25%
  KNEEL_DOWN: 0.0,        // Completely ignore kneel downs
  LATE_GAME_TRAILING: 0.6, // Weight late game desperation at 60%
  EARLY_GAME: 1.0         // Full weight for first 3 quarters
};

/**
 * Filter EPA data to remove situational bias
 * Critical for accurate player impact calculations
 */
function filterSituationalEPA(epaData, gameContext = {}) {
  if (!epaData || !Array.isArray(epaData)) {
    return { filteredData: [], filterStats: { totalPlays: 0, filteredPlays: 0 } };
  }
  
  const filteredPlays = [];
  const filterStats = {
    totalPlays: epaData.length,
    filteredPlays: 0,
    garbageTimePlays: 0,
    preventDefensePlays: 0,
    kneelDownPlays: 0,
    blowoutPlays: 0,
    regularPlays: 0
  };
  
  epaData.forEach(play => {
    const situationalContext = analyzeSituationalContext(play, gameContext);
    const filterWeight = calculatePlayFilterWeight(situationalContext);
    
    // Track filter applications
    if (situationalContext.isGarbageTime) filterStats.garbageTimePlays++;
    if (situationalContext.isPreventDefense) filterStats.preventDefensePlays++;
    if (situationalContext.isKneelDown) filterStats.kneelDownPlays++;
    if (situationalContext.isBlowout) filterStats.blowoutPlays++;
    if (filterWeight === 1.0) filterStats.regularPlays++;
    
    // Apply filter weight
    if (filterWeight > 0) {
      const filteredPlay = {
        ...play,
        epa: (play.epa || 0) * filterWeight,
        originalEpa: play.epa,
        filterWeight: filterWeight,
        situationalContext: situationalContext
      };
      filteredPlays.push(filteredPlay);
      
      if (filterWeight < 1.0) filterStats.filteredPlays++;
    }
  });
  
  return {
    filteredData: filteredPlays,
    filterStats: {
      ...filterStats,
      filterRate: (filterStats.filteredPlays / filterStats.totalPlays) * 100,
      averageWeight: filteredPlays.reduce((sum, play) => sum + play.filterWeight, 0) / filteredPlays.length
    }
  };
}

/**
 * Analyze situational context of a play
 */
function analyzeSituationalContext(play, gameContext) {
  const context = {
    isGarbageTime: false,
    isPreventDefense: false,
    isKneelDown: false,
    isBlowout: false,
    isLateGameDesperation: false,
    timeRemaining: null,
    scoreDifferential: null,
    quarter: null,
    winProbability: null
  };
  
  // Extract play context
  context.quarter = play.qtr || play.quarter || 4;
  context.timeRemaining = calculateTimeRemaining(play.game_seconds_remaining, context.quarter);
  context.scoreDifferential = Math.abs((play.score_differential || play.posteam_score_diff || 0));
  context.winProbability = play.wp || play.win_prob || null;
  
  // Garbage time detection
  if (context.quarter >= 4 && 
      context.timeRemaining <= SITUATIONAL_THRESHOLDS.GARBAGE_TIME.TIME_REMAINING_THRESHOLD &&
      context.scoreDifferential >= SITUATIONAL_THRESHOLDS.GARBAGE_TIME.SCORE_DIFF_THRESHOLD) {
    context.isGarbageTime = true;
  }
  
  // Alternative garbage time check using win probability
  if (context.winProbability && context.winProbability > SITUATIONAL_THRESHOLDS.GARBAGE_TIME.WIN_PROB_THRESHOLD) {
    context.isGarbageTime = true;
  }
  
  // Prevent defense detection
  if (context.quarter >= 4 &&
      context.timeRemaining <= SITUATIONAL_THRESHOLDS.PREVENT_DEFENSE.TIME_REMAINING &&
      context.scoreDifferential >= SITUATIONAL_THRESHOLDS.PREVENT_DEFENSE.SCORE_DIFF_THRESHOLD &&
      SITUATIONAL_THRESHOLDS.PREVENT_DEFENSE.DOWN_AND_DISTANCE.includes(play.down)) {
    context.isPreventDefense = true;
  }
  
  // Kneel down detection
  if (play.play_type && 
      SITUATIONAL_THRESHOLDS.KNEEL_DOWN.PLAY_TYPES.some(type => 
        play.play_type.toLowerCase().includes(type))) {
    context.isKneelDown = true;
  }
  
  // Blowout detection (for final game context)
  if (gameContext.finalMargin && 
      Math.abs(gameContext.finalMargin) >= SITUATIONAL_THRESHOLDS.BLOWOUT_FILTER.FINAL_MARGIN_THRESHOLD &&
      context.quarter >= 4) {
    context.isBlowout = true;
  }
  
  // Late game desperation detection
  if (context.quarter >= 4 &&
      context.timeRemaining <= 3 &&
      context.scoreDifferential >= 7 &&
      !context.isGarbageTime) {
    context.isLateGameDesperation = true;
  }
  
  return context;
}

/**
 * Calculate filter weight based on situational context
 */
function calculatePlayFilterWeight(situationalContext) {
  // Kneel downs get zero weight
  if (situationalContext.isKneelDown) {
    return FILTER_WEIGHTS.KNEEL_DOWN;
  }
  
  // Garbage time gets minimal weight
  if (situationalContext.isGarbageTime) {
    return FILTER_WEIGHTS.GARBAGE_TIME;
  }
  
  // Prevent defense gets reduced weight
  if (situationalContext.isPreventDefense) {
    return FILTER_WEIGHTS.PREVENT_DEFENSE;
  }
  
  // Blowout fourth quarter gets reduced weight
  if (situationalContext.isBlowout) {
    return FILTER_WEIGHTS.PREVENT_DEFENSE; // Same as prevent defense
  }
  
  // Late game desperation gets moderate weight
  if (situationalContext.isLateGameDesperation) {
    return FILTER_WEIGHTS.LATE_GAME_TRAILING;
  }
  
  // Regular plays get full weight
  return FILTER_WEIGHTS.EARLY_GAME;
}

/**
 * Calculate time remaining in game
 */
function calculateTimeRemaining(gameSecondsRemaining, quarter) {
  if (gameSecondsRemaining !== null && gameSecondsRemaining !== undefined) {
    return gameSecondsRemaining / 60; // Convert to minutes
  }
  
  // Fallback estimation based on quarter
  const quarterMinutes = 15;
  return quarterMinutes * (5 - quarter); // Rough estimate
}

/**
 * Filter player-specific EPA data for more accurate impact calculations
 */
function filterPlayerEPAData(playerEPA, playerName, position, gameContext = {}) {
  if (!playerEPA || !Array.isArray(playerEPA)) {
    return {
      filteredEPA: [],
      playerFilterStats: { originalPlays: 0, filteredPlays: 0 }
    };
  }
  
  const { filteredData, filterStats } = filterSituationalEPA(playerEPA, gameContext);
  
  // Position-specific filtering
  const positionAdjustedData = applyPositionSpecificFilters(filteredData, position);
  
  return {
    filteredEPA: positionAdjustedData,
    playerFilterStats: {
      originalPlays: playerEPA.length,
      filteredPlays: filterStats.filteredPlays,
      positionAdjustments: positionAdjustedData.length - filteredData.length,
      averageEPA: positionAdjustedData.reduce((sum, play) => sum + (play.epa || 0), 0) / positionAdjustedData.length,
      filteredAverageEPA: positionAdjustedData.filter(p => p.filterWeight < 1.0).reduce((sum, play) => sum + (play.epa || 0), 0) / 
                          positionAdjustedData.filter(p => p.filterWeight < 1.0).length || 0
    }
  };
}

/**
 * Apply position-specific EPA filters
 */
function applyPositionSpecificFilters(epaData, position) {
  return epaData.map(play => {
    let adjustedPlay = { ...play };
    
    // Position-specific adjustments
    switch (position) {
      case 'QB':
        // Reduce weight of sack/scramble plays in prevent defense
        if (play.situationalContext?.isPreventDefense && 
            (play.play_type === 'run' || play.sack === 1)) {
          adjustedPlay.filterWeight *= 0.7;
        }
        break;
        
      case 'RB':
        // Reduce weight of obvious running situations in garbage time
        if (play.situationalContext?.isGarbageTime && play.play_type === 'run') {
          adjustedPlay.filterWeight *= 0.5;
        }
        break;
        
      case 'WR':
      case 'TE':
        // Reduce weight of prevent defense passing plays
        if (play.situationalContext?.isPreventDefense && play.play_type === 'pass') {
          adjustedPlay.filterWeight *= 0.6;
        }
        break;
        
      case 'K':
        // Kickers less affected by situational context
        adjustedPlay.filterWeight = Math.max(0.8, adjustedPlay.filterWeight);
        break;
        
      case 'DST':
        // Defense can benefit from prevent situations
        if (play.situationalContext?.isPreventDefense) {
          adjustedPlay.filterWeight = Math.min(1.2, adjustedPlay.filterWeight * 1.1);
        }
        break;
    }
    
    return adjustedPlay;
  });
}

/**
 * Calculate situational EPA baseline for team
 * Helps normalize impact calculations
 */
function calculateSituationalBaseline(teamEPA, teamAbbr) {
  const { filteredData, filterStats } = filterSituationalEPA(teamEPA);
  
  // Calculate baseline EPA by situation
  const situationalBaselines = {
    regular: calculateAverageEPA(filteredData.filter(p => p.filterWeight === 1.0)),
    garbageTime: calculateAverageEPA(filteredData.filter(p => p.situationalContext?.isGarbageTime)),
    preventDefense: calculateAverageEPA(filteredData.filter(p => p.situationalContext?.isPreventDefense)),
    lateGame: calculateAverageEPA(filteredData.filter(p => p.situationalContext?.isLateGameDesperation)),
    overall: calculateAverageEPA(filteredData)
  };
  
  return {
    teamAbbr,
    baselines: situationalBaselines,
    filterStats,
    dataQuality: {
      regularPlayPercentage: (filterStats.regularPlays / filterStats.totalPlays) * 100,
      garbageTimePercentage: (filterStats.garbageTimePlays / filterStats.totalPlays) * 100,
      overallFilterRate: filterStats.filterRate
    }
  };
}

/**
 * Helper function to calculate average EPA
 */
function calculateAverageEPA(plays) {
  if (!plays || plays.length === 0) return 0;
  return plays.reduce((sum, play) => sum + (play.epa || 0), 0) / plays.length;
}

/**
 * Detect and flag potential data quality issues
 */
function detectDataQualityIssues(epaData, gameContext = {}) {
  const issues = [];
  
  if (!epaData || epaData.length === 0) {
    issues.push('no_epa_data');
    return issues;
  }
  
  const garbageTimePercentage = (epaData.filter(play => {
    const context = analyzeSituationalContext(play, gameContext);
    return context.isGarbageTime;
  }).length / epaData.length) * 100;
  
  if (garbageTimePercentage > 30) {
    issues.push('high_garbage_time_percentage');
  }
  
  const extremeEPAPlays = epaData.filter(play => Math.abs(play.epa || 0) > 5);
  if (extremeEPAPlays.length / epaData.length > 0.1) {
    issues.push('high_extreme_epa_percentage');
  }
  
  const nullEPAPlays = epaData.filter(play => play.epa === null || play.epa === undefined);
  if (nullEPAPlays.length / epaData.length > 0.05) {
    issues.push('missing_epa_data');
  }
  
  return issues;
}

export {
  filterSituationalEPA,
  filterPlayerEPAData,
  calculateSituationalBaseline,
  analyzeSituationalContext,
  detectDataQualityIssues,
  SITUATIONAL_THRESHOLDS,
  FILTER_WEIGHTS
};
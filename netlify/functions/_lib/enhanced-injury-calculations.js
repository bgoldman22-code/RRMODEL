// netlify/functions/_lib/enhanced-injury-calculations.js
// GPT Feedback Implementation: Depth cascade, market anchoring, opponent elasticity

import { 
  INJURY_CONFIG, 
  UNKNOWN_PLAYER_PRIORS, 
  TOTALS_ELASTICITY,
  DEPTH_CHART_CONFIG,
  getMarketAnchoringWeight,
  getOpponentAdjustmentFactor 
} from './injury-system-config.js';

/**
 * 2. DEPTH CHART CASCADE LOGIC
 * Handle backup1→backup2 propagation when multiple injuries stack
 */
export function calculateDepthChartCascade(position, teamDepthChart, injuries) {
  if (!teamDepthChart || !teamDepthChart[position]) {
    return { primaryReplacement: null, backupMix: {} };
  }
  
  const depthChart = teamDepthChart[position];
  const injuredPlayers = injuries.filter(inj => inj.position === position && inj.status !== 'active');
  
  // Find first available player
  let replacementIndex = 0;
  let availablePlayers = [];
  
  for (let i = 0; i < Math.min(depthChart.length, DEPTH_CHART_CONFIG.MAX_DEPTH_CONSIDERED); i++) {
    const player = depthChart[i];
    const isInjured = injuredPlayers.find(inj => 
      inj.name.toLowerCase().includes(player.toLowerCase()) ||
      player.toLowerCase().includes(inj.name.toLowerCase())
    );
    
    if (!isInjured) {
      availablePlayers.push({ name: player, depth: i + 1 });
    }
  }
  
  if (availablePlayers.length === 0) {
    console.log(`⚠️ No available players at ${position} for depth chart cascade`);
    return { primaryReplacement: null, backupMix: {} };
  }
  
  // Calculate replacement mix based on injury count
  const injuryCount = injuredPlayers.length;
  let cascadeWeights;
  
  if (injuryCount === 1) {
    cascadeWeights = DEPTH_CHART_CONFIG.INJURY_CASCADE_WEIGHTS.single_injury;
  } else if (injuryCount === 2) {
    cascadeWeights = DEPTH_CHART_CONFIG.INJURY_CASCADE_WEIGHTS.double_injury;
  } else {
    cascadeWeights = DEPTH_CHART_CONFIG.INJURY_CASCADE_WEIGHTS.triple_injury;
  }
  
  // Build snap-weighted replacement mix
  const backupMix = {};
  let totalWeight = 0;
  
  Object.entries(cascadeWeights).forEach(([backupLevel, weight], index) => {
    if (index < availablePlayers.length) {
      const player = availablePlayers[index];
      backupMix[player.name] = {
        weight: weight,
        depth: player.depth,
        snapShare: weight * INJURY_CONFIG.SNAP_SHARES[position]?.backup || 0.7
      };
      totalWeight += weight;
    }
  });
  
  // Normalize weights
  Object.values(backupMix).forEach(backup => {
    backup.normalizedWeight = backup.weight / totalWeight;
  });
  
  console.log(`🔄 Depth cascade for ${position}: ${injuryCount} injuries, replacement mix:`, backupMix);
  
  return {
    primaryReplacement: availablePlayers[0],
    backupMix: backupMix,
    injuryCount: injuryCount
  };
}

/**
 * Calculate blended EPA for replacement mix
 */
export function calculateBlendedReplacementEPA(backupMix, position, playerValues) {
  let blendedEPA = 0;
  let totalConfidence = 0;
  
  for (const [playerName, backup] of Object.entries(backupMix)) {
    const playerValue = playerValues[position]?.[playerName] || 
                       UNKNOWN_PLAYER_PRIORS[position] || 
                       { epa: -0.10, confidence: 0.3 };
    
    const weightedEPA = playerValue.epa * backup.normalizedWeight;
    const weightedConfidence = (playerValue.confidence || 0.5) * backup.normalizedWeight;
    
    blendedEPA += weightedEPA;
    totalConfidence += weightedConfidence;
  }
  
  return {
    blendedEPA: blendedEPA,
    confidence: Math.min(totalConfidence, 0.95),
    mixDescription: Object.keys(backupMix).join(' + ')
  };
}

/**
 * 3. MARKET ANCHORING IMPLEMENTATION
 * Blend model predictions with observed market movements
 */
export function applyMarketAnchoring(modelImpact, observedLineMove, minutesToKickoff, confidence = 0.7) {
  if (!observedLineMove || !INJURY_CONFIG.MARKET_ANCHORING) {
    return modelImpact; // No market data available
  }
  
  const modelWeight = getMarketAnchoringWeight(minutesToKickoff);
  const marketWeight = 1 - modelWeight;
  
  // Apply confidence adjustment - lower confidence = more market weight
  const adjustedModelWeight = modelWeight * confidence;
  const adjustedMarketWeight = 1 - adjustedModelWeight;
  
  const anchoredImpact = (adjustedModelWeight * modelImpact) + (adjustedMarketWeight * observedLineMove);
  
  console.log(`⚓ Market anchoring applied:`, {
    modelImpact: modelImpact.toFixed(2),
    observedLineMove: observedLineMove.toFixed(2),
    minutesToKickoff: minutesToKickoff,
    modelWeight: adjustedModelWeight.toFixed(2),
    marketWeight: adjustedMarketWeight.toFixed(2),
    anchoredImpact: anchoredImpact.toFixed(2)
  });
  
  return anchoredImpact;
}

/**
 * 4. OPPONENT ELASTICITY IMPLEMENTATION
 * Adjust injury impacts based on opponent strength
 */
export function applyOpponentElasticity(rawImpact, position, opponentDefenseRank, opponentStats = {}) {
  if (!opponentDefenseRank) {
    return rawImpact; // No opponent data available
  }
  
  const baseAdjustment = getOpponentAdjustmentFactor(position, opponentDefenseRank);
  
  // Additional adjustments based on specific defensive stats
  let schemeAdjustment = 1.0;
  
  if (position === 'QB' && opponentStats.blitzRate > 0.25) {
    // High blitz rate makes backup QBs struggle more
    schemeAdjustment *= 1.1;
  }
  
  if (position === 'WR' && opponentStats.manCoverageRate > 0.6) {
    // Man coverage exposes lesser WRs more
    schemeAdjustment *= 1.05;
  }
  
  if (position === 'RB' && opponentStats.runDefenseRank <= 10) {
    // Elite run defenses hurt backup RBs more
    schemeAdjustment *= 1.08;
  }
  
  const adjustedImpact = rawImpact * baseAdjustment * schemeAdjustment;
  
  console.log(`🎯 Opponent elasticity applied:`, {
    position: position,
    opponentDefenseRank: opponentDefenseRank,
    rawImpact: rawImpact.toFixed(2),
    baseAdjustment: baseAdjustment.toFixed(2),
    schemeAdjustment: schemeAdjustment.toFixed(2),
    adjustedImpact: adjustedImpact.toFixed(2)
  });
  
  return adjustedImpact;
}

/**
 * 5. TOTALS LINKAGE IMPLEMENTATION
 * Convert injury impacts to game total adjustments
 */
export function calculateTotalsAdjustment(teamInjuries, teamType = 'offense') {
  let totalAdjustment = 1.0; // Multiplier for game total
  let paceAdjustment = 0;    // Additive pace change
  let explosiveAdjustment = 0; // Additive explosive play change
  
  if (teamType === 'offense') {
    for (const injury of teamInjuries) {
      const config = TOTALS_ELASTICITY.OFFENSIVE_INJURY_TO_TOTAL[injury.position];
      if (!config) continue;
      
      const injuryWeight = INJURY_CONFIG.STATUS_WEIGHTS[injury.status] || 0.5;
      
      // Apply injury impact to totals
      const totalImpact = Math.pow(config.total_multiplier, injuryWeight);
      totalAdjustment *= totalImpact;
      
      // Apply pace adjustments
      paceAdjustment += config.pace_factor * injuryWeight;
      
      console.log(`📊 Offensive injury total impact: ${injury.position} ${injury.status} = ${totalImpact.toFixed(3)}x`);
    }
  } else {
    // Defensive injuries
    for (const injury of teamInjuries) {
      const config = TOTALS_ELASTICITY.DEFENSIVE_INJURY_TO_TOTAL[injury.position];
      if (!config) continue;
      
      const injuryWeight = INJURY_CONFIG.STATUS_WEIGHTS[injury.status] || 0.5;
      
      // Apply injury impact to totals  
      const totalImpact = Math.pow(config.total_multiplier, injuryWeight);
      totalAdjustment *= totalImpact;
      
      // Apply explosive play adjustments
      explosiveAdjustment += config.explosive_factor * injuryWeight;
      
      console.log(`📊 Defensive injury total impact: ${injury.position} ${injury.status} = ${totalImpact.toFixed(3)}x`);
    }
  }
  
  return {
    totalMultiplier: totalAdjustment,
    paceAdjustment: paceAdjustment,
    explosiveAdjustment: explosiveAdjustment,
    description: `${teamType} injuries: ${totalAdjustment.toFixed(3)}x total, ${paceAdjustment.toFixed(1)} pace`
  };
}

/**
 * 6. ENHANCED UNKNOWN PLAYER HANDLING
 * Use position-specific priors with package usage weighting
 */
export function getEnhancedUnknownPlayerPrior(position, packageUsage = {}) {
  const basePrior = UNKNOWN_PLAYER_PRIORS[position];
  if (!basePrior) {
    return { epa: -0.10, sigma: 0.05, impact_pts: -1.0, confidence: 0.2 };
  }
  
  // Adjust for package usage if position has variable snap counts
  let usageAdjustment = 1.0;
  
  if (position === 'WR' && packageUsage.formation) {
    const formationWeights = {
      '11_personnel': 1.0,   // Standard 3 WR usage
      '10_personnel': 1.2,   // 4 WR sets - backup more likely to play
      '12_personnel': 0.6    // 2 WR sets - backup less likely
    };
    usageAdjustment = formationWeights[packageUsage.formation] || 1.0;
  }
  
  if (position === 'CB' && packageUsage.defenseType) {
    const defenseWeights = {
      'base_defense': 0.7,   // 2 CB base - backup less likely
      'nickel': 1.0,         // 3 CB nickel - standard usage
      'dime': 1.3           // 4+ CB dime - backup more likely
    };
    usageAdjustment = defenseWeights[packageUsage.defenseType] || 1.0;
  }
  
  return {
    epa: basePrior.epa * usageAdjustment,
    sigma: basePrior.sigma,
    impact_pts: basePrior.impact_pts * usageAdjustment,
    confidence: basePrior.confidence * Math.min(usageAdjustment, 1.0),
    description: `${basePrior.description} (usage adj: ${usageAdjustment.toFixed(2)})`
  };
}

/**
 * MASTER ENHANCED CALCULATION FUNCTION
 * Integrates all GPT feedback improvements
 */
export function calculateEnhancedInjuryImpact(injury, teamDepthChart, allTeamInjuries, opponentStats, marketData, gameContext) {
  try {
    // 1. Get base player values
    const playerEPA = getPlayerValue(injury.name, injury.position);
    
    // 2. Calculate depth chart cascade
    const cascade = calculateDepthChartCascade(injury.position, teamDepthChart, allTeamInjuries);
    
    // 3. Get blended replacement EPA
    const replacement = calculateBlendedReplacementEPA(cascade.backupMix, injury.position, playerValues);
    
    // 4. Calculate raw impact
    const rawImpact = (playerEPA.epa - replacement.blendedEPA) * 
                     INJURY_CONFIG.POINTS_PER_EPA * 
                     INJURY_CONFIG.STATUS_WEIGHTS[injury.status];
    
    // 5. Apply opponent elasticity
    const opponentAdjustedImpact = applyOpponentElasticity(
      rawImpact, 
      injury.position, 
      opponentStats.defenseRank,
      opponentStats
    );
    
    // 6. Apply market anchoring if available
    const finalImpact = applyMarketAnchoring(
      opponentAdjustedImpact,
      marketData?.lineMovement,
      gameContext?.minutesToKickoff || 1440,
      replacement.confidence
    );
    
    // 7. Calculate totals adjustment
    const totalsAdjustment = calculateTotalsAdjustment([injury], 'offense');
    
    return {
      player: injury.name,
      position: injury.position,
      status: injury.status,
      spreadImpact: finalImpact,
      totalsAdjustment: totalsAdjustment,
      breakdown: {
        playerEPA: playerEPA.epa,
        replacementEPA: replacement.blendedEPA,
        replacementMix: replacement.mixDescription,
        rawImpact: rawImpact,
        opponentAdjustment: opponentAdjustedImpact / rawImpact,
        marketAnchoring: finalImpact / opponentAdjustedImpact,
        confidence: replacement.confidence
      },
      metadata: {
        depthCascade: cascade.injuryCount > 1,
        marketDataUsed: !!marketData?.lineMovement,
        opponentAdjusted: opponentStats?.defenseRank ? true : false
      }
    };
    
  } catch (error) {
    console.error(`Enhanced injury calculation failed for ${injury.name}:`, error);
    return getFallbackImpactEnhanced(injury.position, injury.status);
  }
}

/**
 * Enhanced fallback with configurable priors
 */
function getFallbackImpactEnhanced(position, status) {
  const prior = UNKNOWN_PLAYER_PRIORS[position] || UNKNOWN_PLAYER_PRIORS['WR'];
  const statusWeight = INJURY_CONFIG.STATUS_WEIGHTS[status] || 0.5;
  
  return {
    player: 'Unknown',
    position: position,
    status: status,
    spreadImpact: prior.impact_pts * statusWeight,
    totalsAdjustment: { totalMultiplier: 1.0, paceAdjustment: 0 },
    breakdown: {
      source: 'fallback_enhanced',
      confidence: prior.confidence
    }
  };
}

export default {
  calculateDepthChartCascade,
  calculateBlendedReplacementEPA,
  applyMarketAnchoring,
  applyOpponentElasticity,
  calculateTotalsAdjustment,
  getEnhancedUnknownPlayerPrior,
  calculateEnhancedInjuryImpact
};
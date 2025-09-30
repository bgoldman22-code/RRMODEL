// netlify/functions/_lib/depth-chart-safeguards-v4.mjs
// Elite Injury System v4.1 - Depth Chart Production Safeguards
// Prevents overconfident heuristic depth chart impacts per GPT feedback

import { calculateAdvancedInjuryImpact } from './advanced-injury-calculations.js';

// CONSERVATIVE DEPTH CHART LIMITS
const DEPTH_SAFEGUARDS = {
  MAX_DEPTH_IMPACT: {
    QB: 0.15,    // Max 15% EPA impact from QB depth changes
    RB: 0.08,    // Max 8% EPA impact from RB depth changes
    WR: 0.06,    // Max 6% EPA impact from WR depth changes
    TE: 0.04,    // Max 4% EPA impact from TE depth changes
    K: 0.02,     // Max 2% EPA impact from K depth changes
    DST: 0.03    // Max 3% EPA impact from DST depth changes
  },
  CONFIDENCE_PENALTIES: {
    UNVERIFIED_DEPTH: 0.15,      // 15% confidence penalty for unverified depth data
    STALE_DEPTH_DATA: 0.10,      // 10% penalty for depth data >48 hours old
    PROJECTED_STARTER: 0.20,     // 20% penalty for purely projected starters
    BACKUP_UNCERTAINTY: 0.25     // 25% penalty when backup depth unclear
  },
  DEPTH_TIER_LIMITS: {
    1: 1.0,    // Tier 1 (starter): Full impact
    2: 0.7,    // Tier 2 (backup): 70% of calculated impact
    3: 0.4,    // Tier 3 (third string): 40% of calculated impact
    4: 0.2     // Tier 4+ (depth): 20% of calculated impact
  }
};

/**
 * Apply depth chart safeguards to injury impact calculations
 * Prevents overconfident projections based on uncertain depth data
 */
function applyDepthChartSafeguards(injuryImpacts, depthChartData, gameContext = {}) {
  if (!injuryImpacts || !Array.isArray(injuryImpacts)) {
    return { safeguardedImpacts: [], warnings: ['invalid_injury_impacts'] };
  }
  
  const safeguardedImpacts = [];
  const warnings = [];
  const adjustmentLog = [];
  
  injuryImpacts.forEach(impact => {
    const safeguardedImpact = { ...impact };
    let totalPenalty = 0;
    let depthTierPenalty = 0;
    
    // 1. Validate depth tier and apply tier-based scaling
    const depthTier = getPlayerDepthTier(impact.player, impact.position, depthChartData);
    if (depthTier > 1) {
      const tierMultiplier = DEPTH_SAFEGUARDS.DEPTH_TIER_LIMITS[depthTier] || 0.1;
      depthTierPenalty = 1 - tierMultiplier;
      safeguardedImpact.epaImpact *= tierMultiplier;
      adjustmentLog.push(`${impact.player}: Depth tier ${depthTier} - ${(tierMultiplier * 100).toFixed(0)}% impact scaling`);
    }
    
    // 2. Cap maximum position impact
    const maxImpact = DEPTH_SAFEGUARDS.MAX_DEPTH_IMPACT[impact.position] || 0.05;
    if (Math.abs(safeguardedImpact.epaImpact) > maxImpact) {
      const originalImpact = safeguardedImpact.epaImpact;
      safeguardedImpact.epaImpact = Math.sign(originalImpact) * maxImpact;
      safeguardedImpact.impactCapped = true;
      safeguardedImpact.originalEpaImpact = originalImpact;
      warnings.push(`${impact.position}_impact_capped`);
      adjustmentLog.push(`${impact.player}: Impact capped from ${(originalImpact * 100).toFixed(1)}% to ${(maxImpact * 100).toFixed(1)}%`);
    }
    
    // 3. Apply confidence penalties based on data quality
    const depthDataQuality = assessDepthDataQuality(impact.player, impact.position, depthChartData, gameContext);
    Object.keys(depthDataQuality.penalties).forEach(penaltyType => {
      const penalty = depthDataQuality.penalties[penaltyType];
      totalPenalty += penalty;
      adjustmentLog.push(`${impact.player}: ${penaltyType} penalty ${(penalty * 100).toFixed(1)}%`);
    });
    
    // Apply total confidence penalty
    if (totalPenalty > 0) {
      const confidenceMultiplier = Math.max(0.3, 1 - totalPenalty); // Min 30% confidence
      safeguardedImpact.confidence = (impact.confidence || 0.8) * confidenceMultiplier;
      safeguardedImpact.confidencePenalty = totalPenalty;
      if (safeguardedImpact.confidence < 0.5) {
        warnings.push('low_confidence_depth_projection');
      }
    }
    
    // 4. Backup uncertainty scaling
    if (impact.isBackupProjection && !impact.confirmedStarter) {
      const backupPenalty = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.BACKUP_UNCERTAINTY;
      safeguardedImpact.epaImpact *= (1 - backupPenalty);
      safeguardedImpact.confidence = (safeguardedImpact.confidence || 0.8) * (1 - backupPenalty);
      safeguardedImpact.backupUncertaintyApplied = true;
      adjustmentLog.push(`${impact.player}: Backup uncertainty - ${(backupPenalty * 100).toFixed(0)}% impact reduction`);
    }
    
    // 5. Final validation - remove negligible impacts
    if (Math.abs(safeguardedImpact.epaImpact) < 0.005) { // Less than 0.5% impact
      safeguardedImpact.negligibleImpact = true;
      safeguardedImpact.epaImpact = 0;
      adjustmentLog.push(`${impact.player}: Impact negligible - zeroed out`);
    }
    
    safeguardedImpacts.push(safeguardedImpact);
  });
  
  return {
    safeguardedImpacts,
    warnings,
    adjustmentLog,
    summary: {
      originalImpacts: injuryImpacts.length,
      safeguardedImpacts: safeguardedImpacts.length,
      totalImpactReduction: calculateTotalImpactReduction(injuryImpacts, safeguardedImpacts),
      averageConfidencePenalty: calculateAverageConfidencePenalty(safeguardedImpacts)
    }
  };
}

/**
 * Get player depth tier from depth chart data
 * Returns 1 for starter, 2 for backup, 3+ for deeper
 */
function getPlayerDepthTier(playerName, position, depthChartData) {
  if (!depthChartData || !depthChartData.teams) return 3; // Conservative default
  
  // Search all teams for the player
  for (const team of Object.values(depthChartData.teams)) {
    if (!team.positions || !team.positions[position]) continue;
    
    const positionGroup = team.positions[position];
    for (let tier = 1; tier <= 4; tier++) {
      const tierKey = `tier${tier}`;
      if (positionGroup[tierKey]) {
        const tierPlayers = Array.isArray(positionGroup[tierKey]) 
          ? positionGroup[tierKey] 
          : [positionGroup[tierKey]];
        
        if (tierPlayers.some(p => 
          typeof p === 'string' ? 
            p.toLowerCase().includes(playerName.toLowerCase()) :
            p.name && p.name.toLowerCase().includes(playerName.toLowerCase())
        )) {
          return tier;
        }
      }
    }
  }
  
  return 4; // Not found - assume deep depth
}

/**
 * Assess quality of depth chart data for confidence penalties
 */
function assessDepthDataQuality(playerName, position, depthChartData, gameContext) {
  const penalties = {};
  
  // Check data freshness
  if (depthChartData && depthChartData.lastUpdated) {
    const dataAge = Date.now() - new Date(depthChartData.lastUpdated).getTime();
    const hoursOld = dataAge / (1000 * 60 * 60);
    
    if (hoursOld > 48) {
      penalties.staleData = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.STALE_DEPTH_DATA;
    }
  } else {
    penalties.unknownDataAge = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.STALE_DEPTH_DATA;
  }
  
  // Check if player is verified vs projected
  const playerDepthInfo = findPlayerInDepthChart(playerName, position, depthChartData);
  if (playerDepthInfo) {
    if (playerDepthInfo.projected && !playerDepthInfo.confirmed) {
      penalties.projectedStarter = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.PROJECTED_STARTER;
    }
    if (!playerDepthInfo.verified) {
      penalties.unverifiedDepth = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.UNVERIFIED_DEPTH;
    }
  } else {
    penalties.playerNotFound = DEPTH_SAFEGUARDS.CONFIDENCE_PENALTIES.BACKUP_UNCERTAINTY;
  }
  
  // Position-specific quality checks
  if (position === 'QB' && !playerDepthInfo?.starter) {
    penalties.backupQB = 0.1; // Extra penalty for backup QB uncertainty
  }
  
  return {
    penalties,
    totalPenalty: Object.values(penalties).reduce((sum, p) => sum + p, 0),
    dataQualityScore: Math.max(0.2, 1 - Object.values(penalties).reduce((sum, p) => sum + p, 0))
  };
}

/**
 * Find player in depth chart structure
 */
function findPlayerInDepthChart(playerName, position, depthChartData) {
  if (!depthChartData || !depthChartData.teams) return null;
  
  for (const team of Object.values(depthChartData.teams)) {
    if (!team.positions || !team.positions[position]) continue;
    
    const positionGroup = team.positions[position];
    for (let tier = 1; tier <= 4; tier++) {
      const tierKey = `tier${tier}`;
      if (positionGroup[tierKey]) {
        const tierPlayers = Array.isArray(positionGroup[tierKey]) 
          ? positionGroup[tierKey] 
          : [positionGroup[tierKey]];
        
        const foundPlayer = tierPlayers.find(p => {
          const name = typeof p === 'string' ? p : p.name;
          return name && name.toLowerCase().includes(playerName.toLowerCase());
        });
        
        if (foundPlayer) {
          return {
            tier,
            player: foundPlayer,
            starter: tier === 1,
            projected: typeof foundPlayer === 'object' && foundPlayer.projected,
            confirmed: typeof foundPlayer === 'object' && foundPlayer.confirmed,
            verified: typeof foundPlayer === 'object' && foundPlayer.verified
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Calculate total impact reduction percentage
 */
function calculateTotalImpactReduction(originalImpacts, safeguardedImpacts) {
  const originalTotal = originalImpacts.reduce((sum, impact) => sum + Math.abs(impact.epaImpact || 0), 0);
  const safeguardedTotal = safeguardedImpacts.reduce((sum, impact) => sum + Math.abs(impact.epaImpact || 0), 0);
  
  if (originalTotal === 0) return 0;
  return ((originalTotal - safeguardedTotal) / originalTotal) * 100;
}

/**
 * Calculate average confidence penalty
 */
function calculateAverageConfidencePenalty(safeguardedImpacts) {
  const penalizedImpacts = safeguardedImpacts.filter(impact => impact.confidencePenalty);
  if (penalizedImpacts.length === 0) return 0;
  
  const totalPenalty = penalizedImpacts.reduce((sum, impact) => sum + impact.confidencePenalty, 0);
  return (totalPenalty / penalizedImpacts.length) * 100;
}

/**
 * Validate depth chart consistency across positions
 * Helps catch obvious depth chart errors
 */
function validateDepthChartConsistency(depthChartData, teamAbbr) {
  const warnings = [];
  const team = depthChartData?.teams?.[teamAbbr];
  
  if (!team || !team.positions) {
    return { warnings: ['no_depth_chart_data'], valid: false };
  }
  
  // Check for missing key positions
  const keyPositions = ['QB', 'RB', 'WR', 'TE'];
  keyPositions.forEach(pos => {
    if (!team.positions[pos] || !team.positions[pos].tier1) {
      warnings.push(`missing_${pos.toLowerCase()}_starter`);
    }
  });
  
  // Check for duplicate starters
  const allStarters = [];
  Object.values(team.positions).forEach(posGroup => {
    if (posGroup.tier1) {
      const starters = Array.isArray(posGroup.tier1) ? posGroup.tier1 : [posGroup.tier1];
      starters.forEach(starter => {
        const name = typeof starter === 'string' ? starter : starter.name;
        if (name && allStarters.includes(name)) {
          warnings.push(`duplicate_starter_${name.replace(/\s+/g, '_')}`);
        } else if (name) {
          allStarters.push(name);
        }
      });
    }
  });
  
  return {
    warnings,
    valid: warnings.length === 0,
    starterCount: allStarters.length,
    dataQuality: Math.max(0.3, 1 - (warnings.length * 0.1))
  };
}

export {
  applyDepthChartSafeguards,
  getPlayerDepthTier,
  assessDepthDataQuality,
  validateDepthChartConsistency,
  DEPTH_SAFEGUARDS
};
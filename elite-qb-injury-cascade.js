// ELITE QB INJURY CASCADE EFFECTS FOR TD MODELING

const QB_INJURY_CASCADES = {
  // QB Rating Impact on Position TD Shares
  qb_out: {
    RB: { share_multiplier: 1.25, rz_efficiency: 1.15 },    // More rushing, checkdowns
    WR1: { share_multiplier: 0.85, rz_efficiency: 0.9 },    // Less deep threats
    WR2: { share_multiplier: 1.1, rz_efficiency: 1.05 },    // More slot/safety valve
    TE: { share_multiplier: 1.2, rz_efficiency: 1.1 }       // More checkdown targets
  },
  qb_doubtful: {
    RB: { share_multiplier: 1.1, rz_efficiency: 1.05 },
    WR1: { share_multiplier: 0.95, rz_efficiency: 0.97 },
    WR2: { share_multiplier: 1.05, rz_efficiency: 1.02 },
    TE: { share_multiplier: 1.08, rz_efficiency: 1.03 }
  }
};

const GAMEPLAN_ADJUSTMENTS = {
  // How backup QBs change offensive philosophy
  elite_to_backup: {
    rz_pass_rate: -0.15,      // 15% fewer pass attempts in RZ
    avg_target_depth: -2.3,   // 2.3 yards shorter avg target
    checkdown_rate: +0.22,    // 22% more checkdowns
    designed_runs: +0.18      // 18% more designed QB/RB runs
  },
  good_to_backup: {
    rz_pass_rate: -0.08,
    avg_target_depth: -1.1,
    checkdown_rate: +0.12,
    designed_runs: +0.09
  }
};

// Example: Josh Allen (elite) to Mitch Trubisky (backup)
function calculateQBInjuryCascade(teamCode, qbStatus, position, baseShare) {
  const qbTier = getQBTier(teamCode); // elite, good, average, poor
  const cascade = QB_INJURY_CASCADES[qbStatus];
  
  if (!cascade || qbStatus === 'active') return baseShare;
  
  const positionAdjustment = cascade[position];
  if (!positionAdjustment) return baseShare;
  
  // Apply position-specific adjustments
  let adjustedShare = baseShare * positionAdjustment.share_multiplier;
  
  // Apply gameplan philosophy changes
  const gameplanShift = getGameplanShift(qbTier, 'backup');
  adjustedShare *= (1 + gameplanShift.relative_usage[position]);
  
  return Math.max(0.05, Math.min(0.65, adjustedShare)); // Reasonable bounds
}

// Elite Model: Position interdependencies
function calculatePositionInterdependencies(injuries, baseShares) {
  let adjustedShares = { ...baseShares };
  
  // QB injury cascade effects
  if (injuries.qb_status !== 'active') {
    Object.keys(adjustedShares).forEach(pos => {
      adjustedShares[pos] = calculateQBInjuryCascade(
        injuries.team, 
        injuries.qb_status, 
        pos, 
        adjustedShares[pos]
      );
    });
  }
  
  // WR1 injury → WR2/TE bump, but not full replacement
  if (injuries.wr1_out) {
    adjustedShares.WR2 *= 1.3;  // Not 1.0 + WR1 share (over-reduction prevention)
    adjustedShares.TE *= 1.15;
    adjustedShares.RB *= 1.05;  // Slight bump from more checkdowns
  }
  
  // Normalize to ensure shares sum properly
  const totalShare = Object.values(adjustedShares).reduce((a, b) => a + b, 0);
  if (totalShare > 1.0) {
    Object.keys(adjustedShares).forEach(pos => {
      adjustedShares[pos] /= totalShare;
    });
  }
  
  return adjustedShares;
}

// Key Insight: Model the SYSTEM change, not just player replacement
function getEliteInjuryAdjustment(teamCode, injuries, baseMetrics) {
  const originalGameplan = getTeamGameplan(teamCode);
  const injuryAdjustedGameplan = adjustGameplanForInjuries(originalGameplan, injuries);
  
  return {
    gameplanning: injuryAdjustedGameplan,
    positionShares: calculatePositionInterdependencies(injuries, baseMetrics.shares),
    rzEfficiency: calculateRZEfficiencyChange(injuries, originalGameplan),
    confidence: calculateConfidenceReduction(injuries)
  };
}

module.exports = {
  calculateQBInjuryCascade,
  calculatePositionInterdependencies,
  getEliteInjuryAdjustment,
  QB_INJURY_CASCADES,
  GAMEPLAN_ADJUSTMENTS
};
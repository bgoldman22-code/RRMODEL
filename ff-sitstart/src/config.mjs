// Scoring weights and defaults
export const CONFIG = {
  weights: {
    script: parseFloat(process.env.WEIGHT_SCRIPT) || 0.35,
    impliedTotal: parseFloat(process.env.WEIGHT_IMPLIED_TOTAL) || 0.25,
    injury: parseFloat(process.env.WEIGHT_INJURY) || 0.20,
    bye: parseFloat(process.env.WEIGHT_BYE) || 1.00
  },
  
  defaults: {
    pprFallback: parseFloat(process.env.DEFAULT_PPR_FALLBACK) || 0.5
  },
  
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS) || 3600
  },
  
  // Tier boundaries (z-score)
  tiers: {
    S: 1.2,
    A: 0.6,
    B: -0.2,
    C: -0.8
    // D: < -0.8
  },
  
  // Script lean thresholds
  scriptThresholds: {
    favoriteBy: 4.5,  // ≥ this = run lean
    underdogBy: 4.5   // ≥ this = pass lean
  },
  
  // 2+ TD ceiling bonus weights by position
  ceilingWeights: {
    RB: 0.8,   // Strong ceiling from multiple TDs
    TE: 0.6,   // Moderate ceiling
    WR: 0.35,  // Small ceiling (more TD variance)
    QB: 0.0,   // No bonus (pass TDs already in props)
    K: 0.0,    // No bonus
    DST: 0.0   // No bonus
  },
  
  // Injury status penalties
  injuryPenalties: {
    'Q': -0.3,   // Questionable
    'D': -0.8,   // Doubtful
    'O': -999,   // Out (hard exclude)
    'IR': -999,  // IR (hard exclude)
    'PUP': -999, // PUP (hard exclude)
    'SUSP': -999 // Suspended (hard exclude)
  },
  
  // D/ST points allowed scoring (Yahoo standard)
  dstPointsAllowed: [
    { max: 0, points: 10 },
    { max: 6, points: 7 },
    { max: 13, points: 4 },
    { max: 20, points: 1 },
    { max: 27, points: 0 },
    { max: 34, points: -1 },
    { max: Infinity, points: -4 }
  ]
};

export default CONFIG;

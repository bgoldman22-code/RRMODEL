// netlify/functions/_lib/injury-system-config.js
// Centralized configuration for injury impact system - GPT Feedback Implementation

/**
 * INJURY SYSTEM CONFIGURATION
 * Centralized knobs for AB testing and tuning
 */

// 1. CORE CONVERSION FACTORS
export const INJURY_CONFIG = {
  // EPA to Points Conversion
  POINTS_PER_EPA: 3.75, // Moved down from 4.5 for market realism
  
  // Residual Decay Time Constants (in games/weeks)
  TAU_QB_GAMES: 3.5,     // QBs recover impact slower (more complex position)
  TAU_NON_QB_GAMES: 2.5, // Skill positions recover faster
  TAU_OLINE_GAMES: 4.0,  // O-line chemistry takes time to rebuild
  TAU_DEFENSE_GAMES: 2.0, // Defense adapts quicker
  
  // QB Specific Safeguards
  QB_SHRINK: 0.65,        // Reduce QB impacts by 35% (0.60-0.70 range)
  QB_SOFT_CAP_PTS: 8.5,   // Maximum QB impact (8-9 point range)
  QB_HARD_CAP_PTS: 12.0,  // Absolute maximum for extreme cases
  
  // Status Impact Multipliers (refined based on NFL analysis)
  STATUS_WEIGHTS: {
    'out': 1.0,           // 100% impact - player unavailable
    'doubtful': 0.2,      // 20% impact - very likely backup plays
    'questionable': 0.45, // 45% impact - uncertain availability/effectiveness  
    'probable': 0.8,      // 80% impact - likely plays but not 100%
    'active': 0.0         // 0% impact - fully healthy
  },
  
  // Snap Share Adjustments by Position
  SNAP_SHARES: {
    'QB': { starter: 0.95, backup: 0.95 },      // QBs play almost every snap
    'RB': { starter: 0.65, backup: 0.45 },      // RBs share more in committees
    'WR': { starter: 0.75, backup: 0.60 },      // WRs depend on role/packages
    'TE': { starter: 0.80, backup: 0.65 },      // TEs often multi-down players
    'OL': { starter: 0.98, backup: 0.98 },      // O-line plays every snap
    'DB': { starter: 0.85, backup: 0.70 },      // DBs rotate in packages
    'LB': { starter: 0.75, backup: 0.55 },      // LBs package-dependent
    'DL': { starter: 0.70, backup: 0.50 }       // D-line rotates frequently
  },
  
  // Market Anchoring Weights (distance to kickoff)
  MARKET_ANCHORING: {
    '24h': 0.6,    // 60% model, 40% market at 24 hours
    '12h': 0.55,   // Shift toward market as kickoff approaches
    '4h': 0.45,    // 45% model, 55% market at 4 hours
    '2h': 0.4,     // 40% model, 60% market at 2 hours  
    '1h': 0.35,    // 35% model, 65% market at 1 hour
    '30m': 0.3     // 30% model, 70% market at 30 minutes
  },
  
  // Opponent Elasticity Factors
  OPPONENT_FACTORS: {
    // Defense rank adjustments (1-32, lower is better)
    ELITE_DEFENSE_THRESHOLD: 8,    // Top 8 defenses
    WEAK_DEFENSE_THRESHOLD: 25,    // Bottom 8 defenses
    
    ELITE_DEF_QB_REDUCTION: 0.85,  // 15% reduction vs elite D (scheme hides backup)
    WEAK_DEF_QB_AMPLIFICATION: 1.15, // 15% increase vs weak D (backup more exposed)
    
    ELITE_DEF_SKILL_REDUCTION: 0.90,   // 10% reduction for skill positions vs elite D
    WEAK_DEF_SKILL_AMPLIFICATION: 1.10  // 10% increase vs weak D
  }
};

// 2. UNKNOWN PLAYER PRIORS BY POSITION
export const UNKNOWN_PLAYER_PRIORS = {
  // Position-specific fallback values with confidence intervals
  'QB': { 
    epa: -0.15, 
    sigma: 0.08, 
    impact_pts: -6.5,
    confidence: 0.3,
    description: 'Backup QB average'
  },
  'WR': { 
    epa: -0.05, 
    sigma: 0.04, 
    impact_pts: -0.7,
    confidence: 0.5,
    description: 'WR depth chart replacement'
  },
  'RB': { 
    epa: -0.03, 
    sigma: 0.03, 
    impact_pts: -0.4,
    confidence: 0.6,
    description: 'RB committee member'
  },
  'TE': { 
    epa: -0.04, 
    sigma: 0.03, 
    impact_pts: -0.5,
    confidence: 0.5,
    description: 'TE backup/specialist'
  },
  'OL': { 
    epa: -0.06, 
    sigma: 0.04, 
    impact_pts: -1.2,
    confidence: 0.4,
    description: 'O-line depth/swing'
  },
  'CB': { 
    epa: -0.04, 
    sigma: 0.05, 
    impact_pts: -0.6,
    confidence: 0.4,
    description: 'CB depth/nickel'
  },
  'S': { 
    epa: -0.03, 
    sigma: 0.04, 
    impact_pts: -0.5,
    confidence: 0.5,
    description: 'Safety depth/specialist'
  },
  'LB': { 
    epa: -0.03, 
    sigma: 0.04, 
    impact_pts: -0.4,
    confidence: 0.5,
    description: 'LB depth/specialist'
  },
  'DL': { 
    epa: -0.04, 
    sigma: 0.04, 
    impact_pts: -0.5,
    confidence: 0.5,
    description: 'D-line rotation'
  }
};

// 3. PACKAGE USAGE WEIGHTS
export const PACKAGE_USAGE = {
  // Percentage of snaps by formation package
  'WR': {
    '11_personnel': 0.65,  // 3 WR sets (most common)
    '10_personnel': 0.20,  // 4 WR sets  
    '12_personnel': 0.15   // 2 WR sets
  },
  'CB': {
    'base_defense': 0.35,  // 2 CB base
    'nickel': 0.50,        // 3 CB nickel (most common)
    'dime': 0.15          // 4+ CB dime
  },
  'LB': {
    'base_defense': 0.40,  // 3-4 LB base
    'nickel': 0.45,        // 2 LB nickel
    'dime': 0.15          // 1-2 LB dime
  }
};

// 4. TOTALS ADJUSTMENT MAPPINGS
export const TOTALS_ELASTICITY = {
  // How offensive injuries affect game totals
  OFFENSIVE_INJURY_TO_TOTAL: {
    'QB': {
      pace_factor: -0.8,      // QB injuries slow pace significantly
      success_factor: -1.2,   // Reduce offensive success rate
      total_multiplier: 0.85  // 15% reduction in total scoring
    },
    'WR': {
      pace_factor: -0.3,      // WR injuries slightly slow pace
      success_factor: -0.6,   // Moderate success rate reduction
      total_multiplier: 0.92  // 8% reduction in total scoring
    },
    'RB': {
      pace_factor: 0.1,       // RB injuries may increase pass rate (faster)
      success_factor: -0.4,   // Slight success rate reduction
      total_multiplier: 0.95  // 5% reduction in total scoring
    },
    'OL': {
      pace_factor: -0.4,      // O-line injuries slow everything down
      success_factor: -0.8,   // Significant success rate hit
      total_multiplier: 0.88  // 12% reduction in total scoring
    }
  },
  
  // How defensive injuries affect game totals
  DEFENSIVE_INJURY_TO_TOTAL: {
    'CB': {
      explosive_factor: 0.6,   // More explosive plays allowed
      total_multiplier: 1.08   // 8% increase in total scoring
    },
    'S': {
      explosive_factor: 0.4,   // Some explosive plays allowed
      total_multiplier: 1.05   // 5% increase in total scoring
    },
    'EDGE': {
      explosive_factor: 0.5,   // Less pass rush = more explosives
      total_multiplier: 1.06   // 6% increase in total scoring
    },
    'LB': {
      explosive_factor: 0.3,   // Moderate impact on explosives
      total_multiplier: 1.04   // 4% increase in total scoring
    }
  }
};

// 5. DEPTH CHART CASCADE CONFIGURATION
export const DEPTH_CHART_CONFIG = {
  // How to handle multiple injuries at same position
  MAX_DEPTH_CONSIDERED: 3,    // Only consider top 3 players at each position
  BACKUP_BLEND_THRESHOLD: 2,  // When to start blending multiple backups
  
  // Snap distribution when multiple players are out
  INJURY_CASCADE_WEIGHTS: {
    'single_injury': { backup1: 1.0 },
    'double_injury': { backup1: 0.7, backup2: 0.3 },
    'triple_injury': { backup1: 0.5, backup2: 0.3, backup3: 0.2 }
  }
};

// 6. VALIDATION AND TESTING MODES
export const TESTING_CONFIG = {
  // AB testing flags
  ENABLE_MARKET_ANCHORING: true,
  ENABLE_OPPONENT_ELASTICITY: true,
  ENABLE_TOTALS_LINKAGE: true,
  ENABLE_DEPTH_CASCADE: true,
  
  // Validation thresholds
  MIN_CONFIDENCE_THRESHOLD: 0.3,
  MAX_SINGLE_PLAYER_IMPACT: 15.0,  // Absolute max impact for any single player
  
  // Logging levels
  LOG_DETAILED_CALCULATIONS: true,
  LOG_MARKET_COMPARISONS: true,
  LOG_BACKUP_CASCADES: true
};

/**
 * Get configuration value with environment override support
 */
export function getConfigValue(path, defaultValue) {
  const envKey = `INJURY_${path.toUpperCase().replace('.', '_')}`;
  const envValue = process.env[envKey];
  
  if (envValue !== undefined) {
    // Try to parse as number first, then boolean, then string
    if (!isNaN(envValue)) return Number(envValue);
    if (envValue.toLowerCase() === 'true') return true;
    if (envValue.toLowerCase() === 'false') return false;
    return envValue;
  }
  
  return defaultValue;
}

/**
 * Get market anchoring weight based on time to kickoff
 */
export function getMarketAnchoringWeight(minutesToKickoff) {
  const config = INJURY_CONFIG.MARKET_ANCHORING;
  
  if (minutesToKickoff >= 1440) return config['24h'];      // 24+ hours
  if (minutesToKickoff >= 720) return config['12h'];       // 12+ hours  
  if (minutesToKickoff >= 240) return config['4h'];        // 4+ hours
  if (minutesToKickoff >= 120) return config['2h'];        // 2+ hours
  if (minutesToKickoff >= 60) return config['1h'];         // 1+ hour
  if (minutesToKickoff >= 30) return config['30m'];        // 30+ minutes
  
  return config['30m']; // Default to 30m weight for < 30 minutes
}

/**
 * Get opponent adjustment factor based on defense ranking
 */
export function getOpponentAdjustmentFactor(position, opponentDefenseRank) {
  const config = INJURY_CONFIG.OPPONENT_FACTORS;
  
  if (opponentDefenseRank <= config.ELITE_DEFENSE_THRESHOLD) {
    // Elite defense - reduces backup impact (scheme can hide weaknesses)
    return position === 'QB' ? config.ELITE_DEF_QB_REDUCTION : config.ELITE_DEF_SKILL_REDUCTION;
  }
  
  if (opponentDefenseRank >= config.WEAK_DEFENSE_THRESHOLD) {
    // Weak defense - amplifies backup impact (weaknesses more exposed)
    return position === 'QB' ? config.WEAK_DEF_QB_AMPLIFICATION : config.WEAK_DEF_SKILL_AMPLIFICATION;
  }
  
  // Average defense - no adjustment
  return 1.0;
}

export default INJURY_CONFIG;
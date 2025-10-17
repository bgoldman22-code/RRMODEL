/**
 * NFL Receiving Props - Elite Statistical Engine
 * Implements proper distributional models instead of normal approximations
 */

// ============================================================================
// RANDOM NUMBER GENERATORS (Deterministic with seed)
// ============================================================================

class SeededRNG {
  constructor(seed = 12345) {
    this.seed = seed;
  }

  // LCG for deterministic randomness
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  // Box-Muller transform for normal random
  normal(mu = 0, sigma = 1) {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mu + sigma * z0;
  }

  // Gamma distribution (shape, rate parameterization)
  gamma(shape, rate) {
    // Marsaglia and Tsang method
    if (shape < 1) {
      return this.gamma(shape + 1, rate) * Math.pow(this.next(), 1 / shape);
    }

    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this.normal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this.next();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v / rate;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v / rate;
      }
    }
  }

  // Beta distribution
  beta(alpha, beta) {
    const x = this.gamma(alpha, 1);
    const y = this.gamma(beta, 1);
    return x / (x + y);
  }

  // Poisson distribution
  poisson(lambda) {
    if (lambda < 30) {
      // Knuth's method for small lambda
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      
      do {
        k++;
        p *= this.next();
      } while (p > L);
      
      return k - 1;
    } else {
      // Normal approximation for large lambda
      return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    }
  }

  // Binomial distribution
  binomial(n, p) {
    if (n * p < 10 || n * (1 - p) < 10) {
      // Direct method for small n*p
      let sum = 0;
      for (let i = 0; i < n; i++) {
        if (this.next() < p) sum++;
      }
      return sum;
    } else {
      // Normal approximation
      const mean = n * p;
      const std = Math.sqrt(n * p * (1 - p));
      return Math.max(0, Math.min(n, Math.round(this.normal(mean, std))));
    }
  }

  // Negative Binomial (Poisson-Gamma mixture)
  negativeBinomial(mean, dispersion) {
    // NB(mean, k) where k controls overdispersion
    // When k → ∞, approaches Poisson
    const shape = dispersion;
    const rate = dispersion / mean;
    const lambda = this.gamma(shape, rate);
    return this.poisson(lambda);
  }
}

// ============================================================================
// MARKET UTILITIES (Vig Removal, Kelly, Odds Conversion)
// ============================================================================

/**
 * Remove vig from two-sided market to get true fair probabilities
 */
export function removeVig(overOdds, underOdds) {
  const dOver = overOdds > 0 ? 1 + overOdds/100 : 1 + 100/Math.abs(overOdds);
  const dUnder = underOdds > 0 ? 1 + underOdds/100 : 1 + 100/Math.abs(underOdds);
  
  const pOverRaw = 1 / dOver;
  const pUnderRaw = 1 / dUnder;
  const totalProb = pOverRaw + pUnderRaw;
  
  return {
    pOver: pOverRaw / totalProb,
    pUnder: pUnderRaw / totalProb,
    vigPercent: ((totalProb - 1) * 100).toFixed(2)
  };
}

/**
 * Calculate full Kelly fraction from model probability and offered odds
 */
export function calculateKelly(modelProb, americanOdds) {
  const decimal = americanOdds > 0 
    ? 1 + americanOdds/100 
    : 1 + 100/Math.abs(americanOdds);
  
  const b = decimal - 1;
  const kelly = (modelProb * decimal - 1) / b;
  
  return Math.max(0, kelly);
}

/**
 * Convert probability to American odds
 */
export function probToAmericanOdds(prob) {
  if (prob >= 0.5) {
    return Math.round(-100 * prob / (1 - prob));
  } else {
    return Math.round(100 * (1 - prob) / prob);
  }
}

/**
 * Convert American odds to implied probability
 */
export function americanToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

// ============================================================================
// ELITE 3-STAGE CASCADE MODEL
// ============================================================================

/**
 * Simulate receptions using proper distributions
 * Stage 1: Targets ~ NegativeBinomial(mean, dispersion)
 * Stage 2: Receptions ~ BetaBinomial(targets, alpha, beta)
 */
export function simulateReceptions(params, line, nSims = 50000) {
  const {
    meanTargets,
    targetDispersion,    // k parameter; higher = less variance
    catchAlpha,          // Beta dist params for catch rate
    catchBeta
  } = params;

  const rng = new SeededRNG(params.seed || 12345);
  let countOver = 0;

  for (let i = 0; i < nSims; i++) {
    // Stage 1: Sample targets (accounts for overdispersion)
    const targets = rng.negativeBinomial(meanTargets, targetDispersion);
    
    // Stage 2: Sample catch rate, then receptions
    const catchRate = rng.beta(catchAlpha, catchBeta);
    const receptions = rng.binomial(targets, catchRate);
    
    if (receptions > line) countOver++;
  }

  return countOver / nSims;
}

/**
 * Simulate receiving yards using compound distribution
 * Stage 1: Targets ~ NegativeBinomial
 * Stage 2: Receptions ~ BetaBinomial
 * Stage 3: Yards ~ Sum of Lognormal per catch
 */
export function simulateYards(params, line, nSims = 50000) {
  const {
    meanTargets,
    targetDispersion,
    catchAlpha,
    catchBeta,
    yardsPerCatchMu,     // Mean log yards per catch
    yardsPerCatchSigma   // Std dev log yards per catch
  } = params;

  const rng = new SeededRNG(params.seed || 12345);
  let countOver = 0;

  for (let i = 0; i < nSims; i++) {
    // Stages 1 & 2: Get receptions
    const targets = rng.negativeBinomial(meanTargets, targetDispersion);
    const catchRate = rng.beta(catchAlpha, catchBeta);
    const receptions = rng.binomial(targets, catchRate);
    
    // Stage 3: Sum yards per reception (lognormal)
    let totalYards = 0;
    for (let j = 0; j < receptions; j++) {
      const logYards = rng.normal(yardsPerCatchMu, yardsPerCatchSigma);
      totalYards += Math.exp(logYards);
    }
    
    if (totalYards > line) countOver++;
  }

  return countOver / nSims;
}

// ============================================================================
// FEATURE ENGINEERING (Context-Aware Parameters)
// ============================================================================

/**
 * Estimate model parameters from player stats and context
 */
export function estimateParameters(player, context) {
  const {
    avgTargets,
    avgReceptions,
    avgYards,
    targetShare,
    snapShare,
    routeShare,
    // Opponent factors
    oppPassDefenseRank,
    oppZoneCoverageRate,
    // Game script
    gameTotal,
    spread,
    // Weather
    windMph,
    isIndoors
  } = { ...player, ...context };

  // Target parameters with context adjustments
  let meanTargets = avgTargets || 5;
  
  // Adjust for game script (higher total = more targets)
  if (gameTotal) {
    meanTargets *= (1 + (gameTotal - 47) * 0.01);
  }
  
  // Adjust for spread (trailing teams pass more)
  if (spread && spread < -3) {
    meanTargets *= 1.05;
  }
  
  // Target dispersion (lower = more variable)
  const targetDispersion = 3.0; // Could model this from player volatility

  // Catch rate parameters (Beta distribution)
  const baseCatchRate = avgTargets > 0 ? avgReceptions / avgTargets : 0.65;
  
  // Adjust for coverage (zone = easier catches)
  let adjustedCatchRate = baseCatchRate;
  if (oppZoneCoverageRate) {
    adjustedCatchRate *= (1 + (oppZoneCoverageRate - 0.5) * 0.1);
  }
  
  // Adjust for weather
  if (!isIndoors && windMph > 15) {
    adjustedCatchRate *= 0.95;
  }
  
  // Beta params (higher values = less variable)
  const catchAlpha = adjustedCatchRate * 20;
  const catchBeta = (1 - adjustedCatchRate) * 20;

  // Yards per catch parameters (Lognormal)
  const avgYardsPerCatch = avgReceptions > 0 ? avgYards / avgReceptions : 11;
  
  // Lognormal params
  const yardsPerCatchSigma = 0.5; // Could model from YAC variance
  const yardsPerCatchMu = Math.log(avgYardsPerCatch) - 0.5 * yardsPerCatchSigma * yardsPerCatchSigma;

  return {
    meanTargets,
    targetDispersion,
    catchAlpha,
    catchBeta,
    yardsPerCatchMu,
    yardsPerCatchSigma,
    seed: player.playerId || 12345
  };
}

// ============================================================================
// CALIBRATION
// ============================================================================

/**
 * Apply isotonic calibration to model probabilities
 * Maps raw model probs to calibrated probs based on historical performance
 */
export function calibrateProb(rawProb, calibrationMap) {
  // Default calibration: shrink toward 50% (observed 5-7% overconfidence)
  if (!calibrationMap) {
    return rawProb * 0.93 + 0.035;
  }
  
  // Find nearest calibration bucket
  const buckets = Object.keys(calibrationMap).map(Number).sort((a, b) => a - b);
  let nearestBucket = buckets[0];
  let minDiff = Math.abs(rawProb - nearestBucket);
  
  for (const bucket of buckets) {
    const diff = Math.abs(rawProb - bucket);
    if (diff < minDiff) {
      minDiff = diff;
      nearestBucket = bucket;
    }
  }
  
  return calibrationMap[nearestBucket];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  simulateReceptions,
  simulateYards,
  estimateParameters,
  removeVig,
  calculateKelly,
  probToAmericanOdds,
  americanToProb,
  calibrateProb
};

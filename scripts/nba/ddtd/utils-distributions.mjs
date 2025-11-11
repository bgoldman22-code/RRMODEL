/**
 * Distribution utilities for DD/TD modeling
 * Provides marginal distributions (log-normal, beta-PERT, Negative Binomial)
 * with seeded randomness for reproducibility
 */

/**
 * Seeded random number generator (Mulberry32)
 * @param {number} seed - Integer seed
 * @returns {Function} Random number generator [0,1)
 */
export function createRNG(seed) {
  let state = seed;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform for normal distribution
 * @param {Function} rng - Random number generator
 * @returns {number} Standard normal N(0,1) sample
 */
export function normalSample(rng) {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Log-normal distribution for minutes
 * @param {number} mu - Mean of log(minutes)
 * @param {number} sigma - Std dev of log(minutes)
 * @param {Function} rng - Random number generator
 * @returns {number} Sample from log-normal distribution
 */
export function logNormalSample(mu, sigma, rng) {
  const z = normalSample(rng);
  return Math.exp(mu + sigma * z);
}

/**
 * Beta-PERT distribution for minutes (alternative to log-normal)
 * @param {number} min - Minimum minutes (e.g., 0)
 * @param {number} mode - Most likely minutes
 * @param {number} max - Maximum minutes (e.g., 48)
 * @param {Function} rng - Random number generator
 * @returns {number} Sample from Beta-PERT distribution
 */
export function betaPERTSample(min, mode, max, rng) {
  // PERT parameters
  const mu = (min + 4 * mode + max) / 6;
  const alpha = (mu - min) * (2 * mode - min - max) / ((mode - mu) * (max - min));
  const beta = alpha * (max - mu) / (mu - min);
  
  // Beta samples via gamma ratio
  const g1 = gammaSample(alpha, rng);
  const g2 = gammaSample(beta, rng);
  const betaSample = g1 / (g1 + g2);
  
  return min + betaSample * (max - min);
}

/**
 * Gamma distribution (for beta sampling)
 * @param {number} shape - Shape parameter (alpha)
 * @param {Function} rng - Random number generator
 * @returns {number} Sample from Gamma(shape, 1)
 */
export function gammaSample(shape, rng) {
  // Marsaglia and Tsang's method
  if (shape < 1) {
    return gammaSample(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  
  while (true) {
    let x, v;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    const u = rng();
    
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }
    
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Negative Binomial distribution for points (overdispersed)
 * @param {number} mu - Mean
 * @param {number} size - Dispersion parameter (larger = less overdispersion)
 * @param {Function} rng - Random number generator
 * @returns {number} Sample from NB(mu, size)
 */
export function negativeBinomialSample(mu, size, rng) {
  // NB via Gamma-Poisson mixture
  const lambda = gammaSample(size, rng) * (mu / size);
  return poissonSample(lambda, rng);
}

/**
 * Poisson distribution
 * @param {number} lambda - Rate parameter
 * @param {Function} rng - Random number generator
 * @returns {number} Sample from Poisson(lambda)
 */
export function poissonSample(lambda, rng) {
  // Knuth's algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  
  do {
    k++;
    p *= rng();
  } while (p > L);
  
  return k - 1;
}

/**
 * Gaussian copula sampling for correlated stats
 * @param {Array<Function>} marginalCDFs - Array of marginal CDF functions
 * @param {Array<Array<number>>} correlationMatrix - Correlation matrix R
 * @param {number} nSamples - Number of samples to generate
 * @param {number} seed - Random seed
 * @returns {Array<Array<number>>} Samples [nSamples x nDimensions]
 */
export function gaussianCopulaSamples(marginalCDFs, correlationMatrix, nSamples, seed) {
  const rng = createRNG(seed);
  const nDims = marginalCDFs.length;
  
  // Cholesky decomposition of correlation matrix
  const L = choleskyDecomposition(correlationMatrix);
  
  const samples = [];
  
  for (let i = 0; i < nSamples; i++) {
    // Generate standard normal vector
    const z = Array(nDims).fill(0).map(() => normalSample(rng));
    
    // Correlate via Cholesky: x = L * z
    const x = Array(nDims).fill(0);
    for (let j = 0; j < nDims; j++) {
      for (let k = 0; k <= j; k++) {
        x[j] += L[j][k] * z[k];
      }
    }
    
    // Transform to uniform [0,1] via standard normal CDF
    const u = x.map(val => normalCDF(val));
    
    // Apply inverse marginal CDFs (quantile functions)
    const sample = u.map((ui, idx) => marginalCDFs[idx](ui));
    samples.push(sample);
  }
  
  return samples;
}

/**
 * Cholesky decomposition (lower triangular)
 * @param {Array<Array<number>>} A - Symmetric positive definite matrix
 * @returns {Array<Array<number>>} Lower triangular matrix L where A = L * L^T
 */
export function choleskyDecomposition(A) {
  const n = A.length;
  const L = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      
      if (i === j) {
        L[i][j] = Math.sqrt(A[i][i] - sum);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  
  return L;
}

/**
 * Standard normal CDF (approximation)
 * @param {number} x - Input value
 * @returns {number} Φ(x)
 */
export function normalCDF(x) {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return x > 0 ? 1 - prob : prob;
}

/**
 * Build empirical CDF from samples
 * @param {Array<number>} samples - Array of samples (will be sorted)
 * @returns {Function} CDF function (quantile function)
 */
export function buildEmpiricalCDF(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  
  return function(u) {
    if (u <= 0) return sorted[0];
    if (u >= 1) return sorted[sorted.length - 1];
    
    const idx = u * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    
    if (lower === upper) return sorted[lower];
    
    // Linear interpolation
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };
}

/**
 * Calculate correlation matrix from samples
 * @param {Array<Array<number>>} samples - Samples [nSamples x nDimensions]
 * @returns {Array<Array<number>>} Correlation matrix
 */
export function calculateCorrelation(samples) {
  const nSamples = samples.length;
  const nDims = samples[0].length;
  
  // Calculate means
  const means = Array(nDims).fill(0);
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nDims; j++) {
      means[j] += samples[i][j];
    }
  }
  for (let j = 0; j < nDims; j++) {
    means[j] /= nSamples;
  }
  
  // Calculate covariance matrix
  const cov = Array(nDims).fill(0).map(() => Array(nDims).fill(0));
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nDims; j++) {
      for (let k = 0; k < nDims; k++) {
        cov[j][k] += (samples[i][j] - means[j]) * (samples[i][k] - means[k]);
      }
    }
  }
  
  // Convert to correlation
  const R = Array(nDims).fill(0).map(() => Array(nDims).fill(0));
  for (let j = 0; j < nDims; j++) {
    for (let k = 0; k < nDims; k++) {
      const stdJ = Math.sqrt(cov[j][j] / nSamples);
      const stdK = Math.sqrt(cov[k][k] / nSamples);
      R[j][k] = (cov[j][k] / nSamples) / (stdJ * stdK);
    }
  }
  
  return R;
}

/**
 * Shrink correlation matrix toward identity (regularization)
 * @param {Array<Array<number>>} R - Sample correlation matrix
 * @param {number} shrinkage - Shrinkage intensity [0, 1]
 * @returns {Array<Array<number>>} Shrunk correlation matrix
 */
export function shrinkCorrelation(R, shrinkage) {
  const n = R.length;
  const identity = Array(n).fill(0).map((_, i) => 
    Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
  );
  
  const shrunk = Array(n).fill(0).map((_, i) =>
    Array(n).fill(0).map((_, j) =>
      (1 - shrinkage) * R[i][j] + shrinkage * identity[i][j]
    )
  );
  
  return shrunk;
}

export default {
  createRNG,
  normalSample,
  logNormalSample,
  betaPERTSample,
  gammaSample,
  negativeBinomialSample,
  poissonSample,
  gaussianCopulaSamples,
  choleskyDecomposition,
  normalCDF,
  buildEmpiricalCDF,
  calculateCorrelation,
  shrinkCorrelation
};

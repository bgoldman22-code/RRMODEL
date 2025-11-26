/**
 * NBA Player Props Inference Engine v4 (Phase 3.6)
 * - Handles projection (μ), dispersion (variance/α), calibrated probabilities, and NB distributions
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  predictLightGBM,
  calculateEdge,
  normalizeFeatures as normalizePhase3,
  loadLogisticModel // unused but retained for compatibility
} from './nba-props-engine-v3.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');
const LOG_GAMMA_COEFFS = [
  76.18009172947146,
  -86.50532032941677,
  24.01409824083091,
  -1.231739572450155,
  0.1208650973866179e-2,
  -0.5395239384953e-5
];

function logGamma(z) {
  let x = 1.000000000190015;
  let y = z;
  const tmp = z + 5.5;
  let ser = 1.000000000190015;
  for (let j = 0; j < LOG_GAMMA_COEFFS.length; j++) {
    y += 1;
    ser += LOG_GAMMA_COEFFS[j] / y;
  }
  return (z + 0.5) * Math.log(tmp) - tmp + Math.log(2.5066282746310005 * ser / z);
}

function nbPMF(k, mu, alpha) {
  if (mu <= 0) return 0;
  const r = 1 / Math.max(alpha, 1e-6);
  const p = r / (r + mu);
  const logComb = logGamma(k + r) - logGamma(k + 1) - logGamma(r);
  const logProb = logComb + r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(logProb);
}

function nbTailProbability(line, mu, alpha) {
  const threshold = Math.floor(line + 1e-9 + 0.5); // handle .5 lines
  if (threshold < 0) return 1;
  let cdf = 0;
  const upper = Math.max(threshold + 40, Math.floor(mu + 6 * Math.sqrt(mu + alpha * mu * mu)));
  for (let k = 0; k <= upper && cdf < 0.99999; k++) {
    cdf += nbPMF(k, mu, alpha);
    if (k >= threshold) break;
  }
  const tail = Math.max(0, 1 - cdf);
  return tail;
}

function loadJSON(relativePath) {
  const full = join(PROJECT_ROOT, relativePath);
  return JSON.parse(readFileSync(full, 'utf-8'));
}

function interpolateIsotonic(x, y, value) {
  if (value <= x[0]) return y[0];
  if (value >= x[x.length - 1]) return y[y.length - 1];
  for (let i = 0; i < x.length - 1; i++) {
    if (value >= x[i] && value <= x[i + 1]) {
      const ratio = (value - x[i]) / (x[i + 1] - x[i]);
      return y[i] + ratio * (y[i + 1] - y[i]);
    }
  }
  return value;
}

function applyCalibration(prob, calibration) {
  const { platt_weight, platt_bias, isotonic_x, isotonic_y } = calibration;
  const logits = Math.log((prob + 1e-9) / (1 - prob + 1e-9));
  const plattProb = 1 / (1 + Math.exp(-(platt_weight * logits + platt_bias)));
  return interpolateIsotonic(isotonic_x, isotonic_y, plattProb);
}

function confidenceBucket(prob) {
  if (prob >= 0.68) return 'Tier A+ (0.68+)';
  if (prob >= 0.64) return 'Tier A (0.64-0.68)';
  if (prob >= 0.60) return 'Tier B (0.60-0.64)';
  if (prob >= 0.56) return 'Tier C (0.56-0.60)';
  return 'Hold';
}

function lineSensitivity(mu, variance, line) {
  const std = Math.sqrt(Math.max(variance, 1e-3));
  const plus = 1 - normalCDF((line + 1 - mu) / std);
  const minus = 1 - normalCDF((line - 1 - mu) / std);
  return plus - minus;
}

function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function computeQuantiles(mu, alpha, quantiles = [0.1, 0.5, 0.9]) {
  const results = {};
  const variance = mu + alpha * mu * mu;
  const std = Math.sqrt(Math.max(variance, 1e-3));
  quantiles.forEach(q => {
    const z = Math.sqrt(2) * inverseErf(2 * q - 1);
    results[q] = Math.max(0, mu + z * std);
  });
  return results;
}

function inverseErf(x) {
  const clamped = Math.min(Math.max(x, -0.999999), 0.999999);
  const a = 0.147;
  const ln = Math.log(1 - clamped * clamped);
  const term = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(clamped) * Math.sqrt(Math.sqrt(term * term - ln / a) - term);
}

export async function createInferenceEngineV4() {
  const registry = loadJSON('data/nba/models/phase3_6_model_registry.json');
  const loaded = {};
  for (const [marketKey, config] of Object.entries(registry.models)) {
    if (!config.enabled) continue;
    loaded[marketKey] = {
      projection: loadJSON(config.artifacts.projection.metadata_path),
      distribution: loadJSON(config.artifacts.distribution.metadata_path),
      probability: loadJSON(config.artifacts.probability.metadata_path),
      calibration: loadJSON(config.artifacts.calibration)
    };
  }

  async function predict(market, features, line, odds, side = 'Over') {
    const entry = loaded[market];
    if (!entry) throw new Error(`Phase 3.6 model missing for ${market}`);

    const projectionFeatures = normalizePhase3(features, entry.projection);
    const mu = await predictLightGBM(projectionFeatures, entry.projection.model_path, entry.projection.feature_columns);

    const varianceFeatures = normalizePhase3(features, entry.distribution);
    const varianceRaw = await predictLightGBM(varianceFeatures, entry.distribution.model_path, entry.distribution.feature_columns);
    const variance = Math.max(varianceRaw, mu + 1e-3);
    const alpha = Math.max((variance - mu) / (Math.max(mu, 1e-3) ** 2), 1e-4);

    const probabilityFeatures = {
      ...projectionFeatures,
      proj_mu: mu,
      proj_variance: variance,
      line_minus_mu: line - mu,
      z_score: (line - mu) / Math.sqrt(variance)
    };
    const pRaw = await predictLightGBM(probabilityFeatures, entry.probability.model_path, entry.probability.feature_columns);
    const pCalibrated = applyCalibration(pRaw, entry.calibration);

    const distTail = nbTailProbability(line, mu, alpha);
    const pOver = Math.min(1, Math.max(0, (pCalibrated + distTail) / 2));
    const pUnder = 1 - pOver;

    const edgeInfo = calculateEdge(pOver, odds);
    const quantiles = computeQuantiles(mu, alpha, [0.1, 0.25, 0.5, 0.75, 0.9]);

    return {
      proj: mu,
      variance,
      alpha,
      p_over: pOver,
      p_under: pUnder,
      calibrated_probability: pCalibrated,
      distribution: {
        family: 'negative_binomial',
        mu,
        variance,
        alpha,
        quantiles
      },
      line_sensitivity: lineSensitivity(mu, variance, line),
      confidence_bucket: confidenceBucket(pOver),
      edge: edgeInfo.edge,
      implied_prob: edgeInfo.impliedProb
    };
  }

  return {
    predict,
    registry,
    loadedModels: loaded
  };
}

export default {
  createInferenceEngineV4
};

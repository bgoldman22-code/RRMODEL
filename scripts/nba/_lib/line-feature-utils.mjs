/**
 * Shared helpers for line-aware LightGBM features.
 * Mirrors the feature augmentation performed in scripts/nba/train-lgbm-nba-props.py
 */

export const POINTS_LINE_DELTA_FEATURES = [
  ['L5_ppg', 'line_minus_L5_ppg'],
  ['L10_ppg', 'line_minus_L10_ppg'],
  ['L20_ppg', 'line_minus_L20_ppg'],
  ['L40_ppg', 'line_minus_L40_ppg'],
  ['L999_ppg', 'line_minus_L999_ppg']
];

export const REBOUNDS_LINE_DELTA_FEATURES = [
  ['L5_rpg', 'line_minus_L5_rpg'],
  ['L10_rpg', 'line_minus_L10_rpg'],
  ['L20_rpg', 'line_minus_L20_rpg'],
  ['L40_rpg', 'line_minus_L40_rpg'],
  ['L999_rpg', 'line_minus_L999_rpg']
];

const LINE_Z_EPS = 1e-6;

export const LINE_FEATURE_STDS = {
  points: 2.1837356039342466,
  rebounds: 0.8865914762455621
};

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function ensureFeatureKeys(features, featurePairs) {
  for (const [, targetKey] of featurePairs) {
    if (!(targetKey in features)) {
      features[targetKey] = 0;
    }
  }
}

/**
 * Add explicit line-minus-stat features (and z-score proxies) to the provided feature object.
 * Mutates and returns the same object for convenience.
 */
export function augmentLineAwareFeatures(features, market, line) {
  const lineVal = safeNumber(line);
  if (!Number.isFinite(lineVal)) {
    ensureFeatureKeys(features, POINTS_LINE_DELTA_FEATURES);
    ensureFeatureKeys(features, REBOUNDS_LINE_DELTA_FEATURES);
    features.line_z_L10_ppg = features.line_z_L10_ppg ?? 0;
    features.line_z_L10_rpg = features.line_z_L10_rpg ?? 0;
    return features;
  }

  const applyLineDiffs = (pairs) => {
    for (const [sourceKey, targetKey] of pairs) {
      const sourceVal = safeNumber(features[sourceKey]);
      features[targetKey] = sourceVal !== null ? lineVal - sourceVal : 0;
    }
  };

  if (market === 'player_points') {
    applyLineDiffs(POINTS_LINE_DELTA_FEATURES);
    const diff = features.line_minus_L10_ppg ?? 0;
    features.line_z_L10_ppg = diff / (LINE_FEATURE_STDS.points + LINE_Z_EPS);
  } else {
    ensureFeatureKeys(features, POINTS_LINE_DELTA_FEATURES);
    features.line_z_L10_ppg = 0;
  }

  if (market === 'player_rebounds') {
    applyLineDiffs(REBOUNDS_LINE_DELTA_FEATURES);
    const diff = features.line_minus_L10_rpg ?? 0;
    features.line_z_L10_rpg = diff / (LINE_FEATURE_STDS.rebounds + LINE_Z_EPS);
  } else {
    ensureFeatureKeys(features, REBOUNDS_LINE_DELTA_FEATURES);
    features.line_z_L10_rpg = 0;
  }

  return features;
}

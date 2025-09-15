// Odds and confidence helpers (price-calibrated when odds exist)
export function americanToImplied(american) {
  if (american === null || american === undefined) return null;
  const a = Number(american);
  if (Number.isNaN(a)) return null;
  if (a > 0) return 100 / (a + 100);
  return -a / (-a + 100);
}

export function impliedToAmerican(p) {
  if (p == null) return null;
  const prob = Math.max(0, Math.min(1, Number(p)));
  if (prob === 0) return +Infinity;
  if (prob === 1) return -Infinity;
  return prob > 0.5
    ? Math.round(- (prob * 100) / (1 - prob))
    : Math.round((1 - prob) * 100 / prob);
}

// Simple confidence: bucket the edge between model win prob and market implied
export function confidenceFromEdge(modelProb, marketProb) {
  if (modelProb == null || marketProb == null) return null;
  const edge = modelProb - marketProb; // positive = model likes it
  const abs = Math.abs(edge);
  if (abs >= 0.15) return 9;
  if (abs >= 0.12) return 8;
  if (abs >= 0.09) return 7;
  if (abs >= 0.06) return 6;
  if (abs >= 0.04) return 5;
  if (abs >= 0.03) return 4;
  if (abs >= 0.02) return 3;
  if (abs >= 0.01) return 2;
  return 1;
}

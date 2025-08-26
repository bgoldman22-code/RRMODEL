// src/utils/ev.js
export function impliedFromAmerican(american) {
  if (american == null) return null;
  const A = Number(american);
  if (!Number.isFinite(A)) return null;
  if (A >= 0) return 100 / (A + 100);
  const abs = Math.abs(A);
  return abs / (abs + 100);
}

export function americanFromProb(p) {
  const P = Number(p);
  if (!Number.isFinite(P) || P <= 0 || P >= 1) return null;
  if (P <= 0.5) return Math.round(((1 - P) / P) * 100);
  return -Math.round((P / (1 - P)) * 100);
}

export function americanToDecimal(american) {
  if (american == null) return null;
  const A = Number(american);
  if (!Number.isFinite(A)) return null;
  return A > 0 ? 1 + A / 100 : 1 + 100 / Math.abs(A);
}

export function evFromProbAndOdds(p, american, stake = 1) {
  const dec = americanToDecimal(american);
  if (dec == null) return null;
  const profit = (dec - 1) * stake;
  return p * profit - (1 - p) * stake;
}

export function expectedValue1U(p, american) {
  return evFromProbAndOdds(p, american, 1);
}

export default {
  impliedFromAmerican,
  americanFromProb,
  americanToDecimal,
  evFromProbAndOdds,
  expectedValue1U,
};

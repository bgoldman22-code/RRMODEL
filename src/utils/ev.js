// src/utils/ev.js
export function americanToDecimal(a) {
  if (a == null) return null;
  const A = Number(a);
  if (!Number.isFinite(A)) return null;
  return A > 0 ? 1 + A / 100 : 1 + 100 / Math.abs(A);
}

export function expectedValue1U(p, a) {
  const dec = americanToDecimal(a);
  if (dec == null) return null;
  return p * (dec - 1) - (1 - p);
}

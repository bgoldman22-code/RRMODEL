// src/utils/odds.js
// Lightweight helpers for converting between probability and American odds
// All functions are pure and side-effect free.

/**
 * Convert probability (0<p<1) to American odds (integer).
 * Returns null if p is invalid.
 */
export function probToAmerican(p) {
  const x = Number(p);
  if (!Number.isFinite(x) || x <= 0 || x >= 1) return null;
  // +money if underdog, -money if favorite
  return x >= 0.5 ? Math.round(-100 * x / (1 - x)) : Math.round(100 * (1 - x) / x);
}

/**
 * Convert American odds to probability (0<p<1).
 * Returns null if a is invalid.
 */
export function americanToProb(a) {
  const x = Number(a);
  if (!Number.isFinite(x)) return null;
  return x < 0 ? (-x) / ((-x) + 100) : 100 / (x + 100);
}

/**
 * Format American odds with sign, e.g. +250 or -135.
 * Returns empty string for null/undefined.
 */
export function fmtAmerican(a) {
  if (a === null || a === undefined) return '';
  const n = Number(a);
  if (!Number.isFinite(n)) return String(a);
  return n > 0 ? `+${n}` : `${n}`;
}

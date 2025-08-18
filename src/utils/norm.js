// src/utils/norm.js
// Shared name normalizer used across odds/model glue.
// Safe, idempotent, no external deps.
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.]/g, "")             // remove dots
    .replace(/[’']/g, "'")           // normalize apostrophes
    .trim();
}

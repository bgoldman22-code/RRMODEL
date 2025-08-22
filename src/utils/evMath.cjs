// Utilities to compute EV for American odds, with 1u stake by default.
function americanToDecimal(american) {
  const a = Number(american);
  if (Number.isNaN(a) || a === 0) return null;
  if (a > 0) return 1 + a / 100;
  return 1 + 100 / Math.abs(a);
}
// EV = p*(decimalOdds - 1) - (1 - p)
function evFromProbAndAmerican(p, american) {
  const dec = americanToDecimal(american);
  if (!dec) return null;
  return p * (dec - 1) - (1 - p);
}
module.exports = { americanToDecimal, evFromProbAndAmerican };

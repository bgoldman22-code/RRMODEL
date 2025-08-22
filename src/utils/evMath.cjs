
function americanToDecimal(odds) {
  if (odds > 0) return (odds / 100) + 1;
  return (100 / Math.abs(odds)) + 1;
}

function computeEV(prob, odds) {
  const dec = americanToDecimal(odds);
  return prob * (dec - 1) - (1 - prob);
}

module.exports = { americanToDecimal, computeEV };

// Unique helper names for HR probability adjustments
function platoonMult_v2(handedness, pitcherThrows) {
  if (handedness === 'L' && pitcherThrows === 'R') return 1.07;
  if (handedness === 'R' && pitcherThrows === 'L') return 1.07;
  return 1.0;
}

function hcBoost_v2(recentHRs7d, paLast50) {
  let m = 1;
  if (typeof recentHRs7d === 'number' && recentHRs7d > 0) m *= 1.04;
  if (typeof paLast50 === 'number' && paLast50 > 0) m *= 1.02;
  return m;
}

function envMult_v2(parkFactorHR, weatherBoost) {
  let m = 1;
  if (typeof parkFactorHR === 'number') m *= (1 + parkFactorHR / 100);
  if (typeof weatherBoost === 'number') m *= (1 + weatherBoost / 100);
  return m;
}

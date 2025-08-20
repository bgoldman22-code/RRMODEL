// Pitch-type fit / moderate-power exploitable helper
// Place this at top-level (outside your component)
export function moderatePowerExploitableMultiplier(candidate, pModelBase) {
  const asNum = (val, d=0) => (typeof val === 'number' ? val : d);

  let usage = asNum(candidate?.opponentPitcher?.primaryPitchUsage, null);
  const damage = asNum(candidate?.hitterVsPitch?.primaryPitchDamage, null);

  // normalize to 0..1 if given in percent
  if (typeof usage === 'number' && usage > 1) usage = usage / 100;

  // "predictable" threshold (>= 45% primary pitch)
  const onePitch = (typeof usage === 'number' && usage >= 0.45);

  // "crushes" if xwOBA-like >= .500 or analogous rate
  const crushes = (typeof damage === 'number' && damage >= 0.50);

  let mult = 1.0;
  // Only in moderate-power band
  if (pModelBase >= 0.20 && pModelBase <= 0.30) {
    if (onePitch && crushes) {
      mult *= 1.03; // +3%
    } else if (onePitch || crushes) {
      mult *= 1.01; // +1% tiny nudge
    }
  }
  return mult;
}

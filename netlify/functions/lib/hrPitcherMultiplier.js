// netlify/functions/lib/hrPitcherMultiplier.js
export function pitcherHRMultiplier({
  samples = 0,
  hr = 0,
  leagueMeanHRpa = 0.04,
  priorSamples = 200,
  zScale = 0.12,
  sd = 0.02,
  clampLo = 0.80,
  clampHi = 1.40,
} = {}) {
  const s = Math.max(0, Number(samples)||0);
  const h = Math.max(0, Number(hr)||0);
  const postSamples = s + priorSamples;
  const postHr = h + leagueMeanHRpa * priorSamples;
  const rate = postSamples > 0 ? (postHr / postSamples) : leagueMeanHRpa;
  const z = (rate - leagueMeanHRpa) / sd;
  const mult = Math.exp(zScale * z);
  return Math.max(clampLo, Math.min(clampHi, mult));
}

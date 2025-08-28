function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

export function applyBvpPolicy(raw, baseProb=0.2){
  const pa = Number(raw.pa||0);
  const hr = Number(raw.hr||0);
  const ops = Number(raw.ops||0);

  // Require sample AND strength
  if (pa < 6) return { applied:false, bvpMul:1.0, pa, hr, explain:"" };
  const expHR = Math.max(0.02, baseProb) * pa; // simple expectation guard
  const over = hr - expHR;

  // modest cap +/-10%
  const bump = clamp(over * 0.02, -0.10, 0.10);
  const bvpMul = clamp(1 + bump, 0.90, 1.10);

  const explain = hr > 0
    ? `BvP ${hr} HR in ${pa} PA`
    : `BvP sample ${pa} PA (OPS ${ops.toFixed(3)})`;

  return { applied: Math.abs(bump) >= 0.005, bvpMul, pa, hr, explain };
}

// src/lib/hr-factors_v4.js
// Exported helpers used by src/MLB.jsx

export function pitchTypeFitMultiplier_v3(vsPitchDamage = {}, pitcherTopPitch = "", pitcherMix = {}) {
  try {
    const top = String(pitcherTopPitch || "").toUpperCase().slice(0, 2);
    if (!top) return 1.0;
    const dmg = vsPitchDamage[top];
    if (typeof dmg !== "number") return 1.0;

    let m = 1.0;
    if (dmg >= 1.15) m *= 1.06;
    else if (dmg >= 1.08) m *= 1.04;
    else if (dmg <= 0.92) m *= 0.96;
    else if (dmg <= 0.97) m *= 0.98;

    const entries = Object.entries(pitcherMix || {}).filter(([k,v]) => typeof v === "number");
    const topTwo = entries.sort((a,b)=>b[1]-a[1]).slice(0,2).reduce((s, [,v])=>s+v, 0);
    if (topTwo >= 0.65) {
      if (dmg >= 1.10) m *= 1.02;
      else if (dmg <= 0.95) m *= 0.99;
    }

    return Math.max(0.9, Math.min(1.1, m));
  } catch {
    return 1.0;
  }
}

export function veteranRelianceDampen_v1(seasonHRPace = null, careerHR = null, age = null) {
  const veteran = (typeof careerHR === "number" && careerHR >= 150) || (typeof age === "number" && age >= 29);
  if (!veteran) return 1.0;
  if (typeof seasonHRPace !== "number") return 1.0;
  if (seasonHRPace > 45) return 0.98;
  if (seasonHRPace < 10) return 1.02;
  return 1.0;
}

export function moderatePowerExploitable_v1(p_model, seasonHRPace = null, vsPitchDamage = {}, pitcherTopPitch = "", pitcherMix = {}) {
  const moderate = (typeof p_model === "number" && p_model >= 0.20 && p_model <= 0.30) ||
                   (typeof seasonHRPace === "number" && seasonHRPace >= 20 && seasonHRPace <= 30);
  if (!moderate) return { mult: 1.0, tag: null };

  const top = String(pitcherTopPitch || "").toUpperCase().slice(0, 2);
  const dmg = vsPitchDamage[top];
  const entries = Object.entries(pitcherMix || {}).filter(([k,v]) => typeof v === "number");
  const topTwo = entries.sort((a,b)=>b[1]-a[1]).slice(0,2).reduce((s, [,v])=>s+v, 0);

  if (typeof dmg === "number" && dmg >= 1.10 && topTwo >= 0.65) {
    return { mult: 1.03, tag: "one-pitch exploitable" };
  }
  return { mult: 1.0, tag: null };
}

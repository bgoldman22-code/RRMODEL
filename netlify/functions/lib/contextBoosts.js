// ADDITIVE CONTEXT BOOSTS — SAFE & FLAGGABLE
// Does NOT modify existing WHY strings. Pure math + metadata you can ignore or log.
// Turn on with env: CTX_BOOSTS_ON=1

const CTX_ON = process.env.CTX_BOOSTS_ON === "1";

function clamp01(x){ return Math.max(0.001, Math.min(0.7, x)); }
function rel(bps){ return 1 + (bps / 100); } // +5 -> x1.05 ; -3 -> x0.97
function capTotalUpside(mult){
  const MAX_UP = 1.15;   // +15% cap
  const MIN_DOWN = 0.90; // -10% floor
  return Math.min(Math.max(mult, MIN_DOWN), MAX_UP);
}

async function computeContextBoosts(ctx){
  if (!CTX_ON) return { mult: 1, parts: [], meta: { off: true } };
  const parts = [];
  try { const s = pitchTypeVulnerability(ctx); if (s) parts.push(s); } catch {}
  try { const s = recentForm(ctx); if (s) parts.push(s); } catch {}
  try { const s = familiarity(ctx); if (s) parts.push(s); } catch {}
  try { const s = rookieFloor(ctx); if (s) parts.push(s); } catch {}
  try { const s = refinedPark(ctx); if (s) parts.push(s); } catch {}
  let mult = 1;
  for (const p of parts) mult *= p.mult;
  mult = capTotalUpside(mult);
  return { mult, parts, meta: { capped: mult !== 1 } };
}

function applyBoosts(p_base, boosts){
  if (!boosts || !boosts.mult) return clamp01(p_base);
  return clamp01(p_base * boosts.mult);
}

// 1) Pitch-Type HR Vulnerability
function pitchTypeVulnerability({ splits } = {}){
  if (!splits?.batter || !splits?.pitcher) return null;
  const pts = ["four_seam","cutter","slider","curve","change","sinker","sweeper"];
  const matches = [];
  for (const pt of pts){
    const b = splits.batter?.[pt]?.hr_pa_pctile;        // 0..1 percentile
    const p = splits.pitcher?.[pt]?.hr_pa_allowed_pctile;
    if (typeof b === "number" && typeof p === "number" && b >= 0.75 && p >= 0.75) matches.push(pt);
  }
  if (!matches.length) return null;
  const bump = Math.min(6, 3 + (matches.length - 1) * 1.5); // 3..6
  return { key:"pitchType", mult: rel(bump), pts: bump, info: { matches } };
}

// 2) Recent Form Booster
function recentForm({ recent, batter } = {}){
  const br7 = recent?.barrelRate7d;
  const brS = batter?.barrelRateSeason;
  if (typeof br7 !== "number" || typeof brS !== "number" || brS <= 0) return null;
  const diff = (br7 - brS) / brS;
  let bump = 0;
  if (diff >= 0.25) bump = 6;
  else if (diff >= 0.10) bump = 4;
  else if (diff <= -0.20) bump = -3;
  else if (diff <= -0.10) bump = -2;
  if (bump === 0) return null;
  return { key:"recentForm", mult: rel(bump), pts: bump, info: { br7, brS } };
}

// 3) Batter vs Pitcher Familiarity
function familiarity({ matchup, batter } = {}){
  const PA = matchup?.paVsPitcher || 0;
  const hrP = matchup?.hrRateVsPitcher;
  const hrC = batter?.hrRateCareer;
  if (PA < 25 || typeof hrP !== "number" || typeof hrC !== "number" || hrC <= 0) return null;
  const lift = (hrP - hrC) / hrC;
  if (lift <= 0) return null;
  const bump = Math.max(4, Math.min(5, Math.round(lift * 10))); // 4..5
  return { key:"familiarity", mult: rel(bump), pts: bump, info: { PA, hrP, hrC } };
}

// 4) Rookie / Call-Up Scaling
function rookieFloor({ batter, recent } = {}){
  const PA = batter?.seasonPA || 0;
  if (PA >= 200) return null;
  const hasPowerSignal = (batter?.milbHrRate && batter.milbHrRate >= 0.03) || (recent?.hrLast14 ?? 0) >= 2;
  if (!hasPowerSignal) return null;
  const bump = 3 + (recent?.hrLast14 >= 3 ? 2 : 0); // 3..5
  return { key:"rookieFloor", mult: rel(bump), pts: bump, info: { PA, miLB: batter?.milbHrRate, recentHR14: recent?.hrLast14 } };
}

// 5) Park Factor Boost (Refined)
function refinedPark({ park, matchup } = {}){
  if (!park) return null;
  const pt = matchup?.primaryRiskPitch || "generic";
  const boost = (park.pitchTypeBoosts && park.pitchTypeBoosts[pt]) || (park.hrFactorOverall ?? 0);
  const pct = Math.max(0, Math.min(4, Math.round(boost * 100)));
  if (!pct) return null;
  return { key:"park", mult: rel(pct), pts: pct, info: { pt, boost } };
}

module.exports = { computeContextBoosts, applyBoosts, _internals:{ clamp01, rel, capTotalUpside } };

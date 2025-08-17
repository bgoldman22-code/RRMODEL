// src/utils/model_scalers.js
// Safe, bounded scalers with feature flags. No UI/WHY changes required.

export const ENABLE_PITCH_EDGE = true;       // flip to false to disable
export const ENABLE_ROOKIE_BLEND = true;     // flip to false to disable

// League-ish neutral xISO used for pitch-type comparison
const NEUTRAL_XISO = 0.160;

// Shrinkage strength (pseudo-prior PA). Small samples are pulled toward neutral.
// e.g., SHRINK_PA=40 → 8 PA is 17% weight on observed, 83% neutral
const SHRINK_PA = 40;

// Map some common aliases just in case
const PITCH_ALIAS = {
  FF: "FF", FA: "FF", FOUR_SEAM: "FF", "4S": "FF",
  SI: "SI", SINKER: "SI", FT: "SI", "2S": "SI",
  SL: "SL", SW: "SL", SWEEPER: "SL",
  CU: "CU", KC: "CU", CURVEBALL: "CU",
  CH: "CH", CHANGEUP: "CH",
  FC: "CT", CT: "CT", CUTTER: "CT",
};

/**
 * Returns a small multiplier (0.90 .. 1.15) based on hitter xISO vs the starter's top pitch types.
 * - Uses hitter_vs_pitch across ALL pitchers (not just vs today's pitcher).
 * - No hard sample cutoff; we apply shrinkage toward neutral by SHRINK_PA.
 * - Weighted by the starter's top 2–3 pitch usages.
 * - Fully guarded; returns 1.00 on any missing data.
 *
 * Input shape:
 *   {
 *     hitter_vs_pitch: Array<{ pitch: string, sample_pa: number, xiso: number|null }>,
 *     pitcher: { primary_pitches: Array<{ pitch: string, usage: number }> }
 *   }
 */
export function pitchTypeEdgeMultiplier(input) {
  try {
    if (!ENABLE_PITCH_EDGE) return 1.00;
    const hvp = input?.hitter_vs_pitch || [];
    const pitches = input?.pitcher?.primary_pitches || [];
    if (!hvp.length || !pitches.length) return 1.00;

    const normPitch = (p) => (PITCH_ALIAS[p] || p);

    // Index hitter xISO by normalized pitch, apply shrinkage toward neutral
    const byPitch = new Map();
    for (const h of hvp) {
      if (!h) continue;
      const key = normPitch(String(h.pitch || "").toUpperCase());
      if (!key) continue;
      const pa = Number(h.sample_pa || 0);
      const x = h.xiso == null ? null : Number(h.xiso);
      if (!(pa >= 0) || x == null || !isFinite(x)) continue;
      const shrunk = (x * pa + NEUTRAL_XISO * SHRINK_PA) / (pa + SHRINK_PA);
      byPitch.set(key, { xiso: shrunk, pa });
    }

    // Use top 2–3 pitches by usage
    const top = [...pitches]
      .map(p => ({ pitch: normPitch(String(p.pitch || "").toUpperCase()), usage: Number(p.usage || 0) }))
      .filter(p => p.pitch && p.usage > 0)
      .sort((a,b) => b.usage - a.usage)
      .slice(0,3);

    if (!top.length) return 1.00;

    let acc = 0, used = 0;
    for (const p of top) {
      const hp = byPitch.get(p.pitch);
      if (!hp) continue;
      const usage = Math.max(0, Math.min(1, p.usage));
      const edge = (hp.xiso - NEUTRAL_XISO) / NEUTRAL_XISO; // relative edge vs neutral
      acc += edge * usage;
      used += usage;
    }
    if (!used) return 1.00;

    // Dampen impact and clamp to safe bounds
    const raw = 1 + acc * 0.35;                  // tuneable small effect
    return Math.max(0.90, Math.min(1.15, raw));  // final guardrails
  } catch {
    return 1.00;
  }
}

/**
 * Rookie baseline blender:
 * - Blends MLB and AAA HR/PA based on MLB PA exposure (0..200 PA ramp).
 * - AAA HR rate gets a 20% haircut to reflect MLB pitching quality.
 * - The result is softly clamped within ±20% of the MLB baseline (if MLB baseline exists).
 *
 * Input:
 *   { mlb_pa, hrpa_mlb, hrpa_aaa }
 */
export function rookieBlendBaseline({
  mlb_pa = 0,
  hrpa_mlb = null,
  hrpa_aaa = null,
}) {
  try {
    if (!ENABLE_ROOKIE_BLEND) return hrpa_mlb ?? 0;
    const mlb = Number(mlb_pa || 0);
    const baseMLB = hrpa_mlb == null ? null : Number(hrpa_mlb);
    const baseAAA = hrpa_aaa == null ? null : Number(hrpa_aaa);
    if (!isFinite(baseMLB) && !isFinite(baseAAA)) return 0;

    const wMLB = Math.max(0, Math.min(1, mlb / 200));
    const wAAA = 1 - wMLB;

    const mlbPart = (isFinite(baseMLB) ? baseMLB : 0) * wMLB;
    const aaaPart = (isFinite(baseAAA) ? baseAAA : 0) * 0.80 * wAAA; // 20% haircut
    const blended = mlbPart + aaaPart;

    if (isFinite(baseMLB) && baseMLB > 0) {
      const lo = baseMLB * 0.80;
      const hi = baseMLB * 1.20;
      return Math.max(lo, Math.min(hi, blended));
    }
    return blended; // if no MLB baseline, allow the blend directly
  } catch {
    return hrpa_mlb ?? 0;
  }
}

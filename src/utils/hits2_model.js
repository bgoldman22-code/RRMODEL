// src/utils/hits2_model.js
import { clamp01, probAtLeastK } from "./prob_math.js";

/**
 * Estimate P(2+ hits) as Binomial tail with per-PA hit probability p_hit and n = estPA.
 * Inputs:
 * - avg: season batting average (0-1)
 * - estPA: expected PA (default 4.2; lineup slot can adjust)
 * - ctx (optional): { pitchEdgeMult, parkMult, formMult }
 */
export function hits2Probability({ avg, estPA=4.2, ctx = {} }){
  const base = clamp01(avg);
  const pitchEdgeMult = clamp01(ctx.pitchEdgeMult!=null ? ctx.pitchEdgeMult : 1.0) || 1.0;
  const parkMult      = clamp01(ctx.parkMult!=null ? ctx.parkMult : 1.0) || 1.0;
  const formMult      = clamp01(ctx.formMult!=null ? ctx.formMult : 1.0) || 1.0;

  // approximate per-PA single-or-better probability
  const p_hit = Math.max(0.05, Math.min(0.45, base * pitchEdgeMult * parkMult * formMult));

  const n = Math.max(3, Math.min(6, Math.round(estPA)));
  const prob2plus = probAtLeastK(n, p_hit, 2);
  return Math.max(0.02, Math.min(0.70, prob2plus));
}

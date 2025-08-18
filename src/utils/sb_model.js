// src/utils/sb_model.js
import { clamp01, poissonProbAtLeastOnce } from "./prob_math.js";

/**
 * Estimate game SB probability using opportunity * attempt propensity * success.
 * Inputs:
 * - obp: season OBP (0-1)
 * - pa: season plate appearances
 * - attempts2y: total SB+CS attempts last 2 seasons (int)
 * - success2y: success rate across 2 seasons (0-1)
 * - pa2y: total PA across 2 seasons (int)
 * - ctx (optional): { speedMult, pitcherHoldMult, catcherArmMult, recentObpDelta }
 */
export function sbProbability({ obp, pa, attempts2y, success2y, pa2y, ctx = {} }){
  const estPA = clamp01(pa) ? pa : 4.2; // allow pass-through if someone supplies PA directly; fallback ~4.2
  const pOnBasePerPA = clamp01(obp);
  const expectedTOB = estPA * pOnBasePerPA * (1 + (ctx.recentObpDelta||0)); // trend boost
  const baseOpp = Math.max(0.2, Math.min(6.0, expectedTOB)); // guardrails

  // attempts per times-on-base across last 2 years (prefer behavior sample)
  const denomTOB2y = Math.max(1, (pa2y||0) * clamp01(obp)); // rough TOB ~ PA*OBP
  const attPerTOB = Math.max(0, Math.min(0.55, (attempts2y||0) / denomTOB2y)); // cap excessive

  // context multipliers
  const speedMult   = clamp01(ctx.speedMult!=null ? ctx.speedMult : 1.0) || 1.0;
  const holdMult    = clamp01(ctx.pitcherHoldMult!=null ? ctx.pitcherHoldMult : 1.0) || 1.0;
  const catcherMult = clamp01(ctx.catcherArmMult!=null ? ctx.catcherArmMult : 1.0) || 1.0;

  const attemptLambda = baseOpp * attPerTOB * speedMult * holdMult * catcherMult;

  // success rate (shrunken into [0.6, 0.9])
  const succ = Math.max(0.60, Math.min(0.90, Number(success2y)||0.70));

  // Probability of ≥1 successful steal using Poisson for attempts:
  // P(at least one attempt) ~ 1-exp(-lambda), success applied multiplicatively
  const pAttempt = poissonProbAtLeastOnce(attemptLambda);
  let prob = pAttempt * succ;

  // guardrails
  prob = Math.max(0.04, Math.min(0.65, prob));
  return prob;
}

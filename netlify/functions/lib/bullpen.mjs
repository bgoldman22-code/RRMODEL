// netlify/functions/lib/bullpen.mjs

/**
 * Estimate starter vs bullpen plate-appearance share.
 * - spIpProj: projected starter innings (0..9)
 * - lineupSlot: 1..9 (optional, affects chance of extra PA vs SP by ~0.15 IP per slot up to 3)
 */
export function estimateShares({ spIpProj = 5.5, lineupSlot = 4 } = {}) {
  try {
    let sp = Math.max(0, Math.min(9, Number(spIpProj) || 0));
    // small tweak: early hitters see SP slightly more often
    if (Number.isFinite(lineupSlot)) {
      const adj = Math.max(0, 4 - Math.min(4, Number(lineupSlot))); // 0..3 ⇒ 0..3
      sp = Math.min(9, sp + adj * 0.15);
    }
    const spShare = Math.max(0, Math.min(1, sp / 9));
    const bpShare = 1 - spShare;
    return { spShare, bpShare };
  } catch {
    return { spShare: 0.66, bpShare: 0.34 };
  }
}

/**
 * Compute a simple bullpen HR fit multiplier.
 * Inputs can come from your model rows if available:
 *  - bpHr9 (team bullpen HR/9), lgHr9 (league avg HR/9),
 *  - batterPenFit (batter profile vs typical pen mix, default 1.0).
 * Returns a multiplicative factor centered at 1.0.
 */
export function bullpenHrFit({ bpHr9 = null, lgHr9 = 1.15, batterPenFit = 1.0 } = {}) {
  try {
    let rel = 1.0;
    if (bpHr9 && lgHr9) {
      const ratio = Number(bpHr9) / Number(lgHr9);
      // clamp 0.7..1.4; blend toward 1.0
      rel = Math.max(0.7, Math.min(1.4, 0.5 + 0.5 * ratio));
    }
    const fit = Number.isFinite(Number(batterPenFit)) ? Number(batterPenFit) : 1.0;
    return rel * fit;
  } catch {
    return 1.0;
  }
}

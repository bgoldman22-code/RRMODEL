// === PATCH START: Moderate-power Exploitable Boost (safe, additive) ===
// Drop-in helper. No external imports. Safe to define anywhere in MLB.jsx (top-level).
// Usage: AFTER you have computed pModel (probability after park/hot-cold etc, BEFORE EV):
//   const mpex = moderatePowerExploitableMultiplier(candidate, pModel);
//   if (mpex > 1) { pModel = Math.min(pModel * mpex, 0.60); why.push('mod-power exploitable +3%'); }
function moderatePowerExploitableMultiplier(candidate, pModel) {
  try {
    if (typeof pModel !== 'number' || !(pModel >= 0 && pModel <= 1)) return 1;
    // target band: ~moderate power (20–30%)
    if (pModel < 0.20 || pModel > 0.30) return 1;

    // Resolve pitch type & usage from likely shapes in your data
    const pitch =
      candidate?.pitcherTopPitch ||
      candidate?.pitcher?.topPitch ||
      candidate?.matchup?.pitcher?.topPitch ||
      candidate?.pitchType ||
      null;

    let usage =
      candidate?.pitcherTopPitchUsage ??
      candidate?.pitcher?.topPitchUsage ??
      candidate?.matchup?.pitcher?.topPitchUsage ??
      null;

    if (!pitch || usage == null) return 1;
    // normalize to 0..1 if given in percent
    if (typeof usage === 'number' && usage > 1) usage = usage / 100;

    const onePitch = typeof usage === 'number' && usage >= 0.45; // "predictable" threshold
    if (!onePitch) return 1;

    // Hitter damage vs that pitch, try multiple shapes/keys
    let damage =
      candidate?.hitterVsPitch?.[pitch]?.xwoba ??
      candidate?.splits?.vsPitch?.[pitch]?.xwOBA ??
      candidate?.vsPitch?.[pitch]?.xwOBA ??
      candidate?.vsPitch?.[pitch]?.damage ??
      null;

    // "crushes" if xwOBA-like >= .500 or any rate-like metric suggests strong fit
    const crushes = typeof damage === 'number' && damage >= 0.50;

    if (onePitch && crushes) {
      // +3% multiplicative bump; capped by caller at 60% overall
      candidate._whyTags = candidate._whyTags || [];
      candidate._whyTags.push('mod-power exploitable +3%');
      return 1.03;
    }
    return 1;
  } catch (_e) {
    return 1;
  }
}
// === PATCH END: Moderate-power Exploitable Boost ===

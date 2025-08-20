// === PATCH START: Moderate-power Exploitable Boost (safe, additive) ===
// Drop-in helper. No external imports. Safe to define anywhere in MLB.jsx (top-level).
// Usage: AFTER you have computed pModel (your probability after park/hot-cold etc, BEFORE EV):
//   const mpex = moderatePowerExploitableMultiplier(candidate, pModel);
//   if (mpex > 1) { pModel = Math.min(pModel * mpex, 0.60); why.push('mod-power exploitable +3%'); }
// This only nudges 20–30%% model HR% when pitcher is predictable with a pitch the hitter crushes.
function moderatePowerExploitableMultiplier(candidate, pModel) {
  try {
    if (typeof pModel !== 'number' || !(pModel >= 0 && pModel <= 1)) return 1;

    // target band: ~moderate power (20–30%)
    if (pModel < 0.20 || pModel > 0.30) return 1;

    // Resolve pitch type & usage from a variety of likely shapes in your data
    const pitch =
      candidate?.pitcherTopPitch ||
      candidate?.pitcher?.topPitch ||
      candidate?.opposingPitch?.type ||
      candidate?.matchup?.pitcherTopPitch ||
      null;

    let usage =
      candidate?.pitcherTopPitchUsage ??
      candidate?.pitcher?.topPitchUsage ??
      candidate?.opposingPitch?.usage ??
      candidate?.matchup?.pitcherTopPitchUsage ??
      null;

    if (typeof usage === 'string') {
      const u = parseFloat(usage);
      if (!Number.isNaN(u)) usage = u;
    }
    // normalize to 0..1 if given in percent
    if (typeof usage === 'number' && usage > 1) usage = usage / 100;

    const onePitch = typeof usage === 'number' && usage >= 0.45; // "predictable" threshold

    // Hitter damage table can come in a few shapes; try common keys
    const damageTable =
      candidate?.hitterPitchDamage ||
      candidate?.hitter?.vsPitch ||
      candidate?.batterVsPitch ||
      null;

    let damage = null;
    if (damageTable && pitch && damageTable[pitch] != null) {
      const cell = damageTable[pitch];
      if (typeof cell === 'number') damage = cell;
      else if (typeof cell === 'string') {
        const v = parseFloat(cell);
        if (!Number.isNaN(v)) damage = v;
      } else if (typeof cell === 'object' && cell) {
        // prefer expected contact metrics when present
        damage = cell.xwOBA ?? cell.woba ?? cell.hrPerSwing ?? cell.hrRate ?? null;
        if (typeof damage === 'string') {
          const v = parseFloat(damage);
          damage = Number.isNaN(v) ? null : v;
        }
      }
    }

    // "crushes" if xwOBA-like >= .500 or a rate-like metric suggests strong platoon/pitch fit
    const crushes = typeof damage === 'number' and damage >= 0.50;

    if (onePitch && crushes) {
      // +3% multiplicative bump; capped by caller at 60% overall
      candidate._whyTags = candidate._whyTags || [];
      candidate._whyTags.push('mod-power exploitable +3%');
      return 1.03;
    }

    return 1;
  } catch (e) {
    return 1;
  }
}
// === PATCH END: Moderate-power Exploitable Boost ===
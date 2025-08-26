// src/mpex-helper.js
// Moderate-power Exploitable Boost helper (+3%)
// Safe, additive, and defensive against missing data.
export function moderatePowerExploitableMultiplier(candidate, pModel) {
  try {
    if (typeof pModel !== 'number' || pModel < 0 || pModel > 1) return 1;

    // Only act in the 20–30% band
    if (pModel < 0.20 || pModel > 0.30) return 1;

    // Try several likely shapes for top pitch + usage
    const pitch =
      candidate?.pitcherTopPitch ??
      candidate?.pitcher?.topPitch ??
      candidate?.opposingPitch?.type ??
      candidate?.matchup?.pitcherTopPitch ??
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
    if (typeof usage === 'number' && usage > 1) usage = usage / 100;

    const onePitch = typeof usage === 'number' && usage >= 0.45; // predictable threshold

    // Hitter pitch-damage lookup (accept several shapes)
    const damageTable =
      candidate?.hitterPitchDamage ??
      candidate?.hitter?.vsPitch ??
      candidate?.batterVsPitch ??
      null;

    let damage = null;
    if (damageTable && pitch && damageTable[pitch] != null) {
      const cell = damageTable[pitch];
      if (typeof cell === 'number') {
        damage = cell;
      } else if (typeof cell === 'string') {
        const v = parseFloat(cell);
        if (!Number.isNaN(v)) damage = v;
      } else if (cell && typeof cell === 'object') {
        // prefer expected contact metrics if present
        const raw = cell.xwOBA ?? cell.woba ?? cell.hrPerSwing ?? cell.hrRate ?? null;
        if (typeof raw === 'number') damage = raw;
        else if (typeof raw === 'string') {
          const v = parseFloat(raw);
          if (!Number.isNaN(v)) damage = v;
        }
      }
    }

    // “Crushes” = xwOBA-like >= .500 (adjust if your scale differs)
    const crushes = typeof damage === 'number' && damage >= 0.50;

    if (onePitch && crushes) {
      // +3% micro‑boost
      return 1.03;
    }
    return 1;
  } catch {
    return 1;
  }
}

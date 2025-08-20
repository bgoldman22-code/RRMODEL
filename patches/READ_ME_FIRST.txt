# PATCH HOW-TO (copy/paste)

A) Add helper at top-level of src/MLB.jsx (near your other multiplier helpers).
----------------------------------------------------------------
[BEGIN COPY]
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

[END COPY]
----------------------------------------------------------------

B) Call helper after park/hot-cold (when you have pModel) and BEFORE EV.
----------------------------------------------------------------
[BEGIN COPY]
// Moderate-power exploitable micro-boost
const mpex = moderatePowerExploitableMultiplier(candidate, pModel);
if (mpex > 1) {
  pModel = Math.min(pModel * mpex, 0.60); // safety cap
  why.push('mod-power exploitable +3%');
}
[END COPY]
----------------------------------------------------------------

C) Render Pure EV table UNDER your Pure Probability table.
----------------------------------------------------------------
[BEGIN COPY]
// === PATCH START: Pure EV (Top 10, 19% floor) ===
// Place this under your Pure Probability table render.
// It expects an array like `picks` with fields: player, gameId/game, modelProb (0..1), actualOdds (American), why (array/string).
const pureEV = Array.isArray(picks) ? picks
  .map(p => {
    const prob = typeof p.modelProb === 'number' ? p.modelProb : (typeof p.modelHR === 'number' ? p.modelHR : p.hrProb);
    const american = p.actualOdds ?? p.odds ?? p.actual ?? null;
    const dec = (american != null) ? (american > 0 ? 1 + american / 100 : 1 + 100 / abs(american)) : null;
    const ev = (typeof prob === 'number' && typeof dec === 'number')
      ? (prob * (dec - 1) - (1 - prob))
      : null;
    return { ...p, prob, american, ev };
  })
  .filter(r => typeof r.prob === 'number' && r.prob >= 0.19 && typeof r.ev === 'number')
  .sort((a,b) => b.ev - a.ev)
  .slice(0, 10)
: [];

{pureEV.length > 0 && (
  <div className="mt-6">
    <h3 className="text-lg font-semibold">Pure EV (Top 10, ≥19% model)</h3>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="p-2">Player</th>
            <th className="p-2">Game</th>
            <th className="p-2">Model HR%</th>
            <th className="p-2">Actual Odds</th>
            <th className="p-2">EV (1u)</th>
            <th className="p-2">Why</th>
          </tr>
        </thead>
        <tbody>
          {pureEV.map((r, idx) => (
            <tr key={idx} className="border-t">
              <td className="p-2">{r.player}</td>
              <td className="p-2">{r.game ?? r.gameId ?? ''}</td>
              <td className="p-2">{(r.prob * 100).toFixed(1)}%</td>
              <td className="p-2">{r.american > 0 ? `+${r.american}` : r.american}</td>
              <td className="p-2">{r.ev?.toFixed(3)}</td>
              <td className="p-2">{Array.isArray(r.why) ? r.why.join(' • ') : (r.why ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
// === PATCH END: Pure EV (Top 10, 19% floor) ===

[END COPY]
----------------------------------------------------------------

Notes
- Uses proper JS operators (&&). No build break from 'and' tokens.
- PURE_EV expects `picks` array; adapt field names if yours differ (modelProb/actualOdds).

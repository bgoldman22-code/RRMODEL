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

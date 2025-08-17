import React, { useMemo } from 'react';

/** Read-only table that fills to at least N unique games using your existing data. */
export default function GameDiversification({ selected = [], candidates = [], targetGames = 8 }){
  const rows = useMemo(() => {
    if (!Array.isArray(candidates) || !candidates.length) return [];
    const chosen = new Set((selected||[]).map(r => r && (r.id || `${r.name}|${r.game}`)));
    const gamesCovered = new Set((selected||[]).map(r => r && r.game).filter(Boolean));
    const need = Math.max(0, targetGames - gamesCovered.size);
    if (need <= 0) return [];
    const out = [];
    for (const r of candidates){
      if (!r) continue;
      const key = r.id || `${r.name}|${r.game}`;
      if (chosen.has(key)) continue;
      if (!gamesCovered.has(r.game)){
        out.push(r);
        gamesCovered.add(r.game);
        if (out.length >= need) break;
      }
    }
    return out;
  }, [selected, candidates, targetGames]);

  if (!rows.length) return null;
  const CellMoney = ({v}) => <span>{(typeof v==='number') ? (v>0?`+${v}`:v) : '—'}</span>;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">Game diversification picks</h2>
      <div className="opacity-70 text-xs mt-1">Filling to at least {targetGames} unique games</div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-right">Model HR%</th>
              <th className="px-3 py-2 text-right">American</th>
              <th className="px-3 py-2 text-right">EV (1u)</th>
              <th className="px-3 py-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className="border-b">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.game}</td>
                <td className="px-3 py-2 text-right">{(r?.p_model!=null ? (r.p_model*100).toFixed(1)+'%' : '—')}</td>
                <td className="px-3 py-2 text-right"><CellMoney v={r.american} /></td>
                <td className="px-3 py-2 text-right">{(r?.ev!=null ? r.ev.toFixed(3) : '—')}</td>
                <td className="px-3 py-2">{r.why || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

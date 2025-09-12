import React from 'react';

const fmtLocal = (iso) => {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(d);
  } catch { return iso; }
};

const Cell = ({children}) => <td className="px-3 py-2 align-top">{children}</td>;

export default function NFLPredictionsPage() {
  const [data, setData] = React.useState({ rows: [], parlays:null, updated:null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/.netlify/functions/nfl-predictions-get');
        const j = await res.json();
        if (!cancelled) {
          setData(j || { rows: [] });
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">NFL Predictions</h1>
        {data.updated && <span className="text-sm text-gray-500">updated {fmtLocal(data.updated)}</span>}
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Kickoff (Local)</th>
                <th className="px-3 py-2 text-left">Matchup</th>
                <th className="px-3 py-2 text-left">Moneyline, Spread, Total Lines</th>
                <th className="px-3 py-2 text-left">Moneyline Pick</th>
                <th className="px-3 py-2 text-left">Spread Pick</th>
                <th className="px-3 py-2 text-left">O/U Pick</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {data.rows?.map(r => {
                const lines = [
                  (r.ml_home_best!=null || r.ml_away_best!=null) ? `ML: ${r.away_abbr} ${r.ml_away_best ?? '—'} / ${r.home_abbr} ${r.ml_home_best ?? '—'}` : null,
                  (r.spread_line!=null) ? `Spread: ${r.spread_team} ${r.spread_line}` : null,
                  (r.total_line!=null) ? `Total: ${r.total_side||'—'} ${r.total_line}` : null,
                ].filter(Boolean).join(' · ');

                const ml = r.pick_ml || r.pick || null;
                const sp = r.pick_spread || null;
                const to = r.pick_total || null;

                const Badge = ({text, conf}) => (
                  <div className="inline-flex items-center gap-2">
                    <span className="font-medium">{text}</span>
                    {conf!=null && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
                        {(conf*100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                );

                return (
                  <tr key={r.id} className="border-t border-gray-200">
                    <Cell>{fmtLocal(r.kickoff)}</Cell>
                    <Cell>{r.matchup}</Cell>
                    <Cell>{lines || '—'}</Cell>
                    <Cell>{ml ? <Badge text={`${ml.team} (${ml.type})`} conf={ml.confidence}/> : '—'}</Cell>
                    <Cell>{sp ? <Badge text={`${sp.team} ${sp.line ?? ''}`} conf={sp.confidence}/> : '—'}</Cell>
                    <Cell>{to ? <Badge text={`${to.side} ${to.line ?? ''}`} conf={to.confidence}/> : '—'}</Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && data.parlays && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold mt-6">Suggested Parlays</h2>
          {['3x3','3x5'].map(key => (
            <div key={key} className="border border-gray-200 rounded-lg">
              <div className="px-3 py-2 bg-gray-50 font-medium">{key}</div>
              <div className="p-3 grid md:grid-cols-3 gap-3">
                {data.parlays[key].map((legs, i)=>(
                  <div key={i} className="border rounded-md p-3">
                    <div className="text-sm font-medium mb-2">Ticket {i+1}</div>
                    <ul className="space-y-1 text-sm">
                      {legs.map(l=>(
                        <li key={l.id} className="flex justify-between gap-3">
                          <span>{l.leg}</span>
                          <span className="text-green-700">{(l.confidence*100).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

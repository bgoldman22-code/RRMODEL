
import React, { useEffect, useMemo, useState } from 'react';

const API_PRED = '/.netlify/functions/nfl-predictions-get';
const API_SCHED = '/.netlify/functions/nfl-schedule-get';

function fmtUTC(iso) {
  try {
    const d = new Date(iso);
    return d.toUTCString().replace(':00 GMT', ' GMT');
  } catch { return iso || '-'; }
}

function numberOrDash(x, digits=2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  return typeof x === 'number' ? x.toFixed(digits) : x;
}

export default function Predictions() {
  const [rows, setRows] = useState([]);
  const [parlay, setParlay] = useState({ legs: [] });
  const [meta, setMeta] = useState({ season: undefined, week: undefined, source: undefined, bundle: undefined });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        // schedule (for season/week display)
        const sched = await fetch(API_SCHED).then(r=>r.json()).catch(()=>({}));
        const p = await fetch(API_PRED).then(r=>r.json());
        if (!mounted) return;
        setRows(Array.isArray(p?.rows) ? p.rows : []);
        setParlay(p?.parlay || { legs: [] });
        setMeta({
          season: p?.season || sched?.season,
          week: p?.week || p?.currentWeek || undefined,
          source: p?.source,
          bundle: p?.BUNDLE_VERSION || p?.bundle
        });
      } catch (e) {
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const header = useMemo(() => {
    return (
      <div className="text-sm text-gray-600 mb-4">
        <span>Season {meta.season ?? 'undefined'}</span>
        {' • '}<span>Week {meta.week ?? 'undefined'}</span>
        {' • '}<span>Source: {meta.source ?? 'undefined'}</span>
        {' • '}<span>Bundle: {meta.bundle ?? 'undefined'}</span>
      </div>
    );
  }, [meta]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">NFL Predictions</h1>
      {header}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 mb-4">Error: {error}</div>}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">This Week&apos;s Games</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2">Game</th>
                <th className="px-3 py-2">Kickoff (UTC)</th>
                <th className="px-3 py-2">Home Win %</th>
                <th className="px-3 py-2">Proj Margin (home)</th>
                <th className="px-3 py-2">Proj Total</th>
                <th className="px-3 py-2">Weather</th>
                <th className="px-3 py-2">Injuries</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">No games found.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.matchup}</td>
                  <td className="px-3 py-2">{fmtUTC(r.kickoff)}</td>
                  <td className="px-3 py-2">{numberOrDash(r.ml_home_imp*100,1)}%</td>
                  <td className="px-3 py-2">{numberOrDash(r.proj_margin ?? (r.ml_home_imp - (1 - r.ml_home_imp))*10,1)}</td>
                  <td className="px-3 py-2">{numberOrDash(r.total_line ?? r.proj_total,1)}</td>
                  <td className="px-3 py-2">–</td>
                  <td className="px-3 py-2">–</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Parlay Suggestions (auto-built)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <div className="font-medium mb-2">3-Leg</div>
            <ul className="list-disc ml-5 space-y-1">
              {(parlay?.legs || []).slice(0,3).map((l) => (
                <li key={l.gameId || l.matchup}>{l.leg} <span className="text-gray-500">({l.matchup})</span></li>
              ))}
            </ul>
          </div>
          <div className="border rounded-lg p-3">
            <div className="font-medium mb-2">5-Leg</div>
            <ul className="list-disc ml-5 space-y-1">
              {(parlay?.legs || []).slice(0,5).map((l) => (
                <li key={(l.gameId || l.matchup)+'5'}>{l.leg} <span className="text-gray-500">({l.matchup})</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

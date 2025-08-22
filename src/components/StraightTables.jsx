import React from 'react';
import PropTypes from 'prop-types';
import { evFromProbAndAmerican } from '../utils/evMath.cjs';

function fmtPct(x){ return (x*100).toFixed(1) + '%'; }
function fmtEV(x){
  if (x === null || x === undefined) return '—';
  const s = (x >= 0 ? '+' : '') + x.toFixed(3);
  return s;
}
function fmtOdds(a){
  if (a === null || a === undefined) return '—';
  const n = Number(a);
  if (Number.isNaN(n)) return String(a);
  return (n >= 0 ? '+' : '') + n;
}

function tableRowKey(p){ return `${p.player}-${p.team || ''}-${p.odds || ''}`; }

export default function StraightTables({ picks, titleRaw='Straight HR Bets (Top 13 Raw Probability)', titleEV='Straight EV Bets (Top 13 EV Picks)' }){
  const safe = Array.isArray(picks) ? picks.slice() : [];

  const norm = safe.map(p => {
    const prob = Number(p.model_hrp || p.modelHRP || p.hr_prob || 0);
    const odds = p.actual_odds ?? p.odds ?? p.american ?? null;
    const ev = (p.EV !== undefined ? Number(p.EV) : (p.ev !== undefined ? Number(p.ev) : evFromProbAndAmerican(prob, odds)));
    return { ...p, model_hrp: prob, odds, ev };
  });

  const topRaw = norm
    .filter(p => p.model_hrp > 0)
    .sort((a,b) => b.model_hrp - a.model_hrp)
    .slice(0, 13);

  const topEV = norm
    .filter(p => (p.model_hrp ?? 0) >= 0.19)
    .map(p => ({ ...p, ev: (p.ev === null || p.ev === undefined) ? evFromProbAndAmerican(p.model_hrp, p.odds) : p.ev }))
    .filter(p => p.ev !== null && p.ev !== undefined)
    .sort((a,b) => b.ev - a.ev)
    .slice(0, 13);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-3">{titleRaw}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Game</th>
                <th className="py-2 pr-4">HR Prob</th>
                <th className="py-2 pr-4">Odds</th>
              </tr>
            </thead>
            <tbody>
              {topRaw.map(row => (
                <tr key={tableRowKey(row)} className="border-b last:border-0">
                  <td className="py-2 pr-4">{row.player}</td>
                  <td className="py-2 pr-4">{row.team || row.team_abbr || '—'}</td>
                  <td className="py-2 pr-4">{row.game || '—'}</td>
                  <td className="py-2 pr-4">{fmtPct(row.model_hrp)}</td>
                  <td className="py-2 pr-4">{fmtOdds(row.odds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">{titleEV}</h2>
        <p className="text-xs text-gray-500 mb-2">Filter: HR probability ≥ 19%</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Game</th>
                <th className="py-2 pr-4">HR Prob</th>
                <th className="py-2 pr-4">Odds</th>
                <th className="py-2 pr-4">EV (1u)</th>
              </tr>
            </thead>
            <tbody>
              {topEV.map(row => (
                <tr key={tableRowKey(row)} className="border-b last:border-0">
                  <td className="py-2 pr-4">{row.player}</td>
                  <td className="py-2 pr-4">{row.team || row.team_abbr || '—'}</td>
                  <td className="py-2 pr-4">{row.game || '—'}</td>
                  <td className="py-2 pr-4">{fmtPct(row.model_hrp)}</td>
                  <td className="py-2 pr-4">{fmtOdds(row.odds)}</td>
                  <td className="py-2 pr-4">{fmtEV(row.ev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

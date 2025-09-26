import React, { useEffect, useMemo, useState } from 'react';
import ConfidenceBar from '../components/ConfidenceBar.jsx';
import { formatKickoffLocal, bestMoneyline, spreadPick, totalPick } from '../lib/nfl/predictionFormats.js';

const FN = '/.netlify/functions/nfl-predictions-get';

function usePredictions() {
  const [data, setData] = useState({ ok:false, rows:[], updated:null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(FN, { cache: 'no-store' });
        const j = await r.json();
        if (mounted) setData(j), setLoading(false);
      } catch (e) {
        if (mounted) setError(e?.message || String(e)), setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  return { ...data, loading, error };
}

function Row({ row }) {
  const ml = bestMoneyline(row);
  const sp = spreadPick(row);
  const tot = totalPick(row);
  const isAdvanced = row._advanced;

  return (
    <tr className="border-b border-gray-200">
      <td className="py-2 px-3 text-sm text-gray-700">{formatKickoffLocal(row.kickoff)}</td>
      <td className="py-2 px-3 text-sm font-medium">
        <div>{row.matchup}</div>
        {isAdvanced && (
          <div className="text-xs text-green-600 mt-1">
            Model: {isAdvanced.modelVersion || 'Enhanced EPA'}
          </div>
        )}
      </td>

      <td className="py-2 px-3 text-sm">
        <div className="flex flex-col gap-1">
          <div>
            <span className="text-gray-500">ML:</span> 
            <span className="font-medium">{ml.team}</span> 
            <span className="text-gray-600">({ml.price > 0 ? `+${ml.price}` : ml.price})</span>
            {ml.edge && <span className="text-xs text-blue-600 ml-1">({ml.edge.toFixed(1)}% edge)</span>}
          </div>
          <div>
            <span className="text-gray-500">Spread:</span> 
            <span className="font-medium">{sp.team} {sp.line > 0 ? `+${sp.line}` : sp.line}</span>
            {sp.edge && <span className="text-xs text-blue-600 ml-1">({sp.edge.toFixed(1)}pts edge)</span>}
          </div>
          <div>
            <span className="text-gray-500">Total:</span> 
            <span className="font-medium">{tot.side} {tot.line}</span>
            {tot.edge && <span className="text-xs text-blue-600 ml-1">({tot.edge.toFixed(1)}pts edge)</span>}
          </div>
        </div>
      </td>

      <td className="py-2 px-3 text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-gray-600">ML — <span className="font-medium">{ml.team}</span></span>
              {ml.betRecommendation && (
                <span className={`text-xs font-medium ${ml.betRecommendation === 'BET' ? 'text-green-600' : 'text-red-600'}`}>
                  {ml.betRecommendation}
                </span>
              )}
            </div>
            <ConfidenceBar value={ml.confidence} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-gray-600">Spread — <span className="font-medium">{sp.team} {sp.line > 0 ? `+${sp.line}` : sp.line}</span></span>
              {sp.betRecommendation && (
                <span className={`text-xs font-medium ${sp.betRecommendation === 'BET' ? 'text-green-600' : 'text-red-600'}`}>
                  {sp.betRecommendation}
                </span>
              )}
            </div>
            <ConfidenceBar value={sp.confidence} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-gray-600">Total — <span className="font-medium">{tot.side} {tot.line}</span></span>
              {tot.betRecommendation && (
                <span className={`text-xs font-medium ${tot.betRecommendation === 'BET' ? 'text-green-600' : 'text-red-600'}`}>
                  {tot.betRecommendation}
                </span>
              )}
            </div>
            <ConfidenceBar value={tot.confidence} />
          </div>
        </div>
      </td>
    </tr>
  );
}

function buildParlays(rows) {
  if (!rows?.length) return { three: [], five: [] };

  const rankedML = [...rows].map(r => ({ r, ml: bestMoneyline(r) }))
    .sort((a,b) => b.ml.confidence - a.ml.confidence);

  const top = (arr, n) => arr.slice(0, n);

  const mkLeg = (tag, item, kind) => {
    if (kind === 'ML') return { gameId: item.r.id, leg: `ML — ${item.ml.team}`, conf: item.ml.confidence, matchup: item.r.matchup };
    if (kind === 'SP') { const sp = spreadPick(item.r); return { gameId: item.r.id, leg: `Spread — ${sp.team} ${sp.line>0?`+${sp.line}`:sp.line}`, conf: sp.confidence, matchup: item.r.matchup }; }
    const to = totalPick(item.r); return { gameId: item.r.id, leg: `Total — ${to.side} ${to.line}`, conf: to.confidence, matchup: item.r.matchup };
  };

  // three variants for 3-legs
  const three = [
    { title: 'Top ML (3)', legs: top(rankedML,3).map(i => mkLeg('a', i, 'ML')) },
    { title: 'Mixed Best (3)', legs: top(rankedML,1).map(i => mkLeg('b', i, 'ML'))
        .concat(top(rankedML,2).map(i => mkLeg('b', i, 'SP'))).slice(0,3) },
    { title: 'Totals Lean (3)', legs: top(rankedML,3).map(i => mkLeg('c', i, 'TO')) },
  ];

  // and three 5-legs
  const five = [
    { title: 'Top ML (5)', legs: top(rankedML,5).map(i => mkLeg('d', i, 'ML')) },
    { title: 'Mixed (5)', legs: top(rankedML,2).map(i => mkLeg('e', i, 'ML'))
        .concat(top(rankedML.slice(2),2).map(i => mkLeg('e', i, 'SP')))
        .concat(top(rankedML.slice(4),1).map(i => mkLeg('e', i, 'TO'))) },
    { title: 'Sprinkle Dogs (5)', legs: top(rankedML.reverse(),5).map(i => mkLeg('f', i, 'ML')) },
  ];

  return { three, five };
}

export default function Predictions() {
  const { rows, updated, loading, error, source, version, metadata } = usePredictions();
  const parlays = useMemo(() => buildParlays(rows||[]), [rows]);
  
  // Extract advanced model information
  const modelInfo = metadata?.modelEnhancements || {};
  const modelVersion = modelInfo.version || version || 'unknown';
  const isAdvancedModel = source === 'r_pipeline_advanced_epa_model';
  const enhancedParlays = metadata?.parlayData || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">NFL Predictions</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-500">
          <span>Updated — {updated ? new Date(updated).toLocaleString() : '—'} v2.1</span>
          {isAdvancedModel && (
            <>
              <span className="hidden sm:inline">•</span>
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                🚀 R Pipeline + NFLVerse EPA Model
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="text-xs">v{modelVersion}</span>
            </>
          )}
        </div>
        {isAdvancedModel && modelInfo.enhancedFeatures && (
          <div className="mt-2 text-xs text-gray-400">
            Enhanced: {modelInfo.enhancedFeatures.calibrationFix}, {modelInfo.enhancedFeatures.varianceLevel} variance, 
            {modelInfo.enhancedFeatures.publicBias !== 'None' ? ' Public bias detected' : ' No bias detected'}
          </div>
        )}
      </div>

      {error && <div className="text-red-600 mb-4">Error: {error}</div>}
      {loading && <div className="text-gray-500">Loading…</div>}

      {!loading && rows?.length > 0 && (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="py-2 px-3">Kickoff (Local)</th>
                <th className="py-2 px-3">Matchup</th>
                <th className="py-2 px-3">Moneyline, Spread, Total Lines</th>
                <th className="py-2 px-3">Moneyline Pick • Spread Pick • O/U Pick</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {rows.map(r => <Row key={r.id} row={r} />)}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (!rows || rows.length === 0) && (
        <div className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
          No predictions available.
        </div>
      )}

      {/* Parlays */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0,1,2].map(i => (
          <div key={'p3-'+i} className="border rounded-md p-4 bg-white">
            <h3 className="font-semibold mb-3">{parlays.three[i]?.title || '3-Leg'}</h3>
            <ul className="space-y-2">
              {parlays.three[i]?.legs?.map((leg, idx) => (
                <li key={idx} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{leg.leg}</div>
                    <div className="text-xs text-gray-500">{leg.matchup}</div>
                  </div>
                  <ConfidenceBar value={leg.conf} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {[0,1,2].map(i => (
          <div key={'p5-'+i} className="border rounded-md p-4 bg-white">
            <h3 className="font-semibold mb-3">{parlays.five[i]?.title || '5-Leg'}</h3>
            <ul className="space-y-2">
              {parlays.five[i]?.legs?.map((leg, idx) => (
                <li key={idx} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{leg.leg}</div>
                    <div className="text-xs text-gray-500">{leg.matchup}</div>
                  </div>
                  <ConfidenceBar value={leg.conf} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

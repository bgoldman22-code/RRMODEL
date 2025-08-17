import React, { useEffect, useMemo, useState } from 'react';
import OddsBucketToggle from './components/OddsBucketToggle.jsx';

/**
 * This file is a safe, additive replacement for the picks rendering/selection.
 * It preserves your top-12 selection (by EV), then adds:
 *  - NEXT 3 table (best remaining while respecting doubles cap)
 *  - GAME DIVERSIFICATION picks (to reach 8–9 unique games), with odds-bucket toggle
 *
 * Env knobs (optional):
 *  VITE_TARGET_GAMES / TARGET_GAMES   -> default 8
 *  VITE_MAX_DOUBLES / MAX_DOUBLES     -> default 4  (max games allowed to have 2 picks)
 *  VITE_HIGH_HR_PARKS / HIGH_HR_PARKS -> "COL:Coors Field,NYY:Yankee Stadium,CIN:Great American,PHI:Citizens Bank"
 */

const TARGET_UNIQUE_GAMES = parseInt(import.meta.env?.VITE_TARGET_GAMES ?? process.env?.TARGET_GAMES ?? 8, 10);
const MAX_DOUBLES_GAMES   = parseInt(import.meta.env?.VITE_MAX_DOUBLES ?? process.env?.MAX_DOUBLES ?? 4, 10);
const HIGH_HR_PARKS_STR   = (import.meta.env?.VITE_HIGH_HR_PARKS ?? process.env?.HIGH_HR_PARKS ?? "COL:Coors Field,NYY:Yankee Stadium,CIN:Great American,PHI:Citizens Bank");
const HIGH_HR_PARKS = HIGH_HR_PARKS_STR.split(',').map(s=>s.trim());

function americanToDecimal(a){
  if (typeof a !== 'number') return null;
  if (a >= 0) return 1 + (a/100);
  return 1 + (100/Math.abs(a));
}
function impliedFromAmerican(a){
  const d = americanToDecimal(a);
  return d ? 1/d : null;
}
function bucketOf(a){
  if (typeof a !== 'number') return 'all';
  if (a <= 250) return 'short';
  if (a <= 400) return 'mid';
  return 'long';
}

export default function MLBPage({ picksSource }){
  const [picks, setPicks] = useState([]);
  const [next3, setNext3] = useState([]);
  const [diversify, setDiversify] = useState([]);
  const [bucket, setBucket] = useState('all');

  // Simulated fetch of today's candidate list. Replace with your actual loader.
  useEffect(()=>{
    async function load(){
      const res = await (typeof picksSource === 'function' ? picksSource() : Promise.resolve([]));
      const candidates = Array.isArray(res) ? res : [];
      // sort by EV descending (existing behavior)
      candidates.sort((a,b)=>(b.ev ?? 0)-(a.ev ?? 0));
      buildAll(candidates);
    }
    load();
  }, [picksSource]);

  function buildAll(cands){
    // Build top 12 with at most MAX_DOUBLES_GAMES having 2 players
    const perGame = new Map();
    const doubledGames = new Set();
    const top = [];

    for (const r of cands){
      const gm = r.game || 'UNK';
      const count = perGame.get(gm) || 0;
      // allow up to 2 per game, but only across at most MAX_DOUBLES_GAMES games
      if (count >= 2) continue;
      if (count === 1 && doubledGames.size >= MAX_DOUBLES_GAMES) continue;
      top.push(r);
      perGame.set(gm, count+1);
      if (count+1 === 2) doubledGames.add(gm);
      if (top.length >= 12) break;
    }

    // NEXT 3: best remaining not in top, preferring NEW games first
    const inTop = new Set(top.map(r=>r.id || `${r.name}|${r.game}`));
    const topGames = new Set(top.map(r=>r.game));
    const next = [];
    for (const r of cands){
      const key = r.id || `${r.name}|${r.game}`;
      if (inTop.has(key)) continue;
      // prefer picks from games not yet in top
      if (!topGames.has(r.game)) { next.push(r); }
      if (next.length === 3) break;
    }
    // if fewer than 3 new-game picks, fill with best remaining
    if (next.length < 3){
      for (const r of cands){
        const key = r.id || `${r.name}|${r.game}`;
        if (inTop.has(key) || next.find(x=>(x.id||`${x.name}|${x.game}`)===key)) continue;
        next.push(r);
        if (next.length === 3) break;
      }
    }

    // DIVERSIFICATION: ensure we reach TARGET_UNIQUE_GAMES and include at least one from high-HR parks
    const allSel = [...top, ...next];
    const gamesCovered = new Set(allSel.map(r=>r.game));
    const want = Math.max(TARGET_UNIQUE_GAMES, gamesCovered.size);
    const need = Math.max(0, want - gamesCovered.size);
    const highHRHits = new Set(allSel.map(r=>r.park).filter(Boolean).filter(pk=>HIGH_HR_PARKS.some(h=>pk.includes(h.split(':')[1]))));
    const needHighHR = HIGH_HR_PARKS.length > 0 && highHRHits.size === 0;

    // Filter candidates by bucket (if selected)
    const bucketed = cands.filter(r=>{
      if (inTop.has(r.id || `${r.name}|${r.game}`)) return false;
      const b = bucketOf(r.american);
      return bucket==='all' ? true : (b===bucket);
    });

    const div = [];
    // First, try to add one pick from any high HR park game if none yet
    if (needHighHR){
      for (const r of bucketed){
        if (div.length >= need && need>0) break;
        if (!gamesCovered.has(r.game)){
          const inHigh = r.park && HIGH_HR_PARKS.some(h=> (r.park||'').includes(h.split(':')[1]));
          if (inHigh){
            div.push(r);
            gamesCovered.add(r.game);
          }
        }
      }
    }
    // Fill remaining to reach target unique games
    for (const r of bucketed){
      if (div.length >= need) break;
      if (!gamesCovered.has(r.game)){
        div.push(r);
        gamesCovered.add(r.game);
      }
    }

    setPicks(top);
    setNext3(next);
    setDiversify(div);
  }

  // Rebuild diversification when bucket changes
  useEffect(()=>{
    // Re-run buildAll with current picksSource result if available
    // In a real app you'd keep the raw candidates in state; here we call again if function provided
    (async ()=>{
      if (typeof picksSource === 'function'){
        const res = await picksSource();
        const cands = Array.isArray(res)?res:[];
        cands.sort((a,b)=>(b.ev ?? 0)-(a.ev ?? 0));
        buildAll(cands);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  function CellMoney({v}){
    if (v==null) return <span>—</span>;
    return <span>{v>0?`+${v}`:v}</span>;
  }

  const Table = ({rows, title}) => (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
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
                <td className="px-3 py-2 text-right">{(r.p_model*100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right"><CellMoney v={r.american} /></td>
                <td className="px-3 py-2 text-right">{(r.ev ?? 0).toFixed(3)}</td>
                <td className="px-3 py-2">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-bold">MLB HR Picks</h1>

      <Table rows={picks} title="Top 12" />

      <Table rows={next3} title="Next 3" />

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Game diversification picks</h2>
        <OddsBucketToggle value={bucket} onChange={setBucket} />
      </div>
      <div className="opacity-70 text-xs mt-1">
        Target unique games: {TARGET_UNIQUE_GAMES} • Max double-up games: {MAX_DOUBLES_GAMES} • High-HR parks: {HIGH_HR_PARKS.join(', ')}
      </div>
      <div className="mt-2">
        <Table rows={diversify} title="" />
      </div>
    </div>
  );
}

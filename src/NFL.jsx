import React, { useEffect, useState } from 'react';
import RRSuggestion from './components/RRSuggestion.jsx';
import LearningStatus from './components/LearningStatus.jsx';
import { probToAmerican } from './utils/odds_estimator.js';
import { nflTDProbability } from './utils/nfl_td_model.js';
import { buildWhyNFL } from './utils/why_nfl.js';

const MAX_PER_GAME = 3;
const TARGET = 14;
const MIN_TARGET = 8;
const PRICE_FACTOR = 0.93;

export default function NFL(){
  const [picks, setPicks] = useState([]);
  const [meta, setMeta] = useState({ start:'', end:'', games:0, note:'', usedOdds:false });
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ generate(); }, []);

  async function generate(){
    setLoading(true); setPicks([]); setMeta(m=>({...m, note:''}));
    try{
      const { startISO, endISO } = upcomingThuMon();
      setMeta(m=>({...m, start:startISO, end:endISO }));

      const resp = await fetch('/.netlify/functions/nfl-candidates?start='+startISO+'&end='+endISO);
      const j = resp.ok ? await resp.json() : { candidates:[], games:[] };
      const cands = Array.isArray(j.candidates) ? j.candidates : [];
      const games = Array.isArray(j.games) ? j.games : [];

      if(cands.length===0){
        setMeta(m=>({...m, games: games.length||0, note:'No NFL candidates/odds available yet.'}));
        setLoading(false);
        return;
      }

      const computed = cands.map(c => {
        const prob = nflTDProbability(c.features||{});
        const { american } = probToAmerican(prob, PRICE_FACTOR);
        const why = c.why && c.why.length>10 ? c.why : buildWhyNFL({ ...c.features, player:c.player, gameCode:c.gameCode, position:c.position });
        return ({
          name: c.player,
          team: c.teamAbbr,
          game: c.gameCode,
          prob,
          american,
          why,
          gameId: c.gameId
        });
      });

      computed.sort((a,b)=> b.prob - a.prob);
      const perGame = {}; const selected = [];
      for(const r of computed){
        if((perGame[r.gameId]||0) >= MAX_PER_GAME) continue;
        selected.push(r); perGame[r.gameId]=(perGame[r.gameId]||0)+1;
        if(selected.length>=TARGET) break;
      }

      setPicks(selected);
      setMeta(m=>({...m, games: games.length||0, note:'', usedOdds:true }));
    }catch(e){
      console.error(e);
      setMeta(m=>({...m, note:'Error building NFL picks.'}));
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">NFL — Anytime TD (Round Robin)</h1>
        <button onClick={generate} disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60">
          {loading ? 'Crunching…' : 'Generate'}
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-4">
        Window: {meta.start} → {meta.end} • Games: {meta.games} {meta.note && <> • <span className="text-yellow-700">{meta.note}</span></>}
      </div>

      {picks.length>0 ? (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-right">Model TD%</th>
                <th className="px-3 py-2 text-right">American</th>
                <th className="px-3 py-2 text-left">Why</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((r,i)=> (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.team}</td>
                  <td className="px-3 py-2">{r.game}</td>
                  <td className="px-3 py-2 text-right">{(r.prob*100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{r.american>0?`+${r.american}`:r.american}</td>
                  <td className="px-3 py-2">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-600">No picks yet for this window.</div>
      )}

      <div className="mt-6">
        <LearningStatus model="NFL TD" />
      </div>
    </div>
  );
}

// --- helpers ---
function upcomingThuMon(){
  const now = new Date();
  const d = now.getUTCDay();
  let offset = (4 - d); if(offset<0) offset += 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+offset));
  const end = new Date(start.getTime() + 4*24*60*60*1000);
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10) };
}

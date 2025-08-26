import React, { useEffect, useState } from "react";
// Optional helpers if present; we guard at runtime so missing exports won't break build.
import * as FGB from "./fgb_pack/index.js";
import RRSuggestion from "./components/RRSuggestion.jsx";
import LearningStatus from "./components/LearningStatus.jsx";

// ---------- Tunables ----------
const TARGET = 12;
const MIN_TARGET = 6;
const MAX_PER_GAME = 2;
const PRICE_FACTOR = 0.95; // shave prices slightly to be conservative

// ---------- Utilities ----------
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
async function jget(u) { const r = await fetch(u); if (!r.ok) throw new Error("fetch " + u); return r.json(); }
function abbrFromName(name) {
  if (!name) return "TEAM";
  const parts = String(name).split(" ");
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 3).toUpperCase();
}
function todayISO() { return new Date().toISOString().split("T")[0]; }

// American odds from probability p (0-1) with optional price factor
function americanFromProb(p, k = 1.0) {
  const adj = clamp(p * k, 0.001, 0.999);
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}

// Binomial P(>=2 hits) with n AB and per-AB p (hit rate)

// Odds helpers
function americanToDecimal(a){
  a = Number(a);
  if(!isFinite(a)) return null;
  if(a>0) return 1 + (a/100);
  if(a<0) return 1 + (100/Math.abs(a));
  return 1.0;
}
function evFromProbAndAmerican(p, american){
  const dec = americanToDecimal(american);
  if(!dec) return null;
  return (p * (dec - 1)) - (1 - p);
}
function pAtLeast2(n, p) {
  n = Math.max(1, Math.round(n));
  p = clamp(p, 0.01, 0.6);
  const q = 1 - p;
  const p0 = Math.pow(q, n);
  const p1 = n * p * Math.pow(q, n - 1);
  return clamp(1 - p0 - p1, 0, 1);
}

// Safe access to FGB helpers if you’ve added them
const enhanceCandidates = FGB?.enhanceCandidates || (async (arr) => arr);
const applyCalibration = FGB?.applyCalibration || ((arr, _settings) => arr);


async function fetchGameContextBulk(gamePks){
  const unique = Array.from(new Set(gamePks.map(x=>String(x))));
  const out = new Map();
  for(const pk of unique){
    try{
      const r = await fetch(`/.netlify/functions/mlb-game-context?gamePk=${encodeURIComponent(pk)}`);
      if(!r.ok) continue;
      const j = await r.json();
      out.set(String(pk), j || {});
    }catch{}
  }
  return out;
}

// ---------- Component ----------
function MLB_HITS2() {
  const [picks, setPicks] = useState([]);
  const [meta, setMeta] = useState({ date: "", games: 0, pool: 0, selected: 0, note: "", odds: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { generate(); }, []);

  async function generate() {
    setLoading(true);
    setPicks([]);
    setMeta({ date: todayISO(), games: 0, pool: 0, selected: 0, note: "", odds: "" });

    try {
      const date = todayISO();

      // 1) Schedule
      const sched = await jget(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
      const games = sched?.dates?.[0]?.games || [];
      if (!games.length) {
        setMeta({ date, games: 0, pool: 0, selected: 0, note: "No MLB games today.", odds: "" });
        setLoading(false);
        return;
      }

      // 2) Collect team IDs and build game map
      const teamIds = new Set();
      const gm = new Map(); // gamePk -> {homeId, awayId}
      for (const g of games) {
        const home = g?.teams?.home?.team, away = g?.teams?.away?.team;
        if (home?.id && away?.id) {
          teamIds.add(home.id); teamIds.add(away.id);
          gm.set(String(g.gamePk), { homeId: home.id, awayId: away.id });
        }
      }
      const teamList = Array.from(teamIds);

      // 3) Team abbreviations (avoid AWY@HOM bug)
      const teamsRes = await jget(`https://statsapi.mlb.com/api/v1/teams?teamIds=${teamList.join(",")}`);
      const T = new Map();
      for (const t of (teamsRes?.teams || [])) {
        T.set(t.id, { abbr: t?.abbreviation || abbrFromName(t?.teamName || t?.name) });
      }

      // 4) Active rosters (exclude pitchers only; catchers are fine for hits)
      const roster = new Map();
      for (const tid of teamList) {
        try {
          const r = await jget(`https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`);
          const hitters = (r?.roster || [])
            .filter(x => (x?.position?.abbreviation || "").toUpperCase() !== "P")
            .map(x => ({ id: x?.person?.id, name: x?.person?.fullName }));
          roster.set(tid, hitters);
        } catch { roster.set(tid, []); }
      }

      // 5) Bulk season stats (current year)
      const ids = Array.from(new Set([].concat(...Array.from(roster.values()).map(v => v.map(p => p.id))).filter(Boolean)));
      if (!ids.length) {
        setMeta({ date, games: games.length, pool: 0, selected: 0, note: "No active hitters found.", odds: "" });
        setLoading(false); return;
      }

      const year = new Date().getUTCFullYear();
      const stats = await bulkHitting(ids, year); // Map id -> stat summary
      const hitIndex = stats;

      // 6) Build candidate pool
      const pool = [];
      for (const [gamePk, info] of gm) {
        const awayAbbr = T.get(info.awayId)?.abbr || "AWY";
        const homeAbbr = T.get(info.homeId)?.abbr || "HOM";
        const gameCode = `${awayAbbr}@${homeAbbr}`;

        for (const side of ["home", "away"]) {
          const tid = (side === "home") ? info.homeId : info.awayId;
          const hitters = roster.get(tid) || [];
          for (const p of hitters) {
            const s = stats.get(p.id) || {};
            const avg = clamp(Number(s.avg || 0), 0.15, 0.38);
            const g = Math.max(1, Number(s.games || 1));
            const pa = Math.max(1, Number(s.pa || 1));
            const paPerG = clamp(pa / g, 2.5, 5.0);  // crude lineup proxy
            const expAB = Math.round(paPerG); // ~3–5 AB

            const prob2 = pAtLeast2(expAB, avg);

            pool.push({
              id: p.id,
              name: p.name,
              team: T.get(tid)?.abbr || "",
              gameId: gamePk,
              gameCode,
              prob: clamp(prob2, 0.06, 0.55),
              why: `2+ hits model: BA ${(avg * 100).toFixed(0)}% • expAB ${expAB}`
            });
          }
        }
      }

      // 7) Enhance + Calibrate (optional modules; safe if missing)
      const enhanced = await enhanceCandidates(pool);
      let probMult = 1.0;
      try {
        const r = await fetch("/.netlify/functions/hits2-model-settings");
        if (r.ok) {
          const j = await r.json();
          probMult = Number(j?.calibration?.global?.probMult || 1.0);
        }
      } catch {}
      const calibrated = applyCalibration(enhanced, { global: { probMult } })
        .map(x => ({ ...x, prob: clamp(x.prob * probMult, 0.05, 0.65) }));

      // 8) Select with ≤2 per game
      calibrated.sort((a, b) => b.prob - a.prob);
      const perGame = {};
      const selected = [];
      for (const c of calibrated) {
        if ((perGame[c.gameId] || 0) >= MAX_PER_GAME) continue;
        selected.push(c);
        perGame[c.gameId] = (perGame[c.gameId] || 0) + 1;
        if (selected.length >= TARGET) break;
      }
      if (selected.length < MIN_TARGET) {
        for (const c of calibrated) {
          if (selected.find(x => x.id === c.id)) continue;
          if ((perGame[c.gameId] || 0) >= MAX_PER_GAME) continue;
          selected.push(c);
          perGame[c.gameId] = (perGame[c.gameId] || 0) + 1;
          if (selected.length >= MIN_TARGET) break;
        }
      }

      
      // 9) Enrich with recent form and game context (platoon, SP, bullpen)
      try{
        const idsAll = selected.map(x => x.id);
        const recents = await bulkHittingRecent(idsAll, season);
        const ctxByGame = await fetchGameContextBulk(selected.map(x => x.gameId));
        for(const row of selected){
          const recent = recents.get(row.id) || {};
          const ctx = ctxByGame.get(String(row.gameId)) || {};
          const side = (hitIndex.get(row.id)?.bat || '').toUpperCase(); // from bulkHitting
          // opponent SP + bullpen (we need which team they face)
          const homeAway = row.gameCode.split('@'); // away@home
          let oppCtx = null;
          if (homeAway.length===2){
            const awayAb = homeAway[0].toUpperCase();
            const homeAb = homeAway[1].toUpperCase();
            // row.team is player's team abbr; determine opponent side
            const playerIsAway = (row.team||'').toUpperCase() === awayAb;
            oppCtx = playerIsAway ? (ctx?.home || null) : (ctx?.away || null);
          }
          // Build descriptive "why"
          const sp = oppCtx?.starter || {};
          const pen = oppCtx?.bullpen || {};
          const throws = sp?.throws || '?';
          const baa = (sp?.baa != null) ? (sp.baa).toFixed(3) : (sp?.avgAllowed != null ? sp.avgAllowed.toFixed(3) : null);
          const ipPerStart = sp?.ipPerStart ? sp.ipPerStart.toFixed(1) : null;
          const recAvg = (recent?.avg15 != null) ? (recent.avg15*100).toFixed(0) + '%' : null;
          const platoon = (side && throws) ? `${side} vs ${throws}` : (side || throws || '');
          const fatiguePct = typeof pen?.fatigueAdj === 'number' ? Math.round((pen.fatigueAdj-1)*100) : 0;

          // Adjust probability with small multipliers based on context (capped to keep model stable)
          let m = 1.0;
          if(baa && !isNaN(baa)){ // lower BAA reduces prob slightly; 0.200 -> -6%, 0.280 -> +6%
            const baaNum = parseFloat(baa);
            m *= (1 + clamp(((0.260 - baaNum) * 0.75), -0.08, 0.08));
          }
          if(typeof pen?.fatigueAdj === 'number') m *= clamp(pen.fatigueAdj, 0.92, 1.10);
          // batting side vs throws (mild)
          if(platoon.includes('L') && throws==='R') m *= 1.03;
          else if(platoon.includes('R') && throws==='L') m *= 1.02;

          const adjProb = clamp(row.prob * m, 0.05, 0.65);
          row.prob = adjProb;

          // Construct WHY string
          const whyBits = [];
          whyBits.push(`season AVG ${( (hitIndex.get(row.id)?.avg||0)*100 ).toFixed(0)}%`);
          if(recAvg) whyBits.push(`L15 AVG ${recAvg}`);
          whyBits.push(`expAB ~${Math.round(Math.max(3, Math.min(5, (hitIndex.get(row.id)?.pa || 0)/Math.max(1,hitIndex.get(row.id)?.games || 1))))}`);
          if(platoon) whyBits.push(`platoon ${platoon}`);
          if(sp?.name) whyBits.push(`vs ${throws} ${sp.name}${baa?` (BAA ${baa})`:''}${ipPerStart?` • IP/start ${ipPerStart}`:''}`);
          if(pen?.ip3d != null) whyBits.push(`opp BP last3d ${pen.ip3d.toFixed(1)} IP${fatiguePct?` • fatigue ${fatiguePct>=0?'+':''}${fatiguePct}%`:''}`);

          row.why = whyBits.join(' • ');
        }
      }catch{}
// 9) Odds via your proxy (best-effort)
      let oddsNote = "odds: estimator only";
      try {
        const rr = await fetch("/.netlify/functions/odds-hits2?league=mlb&markets=player_total_hits,batter_hits_over_under,player_2+_hits&regions=us&limit=40");
        if (rr.ok) {
          const data = await rr.json();
          const idx = buildHitsIndex(data);
          oddsNote = data?.usingOddsApi ? `odds: TheOddsAPI (quota left ${data?.quota?.remaining ?? '?'})` : oddsNote;
          selected.forEach(row => {
            const key = `${row.gameCode}|${row.name}`.toLowerCase();
            const american = idx.get(key);
            if (typeof american === 'number') {
              row.apiAmerican = american;
              row.ev1u = evFromProbAndAmerican(row.prob, american);
            }
            if (typeof american === "number") row.apiAmerican = american;
          });
          oddsNote = data?.source ? `odds: The Odds API (${data.source})` : "odds: The Odds API";
        }
      } catch {}

      setPicks(selected);
      setMeta({ date, games: games.length, pool: calibrated.length, selected: selected.length, note: calibrated.length < TARGET ? "Expanded pool to reach ≥6." : "", odds: oddsNote });

      // 10) Submit for learning
      try {
        await fetch("/.netlify/functions/hits2-submit-picks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, picks: selected })
        });
      } catch {}

    } catch (e) {
      console.error(e);
      setMeta(m => ({ ...m, note: "Error building 2+ hits picks." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">MLB — 2+ Hits Round Robin</h1>
        <p className="text-gray-600 text-center text-sm mb-1">
          Date: {meta.date || "—"} • Games: {meta.games} • Pool: {meta.pool} • Selected: {meta.selected}
        </p>
        <p className="text-gray-500 text-center text-xs mb-4">{meta.odds}</p>

        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? "Crunching…" : "Generate 2+ Hits Picks"}
          </button>
        </div>

        {meta.note && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">
            {meta.note}
          </div>
        )}

        {picks.length > 0 && (
          <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Game</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Model 2+ Hits Prob</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Model Fair</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {picks.map((p, i) => {
                  const line = typeof p.apiAmerican === "number" ? p.apiAmerican : americanFromProb(p.prob, PRICE_FACTOR);
                  const lineTxt = line > 0 ? `+${line}` : `${line}`;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.team}</td>
                      <td className="px-4 py-2">{p.gameCode}</td>
                      <td className="px-4 py-2">{(p.prob * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2">{lineTxt}</td>
                      <td className="px-4 py-2">{typeof p.apiAmerican==='number' ? (p.apiAmerican>0?`+${p.apiAmerican}`:`${p.apiAmerican}`) : '—'}</td>
                      <td className="px-4 py-2">{(typeof p.ev1u==='number') ? (p.ev1u>=0?`+${(p.ev1u).toFixed(2)}`:`${(p.ev1u).toFixed(2)}`) : '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{p.why}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {picks.length > 1 && <RRSuggestion picks={picks} />}
        <LearningStatus sport="hits2" />
      </div>
    </div>
  );
}

// --------- Helpers (Stats pulls) ----------
async function bulkHitting(ids, season) {
  const out = new Map();
  if (!ids.length) return out;
  const chunk = 35; // StatsAPI is good with ~30–50 ids per call
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const u = `https://statsapi.mlb.com/api/v1/people?personIds=${part.join(",")}&hydrate=stats(group=[hitting],type=[season],season=${season})`;
    try {
      const j = await jget(u);
      for (const p of (j?.people || [])) {
        const s = p?.stats?.[0]?.splits?.[0]?.stat || {};
        out.set(p?.id, {
          avg: Number(s?.avg || s?.battingAverage || 0),
          pa: Number(s?.plateAppearances || 0),
          games: Number(s?.gamesPlayed || 0),
          bat: (p?.batSide?.code || p?.batSide?.description || '').toUpperCase().slice(0,1)
        });
      }
    } catch { /* ignore chunk errors */ }
  }
  return out;
}


async function bulkHittingRecent(ids, season){
  const out = new Map();
  if(!ids.length) return out;
  const chunk = 35;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const u = `https://statsapi.mlb.com/api/v1/people?personIds=${part.join(",")}&hydrate=stats(group=[hitting],type=[lastXGames],limit=15)`;
    try{
      const j = await jget(u);
      for(const p of (j?.people||[])){
        // lastXGames returns an entry with stat over last N games
        const sp = (p?.stats||[]).find(s => (s?.group?.displayName||"").toLowerCase().includes("hitting"));
        const stat = sp?.splits?.[0]?.stat || {};
        out.set(p?.id, { avg15: Number(stat?.avg || stat?.battingAverage || 0) });
      }
    }catch{ /* ignore chunk errors */ }
  }
  return out;
}


// Build index { "AWY@HOM|Player Name" -> american price } from Odds API payload
function buildHitsIndex(data) {
  const map = new Map();
  try {
    const events = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    for (const ev of events) {
      const away = abbrFromName(ev.away_team);
      const home = abbrFromName(ev.home_team);
      const gameCode = `${away}@${home}`.toLowerCase();
      for (const bk of (ev.bookmakers || [])) {
        for (const mk of (bk.markets || [])) {
          const key = String(mk.key || "").toLowerCase();
          // Only consider hits markets
          if (!(key.includes("hits"))) continue;
          for (const oc of (mk.outcomes || [])) {
            const player = String(oc.name || "").trim();
            const desc = String(oc.description || "").toLowerCase();
            const price = Number(oc.price);
            if (!player || !Number.isFinite(price)) continue;

            // Accept "2+ hits" or "over 1.5" style descriptions
            const isTwoPlus = desc.includes("2+") || desc.includes("two+") || desc.includes("over 1.5") || desc.includes("2 plus");
            if (!isTwoPlus) continue;

            const idxKey = `${gameCode}|${player}`.toLowerCase();
            // Keep the shortest absolute price (closest to pick-em)
            if (!map.has(idxKey) || Math.abs(price) < Math.abs(map.get(idxKey))) map.set(idxKey, price);
          }
        }
      }
    }
  } catch { /* noop */ }
  return map;
}

export default MLB_HITS2;

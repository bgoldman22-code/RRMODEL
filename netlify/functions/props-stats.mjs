
// netlify/functions/props-stats.mjs
import { getBlobsStore } from "./_blobs.js";

function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim(); }

async function mlbFetch(url){
  const r = await fetch(url, { headers: { "accept":"application/json" }});
  if (!r.ok) return null;
  return await r.json();
}

async function playerSearch(name){
  const j = await mlbFetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`);
  const p = j?.people?.[0];
  return p ? { id: p.id, fullName: p.fullName, currentTeam: p?.currentTeam?.id } : null;
}

async function seasonStats(pid){
  const j = await mlbFetch(`https://statsapi.mlb.com/api/v1/people/${pid}?hydrate=stats(group=[hitting],type=[season])`);
  const stats = j?.people?.[0]?.stats?.[0]?.splits?.[0]?.stat || null;
  if (!stats) return null;
  const games = Number(stats.gamesPlayed || stats.games || 120);
  const hits = Number(stats.hits || 0);
  const runs = Number(stats.runs || 0);
  const rbi = Number(stats.rbi || 0);
  const doubles = Number(stats.doubles || 0);
  const triples = Number(stats.triples || 0);
  const hr = Number(stats.homeRuns || 0);
  const tb = hits + doubles + 2*triples + 3*hr;
  const hrrbi = hits + runs + rbi;
  const tbPerGame = games>0 ? tb/games : 1.2;
  const hrrbiPerGame = games>0 ? hrrbi/games : 1.6;
  return { games, tbPerGame, hrrbiPerGame };
}

async function lastNGames(pid, n=15){
  const year = new Date().getFullYear();
  const j = await mlbFetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&season=${year}&group=hitting`);
  const splits = j?.stats?.[0]?.splits || [];
  const recent = splits.slice(-n);
  let H=0,R=0,RBI=0,TB=0,g=0;
  for (const s of recent){
    const st = s?.stat||{};
    H += Number(st.hits||0);
    R += Number(st.runs||0);
    RBI += Number(st.rbi||0);
    const doubles = Number(st.doubles||0);
    const triples = Number(st.triples||0);
    const hr = Number(st.homeRuns||0);
    TB += Number(st.hits||0) + doubles + 2*triples + 3*hr;
    g += 1;
  }
  return { recentGames:g, recentTbPerGame: g?TB/g: null, recentHRRBIPerGame: g? (H+R+RBI)/g:null };
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const metric = (q.metric || "tb").toLowerCase(); // tb or hrrbi
  const key = metric === "hrrbi" ? "props/latest_hrrbi.json" : "props/latest_tb.json";
  const store = getBlobsStore();
  const map = await store.getJSON(key) || {};
  const names = Object.keys(map);
  const out = { ok:true, metric, count:names.length, players:{} };
  const cacheKey = `props/cache_${metric}_players.json`;
  let cache = await store.getJSON(cacheKey) || {};
  for (const n of names.slice(0,400)){
    if (cache[n] && cache[n].stamp && Date.now() - cache[n].stamp < 12*3600*1000){
      out.players[n] = cache[n];
      continue;
    }
    try{
      const p = await playerSearch(n);
      if (!p) continue;
      const s = await seasonStats(p.id);
      if (!s) continue;
      const r = await lastNGames(p.id, 15);
      const rec = { name:n, ...s, ...r, park:"", stamp:Date.now() };
      out.players[n] = rec;
      cache[n] = rec;
    }catch(e){ /* ignore */ }
  }
  await store.setJSON(cacheKey, cache);
  return { statusCode:200, headers:{"content-type":"application/json"}, body: JSON.stringify(out) };
};

// netlify/functions/nfl-td-candidates.mjs
import { getStore } from "@netlify/blobs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

const POS_PRIOR = { RB: 0.26, WR: 0.17, TE: 0.14, QB: 0.06 };
const DEPTH_DELTA = [0.10, -0.04, -0.07, -0.10];

function clamp(p, min=0.005, max=0.75){ return Math.max(min, Math.min(max, p)); }
function split(pos){ if(pos==="RB")return{rz:0.68,exp:0.32}; if(pos==="TE")return{rz:0.58,exp:0.42}; if(pos==="WR")return{rz:0.44,exp:0.56}; return{rz:0.35,exp:0.65}; }

export default async function handler(req) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week"); if (week) week = Number(week);
  const debug = url.searchParams.get("debug") === "1";

  const store = STORE();
  let schedule = await readSchedule(store, season, week);
  let triedBootstrap = false;
  const diag = { storeName: process.env.NFL_TD_BLOBS || "nfl-td", list: [], attemptedBootstrap: false };

  if (!schedule) {
    // try to auto-bootstrap
    triedBootstrap = true;
    diag.attemptedBootstrap = true;
    try {
      const origin = url.origin || ""; // Netlify provides full URL
      const b = await fetch(`${origin}/.netlify/functions/nfl-bootstrap?refresh=1`).then(r=>r.json());
      diag.bootstrap = b;
    } catch(e) {
      diag.bootstrapError = String(e);
    }
    schedule = await readSchedule(store, season, week);
  }

  if (!schedule) {
    try { diag.list = await store.list(); } catch(e) { diag.listErr = String(e); }
    const body = { ok:false, error:"schedule cache missing even after bootstrap", season, week: week || null, diag };
    return json(body, 424);
  }

  const teamIds = new Set();
  for (const g of (schedule.games||[])) { if(g.home?.id) teamIds.add(g.home.id); if(g.away?.id) teamIds.add(g.away.id); }

  const depths = {};
  for (const id of teamIds) {
    const d = await readDepth(store, season, schedule.week, id);
    if (d) depths[id] = d;
  }

  const candidates = [];
  for (const g of (schedule.games||[])) {
    const H = depths[g.home?.id] || {};
    const A = depths[g.away?.id] || {};
    addTeam(g.home?.id, H, g.away?.abbrev, candidates);
    addTeam(g.away?.id, A, g.home?.abbrev, candidates);
  }

  candidates.sort((a,b)=> b.modelTdPct - a.modelTdPct);
  const body = { ok:true, season: schedule.season, week: schedule.week, games: (schedule.games||[]).length, candidates };
  if (debug) body.diag = diag;
  return json(body);
}

function addTeam(teamId, charts, opp, out){
  for (const pos of ["RB","WR","TE","QB"]) {
    const list = charts[pos] || [];
    list.forEach((name, idx) => {
      let p = (POS_PRIOR[pos] ?? 0.05) + (DEPTH_DELTA[idx] ?? -0.1*idx);
      const salt = (opp?.charCodeAt?.(0) ?? 65) % 7 / 1000;
      p = clamp(p + salt);
      const { rz, exp } = split(pos);
      out.push({
        player: name, teamId, pos,
        modelTdPct: +(p*100).toFixed(1),
        rzPath: +(p*rz*100).toFixed(1),
        expPath: +(p*exp*100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${opp}`
      });
    });
  }
}

async function readSchedule(store, season, week){
  if (!week) {
    try {
      const keys = await store.list();
      const prefix = `weeks/${season}/`;
      const ks = keys.filter(k => k.startsWith(prefix) && k.endsWith("/schedule.json"));
      let best = null;
      for (const k of ks) { const parts = k.split("/"); const w = +parts[2]; if (!best || w>best) best = w; }
      if (best) week = best;
    } catch {}
  }
  if (!week) return null;
  try { return await store.getJSON(`weeks/${season}/${week}/schedule.json`); } catch { return null; }
}

async function readDepth(store, season, week, teamId){
  try { return await store.getJSON(`weeks/${season}/${week}/depth/${teamId}.json`); } catch { return null; }
}

function json(body, status=200){ return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json" } }); }

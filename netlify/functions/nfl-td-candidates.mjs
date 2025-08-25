// netlify/functions/nfl-td-candidates.mjs
import { getStore } from "@netlify/blobs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

const POS_PRIOR = { RB: 0.26, WR: 0.17, TE: 0.14, QB: 0.06 };
const DEPTH_DELTA = [0.10, -0.04, -0.07, -0.10]; // starter boost, then dropoffs

function blend(p, min=0.005, max=0.75) {
  return Math.max(min, Math.min(max, p));
}

function splitRzExp(pos) {
  if (pos === "RB") return { rz: 0.68, exp: 0.32 };
  if (pos === "TE") return { rz: 0.58, exp: 0.42 };
  if (pos === "WR") return { rz: 0.44, exp: 0.56 };
  return { rz: 0.35, exp: 0.65 };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const season = url.searchParams.get("season") || new Date().getFullYear();
  const week = url.searchParams.get("week") || undefined;

  // If data missing, ask caller to run bootstrap with refresh
  const store = STORE();
  const schedule = await loadJSON(store, season, week, "schedule");
  if (!schedule) {
    return j({ ok:false, error:"missing schedule cache; call /nfl-bootstrap?refresh=1 first", season, week }, 424);
  }

  const teamIds = new Set();
  for (const g of schedule.games || []) {
    if (g.home?.id) teamIds.add(g.home.id);
    if (g.away?.id) teamIds.add(g.away.id);
  }

  const teamDepths = {};
  for (const id of teamIds) {
    const d = await loadJSON(store, season, week, `depth/${id}`, true);
    if (d) teamDepths[id] = d;
  }

  const candidates = [];
  for (const g of schedule.games || []) {
    const H = teamDepths[g.home?.id] || {};
    const A = teamDepths[g.away?.id] || {};
    const add = (teamId, charts, oppAbbrev) => {
      for (const pos of ["RB","WR","TE","QB"]) {
        const list = charts[pos] || [];
        list.forEach((name, idx) => {
          let p = POS_PRIOR[pos] ?? 0.05;
          p += (DEPTH_DELTA[idx] ?? -0.1 * idx);
          // Small opponent-based seasoning so both teams differ
          const salt = (oppAbbrev?.charCodeAt?.(0) ?? 65) % 7 / 1000;
          p = blend(p + salt);
          const { rz, exp } = splitRzExp(pos);
          candidates.push({
            player: name,
            teamId,
            pos,
            modelTdPct: +(p * 100).toFixed(1),
            rzPath: +(p * rz * 100).toFixed(1),
            expPath: +(p * exp * 100).toFixed(1),
            why: `${pos} • depth ${idx+1} • vs ${oppAbbrev}`
          });
        });
      }
    };
    add(g.home?.id, H, g.away?.abbrev);
    add(g.away?.id, A, g.home?.abbrev);
  }

  candidates.sort((a,b)=> b.modelTdPct - a.modelTdPct);
  return j({ ok:true, season, week: schedule.week, games: (schedule.games||[]).length, candidates }, 200);
}

async function loadJSON(store, season, week, key, isDepth=false) {
  if (!week) {
    // Try to discover week from keys
    try {
      const keys = await store.list();
      const prefix = `weeks/${season}/`;
      const candidates = keys.filter(k => k.startsWith(prefix) && k.endsWith("/schedule.json"));
      // Pick the latest numeric week in store
      let best = null;
      for (const k of candidates) {
        const parts = k.split("/");
        const w = +parts[2];
        if (!best || w > best) best = w;
      }
      if (best) week = best;
    } catch {}
  }
  const path = isDepth ? `weeks/${season}/${week}/${key}.json` : `weeks/${season}/${week}/${key}.json`;
  try { return await store.getJSON(path); } catch { return null; }
}

function j(body, status=200){ return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json" } }); }

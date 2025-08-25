// nfl-td-candidates.mjs
// Builds Anytime TD candidate rows using (1) the depth charts produced by nfl-bootstrap
// and (2) simple priors that can later be replaced with your 3y model.
import { getStore } from "@netlify/blobs";

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
  };
}

const POS_BASE = { RB: 0.28, WR: 0.18, TE: 0.16, QB: 0.06 };
const DEPTH_FACT = [0.08, -0.04, -0.07, -0.09];

function calcProb(pos, depthIdx) {
  const base = POS_BASE[pos] || 0.05;
  const d = DEPTH_FACT[depthIdx] ?? (-0.1 * depthIdx);
  const p = Math.max(0.005, Math.min(0.85, base + d));
  return p;
}

function rowsForTeam(abbr, charts, opponent) {
  const rows = [];
  for (const pos of ["RB","WR","TE","QB"]) {
    const list = charts?.[pos] || [];
    list.forEach((name, idx) => {
      const p = calcProb(pos, idx);
      const rzShare = pos==="RB" ? 0.7 : pos==="TE" ? 0.6 : pos==="WR" ? 0.45 : 0.35;
      rows.push({
        player: name,
        team: abbr,
        pos,
        modelTdPct: +(p * 100).toFixed(1),
        rzPath: +(p * rzShare * 100).toFixed(1),
        expPath: +(p * (1-rzShare) * 100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${opponent}`
      });
    });
  }
  return rows;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { headers: cors() });
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || undefined;
  const week = Number(url.searchParams.get("week")) || undefined;
  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";

  let current = { season: undefined, week: undefined };
  try {
    const store = getStore({ name: storeName });
    const j = await store.getJSON("weeks/current.json");
    if (j) current = j;
  } catch {}

  const year = season || current.season;
  const wk = week || current.week;
  if (!year || !wk) {
    return new Response(JSON.stringify({ ok:false, error:"no season/week available; run nfl-bootstrap first" }), { status: 400, headers: cors() });
  }

  let schedule = null, depthCharts = null;
  try {
    const store = getStore({ name: storeName });
    schedule = await store.getJSON(`weeks/${year}/${wk}/schedule.json`);
    depthCharts = await store.getJSON(`weeks/${year}/${wk}/depth-charts.json`);
  } catch {}

  if (!schedule || !Array.isArray(schedule) || !depthCharts) {
    return new Response(JSON.stringify({ ok:false, error:"missing schedule/depth charts; call /.netlify/functions/nfl-bootstrap first" }), { status: 400, headers: cors() });
  }

  const candidates = [];
  for (const g of schedule) {
    const home = g.home, away = g.away;
    const homeCharts = depthCharts[home] || {};
    const awayCharts = depthCharts[away] || {};
    candidates.push(...rowsForTeam(away, awayCharts, home));
    candidates.push(...rowsForTeam(home, homeCharts, away));
  }
  candidates.sort((a,b)=> b.modelTdPct - a.modelTdPct);

  return new Response(JSON.stringify({ ok:true, season:year, week:wk, games:schedule.length, candidates }), { headers: cors() });
}

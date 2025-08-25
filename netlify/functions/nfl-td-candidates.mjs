import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = (p) => join(process.cwd(), p);

async function readJSON(rel) {
  try {
    const txt = await readFile(REPO(rel), "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// Simple model: baseline by position + depth weighting + crude split into RZ vs EXP
const POS_BASE = { RB: 0.28, WR: 0.18, TE: 0.16, QB: 0.06 };
const DEPTH_FACT = [0.08, -0.04, -0.07, -0.09];

function playerRows(teamCode, charts, opponent) {
  const rows = [];
  const add = (pos) => {
    const list = charts[pos] || [];
    list.forEach((name, idx) => {
      const base = POS_BASE[pos] || 0.05;
      const depthAdj = DEPTH_FACT[idx] || -0.1 * idx;
      // tiny opponent tweak so both games differ a bit
      const oppAdj = opponent.charCodeAt(0) % 7 / 1000; // ~0.0x
      let p = Math.max(0.01, Math.min(0.75, base + depthAdj + oppAdj));

      // Split into paths
      let rzShare, expShare;
      if (pos === "RB") { rzShare = 0.7; expShare = 0.3; }
      else if (pos === "TE") { rzShare = 0.6; expShare = 0.4; }
      else if (pos === "WR") { rzShare = 0.45; expShare = 0.55; }
      else { rzShare = 0.35; expShare = 0.65; } // QB scrambles

      rows.push({
        player: name,
        team: teamCode,
        position: pos,
        modelTdPct: +(p * 100).toFixed(1),
        rzPath: +(p * rzShare * 100).toFixed(1),
        expPath: +(p * expShare * 100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${opponent}`
      });
    });
  };
  ["RB","WR","TE","QB"].forEach(add);
  return rows;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const week = url.searchParams.get("week") || "1";

  // Read schedule and charts from repo (no Blobs required)
  const charts = await readJSON("data/nfl-td/depth-charts.json");
  const schedule = await readJSON("data/nfl-td/schedule-week1-2025.json");

  if (!charts) {
    return new Response(JSON.stringify({ ok:false, error:"missing data/nfl-td/depth-charts.json" }), { status: 500, headers: { "content-type":"application/json" } });
  }
  if (!schedule) {
    return new Response(JSON.stringify({ ok:false, error:"missing data/nfl-td/schedule-week1-2025.json" }), { status: 500, headers: { "content-type":"application/json" } });
  }

  const games = schedule.map(g => ({
    home: g.home, away: g.away
  }));

  const candidates = [];
  for (const g of games) {
    const homeCharts = charts[g.home] || {};
    const awayCharts = charts[g.away] || {};
    candidates.push(...playerRows(g.away, awayCharts, g.home));
    candidates.push(...playerRows(g.home, homeCharts, g.away));
  }

  // Sort by model % desc and cap list size
  candidates.sort((a,b)=> b.modelTdPct - a.modelTdPct);
  const limited = candidates.slice(0, 60);

  return new Response(JSON.stringify({
    ok: true,
    week,
    games: games.length,
    candidates: limited
  }), { headers: { "content-type":"application/json" } });
}

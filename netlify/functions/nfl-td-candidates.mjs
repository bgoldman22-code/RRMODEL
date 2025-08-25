// netlify/functions/nfl-td-candidates.mjs
import { getStore } from "@netlify/blobs";

const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

// simple priors; replace with your model later
const POS_PRIOR = { RB: 0.26, WR: 0.17, TE: 0.14, QB: 0.06 };
const DEPTH_DELTA = [0.10, -0.04, -0.07, -0.10];
const POS_ORDER = ["RB","WR","TE","QB"];

export default async function handler(req) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : undefined;
  const debug = url.searchParams.get("debug") === "1";

  const store = STORE();
  const diag = { season, week, steps: [] };

  // 1) Try store for schedule
  let schedule = await loadScheduleFromStore(store, season, week);
  diag.steps.push({ step: "load schedule from blobs", ok: !!schedule, week: schedule?.week });

  // 2) If missing, call bootstrap (without forcing refresh) and USE ITS schedule
  if (!schedule) {
    const b = await safeFetchJSON(`/.netlify/functions/nfl-bootstrap?season=${season}${week?`&week=${week}`:""}`, "bootstrap");
    diag.steps.push({ step: "bootstrap call", ok: b.ok, status: b.status });
    if (b.ok && b.json?.ok && b.json?.schedule?.games?.length) {
      schedule = b.json.schedule;
      week = schedule.week;
      diag.steps.push({ step: "use bootstrap.schedule", ok: true, week });
    } else {
      // try reading again in case bootstrap wrote cache
      schedule = await loadScheduleFromStore(store, season, week);
      diag.steps.push({ step: "re-read schedule from blobs", ok: !!schedule, week: schedule?.week });
    }
  }

  if (!schedule || !Array.isArray(schedule.games) || schedule.games.length === 0) {
    return j(debug ? { ok:false, error:"schedule unavailable", diag } : { ok:false, error:"schedule unavailable" }, 424);
  }

  // 3) Load per-team depth
  const teamIds = [...new Set(schedule.games.flatMap(g => [g?.home?.id, g?.away?.id]).filter(Boolean))];
  const depths = {};
  for (const id of teamIds) {
    const path = `weeks/${schedule.season}/${schedule.week}/depth/${id}.json`;
    let chart = null;
    try { chart = await store.getJSON(path); } catch {}
    if (!isValidChart(chart)) chart = fallbackChart(id);
    depths[id] = chart;
  }

  // 4) Build rows
  const rows = [];
  for (const g of schedule.games) {
    addRows(rows, g.home?.id, depths[g.home?.id], g.away?.abbrev);
    addRows(rows, g.away?.id, depths[g.away?.id], g.home?.abbrev);
  }
  rows.sort((a,b)=> b.modelTdPct - a.modelTdPct);

  const body = { ok:true, season: schedule.season, week: schedule.week, games: schedule.games.length, candidates: rows };
  if (debug) body.diag = diag;
  return j(body, 200);
}

async function loadScheduleFromStore(store, season, week) {
  let w = week;
  if (!w) {
    try {
      const keys = await store.list();
      const weeks = keys.filter(k => k.startsWith(`weeks/${season}/`) && k.endsWith("/schedule.json"))
                        .map(k => Number(k.split("/")[2]))
                        .filter(Number.isFinite)
                        .sort((a,b)=> b - a);
      if (weeks.length) w = weeks[0];
    } catch {}
  }
  if (!w) return null;
  try { return await store.getJSON(`weeks/${season}/${w}/schedule.json`); } catch { return null; }
}

function addRows(out, teamId, chart, oppAbbrev) {
  for (const pos of POS_ORDER) {
    const list = (chart?.[pos] || []);
    list.forEach((name, idx) => {
      let p = (POS_PRIOR[pos] ?? 0.05) + (DEPTH_DELTA[idx] ?? -0.1 * idx);
      // tiny salt so ties sort stable but different across matchups
      const salt = (oppAbbrev?.charCodeAt?.(0) ?? 65) % 7 / 1000;
      p = Math.max(0.005, Math.min(0.75, p + salt));
      const rz = pos==="RB" ? 0.68 : pos==="TE" ? 0.58 : pos==="WR" ? 0.44 : 0.35;
      const exp = 1 - rz;
      out.push({
        player: name,
        teamId,
        pos,
        modelTdPct: +(p*100).toFixed(1),
        rzPath: +(p*rz*100).toFixed(1),
        expPath: +(p*exp*100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${oppAbbrev||"?"}`,
      });
    });
  }
}

function isValidChart(c) {
  if (!c || typeof c !== "object") return false;
  return ["RB","WR","TE","QB"].some(k => Array.isArray(c[k]) && c[k].length);
}

function fallbackChart(id) {
  return {
    QB: [`QB1-${id}`],
    RB: [`RB1-${id}`, `RB2-${id}`],
    WR: [`WR1-${id}`, `WR2-${id}`, `WR3-${id}`],
    TE: [`TE1-${id}`],
  };
}

function j(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function safeFetchJSON(url, label) {
  try {
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    const json = await res.json().catch(()=>null);
    return { ok: res.ok, status: res.status, json, label };
  } catch (e) {
    return { ok:false, status:0, json:null, label, error:String(e) };
  }
}

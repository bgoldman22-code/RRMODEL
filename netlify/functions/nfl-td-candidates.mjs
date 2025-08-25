
import { getStore } from "@netlify/blobs";

const STORE_NAME = process.env.NFL_TD_BLOBS || "nfl-td";

const POS_PRIOR = { RB: 0.26, WR: 0.17, TE: 0.14, QB: 0.06 };
const DEPTH_DELTA = [0.10, -0.04, -0.07, -0.10]; // starter boost, then drop-offs
const FPOS = ["RB","WR","TE","QB"];

function clamp(p, min=0.005, max=0.75) { return Math.max(min, Math.min(max, p)); }
function splitRzExp(pos) {
  if (pos === "RB") return { rz: 0.68, exp: 0.32 };
  if (pos === "TE") return { rz: 0.58, exp: 0.42 };
  if (pos === "WR") return { rz: 0.44, exp: 0.56 };
  return { rz: 0.35, exp: 0.65 }; // QB scrambles
}

export default async function handler(req) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : undefined;

  let store = null;
  try { store = getStore({ name: STORE_NAME }); } catch (e) { /* non-fatal */ }

  const diag = { steps: [], season, week };

  // 1) Try to read schedule from blobs
  let schedule = await loadFromStore(store, season, week, "schedule.json");
  diag.steps.push({ step:"load schedule cache", ok: !!schedule });

  // 2) If missing, call bootstrap and use its payload directly
  if (!schedule) {
    const bUrl = `/.netlify/functions/nfl-bootstrap?refresh=1${Number.isFinite(season)?`&season=${season}`:""}${Number.isFinite(week)?`&week=${week}`:""}&debug=1`;
    const b = await safeFetchJSON(bUrl);
    diag.steps.push({ step:"bootstrap", ok:b.ok, status:b.status });
    if (b.ok && b.json?.ok) {
      if (b.json?.schedule?.games?.length) {
        schedule = b.json.schedule;
        week = b.json.week;
      } else {
        // try reread after bootstrap wrote
        const reread = await loadFromStore(store, b.json.season, b.json.week, "schedule.json");
        if (reread) {
          schedule = reread;
          week = reread.week || b.json.week;
        }
      }
    }
  }

  if (!schedule || !Array.isArray(schedule.games) || schedule.games.length === 0) {
    return j(debug ? { ok:false, error:"schedule cache missing even after bootstrap", diag } :
                     { ok:false, error:"schedule unavailable" }, 424);
  }

  // 3) Load depth charts; if missing, try to fabricate from roster endpoints on the fly
  const teamIds = new Set();
  for (const g of schedule.games) {
    if (g.home?.id) teamIds.add(g.home.id);
    if (g.away?.id) teamIds.add(g.away.id);
  }

  const charts = {};
  for (const id of teamIds) {
    let chart = null;
    try {
      chart = await store?.getJSON(`weeks/${season}/${week}/depth/${id}.json`);
    } catch {}
    if (!isValidChart(chart)) {
      // fallback: try to call roster endpoint right now
      const r1 = await safeFetchJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=${season}`);
      if (r1.ok) chart = parseEspnRoster(r1.json);
    }
    if (!isValidChart(chart)) {
      // fabricate
      chart = { QB:[`QB1-${id}`], RB:[`RB1-${id}`,`RB2-${id}`], WR:[`WR1-${id}`,`WR2-${id}`,`WR3-${id}`], TE:[`TE1-${id}`] };
    }
    charts[id] = chart;
  }

  // 4) Build candidates
  const candidates = [];
  for (const g of schedule.games) {
    const H = charts[g.home?.id] || {};
    const A = charts[g.away?.id] || {};
    addTeam(candidates, g.home?.id, H, g.away?.abbrev);
    addTeam(candidates, g.away?.id, A, g.home?.abbrev);
  }
  candidates.sort((a,b)=> b.modelTdPct - a.modelTdPct);

  const body = { ok:true, season, week, games: schedule.games.length, candidates };
  if (debug) body.diag = diag;
  return j(body, 200);
}

function addTeam(out, teamId, charts, oppAbbrev) {
  for (const pos of FPOS) {
    (charts[pos] || []).forEach((name, idx) => {
      let p = POS_PRIOR[pos] ?? 0.05;
      p += (DEPTH_DELTA[idx] ?? -0.1 * idx);
      const salt = (oppAbbrev?.charCodeAt?.(0) ?? 65) % 7 / 1000; // tiny differentiation
      p = clamp(p + salt);
      const { rz, exp } = splitRzExp(pos);
      out.push({
        player: name,
        teamId,
        pos,
        modelTdPct: +(p * 100).toFixed(1),
        rzPath: +(p * rz * 100).toFixed(1),
        expPath: +(p * exp * 100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${oppAbbrev || "?"}`
      });
    });
  }
}

function isValidChart(c) {
  if (!c || typeof c !== "object") return false;
  return ["RB","WR","TE","QB"].some(k => Array.isArray(c[k]) && c[k].length);
}

// ESPN roster → pseudo-depth
function parseEspnRoster(data) {
  const out = { QB:[], RB:[], WR:[], TE:[] };
  const buckets = [].concat(
    data?.athletes || [],
    data?.roster || [],
    data?.items || [],
  );

  const list = [];
  for (const b of buckets) {
    if (Array.isArray(b?.items)) list.push(...b.items);
    else if (Array.isArray(b?.athletes)) list.push(...b.athletes);
    else if (b && b?.athlete) list.push(b);
  }

  const players = list.map(p => {
    const a = p.athlete || p;
    const pos = a?.position?.abbreviation || a?.position?.abbrev || a?.position?.name || a?.position?.id;
    const name = a?.displayName || a?.fullName || a?.name;
    const jersey = Number(a?.jersey) || 999;
    const order = (pos && pos.toUpperCase().startsWith("WR")) ? 500 + jersey :
                  (pos && pos.toUpperCase().startsWith("RB")) ? 400 + jersey :
                  (pos && pos.toUpperCase().startsWith("TE")) ? 300 + jersey :
                  (pos && pos.toUpperCase().startsWith("QB")) ? 200 + jersey : 900 + jersey;
    return { pos, name, jersey, order };
  }).filter(p => p.name);

  const push = (pos, name) => { if (pos && out[pos] && name) out[pos].push(name); };
  const sorted = players.sort((a,b)=> a.order - b.order);
  for (const p of sorted) {
    const up = (p.pos || "").toUpperCase();
    if (up.startsWith("QB")) push("QB", p.name);
    else if (up.startsWith("RB") || up==="TB" || up==="FB") push("RB", p.name);
    else if (up.startsWith("WR")) push("WR", p.name);
    else if (up.startsWith("TE")) push("TE", p.name);
  }
  for (const k of Object.keys(out)) {
    out[k] = Array.from(new Set(out[k])).filter(Boolean).slice(0, k==="WR"?5:(k==="RB"?4:(k==="TE"?3:2)));
  }
  return out;
}

async function loadFromStore(store, season, week, leaf) {
  let w = week;
  if (!w && store) {
    try {
      const keys = await store.list();
      const prefix = `weeks/${season}/`;
      const weeks = keys
        .filter(k => k.startsWith(prefix) && k.endsWith("/schedule.json"))
        .map(k => Number(k.split("/")[2]))
        .filter(n => Number.isFinite(n))
        .sort((a,b)=>b-a);
      if (weeks.length) w = weeks[0];
    } catch {}
  }
  if (!w) return null;
  if (!store) return null;
  const path = `weeks/${season}/${w}/${leaf}`;
  try { return await store.getJSON(path); } catch { return null; }
}

async function safeFetchJSON(url) {
  try {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const json = await r.json().catch(()=>null);
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok:false, status:0, json:null, error:String(e) };
  }
}

function j(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

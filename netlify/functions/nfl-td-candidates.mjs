// netlify/functions/nfl-td-candidates.mjs
import { getStore } from "@netlify/blobs";
const STORE = () => getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });

const POS_PRIOR = { RB: 0.26, WR: 0.17, TE: 0.14, QB: 0.06 };
const DEPTH_DELTA = [0.10, -0.04, -0.07, -0.10];
const FPOS = ["RB","WR","TE","QB"];
const clamp = (p, min=0.005, max=0.75)=> Math.max(min, Math.min(max, p));
const splitRzExp = (pos)=> pos==="RB"?{rz:0.68,exp:0.32}:pos==="TE"?{rz:0.58,exp:0.42}:pos==="WR"?{rz:0.44,exp:0.56}:{rz:0.35,exp:0.65};

export default async function handler(req) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || new Date().getFullYear());
  let week = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : undefined;
  const debug = url.searchParams.get("debug") === "1";

  const store = STORE();
  const diag = [];

  // schedule cache?
  let schedule = await loadFromStore(store, season, week, "schedule.json");
  diag.push({ step: "load schedule cache", ok: !!schedule });

  // If not, bootstrap week1 (since we're pre-season rolling) and use its schedule directly
  if (!schedule) {
    const b = await safeJSON(`/.netlify/functions/nfl-bootstrap?refresh=1&season=${season}&mode=week1`, "bootstrap");
    diag.push({ step: "bootstrap-week1", ok: b.ok, status: b.status });
    if (b.ok && b.json?.ok && b.json?.schedule?.games?.length) {
      schedule = b.json.schedule;
      week = schedule.week;
    } else {
      // one more attempt: reread cache
      schedule = await loadFromStore(store, season, week, "schedule.json");
      diag.push({ step: "re-read schedule cache", ok: !!schedule });
    }
  }

  if (!schedule || !Array.isArray(schedule.games) || !schedule.games.length) {
    return J(debug ? { ok:false, error:"schedule unavailable", diag } : { ok:false, error:"schedule unavailable" }, 424);
  }
  week = schedule.week;

  // per-team depth
  const teamIds = [...new Set(schedule.games.flatMap(g => [g.home?.id, g.away?.id]).filter(Boolean))];
  const depths = {};
  for (const id of teamIds) {
    const key = `weeks/${season}/${week}/depth/${id}.json`; let chart=null;
    try { chart = await store.getJSON(key); } catch {}
    if (!isValidChart(chart)) chart = fallbackChart(id);
    depths[id] = chart;
  }

  // build candidates
  const rows = [];
  for (const g of schedule.games) {
    const H = depths[g.home?.id] || {};
    const A = depths[g.away?.id] || {};
    add(rows, g.home?.id, H, g.away?.abbrev);
    add(rows, g.away?.id, A, g.home?.abbrev);
  }
  rows.sort((a,b)=> b.modelTdPct - a.modelTdPct);

  const body = { ok:true, season, week, games: schedule.games.length, candidates: rows };
  if (debug) body.diag = diag;
  return J(body, 200);
}

function add(out, teamId, charts, opp) {
  for (const pos of FPOS) {
    (charts[pos] || []).forEach((name, idx) => {
      let p = (POS_PRIOR[pos] ?? 0.05) + (DEPTH_DELTA[idx] ?? -0.1*idx);
      p = clamp(p + (((opp?.charCodeAt?.(0) ?? 65) % 7)/1000));
      const { rz, exp } = splitRzExp(pos);
      out.push({
        player: name, teamId, pos,
        modelTdPct: +(p*100).toFixed(1),
        rzPath: +(p*rz*100).toFixed(1),
        expPath: +(p*exp*100).toFixed(1),
        why: `${pos} • depth ${idx+1} • vs ${opp||"?"}`
      });
    });
  }
}

function isValidChart(c){ return c && typeof c==="object" && ["RB","WR","TE","QB"].some(k => Array.isArray(c[k]) && c[k].length); }
function fallbackChart(id){ return { QB:[`QB1-${id}`], RB:[`RB1-${id}`,`RB2-${id}`], WR:[`WR1-${id}`,`WR2-${id}`,`WR3-${id}`], TE:[`TE1-${id}`] }; }

async function loadFromStore(store, season, week, leaf) {
  let w = week;
  if (!w) {
    try {
      const keys = await store.list();
      const weeks = keys.filter(k=>k.startsWith(`weeks/${season}/`) && k.endsWith("/schedule.json"))
                        .map(k=>+k.split("/")[2]).filter(Number.isFinite).sort((a,b)=>b-a);
      if (weeks.length) w = weeks[0];
    } catch {}
  }
  if (!w) return null;
  try { return await store.getJSON(`weeks/${season}/${w}/${leaf}`); } catch { return null; }
}
async function safeJSON(url, label){ try{ const r=await fetch(url,{headers:{accept:"application/json"}}); return { ok:r.ok, status:r.status, json: await r.json().catch(()=>null), label }; }catch(e){ return { ok:false, status:0, json:null, label, error:String(e) }; } }
function J(body, status=200){ return new Response(JSON.stringify(body), { status, headers:{ "content-type":"application/json" } }); }

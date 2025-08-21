// netlify/functions/_shared/rosters-shared.cjs
// Shared roster updater utilities: ESPN provider, Blobs-safe store, overrides, debug logs.
const path = require("path");
const fs = require("fs");

// ---- logging ----
function log(debug, ...args){ if (debug) console.log("[rosters]", ...args); }

// ---- blobs safe access ----
function getStoreSafe(STORE, debug=false){
  try {
    const { getStore } = require("@netlify/blobs");
    try {
      const store = getStore(STORE);
      log(debug, "Blobs: managed store", STORE);
      return store;
    } catch (e) {
      const siteID = process.env.NETLIFY_SITE_ID;
      const token  = process.env.NETLIFY_AUTH_TOKEN;
      if (siteID && token){
        const store = getStore({ name: STORE, siteID, token });
        log(debug, "Blobs: manual creds", {STORE, siteID: siteID.slice(0,6)+"..."});
        return store;
      }
      throw e;
    }
  } catch (e) {
    log(debug, "Blobs unavailable, using noop memory store:", String(e));
    const mem = new Map();
    return {
      async get(k){ return mem.has(k) ? new Response(mem.get(k)) : null; },
      async set(k,v){ mem.set(k, typeof v === "string" ? v : JSON.stringify(v)); },
    };
  }
}

// ---- helpers ----
function normTeam(code){
  if (!code) return null;
  const m = {WAS:"WSH",WSH:"WSH",OAK:"LV",LV:"LV",STL:"LAR",LA:"LAR",LAR:"LAR",SD:"LAC",LAC:"LAC"};
  return m[code] || code;
}
function makeEmptyChart(){ return {QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null}; }
function readRepoJson(rel){
  try {
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,"utf-8"));
  } catch {}
  return null;
}
function applyOverrides(charts, overrides, debug=false){
  if (!overrides) return charts;
  for (const [team, roles] of Object.entries(overrides)){
    charts[team] = charts[team] || makeEmptyChart();
    for (const [role, name] of Object.entries(roles)){ charts[team][role] = name; }
  }
  log(debug, "Applied overrides to teams:", Object.keys(overrides||{}));
  return charts;
}

// ---- fetch utils ----
async function fetchJson(url, debug=false, headers={}){
  // use native fetch (Node 18+ as set in netlify.toml)
  const res = await fetch(url, {
    headers: {
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept":"application/json, text/plain, */*",
      "Origin":"https://www.espn.com",
      "Referer":"https://www.espn.com/",
      ...headers
    }
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return await res.json();
}

// ---- providers ----
async function fetchESPN(debug=false){
  try {
    const idx = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", debug);
    const items = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items){
      const team = t.team || {};
      const id = team.id;
      const abbr = normTeam(team.abbreviation);
      if (!id || !abbr) continue;
      try {
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`;
        const j = await fetchJson(url, debug);
        const chart = makeEmptyChart();
        const groups = Array.isArray(j?.items) ? j.items : [];
        const slots = {};
        for (const g of groups){
          const pos = String(g?.position?.abbreviation || "").toUpperCase();
          if (!pos) continue;
          const entries = Array.isArray(g?.items) ? g.items : [];
          const names = [];
          for (const e of entries){
            const a = e?.athlete || e?.player || {};
            const nm = a.fullName || a.displayName || a.name;
            if (nm) names.push(nm);
          }
          if (names.length) slots[pos] = names;
        }
        const qbs = slots.QB || [];
        const rbs = slots.RB || [];
        const wrs = slots.WR || [];
        const tes = slots.TE || [];
        chart.QB1 = qbs[0] || null;
        chart.RB1 = rbs[0] || null; chart.RB2 = rbs[1] || null;
        chart.WR1 = wrs[0] || null; chart.WR2 = wrs[1] || null; chart.WR3 = wrs[2] || null;
        chart.TE1 = tes[0] || null; chart.TE2 = tes[1] || null;
        charts[abbr] = chart;
      } catch (e) {
        log(debug, `ESPN depth failed for ${abbr} (${id}):`, String(e));
      }
    }
    return Object.keys(charts).length ? charts : null;
  } catch (e) {
    return null;
  }
}

// Optional provider hooks (placeholders for future MSF / nflverse)
async function fetchMySportsFeeds(debug=false){
  // Only attempt if keys provided
  const key = process.env.MSF_API_KEY, secret = process.env.MSF_API_SECRET;
  if (!key || !secret) return null;
  // TODO: implement when access granted
  return null;
}
async function fetchFallbackUrl(debug=false){
  const url = process.env.NFL_ROSTERS_FALLBACK_URL;
  if (!url) return null;
  try { return await fetchJson(url, debug); } catch { return null; }
}

async function getDepthCharts(PROVIDER="auto", debug=false){
  if (PROVIDER === "espn"){
    const espn = await fetchESPN(debug); if (espn) return espn;
  } else if (PROVIDER === "auto"){
    const espn = await fetchESPN(debug); if (espn) return espn;
    const msf  = await fetchMySportsFeeds(debug); if (msf) return msf;
    const fb   = await fetchFallbackUrl(debug);   if (fb) return fb;
  } else {
    // future: fantasypros etc.
    const espn = await fetchESPN(debug); if (espn) return espn;
  }
  // Final fallback to repo
  return readRepoJson("depth-charts.json");
}

// ---- main updater ----
async function runUpdate({ STORE="nfl-td", PROVIDER="auto", debug=false }={}){
  const store = getStoreSafe(STORE, debug);
  const charts = await getDepthCharts(PROVIDER, debug);
  if (!charts) return { ok:false, error:"no provider data" };
  const overrides = readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts, null, 2), { contentType:"application/json" });
  await store.set("meta-rosters.json", JSON.stringify({ updated_at: new Date().toISOString(), provider: PROVIDER }, null, 2), { contentType:"application/json" });
  return { ok:true, provider: PROVIDER, teams: Object.keys(finalCharts).length };
}

module.exports = { runUpdate };

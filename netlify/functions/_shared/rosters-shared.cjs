// netlify/functions/_shared/rosters-shared.cjs
const fs = require("fs");
const path = require("path");

function log(debug, ...args){ if (debug) console.log("[rosters]", ...args); }

function getStoreSafe(STORE, debug=false){
  try {
    const { getStore } = require("@netlify/blobs");
    try {
      const s = getStore(STORE);
      log(debug, "Blobs: managed store", STORE);
      return s;
    } catch (e) {
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if (siteID && token){
        const s = getStore({ name: STORE, siteID, token });
        log(debug, "Blobs: manual creds", { STORE, siteID: siteID.slice(0,6)+"..." });
        return s;
      }
      throw e;
    }
  } catch (e) {
    log(debug, "Blobs unavailable, using noop store:", String(e));
    const mem = new Map();
    return {
      async get(k){ return mem.has(k) ? new Response(mem.get(k)) : null; },
      async set(k,v){ mem.set(k, typeof v==="string" ? v : JSON.stringify(v)); }
    };
  }
}

function readRepoJson(rel){
  try{
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,"utf-8"));
  }catch{}
  return null;
}

function normTeam(code){
  if (!code) return null;
  const m={WAS:"WSH",WSH:"WSH",OAK:"LV",LV:"LV",STL:"LAR",LA:"LAR",LAR:"LAR",SD:"LAC",LAC:"LAC"};
  return m[code] || code;
}

function makeEmptyChart(){ return { QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null }; }
function applyOverrides(depthCharts, overrides, debug=false){
  if (!overrides) return depthCharts;
  for (const [team, roles] of Object.entries(overrides)){
    depthCharts[team] = depthCharts[team] || makeEmptyChart();
    for (const [role, name] of Object.entries(roles)){
      depthCharts[team][role] = name;
    }
  }
  log(debug, "Applied overrides:", Object.keys(overrides||{}));
  return depthCharts;
}

// ---- ESPN JSON ----
async function fetchJson(url, debug=false, headers={}){
  const res = await fetch(url, { headers: { 
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
    "Accept":"application/json, text/plain, */*",
    "Origin":"https://www.espn.com",
    "Referer":"https://www.espn.com/",
    ...headers } });
  if (!res.ok) throw new Error("http "+res.status);
  return await res.json();
}

async function espnJson(debug=false){
  try{
    const idx = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", debug);
    const items = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items){
      const team = t.team || {};
      const id = team.id;
      const abbr = normTeam(team.abbreviation);
      if (!id || !abbr) continue;
      try{
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`;
        const j = await fetchJson(url, debug);
        const groups = Array.isArray(j?.items) ? j.items : [];
        const slots = {};
        for (const g of groups){
          const pos = String(g?.position?.abbreviation || "").toUpperCase();
          const names = (Array.isArray(g?.items) ? g.items : []).map(e => {
            const a = e?.athlete || e?.player || e;
            return a?.fullName || a?.displayName || a?.name || null;
          }).filter(Boolean);
          if (pos) slots[pos] = names;
        }
        const chart = makeEmptyChart();
        const qb = slots.QB || []; const rb = slots.RB || []; const wr = slots.WR || []; const te = slots.TE || [];
        chart.QB1 = qb[0]||null;
        chart.RB1 = rb[0]||null; chart.RB2 = rb[1]||null;
        chart.WR1 = wr[0]||null; chart.WR2 = wr[1]||null; chart.WR3 = wr[2]||null;
        chart.TE1 = te[0]||null; chart.TE2 = te[1]||null;
        charts[abbr] = chart;
      }catch(err){
        log(debug, "ESPN json failed for", abbr, ":", String(err));
      }
    }
    return Object.keys(charts).length ? charts : null;
  }catch(e){
    log(debug, "ESPN index failed:", String(e));
    return null;
  }
}

// ---- ESPN HTML fallback (very light scraper) ----
async function espnHtml(debug=false){
  // Map team abbr to URL piece used by ESPN pages
  const teams = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
    "HOU","IND","JAX","KC","LVR","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ",
    "PHI","PIT","SEA","SF","TB","TEN","WSH"
  ];
  const charts = {};
  for (const abbr of teams){
    const slug = (abbr==="LVR") ? "lv" : abbr.toLowerCase(); // vegas page uses lv
    const url = `https://www.espn.com/nfl/team/depth/_/name/${slug}`;
    try{
      const res = await fetch(url, { headers: { 
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml",
        "Referer":"https://www.espn.com/"
      }});
      if (!res.ok) throw new Error("http "+res.status);
      const html = await res.text();
      // very rough extraction: look for QB/RB/WR/TE blocks; capture first three names per group
      function extract(pos){
        const re = new RegExp(pos+"[\s\S]{0,1000}?<tbody[\s\S]*?</tbody>", "i");
        const m = html.match(re);
        if (!m) return [];
        const tbody = m[0];
        const nameRe = /data-player-uid[^>]*>([^<]+)<\/a>/g;
        const out = []; let mm;
        while ((mm = nameRe.exec(tbody)) && out.length<3){ out.push(mm[1].trim()); }
        return out;
      }
      const qb = extract("QB"), rb = extract("RB"), wr = extract("WR"), te = extract("TE");
      const chart = makeEmptyChart();
      chart.QB1 = qb[0]||null;
      chart.RB1 = rb[0]||null; chart.RB2 = rb[1]||null;
      chart.WR1 = wr[0]||null; chart.WR2 = wr[1]||null; chart.WR3 = wr[2]||null;
      chart.TE1 = te[0]||null; chart.TE2 = te[1]||null;
      charts[abbr==="LVR"?"LV":abbr] = chart;
      log(debug, "ESPN html parsed team", abbr);
    }catch(e){
      log(debug, "ESPN html failed for", abbr, ":", String(e));
    }
  }
  return Object.keys(charts).length ? charts : null;
}

async function getDepthCharts(PROVIDER="auto", debug=false){
  if (PROVIDER==="espn" || PROVIDER==="auto"){
    const json = await espnJson(debug);
    if (json) return { charts: json, provider: "espn_json" };
    const html = await espnHtml(debug);
    if (html) return { charts: html, provider: "espn_html" };
  }
  // TODO: add MSF when creds live
  const local = readRepoJson("depth-charts.json");
  if (local) return { charts: local, provider: "local" };
  return { charts: null, provider: "none" };
}

async function runUpdate({ STORE="nfl-td", PROVIDER="auto", debug=false }={}){
  const store = getStoreSafe(STORE, debug);
  const { charts, provider } = await getDepthCharts(PROVIDER, debug);
  if (!charts) return { ok:false, error:"no provider data" };
  const overrides = readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts, null, 2), { contentType: "application/json" });
  await store.set("meta-rosters.json", JSON.stringify({ updated_at: new Date().toISOString(), provider }, null, 2), { contentType: "application/json" });
  return { ok:true, provider, teams: Object.keys(finalCharts).length };
}

module.exports = { runUpdate };

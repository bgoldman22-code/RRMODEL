// netlify/functions/_shared/rosters-shared.cjs
const path = require("path");
const fs = require("fs");

function log(debug, ...args){ if (debug) console.log("[rosters]", ...args); }

function getStoreSafe(STORE, debug=false){
  try {
    const { getStore } = require("@netlify/blobs");
    try {
      const store = getStore(STORE);
      log(debug, "Blobs store (managed):", STORE);
      return store;
    } catch (e) {
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if (siteID && token){
        const store = getStore({ name: STORE, siteID, token });
        log(debug, "Blobs store (manual creds):", STORE, siteID.slice(0,6)+"...");
        return store;
      }
      throw e;
    }
  } catch (e) {
    log(debug, "Blobs unavailable, using noop store:", String(e));
    const mem = new Map();
    return {
      async get(key){ return mem.has(key) ? new Response(mem.get(key)) : null; },
      async set(key, value){ mem.set(key, typeof value === "string" ? value : JSON.stringify(value)); }
    };
  }
}

function normTeam(code){
  if (!code) return null;
  const m = {"WAS":"WSH","WSH":"WSH","OAK":"LV","LV":"LV","STL":"LAR","LA":"LAR","LAR":"LAR","SD":"LAC","LAC":"LAC"};
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
  log(debug, "Applied overrides for teams:", Object.keys(overrides||{}));
  return depthCharts;
}
function readRepoJson(rel){
  try{
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  }catch{}
  return null;
}

async function fetchJson(url, headers={}){
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("http "+res.status);
  return await res.json();
}
async function fetchText(url, headers={}){
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("http "+res.status);
  return await res.text();
}

// ESPN JSON depth chart
async function fetchESPNJson(debug=false){
  try{
    const index = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", {
      "User-Agent":"Mozilla/5.0",
      "Accept":"application/json"
    });
    const items = index?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items){
      const team = t.team || {};
      const id = team.id;
      const abbr = normTeam(team.abbreviation);
      if (!id || !abbr) continue;
      try{
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`;
        const j = await fetchJson(url, {
          "User-Agent":"Mozilla/5.0 (Netlify)",
          "Accept":"application/json, text/plain, */*",
          "Origin":"https://www.espn.com",
          "Referer":"https://www.espn.com/"
        });
        const groups = Array.isArray(j?.items) ? j.items : [];
        const slots = {};
        for (const g of groups){
          const pos = String(g?.position?.abbreviation || "").toUpperCase();
          const entries = Array.isArray(g?.items) ? g.items : [];
          const names = [];
          for (const e of entries){
            const a = e?.athlete || e?.player || {};
            const name = a.fullName || a.displayName || a.name;
            if (name) names.push(name);
          }
          if (pos) slots[pos] = names;
        }
        const chart = makeEmptyChart();
        chart.QB1 = (slots.QB||[])[0]||null;
        chart.RB1 = (slots.RB||[])[0]||null; chart.RB2 = (slots.RB||[])[1]||null;
        const wr = slots.WR||[];
        chart.WR1 = wr[0]||null; chart.WR2 = wr[1]||null; chart.WR3 = wr[2]||null;
        const te = slots.TE||[];
        chart.TE1 = te[0]||null; chart.TE2 = te[1]||null;
        charts[abbr] = chart;
      }catch(err){
        log(debug, `ESPN json failed for ${abbr} (${id}):`, String(err));
      }
    }
    return Object.keys(charts).length ? charts : null;
  }catch(e){
    return null;
  }
}

// ESPN HTML fallback scrape
async function fetchESPNHtml(debug=false){
  try{
    // Use ESPN team index to get team pages
    const idx = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", {
      "User-Agent":"Mozilla/5.0",
      "Accept":"application/json"
    });
    const items = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items){
      const team = t.team || {};
      const abbr = normTeam(team.abbreviation);
      const slug = team.slug || team.abbreviation?.toLowerCase();
      if (!abbr || !slug) continue;
      try{
        // Public depth chart page
        const url = `https://www.espn.com/nfl/team/depth/_/name/${slug}`;
        const html = await fetchText(url, {
          "User-Agent":"Mozilla/5.0 (Netlify)",
          "Accept":"text/html,application/xhtml+xml",
          "Referer":"https://www.espn.com/"
        });
        // Very light parsing: search for offense starters blocks
        function grab(re){ const m = html.match(re); return m ? m[1] : null; }
        // crude extractors per position lists
        const getList = (pos)=>{
          const secRe = new RegExp(`${pos}[^<]*</[^>]+>([\s\S]*?)</table>`, "i");
          const sec = html.match(secRe)?.[1] || "";
          const nameRe = /data-idx="\d+"[^>]*>([^<]+)<\/a>/gi;
          const names = [];
          let mm;
          while ((mm = nameRe.exec(sec)) && names.length < 3) {
            names.push(mm[1].trim());
          }
          return names;
        };
        const wrs = getList("Wide Receiver") || [];
        const rbs = getList("Running Back") || [];
        const qbs = getList("Quarterback") || [];
        const tes = getList("Tight End") || [];
        const chart = makeEmptyChart();
        chart.QB1 = qbs[0]||null;
        chart.RB1 = rbs[0]||null; chart.RB2 = rbs[1]||null;
        chart.WR1 = wrs[0]||null; chart.WR2 = wrs[1]||null; chart.WR3 = wrs[2]||null;
        chart.TE1 = tes[0]||null; chart.TE2 = tes[1]||null;
        charts[abbr] = chart;
        log(debug, "ESPN html parsed team", abbr);
      }catch(err){
        log(debug, `ESPN html failed for ${abbr}:`, String(err));
      }
    }
    return Object.keys(charts).length ? charts : null;
  }catch(e){
    return null;
  }
}

async function getDepthCharts(PROVIDER="auto", debug=false){
  if (PROVIDER === "espn" || PROVIDER === "auto"){
    const j = await fetchESPNJson(debug);
    if (j) return j;
    const h = await fetchESPNHtml(debug);
    if (h) return h;
  }
  // More providers can be added here later (MSF, etc)
  const local = readRepoJson("depth-charts.json");
  return local;
}

async function runUpdate({ STORE="nfl-td", PROVIDER="auto", debug=false }={}){
  const store = getStoreSafe(STORE, debug);
  const charts = await getDepthCharts(PROVIDER, debug);
  if (!charts) return { ok:false, error:"no provider data" };
  const overrides = readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts, null, 2), { contentType: "application/json" });
  await store.set("meta-rosters.json", JSON.stringify({ updated_at: new Date().toISOString(), provider: "espn_"+(charts.__source||"auto") }, null, 2), { contentType: "application/json" });
  return { ok:true, provider:"espn", teams:Object.keys(finalCharts).length };
}

module.exports = { runUpdate };

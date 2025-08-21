// netlify/functions/_shared/rosters-shared.cjs
// Real ESPN provider + Blobs-safe store + debug logs
const fs = require("fs");
const path = require("path");

function log(d, ...args){ if (d) console.log("[rosters]", ...args); }

function getStoreSafe(STORE, d=false){
  try{
    const { getStore } = require("@netlify/blobs");
    try{
      const s = getStore(STORE);
      log(d,"blobs managed", STORE);
      return s;
    }catch(e){
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if(siteID && token){
        const s = getStore({ name: STORE, siteID, token });
        log(d,"blobs manual", {STORE, siteID: siteID.slice(0,6)+"..."});
        return s;
      }
      throw e;
    }
  }catch(e){
    log(d,"no blobs, noop store", String(e));
    const mem = new Map();
    return {
      async get(k){ return mem.has(k) ? new Response(mem.get(k)) : null; },
      async set(k,v){ mem.set(k, typeof v==="string"? v : JSON.stringify(v)); }
    };
  }
}

async function fjson(url, d=false){
  const res = await fetch(url, {
    headers:{
      "User-Agent":"Mozilla/5.0 (Netlify Functions; like Chrome)",
      "Accept":"application/json, text/plain, */*",
      "Origin":"https://www.espn.com",
      "Referer":"https://www.espn.com/"
    }
  });
  if(!res.ok) throw new Error("http "+res.status);
  return await res.json();
}

function normTeam(x){
  const m = {"WAS":"WSH","WSH":"WSH","OAK":"LV","LV":"LV","STL":"LAR","LA":"LAR","LAR":"LAR","SD":"LAC","LAC":"LAC"};
  return m[x]||x;
}
function emptyChart(){ return {QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null}; }
function fromRepo(rel){
  try{ const p = path.join(process.cwd(),"data","nfl-td",rel); if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,"utf-8")); }catch{}
  return null;
}
function applyOverrides(charts, overrides, d=false){
  if(!overrides) return charts;
  for(const [team, roles] of Object.entries(overrides)){
    charts[team] = charts[team] || emptyChart();
    for(const [role,name] of Object.entries(roles)){
      charts[team][role]=name;
    }
  }
  log(d,"overrides applied", Object.keys(overrides||{}));
  return charts;
}

async function fetchESPN(d=false){
  try{
    const idx = await fjson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", d);
    const items = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for(const t of items){
      const team = t.team || {};
      const id = team.id;
      const abbr = normTeam(team.abbreviation);
      if(!id || !abbr) continue;
      try{
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`;
        const j = await fjson(url, d);
        const groups = Array.isArray(j?.items) ? j.items : [];
        const slots = {};
        for(const g of groups){
          const pos = String(g?.position?.abbreviation||"").toUpperCase();
          const entries = Array.isArray(g?.items)? g.items: [];
          const names = [];
          for(const e of entries){
            const a = e?.athlete || e?.player || {};
            const name = a.fullName || a.displayName || a.name;
            if(name) names.push(name);
          }
          if(pos) slots[pos]=names;
        }
        const c = emptyChart();
        const qb=slots.QB||[], rb=slots.RB||[], wr=slots.WR||[], te=slots.TE||[];
        c.QB1=qb[0]||null;
        c.RB1=rb[0]||null; c.RB2=rb[1]||null;
        c.WR1=wr[0]||null; c.WR2=wr[1]||null; c.WR3=wr[2]||null;
        c.TE1=te[0]||null; c.TE2=te[1]||null;
        charts[abbr]=c;
      }catch(e){
        log(d, "team fail", abbr, String(e));
      }
    }
    return Object.keys(charts).length? charts: null;
  }catch(e){
    return null;
  }
}

async function fetchMSF(d=false){
  const key = process.env.MSF_API_KEY;
  const secret = process.env.MSF_API_SECRET;
  if(!key || !secret) return null;
  try{
    // placeholder; only used when credentials exist
    return null;
  }catch(e){ return null; }
}

async function fetchFallbackUrl(d=false){
  const url = process.env.NFL_ROSTERS_FALLBACK_URL;
  if(!url) return null;
  try{ const j = await fjson(url,d); return j && typeof j==="object"? j: null; }catch(e){ return null; }
}

async function getDepthCharts(PROVIDER="auto", d=false){
  if(PROVIDER==="espn"){
    const e = await fetchESPN(d); if(e) return e;
    const m = await fetchMSF(d); if(m) return m;
    const f = await fetchFallbackUrl(d); if(f) return f;
  }else if(PROVIDER==="msf"){
    const m = await fetchMSF(d); if(m) return m;
    const e = await fetchESPN(d); if(e) return e;
    const f = await fetchFallbackUrl(d); if(f) return f;
  }else{ // auto
    const e = await fetchESPN(d); if(e) return e;
    const m = await fetchMSF(d); if(m) return m;
    const f = await fetchFallbackUrl(d); if(f) return f;
  }
  return fromRepo("depth-charts.json");
}

async function runUpdate({STORE="nfl-td", PROVIDER="espn", debug=false}={}){
  const store = getStoreSafe(STORE, debug);
  const charts = await getDepthCharts(PROVIDER, debug);
  if(!charts) return { ok:false, error:"no provider data" };
  const overrides = fromRepo("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts,null,2), {contentType:"application/json"});
  await store.set("meta-rosters.json", JSON.stringify({updated_at:new Date().toISOString(), provider:PROVIDER},null,2), {contentType:"application/json"});
  return { ok:true, provider:PROVIDER, teams:Object.keys(finalCharts).length };
}

module.exports = { runUpdate };

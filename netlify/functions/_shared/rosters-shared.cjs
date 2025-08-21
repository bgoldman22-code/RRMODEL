// netlify/functions/_shared/rosters-shared.cjs
// Shared helpers for roster updater functions with SAFE Netlify Blobs access.
// This file guards against MissingBlobsEnvironmentError by providing a manual
// credentials path via env and, if still unavailable, a graceful no-op store.

const { getStore } = require("@netlify/blobs");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require("path");
const fs = require("fs");

const STORE_NAME = process.env.NFL_TD_BLOBS || "nfl-td";

function getSiteAndTokenFromEnv() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID_PROD;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (siteID && token) return { siteID, token };
  return null;
}

// Return a store-like object with .get/.set even if blobs aren't configured.
function getStoreSafe() {
  try {
    // Preferred: managed environment (no options)
    return getStore(STORE_NAME);
  } catch (e) {
    // Try manual credentials
    const creds = getSiteAndTokenFromEnv();
    if (creds) {
      return getStore({ name: STORE_NAME, ...creds });
    }
    // Final fallback: in-memory no-op store so the function doesn't crash
    const mem = new Map();
    return {
      async get(key) {
        const val = mem.get(key);
        if (!val) return null;
        return new Response(val, { headers: { "content-type":"application/json" } });
      },
      async set(key, value, _opts) {
        mem.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    };
  }
}

// Utils
async function readRepoJson(rel) {
  try {
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return null;
}
async function writeBlobJson(store, key, obj) {
  await store.set(key, JSON.stringify(obj, null, 2), { contentType: "application/json" });
}

// Provider chain (same as before, condensed)
const TEAM_ALIASES = { "WSH":"WSH","WAS":"WSH","LV":"LV","OAK":"LV","LAR":"LAR","LA":"LAR","STL":"LAR","LAC":"LAC","SD":"LAC" };
const normTeam = (c) => TEAM_ALIASES[c] || c;
const makeEmptyChart = () => ({ QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null });

function applyOverrides(depthCharts, overrides) {
  if (!overrides) return depthCharts;
  for (const [team, roles] of Object.entries(overrides)) {
    depthCharts[team] = depthCharts[team] || makeEmptyChart();
    for (const [role, name] of Object.entries(roles)) {
      depthCharts[team][role] = name;
    }
  }
  return depthCharts;
}

async function fetchESPN() {
  try {
    const teamsRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams");
    if (!teamsRes.ok) throw new Error("espn teams http");
    const teamsJson = await teamsRes.json();
    const items = teamsJson?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items) {
      const team = t.team || {};
      const abbr = normTeam(team.abbreviation);
      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}?enable=roster,depthchart`;
      try {
        const r = await fetch(rosterUrl);
        if (!r.ok) continue;
        const j = await r.json();
        const byPos = {};
        for (const group of (j?.athletes || [])) {
          const pos = group?.position?.abbreviation || group?.position?.displayName;
          const ath = group?.items || [];
          byPos[pos] = ath.map(a => a?.fullName || a?.displayName).filter(Boolean);
        }
        const chart = makeEmptyChart();
        const qbs = byPos["QB"] || byPos["Quarterback"] || [];
        const rbs = byPos["RB"] || byPos["Running Back"] || [];
        const wrs = byPos["WR"] || byPos["Wide Receiver"] || [];
        const tes = byPos["TE"] || byPos["Tight End"] || [];
        chart.QB1 = qbs[0] || null;
        chart.RB1 = rbs[0] || null; chart.RB2 = rbs[1] || null;
        chart.WR1 = wrs[0] || null; chart.WR2 = wrs[1] || null; chart.WR3 = wrs[2] || null;
        chart.TE1 = tes[0] || null; chart.TE2 = tes[1] || null;
        charts[abbr] = chart;
      } catch {}
    }
    return Object.keys(charts).length ? charts : null;
  } catch {
    return null;
  }
}

async function fetchFantasyPros() {
  const url = process.env.NFL_ROSTERS_FP_URL;
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { "accept":"application/json" } });
    if (!r.ok) throw new Error("fp http");
    const j = await r.json();
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function getDepthCharts(providerPref="auto") {
  if (providerPref === "fantasypros") {
    const fp = await fetchFantasyPros(); if (fp) return fp;
    const espn = await fetchESPN(); if (espn) return espn;
  } else if (providerPref === "espn") {
    const espn = await fetchESPN(); if (espn) return espn;
    const fp = await fetchFantasyPros(); if (fp) return fp;
  } else {
    const espn = await fetchESPN(); if (espn) return espn;
    const fp = await fetchFantasyPros(); if (fp) return fp;
  }
  return await readRepoJson("depth-charts.json");
}

// Exported runner used by all scheduled/manual functions
async function runUpdate() {
  const store = getStoreSafe();
  const providerPref = process.env.NFL_ROSTERS_SOURCE || "auto";
  const charts = await getDepthCharts(providerPref);
  if (!charts) {
    // Still write a meta heartbeat so you can see the function ran
    await writeBlobJson(store, "meta-rosters.json", { ok:false, reason:"no provider data", at:new Date().toISOString() });
    return { ok:false, error:"no provider data" };
  }
  const overrides = await readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides);
  await writeBlobJson(store, "depth-charts.json", finalCharts);
  await writeBlobJson(store, "meta-rosters.json", { ok:true, provider: providerPref, at:new Date().toISOString(), teams:Object.keys(finalCharts).length });
  return { ok:true, teams: Object.keys(finalCharts).length };
}

module.exports = { runUpdate };

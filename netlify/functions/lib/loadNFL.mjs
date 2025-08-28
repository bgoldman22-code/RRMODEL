// netlify/functions/lib/loadNFL.mjs
// Adds "coming week" resolution when date is not supplied.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getStore } from "@netlify/blobs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

function getStoreName() {
  return process.env.NFL_TD_BLOBS || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
}
function getNFLStore() { try { return getStore({ name: getStoreName() }); } catch { return null; } }
async function readJsonFromBlobs(key) { const s = getNFLStore(); if(!s) return null; try{ const v = await s.get(key,{type:"json"}); return v===undefined?null:v; }catch{ return null; } }
async function writeJsonToBlobs(key, value){ const s=getNFLStore(); if(!s) return false; try{ await s.set(key, JSON.stringify(value), {contentType:"application/json"}); return true;}catch{ return false;} }

async function readJsonLocal(relPaths) {
  for (const rel of relPaths) {
    try { const txt = await fs.readFile(path.resolve(repoRoot, rel), "utf-8"); return JSON.parse(txt); }
    catch {}
  }
  return null;
}

export async function loadStaticData() {
  const specs = {
    calibration:        { key:"nfl-td:static:calibration.json",            local:["data/nfl-td/calibration.json"]},
    depthCharts:        { key:"nfl-td:static:depth-charts.json",           local:["data/nfl-td/depth-charts.json","public/data/nfl-td/depth-charts.json"]},
    opponentDefense:    { key:"nfl-td:static:opponent-defense.json",       local:["data/nfl-td/opponent-defense.json"]},
    pbpAggregates:      { key:"nfl-td:static:pbp-aggregates-2022-2024.json",local:["data/nfl-td/pbp-aggregates-2022-2024.json"]},
    playerExplosive:    { key:"nfl-td:static:player-explosive.json",       local:["data/nfl-td/player-explosive.json"]},
    preseasonSnaps:     { key:"nfl-td:static:preseason-snaps.json",        local:["data/nfl-td/preseason-snaps.json","data/nfl-td/preseason-snaps.sample.json"]},
    rosterOverrides:    { key:"nfl-td:static:roster-overrides.json",       local:["data/nfl-td/roster-overrides.json"]},
    teamTendencies:     { key:"nfl-td:static:team-tendencies.json",        local:["data/nfl-td/team-tendencies.json"]},
    schedule2025:       { key:"nfl-td:static:nfl-schedule-2025.json",      local:["data/nfl-schedule-2025.json","public/data/nfl/schedule-2025.sample.json"]},
    defenseProfiles:    { key:"nfl-td:static:defense_profiles_small.json", local:["public/data/nfl/defense_profiles_small.json"]},
    playerMetrics:      { key:"nfl-td:static:player_metrics_small.json",   local:["public/data/nfl/player_metrics_small.json"]},
    qbTendencies:       { key:"nfl-td:static:qb_tendencies_small.json",    local:["public/data/nfl/qb_tendencies_small.json"]},
    roles:              { key:"nfl-td:static:roles.json",                  local:["public/data/nfl/roles.json"]},
    scheduleWeek1:      { key:"nfl-td:static:schedule-week1-2025.json",    local:["data/nfl-td/schedule-week1-2025.json","public/data/nfl-td/schedule-week1-2025.json"]},
  };
  const out = {};
  for (const [name, spec] of Object.entries(specs)) {
    const blob = await readJsonFromBlobs(spec.key);
    if (blob) { out[name] = blob; continue; }
    const local = await readJsonLocal(spec.local);
    if (local) { out[name] = local; await writeJsonToBlobs(spec.key, local); continue; }
    out[name] = null;
  }
  return out;
}

// Helper to resolve "coming NFL week" based on ET today
function resolveComingWeek(allGames) {
  if (!Array.isArray(allGames) || !allGames.length) return { week: 1, games: [] };
  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const future = allGames.filter(g => new Date(g.date || g.utc || g.start || today) >= today);
  const pick = future.length ? future[0] : allGames[allGames.length - 1];
  const wk = Number(pick.week || pick.wk || 1);
  const weekGames = allGames.filter(g => Number(g.week || g.wk || 0) === wk);
  return { week: wk, games: weekGames };
}

export async function loadSchedule({ date, mode = "week" } = {}) {
  const key = `nfl-td:schedule:${date || "auto"}:${mode}`;
  const cached = await readJsonFromBlobs(key);
  if (cached && Array.isArray(cached.games)) return cached;

  const s = await loadStaticData();
  const raw = Array.isArray(s.schedule2025) ? s.schedule2025 : (Array.isArray(s.scheduleWeek1) ? s.scheduleWeek1 : []);

  // If no date provided, always choose the coming NFL week
  const resolved = resolveComingWeek(raw);
  const season = 2025;
  const payload = { season, week: resolved.week, date: date || null, mode, games: resolved.games };
  await writeJsonToBlobs(key, payload);
  return payload;
}

export async function loadRosters({ season = 2025, week = 1 } = {}) {
  const key = `nfl-td:rosters:${season}:${week}`;
  const cached = await readJsonFromBlobs(key);
  if (cached) return cached;

  const s = await loadStaticData();
  const depth = s.depthCharts || {};
  const overrides = s.rosterOverrides || {};
  const rosters = JSON.parse(JSON.stringify(depth));
  for (const [team, patch] of Object.entries(overrides)) {
    rosters[team] = Object.assign({}, rosters[team] || {}, patch);
  }
  const payload = { season, week, source: "static", rosters };
  await writeJsonToBlobs(key, payload);
  return payload;
}

export async function loadOddsSnapshot({ date, bookmaker }) {
  const key = `nfl-td:odds:${date}:${String(bookmaker || "").toLowerCase()}`;
  const data = await readJsonFromBlobs(key);
  return (data && Array.isArray(data.data)) ? data.data : null;
}

export default { loadStaticData, loadSchedule, loadRosters, loadOddsSnapshot };

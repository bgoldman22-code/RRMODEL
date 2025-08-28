// netlify/functions/lib/loadNFL.mjs
// ESM-only helpers for the NFL Anytime TD model.
//
// Provides:
//  - loadStaticData(): read static JSONs from Blobs with local fallbacks (and hydrate Blobs opportunistically)
//  - loadSchedule({ date, mode }): derive schedule object (season, week, games) from static sources; cache to Blobs
//  - loadRosters({ season, week }): build roster/depth charts from static depth-charts + overrides; cache to Blobs
//  - loadOddsSnapshot({ date, bookmaker }): read normalized odds snapshot from Blobs
//
// IMPORTANT: Avoids calling other Netlify HTTP functions internally to minimize latency/cold starts.

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

function getNFLStore() {
  try {
    return getStore({ name: getStoreName() });
  } catch {
    return null;
  }
}

async function readJsonFromBlobs(key) {
  const store = getNFLStore();
  if (!store) return null;
  try {
    const obj = await store.get(key, { type: "json" });
    return obj === undefined ? null : obj;
  } catch {
    return null;
  }
}

async function writeJsonToBlobs(key, value) {
  const store = getNFLStore();
  if (!store) return false;
  try {
    await store.set(key, JSON.stringify(value), { contentType: "application/json" });
    return true;
  } catch {
    return false;
  }
}

async function readJsonLocal(relCandidates) {
  for (const rel of relCandidates) {
    const full = path.resolve(repoRoot, rel);
    try {
      const txt = await fs.readFile(full, "utf-8");
      return JSON.parse(txt);
    } catch {}
  }
  return null;
}

export async function loadStaticData() {
  const sources = {
    calibration:        { key: "nfl-td:static:calibration.json",            local: ["data/nfl-td/calibration.json"] },
    depthCharts:        { key: "nfl-td:static:depth-charts.json",           local: ["data/nfl-td/depth-charts.json","public/data/nfl-td/depth-charts.json"] },
    opponentDefense:    { key: "nfl-td:static:opponent-defense.json",       local: ["data/nfl-td/opponent-defense.json"] },
    pbpAggregates:      { key: "nfl-td:static:pbp-aggregates-2022-2024.json",local: ["data/nfl-td/pbp-aggregates-2022-2024.json"] },
    playerExplosive:    { key: "nfl-td:static:player-explosive.json",       local: ["data/nfl-td/player-explosive.json"] },
    preseasonSnaps:     { key: "nfl-td:static:preseason-snaps.json",        local: ["data/nfl-td/preseason-snaps.json","data/nfl-td/preseason-snaps.sample.json"] },
    rosterOverrides:    { key: "nfl-td:static:roster-overrides.json",       local: ["data/nfl-td/roster-overrides.json"] },
    teamTendencies:     { key: "nfl-td:static:team-tendencies.json",        local: ["data/nfl-td/team-tendencies.json"] },
    schedule2025:       { key: "nfl-td:static:nfl-schedule-2025.json",      local: ["data/nfl-schedule-2025.json","public/data/nfl/schedule-2025.sample.json"] },
    defenseProfiles:    { key: "nfl-td:static:defense_profiles_small.json", local: ["public/data/nfl/defense_profiles_small.json"] },
    playerMetrics:      { key: "nfl-td:static:player_metrics_small.json",   local: ["public/data/nfl/player_metrics_small.json"] },
    qbTendencies:       { key: "nfl-td:static:qb_tendencies_small.json",    local: ["public/data/nfl/qb_tendencies_small.json"] },
    roles:              { key: "nfl-td:static:roles.json",                  local: ["public/data/nfl/roles.json"] },
    scheduleWeek1:      { key: "nfl-td:static:schedule-week1-2025.json",    local: ["data/nfl-td/schedule-week1-2025.json","public/data/nfl-td/schedule-week1-2025.json"] }
  };

  const out = {};
  for (const [name, spec] of Object.entries(sources)) {
    const blob = await readJsonFromBlobs(spec.key);
    if (blob) { out[name] = blob; continue; }
    const local = await readJsonLocal(spec.local);
    if (local) {
      out[name] = local;
      await writeJsonToBlobs(spec.key, local);
      continue;
    }
    out[name] = null;
  }
  return out;
}

// Derive schedule object and cache
export async function loadSchedule({ date, mode = "week" } = {}) {
  const key = `nfl-td:schedule:${date || "unknown"}:${mode}`;
  const cached = await readJsonFromBlobs(key);
  if (cached && Array.isArray(cached.games)) return cached;

  const staticData = await loadStaticData();
  const schedule = staticData.schedule2025 || staticData.scheduleWeek1;
  let games = [];
  let week = 1;
  let season = 2025;

  if (Array.isArray(schedule)) {
    games = schedule;
    week = Number(games[0]?.week || games[0]?.wk || 1);
  } else if (schedule && typeof schedule === "object") {
    if (Array.isArray(schedule.games)) {
      games = schedule.games;
      week = Number(games[0]?.week || games[0]?.wk || 1);
    } else {
      const wkKey = Object.keys(schedule).find(k => /^week/i.test(k)) || null;
      if (wkKey) {
        week = Number(String(wkKey).replace(/\D+/g, "")) || 1;
        games = schedule[wkKey] || [];
      }
    }
  }

  const payload = { season, week, date: date || null, mode, games };
  await writeJsonToBlobs(key, payload);
  return payload;
}

// Build rosters from depth charts + overrides and cache
export async function loadRosters({ season = 2025, week = 1 } = {}) {
  const key = `nfl-td:rosters:${season}:${week}`;
  const cached = await readJsonFromBlobs(key);
  if (cached) return cached;

  const staticData = await loadStaticData();
  const depth = staticData.depthCharts || {};
  const overrides = staticData.rosterOverrides || {};

  const rosters = JSON.parse(JSON.stringify(depth));
  for (const [team, patch] of Object.entries(overrides)) {
    rosters[team] = Object.assign({}, rosters[team] || {}, patch);
  }

  const payload = { season, week, source: "static", rosters };
  await writeJsonToBlobs(key, payload);
  return payload;
}

// Read pre-cached odds snapshot
export async function loadOddsSnapshot({ date, bookmaker }) {
  const key = `nfl-td:odds:${date}:${String(bookmaker || "").toLowerCase()}`;
  const data = await readJsonFromBlobs(key);
  return (data && Array.isArray(data.data)) ? data.data : null;
}

export default { loadStaticData, loadSchedule, loadRosters, loadOddsSnapshot };

'use strict';
/**
 * netlify/functions/nfl-schedule-get/index.cjs
 *
 * HYBRID VERSION: Static JSON for regular season (weeks 1-18), fallback logic for playoffs
 * 
 * Response shape:
 * {
 *   ok: true,
 *   season: 2025,
 *   week: 2,
 *   weekCounts: { "1":16, ... },   // if your source provides it
 *   matchups: [
 *     { id, homeTeam, awayTeam, kickoff }
 *   ],
 *   source: "static|preferred|odds",
 *   warning?: "..."
 * }
 */

const { getStore } = require('@netlify/blobs');
const zlib = require('zlib');

const DEFAULT_BASE = process.env.BASE_URL || 'https://bgroundrobin.com';
const DEFAULT_ODDS_URL = process.env.ODDS_URL || `${DEFAULT_BASE}/.netlify/functions/nfl-odds-bridge`;
const SCHEDULE_URL = process.env.SCHEDULE_URL; // preferred source (kept for playoffs)
const DEFAULT_TTL = parseInt(process.env.SCHEDULE_TTL_SECONDS || '300', 10);

/** Blobs store */
function getScheduleStore() {
  try {
    const name =
      process.env.BLOBS_STORE_SCHEDULE ||
      process.env.BLOBS_STORE ||
      'nfl-td';
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore(name, { siteID, token });
    return getStore(name);
  } catch (err) {
    // Fallback: no-op store when Blobs not configured
    return null;
  }
}

/** Small helpers */
const toId = (home, away, kickoff) =>
  `${(away || '').replace(/\s+/g, '')}@${(home || '').replace(/\s+/g, '')}-${(kickoff || '').slice(0, 10)}`;

function inferSeasonFromISO(iso) {
  if (!iso) return undefined;
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m <= 2 ? y - 1 : y;
}

function onlyTruthy(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

/** NEW: Fetch from static JSON (for regular season weeks 1-18) */
async function fetchStaticSchedule(week, season) {
  console.log(`Fetching static schedule for Week ${week}, Season ${season}`);
  
  const staticUrl = `${DEFAULT_BASE}/data/nfl-schedule-2025.json`;
  const res = await fetch(staticUrl);
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from static schedule at ${staticUrl}`);
  }
  
  const schedule = await res.json();
  
  // Handle both structured format {weeks: {...}} and flat array format
  let allGames = [];
  if (schedule.weeks && schedule.weeks[week.toString()]) {
    // Structured format: {weeks: {"4": {matchups: [...]}}}
    const weekData = schedule.weeks[week.toString()];
    allGames = weekData.matchups || [];
  } else if (Array.isArray(schedule)) {
    // Flat array format: [{week: 4, ...}, {week: 5, ...}]
    allGames = schedule.filter(game => game.week === week);
  } else {
    throw new Error(`Invalid schedule format - expected weeks object or flat array`);
  }
  
  if (!allGames || allGames.length === 0) {
    throw new Error(`No matchups found for Week ${week} in static schedule`);
  }
  
  console.log(`✓ Static schedule loaded: ${allGames.length} games for Week ${week}`);
  
  // Convert to normalized format
  const matchups = allGames.map(game => ({
    id: game.game_id || game.id || toId(
      game.home_team || game.homeTeam, 
      game.away_team || game.awayTeam, 
      game.gameday || game.kickoff
    ),
    homeTeam: game.home_team || game.homeTeam,
    awayTeam: game.away_team || game.awayTeam,
    kickoff: game.gameday || game.kickoff
  }));
  
  return {
    matchups,
    meta: {
      season: season || (Array.isArray(schedule) ? 2025 : parseInt(schedule.season || 2025)),
      week: week,
      source: 'static'
    }
  };
}

/** Parse a JSON schedule payload into normalized matchups */
function normalizeFromJson(payload) {
  if (!payload) return { matchups: [], meta: {} };
  if (Array.isArray(payload.matchups)) {
    return {
      matchups: payload.matchups
        .map(m => ({
          id: m.id || toId(m.homeTeam, m.awayTeam, m.kickoff),
          homeTeam: m.homeTeam || m.home || m.home_team,
          awayTeam: m.awayTeam || m.away || m.away_team,
          kickoff: m.kickoff || m.start || m.start_time || m.commence_time
        }))
        .filter(m => m.homeTeam && m.awayTeam && m.kickoff),
      meta: {
        season: payload.season,
        week: payload.week,
        weekCounts: payload.weekCounts
      }
    };
  }
  if (Array.isArray(payload)) {
    const matchups = payload
      .map(ev => ({
        id: ev.id || toId(ev.homeTeam || ev.home || ev.home_team, ev.awayTeam || ev.away || ev.away_team, ev.kickoff || ev.start || ev.start_time),
        homeTeam: ev.homeTeam || ev.home || ev.home_team,
        awayTeam: ev.awayTeam || ev.away || ev.away_team,
        kickoff: ev.kickoff || ev.start || ev.start_time || ev.commence_time
      }))
      .filter(m => m.homeTeam && m.awayTeam && m.kickoff);
    return { matchups, meta: {} };
  }
  return { matchups: [], meta: {} };
}

/** Minimal CSV parser (no deps). Accepts header row. */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const hdr = lines[0].split(',').map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const obj = {};
    hdr.forEach((h, j) => (obj[h] = (cols[j] ?? '').trim()));
    rows.push(obj);
  }
  return rows;
}

/** Normalize from CSV rows */
function normalizeFromCsv(rows) {
  const matchups = [];
  for (const r of rows) {
    const home = r.homeTeam || r.home || r.home_team || r.team_home || r.home_full || r.home_name;
    const away = r.awayTeam || r.away || r.away_team || r.team_away || r.away_full || r.away_name;
    const kickoff =
      r.kickoff ||
      r.start ||
      r.start_time ||
      r.game_time ||
      r.datetime ||
      r.commence_time;
    if (home && away && kickoff) {
      matchups.push({
        id: r.id || toId(home, away, kickoff),
        homeTeam: home,
        awayTeam: away,
        kickoff
      });
    }
  }
  return { matchups, meta: {} };
}

/** Preferred source fetcher (JSON or CSV/CSV.GZ) - kept for playoffs */
async function fetchPreferredSchedule(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from preferred schedule`);
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('application/json') || url.endsWith('.json')) {
    const payload = await res.json();
    return normalizeFromJson(payload);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  let csvText;
  if (url.endsWith('.gz') || ctype.includes('application/gzip') || ctype.includes('x-gzip')) {
    csvText = zlib.gunzipSync(buf).toString('utf8');
  } else {
    csvText = buf.toString('utf8');
  }
  const rows = parseCsv(csvText);
  return normalizeFromCsv(rows);
}

/** Fallback from odds bridge */
async function fetchFromOdds(oddsUrl) {
  const res = await fetch(oddsUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from odds bridge`);
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const matchups = rows
    .map(r => ({
      id: r.id || toId(r.home, r.away, r.commence_time),
      homeTeam: r.home,
      awayTeam: r.away,
      kickoff: r.commence_time
    }))
    .filter(m => m.homeTeam && m.awayTeam && m.kickoff);
  return { matchups, meta: {} };
}

function filterByWeek(matchups, week) {
  if (!week) return matchups;
  return matchups;
}

async function readCache(store, key) {
  try {
    const cached = await store.get(key, { type: 'json' });
    return cached || null;
  } catch {
    return null;
  }
}

async function writeCache(store, key, value) {
  try {
    await store.setJSON(key, value);
  } catch {}
}

exports.handler = async (event) => {
  try {
    const store = getScheduleStore();
    const params = new URLSearchParams(event.queryStringParameters || {});
    const wantWeek = params.get('week') ? parseInt(params.get('week'), 10) : undefined;
    const wantSeason = params.get('season') ? parseInt(params.get('season'), 10) : undefined;
    
    console.log(`Schedule request: Week ${wantWeek}, Season ${wantSeason}`);
    
    // MODIFIED: Use different cache keys and TTL for regular season vs playoffs
    const isRegularSeason = wantWeek && wantWeek <= 18;
    const cacheKey = isRegularSeason 
      ? `schedule/regular_w${wantWeek}_s${wantSeason}.json`
      : `schedule/playoffs_latest.json`;
    
    const now = Date.now();
    const cached = await readCache(store, cacheKey);
    
    // Use longer cache for static data (1 hour), shorter for dynamic (5 min)
    const cacheTimeout = isRegularSeason ? 3600 * 1000 : DEFAULT_TTL * 1000;
    
    if (cached && cached.fetched_at && now - cached.fetched_at < cacheTimeout) {
      console.log(`Cache hit for ${cacheKey}`);
      const filtered = filterByWeek(cached.matchups || [], wantWeek);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(
          onlyTruthy({
            ok: true,
            season: wantSeason || cached.season,
            week: wantWeek || cached.week,
            weekCounts: cached.weekCounts,
            matchups: filtered,
            source: cached.source,
            warning: cached.warning
          })
        )
      };
    }

    let matchups = [];
    let meta = {};
    let source = 'preferred';
    let warning;

    // HYBRID LOGIC: Static for regular season, existing logic for playoffs
    if (wantWeek && wantWeek <= 18) {
      // REGULAR SEASON: Try static JSON first
      console.log(`Regular season Week ${wantWeek} - attempting static JSON`);
      try {
        const staticData = await fetchStaticSchedule(wantWeek, wantSeason);
        matchups = staticData.matchups || [];
        meta = staticData.meta || {};
        source = 'static';
        console.log(`✓ Static schedule success: ${matchups.length} games`);
      } catch (e) {
        console.warn(`Static schedule failed for Week ${wantWeek}:`, e.message);
        warning = `Static schedule failed: ${e.message}`;
        // Will fall through to existing fallback logic below
      }
    } else {
      // PLAYOFFS: Skip static, go straight to existing preferred logic
      console.log(`Playoff week ${wantWeek || 'unknown'} - using existing preferred + odds logic`);
    }

    // If static failed OR we're in playoffs, use existing preferred + odds fallback logic
    if (!matchups.length) {
      console.log('Falling back to existing preferred + odds logic');
      
      if (SCHEDULE_URL) {
        try {
          console.log(`Trying preferred schedule: ${SCHEDULE_URL}`);
          const pref = await fetchPreferredSchedule(SCHEDULE_URL);
          matchups = pref.matchups || [];
          meta = pref.meta || {};
          source = warning ? 'preferred_fallback' : 'preferred';
          console.log(`✓ Preferred schedule: ${matchups.length} games`);
        } catch (e) {
          console.warn(`Preferred schedule failed:`, e.message);
          warning = warning ? `${warning} | Preferred failed: ${e.message}` : `Preferred schedule failed: ${e.message}`;
        }
      } else {
        warning = warning ? `${warning} | No SCHEDULE_URL configured` : 'No SCHEDULE_URL configured; using odds fallback.';
      }

      if (!matchups.length) {
        console.log('Final fallback to odds bridge');
        source = 'odds';
        try {
          const fb = await fetchFromOdds(DEFAULT_ODDS_URL);
          matchups = fb.matchups || [];
          console.log(`✓ Odds fallback: ${matchups.length} games`);
        } catch (e) {
          console.error(`Odds fallback failed:`, e.message);
          warning = warning ? `${warning} | Odds fallback failed: ${e.message}` : `Odds fallback failed: ${e.message}`;
        }
      }
    }

    let season = meta.season || wantSeason;
    if (!season && matchups.length) {
      season = inferSeasonFromISO(matchups[0].kickoff);
    }
    const week = meta.week || wantWeek;

    const payload = onlyTruthy({
      ok: true,
      season,
      week,
      weekCounts: meta.weekCounts,
      matchups,
      source,
      warning
    });

    // Cache the result
    await writeCache(store, cacheKey, {
      ...payload,
      fetched_at: now
    });

    console.log(`✓ Response ready: ${matchups.length} games, source: ${source}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(payload)
    };
    
  } catch (err) {
    console.error('Schedule handler error:', err);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        ok: false,
        error: 'Failed to build schedule',
        details: err.message
      })
    };
  }
};

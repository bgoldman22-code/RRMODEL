// netlify/functions/nfl-bootstrap.mjs
import { getStore } from '@netlify/blobs';

/**
 * Bootstrap:
 *  - Determines the active NFL week with a weekly roll-forward:
 *      Week 1 is whatever is stored under weeks/{season}/1/schedule.json.
 *      Week 2 starts the first Tuesday at 01:00 America/New_York AFTER the last Week 1 game.
 *      Subsequent weeks roll every 7 days at Tuesday 01:00 ET.
 *  - Ensures schedule for chosen week exists (fetches from ESPN if needed).
 *  - Ensures per-team roster blobs exist (one blob per team for that week).
 *
 * Query params:
 *   season? (default: 2025)
 *   mode?   (default: "auto")  // "auto" computes week using roll-forward
 *   week?   (optional)         // if provided, overrides computed week
 *   refresh?=1                 // force re-fetch from ESPN
 *   debug?=1                   // include fetch logs
 */
export const handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const season = Number(qp.season || 2025);
  const mode = (qp.mode || 'auto').toLowerCase();
  const refresh = qp.refresh == '1';
  const debug = qp.debug == '1';

  const store = getStore({ name: 'nfl' });
  const logs = { fetchLog: [], depthLog: [] };

  // 1) Read week 1 schedule (must exist or be fetchable) to anchor the roll-forward.
  const w1Key = `weeks/${season}/1/schedule.json`;
  let week1 = await store.get(w1Key, { type: 'json' });
  if (!week1 || refresh) {
    // fallback fixed window for 2025 Week 1
    const w1Range = season === 2025
      ? { start: '20250904', end: '20250910' }
      : null;

    if (!w1Range) {
      return json({ ok: false, error: 'No fallback range for this season and week1 schedule missing' }, 500);
    }
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${w1Range.start}-${w1Range.end}`;
    const r = await safeFetch(url);
    logs.fetchLog.push({ url, ok: r.ok, status: r.status });
    if (!r.ok) {
      return json({ ok: false, error: 'Could not fetch Week 1 schedule from ESPN' }, 502);
    }
    week1 = pickScheduleFromScoreboard(await r.json(), season, 1);
    await store.set(w1Key, JSON.stringify(week1), { contentType: 'application/json' });
  }

  // 2) Determine "active week" via roll-forward or override via ?week
  let week = Number(qp.week || 0);
  if (!week) {
    if (mode === 'auto') {
      week = computeWeekRollForward(week1);
    } else {
      week = 1;
    }
  }
  if (week < 1) week = 1;
  if (week > 20) week = 20; // guard

  // 3) Ensure schedule exists for that week; if not, try ESPN by date window derived from anchor
  const wkKey = `weeks/${season}/${week}/schedule.json`;
  let schedule = await store.get(wkKey, { type: 'json' });
  if ((!schedule || refresh) && week >= 2) {
    // derive window from week1 anchor Tuesdays
    const { startET, endET } = computeDateWindowForWeek(week1, week);
    const startStr = toYMD(startET);
    const endStr = toYMD(endET);
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${startStr}-${endStr}`;
    const r = await safeFetch(url);
    logs.fetchLog.push({ url, ok: r.ok, status: r.status });
    if (r.ok) {
      const json = await r.json();
      schedule = pickScheduleFromScoreboard(json, season, week);
      if (schedule.games.length) {
        await store.set(wkKey, JSON.stringify(schedule), { contentType: 'application/json' });
      }
    }
  }

  // 4) Fallback: for week 1 we already have it
  if (week === 1) {
    schedule = week1;
  }

  if (!schedule || !schedule.games || !schedule.games.length) {
    return json({
      ok: false,
      error: 'schedule unavailable',
      used: { mode, season, week },
      ...(debug ? logs : {}),
    }, 503);
  }

  // 5) Ensure per-team depth blobs exist (store ESPN roster as depth/TEAM.json)
  const teamIds = new Set();
  for (const g of schedule.games) {
    teamIds.add(g.home.id);
    teamIds.add(g.away.id);
  }
  await Promise.all(Array.from(teamIds).map(async (id) => {
    const key = `weeks/${season}/${week}/depth/${id}.json`;
    const exists = await store.get(key);
    if (!exists || refresh) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=${season}`;
      const r = await safeFetch(url);
      logs.depthLog.push({ url, ok: r.ok, status: r.status });
      if (r.ok) {
        const rosterJson = await r.json();
        await store.set(key, JSON.stringify(rosterJson), { contentType: 'application/json' });
      } else {
        logs.depthLog.push({ url, ok: false, status: r.status });
      }
    }
  }));

  return json({
    ok: true,
    season,
    week,
    games: schedule.games.length,
    schedule,
    used: { mode },
    ...(debug ? logs : {}),
  });
};

// -------- helpers --------

const json = (body, statusCode = 200) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

async function safeFetch(url) {
  try {
    return await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 rrmodel-nfl' } });
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

function pickScheduleFromScoreboard(scoreboard, season, week) {
  const events = scoreboard?.events || [];
  const games = [];
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    const homeT = c?.competitors?.find(t => t.homeAway === 'home')?.team;
    const awayT = c?.competitors?.find(t => t.homeAway === 'away')?.team;
    if (!homeT || !awayT) continue;
    games.push({
      id: String(ev.id || c.id || ev.uid || ''),
      date: ev.date,
      home: { id: String(homeT.id), abbrev: homeT.abbreviation, displayName: homeT.displayName },
      away: { id: String(awayT.id), abbrev: awayT.abbreviation, displayName: awayT.displayName },
    });
  }
  return { season, week, games };
}

// Compute current ET now
function nowET() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

// Tuesday 01:00 ET after the last Week 1 game
function tuesday1amAfterLastGameET(week1) {
  let latestUTC = 0;
  for (const g of week1?.games || []) {
    const t = Date.parse(g.date);
    if (t > latestUTC) latestUTC = t;
  }
  // convert to ET
  const lastET = new Date(new Date(latestUTC).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // find next Tuesday
  const dt = new Date(lastET);
  // move forward day-by-day until Tuesday (2)
  while (dt.getDay() !== 2) dt.setDate(dt.getDate() + 1);
  dt.setHours(1, 0, 0, 0); // 01:00 ET
  return dt;
}

// Determine active week with the roll-forward rule
function computeWeekRollForward(week1) {
  const anchorW2 = tuesday1amAfterLastGameET(week1); // start of week 2
  const now = nowET();
  if (now < anchorW2) return 1;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = now - anchorW2;
  const weeksSince = Math.floor(diff / msPerWeek);
  return Math.min(20, 2 + weeksSince);
}

// For week >= 2, compute date window [Tue 01:00, next Tue 00:59], in ET
function computeDateWindowForWeek(week1, week) {
  const anchorW2 = tuesday1amAfterLastGameET(week1);
  const start = new Date(anchorW2.getTime() + (week - 2) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000); // next Monday
  // convert ET to true Date objects in ET and then format YYYYMMDD on ET calendar
  return { startET: start, endET: end };
}

function toYMD(d) {
  // d is an ET Date object; format YYYYMMDD using its ET components
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
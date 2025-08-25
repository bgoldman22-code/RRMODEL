// netlify/functions/nfl-bootstrap.js
// Seeds schedule (week 1 fallback) + writes rosters per team to Blobs.
// No node-fetch import; uses global fetch.

import { nflStore, diagBlobsEnv } from './_lib/blobs.js';

const WEEK1_START = '20250904';
const WEEK1_END = '20250910';

export const handler = async (event) => {
  const debug = (event.queryStringParameters && (event.queryStringParameters.debug === '1'));

  try {
    const store = await nflStore();

    // Figure schedule: ESPN "dates" scoreboard works pre-regular-season.
    const urlWeb = `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${WEEK1_START}-${WEEK1_END}`;
    const urlSite = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${WEEK1_START}-${WEEK1_END}`;

    let schedule = null;
    const fetchLog = [];
    for (const url of [urlWeb, urlSite]) {
      try {
        const r = await fetch(url);
        fetchLog.push({ url, ok: r.ok, status: r.status });
        if (r.ok) {
          const j = await r.json();
          // translate ESPN response into schedule format used by app
          const games = (j?.events || []).map(ev => ({
            id: ev?.id,
            date: ev?.date,
            home: {
              id: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'home')?.team?.id,
              abbrev: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'home')?.team?.abbreviation,
              displayName: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'home')?.team?.displayName,
            },
            away: {
              id: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'away')?.team?.id,
              abbrev: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'away')?.team?.abbreviation,
              displayName: ev?.competitions?.[0]?.competitors?.find(c => c?.homeAway === 'away')?.team?.displayName,
            }
          }));
          schedule = { season: 2025, week: 1, games };
          break;
        }
      } catch (e) {
        fetchLog.push({ url, ok: false, status: 0, error: String(e) });
      }
    }

    if (!schedule) {
      return json(500, { ok: false, error: 'Could not fetch schedule from ESPN', fetchLog, blobs: diagBlobsEnv() });
    }

    // Write schedule to Blobs
    await store.set(`weeks/2025/1/schedule.json`, JSON.stringify(schedule), { contentType: 'application/json' });

    // For preseason, ESPN depthchart often 404. Use roster endpoint instead.
    const teamIds = [...new Set(schedule.games.flatMap(g => [g.home.id, g.away.id]))].filter(Boolean);

    const depthLog = [];
    const rosterByTeam = {};
    for (const id of teamIds) {
      const rosterURL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=2025`;
      try {
        const r = await fetch(rosterURL);
        depthLog.push({ url: rosterURL, ok: r.ok, status: r.status });
        if (r.ok) {
          const j = await r.json();
          rosterByTeam[id] = j;
          await store.set(`weeks/2025/1/depth/${id}.json`, JSON.stringify(j), { contentType: 'application/json' });
        } else {
          // still write an empty file to mark attempted
          await store.set(`weeks/2025/1/depth/${id}.json`, JSON.stringify({ ok:false }), { contentType: 'application/json' });
        }
      } catch (e) {
        depthLog.push({ url: rosterURL, ok: false, status: 0, error: String(e) });
      }
    }

    const body = {
      ok: true,
      season: 2025, week: 1, games: schedule.games.length,
      schedule,
      used: { mode: 'auto→preseason-week1' },
      fetchLog, depthLog,
      blobs: debug ? diagBlobsEnv() : undefined,
    };

    return json(200, body);

  } catch (err) {
    return json(500, { ok: false, error: String(err), blobs: diagBlobsEnv() });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(obj),
  };
}
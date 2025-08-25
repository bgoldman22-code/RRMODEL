// ESM version
import fetch from 'node-fetch';
import { getJSON, setJSON } from './_lib/blobs.js';

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://dummy.local${event.path}${event.queryString || ''}`);
    const refresh = url.searchParams.get('refresh') === '1';
    const mode = url.searchParams.get('mode') || 'auto';
    const debug = url.searchParams.get('debug') === '1';

    const season = 2025;
    const week = 1;

    // cache keys under nfl-td store
    const schedKey = `weeks/${season}/${week}/schedule.json`;

    if (!refresh) {
      const cached = await getJSON(schedKey);
      if (cached) {
        return json({ ok: true, ...cached, used: { mode: 'cache' } });
      }
    }

    // fallback: ESPN weekly date window for wk1
    const dates = '20250904-20250910';
    const espn = [
      `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${dates}`,
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}`,
    ];

    let schedule = null;
    const fetchLog = [];
    for (const u of espn) {
      const r = await safeFetch(u);
      fetchLog.push({ url: u, ok: r.ok, status: r.status });
      if (r.ok) {
        const j = await r.json();
        // shape into what the UI expects:
        const games = (j.events || []).map(ev => {
          const comp = (ev.competitions && ev.competitions[0]) || {};
          const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
          const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
          return {
            id: ev.id,
            date: ev.date,
            home: {
              id: home.team?.id,
              abbrev: home.team?.abbreviation,
              displayName: home.team?.displayName
            },
            away: {
              id: away.team?.id,
              abbrev: away.team?.abbreviation,
              displayName: away.team?.displayName
            }
          };
        });
        schedule = { season, week, games };
        break;
      }
    }

    if (!schedule) {
      return json({ ok: false, error: 'Could not fetch schedule from ESPN', fetchLog }, 500);
    }

    // persist in nfl-td store
    await setJSON(schedKey, { season, week, games: schedule.games });

    // also persist per-team rosters (best-effort) to nfl-td store
    const teamIds = Array.from(
      new Set(
        schedule.games.flatMap(g => [g.home?.id, g.away?.id]).filter(Boolean)
      )
    );

    const depthLog = [];
    for (const id of teamIds) {
      // depthchart endpoint 404s often; fallback to /roster
      const dc = await safeFetch(
        `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart?season=${season}`
      );
      depthLog.push({ url: dc.url, ok: dc.ok, status: dc.status });

      if (!dc.ok) {
        const roster = await safeFetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=${season}`
        );
        depthLog.push({ url: roster.url, ok: roster.ok, status: roster.status });
        if (roster.ok) {
          const rj = await roster.json();
          await setJSON(`weeks/${season}/${week}/depth/${id}.json`, rj);
        }
      } else {
        const dj = await dc.json();
        await setJSON(`weeks/${season}/${week}/depth/${id}.json`, dj);
      }
    }

    const body = {
      ok: true,
      season,
      week,
      games: schedule.games?.length || 0,
      schedule,
      used: { mode: `${mode}→preseason-week1` }
    };

    if (debug) { body.fetchLog = fetchLog; body.depthLog = depthLog; }
    return json(body);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
};

async function safeFetch(url) {
  try {
    const res = await fetch(url, { timeout: 15000 });
    res.url = url; // remember for logs
    return res;
  } catch {
    return { ok: false, status: 0, url };
  }
}

function json(obj, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

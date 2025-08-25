
// netlify/functions/nfl-bootstrap.mjs
import { getNFLStore, blobsJson } from './_blobs.mjs';

/**
 * Seeds/refreshes week schedule + caches team rosters (ESPN public site API).
 * Query:
 *   refresh=1             force re-fetch
 *   mode=auto|preseason-week1 (default auto)
 *   debug=1               include logs
 */
export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://example.com${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const params = url.searchParams;
    const debug = params.get('debug') === '1';
    const force = params.get('refresh') === '1';

    const season = 2025;
    const week = 1;
    const mode = params.get('mode') || 'auto';

    const store = getNFLStore();
    const scheduleKey = `weeks/${season}/${week}/schedule.json`;

    let schedule = (force ? null : await blobsJson.get(store, scheduleKey));
    const fetchLog = [];
    const depthLog = [];

    if (!schedule) {
      // Fallback week-1 window fetch pattern
      const dates = '20250904-20250910';
      const url1 = `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${dates}`;
      const url2 = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}`;

      let data = null;

      const tryFetch = async (u) => {
        const res = await fetch(u);
        fetchLog.push({ url: u, ok: res.ok, status: res.status });
        if (res.ok) {
          return await res.json();
        }
        return null;
      };

      data = await tryFetch(url1);
      if (!data) data = await tryFetch(url2);

      if (!data || !data.events) {
        return json(500, { ok: false, error: 'Could not fetch ESPN schedule', fetchLog });
      }

      const games = (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team;
        const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team;
        return {
          id: String(ev.id || comp?.id || ''),
          date: ev.date,
          home: home ? { id: String(home.id), abbrev: home.abbreviation, displayName: home.displayName } : null,
          away: away ? { id: String(away.id), abbrev: away.abbreviation, displayName: away.displayName } : null
        };
      }).filter(g => g.home && g.away);

      schedule = { season, week, games };
      await blobsJson.set(store, scheduleKey, schedule);
    }

    // Optionally materialize per-team rosters (names) for the week
    // This ensures downstream functions can resolve names without another bootstrap.
    for (const g of schedule.games) {
      for (const side of ['home', 'away']) {
        const t = g[side];
        const rosterKey = `weeks/${season}/${week}/depth/${t.id}.json`;
        const exists = await store.getMetadata(rosterKey).catch(() => null);
        if (!exists) {
          const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${t.id}/roster?season=${season}`;
          const res = await fetch(rosterUrl);
          depthLog.push({ url: rosterUrl, ok: res.ok, status: res.status });
          if (res.ok) {
            const rjson = await res.json();
            await blobsJson.set(store, rosterKey, rjson);
          }
        }
      }
    }

    const body = { ok: true, season, week, games: schedule.games.length, schedule, used: { mode }, fetchLog: debug ? fetchLog : undefined, depthLog: debug ? depthLog : undefined };
    return json(200, body);
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
};

function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(obj)
  };
}

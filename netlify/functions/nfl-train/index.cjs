/**
 * nfl-train (CJS) — builds team_form.json into Netlify Blobs
 */
const zlib = require('zlib');
const { parse } = require('csv-parse/sync');
const { makeStore, saveToBlobs } = require('../_lib/blobs-helper.cjs');

async function dynamicImport(modulePath) {
  return new Function('modulePath', 'return import(modulePath)')(modulePath);
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const years = (qs.years ? qs.years.split(',') : (qs.year ? [qs.year] : []))
      .map(x => parseInt(x, 10))
      .filter(Boolean);
    const season = qs.season ? parseInt(qs.season, 10) : null;
    const week = qs.week ? parseInt(qs.week, 10) : null;
    const force = qs.force || qs.force === '1' ? true : false;

    const { fetchSeasonCSVGz } = await dynamicImport('../_lib/fastr-sources.mjs');

    const yrs = years.length ? years : (season ? [season] : []);
    if (!yrs.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'no_years' }) };
    }

    const seasonResults = [];
    const teamAgg = {};

    for (const y of yrs) {
      const res = await fetchSeasonCSVGz(y);
      if (!res.ok) {
        seasonResults.push({ year: y, ok: false, reason: 'fetch_failed', errors: res.errors });
        continue;
      }
      const csvBuf = zlib.gunzipSync(res.buf);
      const records = parse(csvBuf, { columns: true, skip_empty_lines: true });
      // very light features: PF, PA last N games rolling would be better; here just totals for demo
      for (const r of records) {
        const home = r.home_team || r.home_team_name || r.home_team_abbr || r.home_team_id;
        const away = r.away_team || r.away_team_name || r.away_team_abbr || r.away_team_id;
        const hp = Number(r.home_score) || 0;
        const ap = Number(r.away_score) || 0;
        if (!home || !away) continue;
        teamAgg[home] = teamAgg[home] || { games:0, pf:0, pa:0 };
        teamAgg[away] = teamAgg[away] || { games:0, pf:0, pa:0 };
        teamAgg[home].games++; teamAgg[home].pf+=hp; teamAgg[home].pa+=ap;
        teamAgg[away].games++; teamAgg[away].pf+=ap; teamAgg[away].pa+=hp;
      }
      seasonResults.push({ year: y, ok: true, status: 200, rowsProcessed: records.length });
    }

    const teams = Object.keys(teamAgg).length;
    const features = Object.fromEntries(
      Object.entries(teamAgg).map(([k,v]) => {
        const net = v.pf - v.pa;
        const avgNet = v.games ? net / v.games : 0;
        return [k, { games: v.games, pf: v.pf, pa: v.pa, net, avgNet }];
      })
    );

    // persist
    let persisted = false, wrote = null, persist_error = null;
    try {
      const store = makeStore(); // ensures env fallback to nfl-td
      await saveToBlobs('team_form.json', features);
      persisted = true;
      wrote = 'team_form.json';
    } catch (e) {
      persist_error = e.message || String(e);
    }

    const body = {
      ok: true,
      meta: { years: yrs, persisted, wrote, persist_error },
      summary: { teams },
      seasonResults,
      updated: new Date().toISOString()
    };
    return { statusCode: 200, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(err) }) };
  }
};
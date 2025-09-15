
// netlify/functions/nfl-train/index.cjs
// Trains basic team form features and writes to Blobs as team_form.json
const { fetchSeasonCsv, simpleCsvParse } = require('../_lib/fastr-sources.cjs');
const { saveToBlobs, STORE_ENV } = require('../_lib/blobs-helper.cjs');

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const yearsParam = qs.years || '';
  const force = qs.force || qs.f || '0';

  if (!force || force === '0') {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: "force_required", hint: "Append ?force=1 to run training" })
    };
  }

  let years = [];
  if (yearsParam) {
    years = yearsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
  }
  if (years.length === 0) {
    // default: last 4 seasons including current
    const now = new Date();
    const y = now.getUTCFullYear();
    years = [y-3, y-2, y-1, y];
  }

  const seasonResults = [];
  const teamAgg = {}; // team -> {games, pf, pa}

  for (const yr of years) {
    const res = await fetchSeasonCsv(yr);
    if (!res.ok) {
      seasonResults.push({ year: yr, ok: false, reason: "fetch_failed", errors: res.errors });
      continue;
    }
    const rows = simpleCsvParse(res.text);
    seasonResults.push({ year: yr, ok: true, status: 200, rowsProcessed: rows.length, url: res.url });

    // Try common columns in nflverse games CSV
    // home_team, away_team, home_score, away_score
    for (const r of rows) {
      const home = r.home_team || r.home || r.homeTeam;
      const away = r.away_team || r.away || r.awayTeam;
      const hs = parseInt(r.home_score || r.home_points || r.h_score || r.home_score_total || '0', 10) || 0;
      const as = parseInt(r.away_score || r.away_points || r.a_score || r.away_score_total || '0', 10) || 0;
      if (!home || !away) continue;

      if (!teamAgg[home]) teamAgg[home] = { games: 0, pf: 0, pa: 0 };
      if (!teamAgg[away]) teamAgg[away] = { games: 0, pf: 0, pa: 0 };
      teamAgg[home].games++; teamAgg[home].pf += hs; teamAgg[home].pa += as;
      teamAgg[away].games++; teamAgg[away].pf += as; teamAgg[away].pa += hs;
    }
  }

  // build simple features per team
  const features = Object.entries(teamAgg).map(([team, v]) => {
    const mov = v.pf - v.pa;
    const gp = Math.max(1, v.games);
    return {
      team,
      games: v.games,
      points_for: v.pf,
      points_against: v.pa,
      mov_total: mov,
      mov_per_game: mov / gp
    };
  }).sort((a,b) => (b.mov_per_game - a.mov_per_game));

  // Try to persist to blobs
  const persist = await saveToBlobs('team_form.json', { generatedAt: new Date().toISOString(), store: STORE_ENV, teams: features });

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      meta: { years, persisted: persist, wrote: persist ? 'team_form.json' : null, store: STORE_ENV },
      summary: { teams: features.length },
      updated: new Date().toISOString()
    })
  };
};
